import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createNativeRaceClockCaptureFixture,writeNativeRaceClockCaptureFixture} from './fixtures/native-race-clock-capture-fixture.mjs';
import {createNativeRaceClockCaptureConfiguration,verifyNativeRaceClockCaptureConfiguration,verifyNativeRaceClockCaptureRecords,
  createNativeRaceClockCounterBinding,assertNativeRaceClockCounterService} from '../tools/lib/native-race-clock-capture.mjs';
import {prepareNativeRaceClockCapture} from '../tools/prepare-native-race-clock-capture.mjs';
import {createNativeRaceClockInputs} from '../tools/lib/native-race-clock-inputs.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {runNativeRaceStepClock} from '../src/native-race-step-clock.mjs';
import {checkNativeRaceClock} from '../tools/check-native-race-clock.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
let fixturePromise;
const original=()=>fixturePromise??=createNativeRaceClockCaptureFixture();
function clone(f){
  const records=structuredClone(f.records),configuration=structuredClone(f.configuration);
  const capture={header:records[0],complete:records.find(r=>r.type==='complete'),snapshots:records.filter(r=>r.type==='snapshot').map(s=>({...structuredClone(s),
    context:Buffer.from(f.files.get(s.contextFile)),ranges:new Map(s.ranges.map(row=>[row.id,{...row,bytes:Buffer.from(f.files.get(row.file))}]))}))};
  return {capture,configuration,records,layout:f.layout};
}
function sync(f){for(const s of f.capture.snapshots){s.contextSha256=sha(s.context);for(const r of s.ranges.values())r.sha256=sha(r.bytes);const {context,...data}=s;
  const raw={...data,ranges:[...s.ranges.values()].map(({bytes,...r})=>r)};f.records[f.records.findIndex(r=>r.type==='snapshot'&&r.ordinal===s.ordinal)]=raw;}}
function marker(f,index,change){const s=f.capture.snapshots[index+3];change(s.raceClockObservation);const i=f.records.findIndex(r=>r.type==='race-clock-admitted'&&r.observationIndex===index+1);f.records[i]=structuredClone(s.raceClockObservation);sync(f);}
const verify=f=>verifyNativeRaceClockCaptureRecords(f);

test('separate profile pins all seven sites, four empty purpose transports, six startup writes and unchanged security',()=>{
  const {configuration:c}=createNativeRaceClockCaptureConfiguration('analysis/isolated-clock-only','analysis/unlaunched-clock-only');
  assert.equal(verifyNativeRaceClockCaptureConfiguration(c).preparedOnly,true);assert.equal(c.breakpoints.length,7);assert.equal(c.maxSnapshots,7);
  assert.deepEqual(c.breakpoints.slice(3).map(p=>[p.ranges,p.stopAfterHits]),Array.from({length:4},()=>[[],0]));
  assert.equal(c.phaseActions.flatMap(a=>a.writes).length,6);
  for(const change of[c=>c.maxSnapshots++,c=>c.maxDurationMs++,c=>c.maxEvents++,c=>c.breakpoints[6].rva='0x50df6',c=>c.breakpoints[3].stopAfterHits=1,
    c=>c.breakpoints[3].ranges.push({id:'extra',length:4,rva:'0'}),c=>c.ranges.push({id:'extra',length:4,rva:'0'}),c=>c.raceClockObservation.minimumLogicalClock=287,
    c=>c.phaseActions[0].writes[0].bytesHex='02000000',c=>c.captureThreadEnvironment=false,c=>c.denyChildProcesses=false,c=>c.parentRttiObservation={}]){
    const bad=structuredClone(c);change(bad);assert.throws(()=>verifyNativeRaceClockCaptureConfiguration(bad));}
});

test('preparer writes only a fresh configuration and refuses existing config or output; no launch',async()=>{
  const d=await mkdtemp(path.join(tmpdir(),'clock-prepare-test-')),cfg=path.join(d,'new-config.json'),out=path.join(d,'never-launched');
  const r=await prepareNativeRaceClockCapture(d,out,cfg);assert.equal(r.preparedOnly,true);assert.equal(r.requiredHelperCapability,'scoped-race-step-clock-v1');
  assert.equal(verifyNativeRaceClockCaptureConfiguration(JSON.parse(await readFile(cfg))).sites,7);
  await assert.rejects(()=>prepareNativeRaceClockCapture(d,out,cfg),/Refusing existing/);
  const existing=path.join(d,'existing-output');await writeFile(existing,'preserve',{flag:'wx'});
  await assert.rejects(()=>prepareNativeRaceClockCapture(d,existing,path.join(d,'other.json')),/Refusing existing/);assert.equal(await readFile(existing,'utf8'),'preserve');
});

