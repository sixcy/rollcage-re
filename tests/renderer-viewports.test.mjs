import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRendererNameBytes, findRendererNamedObject, readRendererViewportExtent} from '../src/renderer-viewports.mjs';
import {initializeCameraProjectionConstants} from '../src/camera-projection.mjs';

test('renderer byte comparator treats embedded zeros and high bytes as unsigned data', () => {
  const memory = Buffer.from([0, 128, 255, 0, 127, 255]);
  assert.equal(compareRendererNameBytes(0, 3, 1, {memory}), 0);
  assert.equal(compareRendererNameBytes(0, 3, 3, {memory}), 1);
  assert.equal(compareRendererNameBytes(3, 0, 3, {memory}), -1);
  assert.equal(compareRendererNameBytes(0xffffffff, 0xffffffff, 0, {memory}), 0);
});

test('renderer name lookup measures the incoming C string and retains the owner for an empty vector', () => {
  const memory = Buffer.alloc(0xa00000), runtime = {memory, scratchBase: 0x9000}, put = (p, v) => memory.writeInt32LE(v, p);
  const owner = 0x30000, key = 0x31000, candidate = 0x32000, vector = 0x33000;
  put(owner + 0x2c, vector); put(owner + 0x30, vector);
  assert.equal(findRendererNamedObject(owner, key, false, runtime), 0); assert.equal(memory.readInt32LE(0x8ffc), owner);
  put(owner + 0x30, vector + 4); put(vector, candidate);
  memory.write('name\0', key); put(key + 16, 123); put(key + 20, 15);
  memory.write('name\0', candidate + 20); put(candidate + 36, 4); put(candidate + 40, 15);
  assert.equal(findRendererNamedObject(owner, key, false, runtime), candidate);
  memory[candidate + 20] = 78; assert.equal(findRendererNamedObject(owner, key, false, runtime), 0);
});

test('renderer fallback reads unsigned dimensions and requires both doubling switches', () => {
  const memory = Buffer.alloc(0xa00000), runtime = {memory, scratchBase: 0x9000}; initializeCameraProjectionConstants(memory);
  memory.writeUInt32LE(0x30000, 0x6e6388); memory.writeUInt32LE(0x31000, 0x5ecefc);
  memory.writeUInt16LE(65535, 0x3142c); memory.writeUInt16LE(480, 0x3142e); memory[0x3141a] = 1;
  assert.equal(readRendererViewportExtent(false, runtime), 65535);
  memory.writeInt32LE(-1, 0x6e6c04); assert.equal(readRendererViewportExtent(false, runtime), 131070); assert.equal(readRendererViewportExtent(true, runtime), 960);
  memory[0x3141a] = 0; assert.equal(readRendererViewportExtent(true, runtime), 480);
});
