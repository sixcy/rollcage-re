//Independent bounded warm441c70 transport verification and QPC-only binding.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createReduxCaptureConfig} from './redux-capture-config.mjs';
import {createCapturedMemory} from './captured-memory.mjs';
import {bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';
import {nativeRaceClockCapability,nativeRaceClockPolicy,nativeRaceClockLayout,nativeRaceClockSites,nativeRaceClockRanges,
  nativeRaceClockFixedRegions,createNativeRaceClockInputs} from './native-race-clock-inputs.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const uint=(v,label)=>{const n=Number(v);assert.ok((typeof v==='number'||typeof v==='string'&&/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(v))&&Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff,`Race clock uint32 ${label}`);return n;};
const positive=(v,label)=>{const n=uint(v,label);assert.ok(n>0,label);return n;};
const rows=s=>s.ranges instanceof Map?[...s.ranges.values()]:s.ranges;
const startupIds=['launcher-policy','graphics-policy','before-device-creation'];
const regOffsets={edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,cs:188,eflags:192,esp:196,ss:200,fpuControlWord:28,fpuStatusWord:32,mxcsr:228};
const layoutAddresses=['entryEsp','timerEntryEsp','timerEbp','alignedAddress','frame','counterCallEsp','counterReturnEsp','outputAddress','returnEsp','stackAddress'];
const keys=(v,w,label)=>assert.deepEqual(Object.keys(v).sort(),w.toSorted(),label);
const validFile=name=>typeof name==='string'&&path.basename(name)===name&&!name.includes('\\')&&name!=='.'&&name!=='..';
const canonical=(directory,output)=>{const c=createReduxCaptureConfig(directory,'hidden-idle',output);c.breakpoints=c.breakpoints.slice(0,3);c.ranges=[];c.maxDurationMs=90000;c.maxEvents=1000000;c.maxSnapshots=7;c.captureThreadEnvironment=true;c.raceClockObservation=nativeRaceClockPolicy();
  c.breakpoints.push(...nativeRaceClockSites().map(s=>({id:s.id,rva:`0x${(s.preferredAddress-0x400000).toString(16)}`,stopAfterHits:0,ranges:[]})));return c;};

export function verifyNativeRaceClockCaptureConfiguration(configuration){
  assert.ok(configuration&&typeof configuration.executablePath==='string'&&typeof configuration.outputDirectory==='string','Clock capture paths');
  const directory=path.dirname(path.dirname(path.dirname(configuration.executablePath))),expected=canonical(directory,configuration.outputDirectory);
  assert.deepEqual(configuration,expected,'Exact separate warm-clock profile, startup actions and security policy');
  return {requiredHelperCapability:nativeRaceClockCapability,maxSnapshots:7,purposeSnapshots:4,maxDurationMs:90000,maxEvents:1000000,sites:7,preparedOnly:true};
}
export function createNativeRaceClockCaptureConfiguration(directory,output){const configuration=canonical(directory,output);return {configuration,...verifyNativeRaceClockCaptureConfiguration(configuration)};}

function rawContext(snapshot){
  assert.ok(Buffer.isBuffer(snapshot.context)&&snapshot.context.length===716,'Clock actual716-byte context');assert.equal(sha(snapshot.context),snapshot.contextSha256,'Clock raw context SHA');assert.ok(validFile(snapshot.contextFile),'Clock context direct child file');
  assert.equal(snapshot.context.readUInt32LE()&0x1002f,0x1002f,'Clock context includes control, integer, segment, floating and extended register observations');
  const result={};for(const[name,offset]of Object.entries(regOffsets)){result[name]=snapshot.context.readUInt32LE(offset);assert.equal(uint(snapshot.registers?.[name],name),result[name],`Clock raw/summary ${name}`);}return result;
}
function rowBytes(snapshot){
  const list=rows(snapshot);assert.ok(Array.isArray(list),'Clock actual rows');assert.equal(new Set(list.map(r=>r.id)).size,list.length,'Clock row identities');
  if(snapshot.ranges instanceof Map)for(const[id,row]of snapshot.ranges)assert.equal(id,row.id);
  for(const row of list){assert.ok(validFile(row.file),'Clock range direct child filename');assert.ok(Buffer.isBuffer(row.bytes)&&row.bytes.length===row.length&&row.length>0,'Clock exact raw row bytes');assert.equal(sha(row.bytes),row.sha256,'Clock raw row SHA');}
  return createCapturedMemory(list);
}
function serializedSnapshot(snapshot){const {context,...plain}=snapshot;return {...plain,ranges:rows(snapshot).map(({bytes,...r})=>r)};}
function state(snapshot){return {cw:snapshot.context.readUInt16LE(28),sw:snapshot.context.readUInt16LE(32),mxcsr:snapshot.context.readUInt32LE(228)};}
const proofs=new WeakMap(),services=new WeakSet();

export function verifyNativeRaceClockCaptureRecords({capture,configuration,records}){
  verifyNativeRaceClockCaptureConfiguration(configuration);assert.ok(Array.isArray(records)&&records.length>0,'Clock raw trace');
  assert.deepEqual(capture.header,records[0],'Clock header is the original raw record');assert.equal(capture.header.type,'capture');assert.equal(capture.header.schemaVersion,1);assert.equal(capture.header.executableSha256,REDUX_SHA256);
  for(const key of['executablePath','workingDirectory','arguments','maxDurationMs','maxEvents','maxSnapshots'])assert.deepEqual(capture.header[key],configuration[key],`Clock header ${key}`);
  assert.equal(capture.header.breakpointMode,'software-int3');assert.equal(capture.header.cleanupPolicy,'freeze-or-prove-terminated-owned-threads-before-unpatch-and-termination');
  assert.deepEqual(capture.header.helperCapabilities,[nativeRaceClockCapability],'Clock exact helper capability');assert.deepEqual(capture.header.raceClockObservation,nativeRaceClockPolicy());
  assert.equal(records.filter(r=>r.type==='capture').length,1);assert.ok(!records.some(r=>['capture-error','fatal-exception'].includes(r.type)),'Clock successful observation only');
  const owners=records.filter(r=>r.type==='owned-process'),modules=records.filter(r=>r.type==='module'&&r.kind==='main');assert.equal(owners.length,1);assert.equal(modules.length,1);
  const ownerPid=positive(owners[0].pid,'owner PID'),ownerMainTid=positive(owners[0].tid,'owner main TID'),base=positive(modules[0].baseAddress,'actual module');assert.equal(owners[0].showWindow,false);assert.equal(modules[0].wow64,true);
  const shots=capture.snapshots,rawShots=records.filter(r=>r.type==='snapshot');assert.equal(shots.length,7,'Clock exactly7 snapshots');assert.equal(rawShots.length,7);
  const sites=nativeRaceClockSites(base),purpose=shots.slice(3),roles=['entry','counter-call','counter-return','return'];
  assert.deepEqual(shots.map(s=>s.breakpointId),[...startupIds,...sites.map(s=>s.id)]);
  const readers=new Map(),registers=new Map();
  for(const[index,s]of shots.entries()){
    assert.equal(s.ordinal,index+1);assert.equal(s.hit,1);assert.equal(s.tid,ownerMainTid);assert.deepEqual(serializedSnapshot(s),rawShots[index],'Clock loaded/raw snapshot identity');
    readers.set(s,rowBytes(s));registers.set(s,rawContext(s));
    assert.equal(s.capturePhase,'before-declared-writes-before-original-instruction');
    const thread=bindCapturedNativeThreadEnvironment(s,{memory:readers.get(s).memory});assert.ok(thread.nativeTls,'Actual stopped-thread FS:[0] observation');
    if(index>=3){const list=rows(s);assert.ok(list.every(r=>r.source==='race-clock-observation'||r.id==='thread-seh-head'),'Only typed clock and generic TEB rows');}
  }
  const [entry,counterCall,counterReturn,returned]=purpose,initial=createNativeRaceClockInputs(entry,{moduleBaseAddress:base}),layout=initial.layout,C=layout.entryEsp;
  const initialRows=rows(entry).filter(r=>r.source==='race-clock-observation'),initialInputHex=Object.fromEntries(initialRows.map(r=>[r.id,r.bytes.toString('hex')]));
  const at=(s,p,n)=>readers.get(s).span(p,n),original=registers.get(entry),entryNonvolatile=['ebx','ebp','esi','edi'].map(n=>original[n]);
  const entryCaller=at(entry,C,4).readUInt32LE(),outerCaller=at(entry,C+24,4).readUInt32LE(),logicalClock=at(entry,base+0x50a548,4).readUInt32LE(),initialDelivered=at(entry,base+0x2e66f8,4).readUInt32LE();
  const qpc=at(entry,base+0x16e0fc,4).readUInt32LE(),initialState=state(entry),markers=records.filter(r=>r.type==='race-clock-admitted');assert.equal(markers.length,4);
  const eventIndex=new Map();let debugPrevious=0;
  for(const[index,r]of records.entries())if(r.type==='debug-event'){assert.ok(Number.isSafeInteger(r.ordinal)&&r.ordinal>debugPrevious,'Clock monotonic debug events');debugPrevious=r.ordinal;eventIndex.set(r.ordinal,index);}
  const admittedKeys=['type','role','pid','tid','ownerMainTid','breakpointId','mainModuleBaseAddress','observedDebugEventOrdinal','snapshotOrdinal','entryDebugEventOrdinal','entrySnapshotOrdinal','observationIndex',...Object.keys(layout),
    'entryCaller','outerCaller','sessionAddress','logicalClock','initialDelivered','entryNonvolatile','initialControlWordHex','initialStatusWordHex','initialMxcsrHex','initialInputHex',
    'beforeSnapshotRangeResolution','beforeOriginalInstruction','originalInstructionBytesHex','originalInstructionVerified','callDebugEventOrdinal','callSnapshotOrdinal','activationDebugEventOrdinal','elapsedMs'];
  const snapshotIndex=s=>records.findIndex(r=>r.type==='snapshot'&&r.ordinal===s.ordinal);
  let previousEvent=0;
  for(const[index,s]of purpose.entries()){
    const p=s.raceClockObservation,marker=markers[index],r=registers.get(s),expectedRows=nativeRaceClockRanges(C,base,initial.sessionAddress);
    keys(p,admittedKeys,'Exact clock admission proof schema');assert.deepEqual(p,marker,'Clock annotation is the exact emitted proof');
    const markerAt=records.indexOf(marker),eventAt=eventIndex.get(s.observedDebugEventOrdinal),snapshotAt=snapshotIndex(s);assert.ok(eventAt!==undefined&&eventAt<markerAt&&markerAt<snapshotAt&&!records.slice(eventAt+1,snapshotAt).some(x=>x.type==='debug-event'),'Clock proof/snapshot in one stopped event');
    assert.deepEqual([records[eventAt].event,records[eventAt].pid,records[eventAt].tid],[1,ownerPid,ownerMainTid]);assert.ok(s.observedDebugEventOrdinal>previousEvent);previousEvent=s.observedDebugEventOrdinal;
    assert.deepEqual([p.type,p.role,p.pid,p.tid,p.ownerMainTid,p.breakpointId,uint(p.mainModuleBaseAddress,'proof module'),p.observedDebugEventOrdinal,p.snapshotOrdinal,p.entryDebugEventOrdinal,p.entrySnapshotOrdinal,p.observationIndex],
      ['race-clock-admitted',roles[index],ownerPid,ownerMainTid,ownerMainTid,s.breakpointId,base,s.observedDebugEventOrdinal,s.ordinal,entry.observedDebugEventOrdinal,entry.ordinal,index+1]);
    for(const key of layoutAddresses)assert.equal(uint(p[key],key),layout[key]);assert.equal(p.stackBytes,540);
    assert.deepEqual([uint(p.entryCaller,'caller'),uint(p.outerCaller,'outer'),uint(p.sessionAddress,'session'),p.logicalClock,p.initialDelivered],[entryCaller,outerCaller,initial.sessionAddress,logicalClock,initialDelivered]);
    assert.deepEqual(p.entryNonvolatile.map(v=>uint(v,'nonvolatile')),entryNonvolatile);
    assert.deepEqual([p.initialControlWordHex,p.initialStatusWordHex,p.initialMxcsrHex],[entry.context.subarray(28,30).toString('hex'),entry.context.subarray(32,34).toString('hex'),entry.context.subarray(228,232).toString('hex')]);assert.deepEqual(p.initialInputHex,initialInputHex);
    assert.deepEqual([p.beforeSnapshotRangeResolution,p.beforeOriginalInstruction,p.originalInstructionVerified],[true,true,true]);assert.equal(p.originalInstructionBytesHex,sites[index].bytesHex);
    assert.deepEqual([p.activationDebugEventOrdinal,p.callDebugEventOrdinal,p.callSnapshotOrdinal],[index?entry.observedDebugEventOrdinal:0,index>=2?counterCall.observedDebugEventOrdinal:0,index>=2?counterCall.ordinal:0]);
    assert.ok(Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0&&p.elapsedMs<=90000);
    const observed=rows(s).filter(row=>row.id!=='thread-seh-head');assert.equal(observed.length,15);assert.deepEqual(observed.map(x=>x.id).sort(),expectedRows.map(x=>x.id).sort());
    for(const expected of expectedRows){const row=observed.find(x=>x.id===expected.id);assert.equal(uint(row.address,row.id),expected.address);assert.equal(row.length,expected.length);assert.equal(row.source,expected.source);
      assert.equal(row.rangeMode,undefined);assert.equal(row.readableRegion,undefined);assert.equal(row.dereferenceOffsets,undefined);}
    assert.equal(r.eip,sites[index].address);assert.equal(r.esp,[C,layout.counterCallEsp,layout.counterReturnEsp,layout.returnEsp][index]);
    assert.equal(at(s,C,4).readUInt32LE(),entryCaller);assert.deepEqual(at(s,C+4,24),at(entry,C+4,24),'Clock original outer frame remains untouched');
    for(const field of nativeRaceClockFixedRegions){if(index===3&&field.comparison==='mutable')continue;const address=base+field.preferredAddress-0x400000;assert.deepEqual(at(s,address,field.length),at(entry,address,field.length),`Clock unchanged original ${field.id}`);}
    assert.deepEqual(at(s,initial.sessionAddress+0x57c,4),at(entry,initial.sessionAddress+0x57c,4));
    assert.equal(r.fpuControlWord,original.fpuControlWord);assert.equal(r.mxcsr&0xffc0,original.mxcsr&0xffc0);
    assert.equal(uint(s.threadEnvironment.sehWord,'SEH'),uint(entry.threadEnvironment.sehWord,'initial SEH'));
  }
  const callRegs=registers.get(counterCall),returnRegs=registers.get(counterReturn),finalRegs=registers.get(returned);
  for(const s of[counterCall,counterReturn]){
    const r=registers.get(s);assert.deepEqual([r.ebx,r.ebp,r.esi,r.edi],[original.ebx,layout.timerEbp,qpc,original.edi]);
    assert.equal(at(s,layout.timerEntryEsp,4).readUInt32LE(),base+0x41cb0);assert.equal(at(s,layout.counterCallEsp,4).readUInt32LE(),layout.outputAddress);
    assert.equal(at(s,layout.frame,4).readUInt32LE(),original.edi);assert.equal(at(s,layout.frame+4,4).readUInt32LE(),original.esi);assert.equal(at(s,layout.frame+8,4).readUInt32LE(),layout.timerEbp);assert.equal(at(s,layout.frame+12,4).readUInt32LE(),original.ebx);
    assert.equal(at(s,layout.timerEbp,4).readUInt32LE(),original.ebp);assert.equal(at(s,C-12,4).readUInt32LE(),original.ebx);
  }
  assert.equal(callRegs.eax,layout.outputAddress);assert.deepEqual(state(counterCall),initialState,'No numerical operation before warm QPC');
  assert.equal(at(counterReturn,layout.frame-8,4).readUInt32LE(),base+0x89d13,'Actual API CALL return word');
  assert.deepEqual(['ebx','ebp','esi','edi'].map(n=>finalRegs[n]),entryNonvolatile);assert.ok(finalRegs.eax>=1&&finalRegs.eax<=3);assert.equal(at(returned,base+0x2e66f8,4).readUInt32LE(),(initialDelivered+finalRegs.eax)>>>0);
  assert.equal(at(returned,C-12,4).readUInt32LE(),original.ebx,'Clock saved EBX producer');
  const cold=sites.slice(1),deferred=records.filter(r=>r.type==='breakpoint-installation-deferred'&&cold.some(s=>s.id===r.id));assert.equal(deferred.length,3);
  const activation=records.filter(r=>r.type==='race-clock-breakpoint-activated');assert.equal(activation.length,3);
  for(const[index,s]of cold.entries()){
    const d=deferred[index],p=activation[index];assert.deepEqual([d.id,uint(d.address,'deferred address'),d.originalBytesHex,d.activationBreakpointId,d.activationSelection,d.capability,d.codeModified],
      [s.id,s.address,s.bytesHex,sites[0].id,'selected-owned-warm-clock-entry',nativeRaceClockCapability,false]);assert.ok(records.indexOf(d)<eventIndex.get(entry.observedDebugEventOrdinal));
    keys(d,['type','id','address','originalBytesHex','activationBreakpointId','activationSelection','capability','codeModified','elapsedMs'],'Exact deferred clock schema');
    keys(p,['type','pid','tid','ownerMainTid','id','address','originalBytesHex','patchBytesHex','activationBreakpointId','activationSelection','capability','codeModified','observedDebugEventOrdinal','entryDebugEventOrdinal','entrySnapshotOrdinal','mainModuleBaseAddress','rawHit','matchingHit','capturedHit','afterEntrySnapshotPublication','beforeOriginalInstruction','elapsedMs'],'Exact clock activation schema');
    assert.deepEqual([p.pid,p.tid,p.ownerMainTid,p.id,uint(p.address,'activation address'),p.originalBytesHex,p.patchBytesHex,p.activationBreakpointId,p.activationSelection,p.capability,p.codeModified,p.observedDebugEventOrdinal,p.entryDebugEventOrdinal,p.entrySnapshotOrdinal,uint(p.mainModuleBaseAddress,'activation module'),p.rawHit,p.matchingHit,p.capturedHit,p.afterEntrySnapshotPublication,p.beforeOriginalInstruction],
      [ownerPid,ownerMainTid,ownerMainTid,s.id,s.address,s.bytesHex,'cc',sites[0].id,'selected-owned-warm-clock-entry',nativeRaceClockCapability,true,entry.observedDebugEventOrdinal,entry.observedDebugEventOrdinal,entry.ordinal,base,0,0,0,true,true]);
    const where=records.indexOf(p);assert.ok(where>snapshotIndex(entry)&&where<eventIndex.get(counterCall.observedDebugEventOrdinal)&&!records.slice(snapshotIndex(entry)+1,where).some(x=>x.type==='debug-event'),'Cold activation follows complete entry publication in same stop');
  }
  const purposeInstalls=records.filter(r=>r.type==='breakpoint-installed'&&sites.some(s=>s.id===r.id));assert.equal(purposeInstalls.length,1,'Only clock entry installed initially');assert.equal(purposeInstalls[0].id,sites[0].id);assert.equal(uint(purposeInstalls[0].address,'entry install'),sites[0].address);assert.equal(purposeInstalls[0].originalBytesHex,'83');
  assert.deepEqual(records.filter(r=>r.type==='breakpoint-installed').map(r=>r.id),[...startupIds,sites[0].id],'No extra initial code sites');
  assert.equal(records.filter(r=>r.type==='breakpoint-installation-deferred').length,3,'Only three declared cold sites');
  const skipEvents=new Set();
  for(const p of records.filter(r=>r.type==='race-clock-skipped')){
    keys(p,['type','pid','tid','ownerMainTid','breakpointId','observedDebugEventOrdinal','rawHit','reason','matchingHitAdvanced','snapshotCountAdvanced','originalInstructionSkipped','beforePurposeRangeRead','beforeStackGraphRead','elapsedMs'],'Exact clock skip schema');
    assert.equal(p.pid,ownerPid);assert.equal(p.ownerMainTid,ownerMainTid);assert.ok(sites.some(s=>s.id===p.breakpointId));assert.ok(!skipEvents.has(p.observedDebugEventOrdinal));skipEvents.add(p.observedDebugEventOrdinal);
    const ev=eventIndex.get(p.observedDebugEventOrdinal);assert.ok(ev!==undefined&&ev<records.indexOf(p));assert.deepEqual([records[ev].event,records[ev].pid,records[ev].tid],[1,ownerPid,p.tid]);positive(p.rawHit,'skipped raw hit');
    assert.deepEqual([p.matchingHitAdvanced,p.snapshotCountAdvanced,p.originalInstructionSkipped,p.beforePurposeRangeRead],[false,false,false,true]);
    if(p.reason==='different-owned-thread'){
      assert.notEqual(p.tid,ownerMainTid);assert.equal(p.beforeStackGraphRead,true);positive(p.tid,'foreign owned TID');
      if(p.breakpointId!==sites[0].id)assert.ok(p.observedDebugEventOrdinal>entry.observedDebugEventOrdinal,'Cold foreign hit follows activation');
      assert.ok(p.observedDebugEventOrdinal<returned.observedDebugEventOrdinal);
    }else{assert.equal(p.reason,'warm-entry-selection-not-matched');assert.equal(p.tid,ownerMainTid);assert.equal(p.breakpointId,sites[0].id);assert.equal(p.beforeStackGraphRead,false);assert.ok(p.observedDebugEventOrdinal<entry.observedDebugEventOrdinal);}
  }
  assert.ok(records.filter(r=>r.type?.startsWith('race-clock-')).every(r=>['race-clock-admitted','race-clock-breakpoint-activated','race-clock-skipped'].includes(r.type)),'No unknown clock lifecycle records');
  const entryIndex=eventIndex.get(entry.observedDebugEventOrdinal),lastIndex=snapshotIndex(returned);
  assert.ok(!records.slice(entryIndex,lastIndex+1).some(r=>r.type==='intervention'||/intervention$/.test(r.type)||r.type==='service-memory-write'),'No game/service interventions inside selected warm interval');
  const interventions=records.filter(r=>r.type==='intervention');assert.equal(interventions.length,6,'Exact six original startup writes');
  let interventionIndex=0;
  for(const[index,id]of startupIds.entries()){
    const s=shots[index],r=registers.get(s),point=configuration.breakpoints[index],observed=rows(s).filter(x=>x.id!=='thread-seh-head');assert.equal(observed.length,point.ranges.length);
    const ev=eventIndex.get(s.observedDebugEventOrdinal);assert.ok(ev!==undefined&&ev<snapshotIndex(s)&&!records.slice(ev+1,snapshotIndex(s)).some(x=>x.type==='debug-event'),'Startup same-event publication');assert.deepEqual([records[ev].event,records[ev].pid,records[ev].tid],[1,ownerPid,ownerMainTid]);assert.equal(r.eip,base+Number(point.rva));
    for(const d of point.ranges){const row=observed.find(x=>x.id===d.id);assert.ok(row);assert.equal(row.length,d.length);assert.equal(row.rootAddress,null);assert.equal(row.rootRva,d.rva??null);assert.equal(row.baseRegister,d.baseRegister??null);assert.deepEqual(row.dereferenceOffsets,d.dereferenceOffsets??[]);assert.equal(uint(row.offset??0,'startup offset'),Number(d.offset??0));
      //The original range writer publishes a module base only for an RVA
      //root. Register-rooted ranges retain their actual register identity.
      if(d.rva!==undefined)assert.equal(uint(row.moduleBaseAddress,'startup module'),base);else assert.equal(row.moduleBaseAddress,null,'Register-rooted startup row has no module root');
      if(d.baseRegister)assert.equal(uint(row.address,'startup register address'),r[d.baseRegister]+Number(d.offset??0));
      else if(!d.dereferenceOffsets?.length)assert.equal(uint(row.address,'startup RVA address'),base+Number(d.rva)+Number(d.offset??0));}
    const writes=configuration.phaseActions[index].writes;
    for(const write of writes){
      const p=interventions[interventionIndex++],target=write.baseRegister?r[write.baseRegister]+Number(write.offset):!write.dereferenceOffsets?base+Number(write.rva):id==='launcher-policy'?uint(observed.find(x=>x.id==='launcher-config').address,'launcher config')-0x42c+Number(write.offset):uint(observed.find(x=>x.id==='graphics-mode').address,'graphics config')-0x24+Number(write.offset);
      assert.deepEqual([p.breakpointId,p.hit,uint(p.address,'startup write'),p.replacementBytesHex],[id,1,target,write.bytesHex]);
      const expected=write.expectedAnyBytesHex??[write.expectedBytesHex];assert.deepEqual(p.acceptedOriginalBytesHex,expected);assert.ok(expected.includes(p.originalBytesHex));
      const ev=eventIndex.get(s.observedDebugEventOrdinal),where=records.indexOf(p),published=snapshotIndex(s);
      assert.ok(ev!==undefined&&ev<published&&published<where&&!records.slice(published+1,where).some(x=>x.type==='debug-event'),'Original startup snapshot precedes its guarded writes in the same stop');assert.ok(where<entryIndex);
    }
  }
  const completes=records.filter(r=>r.type==='complete');assert.equal(completes.length,1);assert.deepEqual(capture.complete,completes[0]);assert.equal(capture.complete.reason,'snapshot-bound');assert.equal(capture.complete.snapshots,7);assert.ok(Number.isSafeInteger(capture.complete.events)&&capture.complete.events>=0&&capture.complete.events<=1000000&&Number.isFinite(capture.complete.elapsedMs)&&capture.complete.elapsedMs>=0&&capture.complete.elapsedMs<=90000);
  assert.deepEqual(capture.complete.raceClockObservation,{selectedSnapshots:4,counterPairs:1,counterSnapshots:2,entryDebugEventOrdinal:entry.observedDebugEventOrdinal,entrySnapshotOrdinal:entry.ordinal,activationDebugEventOrdinal:entry.observedDebugEventOrdinal,returnDebugEventOrdinal:returned.observedDebugEventOrdinal,returnSnapshotOrdinal:returned.ordinal,returnValue:finalRegs.eax});
  const outputHex=at(counterReturn,layout.outputAddress,8).toString('hex'),preimageHex=at(counterCall,layout.outputAddress,8).toString('hex'),counterStatePreserved=JSON.stringify(state(counterReturn))===JSON.stringify(state(counterCall));
  const proof=Object.freeze({verified:true,entry,counterCall,counterReturn,returned,moduleBaseAddress:base,layout:Object.freeze(layout),ownerPid,ownerMainTid,logicalClock,initialDelivered,returnValue:finalRegs.eax,counterStatePreserved,
    limits:['Only one observed warm441c70 call; no outer cadence, next tick or cold QPF proof.','QPC binding supplies eight output bytes and actual BOOL only. Native private callee stack changes are comparison evidence, never input refresh.','Full sticky exception/private CPU ABI parity is not established by transport verification.']});
  proofs.set(proof,{base,C,layout,original,initialState,callState:state(counterCall),counterStatePreserved,qpc,initialRows:initialRows.map(r=>({address:Number(r.address),bytes:Buffer.from(r.bytes)})),callStack:Buffer.from(at(counterCall,layout.stackAddress,540)),preimageHex,outputHex,returnedEax:returnRegs.eax});return proof;
}

export function assertNativeRaceClockCounterService(service){assert.ok(services.has(service),'Authenticated separate race-clock QPC service required');}
export function createNativeRaceClockCounterBinding({proof,memory,onCall,onReturn}){
  const e=proofs.get(proof);assert.ok(e&&Buffer.isBuffer(memory),'Original authenticated race-clock proof and shared source memory required');
  for(const fn of[onCall,onReturn])assert.ok(fn===undefined||typeof fn==='function','Clock service observers are functions');
  assert.ok(e.counterStatePreserved,'Observed QPC numerical-state change is an unbound external effect');
  const l=e.layout,events=[];let consumed=false;
  const platformCall=(name,args,runtime)=>{
    assert.ok(!consumed,'Race clock QPC outcome cannot be reused');assert.equal(name,'QueryPerformanceCounter');assert.equal(runtime.memory,memory);assert.equal(runtime.moduleBaseAddress,e.base);assert.equal(runtime.scratchBase,l.frame-8);assert.deepEqual(args,[l.outputAddress]);assert.equal(runtime.nativeWeatherCounterCall,undefined);
    const meta=runtime.nativeRaceClockCall;
    assert.deepEqual(meta,{clockEntryEsp:e.C,entryEsp:l.timerEntryEsp,returnAddress:0x441cb0,frame:l.frame,outputAddress:l.outputAddress,iatTarget:e.qpc,preCallEsp:l.counterCallEsp,serviceEntryEsp:l.frame-8,serviceReturnAddress:e.base+0x89d13},'Genuine source clock/counter caller publication');
    assert.deepEqual(runtime.entryRegisters,{EBX:e.original.ebx,EBP:l.timerEbp,ESI:e.qpc,EDI:e.original.edi});
    assert.deepEqual([runtime.numericalContext?.x87?.controlWord,runtime.numericalContext?.x87?.statusWord,runtime.numericalContext?.sse?.mxcsr],[e.callState.cw,e.callState.sw,e.callState.mxcsr],'Original source numerical state at QPC');
    for(const row of e.initialRows)if(row.address!==l.stackAddress)assert.deepEqual(memory.subarray(row.address,row.address+row.bytes.length),row.bytes,'Clock original fixed inputs before QPC');
    const sourceStack=memory.subarray(l.stackAddress,l.stackAddress+540),cpuReturn=l.frame-8-l.stackAddress;
    assert.equal(memory.readUInt32LE(l.frame-8),e.base+0x89d13,'Source CPU CALL return');
    for(let i=0;i<540;i++)if(i<cpuReturn||i>=cpuReturn+4)assert.equal(sourceStack[i],e.callStack[i],`Source pre-QPC stack byte${i}`);
    assert.equal(memory.subarray(l.outputAddress,l.outputAddress+8).toString('hex'),e.preimageHex,'Complete genuine source QPC output preimage');
    const known={ebx:e.original.ebx,ebp:l.timerEbp,esi:e.qpc,edi:e.original.edi};
    onCall?.(Object.freeze({stage:'counter-call',memory,outputAddress:l.outputAddress,sourceRegisters:Object.freeze({...known,eax:l.outputAddress,esp:l.counterCallEsp,eip:e.base+0x89d11})}));
    const output=Buffer.from(e.outputHex,'hex');for(let i=0;i<8;i++)memory[l.outputAddress+i]=output[i];consumed=true;
    events.push({service:name,outputAddress:l.outputAddress,preimageHex:e.preimageHex,outputHex:e.outputHex,returnedEax:e.returnedEax,authority:'actual-QPC-only'});
    onReturn?.(Object.freeze({stage:'counter-return',memory,outputAddress:l.outputAddress,sourceRegisters:Object.freeze({...known,eax:e.returnedEax,esp:l.counterReturnEsp,eip:e.base+0x89d13})}));return e.returnedEax;
  };
  services.add(platformCall);return {platformCall,events,assertComplete(){assert.ok(consumed,'Actual race-clock QPC outcome was not consumed');}};
}
