import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRawFixedVectorWithLength} from '../src/raw-vector-normalization.mjs';

test('supplied-length normalization returns the final scaled Z and preserves Q16 rounding', () => {
  const memory = Buffer.alloc(0xa00000), vector = 0x30000;
  [65536, -65536, 32768].forEach((value, i) => memory.writeInt32LE(value, vector + i * 4));
  assert.equal(normalizeRawFixedVectorWithLength(vector, 131072, {memory, scratchBase: 0x9000}), 16384);
  assert.deepEqual([0, 4, 8].map(offset => memory.readInt32LE(vector + offset)), [32768, -32768, 16384]);
});

test('supplied-length division faults retain argument scratch without changing the vector', () => {
  for (const length of [0, 1, 2]) {
    const memory = Buffer.alloc(0xa00000), vector = 0x30000; memory.writeInt32LE(123, vector);
    assert.throws(() => normalizeRawFixedVectorWithLength(vector, length, {memory, scratchBase: 0x9000}), /division/);
    assert.equal(memory.readInt32LE(vector), 123); assert.equal(memory.readInt32LE(0x9000 - 20), length); assert.equal(memory.readInt32LE(0x9000 - 24), 65536);
  }
});

test('supplied-length stack aliases observe the real division arguments and declared saved register', () => {
  const memory = Buffer.alloc(0xa00000), vector = 0x9000 - 20;
  [65536, 131072, 196608].forEach((value, i) => memory.writeInt32LE(value, vector + i * 4));
  normalizeRawFixedVectorWithLength(vector, 131072, {memory, scratchBase: 0x9000, nativeEntryRegisters: {ESI: 196608, EBX: 0}});
  assert.equal(memory.readInt32LE(vector), 65536); // Division argument publication replaces X before scaling.
  assert.equal(memory.readInt32LE(vector + 4), 0x249690); // The real492d20 division-return address is Y.
  assert.equal(memory.readInt32LE(vector + 8), 98304);
});
