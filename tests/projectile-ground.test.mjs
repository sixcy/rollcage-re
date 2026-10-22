import test from 'node:test';
import assert from 'node:assert/strict';
import {updateGroundProjectile} from '../src/projectile-ground.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
test('inactive ground projectile retains all public fields', () => {
  const f = createRawScriptFixture(), b = 0x20000; f.memory.fill(0x69, b, b + 0x800); f.memory.writeInt32LE(0, b + 0x188); const before = Buffer.from(f.memory.subarray(b, b + 0x800)); updateGroundProjectile(b, f); assert.deepEqual(f.memory.subarray(b, b + 0x800), before);
});
test('ground trail retirement wraps its count counter without touching projectile age', () => {
  const f = createRawScriptFixture(), b = 0x20000, m = f.memory; m.writeInt32LE(16, b + 0x188); m.writeInt32LE(77, b + 0x180); m[b + 0x18e] = 2; m.writeUInt16LE(31, b + 0x18c); m.writeInt32LE(0, 0x90a548); m[0x903502] = 0; updateGroundProjectile(b, f); assert.equal(m.readInt32LE(b + 0x188), 0); assert.equal(m.readInt32LE(b + 0x180), 77); assert.equal(m.readUInt16LE(b + 0x18c), 0); assert.equal(m[0x903502], 255);
});
