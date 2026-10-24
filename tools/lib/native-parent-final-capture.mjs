import assert from 'node:assert/strict';
import {createCapturedMemory} from './captured-memory.mjs';
import {nativeParentFinalInputPolicy,nativeParentFinalInputStages,nativeParentFinalInputsCapability,verifyNativeParentFinalInputs} from './native-parent-final-inputs.mjs';

export const nativeParentFinalReturnSite=Object.freeze({id:'native-parent-return',preferredAddress:0x450e38,bytesHex:'8bd8'});
const uint=(v,label)=>{const n=Number(v);assert.ok((typeof v==='number'||typeof v==='string'&&/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(v))&&Number.isInteger(n)&&n>=0&&n<=0xffffffff,`Final actual uint32 ${label}`);return n;};
const rows=s=>s.ranges instanceof Map?[...s.ranges.values()]:s.ranges;
const regOffsets={edi:156,esi:160,ebx:164,ebp:180,eax:176,eip:184,esp:196};
const isInputRow=r=>r.source==='parent-final-inputs'||r.id?.startsWith('parent-final-');

//This authenticates observations only. Source execution receives original entry
//game bytes and independently computes the final clocks/registers/return value.
export function verifyNativeParentFinalCaptureRecords({capture,configuration,records,before,parent,owner,base,U,clock,activationEvent}){
  const readers=new WeakMap(),at=(s,address,length)=>{if(!readers.has(s))readers.set(s,createCapturedMemory(rows(s)));return readers.get(s).span(address,length);};
  const policy=configuration.parentRttiObservation?.finalTick,markers=records.filter(r=>r.type?.startsWith('parent-final-'));
  if(!policy){
    assert.equal(markers.length,0,'No unconfigured final markers');assert.equal(capture.complete.parentFinalTick,undefined);
    for(const s of capture.snapshots){assert.notEqual(s.breakpointId,nativeParentFinalReturnSite.id);assert.equal(s.parentFinalInputs,undefined);assert.equal(s.parentFinalReturn,undefined);assert.equal(s.parentFinalReturnActivation,undefined);assert.ok(!rows(s).some(isInputRow));}
    return undefined;
  }
  assert.deepEqual(policy,nativeParentFinalInputPolicy());assert.ok(capture.header.helperCapabilities?.includes(nativeParentFinalInputsCapability),'Final helper capability');
  const finalShots=capture.snapshots.filter(s=>s.breakpointId===nativeParentFinalReturnSite.id);assert.equal(finalShots.length,1);
  const final=finalShots[0],all=[...parent,final],world=parent.at(-1),initial=at(before,U,8),caller=initial.readUInt32LE(),total=initial.readUInt32LE(4);
  //The capture loader and independent raw-trace parser create distinct JSON
  //objects. Locate already-authenticated markers by identity fields, not ===.
  const markerIndex=p=>records.findIndex(r=>r.type===p.type&&r.observedDebugEventOrdinal===p.observedDebugEventOrdinal&&r.snapshotOrdinal===p.snapshotOrdinal);
  assert.deepEqual(all.map(s=>s.breakpointId),nativeParentFinalInputStages,'Exact ordered final input checkpoints');
  assert.equal(caller,base+0x50e38,'Actual ordinary450d60 caller');assert.equal(final,capture.snapshots.at(-1));assert.ok(final.observedDebugEventOrdinal>world.observedDebugEventOrdinal);
  const common=(p,s)=>assert.deepEqual([p.pid,p.tid,p.ownerMainTid,p.breakpointId,p.observedDebugEventOrdinal,p.parentEntryDebugEventOrdinal,uint(p.parentEntryEsp,'parentU'),p.parentClock,p.parentIteration,uint(p.parentCaller,'caller'),p.parentTotalIterations,p.activationDebugEventOrdinal],
    [owner.pid,owner.tid,owner.tid,s.breakpointId,s.observedDebugEventOrdinal,before.observedDebugEventOrdinal,U,clock,before.context.readUInt32LE(168),caller,total,all.indexOf(s)<=7?0:activationEvent],'Final selected-parent lineage');
  const annotated=(s,key,type)=>{
    const p=s[key],matches=markers.filter(m=>m.type===type&&m.observedDebugEventOrdinal===s.observedDebugEventOrdinal);
    assert.equal(matches.length,1);assert.deepEqual(matches[0],p,'Exact final marker annotation');
    const event=records.findIndex(r=>r.type==='debug-event'&&r.ordinal===s.observedDebugEventOrdinal),snapshot=records.findIndex(r=>r.type==='snapshot'&&r.ordinal===s.ordinal),index=records.indexOf(matches[0]);
    assert.ok(event>=0&&event<index&&index<snapshot&&!records.slice(event+1,snapshot).some(r=>r.type==='debug-event'),'Final annotation in same stopped event');
    assert.deepEqual([records[event].event,records[event].pid,records[event].tid,s.tid,records[snapshot].tid],[1,owner.pid,owner.tid,owner.tid,owner.tid],'Final actual owned stopped thread');
    assert.deepEqual(records[snapshot][key],p,'Raw final snapshot annotation');common(p,s);return matches[0];
  };
  const inputs={checkpoints:11,lightBandBytes:0,listenerWrappers:0,listenerBytes:0,managerObservations:0,additionalBytes:0},observations=[];
  assert.equal(markers.filter(m=>m.type==='parent-final-inputs-observed').length,11);
  for(const s of all){const p=annotated(s,'parentFinalInputs','parent-final-inputs-observed');assert.equal(p.snapshotOrdinal,s.ordinal);assert.equal(uint(p.mainModuleBaseAddress,'input module'),base);
    const result=verifyNativeParentFinalInputs(s,p,{moduleBaseAddress:base,policy});observations.push(result);
    inputs.lightBandBytes+=result.lightBands.totalBytes;inputs.listenerWrappers+=result.listenerWrappers.uniqueWrappers;
    inputs.listenerBytes+=result.listenerWrappers.uniqueWrappers*80;inputs.managerObservations++;inputs.additionalBytes+=result.additionalBytes;
  }
  for(const s of capture.snapshots)if(!all.includes(s)){assert.equal(s.parentFinalInputs,undefined);assert.ok(!rows(s).some(isInputRow));}
  const activated=markers.filter(m=>m.type==='parent-final-return-activated');assert.equal(activated.length,1);const activation=annotated(before,'parentFinalReturnActivation','parent-final-return-activated');
  const activationAt=records.indexOf(activation),beforeAt=records.findIndex(r=>r.type==='snapshot'&&r.ordinal===before.ordinal);
  assert.ok(activationAt<beforeAt&&activationAt>records.findIndex(r=>r.type==='debug-event'&&r.ordinal===before.observedDebugEventOrdinal));
  assert.ok(activationAt>markerIndex(before.parentFinalInputs),'Final activation follows completed original input capture');
  if(before.parentSoundBankOwnerGraph)assert.ok(markerIndex(before.parentSoundBankOwnerGraph)<markerIndex(before.parentFinalInputs));
  assert.deepEqual([activation.originalBytesHex,activation.patchBytesHex],['8bd8','cc']);
  assert.deepEqual([activation.snapshotOrdinal,uint(activation.mainModuleBaseAddress,'activation base'),activation.id,uint(activation.address,'activation address'),activation.activationSelection,activation.afterSnapshotBytesCaptured,activation.beforeSnapshotPublication,activation.beforeOriginalInstruction],
    [before.ordinal,base,nativeParentFinalReturnSite.id,base+0x50e38,'selected-owned-parent-entry',true,true,true]);
  for(const s of capture.snapshots)if(s!==before)assert.equal(s.parentFinalReturnActivation,undefined);
  const deferred=records.filter(r=>r.type==='breakpoint-installation-deferred'&&r.id===nativeParentFinalReturnSite.id);assert.equal(deferred.length,1);
  assert.ok(records.indexOf(deferred[0])<records.findIndex(r=>r.type==='debug-event'&&r.ordinal===before.observedDebugEventOrdinal),'Final endpoint remains cold until entry activation');
  assert.deepEqual([uint(deferred[0].address,'deferred address'),deferred[0].originalBytesHex,deferred[0].activationBreakpointId,deferred[0].activationSelection,deferred[0].capability,deferred[0].codeModified],
    [base+0x50e38,'8b','native-control-before','selected-owned-parent-entry',nativeParentFinalInputsCapability,false]);
  const p=annotated(final,'parentFinalReturn','parent-final-return-admitted');
  assert.ok(records.indexOf(p)<markerIndex(final.parentFinalInputs),'Final admission precedes output range capture');
  for(const marker of[final.parentRttiMapPreflight,final.parentSoundBankOwnerGraph])if(marker)assert.ok(records.indexOf(p)<markerIndex(marker));
  assert.deepEqual([p.snapshotOrdinal,uint(p.mainModuleBaseAddress,'return base'),p.returnActivationDebugEventOrdinal,p.afterWorldDebugEventOrdinal,uint(p.entryEsp,'entryEsp'),uint(p.returnEsp,'returnEsp'),uint(p.stackAddress,'stack'),p.stackBytesHex,p.beforeSnapshotRangeResolution,p.beforeOriginalInstruction,p.observationPhase],
    [final.ordinal,base,before.observedDebugEventOrdinal,world.observedDebugEventOrdinal,U,U+4,U-16,at(final,U-16,28).toString('hex'),true,true,'native-caller-after-parent-return']);
  const entryNonvolatile=['edi','esi','ebp','ebx'].map(name=>before.context.readUInt32LE(regOffsets[name])),actualNonvolatile=['edi','esi','ebp','ebx'].map(name=>final.context.readUInt32LE(regOffsets[name]));
  assert.deepEqual(p.entryNonvolatile.map(v=>uint(v,'entry nonvolatile')),entryNonvolatile);assert.deepEqual(p.actualNonvolatile.map(v=>uint(v,'actual nonvolatile')),actualNonvolatile);assert.deepEqual(actualNonvolatile,entryNonvolatile);
  assert.deepEqual(Array.from({length:4},(_,i)=>at(final,U-16+i*4,4).readUInt32LE()),entryNonvolatile,'Actual POP words match restored nonvolatile registers');
  assert.deepEqual([final.context.readUInt32LE(196),final.context.readUInt32LE(184),p.returnWordBytesHex,p.totalWordBytesHex],[U+4,caller,at(final,U,4).toString('hex'),at(final,U+4,4).toString('hex')]);
  assert.equal(at(final,U,4).readUInt32LE(),caller);assert.equal(at(final,U+4,4).readUInt32LE(),total);
  assert.ok([0,1].includes(p.returnValue));assert.equal(final.context.readUInt32LE(176),p.returnValue);
  for(const preferred of[0x90a548,0x6e675c])assert.equal(at(final,base+preferred-0x400000,4).readUInt32LE(),(at(before,base+preferred-0x400000,4).readUInt32LE()+p.returnValue)>>>0,'Actual conditional parent clock increment');
  assert.equal(final.context.readUInt32LE(28)&65535,before.context.readUInt32LE(28)&65535);assert.equal(final.context.readUInt32LE(228)&0xffc0,before.context.readUInt32LE(228)&0xffc0);
  assert.equal(uint(final.threadEnvironment.sehWord,'final SEH'),uint(before.threadEnvironment.sehWord,'entry SEH'));
  for(const s of capture.snapshots)if(s!==final)assert.equal(s.parentFinalReturn,undefined);
  assert.ok(markers.every(m=>['parent-final-inputs-observed','parent-final-return-activated','parent-final-return-admitted','parent-final-return-skipped'].includes(m.type)),'No unknown final lifecycle marker');
  const skippedEvents=new Set();
  for(const m of markers.filter(r=>r.type==='parent-final-return-skipped')){
    assert.ok(uint(m.tid,'skipped thread')>0);assert.ok(!skippedEvents.has(m.observedDebugEventOrdinal),'One final skip per actual stopped event');skippedEvents.add(m.observedDebugEventOrdinal);
    const event=records.findIndex(r=>r.type==='debug-event'&&r.ordinal===m.observedDebugEventOrdinal);assert.ok(event>=0&&event<records.indexOf(m));
    assert.deepEqual([m.pid,m.ownerMainTid,m.breakpointId,m.reason,m.matchingHitAdvanced,m.snapshotCountAdvanced,m.originalInstructionSkipped],[owner.pid,owner.tid,nativeParentFinalReturnSite.id,'different-owned-thread',false,false,false]);
    assert.notEqual(m.tid,owner.tid);assert.deepEqual([records[event].event,records[event].pid,records[event].tid],[1,owner.pid,m.tid]);
    assert.ok(m.observedDebugEventOrdinal>=before.observedDebugEventOrdinal&&m.observedDebugEventOrdinal<final.observedDebugEventOrdinal);
  }
  const expected={completed:true,returnSnapshots:1,returnSnapshotOrdinal:final.ordinal,returnDebugEventOrdinal:final.observedDebugEventOrdinal,returnValue:p.returnValue,activationDebugEventOrdinal:before.observedDebugEventOrdinal,inputs};
  assert.deepEqual(capture.complete.parentFinalTick,expected,'Complete final observer lifecycle');
  return {verified:true,...expected,observations,originalInputOnly:true,sourceResultSupplied:false};
}
