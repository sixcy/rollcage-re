//Read-only original-process output audit; never launches or initializes a game.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from './lib/native-control-capture.mjs';
import {replayNativeControlPrefix} from './lib/native-frame-control-continuation.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

const rowsOf = snapshot => [...snapshot.ranges.values()];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const differences = (a, b) => a.reduce((count, value, i) => count + Number(value !== b[i]), 0);

export function comparePartialNativeControlAudio(source, pair) {
  const native = createCapturedMemory(rowsOf(pair.after));
  const preAudio = createCapturedMemory(rowsOf(pair.checkpoints.afterAi));
  const actual = p => pair.moduleBaseAddress + p - 0x400000;
  const regions = [...source.controlAudioBindings.comparisonRegions,
    {id: 'six-vehicle-audio-cache-records', address: actual(0x713190), length: 240, evidence: '485300 six40-byte persistent audio records.'},
    {id: 'six-vehicle-horn-records', address: actual(0x713280), length: 96, evidence: '485300 six16-byte horn records; unchanged records remain compared.'},
    {id: 'audio-collision-channel-and-reverb-owner', address: actual(0x5eced0), length: 8, evidence: '485300 collision handle5eced0 and sector reverb owner5eced4.'},
  ].map(region => {
    const computed = source.span(region.address, region.length), after = native.span(region.address, region.length), before = preAudio.span(region.address, region.length);
    return {...region, sourceHex: computed.toString('hex'), nativeAfterHex: after.toString('hex'), nativePreAudioHex: before.toString('hex'),
      differingBytes: differences(computed, after), nativeChangedBytes: differences(before, after), sourceChangedBytes: differences(before, computed)};
  });
  const addresses = new Set(); for (const row of regions) for (let p = row.address; p < row.address + row.length; p++) {assert.ok(!addresses.has(p), 'Audio diagnostic regions must be disjoint.'); addresses.add(p);}
  return {matched: regions.every(row => row.differingBytes === 0), bytesCompared: addresses.size,
    differingBytes: regions.reduce((n, r) => n + r.differingBytes, 0), nativeChangedBytes: regions.reduce((n, r) => n + r.nativeChangedBytes, 0),
    sourceChangedBytes: regions.reduce((n, r) => n + r.sourceChangedBytes, 0), regions};
}

export async function auditNativeControlAudioOutputs(input, {output = null, transformAfter = null} = {}) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json')));
  const pairing = pairNativeControlSnapshots(capture, configuration);
  assert.equal(pairing.pairs.length, 1, 'This audit deliberately covers one actual V3 frame.');
  const pair = pairing.pairs[0]; assert.ok(pair.checkpoints.afterAi);
  let source, stopped, progress;
  try {
    replayNativeControlPrefix(pair.before, {...pairing.options, moduleBaseAddress: pair.moduleBaseAddress,
      onBeforeStage: event => {source = event.source;}});
    assert.fail('Expected the retained explicit42a6e0 input boundary.');
  } catch (error) {stopped = error.message; progress = error.nativeControlProgress;}
  assert.equal(progress?.stage, '0x42a6e0');
  const audioCalls = progress.calls.filter(row => row.entry === '0x485300');
  assert.deepEqual(audioCalls.map(row => row.edx), [0, 1, 2, 3, 4, 5]);
  assert.equal(progress.calls.at(-1).entry, '0x42a6e0');
  const binding = source.controlAudioBindings;
  assert.equal(binding.events.length, 26); assert.equal(new Set(binding.events.map(row => row.object)).size, 13);
  assert.deepEqual([...new Set(binding.events.map(row => row.method))].sort((a, b) => a - b), [0x14, 0x20]);
  //The expected snapshot is only exposed after genuine source execution stops.
  //The negative regression alters this comparison copy, never replay inputs.
  const comparisonPair = transformAfter ? {...pair, after: transformAfter(pair.after)} : pair;
  const comparison = comparePartialNativeControlAudio(source, comparisonPair);
  const report = {schemaVersion: 1, method: 'partial-prephysics-source-audio-output-comparison', targetSha256: REDUX_SHA256,
    authority: 'original-process-with-declared-instrumentation', captureDirectory: path.resolve(input),
    captureTraceSha256: sha(await readFile(path.join(input, 'trace.jsonl'))),
    matchedDeclaredAudioOutputs: comparison.matched, wholePrefixMatched: false, sourceComplete: false,
    beforeOrdinal: pair.before.ordinal, preAudioOrdinal: pair.checkpoints.afterAi.ordinal, afterOrdinal: pair.after.ordinal,
    tid: pair.before.tid, logicalClock: pair.logicalClock, moduleBaseAddress: pair.moduleBaseAddress,
    completedAudioCalls: audioCalls, sourceVirtualCalls: binding.events.map(event => ({object: event.object, method: event.method, caller: event.caller, site: event.site,
      target: event.target, entryEsp: event.entryEsp, returnAddress: event.returnAddress, inputWords: event.inputWords})),
    sourceStoppedAt: {stage: progress.stage, reason: stopped, firstNextCall: progress.calls.at(-1)}, comparison,
    limits: ['The six source485300 calls returned before the first42a6e0 call failed; this is not full450e50-to4749e0 completion.',
      'Only declared audio fields are compared at the later actual physics-entry snapshot. Unchanged horn/global bytes are included and counted separately from actual changed bytes.',
      'The failed42a6e0 source does not write these caches/source fields. Subsequent original game/worker activity can affect final observed state; equality proves the selected final bytes only, not a concurrent schedule.',
      'Actual nested native virtual-call contexts are not separately captured here. Source call metadata has constructed instruction validation; this report compares actual process outputs.',
      'No native after/checkpoint bytes are replay inputs; the pre-audio snapshot is used only for changed-byte accounting after replay.',
      'Whole source objects, body outputs, private stack/CPU ABI, creation/play, effect installation, haptics and audible playback are not covered by this output audit.']};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
  return {report, source, pair};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2); if (!input || !output) throw Error('Usage: node tools/check-native-control-audio-outputs.mjs CAPTURE_DIRECTORY NEW_REPORT_JSON');
  const {report} = await auditNativeControlAudioOutputs(input, {output});
  console.log(JSON.stringify({matchedDeclaredAudioOutputs: report.matchedDeclaredAudioOutputs, wholePrefixMatched: report.wholePrefixMatched,
    bytesCompared: report.comparison.bytesCompared, differingBytes: report.comparison.differingBytes, changedBytes: report.comparison.nativeChangedBytes, stopped: report.sourceStoppedAt}));
}
