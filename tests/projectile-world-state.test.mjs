import test from 'node:test';
import assert from 'node:assert/strict';
import {updateActiveProjectiles} from '../src/projectile-world-state.mjs';
function fixture() {const memory = Buffer.alloc(0xa00000); for (let i = 0; i < 24; i++) memory.writeUInt32LE(0x20000 + i * 0x1000, 0x9034a0 + i * 4); return {memory, scratchBase: 0x9000};}
test('the fixed dispatcher includes slot23 and lowers active unknown kinds', () => {
  const f = fixture(), m = f.memory, b = m.readUInt32LE(0x9034fc); m.writeInt32LE(3, b + 0x184); m.writeInt32LE(4, b + 0x188); m[b + 0x18e] = 1; m.writeUInt16LE(5, b + 0x1c2); updateActiveProjectiles(f); assert.equal(m.readUInt16LE(b + 0x1c2), 3); assert.equal(m.readInt32LE(b + 0x188), 4);
});
test('lowering still runs on the captured body after its tick deactivates it', () => {
  const f = fixture(), m = f.memory, b = m.readUInt32LE(0x9034a0); m.writeInt32LE(16, b + 0x188); m[b + 0x18e] = 1; m.writeUInt16LE(5, b + 0x1c2); m.writeInt32LE(1, 0x90a548); updateActiveProjectiles(f); assert.equal(m.readInt32LE(b + 0x188), 0); assert.equal(m.readUInt16LE(b + 0x1c2), 3);
});
