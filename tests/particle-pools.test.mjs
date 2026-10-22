import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeParticlePoolConstants, initializeRawParticlePools, initializeRawParticleStorage, initializeRawEffectRecordBanks, initializeRawBodyDebrisPool, truncateParticleCountFloat} from '../src/particle-pools.mjs';

function fixture(quality = 1) {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p); initializeParticlePoolConstants(memory); memory.fill(0x69, 0xf0000, 0x380000);
  put(0x5ecefc, 0x30000); memory.writeFloatLE(quality, 0x30068); put(0x902eec, 0x100000); put(0x90b990, 0x40000); memory.writeUInt16LE(12, 0x4002e); put(0x90b988, 0x50000); put(0x90b984, 96); put(0x90b980, 0x60000);
  for (let index = 0; index < 256 * 16; index++) memory[0x50000 + index] = index * 17 + 3 & 255;
  const sizes = [], allocate = size => {sizes.push(size); return 0x300000 + (sizes.length - 1) * 0x20000;};
  return {memory, put, sizes, context: {memory, allocate, roundingMode: 'nearest-even'}};
}

test('particle pools allocate from original quality before clamping emission quality', () => {
  const {memory, sizes, context} = fixture(0.5); initializeRawParticlePools(context);
  assert.deepEqual(sizes, [0x12db8, 0x2d3c, 0x3c00]); assert.equal(memory.readInt32LE(0x5eb504), 250); assert.equal(memory.readUInt32LE(0x91900c), 0x100000 + 250 * 256);
  assert.equal(memory.readFloatLE(0x30068), 1); assert.equal(memory.readInt32LE(0x5eb500), 40); assert.equal(memory.readUInt32LE(0x6e65b4), 0x100000); assert.equal(memory.readUInt32LE(0x6e65c0), 0); assert.equal(memory.readUInt32LE(0x6e65c8), 0);
  assert.equal(memory.readUInt32LE(0x1000ac), 0x100100); assert.equal(memory.readUInt32LE(0x100000 + 249 * 256 + 0xac), 0); assert.equal(memory.readUInt32LE(0x100000 + 249 * 256 + 0xa8), 0x100000 + 248 * 256);
});

test('quality above10 still reserves its larger original particle count', () => {
  const {memory, context} = fixture(11); initializeRawParticlePools(context); assert.equal(memory.readInt32LE(0x5eb504), 5500); assert.equal(memory.readFloatLE(0x30068), 10); assert.equal(memory.readInt32LE(0x5eb500), 400);
});

test('particle texture copy propagates overlapping rows forward and applies source/destination flag aliases', () => {
  const {memory, put} = fixture(0); put(0x90b984, 59); const first = Buffer.from(memory.subarray(0x50000 + 58 * 16, 0x50000 + 59 * 16));
  initializeRawParticleStorage({memory});
  assert.equal(memory.readUInt32LE(0x50000 + 70 * 16), first.readUInt32LE(0)); assert.equal(memory.readUInt16LE(0x50000 + 58 * 16 + 6) & 0x800, 0x800);
  assert.equal(memory.readUInt16LE(0x50000 + 70 * 16 + 6) & ~63, 128); assert.equal(memory.readInt32LE(0x90b984), 71);
});

test('zero count retains native write before pool start and banks reset only a16-bit counter', () => {
  const {memory, context} = fixture(0); memory.writeInt32LE(0x93939393 | 0, 0x91cd60); initializeRawParticlePools(context);
  assert.equal(memory.readUInt32LE(0x100000 - 0x54), 0); assert.equal(memory.readUInt32LE(0x6e65b4), 0x100000); assert.equal(memory.readUInt32LE(0x91cd60), 0x93930000);
  memory.writeInt32LE(0x12345678, 0x91cd60); initializeRawEffectRecordBanks({memory}); assert.equal(memory.readUInt32LE(0x91cd60), 0x12340000);
});

test('quality FISTP honors explicit nearest-even versus upward rounding', () => {
  const even = fixture(1.0125), upward = fixture(1.0125); initializeRawParticlePools(even.context); initializeRawParticlePools({...upward.context, roundingMode: 'up'});
  assert.equal(even.memory.readInt32LE(0x5eb500), 40); assert.equal(upward.memory.readInt32LE(0x5eb500), 41);
});

test('CRT count conversion preserves signed64 result low32 and requires explicit exceptional results', () => {
  assert.equal(truncateParticleCountFloat(-1.9), -1n); assert.throws(() => truncateParticleCountFloat(NaN), /explicit CRT result/); assert.throws(() => truncateParticleCountFloat(2 ** 63), /explicit CRT result/);
  const {memory} = fixture(NaN); initializeRawParticleStorage({memory, convertFloatToInt64: () => 0x100000002n}); assert.equal(memory.readInt32LE(0x5eb504), 2); assert.equal(memory.readUInt32LE(0x91900c), 0x100200);
});

test('debris constructor reserves512 records, initializes packed render aliases and owns two ushort-ID arrays', () => {
  const {memory, context, sizes, put} = fixture(); put(0x70dcf4, 7); initializeRawBodyDebrisPool(context);
  const start = memory.readUInt32LE(0x902b84), free = memory.readUInt32LE(0x902b7c), active = memory.readUInt32LE(0x902b80);
  assert.equal(start, 0x100004); assert.equal(memory.readUInt32LE(0x70dcf4), 7 + 65536); assert.deepEqual(sizes, [1024, 1024]);
  assert.equal(memory.readUInt16LE(free + 1022), 511); assert.deepEqual(memory.subarray(active, active + 1024), Buffer.alloc(1024)); assert.equal(memory.readInt32LE(0x902b8c), 511); assert.equal(memory.readUInt32LE(0x902b88), 0);
  for (const index of [0, 511]) {const p = start + index * 128; assert.equal(memory.readUInt32LE(p), 5); assert.equal(memory.readUInt32LE(p + 0x14), 0xae404040); assert.equal(memory.readUInt32LE(p + 0x50), 0xae404040); assert.equal(memory.readUInt32LE(p + 0x6c), 0x40404040); assert.equal(memory.readUInt16LE(p + 0x6a), 0); assert.equal(memory[p + 0x10], 0x69);}
});
