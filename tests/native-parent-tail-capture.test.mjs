import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createNativeParentTailCaptureConfig} from '../tools/prepare-native-parent-tail-capture.mjs';
import {pairNativeControlSnapshots,nativeControlTailBoundaries,nativeControlLateBoundaries,verifyNativeControlCaptureConfiguration} from '../tools/lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {replayNativeControlThroughPhysics} from '../tools/lib/native-control-physics.mjs';
import {continueNativeParentTail} from '../tools/lib/native-parent-tail.mjs';
import {nativeParentLateReplayRegions} from '../tools/check-native-parent-tail.mjs';
import {compareNativeControlOutput} from '../tools/check-native-frame-control-prefix.mjs';
import {nativeControlSound19ObservedRegions} from '../tools/lib/native-control-sound-inputs.mjs';
import {createNativeControlSoundCreationBindings} from '../tools/lib/native-control-sound-creation.mjs';

async function fixture(through='drive'){
  const {configuration}=await createNativeParentTailCaptureConfig('synthetic','never-launched-tail',{stackBytesBefore:64,skipFrames:2,includeAfterAiCheckpoint:false,guardedAudioChannels:false,through});
  const base=0x700000,U=0x200100,initial={ebx:1,ebp:2,esi:3,edi:4,edx:0,ecx:123,fpuControlWord:0x7f,mxcsr:0x1f80};
  const lateCount=['drive',...nativeControlLateBoundaries.map(row=>row.stage)].indexOf(through);
  const sites=[['native-control-before',0x450e50,U],['native-control-after',0x4749e0,U-20],['native-control-after-physics',0x474b1e,U-20],...[...nativeControlTailBoundaries,...nativeControlLateBoundaries.slice(0,lateCount)].map(row=>[row.id,row.address,U-16])];
  const snapshots=sites.map(([id,address,esp],index)=>{
    const bytes=Buffer.alloc(96),put=(offset,value)=>bytes.writeUInt32LE(value,64+offset),session=Buffer.alloc(0x590),clock=Buffer.alloc(4);
    session[0x54d]=6;session.writeUInt32LE(4,0x57c);clock.writeUInt32LE(288);
    if(index===0){put(0,base+0x41234);put(4,1);}
    else{
      const at=index<3?4:0;if(index<3)put(0,base+0x51017);
      for(const [offset,name]of [[0,'edi'],[4,'esi'],[8,'ebp'],[12,'ebx']])put(at+offset,initial[name]);
      put(at+16,base+0x41234);put(at+20,1);
    }
    if(id==='native-control-after-physics')put(-4,initial.ecx);
    return {breakpointId:id,ordinal:index+4,tid:80,hit:1,matchingHit:3,rawHit:230,
      registers:{...initial,esp,eip:base+address-0x400000,...(index?{ebp:0,eax:0}:{})},
      captureWhen:{address:0x30057c,actualBytesHex:'04000000',equalsBytesHex:'04000000'},
      ranges:new Map([['frame-stack',{id:'frame-stack',address:esp-64,bytes}],['session',{id:'session',address:0x300000,bytes:session}],
        ['clock',{id:'clock',address:base+0x50a548,moduleBaseAddress:base,bytes:clock}],['attachment-count',{id:'attachment-count',address:base+0x2e6ba0,bytes:Buffer.alloc(4)}]])};
  });
  //Synthetic NULL roots retain complete independent guard proofs. They do
  //not stand in for the live camera/weather allocations in a real capture.
  for(const snapshot of snapshots){
    const point=configuration.breakpoints.find(row=>row.id===snapshot.breakpointId);
    for(const descriptor of point.ranges.filter(row=>row.dereferenceMinimumValues)){
      const root=base+Number(descriptor.rva);
      snapshot.ranges.set(`root-${descriptor.id}`,{id:`root-${descriptor.id}`,address:root,bytes:Buffer.alloc(4)});
      snapshot.ranges.set(descriptor.id,{id:descriptor.id,rootRva:descriptor.rva,moduleBaseAddress:base,rangeMode:'guarded-pointer',
        dereferenceOffsets:descriptor.dereferenceOffsets,dereferenceMinimumValues:descriptor.dereferenceMinimumValues,
        guardedRootAddress:root,guardedDeclaredLength:descriptor.length,guardedStopIndex:0,guardedPointerReadBytes:4,
        guardedPointerSteps:[{index:0,readAddress:root,value:0,minimumValue:1,bytesHex:'00000000'}],address:0,length:0,bytes:Buffer.alloc(0)});
    }
  }
  return {configuration,capture:{header:{executableSha256:REDUX_SHA256},complete:{reason:'snapshot-bound'},snapshots}};
}

