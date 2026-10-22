import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGamePlatformImage} from '../src/game-bitmap-images.mjs';
import {createGameImageServices} from '../tools/lib/game-image-fixtures.mjs';
test('GDI+ negative stride reverses decoded rows into the native descriptor allocation', () => {
  const memory = Buffer.alloc(0xa00000), name = 0x10000, descriptor = 0x20000; memory.write('image.jpg\0', name); const services = createGameImageServices(memory, {width: 2, height: 3, negativeStride: true});
  assert.equal(loadGamePlatformImage(name, descriptor, 1, {memory, scratchBase: 0x9000, services}), 1); const pixels = memory.readUInt32LE(descriptor + 20); assert.equal(memory.readInt16LE(descriptor + 4), 8); assert.deepEqual(memory.subarray(pixels, pixels + 8), memory.subarray(0x300018, 0x300020)); assert.deepEqual(memory.subarray(pixels + 16, pixels + 24), memory.subarray(0x300000, 0x300008)); assert.equal(services.calls.filter(([n]) => n === 'GdipDisposeImage').length, 1);
});
test('failed image dimensions release the GDI+ wrapper and leave a cleared descriptor', () => {
  const memory = Buffer.alloc(0xa00000), services = createGameImageServices(memory, {widthFailure: true}); memory.write('image.jpg\0', 0x10000); memory.fill(0xa5, 0x20000, 0x20024);
  assert.equal(loadGamePlatformImage(0x10000, 0x20000, 0, {memory, scratchBase: 0x9000, services}), 0); assert.deepEqual(memory.subarray(0x20000, 0x20024), Buffer.alloc(36)); assert.equal(services.calls.filter(([n]) => n === 'GdipFree').length, 1);
});
