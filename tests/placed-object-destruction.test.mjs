import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createPlacedDestructionFixture} from '../tools/lib/placed-destruction-fixtures.mjs';
import {initializePlacedObjectDestructionState, lookupDestructionAngle, preparePlacedObjectDestruction, updatePlacedObjectDestruction} from '../src/placed-object-destruction.mjs';
import {queueDestroyedPlacedObjects} from '../src/placed-object-damage.mjs';

const program = await loadRetainedNativeProgram(), OBJECT = 0x250000, STACK = 0x9000;
function fixture(index = 0) {
  const f = createPlacedDestructionFixture(program, index), {memory} = f;
  memory[memory.readUInt32LE(0x5ecb1c) + 0x58c] = 2;
  return {...f, runtime: {memory, scratchBase: STACK}, row: f.destructionAddresses.auxiliary};
}
function selectPreparation(f, phase) {
  f.put(0x91f1a4, f.row); f.put(0x91f1ac, OBJECT); f.put(0x91f1a8, 0x200000); f.put(f.row + 4, OBJECT); f.put(0x5ea4dc, phase);
}

test('static phase restoration is separate from runtime preparation and unknown phases return without dereferencing a row', () => {
  const memory = Buffer.alloc(0x700000);
  memory.writeInt32LE(9, 0x6e6558);
  initializePlacedObjectDestructionState(memory);
  assert.equal(memory.readInt32LE(0x6e6558), 0);
  assert.equal(preparePlacedObjectDestruction({memory}), 1);
  memory.writeInt32LE(17, 0x5ea4dc);
  assert.equal(preparePlacedObjectDestruction({memory}), 0);
  assert.equal(memory.readInt32LE(0x5ea4dc), 17);
});

test('destruction angle lookup observes live table edits and its one-period reduction', () => {
  const memory = Buffer.alloc(0x600000);
  memory.writeInt32LE(123456, 0x575228); memory.writeInt32LE(789, 0x575228 + (0x19220 >> 9) * 4);
  assert.equal(lookupDestructionAngle(0, false, {memory}), 123456);
  assert.equal(lookupDestructionAngle(-1, false, {memory}), 123456);
  assert.equal(lookupDestructionAngle(0, true, {memory}), -789);
  assert.equal(lookupDestructionAngle(0x6487f + 1, false, {memory}), 123456);
  assert.equal(lookupDestructionAngle(0x6487f * 3, false, {memory}), 0);
  memory.writeInt32LE(-456, 0x575228);
  assert.equal(lookupDestructionAngle(0, false, {memory}), -456);
});

test('first preparation performs a forward overlapping vertex copy and clears flag shorts in the copied data', () => {
  const f = fixture(), {memory, put, row} = f, workspace = f.destructionAddresses.workspace;
  selectPreparation(f, 0); f.word(0x200004, 2); put(OBJECT + 0x24, workspace - 4);
  for (const [index, value] of [0x11223344, 0x55667788, 0x99aabbcc, 0xddeeff00].entries()) put(workspace - 4 + index * 4, value);
  assert.equal(preparePlacedObjectDestruction(f.runtime), 0);
  assert.deepEqual([0, 4, 8, 12].map(offset => memory.readUInt32LE(workspace + offset)), [0x11223344, 0x3344, 0x3344, 0x3344]);
  assert.equal(memory.readUInt32LE(OBJECT + 0x24), workspace);
  assert.equal(memory.readUInt32LE(row + 0x90), workspace + 16);
  assert.equal(memory.readInt32LE(0x5ea4dc), 1);
});

test('second preparation retains the native byte-count face clear even when the face count exceeds255', () => {
  const f = fixture(), {memory, put, row} = f, workspace = f.destructionAddresses.workspace;
  selectPreparation(f, 1); put(row + 0x90, workspace); f.word(0x200006, 260); f.word(0x200004, 1);
  memory.fill(0xa5, workspace, workspace + 300);
  preparePlacedObjectDestruction(f.runtime);
  assert.equal(memory.readUInt16LE(row + 0x32), 260);
  assert.deepEqual([...memory.subarray(workspace, workspace + 6)], [0, 0, 0, 0, 0xa5, 0xa5]);
  assert.equal(memory.readUInt32LE(row + 0xa4), workspace + 260);
  assert.equal(memory.readUInt32LE(row + 0x90), workspace + 268);
  assert.equal(memory.readUInt16LE(row + 2), 3); assert.equal(memory.readInt32LE(0x5ea4dc), 255);
});

