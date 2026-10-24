import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {nativeSourceCarriedRanges} from '../tools/lib/native-source-carried-ranges.mjs';

function fixture(nullOwner=false){
  const pointer=nullOwner?0:0x2000,bytes=Buffer.alloc(4);bytes.writeUInt32LE(pointer);
  return [{id:'root',address:0x1000,length:4,bytes,moduleBaseAddress:0x400000},
    {id:'owner',address:pointer,bytes:Buffer.alloc(nullOwner?0:8,0x21),length:nullOwner?0:8,rangeMode:'guarded-pointer',rootAddress:0x1000,dereferenceOffsets:['0'],dereferenceMinimumValues:[1],guardedRootAddress:0x1000,guardedDeclaredLength:8,guardedStopIndex:nullOwner?0:null,guardedPointerReadBytes:4,guardedPointerSteps:[{index:0,readAddress:0x1000,value:pointer,minimumValue:1,bytesHex:bytes.toString('hex')}]}];
}

test('a source-mutated pointer carries original storage without claiming a new native guard observation',()=>{
  const original=fixture(),source=createCapturedMemory(original);
  source.memory.writeUInt32LE(0x3000,0x1000);source.memory.writeUInt32LE(0xabcdef,0x2000);
  const carried=nativeSourceCarriedRanges(original,source),bound=createCapturedMemory(carried);
  assert.equal(bound.memory.readUInt32LE(0x1000),0x3000);
  assert.equal(bound.memory.readUInt32LE(0x2000),0xabcdef);
  assert.throws(()=>bound.memory.readUInt32LE(0x3000),/Uncaptured/);
  assert.equal(original[0].bytes.readUInt32LE(),0x2000);
  assert.equal(original[1].guardedPointerSteps[0].value,0x2000);
  for(const row of carried){assert.equal(row.origin,'source-carried-original-span');assert.equal(row.guardedPointerSteps,undefined);assert.equal(row.sha256,undefined);}
});

test('a false original guard grants no storage even if source later writes a new pointer',()=>{
  const original=fixture(true),source=createCapturedMemory(original);source.memory.writeUInt32LE(0x3000,0x1000);
  const carried=nativeSourceCarriedRanges(original,source);assert.deepEqual(carried.map(row=>row.id),['root']);
  assert.throws(()=>createCapturedMemory(carried).memory.readUInt32LE(0x3000),/Uncaptured/);
});

test('carrying source state does not repair corrupted original proof or missing source coverage',()=>{
  const original=fixture(),source=createCapturedMemory(original);original[1].guardedPointerSteps[0].value++;
  assert.throws(()=>nativeSourceCarriedRanges(original,source),/Invalid captured guarded pointer/);
  assert.throws(()=>nativeSourceCarriedRanges(fixture(),createCapturedMemory([{address:0x1000,bytes:Buffer.alloc(4)}])),/Uncaptured/);
});
