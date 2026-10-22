import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeProjectilePools, initializeProjectileConstructionTables, initializeProjectileState, initializeProjectileMaterialRecords} from '../src/projectile-construction.mjs';
import {createVehicleConstructionFixture} from '../tools/lib/vehicle-construction-fixtures.mjs';
import {initializeWormholeVisualTables} from '../src/wormhole-visuals.mjs';
function fixture(index = 0) {const f = createVehicleConstructionFixture({initializeMemory: m => m}, index); initializeProjectileConstructionTables(f.memory); initializeWormholeVisualTables(f.memory); f.runtime.roundingMode = 'nearest-even'; return f;}
test('pool construction publishes24 projectile slots and six distinct three-satellite masters', () => {
  const f = fixture(), m = f.memory; initializeProjectilePools(f.runtime); const pointers = Array.from({length: 24}, (_, i) => m.readUInt32LE(0x9034a0 + i * 4)); assert.equal(new Set(pointers).size, 24);
  for (let i = 0; i < 6; i++) {const master = m.readUInt32LE(0x903480 + i * 4); for (let j = 0; j < 3; j++) {const body = pointers[4 + i * 3 + j]; assert.equal(m.readUInt32LE(master + 0x184 + j * 4), body); assert.equal(m.readUInt32LE(body + 0x194), master);} assert.equal(m.readInt32LE(master + 0x190), -1);}
  assert.equal(m.readInt32LE(0x903500), 0); assert.equal(m.readInt32LE(m.readUInt32LE(0x80b5e0) + 0x184), 7);
});
test('registry cap preserves nativeFF object indexes for later objects', () => {
  const f = fixture(), m = f.memory; m.writeInt32LE(511, 0x6e6b44); initializeProjectilePools(f.runtime); assert.equal(m.readInt32LE(0x6e6b44), 512); assert.equal(m.readUInt16LE(m.readUInt32LE(0x9034a0) + 0x10e), 511); assert.equal(m.readUInt16LE(m.readUInt32LE(0x9034a4) + 0x10e), 65535);
});
test('common projectile state retains bytes outside its explicit writes and narrows index', () => {
  const f = fixture(), m = f.memory, b = f.addresses.body; m.fill(0x69, b, b + 0x800); m.writeInt32LE(2, b + 0x184); initializeProjectileState(b, 257, f.runtime); assert.equal(m[b + 0x18f], 1); assert.equal(m.readUInt16LE(b + 0x190), 88); assert.equal(m.readUInt16LE(b + 0x192), 0x6969); assert.equal(m.readUInt16LE(b + 0x18c), 0x6969); assert.equal(m.readInt32LE(b + 0x5c0), 127);
});
test('material reset reads authored payload and preserves nonwritten primitive fields', () => {
  const f = fixture(), m = f.memory, b = f.addresses.body; m.fill(0x69, b, b + 0x800); const material = f.addresses.materials + 63 * 16; initializeProjectileMaterialRecords(b, f.runtime); assert.equal(m.readInt32LE(b + 0x5e4), m.readInt32LE(material)); assert.equal(m.readUInt16LE(b + 0x6b0), m.readUInt16LE(material + 10)); assert.equal(m[b + 0x5c7], 12); assert.equal(m[b + 0x5cb], 0x9a); assert.equal(m[b + 0x5c6], 0x69);
});