test('independent retained instructions supply four exact endpoints and source replay matches every declared byte for both stack alignments',async()=>{
  for(const[entryEsp,moduleBaseAddress]of[[0x18000,0x400000],[0x18004,0x400000],[0x18000,0x730000],[0x18004,0x320000]]){
    const f=await createNativeRaceClockCaptureFixture({entryEsp,moduleBaseAddress,controlWord:entryEsp&4?0x27f:0x7f}),proof=verify(f);
    assert.equal(f.authority,'constructed-retained-instructions-not-original-process');assert.equal(proof.verified,true);assert.equal(proof.returnValue,1);
    const inputs=createNativeRaceClockInputs(proof.entry,{moduleBaseAddress:proof.moduleBaseAddress}),{memory}=createCapturedMemory(inputs.rows);
    const before=Buffer.from(proof.entry.ranges.get('race-clock-stack').bytes),stages=[];
    const b=createNativeRaceClockCounterBinding({proof,memory,onCall:e=>{stages.push(e.stage);return 0xdeadbeef;},onReturn:e=>{stages.push(e.stage);return 0;}});
    assertNativeRaceClockCounterService(b.platformCall);
    const count=runNativeRaceStepClock({memory,moduleBaseAddress:proof.moduleBaseAddress,scratchBase:entryEsp,entryRegisters:inputs.entryRegisters,numericalContext:inputs.numericalContext,services:{platformCall:b.platformCall}});
    b.assertComplete();assert.equal(count,1);assert.deepEqual(stages,['counter-call','counter-return']);assert.equal(b.events.length,1);
    for(const row of proof.returned.ranges.values())if(row.id!=='thread-seh-head')assert.deepEqual(memory.subarray(Number(row.address),Number(row.address)+row.length),row.bytes,row.id);
    assert.deepEqual(proof.entry.ranges.get('race-clock-stack').bytes,before,'Original entry remains immutable.');
  }
});

test('raw proofs reject changed activation/publication/order/thread/caller/layout/controls and rehashed field mutations',async()=>{
  const f0=await original(),mutations=[
    f=>marker(f,0,p=>p.beforeSnapshotRangeResolution=false),f=>marker(f,0,p=>p.originalInstructionVerified=false),
    f=>marker(f,0,p=>p.entryCaller='0x450df6'),f=>marker(f,1,p=>p.frame='0x1000'),f=>marker(f,1,p=>p.activationDebugEventOrdinal=0),
    f=>marker(f,2,p=>p.callSnapshotOrdinal=4),f=>marker(f,3,p=>p.callDebugEventOrdinal=5),f=>marker(f,3,p=>p.initialStatusWordHex='0000'),
    f=>marker(f,2,p=>p.originalInstructionBytesHex='90'),f=>marker(f,0,p=>p.initialInputHex['race-clock-origin']='0000000000000001'),
    f=>{f.records.find(r=>r.type==='race-clock-breakpoint-activated').rawHit=1;},
    f=>{const i=f.records.findIndex(r=>r.type==='race-clock-breakpoint-activated'),[r]=f.records.splice(i,1),j=f.records.findIndex(r=>r.type==='snapshot'&&r.ordinal===4);f.records.splice(j,0,r);},
    f=>{f.records.find(r=>r.type==='breakpoint-installation-deferred').originalBytesHex='90';},
    f=>{f.records.find(r=>r.type==='breakpoint-installation-deferred').extra='undeclared';},
    f=>{f.records.find(r=>r.type==='debug-event'&&r.ordinal===6).tid++;},
    f=>{f.capture.snapshots[4].tid++;sync(f);},
    f=>{const s=f.capture.snapshots[4];s.context.writeUInt32LE(1,176);s.registers.eax=1;sync(f);},
    f=>{const s=f.capture.snapshots[5],b=s.ranges.get('race-clock-stack').bytes;b.writeUInt32LE(0,f.layout.frame-8-f.layout.stackAddress);sync(f);},
    f=>{f.capture.snapshots[4].ranges.get('race-clock-network').bytes[0]^=1;sync(f);},
    f=>{f.capture.snapshots[5].ranges.get('race-clock-stack').bytes[512]^=1;sync(f);},
    f=>{f.capture.snapshots[4].ranges.delete('race-clock-scale');sync(f);},
    f=>{f.capture.snapshots[3].context[164]^=1;},
    f=>{f.capture.snapshots[6].context.writeUInt32LE(0x1001f,0);sync(f);},
    f=>{f.capture.snapshots[4].ranges.get('race-clock-stack').bytes[0]^=1;},
    f=>{f.capture.snapshots[0].threadEnvironment.fsBase='0x1';sync(f);},
    f=>{f.capture.snapshots[0].ranges.get('launcher-skip').moduleBaseAddress=null;sync(f);},
    f=>{f.capture.snapshots[2].ranges.get('presentation').moduleBaseAddress='0x400000';sync(f);},
    f=>{f.capture.snapshots[2].ranges.get('entry-stack').address='0x18004';sync(f);},
    f=>{f.capture.snapshots[0].ranges.get('launcher-skip').address='0x6e66f0';sync(f);},
    f=>{f.capture.snapshots[4].capturePhase='after';sync(f);},
    f=>{const s=f.capture.snapshots[4];s.context.writeUInt32LE(0x3fa7,228);s.registers.mxcsr=0x3fa7;sync(f);},
    f=>{f.records.splice(f.records.findIndex(r=>r.type==='snapshot'&&r.ordinal===5),0,{type:'intervention',elapsedMs:1});},
    f=>{f.records.find(r=>r.type==='intervention').replacementBytesHex='02000000';},
    f=>{f.capture.complete.raceClockObservation.counterPairs=2;},
    f=>{f.capture.complete.elapsedMs=90001;}
  ];
  for(const[index,mutate]of mutations.entries()){const f=clone(f0);mutate(f);assert.throws(()=>verify(f),undefined,`Mutation${index}`);}
});

