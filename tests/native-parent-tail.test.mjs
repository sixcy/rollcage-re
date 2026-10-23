import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {executeNativeParentTail,continueNativeParentTail,verifyNativeParentTailEvidence} from '../tools/lib/native-parent-tail.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {replayNativeControlThroughPhysics} from '../tools/lib/native-control-physics.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {compareNativeControlOutput} from '../tools/check-native-frame-control-prefix.mjs';
import {nativeParentLateModuleRegions,nativeParentLateObservedInputRegions,nativeParentLateHeapInputRanges} from '../tools/lib/native-parent-late-inputs.mjs';

function emptyState(){
  const memory=Buffer.alloc(0xa00000),S=0x9000,session=0x10000;memory.writeUInt32LE(session,0x5ecb1c);memory.writeInt32LE(4,session+0x57c);memory.writeUInt32LE(1,S+24);
  return {memory,span:(address,length)=>memory.subarray(address,address+length),manifest:{moduleBaseAddress:0x400000,requiredRegions:[],observed:{participantCount:0}},views:createPhysicsRuntimeViews({memory,bodyLists:[]}),geometry:{grid:{},modelContext:{},candidateMapping:{},comparisonRegions:[]},sound:{soundRuntime:{memory},comparisonRegions:[]},numericalContext:{x87:{precisionBits:24,roundingMode:'nearest-even',exceptionMask:63},sse:{roundingMode:'nearest-even',exceptionMask:63,flushToZero:false,denormalsAreZero:false}},prefixReport:{childEsp:S,entryEsp:S+20,iteration:0,totalIterations:1},derivedPhysicsRegisters:{registers:{esp:S,ebx:0,ebp:0}},report:{childEsp:S}};
}
test('parent-tail boundaries match retained original target/call/return sites',async()=>{const proof=await verifyNativeParentTailEvidence();assert.equal(proof.evidenceIds.length,3);assert.equal(proof.targetSha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');});
test('ordinary recovery defers absent full recovery context and observers cannot skip its real call',()=>{
  const source=emptyState(),seen=[];const result=executeNativeParentTail(source,{through:'recovery',onStage:event=>{seen.push(event.stage);assert.equal(event.entryEsp,0x9000);return{skip:true,eax:999};}});
  assert.deepEqual(seen,['attachments','recovery']);assert.equal(result.report.parentReturned,false);assert.equal(result.report.completed,true);assert.deepEqual(result.report.stages[1].report,{respawnedBodies:0,retiredBodies:0,fullRecoveryContextReached:false});assert.equal(source.memory.readUInt32LE(0x9000),0x451021);assert.equal(source.manifest.requiredRegions.length,0);
});
test('actual attachment transform/target writes match retained44f050 and432080 atPC24',async()=>{
  const evidence=await readInstructionEvidence(['084-attachment-update-assembly.json','086-attachment-transform-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(evidence.instructions,{fpuPrecisionBits:24}),source=emptyState(),m=source.memory,body=0x20000,model=0x30000,target=0x90b688+8;
  m.writeUInt32LE(1,0x6e6ba0);m.writeUInt32LE(body,0x902040);m.writeUInt32LE(model,body+0x10);m.writeUInt16LE(0x100,model+0x4c);m.writeUInt16LE(0x1001,body+0x16a);m.writeFloatLE(1/4096,0x5dc5f4);[4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>m.writeInt16LE(v,body+0xc4+i*2));[10,-20,30].forEach((v,i)=>m.writeInt32LE(v<<16,body+0x34+i*4));[2,-3,4].forEach((v,i)=>m.writeInt16LE(v,model+0x100+i*2));
  m.copy(machine.bytes);machine.entry=0x44f050;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.run();
  const result=executeNativeParentTail(source,{through:'attachments'});assert.equal(result.report.stages[0].report.type1Writes,1);assert.deepEqual(m.subarray(target,target+8),machine.bytes.subarray(target,target+8));assert.deepEqual([0,2,4].map(o=>m.readInt16LE(target+o)),[12,-23,34]);assert.equal(m.readUInt32LE(0x6e6ba0),0);assert.equal(m.readUInt32LE(0x9000),0x45101c);
});
test('tail rejects missing source-derived frame state rather than taking observedafter registers',()=>{
  const state=emptyState();delete state.derivedPhysicsRegisters;assert.throws(()=>executeNativeParentTail(state,{through:'attachments'}),/completed source-carried|source-derived/);
});
const raw='analysis/native-physics-local/startup-20261022/control-prefix-v4-20261023';
test('originalV4 carriedsource admits observedscratch only and strictlyfails uncapturedtype2 pointer',{skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(raw),configuration=JSON.parse(await readFile(`${raw}/configuration.json`)),pair=pairNativeControlSnapshots(capture,configuration).pairs[0],source=replayNativeControlThroughPhysics(pair.before,pair.options),originalCount=source.memory.readUInt32LE(0x6e6ba0);let observers=0;
  assert.equal(originalCount,1);assert.throws(()=>continueNativeParentTail(source,{snapshot:pair.before,onStage:()=>observers++}),error=>{assert.equal(error.nativeParentTailProgress.stage,'attachments');assert.equal(error.nativeParentTailDependency.preferredAddress,0x80e7fc);assert.equal(error.nativeParentTailDependency.actualModuleAddress,0xaee7fc);return true;});assert.equal(observers,0);assert.equal(source.memory.readUInt32LE(0x6e6ba0),originalCount,'Failed probe uses a new carried source view, not its caller buffers.');
});

const parentRaw='analysis/native-physics-local/startup-20261022/parent-tail-v1-20261023';
test('original parent entry carries exact attachments, ordinary recovery and drive; full transition records detect changed and unchanged output corruption',{skip:!existsSync(`${parentRaw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(parentRaw),configuration=JSON.parse(await readFile(`${parentRaw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0];
  const options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  const source=replayNativeControlThroughPhysics(pair.before,{...options,additionalRegions:nativeParentTailAdditionalRegions(pair.before,options)}),seen=[];
  const transition=pair.moduleBaseAddress+0x511ba0,unchangedEntry=Buffer.from(source.span(transition,96));
  const result=continueNativeParentTail(source,{snapshot:pair.before,onStage:({stage,source:live,report})=>{
    const comparison=compareNativeControlOutput(live,pair.postphysics[stage]);
    assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));
    assert.equal(comparison.uniqueBytesCompared,4947762);
    seen.push(stage);
    if(stage==='recovery')assert.deepEqual(report,{respawnedBodies:0,retiredBodies:0,fullRecoveryContextReached:false});
  }});
  assert.deepEqual(seen,['attachments','recovery','drive']);
  assert.equal(result.report.completed,true);
  assert.equal(result.report.parentReturned,false,'No native late-parent or next-tick observation is claimed.');
  assert.deepEqual(source.span(transition,96),unchangedEntry,'Continuation never mutates its input source buffers.');
  for(const offset of [8,95]){
    const address=transition+offset,previous=result.span(address,1)[0];
    result.memory.writeUInt8(previous^1,address);
    const failed=compareNativeControlOutput(result,pair.postphysics.drive);
    assert.equal(failed.matched,false);
    assert.equal(failed.differingBytes,1);
    assert.equal(failed.firstDivergence.address,address);
    result.memory.writeUInt8(previous,address);
  }
  assert.equal(compareNativeControlOutput(result,pair.postphysics.drive).matched,true);
});

test('late source module admission requires whole observed spans and retains actual addresses without injecting tables',()=>{
  const base=0x6e0000,preferred=0x5704cc,address=base+preferred-0x400000,bytes=Buffer.from('abcdefabcdef','hex');
  const rows=nativeParentLateObservedInputRegions({ranges:[{address,bytes}]},base);
  const table=rows.find(row=>row.preferredAddress===preferred);assert.ok(table);assert.equal(table.length,6);assert.equal(table.address,address);assert.equal('bytes' in table,false);
  assert.deepEqual(bytes,Buffer.from('abcdefabcdef','hex'));
  assert.equal(nativeParentLateObservedInputRegions({ranges:[{address,bytes:bytes.subarray(0,5)}]},base).some(row=>row.preferredAddress===preferred),false);
  assert.equal(nativeParentLateModuleRegions.find(row=>row.id==='late-camera-records').length,4*0x184);
  assert.equal(nativeParentLateModuleRegions.find(row=>row.id==='late-camera-observers').length,40*56);
});

test('late heap profile uses explicit per-hop NULL guards and fixed constructor extents without sentinel or empty-vector chases',()=>{
  const ranges=nativeParentLateHeapInputRanges();assert.equal(new Set(ranges.map(row=>row.id)).size,ranges.length);
  for(const row of ranges){assert.equal(row.dereferenceOffsets.length,row.dereferenceMinimumValues.length);assert.ok(row.dereferenceMinimumValues.every(value=>value===1));assert.ok(Number.isInteger(row.length)&&row.length>0);assert.equal(row.readableRegion,undefined);assert.equal(row.vectorStorage,undefined);}
  assert.equal(ranges.find(row=>row.id==='late-weather-screen-allocation').length,0x1400);
  assert.equal(ranges.find(row=>row.id==='late-model-fragment-allocation').length,64*384);
  assert.deepEqual(ranges.filter(row=>row.id.startsWith('late-destruction-workspace')).map(row=>row.dereferenceOffsets),[['0x0','0x8c'],['0x0','0x134'],['0x0','0x1dc'],['0x0','0x284']]);
  assert.ok(ranges.every(row=>Number(row.rva)!==0x40dde0),'Weather minus-one sentinel needs a distinct proven guard.');
});

test('original saved parent late continuation binds observed cameras then strictly stops at its uncaptured immutable control table',{skip:!existsSync(`${parentRaw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(parentRaw),configuration=JSON.parse(await readFile(`${parentRaw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  const source=replayNativeControlThroughPhysics(pair.before,{...options,additionalRegions:nativeParentTailAdditionalRegions(pair.before,options)}),seen=[];
  assert.throws(()=>continueNativeParentTail(source,{snapshot:pair.before,through:'parent-return',onStage:row=>seen.push(row.stage)}),error=>{
    assert.equal(error.nativeParentTailProgress.stage,'render-and-late-state');
    assert.equal(error.nativeParentTailProgress.lastCall.entry,0x416400);
    assert.equal(error.nativeParentTailDependency.preferredAddress,0x5704d0);
    assert.equal(error.nativeParentTailDependency.actualModuleAddress,pair.moduleBaseAddress+0x1704d0);
    assert.match(error.message,/Uncaptured native memory/);return true;
  });
  assert.deepEqual(seen,['attachments','recovery','drive']);
});
