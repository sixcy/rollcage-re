import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {pairSourceDispatchRecords,classifySourceDispatch,compareNativeDispatchSnapshots,traceNativeFrameDispatches} from '../tools/lib/native-frame-event-trace.mjs';
import {replayNativeFrame} from '../tools/lib/native-frame-replay.mjs';
import {verifyNativeEventFrameConfiguration} from '../tools/check-native-event-frame-replay.mjs';
import {createNativeEventFrameCaptureConfig} from '../tools/prepare-native-event-frame-capture.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from '../tools/check-native-frame-replay.mjs';

function fixture(){
  const memory=Buffer.alloc(0xa00000),event=0x50138,esp=0x9000,delta=-32,bytes=Buffer.alloc(104);
  bytes.writeInt32LE(1);bytes.writeUInt32LE(0x10000,4);bytes.writeInt32LE(2,0x54);
  bytes.copy(memory,event);memory.writeUInt32LE(4,0x902ba4);memory.writeUInt32LE(0x50000,0x902ba8);memory.writeInt32LE(3,0x902bb4);memory.writeUInt32LE(348,0x90a548);memory.writeUInt32LE(0x474ada,esp);
  const native={ordinal:2,tid:7,moduleBaseAddress:0x400000,registers:{esp,eip:0x474bb0,ecx:event,edx:delta>>>0},captureWhen:{address:0x90a548,actualBytesHex:'5c010000',equalsBytesHex:'5c010000'},ranges:new Map([['image',{address:0,bytes:memory}],['dispatch-event',{address:event,bytes}]])};
  const source={stage:'before',eventAddress:event,deltaQ16:delta,eventBytesHex:bytes.toString('hex')},options={before:{ordinal:1,tid:7,registers:{esp:esp+28}},after:{ordinal:3,tid:7},logicalClock:348};
  return {memory,native,source,options};
}
test('ordered native comparison requires exact event104bytes, signed delta, pool address and complete count',()=>{
  const f=fixture();assert.equal(compareNativeDispatchSnapshots([f.native],[f.source],f.options).matched,true);
  assert.equal(compareNativeDispatchSnapshots([],[f.source],f.options).firstDivergence.kind,'event-count');
  assert.equal(compareNativeDispatchSnapshots([f.native],[{...f.source,deltaQ16:0}],f.options).firstDivergence.kind,'delta');
  assert.equal(compareNativeDispatchSnapshots([f.native],[{...f.source,eventAddress:f.source.eventAddress+104}],f.options).firstDivergence.kind,'event-address');
  const changed=Buffer.from(f.source.eventBytesHex,'hex');changed[103]=1;
  assert.equal(compareNativeDispatchSnapshots([f.native],[{...f.source,eventBytesHex:changed.toString('hex')}],f.options).firstDivergence.firstByte,103);
  f.native.ordinal=3;assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/ordered same-thread/);
  f.native.ordinal=2;f.native.tid++;assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/ordered same-thread/);
});
test('native dispatch observations reject wrong parentESP/caller/clock predicate instead of weakening comparison',()=>{
  const f=fixture();assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],{...f.options,before:{...f.options.before,registers:{esp:0x9020}}}),/parent frame stack/);
  f.memory.writeUInt32LE(349,0x90a548);assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/clock\/root/);f.memory.writeUInt32LE(348,0x90a548);
  f.native.captureWhen.actualBytesHex='5d010000';assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/predicate proof/);
});
function pendingFixture(){
  const f=fixture(),identity={candidateIndex:8,frameTid:7,frameEntryEsp:f.options.before.registers.esp,frameReturnAddress:0x451017,frameMatchingHit:128,observedEventHits:1,qualifyingEventSnapshots:1};
  delete f.native.captureWhen;
  f.options.mode='pending-frame';f.options.returnAddress=identity.frameReturnAddress;f.options.moduleBaseAddress=0x400000;
  for(const[row,role,debug,time]of[[f.options.before,'before',100,1000],[f.native,'event',101,1001],[f.options.after,'after',102,1002]]){
    row.pendingFrame={...identity,role,...(role==='event'?{eventIndex:1}:{})};row.deferredPublication=true;row.observedDebugEventOrdinal=debug;row.observedElapsedMs=time;
  }
  return f;
}
test('latched native event comparison uses accepted frame clock and validates deferred whole-stream metadata',()=>{
  const f=pendingFixture();assert.equal(compareNativeDispatchSnapshots([f.native],[f.source],f.options).matched,true);
  f.native.pendingFrame.candidateIndex++;assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/different pending candidate/);f.native.pendingFrame.candidateIndex--;
  f.native.pendingFrame.eventIndex=0;assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/event index\/totals/);f.native.pendingFrame.eventIndex=1;
  f.options.after.pendingFrame.observedEventHits=2;assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/unfiltered complete/);f.options.after.pendingFrame.observedEventHits=1;
  f.native.observedDebugEventOrdinal=103;assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/observation order/);f.native.observedDebugEventOrdinal=101;
  f.native.observedElapsedMs=999;assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/observation time/);f.native.observedElapsedMs=1001;
  f.native.captureWhen={actualBytesHex:'5c010000',equalsBytesHex:'5c010000',address:0x90a548};assert.throws(()=>compareNativeDispatchSnapshots([f.native],[f.source],f.options),/unfiltered event stream/);
});
test('explicit bodypair subset compares only kind0 while accounting for all native/source dispatches',()=>{
  const f=pendingFixture(),record=f.native.ranges.get('dispatch-event').bytes;
  record.writeInt32LE(0);f.memory.writeInt32LE(0,f.source.eventAddress);f.source.kind=0;f.source.eventBytesHex=record.toString('hex');
  f.native.captureWhen={address:f.source.eventAddress,actualBytesHex:'00000000',equalsBytesHex:'00000000'};
  for(const row of [f.options.before,f.native,f.options.after])row.pendingFrame.observedEventHits=2;
  const allSource=[{before:{...f.source,kind:1}},{before:f.source}],options={...f.options,subset:'body-pair',sourceProcessedEvents:2};
  const compared=compareNativeDispatchSnapshots([f.native],allSource,options);
  assert.equal(compared.matched,true);assert.equal(compared.scope,'kind0-body-pair-substream');assert.equal(compared.sourceProcessedEvents,2);assert.equal(compared.events[0].sourceEventIndex,1);
  assert.equal(compareNativeDispatchSnapshots([f.native],allSource,{...options,subset:'all'}).firstDivergence.kind,'event-count');
  assert.throws(()=>compareNativeDispatchSnapshots([f.native],allSource,{...options,sourceProcessedEvents:1}),/complete source processed/);
  f.options.after.pendingFrame.observedEventHits=1;assert.throws(()=>compareNativeDispatchSnapshots([f.native],allSource,options),/kind0 subset/);f.options.after.pendingFrame.observedEventHits=2;
  f.native.captureWhen.address++;assert.throws(()=>compareNativeDispatchSnapshots([f.native],allSource,options),/exact kind0 predicate/);f.native.captureWhen.address--;
  record.writeInt32LE(1);f.memory.writeInt32LE(1,f.source.eventAddress);assert.throws(()=>compareNativeDispatchSnapshots([f.native],allSource,options),/nonzero native\/source event kind/);
});
test('source pairing and terrain-border classification require observed plane/cell facts',()=>{
  const before={stage:'before',eventAddress:12,deltaQ16:1,kind:1,classFlags:2,field44:0,object1:{type:3},normalQ16:[65536,0,0],terrainCandidates:[{type:6,normalQ16:[65536,0,0]}]},after={...before,stage:'after'};
  assert.equal(pairSourceDispatchRecords([before,after]).length,1);assert.throws(()=>pairSourceDispatchRecords([before]),/complete/);assert.throws(()=>pairSourceDispatchRecords([after,before]),/order/);
  assert.equal(classifySourceDispatch(before,{modelQueries:0}).category,'terrain-border');
  assert.equal(classifySourceDispatch({...before,normalQ16:[0,-65536,0]},{modelQueries:0}).category,'terrain-contact-merged-or-edge');
  assert.equal(classifySourceDispatch(before,{modelQueries:1}).category,'static-contact-unresolved-producer');
  assert.equal(classifySourceDispatch({...before,kind:0,object2:{type:3}},{modelQueries:0}).category,'car-car');
  assert.equal(classifySourceDispatch({...before,kind:0,object2:{type:4}},{modelQueries:0}).category,'body-pair');
});
test('event capture configuration fixes exact entry/context ranges and rejects early stops or writes',async()=>{
  const {configuration}=await createNativeEventFrameCaptureConfig('synthetic','new-output');
  assert.equal(verifyNativeEventFrameConfiguration(configuration).logicalClock,348);
  const event=configuration.breakpoints.find(row=>row.id==='native-dispatch-entry');event.stopAfterHits=1;
  assert.throws(()=>verifyNativeEventFrameConfiguration(configuration),/early stop/);event.stopAfterHits=0;
  event.ranges.find(row=>row.id==='dispatch-event').length=100;assert.throws(()=>verifyNativeEventFrameConfiguration(configuration),/exact ABI/);
});
test('firstcollision configuration preserves complete-stream ABI and admits only explicit exactkind0 subset',async()=>{
  const {configuration}=await createNativeEventFrameCaptureConfig('synthetic','new-output',{selection:'first-collision'}),selected=verifyNativeEventFrameConfiguration(configuration);
  assert.equal(selected.mode,'pending-frame');assert.equal(selected.logicalClock,null);assert.equal(selected.eventBreakpointId,'native-dispatch-entry');
  configuration.pendingFrameObserver.eventKind=0;assert.throws(()=>verifyNativeEventFrameConfiguration(configuration),/subset event filters/);delete configuration.pendingFrameObserver.eventKind;
  configuration.breakpoints.find(row=>row.id==='native-dispatch-entry').captureWhen={range:{id:'kind',baseRegister:'ecx',length:4},equalsBytesHex:'01000000'};assert.throws(()=>verifyNativeEventFrameConfiguration(configuration),/unfiltered full event stream/);
  configuration.breakpoints.find(row=>row.id==='native-dispatch-entry').captureWhen.equalsBytesHex='00000000';assert.equal(verifyNativeEventFrameConfiguration(configuration).subset,'body-pair');
  delete configuration.breakpoints.find(row=>row.id==='native-dispatch-entry').captureWhen;
  configuration.pendingFrameObserver.eventRecordBytes=100;assert.throws(()=>verifyNativeEventFrameConfiguration(configuration),/exact native frame\/caller ABI/);
});
test('pending snapshot bound remains64 while fixed-clock observations admit256',async()=>{
  const {configuration}=await createNativeEventFrameCaptureConfig('synthetic','new-output',{selection:'first-collision'});
  configuration.pendingFrameObserver.maxEventSnapshots=65;assert.throws(()=>verifyNativeEventFrameConfiguration(configuration),/maxEventSnapshots bound/);
  const clock=await createNativeEventFrameCaptureConfig('synthetic','new-output',{maxDispatchSnapshots:256});assert.equal(verifyNativeEventFrameConfiguration(clock.configuration).mode,'fixed-clock');
});
test('first-body-pair preparer selects the explicitly labelled kind0 substream',async()=>{
  const prepared=await createNativeEventFrameCaptureConfig('synthetic','new-output',{selection:'first-body-pair'}),selection=verifyNativeEventFrameConfiguration(prepared.configuration);
  assert.equal(prepared.logicalClock,null);assert.equal(selection.mode,'pending-frame');assert.equal(selection.subset,'body-pair');
  assert.deepEqual(prepared.configuration.breakpoints.find(row=>row.id==='native-dispatch-entry').captureWhen,{range:{id:'dispatch-kind',baseRegister:'ecx',length:4},equalsBytesHex:'00000000'});
});

