import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeVehicleContactProfile, initializeVehicleContactProfileTables} from '../src/vehicle-contact-profile.mjs';
import {triggerVehicleContactRecovery} from '../src/vehicle-contact-state.mjs';

const BODY = 0x10000, SESSION = 0x20000, ROW = 0x5eadd4;
const pack = values => values.reduce((word, value, index) => word | value << (index * 3), 0) >>> 0;
const lanes = (memory, address, count) => Array.from({length: count}, (_, index) => memory.readUInt32LE(address) >>> (index * 3) & 7);
function fixture(difficulty = 1, mode = 0, body = BODY) {
  const memory = initializeVehicleContactProfileTables(Buffer.alloc(0xa00000));
  memory.writeUInt32LE(SESSION, 0x5ecb1c); memory.writeInt32LE(difficulty, 0x5ea4d8); memory.writeUInt32LE(mode, 0x920f84);
  memory.writeUInt16LE(2, body + 0x65e); memory[SESSION + 0x1e] = 0;
  return {memory};
}
function setRow(memory, first, second) {
  memory.writeUInt32LE(pack(first), ROW); memory.writeUInt32LE(pack(second), ROW + 4);
}

test('static restoration copies the seven original rows and both duration tables without neighboring bytes', () => {
  const memory = Buffer.alloc(0xa00000, 0xcc);
  initializeVehicleContactProfileTables(memory);
  assert.equal(memory.subarray(ROW, ROW + 8).toString('hex'), '17f4b624e0c0bb00');
  assert.equal(memory.subarray(ROW + 48, ROW + 56).toString('hex'), '3bb2df34ff0f0000');
  assert.deepEqual([...memory.subarray(0x5eae0c, 0x5eae14)], [45, 40, 35, 30, 25, 20, 10, 4]);
  assert.deepEqual([...memory.subarray(0x5eae14, 0x5eae1c)], [45, 40, 35, 30, 25, 20, 15, 5]);
  assert.equal(memory[ROW - 1], 0xcc); assert.equal(memory[0x5eae1c], 0xcc);
});

test('ordinary difficulty selects all eighteen lanes while preserving the unowned high bits', () => {
  const runtime = fixture(-1), {memory} = runtime;
  const first = [0, 1, 2, 3, 4, 5, 6, 7, 2, 1], second = [7, 6, 5, 4, 3, 2, 1, 0];
  setRow(memory, first, second); memory.writeUInt32LE(0xc0000000, BODY + 0x6f4); memory.writeUInt32LE(0xab000000, BODY + 0x6f8);
  initializeVehicleContactProfile(BODY, runtime);
  assert.deepEqual(lanes(memory, BODY + 0x6f4, 10), first); assert.deepEqual(lanes(memory, BODY + 0x6f8, 8), second);
  assert.equal(memory.readUInt32LE(BODY + 0x6f4) >>> 30, 3); assert.equal(memory[BODY + 0x6fb], 0xab);
  assert.equal(memory.readUInt32LE(0x91f6a0), 0x5eae0c);
});

test('difficulty zero clamps reductions and applies late mode bonuses with a six-point ceiling', () => {
  for (const [mode, finalLane] of [[0, 6], [1, 5], [2, 4], [0xffffffff, 4]]) {
    const runtime = fixture(0, mode), {memory} = runtime;
    setRow(memory, [7, 2, 1, 4, 5, 6, 1, 0, 7, 6], [2, 1, 7, 6, 2, 5, 5, 4]);
    initializeVehicleContactProfile(BODY, runtime);
    assert.deepEqual(lanes(memory, BODY + 0x6f4, 10), [7, 0, 0, 2, 5, 6, 0, 0, 4, 4]);
    assert.deepEqual(lanes(memory, BODY + 0x6f8, 8), [0, 0, 5, 6, 0, 5, 6, finalLane]);
    assert.equal(memory.readUInt32LE(0x91f6a0), 0x5eae14);
  }
});

test('difficulty two boosts the recovery lane and selects primary lane six or seven at its boundary', () => {
  for (const [before, after, primary, expectedPrimary] of [[0, 2, 0, 6], [2, 4, 3, 6], [3, 4, 4, 7], [6, 7, 7, 7], [7, 7, 2, 6]]) {
    const runtime = fixture(2), {memory} = runtime;
    setRow(memory, [1, primary, 2, 3, 4, 5, 6, 7, 0, 1], [0, 1, 2, before, 4, 5, 6, 7]);
    initializeVehicleContactProfile(BODY, runtime);
    assert.equal(lanes(memory, BODY + 0x6f4, 10)[1], expectedPrimary);
    assert.deepEqual(lanes(memory, BODY + 0x6f8, 8), [0, 1, 2, after, 4, 5, 6, 7]);
  }
});

test('mode is reloaded after profile writes when its global aliases the live body policy word', () => {
  const body = 0x920f84 - 0x6f8, runtime = fixture(0, 0, body), {memory} = runtime;
  setRow(memory, Array(10).fill(0), [7, 0, 0, 0, 0, 0, 0, 1]);
  initializeVehicleContactProfile(body, runtime);
  assert.deepEqual(lanes(memory, body + 0x6f8, 8), [4, 0, 0, 0, 0, 0, 3, 1]);
  assert.notEqual(memory.readUInt32LE(0x920f84), 0, 'policy writes have changed the global before the mode branch');
});

test('actual recovery consumes the initialized profile pointer and the separate constructor-owned seed', () => {
  const runtime = fixture(2), {memory} = runtime;
  memory[SESSION + 0x1e] = 2; memory.writeInt32LE(65536, 0x5ea4d4);
  initializeVehicleContactProfile(BODY, runtime);
  assert.equal(memory.readInt32LE(0x5ea4d4), 65536, 'profile setup does not reseed recovery');
  assert.equal(lanes(memory, BODY + 0x6f8, 8)[3], 5, 'original row2 lane4 is raised to5');
  triggerVehicleContactRecovery(BODY, 20, runtime);
  assert.equal(memory.readInt32LE(0x5ea4d4), 1101463552);
  assert.equal(memory.readUInt16LE(BODY + 0x6c4), 0x100);
  assert.equal(memory.readUInt16LE(BODY + 0x6c6), 44, 'table byte20 gives ten random ticks plus34');
});
