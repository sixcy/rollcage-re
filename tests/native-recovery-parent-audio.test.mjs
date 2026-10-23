import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {compareNativeRecoveryParentAudio} from '../tools/check-native-recovery-parent-audio.mjs';
import {bindCapturedNativeRecovery} from '../tools/lib/native-recovery-context.mjs';
import {nativeRecoveryFactoryInputAliases} from '../tools/lib/native-recovery-factory-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v12-20261023';
const available = existsSync(`${directory}/trace.jsonl`);
let input;
async function fixture() {
  return input ??= (async () => {
    const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
    const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
    const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
    assert.equal(pairs.length, 1);
    return {capture, configuration, pair: pairs[0]};
  })();
}

test('native audio input aliases share actual module storage while retaining opaque pointers and rejecting invented translations', {skip: !available}, async () => {
  const {pair} = await fixture(), options = {...pair.options, nativeAudio: true};
  const plain = bindCapturedNativeRecovery(pair.before, options);
  assert.throws(() => plain.memory.readUInt32LE(0x56e47c), /Uncaptured/);
  const aliases = nativeRecoveryFactoryInputAliases([...pair.before.ranges.values()], pair.moduleBaseAddress);
  const bound = bindCapturedNativeRecovery(pair.before, {...options, additionalInputAliases: aliases});
  const actual = address => pair.moduleBaseAddress + address - 0x400000;
  const imported = pair.before.ranges.get('recovery-audio-resolver-crt-import');
  assert.equal(bound.memory.readUInt32LE(0x56e47c), imported.bytes.readUInt32LE());
  assert.equal(bound.memory.readUInt32LE(0x714b08), plain.memory.readUInt32LE(0x714b08), 'Heap manager pointer is preserved verbatim.');
  const state = pair.before.ranges.get('recovery-audio-debugger-state'), previous = state.bytes.readUInt32LE();
  bound.memory.writeUInt32LE(previous ^ 1, 0x714b18);
  assert.equal(bound.memory.readUInt32LE(actual(0x714b18)), (previous ^ 1) >>> 0, 'Overlapping source aliases share the actual mutable bytes.');
  assert.equal(state.bytes.readUInt32LE(), previous, 'Captured evidence is immutable.');
  assert.throws(() => bindCapturedNativeRecovery(pair.before, {...options, additionalInputAliases: [{address: 0x56e47c, targetAddress: actual(0x56e47c) + 4, length: 4}]}), /observed module translation/);
});

test('real V12 full parent reaches fourteen external factory outcomes and rejects unresolved concurrent waiter changes', {skip: !available}, async () => {
  const {capture, configuration, pair} = await fixture();
  const originals = [...pair.before.ranges.values()].map(row => Buffer.from(row.bytes));
  const report = compareNativeRecoveryParentAudio(capture, pair, configuration);
  assert.equal(report.matched, false);
  assert.equal(report.sourceComplete, false);
  assert.equal(report.fullPrivateAbiMatched, false);
  assert.equal(report.error.boundary.kind, 'unbound-concurrency');
  assert.equal(report.factoryExternalEvents, 14);
  assert.equal(report.sourceEvents[0].allocation, 'allocator-wrapper');
  assert.ok(report.inputAdmissions.length > 40);
  assert.equal(report.deferredAllocatorOutputs.length, 4);
  assert.ok(report.deferredAllocatorOutputs.every(row => row.initializeAt === 'matched-original-allocator-return'));
  for (const [index, row] of [...pair.before.ranges.values()].entries()) assert.deepEqual(row.bytes, originals[index]);
});
