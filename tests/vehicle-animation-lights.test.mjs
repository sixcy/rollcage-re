import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVehicleAnimationColor,updateVehicleAnimationParameters,updateVehicleAnimationVertices,appendVehicleAnimationLight,updateVehicleAnimationLights} from '../src/vehicle-animation-lights.mjs';
import {updateDynamicLights} from '../src/dynamic-light-state.mjs';
import {formatRawLapTimeDigits} from '../src/lap-timing.mjs';
import {verifyVehicleAnimationLights} from '../tools/verify-vehicle-animation-lights-instructions.mjs';
const setup=()=>{const memory=Buffer.alloc(0xa00000),body=0x10000,state=body+0x2b88,session=0x30000,record=0x909300,runtime={memory,scratchBase:0x9000},put=(p,v)=>memory.writeInt32LE(v|0,p);put(0x5ecb1c,session);put(record,body);put(state+4,0x20000);put(0x20024,0x21000);return{memory,body,state,session,record,runtime,put};};

test('integer animation color retains hue wrap, unknown sectors and signed division',()=>{
 const {memory:m,runtime}=setup(),out=0x40000;convertVehicleAnimationColor(360,1024,1023,out,out+4,out+8,runtime);assert.deepEqual([0,4,8].map(o=>m.readInt32LE(out+o)),[31,0,0]);convertVehicleAnimationColor(361,1024,1023,out,out+4,out+8,runtime);assert.deepEqual([0,4,8].map(o=>m.readInt32LE(out+o)),[0,0,0]);convertVehicleAnimationColor(123,0,-34,out,out+4,out+8,runtime);assert.deepEqual([0,4,8].map(o=>m.readInt32LE(out+o)),[-1,-1,-1]);
});

test('recoil clamps while weapon threshold and signed-byte trigger retain distinct rules',()=>{
 const {memory:m,body,state,runtime,put}=setup();put(body+0x50c,1024*16384);m.writeInt16LE(1,body+0x6a0);m.writeInt16LE(14,body+0x6a2);m.writeInt16LE(37,state+0x2ea);m[state+0x2de]=200;updateVehicleAnimationParameters(body,state,runtime);assert.equal(m.readInt16LE(state+0x2e8),255);assert.equal(m.readInt16LE(state+0x2ea),37);assert.equal(m[state+0x2de],199);assert.equal(m[state+0x2dd],112);m.writeInt16LE(15,body+0x6a2);m[body+0x714]=64;updateVehicleAnimationParameters(body,state,runtime);assert.equal(m.readInt16LE(state+0x2ea),255);assert.equal(m[state+0x2de],10);assert.equal(m[state+0x2dd],127);
});

test('authored selected vertices use separate scaled flags and a signed count',()=>{
 const {memory:m,state,runtime}=setup();m.writeInt16LE(10,state+2);m[state+0x2dc]=2;m[state+0x2e0]=0;m[state+0x2e1]=1;m[state+0x2e4]=0;m[state+0x2e5]=1;updateVehicleAnimationVertices(state,0,0,runtime);assert.equal(m.readInt16LE(0x21004),-14);assert.equal(m.readInt16LE(0x2100c),-10);m[state+0x2dc]=128;const before=Buffer.from(m);updateVehicleAnimationVertices(state,65536,127,runtime);assert.ok(m.equals(before));
});

test('full light queue drops the append and omitted payload retains old bytes',()=>{
 const {memory:m,runtime,put}=setup();put(0x810920,16);const before=Buffer.from(m);appendVehicleAnimationLight(0,0,3,8,1,0,runtime);assert.ok(m.equals(before));put(0x810920,15);const row=0x8106e0+15*36;m.fill(0xa5,row+24,row+36);appendVehicleAnimationLight(0,0,0x10003,0x10008,-1,0,runtime);assert.equal(m.readUInt32LE(0x810920),16);assert.equal(m.readUInt16LE(row+16),3);assert.equal(m.readUInt16LE(row+18),8);assert.equal(m.readInt32LE(row+20),-1);assert.equal(m.subarray(row+24,row+36).toString('hex'),'a5'.repeat(12));
});

test('empty active session commits the once guard without enqueuing a light',()=>{
 const {memory:m,session,runtime,put}=setup();put(session+0x57c,4);updateVehicleAnimationLights(runtime);assert.equal(m.readInt32LE(0x6e6ca4),1);assert.equal(m.readInt32LE(0x810920),0);
});

test('actual light-update cookie word survives in the later animation queue payload',()=>{
 const {memory:m,session,body,runtime,put}=setup();put(0x5e8890,0x36d4c921);put(0x8ff4,0x12345678);updateDynamicLights(1,runtime);const cookie=(0x36d4c921^(0x9000-0x44))|0;assert.equal(m.readInt32LE(0x8ff8),cookie);m[session+0x54d]=1;put(session+0x57c,4);updateVehicleAnimationLights(runtime);assert.equal(m.readUInt32LE(0x8106f8),body);assert.equal(m.readInt32LE(0x8106fc),0x12345678);assert.equal(m.readInt32LE(0x810700),cookie);
});

test('raw lap formatter replaces the two stale payload words with its actual final locals',()=>{
 const {memory:m,session,body,record,runtime,put}=setup();m[session+0x54d]=1;put(session+0x57c,4);put(record+0x34,123456);formatRawLapTimeDigits(record,0,runtime);updateVehicleAnimationLights(runtime);assert.equal(m.readUInt32LE(0x8106f8),body);assert.equal(m.readInt32LE(0x8106fc),123456>>11);assert.equal(m.readUInt32LE(0x810700),record+0x4c);
});

test('constructed multi-vehicle animation lights match actual producers, formatter and consumers',async()=>{const r=await verifyVehicleAnimationLights({fixtures:6,frames:3,leafFixtures:20,output:null});assert.equal(r.matched,true);assert.equal(r.constructors,24);assert.equal(r.animationCalls,21);assert.ok(r.motionCalls>0);assert.ok(r.visits['44df50']>0);assert.ok(r.attachedLightObservations>0);});