test('postphysics observer preserves native parent entry and uses actual S+4 checkpoints with terminal drive bound',async()=>{
  const f=await fixture(),paired=pairNativeControlSnapshots(f.capture,f.configuration);
  assert.equal(paired.postphysics,true);assert.equal(f.configuration.maxSnapshots,9);assert.equal(f.configuration.maxDurationMs,90000);
  assert.deepEqual(Object.keys(paired.pairs[0].postphysics),['attachments','recovery','drive']);
  assert.equal(paired.pairs[0].postphysics.attachments.registers.esp,paired.pairs[0].physicsAfter.registers.esp+4);
  assert.equal(f.configuration.breakpoints.find(row=>row.id==='native-control-after-physics').stopAfterHits,0);
  for(const point of f.configuration.breakpoints.filter(row=>row.id.startsWith('native-control-'))){
    assert.ok(point.ranges.some(row=>row.id==='tail-type2-pointer-domain'&&row.length===16384));
    assert.ok(point.ranges.some(row=>row.id==='tail-pickup-list-region'&&row.readableRegion));
    assert.ok(point.ranges.some(row=>row.id==='tail-attached-light-position-table'&&row.length===560));
  }
});

test('postphysics pairing rejects altered caller stack, missing/reordered stages, mode/thread/clock and early terminal policy',async()=>{
  for(const corrupt of [
    f=>{f.capture.snapshots[3].registers.esp--;},f=>{f.capture.snapshots[3].tid++;},
    f=>{f.capture.snapshots[3].ranges.get('clock').bytes.writeUInt32LE(289);},
    f=>{f.capture.snapshots[4].ranges.get('frame-stack').bytes.writeUInt32LE(0,80);},
    f=>{f.capture.snapshots[4].ordinal=f.capture.snapshots[3].ordinal;},
    f=>{f.capture.snapshots[4].registers.ebp=2;},f=>{f.capture.snapshots[5].registers.mxcsr|=0x8000;},
    f=>{f.capture.snapshots.splice(3,1);},f=>{f.configuration.breakpoints.find(row=>row.id==='native-control-after-physics').stopAfterHits=1;},
    f=>{f.configuration.breakpoints.find(row=>row.id==='native-control-after-attachments').rva='0x51017';},
    f=>{f.configuration.phaseActions.push({breakpointId:'native-control-after-recovery',writes:[]});},
    f=>{f.configuration.breakpoints=f.configuration.breakpoints.filter(row=>row.id!=='native-control-after-drive');},
  ]){const f=await fixture();corrupt(f);assert.throws(()=>pairNativeControlSnapshots(f.capture,f.configuration));}
});

test('tail alias admission only covers genuinely observed source spans and subtracts existing module aliases',()=>{
  const base=0x6e0000,address=base+0x91cdb0-0x400000;
  const snapshot={ranges:[{address,moduleBaseAddress:base,bytes:Buffer.alloc(0x6a4)}]};
  const admitted=nativeParentTailAdditionalRegions(snapshot);
  assert.ok(admitted.length>0);assert.ok(admitted.every(row=>row.address>=address&&row.address+row.length<=address+0x6a4));
  assert.ok(admitted.every(row=>row.id.startsWith('tail-attachment-scratch')));
});

