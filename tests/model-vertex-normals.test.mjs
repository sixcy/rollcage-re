import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModelVertexNormals, initializeModelVertexNormals} from '../src/model-vertex-normals.mjs';

test('packed polygon normals generate unit vertex normals and preserve output padding', () => {
  const memory = Buffer.alloc(0xa00000), model = 0x10000, faces = 0x11000, output = 0x12000;
  memory.writeUInt16LE(2, model + 4); memory.writeUInt16LE(2, model + 6); memory.writeUInt32LE(faces, model + 12);
  memory.writeUInt32LE(0x01010101, faces); memory.writeInt32LE(0x10000000, faces + 4); memory.writeUInt32LE(1, faces + 8); memory.writeInt32LE(-0x10000000, faces + 12); memory.fill(0x55, output, output + 16);
  buildModelVertexNormals(model, output, {memory, scratchBase: 0x9000});
  //Four positive occurrences minus one negative leave3Q16; the truncated
  //reciprocal21845 yields65535, whose final>>4 is4095.
  assert.deepEqual([0, 2, 4].map(o => memory.readInt16LE(output + o)), [4095, 0, 0]);
  assert.deepEqual([8, 10, 12].map(o => memory.readInt16LE(output + o)), [0, 0, 0]); assert.equal(memory.readUInt16LE(output + 6), 0x5555); assert.equal(memory.readUInt16LE(output + 14), 0x5555);
});

test('relative child models share one lazy allocation and a cache hit performs no allocation', () => {
  const memory = Buffer.alloc(0xa00000), model = 0x10000, sizes = [];
  for (let i = 0; i < 3; i++) memory.writeUInt16LE(1, model + i * 0x100 + 4);
  memory.writeUInt16LE(0x100, model + 0x1c); memory.writeUInt16LE(0x200, model + 0x1e);
  const runtime = {memory, scratchBase: 0x9000, allocate: size => {sizes.push(size); return 0x20000;}};
  initializeModelVertexNormals(model, runtime); initializeModelVertexNormals(model, runtime);
  assert.deepEqual(sizes, [24]); assert.deepEqual([0, 0x100, 0x200].map(o => memory.readUInt32LE(model + o + 0x48)), [0x20000, 0x20008, 0x20010]);
});
