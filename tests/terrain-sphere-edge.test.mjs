import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTerrainSphereEdge} from '../src/terrain-sphere-edge.mjs';
const options={roundingMode:'nearest-even'};
const pack=normal=>(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0;
const candidate=(extra={})=>({id:101,sector:0,type:0,columns:1,vertexBase:0,packedNormal:pack([0,256,0]),edgeCode:0,...extra});
const grid=()=>({sectors:[{vertices:[[-10,0,-10,0],[10,0,-10,0],[-10,0,10,0],[10,0,10,0]]}]});
const result=()=>({flags:23,pointQ8:[7,8,9],normalQ16:[10,11,12],distanceQ8:13,cellRef:14,fractionQ16:65536});
const query=(x,z)=>({originQ8:[x*256,4*256,z*256],deltaQ8:[0,-4*256,0],radiusQ8:256});
test('Smooth neighbors average wrapped point sums and choose the neighbor on a distance tie',()=>{
 const first=candidate(),neighbor=candidate({id:202}),plane={pointQ8:[0x7fffffff,101,-101],distanceQ8:-12,fractionQ16:0},other={pointQ8:[1,100,-100],distanceQ8:-12,fractionQ16:32768},output=result();
 assert.equal(resolveTerrainSphereEdge(grid(),first,neighbor,plane,other,null,output,options),output);
 assert.deepEqual(output,{flags:2,pointQ8:[-1073741824,100,-101],normalQ16:[0,65536,0],distanceQ8:-12,cellRef:202,fractionQ16:0});
});
test('Smooth contact time, distance and flags come from the first plane while the closer plane selects the cell',()=>{
 const first=candidate(),neighbor=candidate({id:202}),plane={pointQ8:[0,2,4],distanceQ8:-20,fractionQ16:32768},other={pointQ8:[2,4,6],distanceQ8:-10,fractionQ16:0},output=result();
 resolveTerrainSphereEdge(grid(),first,neighbor,plane,other,null,output,options);
 assert.deepEqual(output,{flags:1,pointQ8:[1,3,5],normalQ16:[0,65536,0],distanceQ8:-20,cellRef:101,fractionQ16:32768});
});
test('Two border types use the smooth shortcut even when their normals oppose',()=>{
 const output=result();resolveTerrainSphereEdge(grid(),candidate({type:6}),candidate({type:7,id:202,packedNormal:pack([0,-256,0])}),{pointQ8:[0,0,0],distanceQ8:4,fractionQ16:256},{pointQ8:[2,4,6],distanceQ8:8,fractionQ16:0},null,output,options);
 assert.deepEqual(output,{flags:1,pointQ8:[1,2,3],normalQ16:[0,0,0],distanceQ8:4,cellRef:101,fractionQ16:256});
});
test('A nonsmooth terrain edge obtains its impact from the actual finite-edge sphere primitive',()=>{
 const output=result(),first=candidate(),neighbor=candidate({id:202,packedNormal:pack([256,0,0])}),geometry=grid(),before=structuredClone(geometry);
 resolveTerrainSphereEdge(geometry,first,neighbor,null,null,query(0,-10),output,options);
 assert.deepEqual(output,{flags:1,pointQ8:[0,0,-2560],normalQ16:[0,65536,0],distanceQ8:0,cellRef:101,fractionQ16:49152});
 assert.deepEqual(geometry,before);
});
test('Each authored exterior-edge disable bit suppresses type zero but permits other ordinary types',()=>{
 for(const [edgeCode,gateVertex,bit,x,z]of [[0,1,0x10,0,-10],[1,3,0x20,10,0],[2,2,0x10,0,10],[3,0,0x20,-10,0]]){
  const geometry=grid();geometry.sectors[0].vertices[gateVertex][3]=bit;
  const blocked=result(),before=structuredClone(blocked);resolveTerrainSphereEdge(geometry,candidate({edgeCode}),null,null,null,query(x,z),blocked,options);assert.deepEqual(blocked,before,`disabled edge ${edgeCode}`);
  const allowed=result();resolveTerrainSphereEdge(geometry,candidate({edgeCode,type:1}),null,null,null,query(x,z),allowed,options);
  assert.deepEqual(allowed,{flags:1,pointQ8:[x*256,0,z*256],normalQ16:[0,65536,0],distanceQ8:0,cellRef:101,fractionQ16:49152},`allowed edge ${edgeCode}`);
 }
});
test('Invalid signed edge codes preserve every existing result field',()=>{
 for(const edgeCode of [6,127,255]){
  const output={...result(),extra:{retained:true}},before=structuredClone(output);assert.equal(resolveTerrainSphereEdge(grid(),candidate({edgeCode}),null,null,null,null,output,options),output);assert.deepEqual(output,before);
 }
});
test('A null neighbor on the native border domain throws before modifying the result',()=>{
 const output=result(),before=structuredClone(output);assert.throws(()=>resolveTerrainSphereEdge(grid(),candidate({type:6}),null,null,null,null,output,options),/requires a neighbor/);assert.deepEqual(output,before);
});
