import test from 'node:test';
import assert from 'node:assert/strict';
import {createRawBody, measureRawBodyStorage, publishRawBodyStorage, updateRawBodyDerived} from '../src/raw-body-construction.mjs';

test('raw body arena aligns size to128 while the returned previous offset rounds down to4', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeUInt32LE(0x10000, 0x902eec); memory.writeUInt32LE(7, 0x70dcf4);
  const body = createRawBody(0, 0x1c07, 0x181, 0, {memory, scratchBase: 0x9000});
  assert.equal(body, 0x10004); assert.equal(memory.readUInt32LE(0x70dcf4), 7 + 0x200); assert.equal(memory.readUInt32LE(body + 0x10), 0xffffffff);
  assert.equal(memory.readUInt32LE(body), 0x1c07); assert.equal(memory.readUInt32LE(body + 0x11c), 0xffffffff); assert.equal(memory[body + 0x12f], 255); assert.equal(memory.readUInt32LE(0x70e200), body);
});

test('raw body registration stops at512 without replacing retained index bytes', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeUInt32LE(0x10000, 0x902eec); memory.writeInt32LE(512, 0x6e6b44); memory.writeInt32LE(1234, 0x70e200);
  const body = createRawBody(0, 7, 384, 0, {memory, scratchBase: 0x9000});
  assert.equal(memory.readInt32LE(0x6e6b44), 512); assert.equal(memory.readUInt16LE(body + 0x10e), 65535); assert.equal(memory.readInt32LE(0x70e200), 1234);
});

test('body storage size publishes six independent output offsets and disabled sentinels', () => {
  const memory = Buffer.alloc(0x10000), model = 0x1000, outputs = Array.from({length: 6}, (_, i) => 0x2000 + i * 4);
  memory.writeInt32LE(0x100, model + 0x10); memory.writeInt32LE(0x150, model + 0x14);
  assert.equal(measureRawBodyStorage(model, 384, [1, 0, 0], outputs, {memory}), 912);
  assert.deepEqual(outputs.map(p => memory.readInt32LE(p)), [384, 648, -1, -1, -1, -1]);
});

test('body storage publication leaves uncopied132-byte fields stale and wraps model reference count', () => {
  const memory = Buffer.alloc(0x10000, 0x77), model = 0x1000, first = 0x3000;
  memory.writeInt32LE(0x100, model + 0x10); memory.writeInt32LE(0x128, model + 0x14); memory.writeUInt16LE(65535, model + 10);
  memory.writeInt32LE(123, model + 0x104); publishRawBodyStorage(0x2000, model, first, 0x4000, {memory});
  assert.equal(memory.readInt32LE(first + 4), 123); assert.equal(memory[first + 8], 0x77); assert.equal(memory.readUInt16LE(model + 10), 0); assert.equal(memory.readUInt32LE(0x2004), 0x4000);
});

test('raw derived-state update preserves the fixed-root scratch writes made by velocity limiting', () => {
  const memory = Buffer.alloc(0xa00000), body = 0x10000;
  memory.writeInt32LE(200 * 65536, body + 0x40); memory.writeInt32LE(65536, body + 0xa8); memory.writeInt32LE(65536, body + 0xac); memory.writeInt32LE(65536, body + 0x58);
  updateRawBodyDerived(body, {memory});
  assert.equal(memory.readUInt32LE(0x91d45c), 40000 * 256); assert.equal(memory.readUInt32LE(0x91d460), Math.clz32(40000 * 256));
});