test('type1 light-point aliases follow actual queued handles, respect termination and require all eight observed bytes',()=>{
  const base=0x6e0000,body=0x1300000,point=base+0x50b6c8,count=Buffer.alloc(4),queue=Buffer.alloc(8),handles=Buffer.alloc(10),target=Buffer.alloc(8,0xa3);
  count.writeUInt32LE(2);queue.writeUInt32LE(body);queue.writeUInt32LE(body,4);handles.writeUInt16LE(0x1008);handles.writeUInt16LE(0x1fff,4);
  const snapshot={ranges:[{address:base+0x2e6ba0,moduleBaseAddress:base,bytes:count},{address:base+0x502040,bytes:queue},{address:body+0x16a,bytes:handles},{address:point,bytes:target}]};
  const rows=nativeParentTailAdditionalRegions(snapshot);
  assert.equal(rows.length,1);assert.equal(rows[0].preferredAddress,0x90b6c8);assert.equal(rows[0].address,point);assert.equal(rows[0].length,8);
  assert.deepEqual(target,Buffer.alloc(8,0xa3));
  snapshot.ranges.at(-1).bytes=target.subarray(0,7);
  assert.equal(nativeParentTailAdditionalRegions(snapshot).length,0);
});

test('late checkpoints preserve one parent stack and clock through each retained prefix with fixed guarded inputs',async()=>{
  for(const [index,boundary]of nativeControlLateBoundaries.entries()){
    const f=await fixture(boundary.stage),pairing=pairNativeControlSnapshots(f.capture,f.configuration);
    assert.equal(pairing.lateStages,index+1);
    assert.equal(f.configuration.maxSnapshots,10+index);
    assert.equal(f.configuration.maxDurationMs,90000);
    assert.deepEqual(Object.keys(pairing.pairs[0].postphysics),['attachments','recovery','drive',...nativeControlLateBoundaries.slice(0,index+1).map(row=>row.stage)]);
    assert.equal(f.configuration.breakpoints.find(row=>row.id==='native-control-after-drive').stopAfterHits,0);
    for(const point of f.configuration.breakpoints.filter(row=>row.id.startsWith('native-control-'))){
      assert.ok(point.ranges.some(row=>row.id==='late-camera-records'&&row.length===4*0x184));
      assert.ok(point.ranges.some(row=>row.id==='late-weather-screen-allocation'&&row.length===0x1400&&row.dereferenceMinimumValues[0]===1));
    }
  }
});

test('late pairing rejects missing stages, unproved guards, parent input substitution and crossed call identity',async()=>{
  for(const corrupt of [
    f=>{f.configuration.breakpoints=f.configuration.breakpoints.filter(row=>row.id!=='native-control-after-auxiliary');},
    f=>{f.configuration.breakpoints.find(row=>row.id==='native-control-after-drive').stopAfterHits=1;},
    f=>{f.configuration.breakpoints.find(row=>row.id==='native-control-after-cameras').rva='0x5110d';},
    f=>{f.configuration.phaseActions.push({breakpointId:'native-control-after-world-effects',writes:[]});},
    f=>{f.capture.snapshots.at(-1).tid++;},
    f=>{f.capture.snapshots.at(-1).registers.esp-=4;},
    f=>{f.capture.snapshots.at(-1).ranges.get('clock').bytes.writeUInt32LE(289);},
    f=>{f.capture.snapshots.at(-1).ranges.get('frame-stack').bytes.writeUInt32LE(0,80);},
    f=>{f.capture.snapshots.at(-1).ordinal=f.capture.snapshots.at(-2).ordinal;},
    f=>{f.capture.snapshots.at(-1).ranges.delete('late-weather-screen-allocation');},
    f=>{f.capture.snapshots.at(-1).ranges.get('late-weather-screen-allocation').guardedPointerSteps[0].value=1;},
    f=>{f.capture.snapshots.splice(-2,1);},
  ]){const f=await fixture('world-effects');corrupt(f);assert.throws(()=>pairNativeControlSnapshots(f.capture,f.configuration));}
  await assert.rejects(()=>createNativeParentTailCaptureConfig('synthetic','never-launched-tail',{through:'parent-return'}),/through/);
  const f=await fixture();assert.equal(verifyNativeControlCaptureConfiguration(f.configuration).lateStages,0);
});

