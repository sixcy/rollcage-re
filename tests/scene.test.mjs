import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScene} from '../src/scene.mjs';
import {buildSceneExport} from '../src/scene-export.mjs';
function fixture(flags=4) {
 const data=Buffer.alloc(444),segment=292,vertices=388,packets=420,uv=428;
 data.write('GFXM');data.writeUInt32LE(1,0x10);data.writeUInt32LE(288,0x14);data.writeUInt32LE(segment,288);data.writeUInt32LE(uv,0x110);
 data.write('SEGM',segment);data.writeUInt32LE(1,segment+8);data.writeUInt32LE(1,segment+12);data.writeUInt32LE(vertices,segment+0x20);data.writeUInt32LE(packets,segment+0x50);
 for(const [i,position]of [[0,[0,0,0]],[1,[10,0,0]],[2,[0,0,10]],[3,[10,-10,10]]])for(let axis=0;axis<3;axis++)data.writeInt16LE(position[axis],vertices+i*8+axis*2);
 data.writeUInt16LE(flags,vertices+3*8+6);data.writeUInt16LE(5,packets);
 data.set([0,0,1,0,15,0,0x82,0,0,15,15,15],uv);
 return data;
}
test('sector coordinates and UV corners follow the native grid-point flag',()=>{
 const direct=parseScene(fixture()).segments[0],rotated=parseScene(fixture(0)).segments[0];
 assert.equal(direct.vertices.length,4);assert.deepEqual(direct.vertices[3],[10,-10,10,4]);
 assert.deepEqual(direct.faces[0].indices,[0,1,2,3]);
 assert.deepEqual(rotated.faces[0].indices,[1,3,0,2]);
 assert.equal(direct.faces[0].page,2);assert.equal(direct.faces[0].pageWord,0x82);
 assert.deepEqual(direct.faces[0].uv,[[0,0],[15,0],[0,15],[15,15]]);
});
test('scene export retains geometry and samples texel centers in both triangles',()=>{
 const output=buildSceneExport(parseScene(fixture()),new Map([[2,{width:16,height:16}]]));
 assert.deepEqual(output.bounds,[[0,10],[0,10],[0,10]]);
 assert.equal(output.groups[0].vertices,6);
 const bytes=Buffer.from(output.groups[0].buffer,'base64');
 assert.equal(bytes.readFloatLE(12),0.03125);assert.equal(bytes.readFloatLE(16),0.03125);
 assert.equal(bytes.readFloatLE(32+12),0.96875);
 // The second triangle's middle corner is the raised, bottom-right vertex.
 assert.equal(bytes.readFloatLE(4*32+4),10);
 assert.equal(output.obj.split('\n').filter(line=>line.startsWith('f ')).length,2);
});
test('missing textures and malformed segment ranges are explicit failures',()=>{
 assert.throws(()=>buildSceneExport(parseScene(fixture()),new Map()),/unavailable/);
 const bad=fixture();bad.writeUInt32LE(0xffffffff,424);
 assert.throws(()=>parseScene(bad),/UV record.*bounds/);
 bad.writeUInt32LE(0,424);bad.writeUInt32LE(0xffffffff,292+8);
 assert.throws(()=>parseScene(bad),/vertices.*bounds/);
});
