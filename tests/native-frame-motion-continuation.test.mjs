import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {replayNativeFrameSequence, expandNativeFramePatchRuns, applyNativeFrameSequenceTransition} from '../tools/lib/native-frame-sequence.mjs';
import {createNativeMotionStateContinuation, nativeMotionStateOwnedRegions} from '../tools/lib/native-frame-motion-continuation.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots} from '../tools/check-native-frame-replay.mjs';
import {buildNativeFrameManifest} from '../tools/lib/native-frame-manifest.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const semantic = [{id: 'body', address: 0x1000, length: 16}, {id: 'clock', address: 0x2000, length: 4}];
  const abi = [{id: 'caller', address: 0x3000, length: 8, comparison: 'abi-input'}];
  function snap(position, velocity, clock, ordinal) {
    const body = Buffer.alloc(16), tick = Buffer.alloc(4); body.writeUInt32LE(position); body.writeUInt32LE(velocity, 4); tick.writeUInt32LE(clock);
    return {moduleBaseAddress: 0x400000, tid: 1, ordinal, registers: {eax: 0, esp: 0x3004}, ranges: [
      {id: 'body', address: 0x1000, bytes: body}, {id: 'clock', address: 0x2000, bytes: tick}, {id: 'stack', address: 0x3000, bytes: Buffer.alloc(8)},
    ]};
  }
  const pairs = [{before: snap(0, 2, 0, 1), after: snap(2, 2, 0, 2)}, {before: snap(2, 3, 1, 3), after: snap(5, 3, 1, 4)}];
  const replayFrame = input => {
    const captured = createCapturedMemory(input.ranges); captured.memory.writeUInt32LE(captured.memory.readUInt32LE(0x1000) + captured.memory.readUInt32LE(0x1004), 0x1000);
    return {...captured, manifest: {aliases: [], requiredRegions: [...semantic, ...abi]}, report: {nativeReturn: 0}};
  };
  const continuation = {id: 'constructed-velocity-producer', regionsFor() {return [{id: 'all-owned-output-bytes', address: 0x1004, length: 12}];},
    execute({source}) {source.memory.writeUInt32LE(source.memory.readUInt32LE(0x1004) + 1, 0x1004); return {called: true};}};
  const options = {replayFrame, semanticRegions: semantic, abiInputRegions: abi, counterRegions: [{id: 'clock', address: 0x2000, length: 4}]};
  return {pairs, options, continuation, replayFrame};
}

test('explicit source producer is compared before patches and all owned bytes are removed from captured inputs', async () => {
  const f = fixture(), baseline = await replayNativeFrameSequence(f.pairs, f.options);
  const {report} = await replayNativeFrameSequence(f.pairs, {...f.options, sourceContinuation: f.continuation});
  assert.equal(baseline.report.schemaVersion, 2); assert.equal(baseline.report.sourceContinuation, undefined);
  assert.equal(report.schemaVersion, 3); assert.equal(report.matched, true); assert.equal(report.sourceContinuation.comparedBytes, 12);
  assert.equal(report.sourceContinuation.changedNativeBytes, 1); assert.equal(baseline.report.externallyPatchedBytes, 2); assert.equal(report.externallyPatchedBytes, 1);
  const transition = report.transitions[0]; assert.equal(transition.sourceContinuation.matched, true);
  for (const run of expandNativeFramePatchRuns(transition)) assert.ok(run.address + run.length <= 0x1004 || run.address >= 0x1010);
  assert.equal(transition.sourceContinuation.regions[0].length, 12, 'Unchanged bytes remain source-owned.');
});

test('corrupted produced changed or unchanged output fails and survives the external patch phase', async () => {
  for (const offset of [0, 3, 11]) {
    const f = fixture(), original = f.continuation.execute;
    f.continuation.execute = context => {original(context); context.source.memory[0x1004 + offset] ^= 1;};
    const {report} = await replayNativeFrameSequence(f.pairs, {...f.options, sourceContinuation: f.continuation});
    assert.equal(report.matched, false); assert.equal(report.sourceContinuation.matched, false);
    assert.equal(report.transitions[0].sourceContinuation.firstDivergence.address, 0x1004 + offset);
    assert.equal(report.cases[1].matched, false, 'The next frame receives the source divergence, never the captured owned output.');
    assert.equal(report.transitions[0].externallyPatchedBytes, 1);
  }
});

