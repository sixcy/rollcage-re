import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectedPlannerFixture} from '../tools/verify-autonomous-route-planner-connected-instructions.mjs';
import {planAutonomousRoute} from '../src/autonomous-route-planner.mjs';

const rows = memory => Array.from({length: 20}, (_, index) => 0x91f1e0 + index * 52);

test('connected planner needs no game handlers and preserves producer-owned route/model/source bytes', () => {
  const context = createConnectedPlannerFixture(0), {memory} = context;
  const ranges = [[0x31000, 96], [0x40000, 0x8000], [0x80000, 0x9000], [0xb0000, 0xd100]];
  const before = ranges.map(([address, length]) => Buffer.from(memory.subarray(address, address + length)));
  planAutonomousRoute(context.body, context);
  ranges.forEach(([address, length], index) => assert.deepEqual(memory.subarray(address, address + length), before[index]));
  assert(memory.readUInt16LE(context.body + 0x6c0) < 8); assert(memory.readUInt16LE(context.body + 0x6c2) < 12);
  assert.equal(memory[context.body + 0x6c9], 1); assert(rows(memory).some(row => memory.readUInt16LE(row) !== 0));
  assert(rows(memory).some(row => memory[row + 37] === 1));
});

test('populated world connects nearby costs and all three authored special candidate sources', () => {
  const context = createConnectedPlannerFixture(4), {memory} = context;
  planAutonomousRoute(context.body, context);
  assert.equal(memory[0x6e650e], 35); assert.equal(memory.readUInt32LE(0x6e651c), 4);
  const types = rows(memory).map(row => memory[row + 37]);
  for (const type of [3, 4, 5]) assert(types.includes(type), `actual special type${type}`);
  assert(rows(memory).some(row => memory.readInt32LE(row + 44) < 0 || memory.readInt32LE(row + 48) < 0));
  assert.equal(memory[context.body + 0x6c9], 4);
});

test('reversed route planning retains bounded ordinary indices and populated obstacle output', () => {
  const context = createConnectedPlannerFixture(6), {memory} = context;
  assert.equal(memory[0x31000 + 12 + 2], 1);
  planAutonomousRoute(context.body, context);
  assert.equal(memory[0x6e650e], 32); assert.equal(memory.readUInt32LE(0x6e651c), 4);
  for (const row of rows(memory)) if (memory.readUInt16LE(row)) {assert(memory.readUInt16LE(row) < 8); assert(memory[row + 2] < 12);}
  assert(memory.readUInt16LE(context.body + 0x6c0) < 8); assert(memory.readUInt16LE(context.body + 0x6c2) < 12);
});

test('connected opponent policy emits both avoidance and follow candidates alongside authored targets', () => {
  const context = createConnectedPlannerFixture(7), {memory} = context;
  planAutonomousRoute(context.body, context);
  const types = rows(memory).map(row => memory[row + 37]);
  for (const type of [1, 2, 3, 4, 5]) assert(types.includes(type), `connected candidate type${type}`);
});
