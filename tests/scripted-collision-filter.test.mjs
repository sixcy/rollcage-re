import test from 'node:test';
import assert from 'node:assert/strict';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
import {filterScriptedCollision, createScriptedCollisionFilter} from '../src/scripted-collision-filter.mjs';
import {releaseRawScriptedBody} from '../src/raw-scripted-motion.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {filterCollisionEvent} from '../src/collision-events.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
function fixture(freeCount = 16) {
  const f = createRawScriptFixture({freeCount}), {memory, body} = f, event = 0x70000;
  put(memory, body + 0x68, 65536); put(memory, body + 0x70, -65536);
  for (const [index, offset] of [0x2c, 0x30, 0x34].entries()) put(memory, event + offset, (index + 1) * 256);
  for (const offset of [0x5c, 0x60, 0x64]) put(memory, event + offset, 0);
  put(memory, 0x5ec958, 1); return {...f, event};
}

test('other-body acceptance returns without dereferencing an event or sampling RNG', () => {
  const f = fixture(); assert.equal(filterScriptedCollision(f.body, f.body, 0xffffffff, f), 1); assert.equal(f.memory.readInt32LE(0x5ec958), 1);
});

test('unsigned impulse threshold admits INT_MIN while smaller magnitudes leave RNG untouched', () => {
  const f = fixture(); put(f.memory, f.event + 0x64, 0x2ffff); filterScriptedCollision(f.body, 0, f.event, f); assert.equal(f.memory.readInt32LE(0x5ec958), 1);
  put(f.memory, f.event + 0x64, -2147483648); filterScriptedCollision(f.body, 0, f.event, f); assert.notEqual(f.memory.readInt32LE(0x5ec958), 1); assert.equal(f.memory.readUInt32LE(0x902b88), 1);
});

test('actual type22 debris promotes the contact point and claims the shared pool', () => {
  const f = fixture(); put(f.memory, f.event + 0x5c, 0x30000); filterScriptedCollision(f.body, 0, f.event, f);
  const p = f.addresses.debris + 15 * 128; assert.equal(f.memory.readInt32LE(0x902b8c), 14); assert.equal(f.memory.readUInt32LE(0x902b88), 1);
  assert.deepEqual([0x4c, 0x50, 0x54].map(offset => f.memory.readInt32LE(p + offset)), [65536, 131072, 196608]);
  assert.equal(f.memory.readUInt16LE(p + 8), 13); assert.equal(f.memory.readUInt32LE(p + 0x30), 0x4fffff); assert.equal(f.memory[p + 0x6c], 1);
});

test('exhaustion still consumes the filter and debris RNG samples', () => {
  const f = fixture(0); put(f.memory, f.event + 0x5c, 0x30000); filterScriptedCollision(f.body, 0, f.event, f);
  let seed = 1; for (let index = 0; index < 4; index++) seed = Math.imul(seed, 0x41a7) & 0x7fffffff;
  assert.equal(f.memory.readInt32LE(0x5ec958), seed); assert.equal(f.memory.readUInt32LE(0x902b88), 0);
});

test('release-installed native pointer resolves to the actual callback through coherent physics views', () => {
  const f = fixture(), {memory, body, event} = f;
  put(memory, body + 0x34, 65536); put(memory, body + 0x38, -65536); put(memory, body + 0x3c, 131072); put(memory, body + 0x118, 0);
  releaseRawScriptedBody(body, f); assert.equal(memory.readUInt32LE(body + 0x148), 0x46e470);
  put(memory, 0x5ec958, 1); put(memory, event + 0x5c, 0x30000);
  const collisionFilters = new Map([[0x46e470, createScriptedCollisionFilter({...f, scratchBase: 0x9000 - 28})]]);
  const views = createPhysicsRuntimeViews({memory, bodyStorage: [{address: body, length: 0x800}], bodyLists: [], collisionFilters}), record = views.eventAt(event);
  record.object1 = views.bodyAt(body); record.object2 = null; const before = memory.readUInt32LE(0x902b88);
  assert.equal(filterCollisionEvent(record, 65536), 65536); assert.equal(record.object1, views.bodyAt(body)); assert.equal(memory.readUInt32LE(0x902b88), before + 1);
  const foreign = {...record, bytes: Buffer.alloc(104)}; assert.throws(() => collisionFilters.get(0x46e470)(record.object1, null, foreign), /sharing/);
});
