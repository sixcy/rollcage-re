import test from 'node:test';
import assert from 'node:assert/strict';
import {applyProjectileVehicleImpact, filterGroundProjectileCollision, filterHomingProjectileCollision, filterSatelliteMasterCollision} from '../src/projectile-collisions.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';

function fixture() {
  const f = createRawScriptFixture(), m = f.memory, body = 0x20000, other = 0x24000, owner = 0x28000, event = 0x2c000;
  const put = (p, v) => m.writeInt32LE(v | 0, p), read = p => m.readInt32LE(p);
  put(body + 12, f.addresses.bucket); m.writeUInt16LE(1, f.addresses.bucket + 8); m[body + 0x10c] = 255;
  put(0x902bc0, 0x30000); m.writeUInt16LE(1, 0x902bc4); put(0x30000, body); put(body + 0x5c0, 127); put(body + 0x194, owner); put(body + 0x184, 2);
  put(other, 7); put(owner, 0x40000);
  return {...f, body, other, owner, event, put, read};
}

test('nonvehicle impact leaves RNG, momentum and event scratch untouched', () => {
  const f = fixture(), before = Buffer.from(f.memory); applyProjectileVehicleImpact(f.other, f.event, f); assert.deepEqual(f.memory, before);
});

test('homing detonation marks a nonvehicle contact owner and retires the projectile', () => {
  const f = fixture(); filterHomingProjectileCollision(f.body, f.other, f.event, f);
  assert.equal(f.read(f.owner), 0x60000); assert.equal(f.read(f.body + 0x188), 16); assert.equal(f.memory.readUInt16LE(0x902bc4), 0); assert.equal(f.memory.readUInt16LE(f.addresses.bucket + 8), 0);
});

test('ground detonation leaves owner flags intact for a nonvehicle contact', () => {
  const f = fixture(); filterGroundProjectileCollision(f.body, f.other, f.event, f);
  assert.equal(f.read(f.owner), 0x40000); assert.equal(f.read(f.body + 0x188), 16);
});

test('satellite master suppresses either of its two remembered identities', () => {
  for (const offset of [0x1b0, 0x1b4]) {
    const f = fixture(); f.put(f.body + 0x180, f.owner); f.put(f.body + offset, f.other); f.put(f.body + 0x194, 2);
    filterSatelliteMasterCollision(f.body, f.other, f.event, f);
    assert.equal(f.read(f.owner), 0x40000); assert.equal(f.read(f.body + 0x194), 2); assert.equal(f.read(f.body + offset), f.other);
  }
});

test('new satellite-master contact shifts history and marks owner without retiring', () => {
  const f = fixture(); f.put(f.body + 0x180, f.owner); f.put(f.body + 0x194, 2); f.put(f.body + 0x1b0, 0x34567);
  filterSatelliteMasterCollision(f.body, f.other, f.event, f);
  assert.equal(f.read(f.body + 0x1b4), 0x34567); assert.equal(f.read(f.body + 0x1b0), f.other); assert.equal(f.read(f.owner), 0x60000); assert.equal(f.read(f.body + 0x194), 2); assert.equal(f.memory.readUInt16LE(0x902bc4), 1);
});

test('satellite master ignores world event minus-four without teardown', () => {
  const f = fixture(); f.put(f.body + 0x194, 2); f.put(f.event + 0x44, -4); filterSatelliteMasterCollision(f.body, 0, f.event, f);
  assert.equal(f.read(f.body + 0x194), 2); assert.equal(f.memory.readUInt16LE(0x902bc4), 1); assert.equal(f.memory.readUInt16LE(f.addresses.bucket + 8), 1);
});
