import test from 'node:test';
import assert from 'node:assert/strict';
import {queryTerrainRay} from '../src/terrain-query.mjs';
const packed=normal=>(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0;
function fixture() {
 const vertices=[];for(let row=0;row<3;row++)for(let column=0;column<3;column++)vertices.push([column*32,0,-row*32,0]);
 return {sectors:[{index:0,columns:2,rows:2,vertices}]};
}
function candidate({row=0,column=0,type=0,pointOffset=0,normal=[0,-256,0]}={}) {
 return {id:((row<<16)|(column<<8))>>>0,sector:0,row,column,type,pointOffset,columns:2,vertexBase:row*3+column,normalQ8:normal,packedNormal:packed(normal)};
}
const ray={originQ8:[16*256,-20*256,-16*256],deltaQ8:[0,44*256,0],radiusQ8:0};
test('wheel terrain hit preserves fraction truncation and quantized point separately',()=>{
 const hit=queryTerrainRay(fixture(),[candidate()],ray);
 assert.equal(hit.flags,1);assert.equal(hit.fractionQ16,29789);
 assert.deepEqual(hit.pointQ8,[4096,-16,-4096]);assert.deepEqual(hit.normalQ16,[0,-65536,0]);assert.equal(hit.distanceQ8,5120);
});
test('plane start overlap returns projected point and zero travel',()=>{
 const hit=queryTerrainRay(fixture(),[candidate()],{...ray,originQ8:[4096,2*256,-4096]});
 assert.equal(hit.flags,2);assert.equal(hit.fractionQ16,0);assert.deepEqual(hit.pointQ8,[4096,0,-4096]);
});
test('near stationary planes retain the native tolerance and body-type exception',()=>{
 const query={...ray,originQ8:[4096,-128,-4096],deltaQ8:[0,0,0]};
 assert.equal(queryTerrainRay(fixture(),[candidate()],query).flags,0x80000);
 assert.equal(queryTerrainRay(fixture(),[candidate()],query,{bodyFlags:4}).flags,0);
 assert.equal(queryTerrainRay(fixture(),[candidate()],{...query,originQ8:[4096,-256,-4096]}).flags,0);
});
test('adjacent-cell traversal can reuse a plane without changing its point',()=>{
 const candidates=[candidate(),candidate({column:1})],query={...ray,originQ8:[48*256,-20*256,-16*256]};
 const hit=queryTerrainRay(fixture(),candidates,query);
 assert.equal(hit.candidateIndex,1);assert.equal(hit.cellRef,256);assert.deepEqual(hit.pointQ8,[48*256,-16,-16*256]);
});
test('both split diagonals select the containing triangle and preserve candidate order',()=>{
 const grid=fixture();
 for(const types of [[2,3],[5,4]]) {
  const candidates=types.map(type=>candidate({type,pointOffset:type===3?4:type===4?3:type===5?1:0}));
  for(const [x,z]of [[4,-4],[28,-28],[4,-28],[28,-4]])assert.ok(queryTerrainRay(grid,candidates,{...ray,originQ8:[x*256,-20*256,z*256]}).flags);
 }
});
test('maximum fraction is exclusive and empty/filtered queries retain raw parameter',()=>{
 const grid=fixture(),hit=queryTerrainRay(grid,[candidate()],ray);
 assert.equal(queryTerrainRay(grid,[candidate()],ray,{parameter:0x1000000|hit.fractionQ16}).flags,0);
 assert.deepEqual(queryTerrainRay(grid,[],ray),{flags:0,fractionQ16:0x1010000});
 assert.deepEqual(queryTerrainRay(grid,[candidate({type:6,normal:[256,0,0]})],ray),{flags:0,fractionQ16:0x1010000});
 assert.throws(()=>queryTerrainRay(grid,[],{...ray,radiusQ8:256}),/zero radius/);
});