test('queued destruction takes two preparation ticks before active movement and decrements both authored route counters', () => {
  const f = fixture(), {memory, runtime, row} = f;
  queueDestroyedPlacedObjects(OBJECT, runtime); const originalY = memory.readInt32LE(OBJECT + 0x38);
  updatePlacedObjectDestruction(runtime);
  assert.equal(memory.readUInt16LE(row + 2), 2); assert.equal(memory.readInt32LE(0x9205e4), 254);
  assert.equal(memory[OBJECT + 0x19a], 5); assert.equal(memory[0x6600f], 2); assert.equal(memory[0x6601b], 2);
  updatePlacedObjectDestruction(runtime); assert.equal(memory.readInt32LE(0x5ea4dc), 1);
  updatePlacedObjectDestruction(runtime);
  assert.equal(memory.readUInt16LE(row + 2), 4); assert.equal(memory.readInt32LE(row + 0x28), 0);
  assert.equal(memory.readInt32LE(0x9205e4), 255); assert.equal(memory.readInt32LE(OBJECT + 0x38), originalY);
  updatePlacedObjectDestruction(runtime); assert.equal(memory.readInt32LE(row + 0x28), 1); assert.ok(memory.readInt32LE(OBJECT + 0x38) > originalY);
});

test('four wrapped queue entries wait on their next dependency and then finish through real effect and fragment pools', () => {
  const f = fixture(3), {memory, put, runtime, row} = f;
  for (let index = 0; index < 3; index++) put(OBJECT + 0x19c + index * 0x1000, OBJECT + (index + 1) * 0x1000);
  memory[0x9205d8] = 62; memory[0x9207e1] = 62; queueDestroyedPlacedObjects(OBJECT, runtime);
  for (let tick = 0; tick < 9; tick++) updatePlacedObjectDestruction(runtime);
  assert.deepEqual(Array.from({length: 4}, (_, index) => memory.readUInt16LE(row + index * 0xa8 + 2)), [3, 3, 3, 4]);
  assert.equal(memory[0x9205d8], 2); assert.equal(memory[0x9207e0], 0);
  for (let tick = 9; tick < 48; tick++) updatePlacedObjectDestruction(runtime);
  assert.deepEqual(Array.from({length: 4}, (_, index) => memory.readUInt16LE(row + index * 0xa8 + 2)), [0, 0, 0, 0]);
  for (const index of [62, 63, 0, 1]) assert.equal(memory.readInt32LE(0x9205e4 + index * 8), 0);
  assert.ok(memory.readUInt32LE(0x6e65c0)); assert.ok(memory.readInt32LE(0x902b88) > 0); assert.ok(memory.readUInt32LE(0x6e6bcc) > 0);
  assert.equal(memory.readUInt32LE(OBJECT + 0x24), f.destructionAddresses.workspace);
  assert.equal(memory.readUInt16LE(memory.readUInt32LE(row + 0xa0)), 0x505);
});

test('descriptor transition publishes the fourth short retained from the actual constructor quaternion scratch', () => {
  const f = fixture(1), {memory, runtime, row} = f;
  const lastBody = memory.readUInt32LE(0x849980 + 35 * 4);
  assert.equal(memory.readUInt32LE(STACK - 0xd4), lastBody + 0xe4);
  queueDestroyedPlacedObjects(OBJECT, runtime);
  for (let tick = 0; tick < 3; tick++) updatePlacedObjectDestruction(runtime);
  // Already visited faces skip vertex transforms. The second descriptor's
  // six-byte center replaces only three shorts in the eight-byte local.
  memory.fill(5, memory.readUInt32LE(row + 0xa0), memory.readUInt32LE(row + 0xa0) + 8);
  updatePlacedObjectDestruction(runtime);
  assert.equal(memory.readUInt16LE(0x91d3ea), (lastBody + 0xe4) >>> 16);
});
