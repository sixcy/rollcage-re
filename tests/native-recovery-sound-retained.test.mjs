import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v2-20261023';
test('retained recovery sound proves actual nested allocation returns and rejects an unrelated source return', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
  assert.equal(pairs.length, 1);
  const pair = pairs[0], proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration);
  assert.equal(proof.selectedCount, 10); assert.equal(proof.genericSnapshots, 10);
  assert.equal(proof.unrelatedGenericSnapshots, 0);
  assert.equal(capture.complete.pendingFrameSelection.nestedSnapshots, 10);
  assert.equal(proof.wrapperAddress > 0, true); assert.equal(proof.sourceAddress > 0, true);
  assert.notEqual(proof.wrapperAddress, proof.sourceAddress);
  assert.equal(proof.layout.sourceAllocationEsp, proof.layout.factoryEntry - 0x834);
  assert.equal(proof.emitterArguments[2], 9000); assert.equal(proof.emitterArguments[3], 6);
  assert.notEqual(proof.emitterArguments[4], 0, 'The original surviving ECX must not be replaced with zero.');
  const sourceReturn = capture.snapshots.find(row => row.breakpointId === 'recovery-sound-new-source-return');
  const corrupted = {...capture, snapshots: capture.snapshots.map(row => row === sourceReturn
    ? {...row, registers: {...row.registers, eax: (Number(row.registers.eax) + 128) >>> 0}} : row)};
  assert.throws(() => selectNativeRecoverySoundSnapshots(corrupted, pair, configuration), /source return lineage/);
});
