import test from 'node:test';
import assert from 'node:assert/strict';
import * as animation from '../src/vehicle-auxiliary-animation.mjs';
import {populateRawVehicleTrackBasis} from '../src/raw-track-basis.mjs';
import {createAuxiliaryAnimationFixture, auxiliaryAnimationAddresses as a, verifyVehicleAuxiliaryAnimation} from '../tools/verify-vehicle-auxiliary-animation-instructions.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p), store = (m, p, v) => v.forEach((x, i) => put(m, p + i * 4, x));
const vector = (m, p) => [0, 4, 8].map(o => m.readInt32LE(p + o));

test('controls retain two-step short smoothing, held masks, transition direction and HUD mirrors', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  put(m, 0x91ff80, 0); m[a.session + 0x58c] = 0; m[a.control + 0x39] = 0xc0; m[a.control + 0x3b] = 0xc0; word(m, a.control + 0x40, 0); word(m, a.control + 0x42, 5); word(m, a.control + 0x4a, -1);
  animation.updateAuxiliaryAnimationControls(a.control, 2, 0x34000, runtime);
  assert.equal(m[a.control + 0x39], 0xc1); assert.equal(m[a.control + 0x3b], 0xc0); assert.equal(m.readInt16LE(a.control + 0x40), 4); assert.equal(m.readInt16LE(a.control + 0x42), 5); assert.equal(m.readInt16LE(a.control + 0x48), -1);
  assert.equal(m[a.session + 0xa90], 1); assert.equal(m[a.session + 0xa92], 8);
  animation.updateAuxiliaryAnimationControls(a.control, 1, 0, runtime); assert.equal(m[a.control + 0x39] & 3, 0); assert.equal(m.readInt16LE(a.control + 0x48), 1);
});

test('locked controls still clamp phase3 while preserving unrelated flags', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  put(m, 0x91ff80, 14); m[a.control + 0x39] = 0xb7;
  animation.updateAuxiliaryAnimationControls(a.control, 3, 0, runtime);
  assert.equal(m[a.control + 0x39], 0xb6); assert.equal(m.readInt16LE(a.control + 0x3c), 110); assert.equal(m.readInt16LE(a.control + 0x3e), 40);
});

test('opposite direction fallback preserves output for stationary bodies and uses half-velocity cross', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  store(m, a.first, [0, 65536, 0]); store(m, a.second, [0, -65536, 0]); store(m, a.body + 0x68, [0, 0, 0]); const before = Buffer.from(m.subarray(a.output, a.output + 12)), seed = m.readInt32LE(0x5ec954);
  animation.mixAnimationDirections(a.output, a.first, a.second, 15, 1, a.body, runtime);
  assert.deepEqual(m.subarray(a.output, a.output + 12), before); assert.equal(m.readInt32LE(0x5ec954), seed);
  store(m, a.body + 0x68, [0x2000000, 0, 0]); animation.mixAntipodalAnimationDirection(a.output, a.first, a.body, runtime);
  assert.deepEqual(vector(m, a.output), [0, 65536, 32768]);
});

test('contact acquisition requires four contributors and records their count before returning', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  for (let index = 0; index < 4; index++) m[a.body + 0x324 + index * 200] = index < 3 ? 1 : 0;
  m[a.control + 0x38] = 254; const before = Buffer.from(m.subarray(a.output, a.output + 32));
  assert.equal(animation.blendAuxiliaryAnimationContacts(a.control, a.body, a.first, a.output, a.output + 16, runtime), 0);
  assert.equal(m[a.control + 0x39] & 0x38, 24); assert.equal(m[a.control + 0x38], 255); assert.deepEqual(m.subarray(a.output, a.output + 32), before);
  m[a.body + 0x324 + 3 * 200] = 1;
  assert.equal(animation.blendAuxiliaryAnimationContacts(a.control, a.body, a.first, a.output, a.output + 16, runtime), 1);
  assert.equal(m[a.control + 0x38], 0); assert.deepEqual(vector(m, a.output + 16), [0, 65536, 0]);
});

