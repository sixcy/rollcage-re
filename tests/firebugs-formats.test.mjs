import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFirebugsTerrain, parseFirebugsModels, parseFirebugsPlacements, decodeFirebugsTexture, decodeFirebugsScene } from '../src/firebugs-scene.mjs';
import { FirebugsArchive } from '../src/firebugs-archive.mjs';
import { identifyFirebugs, firebugsGame } from '../src/firebugs.mjs';

const clut=(100<<6)|63;
function material(buffer, offset) {
  buffer[offset]=0; buffer[offset+1]=0; buffer.writeUInt16LE(clut,offset+2);
  buffer[offset+4]=31; buffer[offset+5]=0; buffer.writeUInt16LE(8,offset+6);
  buffer[offset+8]=0; buffer[offset+9]=31; buffer[offset+10]=31; buffer[offset+11]=31;
}
function fixtures() {
  const geometry=Buffer.alloc(0x400); geometry.write('GFXM'); geometry.writeUInt32LE(4,4);
  geometry.writeUInt32LE(1,8); geometry.writeUInt32LE(1,0x10); geometry.writeUInt32LE(0x140,0x14);
  geometry.writeUInt32LE(0x144,0x18); geometry.writeUInt16LE(1,0x2c); geometry.writeUInt32LE(0x160,0x140);
  geometry.writeUInt32LE(0x240,0x144); geometry.write('SEGM',0x160);
  geometry.writeUInt32LE(1,0x168); geometry.writeUInt32LE(1,0x16c);
  geometry.writeUInt32LE(0x1c0,0x180); geometry.writeUInt32LE(0x1e0,0x1b0);
  for (const [i,v] of [[0,0,0],[100,0,0],[0,0,100],[100,0,100]].entries()) {
    for(const [a,n] of v.entries()) geometry.writeInt16LE(n,0x1c0+i*8+a*2);
  }
  geometry.writeUInt16LE(4,0x1de); geometry.writeUInt32LE(0x200,0x110);
  geometry.writeUInt32LE(7|(1<<11)|(81<<18),0x1e0); material(geometry,0x210);
  geometry.writeUInt32LE(0x4d4f4401,0x240); geometry.writeUInt16LE(4,0x244); geometry.writeUInt16LE(1,0x246);
  geometry.writeUInt32LE(0x70,0x24c); geometry.writeUInt32LE(0x80,0x284);
  geometry.set([1,2,3,4],0x2b0);
  for(const [i,v] of [[0,0,0],[10,0,0],[0,0,10],[10,0,10]].entries()) {
    for(const [a,n] of v.entries()) geometry.writeInt16LE(n,0x2c0+i*8+a*2);
  }
  geometry.writeUInt32LE(0x340,0xcc); geometry.writeUInt32LE(0x300,0xd8); material(geometry,0x300);
  const vram=Buffer.alloc(16+512*512*2+1024); vram.write('VRAM');
  for(let y=0;y<256;y++) for(let x=512;x<576;x++) putWord(vram,x,y,0x1111);
  putWord(vram,1009,100,31);
  const btx=Buffer.alloc(128); btx.write('BTX '); btx.writeUInt32LE(1,0xc); btx.writeUInt32LE(1,0x14); btx.writeUInt32LE(64,0x28);
  btx.writeUInt16LE(0x400,64); [10,20,30].forEach((n,i)=>btx.writeInt16LE(n,72+i*2));
  return {geometry,vram,btx};
}
function putWord(vram,x,y,color) { vram.writeUInt16LE(color,16+y*1024+(x-512)*2); }

test('PS1 terrain separates template IDs, seven-bit UV references and corner flags',()=>{
  const {geometry}=fixtures();
  const face=parseFirebugsTerrain(geometry).segments[0].faces[0];
  assert.equal(face.textureRecord,1); assert.equal(face.clut,clut); assert.equal(face.tpage,0x28);
  assert.deepEqual(face.indices,[0,1,2,3]); assert.deepEqual(face.uv,[[0,0],[31,0],[0,31],[31,31]]);
  geometry.writeUInt16LE(0,0x1de);
  assert.deepEqual(parseFirebugsTerrain(geometry).segments[0].faces[0].indices,[1,3,0,2]);
});

test('PS1 textures use the uploaded right-half VRAM layout and preserve opaque black',()=>{
  const {vram}=fixtures();
  let image=decodeFirebugsTexture(vram,0x28,clut);
  assert.deepEqual([...image.rgba.subarray(0,4)],[255,0,0,255]);
  putWord(vram,1009,100,0); image=decodeFirebugsTexture(vram,0x28,clut);
  assert.equal(image.rgba[3],0);
  putWord(vram,1009,100,0x8000); image=decodeFirebugsTexture(vram,0x28,clut);
  assert.deepEqual([...image.rgba.subarray(0,4)],[0,0,0,255]);
  putWord(vram,1009,100,0x7c00); image=decodeFirebugsTexture(vram,0x28,clut);
  assert.deepEqual([...image.rgba.subarray(0,4)],[0,0,255,255]);
});