const lateRaw='analysis/native-physics-local/startup-20261022/parent-late-v2-20261023';
test('actual late capture admits disjoint entry-only aliases and carries all three earlier stages with the new observed inputs',{skip:!existsSync(`${lateRaw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(lateRaw),configuration=JSON.parse(await readFile(`${lateRaw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  assert.equal(pairing.lateStages,3);
  const late=nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),additionalRegions=[...nativeParentTailAdditionalRegions(pair.before,options),...late];
  const source=replayNativeControlThroughPhysics(pair.before,{...options,additionalRegions}),seen=[];
  assert.equal(compareNativeControlOutput(source,pair.physicsAfter).matched,true);
  continueNativeParentTail(source,{snapshot:pair.before,onStage:({stage,source:carried})=>{
    const comparison=compareNativeControlOutput(carried,pair.postphysics[stage]);
    assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));
    assert.equal(comparison.uniqueBytesCompared,5100223);seen.push(stage);
  }});
  assert.deepEqual(seen,['attachments','recovery','drive']);
  const missing={...pair.before,ranges:new Map(pair.before.ranges)};
  missing.ranges.delete('late-weather-screen-allocation');
  assert.throws(()=>nativeParentLateReplayRegions(missing,pair.moduleBaseAddress,options),/lacks declared/);
});

const type1Raw='analysis/native-physics-local/startup-20261022/parent-late-v5-sound19-tls-20261023';
test('original V5 carries three type1 light positions through attachments, recovery and drive from original parent entry',{skip:!existsSync(`${type1Raw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(type1Raw),configuration=JSON.parse(await readFile(`${type1Raw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  const additionalRegions=[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress)];
  const source=replayNativeControlThroughPhysics(pair.before,{...options,additionalRegions,createControlAudioBindings:createNativeControlSoundCreationBindings}),seen=[];
  assert.equal(compareNativeControlOutput(source,pair.physicsAfter).matched,true);
  continueNativeParentTail(source,{snapshot:pair.before,onStage:({stage,source:carried,report})=>{
    const comparison=compareNativeControlOutput(carried,pair.postphysics[stage]);
    assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));assert.equal(comparison.uniqueBytesCompared,5106383);
    if(stage==='attachments')assert.equal(report.type1Writes,3);
    seen.push(stage);
  }});
  assert.deepEqual(seen,['attachments','recovery','drive']);
});

const auxiliaryRaw='analysis/native-physics-local/startup-20261022/parent-late-v6-batched-inputs-20261023';
test('original V6 carries source state through auxiliary updates and stops before an unobserved CRT cast',{skip:!existsSync(`${auxiliaryRaw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(auxiliaryRaw),configuration=JSON.parse(await readFile(`${auxiliaryRaw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  const additionalRegions=[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress)];
  const source=replayNativeControlThroughPhysics(pair.before,{...options,additionalRegions,createControlAudioBindings:createNativeControlSoundCreationBindings}),seen=[];
  assert.equal(compareNativeControlOutput(source,pair.physicsAfter).matched,true);
  assert.deepEqual(source.controlAudioBindings.creationEvents,[]);
  assert.throws(()=>continueNativeParentTail(source,{snapshot:pair.before,through:'cameras',onStage:({stage,source:carried,report})=>{
    const comparison=compareNativeControlOutput(carried,pair.postphysics[stage]);
    assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));
    assert.equal(comparison.uniqueBytesCompared,5102089);
    if(stage==='auxiliary')assert.equal(report.participants,6);
    seen.push(stage);
  }}),error=>{
    assert.match(error.message,/Viewport application requires CRT dynamicCast/);
    assert.equal(error.nativeParentTailProgress.lastCall.entry,0x4180a0);
    assert.equal(error.nativeParentTailProgress.parentReturned,false);
    return true;
  });
  assert.deepEqual(seen,['attachments','recovery','drive','auxiliary']);
});
