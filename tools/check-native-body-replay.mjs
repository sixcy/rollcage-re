import {mkdir, writeFile, copyFile, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {replayNativeBody, firstByteDivergence} from './lib/native-body-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node tools/check-native-body-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
const config = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
const end = capture.snapshots.at(-1), expectedFrames = config.breakpoints.find(row => row.id === 'physics-finish')?.stopAfterHits;
if (end.breakpointId !== 'physics-finish' || !Number.isInteger(expectedFrames) || expectedFrames < 1 || end.hit !== expectedFrames) throw Error('Capture did not reach its declared bounded native frame count.');
const pending = new Map(), cases = [], skipped = [], fixtures = [];
for (const row of capture.snapshots) {
  const match = /^(forces|derivatives|preparation|directions|suspension|rest|air-spin|orientation)-(before|after)$/.exec(row.breakpointId);
  if (!match) continue;
  const [, stage, phase] = match, body = row.ranges.get('body');
  if (!body) throw Error('Stage is missing its explicit body range.');
  const key = `${row.tid}:${stage}`;
  if (phase === 'before') {
    if (pending.has(key)) throw Error('Overlapping native stage entries.');
    pending.set(key, row); continue;
  }
  const before = pending.get(key);
  if (!before) {
    // Both native loop return sites are also reached by their explicit skipped
    // branches. Keep these observations and require their actual native flags.
    const flag = stage === 'preparation' ? 0x2000 : stage === 'derivatives' ? 0x8000 : 0;
    if (!flag || !(body.bytes.readUInt32LE(0) & flag)) throw Error('Unpaired native stage exit without its recovered skip flag.');
    skipped.push({stage, ordinal: row.ordinal, body: body.address, reason: `Native flags & 0x${flag.toString(16)} bypassed this call.`}); continue;
  }
  pending.delete(key);
  if (before.ranges.get('body').address !== body.address) throw Error('Native stage returned for a different body.');
  const time = before.ranges.get('time-options').bytes;
  let source = before.ranges.get('body').bytes, expected = body.bytes, options = {
    timeOptions: {timeScaleActive: time.readInt32LE(0) !== 0, timeScaleExempt: time.readUInt32LE(4) === Number(body.address), timeScaleQ16: time.readInt32LE(12)}};
  if (stage === 'preparation') {
    const first = before.ranges.get('vehicle0'), last = row.ranges.get('vehicle0');
    if (first.address !== body.address) {skipped.push({stage, ordinal: row.ordinal, body: body.address, reason: 'Extended preparation state is captured only for vehicle0.'}); continue;}
    if (last.address !== first.address) throw Error('Vehicle0 identity changed inside preparation.');
    source = first.bytes; expected = last.bytes;
    options = {records: before.ranges.get('contact-records').bytes,
      gravityQ16: before.ranges.get('gravity').bytes.readInt32LE(0),
      effectFlags: {first: before.ranges.get('effect-first').bytes.readInt32LE(0), second: before.ranges.get('effect-second').bytes.readInt32LE(0)},
      timeOptions: {timeScaleActive: time.readInt32LE(0) !== 0, timeScaleExempt: time.readUInt32LE(4) === Number(body.address), timeScaleQ16: time.readInt32LE(12)}};
  }
  const result = replayNativeBody(stage, source, options), divergence = firstByteDivergence(expected, result.body);
  const recordsDivergence = result.records && firstByteDivergence(row.ranges.get('contact-records').bytes, result.records);
  cases.push({stage, beforeOrdinal: before.ordinal, afterOrdinal: row.ordinal, tid: row.tid, body: body.address, comparedBodyBytes: expected.length,
    comparedContactBytes: result.records?.length ?? 0, matched: !divergence && !recordsDivergence, firstDivergence: divergence ? {range: 'body', ...divergence} : recordsDivergence ? {range: 'contact-records', ...recordsDivergence} : null});
  if (source.length === 384) fixtures.push({stage, beforeOrdinal: before.ordinal, afterOrdinal: row.ordinal, body: body.address,
    beforeSha256: before.ranges.get('body').sha256, afterSha256: body.sha256, beforeHex: source.toString('hex'), afterHex: expected.toString('hex')});
}
if (pending.size) throw Error('Capture ended with an unmatched native stage entry.');
for (const stage of ['forces', 'derivatives', 'preparation']) if (!cases.some(row => row.stage === stage)) throw Error(`No native ${stage} stage was replayed.`);
const report = {schemaVersion: 1, targetSha256: REDUX_SHA256, authority: 'original-process-with-declared-instrumentation',
  method: 'Replay captured pre-call numerical state through source routines; compare every body byte and the complete contact pool for vehicle0 preparation. Native pointers are preserved as opaque bytes, not inferred or rewritten.',
  cases, skipped, matched: cases.every(row => row.matched), firstDivergence: cases.find(row => !row.matched) ?? null,
  frames: expectedFrames, completion: capture.complete, interventions: capture.interventions,
  limits: ['Instrumented bounded native frames; no wall-clock cadence verdict.', 'Host keyboard/mouse history was not recorded; these are exact recorded-state replays, not input-isolated trajectory trials.', 'Preparation replay covers vehicle0; other bodies retain explicit observed-only entries.', 'Force and derivative replay compares the common body; native stack/ABI/global scratch bytes are outside this verdict.', 'This does not establish whole-frame trajectories, collisions, weapons or seven-car coverage.']};
await mkdir(output);
for (const filename of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, filename), path.join(output, filename), constants.COPYFILE_EXCL);
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
// Selected common-body numeric state contains no model geometry or asset blobs.
// Keep these small regression pairs public; extended vehicle/contact captures
// remain in the ignored local directory, with their hashes in trace.jsonl.
const selected = {targetSha256: REDUX_SHA256, authority: report.authority, scope: 'Captured common-body384-byte force/derivative pairs; no full preparation payload.', cases: fixtures};
await writeFile(path.join(output, 'body-fixtures.json'), `${JSON.stringify(selected, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({matched: report.matched, cases: cases.length, firstDivergence: report.firstDivergence, output}));
if (!report.matched) process.exitCode = 1;
