import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedCos,fixedSin,placementMatrix,transformPlacedVertex} from '../src/fixed-math.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {readModelMaterials} from '../src/model-materials.mjs';
import {buildPlacedMeshes} from '../src/placed-meshes.mjs';
import {buildSceneExport} from '../src/scene-export.mjs';
const model={faceCount:1,vertices:[[0,0,0],[10,0,0],[0,10,0]],faces:[{indices:[1,2,3,0],triangle:true}]};
function placementFixture() {
 const data=Buffer.alloc(120);data.write('BTP ');data.writeUInt32LE(1,0x14);data.writeUInt32LE(64,0x28);
 data.writeUInt16LE(0x400,64);data.writeInt16LE(100,72);data.writeInt16LE(-20,74);data.writeInt16LE(30,76);
 return data;
}
function materialFixture(animated=false) {
 const data=Buffer.alloc(432);data.write('GFXM');data.writeUInt32LE(288,0xcc);data.writeUInt32LE(320,0xd8);
 data.writeUInt16LE(2,288);data.set([1,2,255,255,3,4,3,0,5,6,7,8],320);
 if(animated) {
  data.writeUInt16LE(0x100,322);data.writeUInt32LE(352,0xb0);data[0xb4]=1;data.writeUInt32LE(376,0xb8);
  data.writeInt16LE(1,376);data.writeInt16LE(0,382);data.writeInt16LE(1,386);
  data.writeUInt32LE(400,0x110);data.set([10,11,0,0,20,21,4,0,30,31,40,41],400);
 }
 return data;
}
test('recovered lookup preserves quadrants and quantized placement matrices',()=>{
 assert.equal(fixedCos(0),65536);assert.equal(fixedCos(0x3243f),-65536);
 assert.equal(fixedSin(0x19220),65536);assert.equal(fixedSin(-0x19220),-65536);
 assert.deepEqual(placementMatrix([0,0,0]),[4096,0,0,0,4096,0,0,0,4096]);
 assert.deepEqual(placementMatrix([0,1024,0]),[-32,0,4127,0,4096,0,-4128,0,-32]);
 assert.deepEqual(transformPlacedVertex([10,20,30],placementMatrix([0,2048,0]),[100,200,300]),[90,220,270]);
});
test('placement reader retains positions, raw records and unresolved special types',()=>{
 const data=placementFixture(),record=parsePlacements(data,[model]).records[0];
 assert.deepEqual(record.position,[100,-20,30]);assert.equal(record.modelIndex,0);assert.equal(record.raw.length,56);
 assert.deepEqual(record.uvStarts,[0,0,0]);
 data.writeUInt16LE(0x418,64);data[67]=255;
 assert.equal(parsePlacements(data,[]).records[0].type,24);
 data.writeUInt16LE(0x400,64);assert.throws(()=>parsePlacements(data,[model]),/missing model/);
 data.writeUInt32LE(2,0x14);assert.throws(()=>parsePlacements(data,[model]),/bounds/);
});
test('model UVs use native corner order and animation redirect/permutation',()=>{
 const plain=readModelMaterials(materialFixture(),model,0)[0];
 assert.deepEqual(plain.indices,[0,2,1]);assert.equal(plain.page,3);
 assert.deepEqual(plain.uv,[[1,2],[3,4],[5,6],[7,8]]);assert.equal(plain.animation,null);
 const animated=readModelMaterials(materialFixture(true),model,0)[0];
 assert.equal(animated.page,4);assert.deepEqual(animated.animation,{index:0,frame:1,uvIndex:0,permutation:1});
 assert.deepEqual(animated.uv,[[20,21],[40,41],[10,11],[30,31]]);
 const bad=materialFixture();bad.writeUInt16LE(65535,288);
 assert.throws(()=>readModelMaterials(bad,model,0),/descriptor.*bounds/);
});
test('placed triangle export keeps transforms and does not invent a fourth corner',()=>{
 const placements=parsePlacements(placementFixture(),[model]);
 const meshes=buildPlacedMeshes(materialFixture(),{models:[model]},placements);
 assert.deepEqual(meshes[0].vertices[0],[100,-20,30]);assert.equal(meshes[0].faces[0].uv.length,3);
 const output=buildSceneExport({segments:[]},new Map([[3,{width:16,height:16}]]),meshes);
 assert.equal(output.triangles,1);assert.equal(output.quads,0);assert.equal(output.groups[0].kind,'object');
 assert.equal(output.obj.split('\n').filter(x=>x.startsWith('vt ')).length,3);
 assert.match(output.obj,/^v 100 20 -30$/m);
 const bytes=Buffer.from(output.groups[0].buffer,'base64');
 assert.deepEqual([0,4,8].map(offset=>bytes.readFloatLE(offset)),[100,20,-30]);
 assert.match(output.obj,/f 1\/1 3\/2 2\/3/);
});
