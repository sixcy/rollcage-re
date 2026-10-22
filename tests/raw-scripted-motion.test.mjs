import test from 'node:test';
import assert from 'node:assert/strict';
import {stepRawScriptedMotion,emitScriptedReleaseDebris,releaseRawScriptedBody} from '../src/raw-scripted-motion.mjs';
import {createRawScriptFixture,scriptFixtureAddresses as a} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p),get=(m,p)=>m.readInt32LE(p),vector=(m,p)=>[0,4,8].map(o=>get(m,p+o));
test('raw velocity opcode captures all signed source words before overlapping stores',()=>{
  const runtime=createRawScriptFixture(),m=runtime.memory,script=a.body+0x66;put(m,a.body+0x134,script);word(m,script,0);word(m,script+2,-2);word(m,script+4,3);word(m,script+6,-4);
  stepRawScriptedMotion(a.body,runtime);assert.deepEqual(vector(m,a.body+0x68),[-512,768,-1024]);assert.deepEqual(vector(m,a.body+0x40),[-512,768,-1024]);assert.equal(m.readUInt16LE(a.body+0x138),8);
});
test('raw teleport preserves forward alias propagation and previously tested insert flag',()=>{
  const runtime=createRawScriptFixture(),m=runtime.memory,script=a.body+0x2c;put(m,a.body+0x134,script);put(m,a.body,0x8000|26);word(m,script,2);put(m,script+4,5);put(m,script+8,111);put(m,script+12,222);
  stepRawScriptedMotion(a.body,runtime);assert.deepEqual(vector(m,a.body+0x34),[5,5,5]);assert.equal(m.readUInt16LE(a.body+0x138),16);
});
test('restart reads spawn words after earlier position stores when spawn storage aliases body',()=>{
  const runtime=createRawScriptFixture(),m=runtime.memory;put(m,a.pack+0xa8,a.body+0x32);word(m,a.body+0x32,7);word(m,a.body+0x34,9);word(m,a.body+0x36,11);word(m,a.script,5);word(m,a.script+200,4);word(m,a.body+0x138,200);
  stepRawScriptedMotion(a.body,runtime);assert.deepEqual(vector(m,a.body+0x34),[7<<16,0,7<<16]);assert.deepEqual(vector(m,a.body+0x68),[0,0,0]);
});
test('script pointer reload follows a spatial callback mutation between opcodes',()=>{
  const runtime=createRawScriptFixture(),m=runtime.memory,other=a.script+256;word(m,a.script,2);word(m,a.script+16,0);word(m,other+16,6);word(m,other+18,2);word(m,other+24,5);
  runtime.handlers={call474850:()=>put(m,a.body,0x8000|26),call474600:()=>assert.fail('Insertion was disabled before pose stores')};
  Object.defineProperty(runtime.handlers,'call474850',{value:()=>{put(m,a.body,0x8000|26);put(m,a.body+0x134,other);}});
  stepRawScriptedMotion(a.body,runtime);assert.equal(get(m,a.body+0x180),3);assert.equal(m.readUInt16LE(a.body+0x138),24);
});
test('segment completion performs dword timer clear and byte wrap before next opcode',()=>{
  const runtime=createRawScriptFixture(),m=runtime.memory;word(m,a.script,3);word(m,a.script+2,1);word(m,a.script+4,16);word(m,a.script+22,0);word(m,a.script+68,5);word(m,a.body+0x13a,1);word(m,a.body+0x13c,0xabcd);
  stepRawScriptedMotion(a.body,runtime);assert.equal(get(m,a.body+0x13a),0);assert.equal(m[a.body+0x13e],0);assert.equal(m.readUInt16LE(a.body+0x138),68);
});
test('script release emits RNG pairs even with no debris capacity and clears control flags',()=>{
  const runtime=createRawScriptFixture({freeCount:0}),m=runtime.memory;put(m,a.body,0x2000|26);put(m,a.body+0x108,7);const seed=get(m,0x5ec958);let expected=seed;for(let i=0;i<32;i++)expected=Math.imul(expected,0x41a7)&0x7fffffff;
  assert.equal(releaseRawScriptedBody(a.body,runtime),0);assert.equal(get(m,0x5ec958),expected);assert.equal(get(m,a.body)&0x2000,0);assert.equal(get(m,a.body)&0x1000,0x1000);assert.equal(get(m,a.body+0x108),6);assert.equal(get(m,0x902b88),0);
});
test('debris emission consumes free IDs, initializes stale rows and links the particle bucket',()=>{
  const runtime=createRawScriptFixture({freeCount:2}),m=runtime.memory;put(m,a.body+0x34,0x120000);put(m,a.body+0x38,0x340000);put(m,a.body+0x3c,-0x560000);emitScriptedReleaseDebris(a.body,7,runtime);
  assert.equal(get(m,0x902b8c),-1);assert.equal(get(m,0x902b88),2);assert.equal(m.readUInt16LE(a.active),1);assert.equal(m.readUInt16LE(a.active+2),0);for(let i=0;i<2;i++){const p=a.debris+i*128;assert.deepEqual(vector(m,p+0x4c),[0x120000,0x160000,-0x560000]);assert.equal(m.readUInt16LE(p+8),15);assert.equal(m[p+0x6c],1);assert.equal(get(m,p+0x30),0x9fff9f);assert.equal(get(m,p+12),a.bucket);}assert.notEqual(m.readUInt16LE(a.bucket+10),0);
});
test('unscripted release executes actual effect policies and installs the later collision filter',()=>{
  const runtime=createRawScriptFixture({freeCount:32}),m=runtime.memory;put(m,a.body,26);assert.equal(releaseRawScriptedBody(a.body,runtime),1);assert.equal(get(m,a.body+0x148),0x46e470);assert.equal(get(m,0x902b88),15);assert.notEqual(get(m,0x6e65c0),0);assert.equal(get(m,0x91cd60),1);
});

test('unscripted release publishes the actual relocated collision callback without rewriting heap pointers',()=>{
  const runtime=createRawScriptFixture({freeCount:32}),m=runtime.memory;put(m,a.body,26);
  assert.equal(releaseRawScriptedBody(a.body,{...runtime,moduleBaseAddress:0x6e0000}),1);
  assert.equal(m.readUInt32LE(a.body+0x148),0x74e470);
  assert.equal(m.readUInt32LE(0x902b84),a.debris);
});
test('self-restarting bytecode is bounded by an explicit workflow guard',()=>{
  const runtime=createRawScriptFixture();word(runtime.memory,a.script,4);assert.throws(()=>stepRawScriptedMotion(a.body,{...runtime,maxOpcodes:3}),/opcode budget/);
});
