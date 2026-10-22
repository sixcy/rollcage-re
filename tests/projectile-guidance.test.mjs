import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRawFloatVector, normalizeRawFixedVector} from '../src/raw-vector-normalization.mjs';
import {updateProjectileHoming, computeProjectileRouteVector, updateProjectileRouteMotion} from '../src/projectile-guidance.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
const fixture = () => {const f = createRawScriptFixture(), m = f.memory; return {...f, put: (p, v) => m.writeInt32LE(v | 0, p), read: p => m.readInt32LE(p)};};

test('raw float normalizer returns the reduction shift and changes its input', () => {
  const f = fixture(), p = 0x20000, out = 0x21000; f.put(p, 0x800000); f.put(p + 4, 0); f.put(p + 8, 0);
  assert.equal(normalizeRawFloatVector(p, out, f), 10); assert.equal(f.read(p), 8192); assert.deepEqual([0, 4, 8].map(o => f.read(out + o)), [4096, 0, 0]);
});
test('zero float normalization preserves masked invalid FISTP outputs', () => {
  const f = fixture(), p = 0x20000; normalizeRawFloatVector(p, p, f);
  assert.deepEqual([0, 4, 8].map(o => f.read(p + o)), [-2147483648, -2147483648, -2147483648]); assert.equal(f.read(0x91d460), 32);
});
test('fixed normalizer retains native division fault for zero vector', () => {
  const f = fixture(); assert.throws(() => normalizeRawFixedVector(0x20000, f), /division by zero/);
});
test('homing transitions state2 only below the reduction-shift threshold', () => {
  for (const [distance, state, expectedMomentum] of [[0x7fffff, 32, 262144], [0x800000, 2, 278528]]) {
    const f = fixture(), b = 0x20000; f.put(b + 0x188, 2); f.put(b + 0x19c, distance); f.put(b + 0x40, 0x20000);
    updateProjectileHoming(b, f); assert.equal(f.read(b + 0x188), state); assert.equal(f.read(b + 0x40), expectedMomentum); assert.equal(f.read(b + 0x1a8), expectedMomentum);
    if (state === 32) assert.equal(f.read(b + 0x180), 16);
  }
});
test('homing copies a live target and lowers type3 target height', () => {
  const f = fixture(), b = 0x20000, target = 0x21000; f.put(b + 0x198, target); f.put(target, 3); f.put(target + 0x34, 200); f.put(target + 0x38, 300); f.put(target + 0x3c, 400);
  updateProjectileHoming(b, f); assert.deepEqual([0, 4, 8].map(o => f.read(b + 0x19c + o)), [200, 300 - 0x200000, 400]);
});
test('route-vector output alias changes the later packed XY read', () => {
  const f = fixture(), p = 0x20000, position = 0x21000; f.memory.writeInt16LE(10, p); f.memory.writeInt16LE(20, p + 2); f.memory.writeInt16LE(30, p + 4); f.put(p + 8, 1 << 20); f.put(p + 12, 1 << 28);
  computeProjectileRouteVector(p, position, p + 8, 1, f);
  assert.deepEqual([0, 4, 8].map(o => f.read(p + 8 + o)), [10, 20, 58]);
});
test('route motion without authored curvature uses seven-eighths damping and a real orientation tail', () => {
  const f = fixture(), b = 0x20000, direction = 0x21000; f.put(direction, 65536); f.put(b + 0x40, 65536);
  updateProjectileRouteMotion(b, direction, 0, 0, f); assert.equal(f.read(b + 0x40), 155648); assert.equal(f.memory.readInt16LE(b + 0xc8), 4096); assert.equal(f.read(direction), 4096);
});
