import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeControlSound19CaptureRanges,nativeControlSound19ObservedRegions} from '../tools/lib/native-control-sound-inputs.mjs';
import {createNativeParentTailCaptureConfig} from '../tools/prepare-native-parent-tail-capture.mjs';

function fixture(owner=0x1200000){
  const base=0x6e0000,header=base+0x2f2414,begin=0x1100000,head=Buffer.alloc(12),storage=Buffer.alloc(96*4);
  head.writeUInt32LE(begin);head.writeUInt32LE(begin+64*4,4);head.writeUInt32LE(begin+storage.length,8);storage.writeUInt32LE(owner,19*4);
  const word=value=>{const bytes=Buffer.alloc(4);bytes.writeUInt32LE(value);return bytes.toString('hex');};
  const ownerRow={id:'control-sound19-owner',rootRva:'0x2f2414',moduleBaseAddress:base,rangeMode:'guarded-pointer',dereferenceOffsets:['0','0x4c'],dereferenceMinimumValues:[1,1],
    guardedRootAddress:header,guardedDeclaredLength:0x490,guardedStopIndex:owner?null:1,guardedPointerReadBytes:8,
    guardedPointerSteps:[{index:0,readAddress:header,value:begin,minimumValue:1,bytesHex:word(begin)},{index:1,readAddress:begin+19*4,value:owner,minimumValue:1,bytesHex:word(owner)}],
    address:owner,length:owner?0x490:0,bytes:Buffer.alloc(owner?0x490:0,0xa5)};
  const ranges=[{id:'sound-owner-vector-roots',address:header,length:12,bytes:head},
    {id:'control-sound-bank-storage',address:begin,length:storage.length,bytes:storage,rangeMode:'vector-storage',vectorHeaderAddress:header,vectorHeaderHex:head.toString('hex'),vectorBegin:begin,vectorEnd:begin+64*4,vectorCapacity:begin+storage.length,maxVectorBytes:65536},ownerRow];
  return {base,begin,owner,head,ranges};
}

test('collision sound admits full observed bank capacity and the exact original guarded owner without mutation',()=>{
  const f=fixture(),before=f.ranges.map(row=>Buffer.from(row.bytes)),regions=nativeControlSound19ObservedRegions({ranges:f.ranges},f.base);
  assert.deepEqual(regions.map(row=>[row.address,row.length]),[[f.begin,96*4],[f.owner,0x490]]);
  assert.ok(regions.every(row=>row.comparison==='mutable'&&!Object.hasOwn(row,'bytes')));
  f.ranges.forEach((row,index)=>assert.deepEqual(row.bytes,before[index]));
});

test('observed null bank entry grants no owner bytes and does not invent a default object',()=>{
  const f=fixture(0),regions=nativeControlSound19ObservedRegions({ranges:f.ranges},f.base);
  assert.equal(regions.length,1);assert.equal(regions[0].address,f.begin);
  f.ranges[2].bytes=Buffer.alloc(0x490);
  assert.throws(()=>nativeControlSound19ObservedRegions({ranges:f.ranges},f.base));
});

test('collision bank rejects truncated capacity, wrong header, out-of-used index and altered pointer proof',()=>{
  for(const mutate of [
    f=>{f.ranges[1].bytes=f.ranges[1].bytes.subarray(0,-4);},
    f=>{f.ranges[1].vectorHeaderAddress++;},
    f=>{f.ranges[1].maxVectorBytes=131072;},
    f=>{f.head.writeUInt32LE(f.begin+19*4,4);f.ranges[1].vectorEnd=f.begin+19*4;f.ranges[1].vectorHeaderHex=f.head.toString('hex');},
    f=>{f.ranges[2].guardedPointerSteps[1].value++;},
    f=>{f.ranges[2].bytes=f.ranges[2].bytes.subarray(0,-1);},
    f=>{f.ranges.pop();},
  ]){const f=fixture();mutate(f);assert.throws(()=>nativeControlSound19ObservedRegions({ranges:f.ranges},f.base));}
});

test('optional bank/owner observation applies to every independent parent checkpoint and leaves legacy profiles intact',async()=>{
  const options={through:'world-effects',collisionSound19:true},prepared=await createNativeParentTailCaptureConfig('synthetic','never-launched-sound19',options),descriptors=nativeControlSound19CaptureRanges();
  for(const point of prepared.configuration.breakpoints.filter(row=>row.id.startsWith('native-control-'))){
    assert.deepEqual(point.ranges.filter(row=>descriptors.some(expected=>expected.id===row.id)),descriptors);
  }
  assert.equal(prepared.configuration.maxDurationMs,90000);assert.equal(prepared.configuration.maxSnapshots,13);
  assert.equal(prepared.configuration.captureThreadEnvironment,true);
  const legacy=await createNativeParentTailCaptureConfig('synthetic','never-launched-legacy');
  assert.ok(legacy.configuration.breakpoints.every(point=>point.ranges.every(row=>!descriptors.some(expected=>expected.id===row.id))));
  await assert.rejects(()=>createNativeParentTailCaptureConfig('synthetic','never-launched-invalid',{collisionSound19:'yes'}),/boolean/);
});