test('foreign/preselection skips are explicit counter-neutral events; fabricated reads or selected-thread skips fail',async()=>{
  const f=clone(await original()),at=f.records.findIndex(r=>r.type==='debug-event'&&r.ordinal===5);
  f.records.splice(at,0,{type:'debug-event',ordinal:4.5,event:1,pid:123,tid:999});
  //Use integer debug ordinals by shifting the selected events and proofs together.
  f.records.splice(at,1);const ev=f.records.find(r=>r.type==='debug-event'&&r.ordinal===4); //startup3 event
  const idx=f.records.indexOf(ev)+1;
  const skip={type:'race-clock-skipped',pid:123,tid:999,ownerMainTid:456,breakpointId:'native-race-clock-entry',observedDebugEventOrdinal:4,rawHit:1,reason:'different-owned-thread',matchingHitAdvanced:false,snapshotCountAdvanced:false,originalInstructionSkipped:false,beforePurposeRangeRead:true,beforeStackGraphRead:true,elapsedMs:1};
  //An extra same-event skip must not be confused with the startup snapshot.
  f.records.splice(idx,0,skip);assert.throws(()=>verify(f),'A foreign TID must agree with its own debug event.');
  const valid=clone(await original()),i=valid.records.findIndex(r=>r.type==='debug-event'&&r.ordinal===5);
  //Insert an integer event in a free gap after renumbering all debug lineage.
  for(const r of valid.records)if(r.type==='debug-event')r.ordinal*=10;
  for(const s of valid.capture.snapshots)s.observedDebugEventOrdinal*=10;
  for(let k=0;k<4;k++)marker(valid,k,p=>{p.observedDebugEventOrdinal*=10;p.entryDebugEventOrdinal*=10;p.activationDebugEventOrdinal*=10;p.callDebugEventOrdinal*=10;});
  for(const p of valid.records.filter(r=>r.type==='race-clock-breakpoint-activated')){p.observedDebugEventOrdinal*=10;p.entryDebugEventOrdinal*=10;}
  for(const key of['entryDebugEventOrdinal','activationDebugEventOrdinal','returnDebugEventOrdinal'])valid.capture.complete.raceClockObservation[key]*=10;
  valid.records.splice(i,0,{type:'debug-event',ordinal:45,event:1,pid:123,tid:999},{...skip,observedDebugEventOrdinal:45});
  assert.equal(verify(valid).verified,true);
  valid.records.find(r=>r.type==='race-clock-skipped').beforeStackGraphRead=false;assert.throws(()=>verify(valid));
});

