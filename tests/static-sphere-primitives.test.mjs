import test from 'node:test';
import assert from 'node:assert/strict';
import {queryPointSphereContact,queryEdgeSphereContact} from '../src/static-sphere-primitives.mjs';
const options={roundingMode:'nearest-even'},fresh=()=>({point:[7,8,9],normal:[10,11,12],scalar:99,flags:-1});
const edge=(query,output,time=65536)=>queryEdgeSphereContact(query,[-10,0,0],[10,0,0],[256,0,0],output,time,options);
test('Point and edge contacts compute a three-quarter-frame impact from Q8 geometry',()=>{
 const query={originQ8:[0,1024,0],deltaQ8:[0,-1024,0],radiusQ8:256},point=fresh(),line=fresh();
 assert.equal(queryPointSphereContact(query,[0,0,0],point,65536,options),49152);
 assert.equal(edge(query,line),49152);
 assert.deepEqual(point,{point:[0,0,0],normal:[0,256,0],scalar:768,flags:1});
 assert.deepEqual(line,{point:[0,0,0],normal:[0,256,0],scalar:0,flags:1});
});
test('Stationary penetration clears flags while preserving the remaining output',()=>{
 const query={originQ8:[0,128,0],deltaQ8:[0,0,0],radiusQ8:256};
 for(const run of [o=>queryPointSphereContact(query,[0,0,0],o,65536,options),o=>edge(query,o)]){
  const output=fresh();assert.equal(run(output),65536);assert.deepEqual(output,{...fresh(),flags:0});
 }
});
test('Separating penetration is accepted by the point routine and rejected by the edge routine',()=>{
 const query={originQ8:[0,128,0],deltaQ8:[0,256,0],radiusQ8:256},point=fresh(),line=fresh();
 assert.equal(queryPointSphereContact(query,[0,0,0],point,65536,options),0);
 assert.deepEqual(point,{point:[0,0,0],normal:[0,256,0],scalar:-128,flags:2});
 assert.equal(edge(query,line),65536);assert.deepEqual(line,{...fresh(),flags:0});
});
test('A rejected point quadratic retains the precomputed distance scalar',()=>{
 const output=fresh();assert.equal(queryPointSphereContact({originQ8:[512,128,0],deltaQ8:[-512,512,0],radiusQ8:256},[0,0,0],output,65536,options),65536);
 assert.deepEqual(output,{...fresh(),scalar:256,flags:0});
});
test('Finite-edge endpoint rejection retains the computed infinite-line contact',()=>{
 const output=fresh();assert.equal(edge({originQ8:[20*256,128,0],deltaQ8:[0,-256,0],radiusQ8:256},output),65536);
 assert.deepEqual(output,{point:[20*256,0,0],normal:[0,256,0],scalar:-128,flags:0x100000});
});
test('Native cache records and plain queries produce identical contacts without input mutation',()=>{
 const record=Buffer.alloc(72,0xa5),position=[0,1024,0],velocity=[0,-1024,0];position.forEach((v,i)=>record.writeInt32LE(v,8+i*4));velocity.forEach((v,i)=>record.writeInt32LE(v,20+i*4));record.writeInt32LE(256,64);const before=Buffer.from(record),output=fresh();
 assert.equal(edge(record,output),49152);assert.deepEqual(output,{point:[0,0,0],normal:[0,256,0],scalar:0,flags:1});assert.ok(record.equals(before));
});
