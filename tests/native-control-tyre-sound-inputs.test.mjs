import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeControlTyreSound2CaptureRange,nativeControlTyreSound2ObservedRegions} from '../tools/lib/native-control-tyre-sound-inputs.mjs';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration} from '../tools/lib/native-parent-rtti-capture.mjs';

const base=0x500000,root=base+0x2f2414,begin=0x1000000,ownerAddress=0x2000000;
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function fixture({nullOwner=false}={}){
  const header=Buffer.concat([word(begin),word(begin+80),word(begin+256)]),bank=Buffer.alloc(256);
  bank.writeUInt32LE(nullOwner?0:ownerAddress,8);
  const rows=[{id:'header',address:root,bytes:header},{id:'control-sound-bank-storage',address:begin,bytes:bank,length:256,rangeMode:'vector-storage',vectorHeaderAddress:root,vectorHeaderHex:header.toString('hex'),vectorBegin:begin,vectorEnd:begin+80,vectorCapacity:begin+256,maxVectorBytes:65536},
    {id:'control-tyre-sound2-owner',address:nullOwner?0:ownerAddress,bytes:Buffer.alloc(nullOwner?0:0x490,0x73),length:nullOwner?0:0x490,rangeMode:'guarded-pointer',rootRva:'0x2f2414',moduleBaseAddress:base,guardedRootAddress:root,dereferenceOffsets:['0','0x8'],dereferenceMinimumValues:[1,1],guardedDeclaredLength:0x490,guardedStopIndex:nullOwner?1:null,guardedPointerReadBytes:8,guardedPointerSteps:[{index:0,readAddress:root,value:begin,minimumValue:1,bytesHex:word(begin).toString('hex')},{index:1,readAddress:begin+8,value:nullOwner?0:ownerAddress,minimumValue:1,bytesHex:word(nullOwner?0:ownerAddress).toString('hex')}]}];
  return {ranges:new Map(rows.map(row=>[row.id,row]))};
}

test('tyre input admits only actual original-entry code2 owner; NULL grants no memory',()=>{
  const regions=nativeControlTyreSound2ObservedRegions(fixture(),base);
  assert.equal(regions.length,1);assert.equal(regions[0].address,ownerAddress);assert.equal(regions[0].length,0x490);
  assert.deepEqual(nativeControlTyreSound2ObservedRegions(fixture({nullOwner:true}),base),[]);
});

test('tyre input refuses bad proof, mismatched owner, incomplete allocation and unused bank slot',()=>{
  for(const change of [
    s=>s.ranges.get('control-tyre-sound2-owner').guardedPointerSteps[1].readAddress++,
    s=>s.ranges.get('control-tyre-sound2-owner').address++,
    s=>s.ranges.get('control-tyre-sound2-owner').bytes=Buffer.alloc(0x48f),
    s=>s.ranges.get('control-tyre-sound2-owner').dereferenceMinimumValues=[1,257],
    s=>{const r=s.ranges.get('control-tyre-sound2-owner');r.rootAddress=root;delete r.rootRva;},
    s=>{const h=s.ranges.get('header').bytes;h.writeUInt32LE(begin+8,4);const b=s.ranges.get('control-sound-bank-storage');b.vectorEnd=begin+8;b.vectorHeaderHex=h.toString('hex');},
  ]){const snapshot=fixture();change(snapshot);assert.throws(()=>nativeControlTyreSound2ObservedRegions(snapshot,base));}
});

test('tyre capture is explicit and adds the exact same bounded input at all ten parent checkpoints',async()=>{
  const options={viewportMapGraph:true,weatherScreenQueries:true};
  const old=await createNativeParentRttiCaptureConfig('synthetic','never-launch',options);
  const off=await createNativeParentRttiCaptureConfig('synthetic','never-launch',{...options,tyreSound2:false});
  assert.deepEqual(off.configuration,old.configuration);
  const added=await createNativeParentRttiCaptureConfig('synthetic','never-launch',{...options,tyreSound2:true});
  const c=added.configuration,range=nativeControlTyreSound2CaptureRange();let count=0;
  for(const p of c.breakpoints){const rows=p.ranges.filter(row=>row.id===range.id);assert.deepEqual(rows,p.id.startsWith('native-control-')?[range]:[]);count+=rows.length;}
  assert.equal(count,10);assert.equal(c.maxSnapshots,21);assert.equal(c.maxDurationMs,90000);
  const restored=structuredClone(c);for(const p of restored.breakpoints)p.ranges=p.ranges.filter(row=>row.id!==range.id);
  assert.deepEqual(restored,old.configuration);assert.equal(verifyNativeParentRttiCaptureConfiguration(c).tyreSound2,true);
  for(const change of [
    x=>x.breakpoints.find(p=>p.id==='native-control-after').ranges.pop(),
    x=>x.breakpoints.find(p=>p.id==='native-control-after').ranges.find(r=>r.id===range.id).length++,
    x=>x.breakpoints[0].ranges.push(range),
    x=>x.breakpoints.find(p=>p.id==='native-control-before').ranges.push(range),
    x=>x.breakpoints.find(p=>p.id==='native-control-before').ranges=x.breakpoints.find(p=>p.id==='native-control-before').ranges.filter(r=>r.id!==range.id),
  ]){const bad=structuredClone(c);change(bad);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(bad));}
  await assert.rejects(createNativeParentRttiCaptureConfig('synthetic','never-launch',{tyreSound2:true,collisionSound19:false}));
  await assert.rejects(createNativeParentRttiCaptureConfig('synthetic','never-launch',{tyreSound2:1}));
});
