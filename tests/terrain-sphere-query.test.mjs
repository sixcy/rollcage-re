import test from 'node:test';
import assert from 'node:assert/strict';
import {queryTerrainSphere} from '../src/terrain-sphere-query.mjs';
const pack=normal=>(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0;
function fixture(){const vertices=[];for(let row=0;row<3;row++)for(let column=0;column<3;column++)vertices.push([column*32,0,-row*32,0]);return {sectors:[{index:0,columns:2,rows:2,vertices}]};}
function candidate({row=0,column=0,type=0,normal=[0,-256,0]}={}){return {id:((row<<16)|(column<<8))>>>0,sector:0,row,column,type,pointOffset:0,columns:2,vertexBase:row*3+column,normalQ8:normal,packedNormal:pack(normal)};}
const options={roundingMode:'nearest-even'},query={originQ8:[16*256,-6*256,-16*256],deltaQ8:[0,8*256,0],radiusQ8:2*256};
test('sphere plane time includes radius and outputs the surface point',()=>{
 const scratch={},hit=queryTerrainSphere(fixture(),[candidate()],query,{...options,scratch});
 assert.equal(hit.flags,1);assert.equal(hit.fractionQ16,32768);assert.deepEqual(hit.pointQ8,[4096,0,-4096]);assert.deepEqual(hit.normalQ16,[0,-65536,0]);assert.equal(hit.distanceQ8,1024);
 assert.deepEqual(scratch.visited,[true]);assert.deepEqual(scratch.edges,[-1]);assert.equal(scratch.planes[0].fractionQ16,32768);
});
test('sphere penetration projects the center onto the plane and records signed depth',()=>{
 const hit=queryTerrainSphere(fixture(),[candidate()],{...query,originQ8:[4096,-256,-4096]},options);
 assert.equal(hit.flags,2);assert.equal(hit.fractionQ16,0);assert.equal(hit.distanceQ8,-256);assert.deepEqual(hit.pointQ8,[4096,0,-4096]);
});
test('near stationary sphere preserves tolerance flags and type-four exception',()=>{
 const near={...query,originQ8:[4096,-640,-4096],deltaQ8:[0,0,0]};
 assert.equal(queryTerrainSphere(fixture(),[candidate()],near,options).flags,0x80000);
 assert.equal(queryTerrainSphere(fixture(),[candidate()],near,{...options,bodyFlags:4}).flags,0);
});
test('exterior row edge computes a cylinder hit after the face projection falls outside',()=>{
 const scratch={},hit=queryTerrainSphere(fixture(),[candidate()],{originQ8:[16*256,-20*256,8*256],deltaQ8:[0,40*256,0],radiusQ8:10*256},{...options,scratch});
 assert.equal(hit.flags,1);assert.ok(hit.fractionQ16>16384&&hit.fractionQ16<32768);assert.equal(scratch.edges[0],0);assert.ok(hit.normalQ16[1]<0&&hit.normalQ16[2]>0);
});
test('equal-time bound is exclusive and preserves caller contact fields',()=>{
 const output={pointQ8:[1,2,3],normalQ16:[4,5,6],distanceQ8:7,cellRef:8};
 assert.equal(queryTerrainSphere(fixture(),[candidate()],query,{...options,parameter:32768,output}),output);
 assert.deepEqual(output,{pointQ8:[1,2,3],normalQ16:[4,5,6],distanceQ8:7,cellRef:8,flags:0,fractionQ16:32768});
 assert.equal(queryTerrainSphere(fixture(),[],query,{...options,parameter:0x1010000}).fractionQ16,0x1010000);
});
test('accepted wall contact exposes the native diagnostic point and frame counter',()=>{
 const scratch={},hit=queryTerrainSphere(fixture(),[candidate({column:2,type:7,normal:[-256,0,0]})],{originQ8:[60*256,-20*256,-16*256],deltaQ8:[8*256,0,0],radiusQ8:512},{...options,scratch,frameCounter:123});
 assert.equal(hit.flags,1);assert.equal(hit.fractionQ16,16384);assert.deepEqual(hit.pointQ8,[64*256,-20*256,-16*256]);
 assert.deepEqual(scratch.borderContact,{pointQ8:hit.pointQ8,normalQ16:[-65536,0,0],anchorS16:[64,0,0],frameCounter:123});
});
