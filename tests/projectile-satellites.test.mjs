import test from 'node:test';
import assert from 'node:assert/strict';
import {updateSatelliteMaster, updateSatelliteProjectile} from '../src/projectile-satellites.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
function fixture() {const f = createSimulationRuntimeFixture({initializeMemory: m => m}, 0, {count: 1}), m = f.memory, master = f.bodies[0].address, satellite = 0x180000, put = (p, v) => m.writeInt32LE(v | 0, p); put(satellite + 0x194, master); m.writeUInt16LE(0, master + 0x15c); return {...f, master, satellite, put, runtime: {...f.context.nativeTerrain, scratchBase: 0x9000, roundingMode: 'nearest-even'}, read: p => m.readInt32LE(p)};}
test('master update-once gate leaves all bytes untouched for the current clock', () => {
  const f = fixture(); f.put(f.master + 0x190, f.read(0x90a548)); const before = Buffer.from(f.memory); updateSatelliteMaster(f.satellite, f.runtime); assert.deepEqual(f.memory, before);
});
test('orbit phase clears its high byte and radius clamps after signed subtraction', () => {
  const f = fixture(), b = f.master; f.put(b + 0x190, -1); f.put(b + 0x194, 2); f.memory.writeUInt16LE(255, b + 0x1a8); f.memory.writeUInt16LE(129, b + 0x1aa); f.put(b + 0x198, 4); updateSatelliteMaster(f.satellite, f.runtime); assert.equal(f.memory.readUInt16LE(b + 0x1a8), 15); assert.equal(f.memory.readUInt16LE(b + 0x1aa), 128); assert.equal(f.read(b + 0x198), 5);
});
test('a second satellite cannot advance the same master twice in one clock', () => {
  const f = fixture(), b = f.master; f.put(b + 0x190, -1); f.put(b + 0x194, 2); f.put(b + 0x198, 10); updateSatelliteMaster(f.satellite, f.runtime); f.put(f.satellite + 0x4000 + 0x194, b); updateSatelliteMaster(f.satellite + 0x4000, f.runtime); assert.equal(f.read(b + 0x198), 11);
});
test('satellite retirement clears the master only after all three become inactive', () => {
  const f = fixture(), b = f.master, m = f.memory; f.put(b + 0x190, f.read(0x90a548)); f.put(b + 0x194, 16); m[0x903501] = 2;
  for (let j = 0; j < 3; j++) {const s = f.satellite + j * 0x4000; f.put(b + 0x184 + j * 4, s); f.put(s + 0x194, b); f.put(s + 0x188, 16); m[s + 0x18e] = 1;}
  updateSatelliteProjectile(f.satellite, f.runtime); assert.equal(f.read(b + 0x194), 16); updateSatelliteProjectile(f.satellite + 0x4000, f.runtime); assert.equal(f.read(b + 0x194), 16); updateSatelliteProjectile(f.satellite + 0x8000, f.runtime); assert.equal(f.read(b + 0x194), 0); assert.equal(m[0x903501], 1);
});
