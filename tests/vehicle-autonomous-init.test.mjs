import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeVehicleAutonomousState, initializeAutonomousCompetitorOwners, initializeAutonomousRouteFlags} from '../src/vehicle-autonomous-init.mjs';
import {initializeVehicleContactProfileTables} from '../src/vehicle-contact-profile.mjs';
import {initializeAutonomousProfileTables} from '../src/autonomous-profile-plan.mjs';
import {triggerVehicleContactRecovery} from '../src/vehicle-contact-state.mjs';

const BODY = 0x10000, RECORD = 0x909300, SESSION = 0x50000, ROUTES = 0x80000, GROUPS = 0x81000, STACK = 0x9000;
function fixture() {
  const memory = initializeAutonomousProfileTables(initializeVehicleContactProfileTables(Buffer.alloc(0xa00000)));
  memory.writeUInt32LE(SESSION, 0x5ecb1c); memory.writeUInt32LE(ROUTES, 0x90b98c); memory.writeUInt32LE(GROUPS, ROUTES + 0x60);
  memory.writeUInt32LE(BODY, RECORD); memory.writeUInt32LE(GROUPS + 12, RECORD + 0x54); memory.writeUInt16LE(321, RECORD + 0x58);
  memory.writeInt32LE(65536, SESSION + 0x618); memory[SESSION + 0x585] = 1; memory[SESSION + 0x579] = 5;
  memory.fill(255, 0x91f6a8, 0x91f6ae);
  return {memory, scratchBase: STACK};
}

test('ownership assignment excludes profile6 and gives two distinct eligible AI cars the two non-AI owners', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[SESSION + 0x54d] = 6;
  for (let index = 0; index < 6; index++) memory[SESSION + index] = index < 2 ? 0 : 8;
  memory[SESSION + 0x1e] = 6; memory.writeInt32LE(65536, 0x5ea4d4);
  initializeAutonomousCompetitorOwners(runtime);
  const assigned = [...memory.subarray(0x91f6a8, 0x91f6ae)];
  assert.equal(assigned[2], 255); assert.equal(assigned.filter(value => value === 0).length, 1); assert.equal(assigned.filter(value => value === 1).length, 1);
  assert.equal(memory.readInt32LE(0x5ea4d4), Math.imul(1101463552, 0x41a7) & 0x7fffffff);
});

test('three non-AI participants reset the owners without consuming the random stream', () => {
  const runtime = fixture(), {memory} = runtime; memory[SESSION + 0x54d] = 4; memory[SESSION + 3] = 8;
  memory.fill(0, 0x91f6a8, 0x91f6ae); memory.writeInt32LE(123, 0x5ea4d4);
  initializeAutonomousCompetitorOwners(runtime);
  assert.deepEqual([...memory.subarray(0x91f6a8, 0x91f6ae)], Array(6).fill(255)); assert.equal(memory.readInt32LE(0x5ea4d4), 123);
});

test('route initialization skips primary and special-mode groups and clears only short group flag1', () => {
  const runtime = fixture(), {memory} = runtime; memory[ROUTES + 0x46] = 4;
  for (let index = 0; index < 4; index++) {memory.writeUInt16LE([10, 20, 21, 1][index], GROUPS + index * 12); memory[GROUPS + index * 12 + 4] = index === 3 ? 2 : 1;}
  memory[SESSION + 0x551] = 3; initializeAutonomousRouteFlags(runtime); assert.equal(memory[GROUPS + 16], 1);
  memory[SESSION + 0x551] = 0; initializeAutonomousRouteFlags(runtime);
  assert.deepEqual([0, 1, 2, 3].map(index => memory[GROUPS + index * 12 + 4]), [1, 0, 1, 2]);
});

test('whole initializer derives difficulty and mode, builds obstacle state and runs actual profile planning', () => {
  const runtime = fixture(), {memory} = runtime; memory[SESSION + 0x551] = 4; memory[ROUTES + 0x46] = 2; memory[GROUPS + 17] = 1;
  initializeVehicleAutonomousState(RECORD, runtime);
  assert.equal(memory[0x6e650d], 1); assert.equal(memory.readInt32LE(0x5ea4d8), 2); assert.equal(memory.readInt32LE(0x920f84), 1);
  assert.equal(memory.readUInt32LE(0x91f6a0), 0x5eae0c); assert.equal(memory.readUInt16LE(BODY + 0x6c0), 1); assert.equal(memory.readUInt16LE(BODY + 0x6c2), 321);
  assert.equal(memory.readUInt16LE(BODY + 0x6c4), 0x40); assert.equal(memory[BODY + 0x6f1], 4); assert.equal(memory[BODY + 0x6f2], 15);
  assert.notEqual(memory.readInt32LE(0x5ea4d4), 65536, 'actual planner consumes the freshly initialized stream');
  memory.writeUInt16LE(0, BODY + 0x6c4); const seedBefore = memory.readInt32LE(0x5ea4d4);
  triggerVehicleContactRecovery(BODY, 20, runtime);
  assert.equal(memory.readUInt16LE(BODY + 0x6c4), 0x100); assert.equal(memory.readInt32LE(0x5ea4d4), Math.imul(seedBefore, 0x41a7) & 0x7fffffff);
});

test('later initialization preserves session policy and the running stream instead of reseeding', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[0x6e650d] = 1; memory.writeInt32LE(2, 0x5ea4d8); memory.writeInt32LE(3, 0x920f84); memory.writeInt32LE(0, 0x5ea4d4);
  memory.writeInt32LE(77, 0x6e6520); memory[0x91f6a8] = 4;
  initializeVehicleAutonomousState(RECORD, runtime);
  assert.equal(memory.readInt32LE(0x5ea4d4), 0); assert.equal(memory.readInt32LE(0x5ea4d8), 2); assert.equal(memory.readInt32LE(0x920f84), 3);
  assert.equal(memory.readInt32LE(0x6e6520), 77); assert.equal(memory[BODY + 0x6f3], 4);
});

test('actual polygon producer can replace the participant body pointer while policy retains the captured body', () => {
  const runtime = fixture(), {memory} = runtime, record = 0x920b48, object = 0x100000;
  memory.writeUInt32LE(BODY, record); memory.writeUInt32LE(GROUPS + 12, record + 0x54); memory.writeUInt16LE(99, record + 0x58);
  memory.writeUInt32LE(1, 0x6e6514); memory.writeUInt32LE(object, 0x920b40); memory.writeUInt32LE(0x110000, object + 0x10);
  memory[ROUTES + 0x46] = 2; memory[GROUPS + 17] = 7;
  initializeVehicleAutonomousState(record, runtime);
  assert.equal(memory.readUInt32LE(record), 0x6f95a0); assert.equal(memory.readUInt16LE(0x6f95a0 + 0x6c0), 7); assert.equal(memory.readUInt16LE(0x6f95a0 + 0x6c2), 99);
  assert.equal(memory.readUInt16LE(BODY + 0x6c0), 0); assert.equal(memory.readUInt16LE(BODY + 0x6c4), 0x40); assert.equal(memory[BODY + 0x6f2], 15);
});
