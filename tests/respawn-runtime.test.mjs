import test from 'node:test';
import assert from 'node:assert/strict';
import {createRespawnRuntime} from '../src/respawn-runtime.mjs';
import {BodySpatialRegistry} from '../src/body-spatial.mjs';
import skill from '../src/finish-skill-tables.json' with {type:'json'};

const A=0x10000,B=0x18000,SESSION=0x60000,SECOND=0x62000,PACK=0x64000,GROUPS=0x65000,POINTS=0x66000,BUCKET=0x67000,FALLBACK=0x68000,CHECKPOINTS=0x69000,IDS=0x69100,RECORD=0x909300,STRIDE=0x30c;
function fixture({lap=1,mode=0,bodyMode=8,completionHandlers={}}={}){
 const memory=Buffer.alloc(0xa00000),routeObject={byte05:99},calls=[];let registry;
 memory.writeUInt32LE(SESSION,0x5ecb1c);memory.writeUInt32LE(PACK,0x90b98c);memory.writeInt32LE(600,0x90a548);memory.writeUInt32LE(A,0x902eec);
 for(const session of [SESSION,SECOND]){memory[session+0x54d]=1;memory[session+0x551]=mode;memory[session+0x579]=0;memory[session+0x586]=3;memory.writeInt32LE(5,session+0x57c);}
 memory[PACK+0x44]=2;memory[PACK+0x46]=2;memory.writeUInt32LE(GROUPS,PACK+0x60);memory.writeUInt32LE(CHECKPOINTS,PACK+0x70);memory.writeUInt32LE(FALLBACK,PACK+0x7c);memory.writeUInt32LE(IDS,PACK+0x90);
 memory.writeUInt16LE(2,GROUPS+12);memory[GROUPS+12+5]=7;memory.writeUInt32LE(POINTS,GROUPS+12+8);memory.writeInt16LE(10,POINTS+16);memory.writeUInt32LE(1<<16,FALLBACK);
 for(let index=0;index<2;index++){
  const cp=CHECKPOINTS+index*20;memory[cp]=0;memory[cp+1]=index;memory.writeUInt16LE(index?32768:0,cp+2);memory.writeInt16LE(index?-200:-100,cp+4);memory.writeInt16LE(64,cp+12);memory[cp+18]=index?0:1;
  memory.fill(255,IDS+index*4,IDS+index*4+4);memory[IDS+index*4]=index;
  const address=index?B:A,record=RECORD+index*STRIDE;memory.writeUInt32LE(address,record);memory.writeUInt32LE(0x30000+index*0x100,record+0x18);memory[record+0x1c]=lap;memory[record+0x1e]=lap;memory.writeInt32LE(50000,record+0x24);memory.writeInt32LE(12345<<11,record+0x2c);memory.writeInt32LE(-1,record+0x30);memory[0x30039+index*0x100]=2;
  memory.writeInt32LE(0x803,address);memory.writeUInt32LE(BUCKET,address+0xc);memory.writeInt32LE(0,address+0x11c);memory.writeUInt16LE(index,address+0x65e);memory.writeInt16LE(4,address+0x668);memory[address+0x671]=1;memory[address+0x718]=bodyMode;
  memory.writeInt16LE(4096,address+0xc4);memory.writeInt16LE(4096,address+0xcc);memory.writeInt16LE(4096,address+0xd4);memory.writeInt32LE(65536,address+0x58);memory.writeInt32LE(100,address+0x650);for(let wheel=0;wheel<4;wheel++)memory.writeInt32LE(100+wheel,address+0x37c+wheel*200);
 }
 Buffer.from(skill.hex,'hex').copy(memory,0x570680);
 const adapter=createRespawnRuntime({memory,recordCount:2,bodyStorage:[{address:A,length:0x4000},{address:B,length:0x4000}],routeAddresses:new Map([[routeObject,GROUPS+12]]),scratchBase:0x80000,trackBasis:()=>[65536,0,0],completionHandlers,spatialHandlers:{removeSpatial:body=>{calls.push(['remove',body.address]);registry.remove(body);},insertSpatial:body=>{calls.push(['insert',body.address]);registry.insert(body);}}});
 registry=new BodySpatialRegistry([{body:adapter.bodyAt(A),poolOffset:0},{body:adapter.bodyAt(B),poolOffset:B-A}],()=>({bucket:adapter.bucketAt(BUCKET),outside:false}));registry.insert(adapter.bodyAt(A));
 const request={position:[0,0,0],quaternion:[65536,0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],progressionPointer:routeObject,progressionValue:0,closestTerrain11c:0};
 return {memory,routeObject,adapter,calls,registry,request,apply:()=>adapter.apply(A,request)};
}

test('body vectors stay byte-backed for individual writes, whole-array replacement and old aliases',()=>{
 const {memory,adapter}=fixture(),body=adapter.bodyAt(A),position=body.position;
 assert(Array.isArray(position));position[0]=123;assert.equal(memory.readInt32LE(A+0x34),123);memory.writeInt32LE(-456,A+0x38);assert.equal(position[1],-456);
 body.position=[7,8,9];assert.equal(body.position,position);assert.deepEqual(position.slice(),[7,8,9]);assert.deepEqual(Array.from(body.bytes.subarray(0x34,0x40)),Array.from(memory.subarray(A+0x34,A+0x40)));
 const rotation=body.rotation;body.rotation=[65535,32768,1,2,3,4,5,6,7];assert.equal(rotation[0],-1);assert.equal(rotation[1],-32768);assert.throws(()=>position.push(10),/native span/);assert.throws(()=>{position.length=1;},/fixed native spans/);
});

