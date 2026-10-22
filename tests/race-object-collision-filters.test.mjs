import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createRaceObjectCollisionFixture} from '../tools/lib/race-object-collision-fixtures.mjs';
import {filterAnimatedRaceObject, filterShrinkingRaceObject, filterRetiredRaceObject, removeRaceObjectEffect, decrementAuthoredRaceObjectGroups, createRaceObjectCollisionFilters} from '../src/race-object-collision-filters.mjs';
const program = await loadRetainedNativeProgram();

test('first type25 contact releases script control and effect ownership while preserving physical registration', () => {
  const {memory, body, runtime} = createRaceObjectCollisionFixture(program), flags = memory.readInt32LE(body);
  assert.equal(filterAnimatedRaceObject(body, runtime), 0);
  assert.equal(memory.readInt32LE(body), (flags & 0xffffddff) | 0x1000);
  assert.equal(memory.readUInt16LE(0x902bc4), 1); assert.equal(memory.readInt32LE(0x82e900), 2);
  assert.equal(memory.readUInt32LE(0x82e888), body + 0x20000); assert.equal(memory.readInt32LE(0x82e88c), 303);
  const seed = Math.imul(0x12345678, 0x41a7) & 0x7fffffff, roll = Math.imul(seed >>> 15, 0x7fff) >>> 16;
  assert.deepEqual([0, 4, 8].map(o => memory.readInt32LE(body + 0x80 + o)), [0, 4, 8].map(shift => (((roll >>> shift) & 15) - 8) << 18));
});

test('later type25 contact emits actual pools, retires physics and decrements exactly two adjacent group rows', () => {
  const {memory, body, runtime, fixtureAddresses: a} = createRaceObjectCollisionFixture(program, 1, {scripted: false});
  assert.equal(filterAnimatedRaceObject(body, runtime), 0);
  assert.equal(memory.readUInt16LE(0x902bc4), 0); assert.equal(memory.readInt32LE(0x91e798), 0);
  assert.equal(memory.readUInt16LE(body + 0x16a), 0); assert.equal(memory.readUInt16LE(a.scripts + 2), 0xfff2);
  assert.deepEqual([0, 1, 2, 3].map(i => memory[a.groups + i * 12 + 3]), [1, 1, 2, 4]);
  assert.ok(memory.readUInt32LE(0x6e65c0)); assert.ok(memory.readInt32LE(0x902b88)); assert.equal(memory.readInt32LE(0x91cd90), 1);
});

test('type31 contact stops collision and begins the existing shrink controller', () => {
  const {memory, body, runtime} = createRaceObjectCollisionFixture(program, 2, {kind: 31});
  assert.equal(filterShrinkingRaceObject(body, runtime), 0);
  assert.equal(memory.readUInt16LE(0x902bc4), 0); assert.equal(memory.readUInt32LE(body + 0x148), 0);
  assert.equal(memory.readInt32LE(body + 0x184), 2); assert.equal(memory.readUInt16LE(body + 0x188), 0); assert.equal(memory.readInt32LE(0x82e900), 2);
});

test('type35 contact uses actual effects and retirement while leaving the targeting-list behavior unchanged', () => {
  const {memory, body, runtime} = createRaceObjectCollisionFixture(program, 3, {kind: 35});
  assert.equal(filterRetiredRaceObject(body, runtime), 0);
  assert.equal(memory.readUInt16LE(0x902bc4), 0); assert.equal(memory.readUInt16LE(body + 0x16a), 0);
  assert.equal(memory.readInt32LE(0x82e900), 3); assert.ok(memory.readUInt32LE(0x6e65c0)); assert.ok(memory.readInt32LE(0x902b88));
});

test('effect swap-removal preserves the native absent-body one-past write', () => {
  const {memory, runtime} = createRaceObjectCollisionFixture(program);
  removeRaceObjectEffect(0x77777, runtime);
  assert.equal(memory.readInt32LE(0x82e900), 2); assert.equal(memory.readUInt32LE(0x82e898), memory.readUInt32LE(0x82e890));
});

test('group update skips zero counts and does not consume non-adjacent duplicates', () => {
  const f = createRaceObjectCollisionFixture(program), {memory, body, runtime, put, fixtureAddresses: a} = f;
  memory[a.groups + 15] = 0; put(0x6f96a0, body + 0x10000);
  decrementAuthoredRaceObjectGroups(body, runtime);
  assert.deepEqual([0, 1, 2, 3].map(i => memory[a.groups + i * 12 + 3]), [1, 0, 3, 4]);
});

test('filter registry requires shared event/body views and publishes the real cdecl arguments', () => {
  const {memory, bodies, views, runtime, body} = createRaceObjectCollisionFixture(program);
  const filters = createRaceObjectCollisionFilters(runtime), event = views.eventAt(0x50000);
  assert.deepEqual([...filters.keys()], [0x40fcb0, 0x40fdb0, 0x40fe30, 0x46e4e0, 0x46e470]);
  assert.throws(() => filters.get(0x40fcb0)({address: body, bytes: Buffer.alloc(0x180)}, null, event), /coherent/);
  assert.equal(filters.get(0x40fcb0)(bodies[0], null, event), 0);
  assert.equal(memory.readUInt32LE(runtime.scratchBase + 4), body); assert.equal(memory.readUInt32LE(runtime.scratchBase + 12), event.address);
});
