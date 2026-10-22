import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRendererTextureCategory, selectRendererTextureFormat, rendererSupportsTextureFormat, copyRendererTexturePixels} from '../src/renderer-texture-upload.mjs';
import {verifyRendererTextureUpload} from '../tools/verify-renderer-texture-upload-instructions.mjs';

test('renderer selects original alpha/compressed categories and enumerated direct formats', () => {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), runtime = {memory}, resource = 0x110000, image = 0x120000, manager = 0x100000;
  put(0x714ae8, manager); put(manager + 0x4c0, 0x130000); put(manager + 0x4c4, 0x130024); put(0x130000, 0x33545844); put(image + 16, 5);
  selectRendererTextureCategory(resource, image, runtime); assert.equal(memory.readInt32LE(resource + 0x454), 11); selectRendererTextureFormat(resource, image, runtime); assert.equal(memory.readInt32LE(resource + 0x444), 0x33545844);
  put(image + 16, 4); selectRendererTextureCategory(resource, image, runtime); assert.equal(memory.readInt32LE(resource + 0x454), 3); selectRendererTextureFormat(resource, image, runtime); assert.equal(memory.readInt32LE(resource + 0x444), 0); assert.equal(rendererSupportsTextureFormat(manager, 0x33545844, runtime) & 255, 1);
});
test('supported compressed upload copies the native byte count through CRT', () => {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), calls = [], image = 0x120000, locked = 0x130000;
  put(image + 16, 3); put(image + 8, 8); put(image + 12, 4); put(image + 4, 0x140000); put(locked + 4, 0x150000);
  copyRendererTexturePixels(0x100000, image, 3, 0x31545844, locked, {memory, scratchBase: 0x9000, sehWord: 0, services: {libraryCall(name, args) {calls.push([name, ...args]);}}}); assert.deepEqual(calls, [['memcpy', 0x150000, 0x140000, 16]]);
});
test('populated renderer upload graph matches actual game descendants and platform traces', async () => {
  assert.equal((await verifyRendererTextureUpload({fixtures: 12, withPalettes: true, output: null})).matched, true);
});
