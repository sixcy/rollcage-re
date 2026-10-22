import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueAutonomousRoute, canReachAutonomousRoute, updateAutonomousRouteConsistency} from '../src/autonomous-route-connectivity.mjs';
const BODY = 0x10000, OTHER = 0x14000, GROUPS = 0x21000, POINTS = 0x30000, STACK = 0x9000;
function fixture() {
  const memory = Buffer.alloc(0xa00000);
  memory.writeUInt32LE(0x20000, 0x90b98c); memory.writeUInt32LE(GROUPS, 0x20060);
  for (let group = 0; group < 32; group++) {memory.writeUInt16LE(1, GROUPS + group * 12); memory[GROUPS + group * 12 + 5] = group; memory.writeUInt32LE(POINTS + group * 16, GROUPS + group * 12 + 8);}
  memory.writeUInt32LE(OTHER, 0x909300); memory.writeUInt32LE(GROUPS + 12, 0x909354); memory.writeUInt16LE(31, BODY + 0x6c0);
  return {memory, scratchBase: STACK};
}
const link = (memory, group, first, second = 0) => memory.writeUInt32LE((first | second << 14) >>> 0, POINTS + group * 16 + 12);
test('reachability follows both point-link fields through intermediate groups', () => {
  const runtime = fixture(), {memory} = runtime;
  link(memory, 1, 2, 3); link(memory, 3, 4); link(memory, 4, 31);
  assert.equal(canReachAutonomousRoute(31, 1, 0, runtime), 1);
  assert.equal(canReachAutonomousRoute(30, 1, 0, runtime), 0);
});
test('direct match preserves queue and scratch; zero link matches target zero', () => {
  const runtime = fixture(), {memory} = runtime; memory.writeUInt16LE(7, 0x6e6cc0); memory.fill(0xa5, STACK - 132, STACK - 4);
  assert.equal(canReachAutonomousRoute(0, 1, 0, runtime), 1); assert.equal(memory.readUInt16LE(0x6e6cc0), 7);
  assert.ok(memory.subarray(STACK - 132, STACK - 4).every(value => value === 0xa5));
});
test('cycle search terminates with disconnected target and retains ring contents', () => {
  const runtime = fixture(), {memory} = runtime; link(memory, 1, 2); link(memory, 2, 3); link(memory, 3, 1);
  assert.equal(canReachAutonomousRoute(31, 1, 0, runtime), 0);
  assert.equal(memory.readUInt16LE(0x6e6cc0), memory.readUInt16LE(0x6e6cc4));
  assert.equal(memory.readUInt16LE(0x80df60), 2);
});
test('twenty-slot ring reserves one slot and leaves dropped entries untouched', () => {
  const runtime = fixture(), {memory} = runtime;
  for (let index = 0; index < 19; index++) enqueueAutonomousRoute(index + 1, index, runtime);
  const before = Buffer.from(memory.subarray(0x80df20, 0x80df88));
  enqueueAutonomousRoute(31, 511, runtime); assert.equal(memory.readUInt16LE(0x6e6cc0), 19); assert.deepEqual(memory.subarray(0x80df20, 0x80df88), before);
  memory.writeUInt16LE(1, 0x6e6cc4); enqueueAutonomousRoute(31, 511, runtime); assert.equal(memory.readUInt16LE(0x6e6cc0), 0); assert.equal(memory.readUInt16LE(0x80df20 + 38), 511);
});
test('route fallback begins at failure61 and updates the registered body', () => {
  const runtime = fixture(), {memory} = runtime; memory[BODY + 0x6d8] = 59;
  updateAutonomousRouteConsistency(BODY, runtime); assert.equal(memory[BODY + 0x6d8], 60); assert.equal(memory.readUInt16LE(OTHER + 0x6c0), 0);
  updateAutonomousRouteConsistency(BODY, runtime); assert.equal(memory[BODY + 0x6d8], 61); assert.equal(memory.readUInt16LE(OTHER + 0x6c0), 1); assert.equal(memory.readUInt16LE(BODY + 0x6c0), 31);
});
test('failure byte wraps and success clears it without copying a route', () => {
  const runtime = fixture(), {memory} = runtime; memory[BODY + 0x6d8] = 255;
  updateAutonomousRouteConsistency(BODY, runtime); assert.equal(memory[BODY + 0x6d8], 0);
  memory[BODY + 0x6d8] = 42; link(memory, 1, 31); updateAutonomousRouteConsistency(BODY, runtime);
  assert.equal(memory[BODY + 0x6d8], 0); assert.equal(memory.readUInt16LE(OTHER + 0x6c0), 0);
});