const turn='analysis/native-physics-local/startup-20261022/hidden-turn-frames-capture';
test('immutable observer matches plain finalstate for all29 retained turn-frame dispatches',{skip:!existsSync(`${turn}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(turn),configuration=JSON.parse(await readFile(`${turn}/configuration.json`,'utf8')),pairs=pairNativeFrameSnapshots(capture,configuration).pairs;
  let events=0;
  for(const pair of pairs){
    const plain=replayNativeFrame(pair.before,pair.options),observed=traceNativeFrameDispatches(pair.before,{...pair.options,onCollisionDispatch:record=>{
      assert.ok(Object.isFrozen(record));assert.ok(Object.isFrozen(record.object1));assert.ok(Object.isFrozen(record.normalQ16));assert.ok(Object.isFrozen(record.object1.positionQ16));
      assert.throws(()=>{record.normalQ16[0]=123;},TypeError);assert.throws(()=>{record.object1.positionQ16[0]=123;},TypeError);
      assert.equal(record.eventBytesHex.length,208);return 99;
    }});
    for(const region of plain.manifest.requiredRegions)assert.deepEqual(observed.span(region.address,region.length),plain.span(region.address,region.length),region.id);
    assert.equal(observed.report.processedEvents,plain.report.processedEvents);events+=observed.dispatchEvents.length;
  }
  assert.equal(events,29);
  assert.throws(()=>traceNativeFrameDispatches(pairs[0].before,{...pairs[0].options,onCollisionDispatch:()=>{throw Error('Synthetic observer stop');}}),error=>error.message==='Synthetic observer stop'&&error.replayStage==='physics-frame'&&error.dispatchRecords.length===1&&error.dispatchRecords[0].stage==='before');
});

const selected='analysis/native-physics-local/startup-20261022/hidden-selected-collision-capture';
test('retained selected native frame proves two exact nonempty wheel/rightborder dispatches',{skip:!existsSync(`${selected}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(selected),configuration=JSON.parse(await readFile(`${selected}/configuration.json`,'utf8')),pair=pairNativeFrameSnapshots(capture,configuration).pairs[0],selection=verifyNativeEventFrameConfiguration(configuration),replay=traceNativeFrameDispatches(pair.before,pair.options);
  const compared=compareNativeDispatchSnapshots(capture.snapshots.filter(row=>row.breakpointId===selection.eventBreakpointId),replay.dispatchEvents,{...pair,...selection,logicalClock:pair.before.ranges.get('clock').bytes.readUInt32LE(),sourceProcessedEvents:replay.report.processedEvents});
  assert.equal(compared.matched,true);assert.equal(compared.events.length,2);assert.deepEqual(compared.events.map(row=>row.deltaQ16),[766,32768]);
  for(const row of replay.dispatchEvents){assert.equal(row.before.kind,1);assert.equal(row.before.object1.type,4);assert.equal(row.before.object2,null);assert.equal(row.before.classFlags,1);assert.equal(row.classification.category,'terrain-border');assert.deepEqual(row.classification.matchingPlaneTypes,[7]);}
  const frame=compareNativeFramePair(pair,replay);assert.equal(frame.matched,true);assert.equal(frame.comparedBytes,4885396);
});

const selectedPair='analysis/native-physics-local/startup-20261022/hidden-selected-body-pair-capture';
test('retained selected pair frame proves four exactcarcar events within six total dispatches',{skip:!existsSync(`${selectedPair}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(selectedPair),configuration=JSON.parse(await readFile(`${selectedPair}/configuration.json`,'utf8')),pair=pairNativeFrameSnapshots(capture,configuration).pairs[0],selection=verifyNativeEventFrameConfiguration(configuration),replay=traceNativeFrameDispatches(pair.before,pair.options),clock=pair.before.ranges.get('clock').bytes.readUInt32LE();
  const compared=compareNativeDispatchSnapshots(capture.snapshots.filter(row=>row.breakpointId===selection.eventBreakpointId),replay.dispatchEvents,{...pair,...selection,logicalClock:clock,sourceProcessedEvents:replay.report.processedEvents});
  assert.equal(clock,359);assert.equal(pair.before.ranges.get('session').bytes.readUInt32LE(0x580),131);
  assert.equal(selection.subset,'body-pair');assert.equal(compared.matched,true);assert.equal(compared.scope,'kind0-body-pair-substream');assert.equal(compared.sourceProcessedEvents,6);assert.equal(compared.events.length,4);
  assert.equal(pair.after.pendingFrame.observedEventHits,6);assert.equal(pair.after.pendingFrame.qualifyingEventSnapshots,4);
  assert.deepEqual(compared.events.map(row=>row.deltaQ16),[29696,0,4864,0]);assert.deepEqual(compared.events.map(row=>row.sourceEventIndex),[1,2,3,4]);
  const pairs=replay.dispatchEvents.filter(row=>row.before.kind===0);assert.equal(pairs.length,4);assert.deepEqual(pairs.map(row=>row.before.classFlags),[1,2,1,2]);
  for(const row of pairs){assert.equal(row.before.object1.type,3);assert.equal(row.before.object2.type,3);assert.equal(row.classification.category,'car-car');}
  assert.equal(replay.dispatchEvents.filter(row=>row.before.kind===1).length,2,'Static dispatches stay outside the directly captured kind0 subset.');
  assert.equal(replay.report.preparedBodies,14);assert.equal(replay.report.scriptedBodies,2);assert.equal(replay.report.storedContacts,2);
  const frame=compareNativeFramePair(pair,replay);assert.equal(frame.matched,true);assert.equal(frame.comparedBytes,4951894);assert.equal(frame.nativeScenario.translatedVehicles,6);
  assert.equal(frame.nativeScenario.identity.before.selectedTrackStem,'HIGH/LEV5');assert.deepEqual(frame.nativeScenario.identity.before.activeVehicleTypes,[6,3,1,5,0,2]);
});
