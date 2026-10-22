import test from 'node:test';
import assert from 'node:assert/strict';
import {updateProjectileImpulse, explodeProjectile, updateHomingProjectile} from '../src/projectile-flight.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
function fixture() {const f = createRawScriptFixture(), m = f.memory, body = 0x20000; return {...f, body, put: (p, v) => m.writeInt32LE(v | 0, p), word: (p, v) => m.writeUInt16LE(v & 65535, p), read: p => m.readInt32LE(p)};}
test('zero-age impulse doubles its components without rebuilding orientation', () => {
  const f = fixture(), b = f.body; f.put(b + 0x1a8, 11); f.put(b + 0x1ac, -13); f.put(b + 0x1b0, 17); f.put(b + 0xc4, 0x12345678); updateProjectileImpulse(b, f);
  assert.deepEqual([0, 4, 8].map(o => f.read(b + 0x40 + o)), [22, -26, 34]); assert.equal(f.read(b + 0xc4), 0x12345678);
});
test('signed age and x86 masked shifts preserve negative and large ages', () => {
  for (const [age, expected] of [[-1, 256], [1, 64], [2, 32], [33, 64], [-2147483648, 0]]) {
    const f = fixture(), b = f.body; f.put(b + 0x180, age); f.put(b + 0x1a8, 64); updateProjectileImpulse(b, f); assert.equal(f.read(b + 0x40), expected, `age${age}`);
  }
});
test('orientation impulse adds authored signed-short corrections before normalization', () => {
  const f = fixture(), b = f.body; f.put(b + 0x180, 2); f.put(b + 0x1a8, 100); f.word(b + 0x1b8, -100); f.put(b + 0x1ac, 20); f.word(b + 0x1ba, 30); updateProjectileImpulse(b, f);
  assert.equal(f.read(b + 0x40), 50); assert.equal(f.read(b + 0x44), 10); assert.equal(f.read(b + 0x1a8), 0); assert.equal(f.read(b + 0x1ac), 65536);
});
test('explosion with unmatched effect mode still unlinks registries and resets sound sentinel', () => {
  const f = fixture(), b = f.body, m = f.memory; f.put(b + 12, f.addresses.bucket); f.word(f.addresses.bucket + 8, 1); m[b + 0x10c] = 255; f.put(0x902bc0, 0x30000); f.word(0x902bc4, 2); f.put(0x30000, b); f.put(0x30004, 0x21000); f.put(b + 0x5c0, 256); f.put(b + 0x184, 2);
  explodeProjectile(b, 3, f); assert.equal(f.read(b + 0x188), 16); assert.equal(f.read(b + 0x180), 0); assert.equal(f.read(b + 0x5c0), 127); assert.equal(m.readUInt16LE(f.addresses.bucket + 8), 0); assert.equal(m.readUInt16LE(0x902bc4), 1); assert.equal(f.read(0x30000), 0x21000); assert.equal(f.read(b) & 0x8000, 0x8000);
});
test('homing age150 enters timeout state8 before still applying guidance this tick', () => {
  const f = fixture(), b = f.body; f.put(b + 0x184, 1); f.put(b + 0x188, 2); f.put(b + 0x180, 149); f.put(b + 0x19c, 0x800000); updateHomingProjectile(b, f); assert.equal(f.read(b + 0x188), 8); assert.equal(f.read(b + 0x180), 150); assert.notEqual(f.read(b + 0x40), 0);
});
test('drained signed trail deactivates on an odd tick without advancing its head', () => {
  const f = fixture(), b = f.body; f.put(b + 0x188, 16); f.memory[b + 0x18e] = 1; f.word(b + 0x18c, 31); f.put(0x90a548, 1); f.memory[0x903500] = 0; updateHomingProjectile(b, f); assert.equal(f.read(b + 0x188), 0); assert.equal(f.memory.readUInt16LE(b + 0x18c), 31); assert.equal(f.memory[0x903500], 255);
});
