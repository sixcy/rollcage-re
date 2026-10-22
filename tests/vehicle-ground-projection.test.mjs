import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothVehicleGroundProjection,writeVehicleGroundProjection,computeVehicleProjectionCorner,updateVehicleGroundProjection} from '../src/vehicle-ground-projection.mjs';
import {verifyVehicleGroundProjection} from '../tools/verify-vehicle-ground-projection-instructions.mjs';
const setup=()=>{const memory=Buffer.alloc(0xa00000),body=0x10000,normal=0x20000,relative=0x21000,contact=0x22000,runtime={memory,scratchBase:0x9000},put=(p,v)=>memory.writeInt32LE(v|0,p),store=(p,values)=>values.forEach((v,i)=>put(p+i*4,v));return{memory,body,normal,relative,contact,runtime,put,store};};

test('nonpositive fractions and missing contacts preserve stale smoothing and output vectors',()=>{
 const f=setup(),{memory:m,body,normal,relative,contact,put,runtime}=f;m.fill(0x5a,body,body+0x4000);m.fill(0xa6,normal,contact+40);put(contact+28,1);const before=Buffer.from(m);assert.equal(smoothVehicleGroundProjection(body,normal,relative,0,contact,runtime),0);assert.ok(m.equals(before));put(contact+28,0);const missing=Buffer.from(m);assert.equal(smoothVehicleGroundProjection(body,normal,relative,1,contact,runtime),0);assert.ok(m.equals(missing));
});

test('normal smoothing preloads the next component before an aliased output store',()=>{
 const {memory:m,body,relative,contact,store,put,runtime}=setup();store(body+0x2958,[8,12,16]);store(contact+12,[0,0,0]);put(contact+28,1);assert.equal(smoothVehicleGroundProjection(body,body+0x295c,relative,1,contact,runtime),1);assert.deepEqual([0,4,8,12].map(o=>m.readInt32LE(body+0x2958+o)),[6,9,12,12]);
});

test('normal averaging wraps before signed division and truncates toward zero',()=>{
 const {memory:m,body,normal,relative,contact,store,put,runtime}=setup();store(body+0x34,[65536,-65536,0]);store(body+0x2958,[-1,-2147483648,7]);store(contact,[256,-256,0]);store(contact+12,[0,2147483647,0]);put(contact+28,1);smoothVehicleGroundProjection(body,normal,relative,1,contact,runtime);assert.deepEqual([0,4,8].map(o=>m.readInt32LE(normal+o)),[0,0,5]);assert.deepEqual([0,4,8].map(o=>m.readInt32LE(relative+o)),[0,0,0]);
});

test('near-horizontal rejection clears only the visibility byte',()=>{
 const {memory:m,body,normal,relative,store,runtime}=setup();store(normal,[123,4095,456]);m.fill(0x5a,body+0x728,body+0x748);const before=Buffer.from(m);writeVehicleGroundProjection(body,normal,relative,runtime);before[body+0x72e]=0;assert.ok(m.equals(before));
});

test('upright projection emits the native corner order, normal lift and shade',()=>{
 const {memory:m,body,normal,relative,store,runtime}=setup();store(body+0x34,[10,-30,20].map(v=>v*65536));store(normal,[0,-65536,0]);store(relative,[0,30*65536,0]);[4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>m.writeInt16LE(v,body+0xc4+i*2));m[body+0x72e]=1;writeVehicleGroundProjection(body,normal,relative,runtime);assert.equal(m.readInt32LE(normal+4),65536);assert.equal(m[body+0x72e],1);assert.deepEqual(Array.from({length:4},(_,i)=>[0,2,4].map(o=>m.readInt16LE(body+0x728+i*8+o))),[[-46,-4,-36],[66,-4,-36],[-46,-4,76],[66,-4,76]]);assert.deepEqual(Array.from({length:4},(_,i)=>m[body+0x72f+i*8]),[68,68,68,68]);
});

test('corner writes reread body coordinates after an overlapping X output',()=>{
 const {memory:m,body,normal,store,put,runtime}=setup(),forward=0x23000,right=0x23100;store(body+0x34,[10,20,30].map(v=>v*65536));store(forward,[0,0,65536]);store(right,[65536,0,0]);store(normal,[0,65536,0]);const height=computeVehicleProjectionCorner(body,forward,right,body+0x38,normal,0,0,runtime);assert.equal(height,0);assert.deepEqual([0,4,8].map(o=>m.readInt32LE(body+0x38+o)),[11,0,31]);
});

test('an empty session requires no terrain query context and preserves public memory',()=>{
 const {memory:m,runtime,put}=setup();put(0x5ecb1c,0x30000);const before=Buffer.from(m.subarray(0x10000));updateVehicleGroundProjection(runtime);assert.ok(m.subarray(0x10000).equals(before));
});

test('connected physics, actual terrain projection and raw aliases match retained instructions',async()=>{const r=await verifyVehicleGroundProjection({fixtures:8,frames:2,leafFixtures:20,output:null});assert.equal(r.matched,true);assert.equal(r.projectionCalls,19);assert.equal(r.parentAliasCases,3);assert.ok(r.projected>0);assert.ok(r.misses>0);assert.ok(r.visits['424ff0']>0);assert.equal(r.leafCalls,60);});
