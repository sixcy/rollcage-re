import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVehicleContactColors,initializeVehicleContactColorTopology,initializeVehicleContactColorController,activateVehicleContactColors} from '../src/vehicle-contact-colors.mjs';
import {verifyVehicleContactColors} from '../tools/verify-vehicle-contact-colors-instructions.mjs';
import {verifyVehicleContactColorConstruction} from '../tools/verify-vehicle-contact-color-construction-instructions.mjs';

function fixture(count=1) {
  const memory=Buffer.alloc(0xa00000),put=(p,v)=>memory.writeInt32LE(v|0,p),record=0x10000,body=0x11000,owner=0x16000;
  put(record,body);put(body+0x6bc,owner);put(0x713184,0x20000);memory.writeUInt16LE(count,0x20004);put(0x7130d8,0x21000);put(owner+0x78,0x30000);put(0x5ec958,1);memory[owner]=1;memory[owner+8]=2;
  return{memory,record,owner};
}
test('inactive zero-level controller clears only its active byte',()=>{
  const f=fixture();f.memory[f.owner+8]=255;f.memory[f.owner+9]=99;updateVehicleContactColors(f.record,f);assert.equal(f.memory[f.owner],0);assert.equal(f.memory[f.owner+8],255);assert.equal(f.memory[f.owner+9],99);assert.equal(f.memory.readInt32LE(0x5ec958),1);
});
test('signed wave velocity damps toward zero and position is WORD-staged',()=>{
  const f=fixture();f.memory[f.owner+9]=16;f.memory[f.owner+0x39]=248;updateVehicleContactColors(f.record,f);assert.equal(f.memory[f.owner+8],1);assert.equal(f.memory.readInt8(f.owner+0x39),-7);assert.equal(f.memory.readInt16LE(0x713100),8);assert.equal(f.memory[f.owner+9],8);assert.equal(f.memory.readInt32LE(0x5ec958),0x41a7);assert.notEqual(f.memory.readInt32LE(0x30000),0);
});
test('negative values clamp before the staged value while velocity remains signed',()=>{
  const f=fixture();f.memory[f.owner+9]=255;f.memory[f.owner+0x39]=255;updateVehicleContactColors(f.record,f);assert.equal(f.memory.readInt16LE(0x713100),0);assert.equal(f.memory[f.owner+9],0);assert.equal(f.memory.readInt8(f.owner+0x39),0);
});
test('nonzero level keeps processing after countdown is already nonpositive',()=>{
  const f=fixture();f.memory[f.owner+1]=255;f.memory[f.owner+8]=128;updateVehicleContactColors(f.record,f);assert.equal(f.memory[f.owner],1);assert.equal(f.memory[f.owner+8],128);assert.equal(f.memory.readInt32LE(0x5ec958),0x41a7);
});
test('zero-node controller decrements its timer without advancing RNG',()=>{
  const f=fixture(0);updateVehicleContactColors(f.record,f);assert.equal(f.memory[f.owner+8],1);assert.equal(f.memory.readInt32LE(0x5ec958),1);
});
test('actual instruction comparison covers populated waves and overlapping outputs',async()=>{
  const r=await verifyVehicleContactColors({fixtures:64,frames:4,output:null});assert.equal(r.calls,96);assert.equal(r.matched,true);
});
test('one-based triangle topology deduplicates repeated faces in authored order',()=>{
  const f=fixture(3),m=f.memory;m.writeUInt16LE(2,0x20006);m.writeUInt32LE(0x22000,0x2000c);m.writeUInt32LE(0x23000,0x20040);Buffer.from([1,2,3]).copy(m,0x22000);Buffer.from([1,2,3]).copy(m,0x22008);m.writeFloatLE(1,0x5dc774);m.writeFloatLE(4096,0x5dca88);for(let i=0;i<3;i++)m.writeInt16LE(256,0x23000+i*8+i*2);
  let cursor=0x40000;initializeVehicleContactColorTopology({...f,handlers:{allocate:size=>{const result=cursor;cursor+=size+16;return result;}}});const topology=m.readUInt32LE(0x7130d8);assert.deepEqual([...m.subarray(topology,topology+3)],[2,1,2]);assert.deepEqual([...m.subarray(topology+8,topology+11)],[2,0,2]);assert.deepEqual([...m.subarray(topology+16,topology+19)],[2,0,1]);
});
test('controller constructor preserves uninitialized status/timer bytes and builds two records per face',()=>{
  const f=fixture(3),m=f.memory;m.writeUInt16LE(2,0x20006);m.writeUInt32LE(0x22000,0x90b990);m.writeUInt32LE(0x23000,0x90b988);m[f.owner+1]=99;m[f.owner+8]=88;m.fill(0xaa,0x23000+0x4e0,0x23000+0x4e0+10);let size;
  initializeVehicleContactColorController(f.owner,{...f,handlers:{allocate:n=>{size=n;return 0x40000;}}});assert.equal(size,408);assert.equal(m.readUInt32LE(f.owner+0x78),0x40190);assert.equal(m[0x40003],9);assert.equal(m[0x40007],0x9e);assert.equal(m[0x4012f],9);assert.equal(m[f.owner+1],99);assert.equal(m[f.owner+8],88);assert.equal(m.readInt32LE(f.owner+0x6c),-1);assert.equal(m.readInt32LE(f.owner+0x88),-1);
});
test('activation claims the first unused owner and reports exhausted network pool',()=>{
  const f=fixture(),m=f.memory;m.writeInt32LE(-1,f.memory.readUInt32LE(f.record)+0x6bc);m.writeInt32LE(0x81,0x6eafe0);m[0x8495e0]=1;assert.equal(activateVehicleContactColors(f.record,f),1);assert.equal(m.readUInt32LE(f.memory.readUInt32LE(f.record)+0x6bc),0x84966c);assert.equal(m[0x84966d],10);assert.equal(m.readInt32LE(0x849670),127);
  m.writeInt32LE(-1,f.memory.readUInt32LE(f.record)+0x6bc);for(let i=0;i<6;i++)m[0x8495e0+i*0x8c]=1;assert.equal(activateVehicleContactColors(f.record,f),0);
});
test('actual constructor and persistent hit-to-wave instruction chain',async()=>{
  const r=await verifyVehicleContactColorConstruction({fixtures:8,activations:24,chains:1,output:null});assert.equal(r.matched,true);assert.equal(r.calls,68);
});
