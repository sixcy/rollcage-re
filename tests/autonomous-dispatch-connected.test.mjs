import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectedDispatchFixture, stepConnectedDispatch} from '../tools/verify-autonomous-dispatch-connected-instructions.mjs';

test('persistent dispatcher chain feeds actual digital axes/handling without moving supplied bodies', () => {
  const context = createConnectedDispatchFixture(25), {memory, body} = context;
  const position = Buffer.from(memory.subarray(body + 0x34, body + 0x40)), velocity = Buffer.from(memory.subarray(body + 0x68, body + 0x74));
  for (let tick = 0; tick < 12; tick++) stepConnectedDispatch(context, tick);
  assert.deepEqual(memory.subarray(body + 0x34, body + 0x40), position); assert.deepEqual(memory.subarray(body + 0x68, body + 0x74), velocity);
  assert.equal(memory.readUInt32LE(0x90a548), 492); assert.equal(memory[body + 0x6d9], 5);
  assert(memory.readInt32LE(body + 0x650) > 0); assert(memory[body + 0x709] > 0); assert.equal(memory.readInt16LE(body + 0x668), 67);
  assert.notEqual(memory.readInt32LE(0x90933c), 0);
});

test('actual shared-frame route walk disables its matching event before phase-zero planning', () => {
  const context = createConnectedDispatchFixture(25), {memory, body} = context;
  const event = memory.readUInt32LE(memory.readUInt32LE(0x90b990) + 0xf8) + 24;
  assert.equal(memory[event + 5], 1); stepConnectedDispatch(context, 0);
  assert.equal(memory[event + 5], 0); assert.equal(memory.readUInt32LE(0x6e6510), 481); assert.equal(memory[body + 0x6d9], 0);
  assert.equal(memory.readInt16LE(body + 0x6e4), 21); assert.equal(memory.readInt16LE(body + 0x6e6), 22);
});

test('mode200 timer completion persists into subsequent common planning ticks', () => {
  const context = createConnectedDispatchFixture(18), {memory, body} = context;
  assert.equal(memory.readUInt16LE(body + 0x6c6), 19);
  stepConnectedDispatch(context, 0); assert.equal(memory.readUInt16LE(body + 0x6c4) & 0x3ff, 0x200); assert.equal(memory.readUInt16LE(body + 0x6c6), 20);
  stepConnectedDispatch(context, 1); assert.equal(memory.readUInt32LE(body + 0x6c4), 0);
  stepConnectedDispatch(context, 2); assert.equal(memory.readUInt16LE(body + 0x6c4) & 0x4000, 0x4000);
});

test('reverse-recovery timeout clears mode/timer before next tick resumes common planning', () => {
  const context = createConnectedDispatchFixture(9), {memory, body} = context;
  memory.writeUInt16LE(120, body + 0x6c6); memory[body + 0x6e8] = 0;
  stepConnectedDispatch(context, 0); assert.equal(memory.readUInt32LE(body + 0x6c4), 0); assert.equal(memory[body + 0x6e8], 0);
  stepConnectedDispatch(context, 1); assert.equal(memory.readUInt16LE(body + 0x6c4) & 0x4000, 0x4000); assert.equal(memory[body + 0x6e8], 1);
});
