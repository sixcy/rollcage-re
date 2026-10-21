import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStage2Placements } from '../src/stage2-placements.mjs';
import { readStage2ModelMaterials } from '../src/stage2-model-materials.mjs';
import { buildStage2PlacedMeshes } from '../src/stage2-placed-meshes.mjs';

const model = { index: 0, offset: 0x120, faceCount: 1,
  vertices: [[0,0,0], [10,0,0], [0,10,0]],
  faces: [{ indices: [1,2,3,0], triangle: true }] };

function placementsFixture() {
  const data = Buffer.alloc(64 + 2 * 66);
  data.write('BTP '); data.writeUInt32LE(2, 0x14); data.writeUInt32LE(64, 0x28);
  data.writeUInt16LE(0x418, 64); data[67] = 255;
  const p = 64 + 66;
  data.writeUInt16LE(0x400, p);
  data.writeInt16LE(100, p + 8); data.writeInt16LE(-20, p + 10); data.writeInt16LE(30, p + 12);
  [30, 40, 50].forEach((n, i) => data.writeUInt16LE(n, p + 32 + i * 2));
  data.writeUInt16LE(0xffff, p + 40);
  return data;
}

function materialsFixture(inline = false, animated = false) {
  const data = Buffer.alloc(640);
  data.write('GFXM'); data.writeUInt32LE(0x180, 0xcc); data.writeUInt32LE(0x1b0, 0xd8);
  // A color-run start from the placement must never select these materials.
  data.writeUInt16LE(inline ? 0x8060 : 1, model.offset + 0x3c);
  data.writeUInt16LE(inline ? 0x80 : 12, inline ? 0x180 : 0x182);
  const descriptor = inline ? model.offset + 0x80 : 0x1b0 + 12;
  data.set([1,2,255,255,3,4,3,0,5,6,7,8], descriptor);
  if (animated) {
    data.writeUInt16LE(0x100, descriptor + 2);
    data.writeUInt32LE(480, 0xb0); data[0xb4] = 1; data.writeUInt32LE(504, 0xb8);
    data.writeInt16LE(1, 504); data.writeInt16LE(0, 510); data.writeInt16LE(1, 514);
    data.writeUInt32LE(528, 0x110);
    data.set([10,11,0,0,20,21,4,0,30,31,40,41], 528);
  }
  return data;
}

test('Stage II placements use 66-byte records and retain lighting starts separately from UVs', () => {
  const data = placementsFixture(), placements = parseStage2Placements(data, [model]);
  assert.equal(placements.stride, 66);
  assert.equal(placements.records[0].type, 24);
  const record = placements.records[1];
  assert.equal(record.modelIndex, 0); assert.equal(record.raw.length, 66);
  assert.deepEqual(record.position, [100,-20,30]);
  assert.deepEqual(record.colorStarts, [30,40,50]);
  assert.equal(record.uvStarts, undefined);
  assert.deepEqual(record.matrix, [4096,0,0,0,4096,0,0,0,4096]);
  assert.throws(() => parseStage2Placements(data.subarray(0, data.length - 1), [model]), /bounds/);
  data[64 + 66 + 3] = 1;
  assert.throws(() => parseStage2Placements(data, [model]), /missing model/);
});

test('Stage II model materials use the model index start and direct descriptor byte offsets', () => {
  const material = readStage2ModelMaterials(materialsFixture(), model)[0];
  assert.equal(material.key, 12); assert.equal(material.descriptor, 0x1bc);
  assert.equal(material.page, 3); assert.equal(material.animation, null);
  assert.deepEqual(material.indices, [0,2,1]);
  assert.deepEqual(material.uv, [[1,2],[3,4],[5,6],[7,8]]);
  const inline = readStage2ModelMaterials(materialsFixture(true), model)[0];
  assert.equal(inline.descriptor, model.offset + 0x80);
  assert.deepEqual(inline.uv, material.uv);
});

test('Stage II animated UVs sample the serialized frame and permutation', () => {
  const material = readStage2ModelMaterials(materialsFixture(false, true), model)[0];
  assert.equal(material.page, 4);
  assert.deepEqual(material.animation, { index: 0, frame: 1, uvIndex: 0, permutation: 1 });
  assert.deepEqual(material.uv, [[20,21],[40,41],[10,11],[30,31]]);
});

test('Stage II mesh construction ignores special placements and uses per-model materials', () => {
  const meshes = buildStage2PlacedMeshes(materialsFixture(), { models: [model] }, parseStage2Placements(placementsFixture(), [model]));
  assert.equal(meshes.length, 1); assert.equal(meshes[0].index, 1);
  assert.deepEqual(meshes[0].vertices[0], [100,-20,30]);
  assert.equal(meshes[0].faces[0].uv.length, 3);
  assert.equal(meshes[0].faces[0].page, 3);
  const data = materialsFixture(); data.writeUInt16LE(0xffff, 0x182);
  assert.throws(() => readStage2ModelMaterials(data, model), /descriptor.*bounds/);
  data.writeUInt16LE(0xffff, model.offset + 0x3c);
  assert.throws(() => readStage2ModelMaterials(data, model), /indices.*bounds/);
});
