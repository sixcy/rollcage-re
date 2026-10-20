import test from 'node:test';
import assert from 'node:assert/strict';
import {updateWorldEffectRecords} from '../src/world-effect-records.mjs';
const options=(extra={})=>({count:1,effectFlag:1,originS16:[0,0,0],strength:0,...extra});
const record=(position,status)=>{const bytes=Buffer.alloc(16,0xa5);position.forEach((value,index)=>bytes.writeInt16LE(value,index*2));bytes[6]=status;return bytes;};

test('the world effect gate accepts any nonzero value and retains every unrelated byte',()=>{
 for(const effectFlag of [1,2,-1,-2147483648]){
  const bytes=record([40,0,0],10),expected=Buffer.from(bytes);expected[6]=11;
  assert.equal(updateWorldEffectRecords(bytes,options({effectFlag})),1);assert.deepEqual(bytes,expected);
 }
 const bytes=record([0,0,0],10),before=Buffer.from(bytes);assert.equal(updateWorldEffectRecords(bytes,options({effectFlag:0,strength:99})),0);assert.deepEqual(bytes,before);
});

test('signed nonpositive statuses are skipped and count bounds preserve trailing records',()=>{
 const bytes=Buffer.concat([record([0,0,0],0),record([0,0,0],128),record([0,0,0],255),record([0,0,0],1)]),before=Buffer.from(bytes);
 assert.equal(updateWorldEffectRecords(bytes,options({count:3,strength:-1})),0);assert.deepEqual(bytes,before);
 assert.equal(updateWorldEffectRecords(bytes,options({count:0})),0);assert.deepEqual(bytes,before);
});

test('strength uses max squared quarter-distance rather than summed Euclidean distance',()=>{
 const bytes=record([8,12,4],127);updateWorldEffectRecords(bytes,options({strength:1}));
 // max(2^2,3^2,1^2)=9;127+1-trunc(32768/9) clamps to zero.
 assert.equal(bytes.readUInt8(6),0);
 const diagonal=record([400,400,400],100);updateWorldEffectRecords(diagonal,options({strength:1}));assert.equal(diagonal[6],98);
});

test('arithmetic quarter-distance shifts distinguish negative and positive short differences',()=>{
 const negative=record([-65,0,0],127),positive=record([65,0,0],127);
 updateWorldEffectRecords(negative,options({strength:1}));updateWorldEffectRecords(positive,options({strength:1}));
 // -65>>2=-17 whereas65>>2=16:127+1-trunc(32768/289)=15.
 assert.equal(negative[6],15);assert.equal(positive[6],0);
});

test('coincident origin replaces a zero divisor and negative strength can wrap into a skipped status',()=>{
 const bytes=record([0,0,0],127);assert.equal(updateWorldEffectRecords(bytes,options({strength:-1})),1);assert.equal(bytes[6],128);
 const before=Buffer.from(bytes);assert.equal(updateWorldEffectRecords(bytes,options({strength:-1})),0);assert.deepEqual(bytes,before);
});

test('positive status truncates to a signed negative byte rather than saturating at127',()=>{
 const bytes=record([32767,-32768,32767],127);updateWorldEffectRecords(bytes,options());assert.equal(bytes[6],128);
 assert.equal(updateWorldEffectRecords(bytes,options()),0);assert.equal(bytes[6],128);
});

test('the strength shift wraps to signed32 and result arithmetic wraps before its zero clamp',()=>{
 const zeroShift=record([0,0,0],10);updateWorldEffectRecords(zeroShift,options({strength:-2147483648}));assert.equal(zeroShift[6],11);
 const minNumerator=record([0,0,0],10);updateWorldEffectRecords(minNumerator,options({strength:65536}));assert.equal(minNumerator[6],0);
});

test('the explicit record contract rejects incomplete storage and invalid signed-short origins',()=>{
 assert.throws(()=>updateWorldEffectRecords(Buffer.alloc(15),options()),/complete16-byte/);
 assert.throws(()=>updateWorldEffectRecords(Buffer.alloc(16),options({count:2})),/in-bounds count/);
 assert.throws(()=>updateWorldEffectRecords(Buffer.alloc(16),options({originS16:[32768,0,0]})),/signed-short origin/);
});
