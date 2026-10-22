import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRendererTextureCreationConstants, associateRendererTexture, normalizeRendererTextureDimensions, countRendererTextureMipLevels, chooseRendererDepthFormat, allocateRendererTextureSurface, createRendererTextureResource, createRendererViewportTexture, releaseRendererTextureResource} from '../src/renderer-texture-creation.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), get = (m, p) => m.readInt32LE(p);
function fixture() {
  const memory = initializeRendererTextureCreationConstants(Buffer.alloc(0xa00000)), manager = 0x100000, resource = 0x110000, caps = 0x120000, dimensions = 0x130000, calls = [];
  put(memory, manager + 0x488, caps); put(memory, caps + 0x45c, 4096); put(memory, caps + 0x460, 4096); put(memory, manager + 0x500, 21); put(memory, manager + 0x504, 75); put(memory, manager + 0x36c, 0x140000);
  put(memory, manager + 0x48c, dimensions + 128); put(memory, dimensions + 128, resource); put(memory, manager + 0x890, dimensions + 256); put(memory, dimensions + 256, dimensions + 512); put(memory, 0x714ae8, manager);
  const runtime = {memory, scratchBase: 0x9000, services: {direct3DCall(object, method, args) {calls.push([object, method, args]); if ([0x5c, 0x60, 0x64, 0x74].includes(method)) put(memory, args.at(-2), 0x160000); return 0;}}};
  return {memory, manager, resource, caps, dimensions, calls, runtime};
}
test('dimension aliases read CMOV memory after the width store', () => {
  const {memory: m, manager, caps, dimensions, runtime} = fixture(); put(m, caps + 0x45c, 0); put(m, caps + 0x460, 511); put(m, dimensions, 3);
  normalizeRendererTextureDimensions(manager, dimensions, dimensions, 0, 0, 1, 0, runtime); assert.equal(get(m, dimensions), 1);
  put(m, caps + 0x460, 256); put(m, dimensions, 1024); normalizeRendererTextureDimensions(manager, dimensions, dimensions, 0, 2, 1, 0, runtime); assert.equal(get(m, dimensions), 256);
});
test('dimension caps retain power-of-two and square-only restrictions', () => {
  const {memory: m, manager, caps, dimensions, runtime} = fixture(); put(m, dimensions, 513); put(m, dimensions + 4, 9); put(m, caps + 0x440, 2 | 0x20);
  normalizeRendererTextureDimensions(manager, dimensions, dimensions + 4, 1, 0, 1, 0, runtime); assert.equal(get(m, dimensions), 1024); assert.equal(get(m, dimensions + 4), 1024);
});
test('compressed mip chains stop at a four-pixel block using signed minimum', () => {
  const {memory, resource, runtime} = fixture(); put(memory, resource + 0x444, 0x31545844);
  assert.equal(countRendererTextureMipLevels(1024, 32, resource, runtime), 4); assert.equal(countRendererTextureMipLevels(-1, 32, resource, runtime), 1);
  put(memory, resource + 0x444, 21); assert.equal(countRendererTextureMipLevels(1024, 32, resource, runtime), 6);
});
test('depth-format selection tries both COM checks and respects original preference order', () => {
  const {memory, manager, calls, runtime} = fixture(); put(memory, manager + 0x368, 0x150000); put(memory, manager + 0x430, 22);
  let checks = 0; runtime.services.direct3DCall = (object, method, args) => {calls.push([object, method, args]); if (method === 0x28) return 0; return checks++ === 0 ? -1 : 0;};
  assert.equal(chooseRendererDepthFormat(manager, 21, runtime), 79); assert.deepEqual(calls.map(row => row[1]), [0x28, 0x30, 0x28, 0x30]);
});
test('secondary allocation aliases the primary only for the native sharing flag', () => {
  const {memory: m, resource, runtime, calls} = fixture(); put(m, resource + 0x438, 0x234567); m[resource + 0x45d] = 1;
  assert.equal(allocateRendererTextureSurface(resource, 1, 0x140000, 0x120404, runtime), 1); assert.equal(get(m, resource + 0x43c), 0x234567); assert.equal(calls.length, 0);
});
test('a failed primary creation clears owned COM surfaces and does not invent success', () => {
  const {memory: m, manager, resource, runtime, calls} = fixture(); put(m, resource + 0x440, 0x150000);
  runtime.services.direct3DCall = (object, method, args) => {calls.push([object, method, args]); return method === 8 ? 0 : -1;};
  assert.equal(createRendererTextureResource(manager, resource, 100, 50, 1, 0, 1, 0, 32, 0, 0, runtime), 0);
  assert.equal(get(m, resource + 0x438), 0); assert.equal(get(m, resource + 0x440), 0); assert.deepEqual(calls.map(row => row[1]), [0x5c, 8]);
});
test('viewport texture association precedes reading aliased mode argument', () => {
  const {memory: m, manager, dimensions, resource, runtime} = fixture(); put(m, dimensions + 256, 0x9008); //virtual98 writes the incoming mode slot.
  assert.equal(createRendererViewportTexture(manager, 0, 99, 640, 480, 1, 2, 1, dimensions, runtime), 1);
  assert.equal(get(m, resource + 0x454), 10); assert.equal(m[dimensions], 1);
  associateRendererTexture(manager, -1, 123, runtime); assert.equal(get(m, 0x9008), 0);
});
test('release avoids double release when primary and secondary share one surface', () => {
  const {memory: m, resource, runtime, calls} = fixture(); put(m, resource + 0x438, 0x150000); put(m, resource + 0x43c, 0x150000); put(m, resource + 0x440, 0x160000);
  releaseRendererTextureResource(resource, runtime); assert.deepEqual(calls.map(row => [row[0], row[1]]), [[0x160000, 8], [0x150000, 8]]);
});
