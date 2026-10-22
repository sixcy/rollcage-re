import test from 'node:test';
import assert from 'node:assert/strict';
import {checkRawPostFrameVehicles, runRawPostFrameBodyStates, runRacePostFrameStage, emitRawVehicleRespawnRing} from '../src/raw-respawn-state.mjs';
import {initializeBodyRetirementEffectTables} from '../src/body-retirement-effects.mjs';

function prepassFixture() {
  const memory = Buffer.alloc(0xa00000), body = 0x10000, session = 0x50000, sectors = 0x51000, header = 0x52000;
  memory.writeUInt32LE(session, 0x5ecb1c); memory[session + 0x54d] = 1;
  memory.writeUInt32LE(body, 0x909300); memory.writeUInt32LE(sectors, 0x909240); memory.writeUInt32LE(header, sectors);
  memory.writeInt32LE(-1, body + 0x110);
  return {memory, body, session, header};
}
test('raw prepass distinguishes slow airborne rejection from grounded reset and byte wrap', () => {
  const {memory, body} = prepassFixture();
  memory[0x909548] = 255; checkRawPostFrameVehicles({memory});
  assert.equal(memory[0x909548], 0); assert.equal(memory.readInt32LE(body + 0x128), 0);
  memory[0x909548] = 90; checkRawPostFrameVehicles({memory});
  assert.equal(memory.readInt32LE(body + 0x128), 32); assert.equal(memory.readInt32LE(body + 0x110), 0x7fffffff);
  memory[0x909548] = 90;
  for (let index = 0; index < 4; index++) memory[body + 0x324 + index * 200] = 1;
  checkRawPostFrameVehicles({memory}); assert.equal(memory[0x909548], 0);
});
test('raw prepass uses signed height and the strict 512-unit threshold', () => {
  const {memory, body, header} = prepassFixture(); memory.writeInt16LE(-600, header + 0x14); memory.writeInt16LE(2, body + 0x668);
  memory.writeInt32LE(-88 * 65536, body + 0x38); checkRawPostFrameVehicles({memory}); assert.equal(memory.readInt32LE(body + 0x128), 0);
  memory.writeInt32LE(-87 * 65536, body + 0x38); checkRawPostFrameVehicles({memory}); assert.equal(memory.readInt32LE(body + 0x128), 32);
});
test('raw type4 stops before a later rejected body needs route or geometry context', () => {
  const {memory, body, session} = prepassFixture(), controller = 0x60000, registered = 0x61000, list = 0x62000;
  memory[session + 0x54d] = 0; memory.writeUInt32LE(list, 0x902bc0); memory.writeUInt16LE(2, 0x902bc4); memory.writeUInt32LE(body, list); memory.writeUInt32LE(0x30000, list + 4);
  memory.writeInt32LE(4, body); memory.writeInt32LE(32, body + 0x128); memory.writeUInt32LE(controller, body + 0x164); memory.writeUInt32LE(registered, controller); memory.writeInt32LE(3, registered);
  const result = runRawPostFrameBodyStates({memory, views: {memory}, scratchBase: 0x9200});
  assert.deepEqual(result, {respawnedBodies: 0, retiredBodies: 0}); assert.equal(memory[controller + 0x3a], 20); assert.equal(memory[controller + 0x39], 128); assert.equal(memory.readInt32LE(registered), 0x203);
});
test('outer post-frame binding rejects a detached memory context', () => {
  assert.throws(() => runRacePostFrameStage({memory: Buffer.alloc(1), postFrame: {memory: Buffer.alloc(1)}, scratchBase: 0x9000}), /coherent/);
});
test('respawn ring code2 preserves byte699 while matching code0 particles and RNG', () => {
  function fixture() {
    const memory = initializeBodyRetirementEffectTables(Buffer.alloc(0xa00000)), body = 0x10000, particles = 0x20000, rows = 0x40000, indices = 0x43000, bucket = 0x45000;
    memory[body + 0x699] = 77; memory.writeUInt32LE(body, 0x902eec); memory.writeUInt32LE(rows, 0x909254); memory.writeUInt32LE(bucket, 0x909278);
    for (let row = 0; row < 256; row++) {memory.writeUInt16LE(0xff00, rows + row * 16); memory.writeUInt32LE(indices, rows + row * 16 + 12);}
    memory.writeUInt32LE(particles, 0x6e65b4); memory.writeInt32LE(1, 0x5ec958);
    for (let index = 0; index < 32; index++) memory.writeUInt32LE(index < 31 ? particles + (index + 1) * 256 : 0, particles + index * 256 + 0xac);
    return {memory, body, scratchBase: 0x9000};
  }
  const a = fixture(), b = fixture(); emitRawVehicleRespawnRing(a.body, 2, a); emitRawVehicleRespawnRing(b.body, 0, b);
  assert.equal(a.memory[a.body + 0x699], 77); assert.equal(b.memory[b.body + 0x699], 31);
  b.memory[b.body + 0x699] = 77; assert.deepEqual(a.memory, b.memory);
});
