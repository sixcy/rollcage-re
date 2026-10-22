import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeWorldPhysicsConstants, initializeRawBodyArena, initializeRawCollisionPool, initializeRawShapePools} from '../src/world-physics-pools.mjs';

test('body arena allocates native size and publishes independently aligned pointer', () => {
  const memory = Buffer.alloc(0xa00000, 0x69); memory.writeInt32LE(27, 0x709808); let requested;
  initializeRawBodyArena({memory, allocate: size => {requested = size; return 0x100003;}});
  assert.equal(requested, (140000 + 27) * 32); assert.equal(memory.readUInt32LE(0x6e6b40), 0x100003); assert.equal(memory.readUInt32LE(0x902eec), 0x100080);
  assert.equal(memory[0x100002], 0x69); assert.equal(memory[0x100003], 0); assert.equal(memory[0x100003 + requested - 1], 0); assert.equal(memory[0x100003 + requested], 0x69);
});

test('body arena allocation failure clears both globals', () => {
  const memory = Buffer.alloc(0xa00000, 0x69); memory.writeInt32LE(0, 0x709808);
  initializeRawBodyArena({memory, allocate: () => 0}); assert.equal(memory.readUInt32LE(0x6e6b40), 0); assert.equal(memory.readUInt32LE(0x902eec), 0);
});

test('collision constructor creates100 packed20-bit IDs and respects live four-lane constants', () => {
  const memory = Buffer.alloc(0xa00000, 0x69), sizes = [], addresses = [0x100000, 0x110000, 0x120000]; initializeWorldPhysicsConstants(memory);
  memory.writeInt32LE(9, 0x5dcc60 + 4);
  initializeRawCollisionPool({memory, allocate: size => {sizes.push(size); return addresses[sizes.length - 1];}});
  assert.deepEqual(sizes, [0x28a0, 0x194, 0x190]); assert.equal(memory.readUInt32LE(0x902ba4), 100); assert.equal(memory.readUInt32LE(0x902bb4), 99);
  assert.equal(memory.readUInt32LE(0x120004), 9 << 20); assert.equal(memory.readUInt32LE(0x120014), 13 << 20); assert.equal(memory.readUInt32LE(0x120180), 96 << 20); assert.equal(memory.readUInt32LE(0x12018c), 99 << 20);
});

test('shape pool constructor owns contiguous256-byte index arrays and65 group headers', () => {
  const memory = Buffer.alloc(0xa00000, 0x69), sizes = []; initializeWorldPhysicsConstants(memory);
  initializeRawShapePools({memory, allocate: size => {sizes.push(size); return 0x100000 + (sizes.length - 1) * 0x10000;}});
  assert.deepEqual(sizes, [0x28a0, 0x194, 0x190, 0x4800, 0x300, 0x8000, 0x180, 0x2108]);
  const free = memory.readUInt32LE(0x91e780); assert.equal(free, 0x140000); assert.equal(memory.readUInt32LE(0x91e78c), free + 256); assert.equal(memory.readUInt32LE(0x91e790), free + 512);
  assert.equal(memory[free], 0); assert.equal(memory[free + 255], 255); assert.deepEqual(memory.subarray(free + 256, free + 768), Buffer.alloc(512));
  assert.equal(memory.readInt32LE(0x91e784), -1); assert.equal(memory.readUInt32LE(0x91e794), 255); assert.equal(memory.readUInt32LE(0x902be0), 0x170000); assert.equal(memory.readUInt32LE(0x902ee0), 0x170000 + 64 * 132); assert.equal(memory.readUInt32LE(0x902ee4), 0);
  assert.equal(memory.readUInt32LE(0x902bcc), 0); assert.equal(memory.readUInt32LE(0x902bc4), 0); assert.equal(memory[0x172108], 0x69);
});