test('ordinary respawn runs actual checkpoint, lap and finish parents without syncing objects',()=>{
 const {memory,adapter,calls,apply}=fixture();apply();
 assert.deepEqual(adapter.stats,{applications:1,progressCalls:1,lapCalls:1,finishCalls:1});assert.deepEqual(calls,[['remove',A],['insert',A]]);
 const record=adapter.runtime.records[0],body=adapter.bodyAt(A);
 assert.equal(record.lap1c,2);assert.equal(memory[RECORD+0x1e],2);assert.equal(record.progress24,0);assert.equal(memory.readUInt32LE(RECORD+0x30),12345<<11);assert.equal(memory.readUInt32LE(RECORD+0x38),12345<<11);assert.equal(memory.readUInt32LE(RECORD+0x4c),Math.trunc(600*2048/3));assert.equal(memory[A+0x66c],0xbf);assert.equal(memory[A+0x671],0);
 assert.equal(record.respawn54,adapter.routeAt(GROUPS+12));assert.equal(body.checkpoint6c0,7);assert.equal(body.checkpoint6c2,0);assert.equal(memory[0x30039],6);assert(adapter.vehicleStateFor(body).wheels.every(wheel=>wheel.spin===0));assert.equal(memory.readInt32LE(A+0x650),0);
});

test('full finish uses actual bookkeeping, replay dispatch and the session input flag',()=>{
 const value=fixture({lap:3,bodyMode:0});value.apply();
 const {memory,adapter}=value;assert.equal(adapter.stats.finishCalls,1);assert.equal(memory[RECORD+0x249]&1,1);assert.equal(memory[A+0x718],8);assert.equal(memory.readInt32LE(SESSION+0x57c),6);assert.equal(memory.readInt32LE(SESSION+0x580),0);assert.equal(memory[RECORD+0x1c],4);assert.equal(memory.readUInt16LE(A+0x6c0),7);assert.equal(memory.readUInt16LE(A+0x6c2),0);assert.equal(memory.readUInt16LE(0x91ffb2),1);assert.equal(memory.readInt32LE(0x91ce90)&2,2);
});

test('raw pointer and session changes in reached completion hooks remain coherent on reload',()=>{
 let value;value=fixture({completionHandlers:{call47b920:({memory,ecx})=>{assert.equal(ecx,RECORD);value.adapter.runtime.records[0].body00=value.adapter.bodyAt(B);memory.writeUInt32LE(SECOND,0x5ecb1c);value.adapter.bodyAt(A).vehicleIndex65e=1;}}});value.memory[A+0x671]=0;value.memory[SESSION+0xa86]=1;value.apply();
 assert.equal(value.adapter.runtime.records[0].body00,value.adapter.bodyAt(B));assert.equal(value.adapter.runtime.session.address,SECOND);assert.equal(value.memory.readUInt32LE(RECORD),B);assert.equal(value.memory[B+0x671],0);assert.equal(value.memory[0x30039],2);assert.equal(value.memory[0x30139],6);
});

test('pack/route/point and controller pointer views read live memory without caching values',()=>{
 const {memory,adapter,routeObject}=fixture(),record=adapter.runtime.records[0],pack=adapter.runtime.pack;
 record.respawn54=routeObject;const route=record.respawn54;assert.equal(route.byte05,7);memory[GROUPS+17]=21;assert.equal(route.byte05,21);assert.equal(pack.groups[1],route);const first=route.pointAt(0);first.position[2]=-12;assert.equal(memory.readInt16LE(POINTS+4),-12);assert.equal(route.points[0],first);
 const controller=record.controller18;controller.flags39=0x87;assert.equal(memory[0x30039],0x87);memory.writeUInt32LE(0x12345678,RECORD+0x18);assert.equal(record.controller18,0x12345678);memory.writeUInt32LE(B,RECORD);assert.equal(record.body00,adapter.bodyAt(B));
 memory[PACK+0x44]=1;assert.equal(pack.checkpointIds90.length,4);memory.writeUInt32LE(IDS+4,PACK+0x90);assert.equal(pack.checkpointIds90[0],1);
});

test('declared special mode bypasses progression and its counters alias session bytes',()=>{
 const value=fixture({mode:3});value.memory[SESSION+8]=2;value.apply();assert.equal(value.memory[SESSION+8],1);assert.equal(value.adapter.runtime.session.counters08[0],1);assert.equal(value.adapter.stats.progressCalls,0);assert.equal(value.adapter.stats.finishCalls,0);
});

test('missing mapped bodies/routes and unreadable checkpoint memory remain explicit errors',()=>{
 const value=fixture({lap:3,bodyMode:0});assert.throws(()=>value.adapter.bodyAt(0x77777),/no supplied storage/);assert.throws(()=>value.adapter.apply(A,{...value.request,progressionPointer:{}}),/no supplied native address/);value.memory.writeUInt32LE(value.memory.length-1,PACK+0x90);assert.throws(()=>value.adapter.runtime.pack.checkpointIds90,/exceeds supplied memory/);
});