test('ledger reconstruction requires producer output hashes and forbids external/ABI overwrites of owned bytes', async () => {
  const f = fixture(), {report} = await replayNativeFrameSequence(f.pairs, {...f.options, sourceContinuation: f.continuation});
  const ledger = report.transitions[0], source = f.replayFrame(f.pairs[0].before);
  f.continuation.execute({source});
  const images = {nativeAfter: createCapturedMemory(f.pairs[0].after.ranges), nextNativeBefore: createCapturedMemory(f.pairs[1].before.ranges), source};
  assert.equal(applyNativeFrameSequenceTransition(ledger, images).externallyPatchedBytes, 1);
  assert.equal(source.memory.readUInt32LE(0x1004), 3);
  source.memory.writeUInt32LE(0, 0x2000);
  source.memory[0x1007] = 1;
  assert.throws(() => applyNativeFrameSequenceTransition(ledger, images), /protected output hash/);
  source.memory[0x1007] = 0;
  const hostile = structuredClone(ledger); hostile.abiRefreshes[0].address = 0x1004;
  assert.throws(() => applyNativeFrameSequenceTransition(hostile, images), /overlaps source continuation/);
  const external = structuredClone(ledger), old = images.nativeAfter.span(0x1004, 4), next = images.nextNativeBefore.span(0x1004, 4);
  external.patchRanges.unshift({address: 0x1004, length: 4, nativeAfterSha256: hash(old), nextNativeBeforeSha256: hash(next), sourceBeforeSha256: hash(source.span(0x1004, 4)),
    externalRuns: [[0, 1]], abiRuns: [], observedChangedBytes: 1, externallyPatchedBytes: 1, overwrittenSourceDivergenceBytes: 1, sourceChangedBytes: 0});
  assert.throws(() => applyNativeFrameSequenceTransition(external, images), /overlaps source continuation/);
});

test('source continuation rejects overlapping ABI ownership and incomplete producer declarations', async () => {
  const f = fixture();
  await assert.rejects(replayNativeFrameSequence(f.pairs, {...f.options, sourceContinuation: {...f.continuation, regionsFor() {return [{id: 'wrong', address: 0x3000, length: 4}];}}}), /overlap/);
  await assert.rejects(replayNativeFrameSequence(f.pairs, {...f.options, sourceContinuation: {id: 'inert'}}), /explicit identified producer/);
});

const retained = 'analysis/native-physics-local/startup-20261022/hidden-turn-frames-capture';
test('retained active capture443d90 consumes actual aliased state and matches every owned next-entry output', {skip: !existsSync(`${retained}/trace.jsonl`)}, async () => {
  const continuation = await createNativeMotionStateContinuation(), capture = await loadPhysicsCapture(retained, {expectedSha256: continuation.evidence.targetSha256});
  const configuration = JSON.parse(await readFile(`${retained}/configuration.json`));
  const pairing = pairNativeFrameSnapshots(capture, configuration), pair = pairing.pairs[0], next = createCapturedMemory([...pairing.pairs[1].before.ranges.values()]);
  const manifest = buildNativeFrameManifest(pair.after, pairing.options), source = {...createCapturedMemory([...pair.after.ranges.values()], {aliases: manifest.aliases}), manifest};
  const regions = nativeMotionStateOwnedRegions({source, pair}), originals = regions.map(row => Buffer.from(source.span(row.address, row.length)));
  const execution = continuation.execute({source, pair});
  assert.equal(execution.calls.length, 6); assert.equal(regions.length, 30); assert.equal(regions.reduce((sum, row) => sum + row.length, 0), 144);
  let changed = 0;
  for (const [index, row] of regions.entries()) {
    const expected = next.span(row.address, row.length), produced = source.span(row.address, row.length);
    assert.deepEqual(produced, expected, row.id);
    for (let i = 0; i < row.length; i++) changed += Number(originals[index][i] !== expected[i]);
  }
  assert.equal(changed, 49);
  assert.equal(source.memory.readUInt32LE(Number(pair.after.registers.esp)), manifest.moduleBaseAddress + 0x5103d);
  assert.ok(execution.calls.every(row => row.entryEsp === Number(pair.after.registers.esp)));
});
