import test from 'node:test';
import assert from 'node:assert/strict';
import {activateHomingProjectile, activateGroundProjectile, activateSatelliteProjectiles, writeProjectileLaunchPacket, initializeProjectileLaunchTables} from '../src/projectile-launch.mjs';
import {initializeProjectilePools, initializeProjectileConstructionTables} from '../src/projectile-construction.mjs';
import {initializeWormholeVisualTables} from '../src/wormhole-visuals.mjs';
import {createVehicleConstructionFixture} from '../tools/lib/vehicle-construction-fixtures.mjs';
function fixture() {const f = createVehicleConstructionFixture({initializeMemory: m => m}), m = f.memory; initializeProjectileConstructionTables(m); initializeWormholeVisualTables(m); initializeProjectileLaunchTables(m); f.runtime.roundingMode = 'nearest-even'; m.writeFloatLE(1, 0x5dc774); m.writeFloatLE(4096, 0x5dca88); initializeProjectilePools(f.runtime); const owner = 0x120000; m.writeUInt32LE(owner, 0x909300); m.writeInt32LE(32, owner + 0xac); for (let j = 0; j < 9; j++) m.writeUInt16LE(j % 4 ? 0 : 4096, owner + 0xc4 + j * 2); return {...f, owner};}
test('homing activation publishes actual state,shapes,queued body identity and packet type', () => {
  const f = fixture(), m = f.memory; assert.equal(activateHomingProjectile(0x909300, 1, 0, 0, 0, f.runtime), 1); const body = m.readUInt32LE(0x9034a0); assert.equal(m.readInt32LE(body + 0x188), 1); assert.equal(m.readInt32LE(body + 0x180), 10); assert.equal(m.readUInt32LE(body + 0x194), f.owner); assert.equal(m[body + 0x10c], 1); assert.equal(m.readUInt16LE(body + 0x18c), 0); assert.equal(m[body + 0x18e], 1); assert.equal(m.readUInt32LE(0x8106e0 + 24), body); assert.equal(m[0x9000 - 152 + 0x30 + 0x57], 1); assert.equal(m[0x903500], 1);
});
test('pool exhaustion leaves every public byte untouched', () => {
  const f = fixture(), m = f.memory; for (let j = 0; j < 4; j++) m.writeInt32LE(1, m.readUInt32LE(0x9034a0 + j * 4) + 0x188); const before = Buffer.from(m.subarray(0x10000)); assert.equal(activateHomingProjectile(0x909300, 1, 0, 0, 0, f.runtime), 0); assert.deepEqual(m.subarray(0x10000), before);
});
test('packet block copies retain native overlap between the two matrix chunks', () => {
  const m = Buffer.alloc(0xa00000), owner = 0x20000, packet = owner + 0xc4 - 12 + 8; for (let i = 0; i < 32; i++) m[owner + 0xc4 + i] = i + 1; writeProjectileLaunchPacket(owner, packet, {memory: m}); assert.deepEqual([...m.subarray(packet + 28, packet + 36)], [9, 10, 11, 12, 13, 14, 15, 16]);
});

test('ground launch produces its route fields, clears flag1000 and increments byte counter', () => {
  const f=fixture(),m=f.memory,a=f.addresses,record=0x909300; m.writeUInt32LE(a.groups,record+0x54);m.writeUInt16LE(1,record+0x58);m[record+0x1d]=1;m[a.session+0x54d]=1;m.writeUInt32LE(0x98000,a.pack+0x94);
  assert.equal(activateGroundProjectile(record,1,0,0,0,f.runtime),1);const body=m.readUInt32LE(0x9034f8);assert.equal(m.readInt32LE(body+0x188),1);assert.equal(m.readUInt32LE(body+0x194),f.owner);assert.equal(m.readUInt32LE(body+0x6cc),a.groups);assert.equal(m.readInt16LE(body+0x6d2),1);assert.equal(m.readUInt32LE(body)&0x1000,0);assert.equal(m[0x903502],1);
});

test('satellite launch preserves the second child direction instead of copying the first', () => {
  const f=fixture(),m=f.memory,master=m.readUInt32LE(0x903480),second=m.readUInt32LE(master+0x188);for(let j=0;j<3;j++)m.writeInt32LE(123+j*111,second+0x1a8+j*4);
  assert.equal(activateSatelliteProjectiles(0x909300,1,0,0,0,f.runtime),1);assert.deepEqual([0,4,8].map(o=>m.readInt32LE(second+0x1a8+o)),[123,234,345]);assert.equal(m.readInt32LE(master+0x194),1);assert.equal(m.readInt32LE(master+0x198),10);assert.equal(m[0x903501],1);assert.equal(m.readUInt32LE(0x810920),3);assert.equal(m[0x9000-152+0x87],2);
});
