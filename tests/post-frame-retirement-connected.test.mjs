import test from 'node:test';
import assert from 'node:assert/strict';
import {runPostFrameBodyStates} from '../src/post-frame-body-states.mjs';

function checkFixture(retirementState=0){
 const memory=Buffer.alloc(0xa00000),A=0x10000,B=0x10200,C=0x10400,LIST=0x50000,ACTIVE=0x60000,REVERSE=0x61000,FREE=0x62000,BUCKET=0x71000,CONTROLLER=0x80000;
 const put=(p,value)=>memory.writeInt32LE(value|0,p),word=(p,value)=>memory.writeUInt16LE(value&65535,p),bodies=new Map();
 put(0x902bc0,LIST);word(0x902bc4,3);put(0x902eec,A);put(0x91e78c,ACTIVE);put(0x91e790,REVERSE);put(0x91e780,FREE);put(0x91e784,2);put(0x91e794,-1);put(0x91e798,3);
 [A,B,C].forEach((address,index)=>{
  put(LIST+index*4,address);memory[ACTIVE+index]=index;memory[REVERSE+index]=index;memory[address+0x140]=index;memory[address+0x10c]=0;
  put(address,[7,3,33][index]);put(address+0x128,index===1?0:32);put(address+12,(BUCKET+index*16)|1);word(BUCKET+index*16+8,((address-A)/128)+1);put(address+0x164,CONTROLLER+index*32);
  put(CONTROLLER+index*32,address);memory[CONTROLLER+index*32+4]=index===2?0:1;memory[CONTROLLER+index*32+5]=index===2?0:index;put(CONTROLLER+index*32+8,127);
  const body={address};Object.defineProperties(body,{flags:{get:()=>memory.readInt32LE(address),set:value=>put(address,value)},collisionState128:{get:()=>memory.readInt32LE(address+0x128)},field160:{get:()=>memory.readUInt16LE(address+0x160),set:value=>word(address+0x160,value)}});
  const controller={};Object.defineProperties(controller,{body:{get:()=>bodies.get(memory.readUInt32LE(CONTROLLER+index*32))},active4:{get:()=>memory[CONTROLLER+index*32+4],set:value=>{memory[CONTROLLER+index*32+4]=value;}},index5:{get:()=>memory[CONTROLLER+index*32+5]}});Object.defineProperty(body,'controller164',{get:()=>controller});bodies.set(address,body);
 });
 put(CONTROLLER+64+4,retirementState);let bursts=0;
 const array=new Proxy(Array(3).fill(null),{get:(target,key,receiver)=>typeof key==='string'&&/^\d+$/.test(key)?bodies.get(memory.readUInt32LE(LIST+Number(key)*4)):Reflect.get(target,key,receiver)});
 const group={bodies:array};Object.defineProperty(group,'count',{get:()=>memory.readUInt16LE(0x902bc4)});memory[0x849940]=1;
 //The prepass is an explicit caller fixture; every reached retirement/spatial/
 //physical operation uses its actual default and the same native bytes.
 const retirementHandlers=retirementState?{emitBurst435ba0:request=>{
  bursts++;assert.equal(request.position,0x9000-116);assert.equal(request.velocity,0x9000-128);assert.equal(request.scratchBase,0x9000-156);
  assert.deepEqual([0,4,8].map(offset=>memory.readInt32LE(request.position+offset)),[0,0x280000,0]);assert.deepEqual([0,4,8].map(offset=>memory.readInt32LE(request.velocity+offset)),[0,-0x400000,0]);put(0x90a548,123);
 }}:{};
 const result=runPostFrameBodyStates(group,{memory,scratchBase:0x9000,slots36:memory.subarray(0x849940,0x849940+36),handlers:{prepass:()=>{}},retirementHandlers});
 assert.deepEqual(result,{visitedBodies:2,respawnedBodies:0,retiredBodies:2,stoppedByType4:false});assert.equal(group.count,1);assert.equal(memory.readUInt32LE(LIST),B);assert.equal(memory.readUInt32LE(LIST+4),0);assert.equal(memory.readUInt32LE(LIST+8),0);
 assert.equal(memory.readInt32LE(0x91e798),1);assert.equal(memory.readInt32LE(0x91e784),0);assert.equal(memory.readInt32LE(0x91e794),1);assert.deepEqual([...memory.subarray(FREE,FREE+2)],[0,2]);assert.equal(memory[ACTIVE],1);assert.equal(memory[REVERSE+1],0);
 assert.equal(memory.readUInt16LE(BUCKET+8),0);assert.equal(memory.readUInt16LE(BUCKET+32+8),0);assert.equal(memory[0x849940],0);assert.equal(memory[CONTROLLER+4],0);assert.equal(memory.readUInt32LE(A)&0x8000,0x8000);assert.equal(memory.readUInt32LE(C)&0x8000,0x8000);
 assert.equal(bursts,retirementState?1:0);if(retirementState)assert.equal(memory.readInt32LE(0x903520),123);
}

test('post-frame retirement defaults compact shared physical arrays and collision IDs in place',()=>checkFixture());
test('post-frame actual type33 retirement preserves nested native stack arguments and live timestamp',()=>checkFixture(10));
