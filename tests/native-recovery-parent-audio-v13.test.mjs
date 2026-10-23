import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {compareNativeRecoveryParentAudio} from '../tools/check-native-recovery-parent-audio.mjs';
import {selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {createNativeRecoveryAdaptiveSoundBindings} from '../tools/lib/native-recovery-channel-replay.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v13-20261023';
const available = existsSync(`${directory}/trace.jsonl`);
let loaded;
async function fixture() {
  return loaded ??= (async () => {
    const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
    const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
    const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
    assert.equal(pairs.length, 1);
    const pair = pairs[0], proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration);
    return {capture, configuration, pair, proof};
  })();
}
const digestInputs = pair => [...pair.before.ranges.values(), ...pair.after.ranges.values()].map(row => Buffer.from(row.bytes));
const assertUnchanged = (pair, originals) => {
  for (const [index, row] of [...pair.before.ranges.values(), ...pair.after.ranges.values()].entries()) assert.deepEqual(row.bytes, originals[index]);
};

test('clean V13 connected source parent matches declared semantic/audio outputs without closing concurrency or private ABI', {skip: !available}, async () => {
  const {capture, configuration, pair, proof} = await fixture(), originals = digestInputs(pair);
  const report = compareNativeRecoveryParentAudio(capture, pair, configuration);
  assert.equal(report.matched, true); assert.equal(report.sourceComplete, true); assert.equal(report.playbackComplete, true);
  assert.equal(report.fullPrivateAbiMatched, false); assert.equal(report.error, undefined);
  assert.equal(report.semantic.matched, true); assert.equal(report.semantic.comparedBytes, 4990925);
  assert.deepEqual(report.semantic.registers.map(row => row.name), ['ebx', 'ebp', 'esi', 'edi', 'esp']);
  assert.ok(report.semantic.registers.every(row => row.matched));
  assert.equal(report.audio.matched, true); assert.equal(report.audio.comparedBytes, 8292);
  assert.equal(report.audio.regions.length, 16); assert.ok(report.audio.regions.every(row => row.matched));
  assert.equal(report.inputAdmissions.length, 59); assert.equal(report.factoryExternalEvents, 16);
  assert.equal(report.deferredAllocatorOutputs.length, 4);
  assert.ok(report.deferredAllocatorOutputs.every(row => row.initializeAt === 'matched-original-allocator-return'));
  assert.deepEqual(report.sourceEvents.filter(row => row.stage === 'playback').map(row => row.name), ['EnterCriticalSection', 'GetCurrentThreadId', 'LeaveCriticalSection']);
  assert.equal(report.sourceEvents.find(row => row.name === 'memcpy').returnedEcx, proof.playbackCopyObservations.returnedRegisters.ecx);
  assert.deepEqual(report.sourceCheckpoints.map(row => row.stage), ['adaptive-channel-selected']);
  assert.ok(report.limits.some(text => /prior initialization or concurrent producers/.test(text)));
  assert.ok(report.limits.some(text => /private CPU\/CRT stack/.test(text)));

  //Read-only imported rows must agree with original parent bytes wherever
  //those bytes exist. Future allocator preimages deliberately differ and
  //remain capacity/output rows, not parent-state initialization bytes.
  const before = createCapturedMemory([...pair.before.ranges.values()]);
  const binding = createNativeRecoveryAdaptiveSoundBindings({capture, pair, configuration});
  for (const row of binding.additionalInputSpans) {
    if (row.role === 'allocator-output-capacity') {
      assert.equal(row.bytes, undefined); assert.equal(row.preimageBytes.length, row.length);
      assert.notDeepEqual(before.span(row.address, row.length), row.preimageBytes);
    } else {
      assert.equal(row.role, 'actual-read-before-use-input');
      for (let offset = 0; offset < row.length; offset++) {
        let original;
        try {original = before.span(row.address + offset, 1);} catch (error) {assert.match(error.message, /Uncaptured/); continue;}
        assert.equal(original[0], row.bytes[offset], `admitted original byte ${row.id}+${offset}`);
      }
    }
  }
  assertUnchanged(pair, originals);
});

test('changing only an original after-source byte fails V13 output comparison while source execution still completes', {skip: !available}, async () => {
  const {capture, configuration, pair, proof} = await fixture(), originals = digestInputs(pair);
  const address = proof.sourceAddress + 0x984;
  let changedRanges = 0;
  const ranges = new Map([...pair.after.ranges].map(([id, row]) => {
    const bytes = Buffer.from(row.bytes), start = Number(row.address);
    if (address >= start && address < start + bytes.length) {bytes[address - start] ^= 1; changedRanges++;}
    return [id, {...row, bytes}];
  }));
  assert.ok(changedRanges > 0);
  const changed = {...pair, after: {...pair.after, ranges}};
  const report = compareNativeRecoveryParentAudio(capture, changed, configuration);
  assert.equal(report.sourceComplete, true); assert.equal(report.playbackComplete, true);
  assert.equal(report.matched, false); assert.equal(report.fullPrivateAbiMatched, false); assert.equal(report.error, undefined);
  const source = report.audio.regions.find(row => row.id === 'source');
  assert.equal(source.matched, false); assert.equal(source.difference.offset, 0x984);
  assertUnchanged(pair, originals);
});
