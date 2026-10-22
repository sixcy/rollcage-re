import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {loadRetainedListing} from '../tools/lib/retained-listing-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {filterVehicleCollision} from '../src/vehicle-collision-filter.mjs';
test('41e080 supplies actual active-child registers/code/return and preserves reached482730 shared stack',async()=>{
 const retained=await loadRetainedNativeProgram(),listing=await loadRetainedListing('analysis/vehicle-filter-listing.json','analysis/native-simulation/results/1454-vehicle-filter-bytes.json'),instructions=[...new Map([...retained.instructions,...listing.instructions].map(i=>[i.address,i])).values()].sort((a,b)=>a.address-b.address),K=0x9000,body=0x20000,event=0x30000,state=0x40000,lookup=0x41000;
 for(const timer of[0,1]){
  const m=retained.initializeMemory(Buffer.alloc(0xa00000)),d=(p,v)=>m.writeInt32LE(v|0,p);m.fill(0xa5,K-400,K+16);
  d(body,3);d(body+0x6bc,state);m[body+0x66f]=255;m[state]=1;m[state+1]=30;m[state+8]=timer;d(body+0x40,64<<14);d(event+4,body);d(event+0x38,65536);d(0x713180,lookup);for(let i=0;i<64;i++)m[lookup+i]=i;
  [4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>m.writeInt16LE(v,body+0xc4+i*2));d(K,-1);d(K+4,body);d(K+8,0);d(K+12,event);
  const machine=new BoundedX86(instructions,{entry:0x41e080,fpuPrecisionBits:24});m.copy(machine.bytes);Object.assign(machine.r,{ESP:K,EBX:0x11223344,EBP:0x22334455,ESI:0x33445566,EDI:0x44556677});const visits=new Set();machine.onInstruction=a=>visits.add(a);machine.run(100000);
  assert.equal(filterVehicleCollision(body,0,event,{memory:m,scratchBase:K,nativeStack:{entryRegisters:{ebx:0x11223344,ebp:0x22334455,esi:0x33445566,edi:0x44556677}}}),machine.r.EAX);
  assert.ok(visits.has(0x482730));assert.equal(visits.has(0x484bb0),timer===0);assert.deepEqual(m.subarray(K-400,K-40),machine.bytes.subarray(K-400,K-40));assert.deepEqual(m.subarray(0x10000),machine.bytes.subarray(0x10000));assert.equal(m.readUInt32LE(K-48),0x41e397);
 }
});