test('binding rejects unauthenticated proofs, caller/output/preimage/state changes and reuse; only eight API output bytes are written',async()=>{
  assert.throws(()=>assertNativeRaceClockCounterService(()=>0));assert.throws(()=>createNativeRaceClockCounterBinding({proof:{},memory:Buffer.alloc(100)}));
  const f=await original(),proof=verify(f),call=f.endpoint[1],l=proof.layout;
  const make=()=>{const memory=Buffer.from(call.memory);memory.writeUInt32LE(0x489d13,l.frame-8);
    const inputs=createNativeRaceClockInputs(proof.entry,{moduleBaseAddress:proof.moduleBaseAddress}),runtime={memory,moduleBaseAddress:0x400000,scratchBase:l.frame-8,
      entryRegisters:{EBX:f.incoming.EBX,EBP:l.timerEbp,ESI:0x1700014,EDI:f.incoming.EDI},numericalContext:inputs.numericalContext,
      nativeRaceClockCall:{clockEntryEsp:l.entryEsp,entryEsp:l.timerEntryEsp,returnAddress:0x441cb0,frame:l.frame,outputAddress:l.outputAddress,iatTarget:0x1700014,preCallEsp:l.counterCallEsp,serviceEntryEsp:l.frame-8,serviceReturnAddress:0x489d13}};
    return {memory,runtime,b:createNativeRaceClockCounterBinding({proof,memory})};};
  for(const change of[r=>r.scratchBase++,r=>r.nativeWeatherCounterCall={},r=>r.nativeRaceClockCall.returnAddress=0x498458,r=>r.nativeRaceClockCall.iatTarget++,r=>r.entryRegisters.ESI++,
    r=>r.memory[l.outputAddress]^=1,r=>r.memory[l.frame-8]^=1,r=>r.memory[l.stackAddress]^=1,r=>r.numericalContext.sse.mxcsr^=1]){
    const x=make();change(x.runtime);assert.throws(()=>x.b.platformCall('QueryPerformanceCounter',[l.outputAddress],x.runtime));}
  const x=make(),before=Buffer.from(x.memory);assert.throws(()=>x.b.assertComplete());assert.throws(()=>x.b.platformCall('QueryPerformanceFrequency',[l.outputAddress],x.runtime));
  assert.throws(()=>x.b.platformCall('QueryPerformanceCounter',[l.outputAddress+4],x.runtime));assert.equal(x.b.platformCall('QueryPerformanceCounter',[l.outputAddress],x.runtime),1);x.b.assertComplete();
  for(let p=0;p<x.memory.length;p++)if(p<l.outputAddress||p>=l.outputAddress+8)assert.equal(x.memory[p],before[p]);
  assert.throws(()=>x.b.platformCall('QueryPerformanceCounter',[l.outputAddress],x.runtime),/cannot be reused/);
});

test('written independent fixtures run the whole checker; private QPC spills remain a visible failure and are never copied into source',async()=>{
  for(const privateSpill of[false,true]){
    const d=await mkdtemp(path.join(tmpdir(),'clock-checker-constructed-')),input=path.join(d,'capture');await writeNativeRaceClockCaptureFixture(input,{privateSpill});
    const {report:r}=await checkNativeRaceClock(input,path.join(d,'report'));assert.equal(r.sourceExecuted,true,r.error);assert.equal(r.matched,!privateSpill);
    assert.equal(r.clockResultMatched,true);assert.equal(r.scaledClockMatched,true);assert.equal(r.counterEvents.length,1);
    assert.equal(r.counterStackEffects.privateApiStack.differingBytes,privateSpill?1:0);assert.equal(r.stages[0].matched,true);
    if(privateSpill){assert.equal(r.stages[1].comparison.firstDivergence.address,0x17f88);assert.equal(r.stages[1].comparison.differingBytes,1);}
  }
});

test('an observed QPC BOOL0 remains zero, preserves its observed eight bytes and does not become a forced success',async()=>{
  const f=await createNativeRaceClockCaptureFixture({qpcResult:0,moduleBaseAddress:0x730000,entryEsp:0x18004}),proof=verify(f);
  const inputs=createNativeRaceClockInputs(proof.entry,{moduleBaseAddress:proof.moduleBaseAddress}),{memory}=createCapturedMemory(inputs.rows),b=createNativeRaceClockCounterBinding({proof,memory});
  const result=runNativeRaceStepClock({memory,scratchBase:inputs.entryEsp,moduleBaseAddress:proof.moduleBaseAddress,entryRegisters:inputs.entryRegisters,numericalContext:inputs.numericalContext,services:{platformCall:b.platformCall}});
  b.assertComplete();assert.equal(b.events[0].returnedEax,0);assert.equal(b.events[0].outputHex,b.events[0].preimageHex);assert.equal(result,proof.returnValue);
  for(const row of proof.returned.ranges.values())if(row.id!=='thread-seh-head')assert.deepEqual(memory.subarray(Number(row.address),Number(row.address)+row.length),row.bytes);
});