test('PS1 texture addressing handles 8-bit, direct-color and the extra palette upload',()=>{
  const {vram}=fixtures(); putWord(vram,512,0,0x0201);
  const palette=(300<<6)|32; putWord(vram,513,300,31); putWord(vram,514,300,31<<5);
  const image=decodeFirebugsTexture(vram,0xa8,palette);
  assert.deepEqual([...image.rgba.subarray(0,8)],[255,0,0,255,0,255,0,255]);
  putWord(vram,512,0,0x7c00);
  assert.deepEqual([...decodeFirebugsTexture(vram,0x128,0).rgba.subarray(0,4)],[0,0,255,255]);
  putWord(vram,512,0,0x1111); vram.writeUInt16LE(31,16+512*512*2+2);
  assert.deepEqual([...decodeFirebugsTexture(vram,0x28,511<<6).rgba.subarray(0,4)],[255,0,0,255]);
  assert.throws(()=>decodeFirebugsTexture(vram,0x1a8,clut),/Reserved/);
  assert.throws(()=>decodeFirebugsTexture(vram,0,clut),/outside/);
});

test('models use the PS1 vertex pointer and one-based draw-corner order',()=>{
  const {geometry,btx}=fixtures(); const models=parseFirebugsModels(geometry);
  assert.deepEqual(models[0].vertices[3],[10,0,10]); assert.deepEqual(models[0].faces[0].indices,[0,2,1,3]);
  const placements=parseFirebugsPlacements(btx,models);
  assert.equal(placements.stride,64); assert.deepEqual(placements.records[0].position,[10,20,30]);
  geometry[0x2b0]=0;
  assert.throws(()=>parseFirebugsModels(geometry),/Invalid Firebugs model 0 face/);
});

test('scene export combines textured terrain and ordinary scenery and inventories special objects',()=>{
  const {geometry,vram,btx}=fixtures(); const scene=decodeFirebugsScene(geometry,vram,btx);
  assert.equal(scene.triangles,4); assert.equal(scene.instances,1); assert.equal(scene.vertices,8); assert.equal(scene.textures.size,1);
  assert.deepEqual(scene.bounds,[[0,100],[-20,0],[-100,0]]);
  assert.match(scene.obj,/v 10 -20 -30/); assert.deepEqual(scene.placementTypes,{0:1});
  btx.writeUInt16LE(2,64);
  const special=decodeFirebugsScene(geometry,vram,btx);
  assert.equal(special.instances,0); assert.deepEqual(special.placementTypes,{2:1});
});

test('format readers reject out-of-range pointers, missing models and truncated resources',()=>{
  const {geometry,vram,btx}=fixtures();
  assert.throws(()=>parseFirebugsTerrain(geometry.subarray(0,0x100)),/header/);
  const damaged=Buffer.from(geometry); damaged.writeUInt32LE(0xfffffffe,0x180);
  assert.throws(()=>parseFirebugsTerrain(damaged),/vertices.*bounds/);
  damaged.writeUInt32LE(0x1c0,0x180); damaged.writeUInt32LE(0xfffffff0,0x110);
  assert.throws(()=>parseFirebugsTerrain(damaged),/material.*bounds/);
  assert.throws(()=>parseFirebugsPlacements(btx.subarray(0,127),[]),/bounds/);
  btx[67]=4; assert.throws(()=>parseFirebugsPlacements(btx,parseFirebugsModels(geometry)),/missing model/);
  assert.throws(()=>decodeFirebugsTexture(vram.subarray(0,32),0x28,clut),/header/);
});

async function fixtureArchive() {
  const {geometry,vram,btx}=fixtures(), blobs=[geometry,vram,btx], indexData=Buffer.alloc(48);
  let at=0;
  for(const [i,data] of blobs.entries()) { indexData.writeUInt32LE(at,i*16); indexData.writeUInt32LE(data.length,i*16+4); indexData.writeUInt32LE(data.length,i*16+8); at+=data.length; }
  return FirebugsArchive.open({indexData,imageData:Buffer.concat(blobs),identity:{volumeId:'FIREBUGS',bootExecutable:'SYNTHETIC'}});
}

test('disc identification requires explicit compatibility for unknown releases and rejects foreign tracks',async()=>{
  const archive=await fixtureArchive(); await assert.rejects(identifyFirebugs(archive),/Unrecognized Firebugs release/);
  const result=await identifyFirebugs(archive,'firebugs'); assert.equal(result.verified,false); assert.equal(result.tracks.length,1);
  assert.equal(result.tracks[0].index,0); assert.equal(result.tracks[0].vramIndex,1); assert.equal(result.tracks[0].btxIndex,2);
  assert.equal((await result.game.loadTrack(archive,result.tracks[0])).triangles,4);
  await assert.rejects(firebugsGame.loadTrack(archive,{...result.tracks[0]}),/does not belong/);
  await assert.rejects(identifyFirebugs(archive,'rollcage'),/belongs to Firebugs/);
  await assert.rejects(archive.readResource(-1),/Invalid/); await archive.close();
});
