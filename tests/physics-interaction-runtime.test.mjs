import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhysicsInteractionRuntime} from '../src/physics-interaction-runtime.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {applyBodyEffectImpulse} from '../src/body-effect-impulse.mjs';
import {applyBodyEffectDamping} from '../src/body-effect-damping.mjs';
import {updateWorldEffectRecords} from '../src/world-effect-records.mjs';

const BODY = 0x10000;
function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (address, value) => memory.writeInt32LE(value | 0, address);
  const interactions = createPhysicsInteractionRuntime({memory});
  const views = createPhysicsRuntimeViews({memory, bodyStorage: [{address: BODY, length: 0x4000}], bodyLists: []});
  const body = interactions.bindBody(views.bodyAt(BODY));
  put(BODY, 3); put(BODY + 0x6bc, -1);
  return {memory, put, interactions, body};
}

test('live impulse globals and vehicle cache writes share the physical body identity', () => {
  const {memory, put, interactions, body} = fixture();
  body.position = [4 * 65536, 0, 0];
  put(0x91cd80, 0); put(0x91cd8c, 4);
  assert.equal(interactions.bindBody(body), body);
  applyBodyEffectImpulse(body, {...interactions.bodyEffectImpulse, roundingMode: 'nearest-even'});
  assert.deepEqual(body.force.slice(), [65536, 0, 0]);
  assert.equal(memory[BODY + 0x66f], 32);
  assert.equal(memory.readUInt16LE(BODY + 0x6b8), 16);
  assert.equal(memory.readUInt16LE(BODY + 0x6ba), 256);
  assert.deepEqual(body.effectDirection680.slice(), [65536, 0, 0]);
  assert.equal(memory.readInt32LE(0x91d460), interactions.bodyEffectImpulse.directionScratch.leadingZeros91d460);
  body.force = [0, 0, 0]; put(0x91cd80, 8 * 65536);
  applyBodyEffectImpulse(body, interactions.bodyEffectImpulse);
  assert.deepEqual(body.force.slice(), [-65536, 0, 0]);
});

test('direction reduction mutates native lanes and fallback retains the original cache', () => {
  const {memory, put, interactions, body} = fixture();
  body.position = [-1, -2, -3]; body.effectFallback674 = [9, 8, 7]; put(0x91cd8c, 32);
  applyBodyEffectImpulse(body, interactions.bodyEffectImpulse);
  assert.deepEqual(body.effectDirection680.slice(), [9, 8, 7]);
  assert.equal(memory.readInt32LE(0x91d45c), 0);
  assert.equal(memory.readInt32LE(0x91d460), 32);
  assert.equal(memory.readUInt16LE(BODY + 0x6ba), 6144);
});

test('damping writes all six live output globals and respects changing time state', () => {
  const {put, memory, interactions, body} = fixture();
  body.position = [65536, -2 * 65536, 3 * 65536];
  body.linearVelocity = [101, -101, 256]; body.momentum = [301, -301, 512];
  body.position.forEach((value, axis) => put(0x9153f0 + axis * 4, value));
  applyBodyEffectDamping(body, interactions.bodyEffectDamping);
  assert.deepEqual(body.linearVelocity.slice(), [50, -51, 128]);
  assert.deepEqual(body.momentum.slice(), [150, -151, 256]);
  assert.deepEqual([0x60, 0x64, 0x68, 0x6c, 0x70, 0x74].map(offset => memory.readInt32LE(0x91cd00 + offset)), [1, 31, 2, 65536, -131072, 196608]);
  memory.fill(0x23, 0x91cd60, 0x91cd78); const before = Buffer.from(memory.subarray(0x91cd60, 0x91cd78));
  put(0x811180, -1); applyBodyEffectDamping(body, interactions.bodyEffectDamping);
  assert.deepEqual(memory.subarray(0x91cd60, 0x91cd78), before);
});

test('pending model rows follow the live count and signed high-word effect origin', () => {
  const {put, memory, interactions} = fixture(), state = interactions.worldEffectState;
  put(0x91cd80, -65536); put(0x91cd84, 2 * 65536); put(0x91cd88, -3 * 65536); put(0x91cd8c, 4);
  assert.equal(state.records.length, 0);
  put(0x9207e4, 1); [-1, 2, -3].forEach((value, axis) => memory.writeInt16LE(value, 0x920800 + axis * 2)); memory[0x920806] = 10;
  assert.deepEqual(state.originS16, [-1, 2, -3]);
  assert.equal(updateWorldEffectRecords(state.records, {...state, effectFlag: 1}), 1);
  assert.equal(memory[0x920806], 0);
  put(0x9207e4, 2); assert.equal(state.records.length, 32);
  put(0x9207e4, 51); assert.throws(() => state.records, /exceed/);
  put(0x9207e4, 0xffffffff); assert.throws(() => state.records, /exceed/);
});

test('active vehicle effects remain an explicit reached contract', () => {
  const {put, interactions, body} = fixture();
  body.position = [4 * 65536, 0, 0]; put(0x91cd8c, 4); put(BODY + 0x6bc, 0x20000);
  // This controller is separate from body bytes; an active byte must not be
  // interpreted as an inert shield or an ordinary physical impulse.
  body.pairCollisionContext.stateByte6bc = 1;
  assert.throws(() => applyBodyEffectImpulse(body, {...interactions.bodyEffectImpulse, roundingMode: 'nearest-even'}), /active vehicle handler/);
  let seen;
  applyBodyEffectImpulse(body, {...interactions.bodyEffectImpulse, roundingMode: 'nearest-even', handlers: {onActiveVehicleEffect: event => {seen = event;}}});
  assert.equal(seen.body, body); assert.deepEqual(seen.directionQ8, [256, 0, 0]); assert.equal(seen.effectCode, 0x70);
  assert.deepEqual(body.force.slice(), [0, 0, 0]);
});

test('interaction adapters reject detached bodies and conflicting field ownership', () => {
  assert.throws(() => createPhysicsInteractionRuntime({memory: Buffer.alloc(32)}), /global storage/);
  const {interactions, body, memory} = fixture();
  assert.throws(() => interactions.bindBody({address: BODY, bytes: Buffer.alloc(0x4000)}), /alias/);
  assert.throws(() => interactions.bindBody({address: BODY, bytes: memory.subarray(BODY, BODY + 0x4000), effectCounter6b8: 1}), /another owner/);
  assert.throws(() => {body.effectDirection680[3] = 1;}, /three fixed/);
});
