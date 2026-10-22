import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTrackDeformation, updateTrackDeformation, spatialBucketContainsSector} from '../src/track-deformation.mjs';
import {createTrackDeformationFixture} from '../tools/verify-track-deformation-instructions.mjs';
import {createTrackDeformationConstructorFixture} from '../tools/verify-track-deformation-constructor-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);

test('spatial eligibility traverses variable records and accepts the terminating record before testing its flag', () => {
  const f = createTrackDeformationFixture(1);
  for (const sector of [1, 2, 3]) assert.equal(spatialBucketContainsSector(sector, f.position, f), 1);
  for (const sector of [0, 7, 128]) assert.equal(spatialBucketContainsSector(sector, f.position, f), 0);
});

test('forced phase wraps at2048 while empty grids still queue the exact dirty range', () => {
  const f = createTrackDeformationFixture(2), {memory, records} = f;
  put(memory, 0x80df00, 1); memory[0x91ce90] = 2; word(memory, records + 2, 2047); word(memory, records + 4, 0); word(memory, records + 6, 0); put(memory, 0x80f210, 0);
  updateTrackDeformation(f); assert.equal(memory.readUInt16LE(records + 2), 0);
  assert.equal(memory.readUInt32LE(0x80f420), 0x40000003); assert.equal(memory.readUInt32LE(0x80f210), 1);
  updateTrackDeformation(f); assert.equal(memory.readUInt16LE(records + 2), 1); assert.equal(memory.readUInt32LE(0x80f210), 1);
});

test('all sentinel participants suppress deformation without dereferencing their invalid handles', () => {
  const f = createTrackDeformationFixture(13), {memory, records} = f;
  put(memory, 0x80df00, 1); memory[0x91ce90] = 0; const phase = memory.readUInt16LE(records + 2), before = Buffer.from(memory.subarray(0x10000, 0x2a000));
  updateTrackDeformation(f); assert.equal(memory.readUInt16LE(records + 2), phase); assert.deepEqual(memory.subarray(0x10000, 0x2a000), before);
});

test('full dirty storage preserves geometry updates while refusing another range', () => {
  const f = createTrackDeformationFixture(4), {memory, records} = f;
  put(memory, 0x80df00, 1); memory[0x91ce90] = 2; put(memory, 0x80f210, 64); const phase = memory.readUInt16LE(records + 2), dirty = Buffer.from(memory.subarray(0x80f420, 0x80f524));
  updateTrackDeformation(f); assert.equal(memory.readUInt16LE(records + 2), (phase + 1) % 2048); assert.deepEqual(memory.subarray(0x80f420, 0x80f524), dirty);
});

test('constructor claims actual runtime rows and supplies border motion and the32-entry palette ramp', () => {
  const f = createTrackDeformationConstructorFixture(3), {memory} = f, allocations = [];
  initializeTrackDeformation({...f, handlers: {allocate: size => {allocations.push(size); return 0x30000;}}});
  const count = memory.readUInt32LE(0x80df00); assert.ok(count > 0); assert.deepEqual(allocations, [count * 28]); assert.equal(memory.readUInt32LE(0x80df04), 0x30000);
  const alpha = memory[f.colors + 0xfbf];
  for (let row = 0; row < 32; row++) assert.deepEqual([...memory.subarray(f.colors + 0xfbc - row * 4, f.colors + 0xfc0 - row * 4)], [40 + row * 3, 40 + row * 3, 40 + row * 3, alpha]);
  updateTrackDeformation(f); for (let row = 0; row < count; row++) assert.equal(memory.readUInt16LE(0x30002 + row * 28), 1);
});

test('empty segment table clears ownership and does not call the allocator', () => {
  const f = createTrackDeformationConstructorFixture(0); put(f.memory, 0x80df00, 9); put(f.memory, 0x80df04, 0x1234);
  initializeTrackDeformation(f); assert.equal(f.memory.readUInt32LE(0x80df00), 0); assert.equal(f.memory.readUInt32LE(0x80df04), 0);
});

test('an allocator that empties the captured pack still follows the native retained-count palette branch', () => {
  const f = createTrackDeformationConstructorFixture(3), {memory} = f, alpha = memory[f.colors + 3];
  initializeTrackDeformation({...f, handlers: {allocate: () => {put(memory, f.pack + 16, 0); put(memory, 0x80df00, 0); return 0x30000;}}});
  assert.equal(memory.readUInt32LE(0x80df00), 0); assert.deepEqual([...memory.subarray(f.colors + 0xfbc, f.colors + 0xfc0)], [40, 40, 40, alpha]);
});
