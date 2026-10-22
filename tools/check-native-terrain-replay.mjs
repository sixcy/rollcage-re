import {mkdir, writeFile, copyFile, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {replayNativeTerrain} from './lib/native-terrain-replay.mjs';
import {firstByteDivergence} from './lib/native-body-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node tools/check-native-terrain-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
const config = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8')), terminal = capture.snapshots.at(-1);
const bodyCallBoundary = Number(config.breakpoints.find(row => row.id === 'terrain-before')?.rva) === 0x24ed7;
if (!['terrain-after', 'terrain-empty-after'].includes(terminal.breakpointId) || terminal.hit !== config.breakpoints.find(row => row.id === terminal.breakpointId)?.stopAfterHits) throw Error('Capture did not reach its declared native query-return bound.');
const pending = new Map(), cases = [];
for (const after of capture.snapshots) {
  if (after.breakpointId === 'terrain-before') {
    if (pending.has(after.tid)) throw Error('Nested native terrain entry is outside this replay.');
    pending.set(after.tid, after); continue;
  }
  if (!['terrain-after', 'terrain-empty-after'].includes(after.breakpointId)) continue;
  const before = pending.get(after.tid);
  if (!before) throw Error('Missing same-thread native terrain entry.');
  pending.delete(after.tid);
  for (const id of ['body', 'query', 'output', 'candidates']) if (before.ranges.get(id)?.address !== after.ranges.get(id)?.address) throw Error(`Native terrain ${id} identity changed.`);
  const row = {beforeOrdinal: before.ordinal, afterOrdinal: after.ordinal, nativeFraction: Number(after.registers.eax) | 0,
    outputFlags: after.ranges.get('output').bytes.readInt32LE(28), radiusQ8: before.ranges.get('query').bytes.readInt32LE(64),
    trackFilename: before.ranges.get('track-filename').bytes.toString('ascii').split('\0')[0],
    logicalClock: before.ranges.get('clock').bytes.readUInt32LE(0),
    entryBoundary: bodyCallBoundary ? 'body-query-call-site' : 'terrain-function-entry',
    originalReturnAddress: `0x${(bodyCallBoundary ? Number(before.registers.eip) + 5 : before.ranges.get('entry-stack').bytes.readUInt32LE(0)).toString(16)}`,
    racePhase: before.ranges.get('session-settings')?.bytes.readUInt32LE(0x2f) ?? null,
    attractMode: before.ranges.get('session-settings')?.bytes[0x3f] ?? null};
  if (config.breakpoints.find(item => item.id === 'terrain-before')?.captureWhen && row.racePhase !== 4) throw Error('Filtered capture does not contain the declared active race phase.');
  try {
    const replay = replayNativeTerrain(before), comparisons = [];
    for (const id of ['output', 'query', 'body', 'candidates', 'plane-scratch', 'cross-scratch', 'border-scratch', 'clock']) {
      const range = after.ranges.get(id);
      if (!range) throw Error('Missing declared comparison range.');
      const actual = replay.span(Number(range.address), range.length), divergence = firstByteDivergence(range.bytes, actual);
      comparisons.push({id, address: range.address, length: range.length, matched: !divergence, divergence});
    }
    Object.assign(row, {sourceFraction: replay.fraction, matched: row.nativeFraction === replay.fraction && comparisons.every(item => item.matched), comparisons,
      candidateCount: replay.candidateCount, vertexReads: replay.vertexReads.length, sourceWrites: replay.writes.length, mappedBytes: replay.mappedBytes, numericalContext: replay.context});
  } catch (error) {Object.assign(row, {matched: false, replayError: error.stack});}
  cases.push(row);
}
if (pending.size || !cases.length) throw Error('Capture contains an unmatched or empty native terrain replay.');
const report = {schemaVersion: 1, targetSha256: REDUX_SHA256, authority: 'original-process-with-declared-instrumentation',
  method: 'Original424ff0 pre/post call replay from captured native candidates, actual native geometry regions and numerical globals; exact return and declared mutable-byte comparisons. Source memory throws on uncaptured access and preserves explicit global/native aliases.',
  matched: cases.every(row => row.matched), firstDivergence: cases.find(row => !row.matched) ?? null, cases,
  hits: cases.filter(row => row.outputFlags !== 0).length, sphereQueries: cases.filter(row => row.radiusQ8 !== 0).length,
  completion: capture.complete, interventions: capture.interventions,
  limits: ['Bounded instrumented terrain queries, not a full collision frame or native trajectory.', 'Only declared mutable ranges are compared; unrelated bytes of captured heap regions are not a whole-process replay.', 'Host input history was not independently recorded.', 'Full raw geometry regions remain private; this report retains hashes and selected numeric outcomes.']};
await mkdir(output);
for (const filename of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, filename), path.join(output, filename), constants.COPYFILE_EXCL);
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({matched: report.matched, cases: cases.length, hits: report.hits, sphereQueries: report.sphereQueries, firstDivergence: report.firstDivergence, output}));
if (!report.matched) process.exitCode = 1;