test('motion gate retains its delay after falling below the lower threshold', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  m[a.control + 0x39] &= 127; store(m, a.first, [0x1000000, 0, 0]); animation.updateAnimationMotionGate(a.control, a.first, runtime);
  assert.equal(m[a.control + 0x3a], 20); assert.ok(m[a.control + 0x39] & 128); assert.ok(m.readInt32LE(a.object) & 512);
  store(m, a.first, [0, 0, 0]); for (let index = 0; index < 20; index++) animation.updateAnimationMotionGate(a.control, a.first, runtime);
  assert.equal(m[a.control + 0x3a], 0); assert.ok(m[a.control + 0x39] & 128);
  animation.updateAnimationMotionGate(a.control, a.first, runtime); assert.equal(m[a.control + 0x39] & 128, 0); assert.equal(m.readInt32LE(a.object) & 512, 0);
});

test('matrix publication normalizes on failure but preserves the destination until both thresholds pass', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  store(m, a.first, [0, 0, 131072]); store(m, a.second, [0, 0, 65536]); const before = Buffer.from(m.subarray(a.output, a.output + 18));
  assert.equal(animation.publishAnimationMatrix(a.first, a.second, a.output, runtime), 0); assert.deepEqual(vector(m, a.first), [0, 0, 65536]); assert.deepEqual(m.subarray(a.output, a.output + 18), before);
  store(m, a.second, [0, 65536, 0]); assert.equal(animation.publishAnimationMatrix(a.first, a.second, a.output, runtime), 1);
  assert.deepEqual(Array.from({length: 9}, (_, index) => m.readInt16LE(a.output + index * 2)), [-4096, 0, 0, 0, -4096, 0, 0, 0, 4096]);
});

test('quaternion-vector helper uses actual Hamilton product order', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  store(m, a.first, [0, 65536, 0]); put(m, a.first + 12, 0); store(m, a.second, [12345, -23456, 34567]);
  animation.rotateAnimationVector(a.first, a.second, runtime); assert.deepEqual(vector(m, a.second), [12345, 23456, -34567]);
});

test('raw track basis preserves stale outputs for negative references and supports overlapping outputs', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  put(m, a.body + 0x11c, -1); const before = Buffer.from(m.subarray(a.output, a.output + 32));
  assert.equal(populateRawVehicleTrackBasis(a.body, a.output, a.output + 4, runtime), 0); assert.deepEqual(m.subarray(a.output, a.output + 32), before);
  put(m, a.body + 0x11c, 0x10100); m[a.session + 0x579] = 0;
  assert.equal(populateRawVehicleTrackBasis(a.body, a.output, a.output + 4, runtime), 1); assert.deepEqual(vector(m, a.output + 4), [0, 65536, 0]);
});

test('parent early acquisition failure still clears exact auxiliary dynamics and advances its bounded timer', () => {
  const runtime = createAuxiliaryAnimationFixture(1), {memory: m} = runtime;
  for (let index = 0; index < 4; index++) m[a.body + 0x324 + index * 200] = 0;
  m[a.control + 0x39] = 0; m[a.control + 0x3b] = 0; put(m, a.body + 0x714, 0); word(m, a.control + 0x48, 1); word(m, a.control + 0x4a, 7); put(m, a.object + 0x40, 123);
  const rotation = Buffer.from(m.subarray(a.object + 0xc4, a.object + 0xd6)); animation.updateVehicleAuxiliaryAnimation(a.record, runtime);
  for (const offset of [0x4c, 0x50, 0x54, 0x58, 0x5c, 0x60, 0x64, 0x80, 0x84, 0x88, 0x8c, 0x90, 0x94, 0x98, 0xb8, 0xbc, 0xc0]) assert.equal(m.readInt32LE(a.object + offset), 0, offset.toString(16));
  assert.equal(m.readInt32LE(a.object + 0x40), 123); assert.deepEqual(m.subarray(a.object + 0xc4, a.object + 0xd6), rotation); assert.equal(m.readUInt32LE(a.control + 0x48), 0x80000);
});

test('complete animation graph, persistent parent ticks and raw basis agree with native instructions', async () => {
  const report = await verifyVehicleAuxiliaryAnimation({fixtures: 64, persistentScenarios: 8, basisFixtures: 24, output: null});
  assert.equal(report.matched, true); assert.deepEqual(report.externalCalls, []); assert.equal(report.ownInstructions, 1402); assert.equal(report.rawBasisInstructions, 262);
  for (const entry of ['416400', '416510', '416da0', '417210', '416620', '4166d0', '4167f0']) assert.ok(report.actualGameCalls[entry] > 0, entry);
});
