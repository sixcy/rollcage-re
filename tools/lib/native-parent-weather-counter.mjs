import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export const nativeParentWeatherCounterCapability='scoped-parent-weather-counter-v4';
export const nativeParentWeatherCounterSites=Object.freeze([
  Object.freeze({id:'native-parent-weather-counter-call',preferredAddress:0x489d11,bytesHex:'ffd6'}),
  Object.freeze({id:'native-parent-weather-counter-return',preferredAddress:0x489d13,bytesHex:'8b442418'}),
]);
export function nativeParentWeatherCounterPolicy(){return {callBreakpointId:nativeParentWeatherCounterSites[0].id,returnBreakpointId:nativeParentWeatherCounterSites[1].id,maxPairs:1,maxSnapshots:2};}
export function nativeParentWeatherCounterImportRange(){return {id:'parent-weather-counter-import',rva:'0x16e0fc',length:4};}
export function nativeParentWeatherCounterLayout(U){
  assert.ok(Number.isSafeInteger(U)&&U>=4096&&U<=0xfffffff7&&U%4===0,'Counter DWORD-aligned original parent ESP');
  const timerEntryAddress=U-364,timerEbp=U-368,alignedAddress=Math.floor(timerEbp/8)*8,frame=alignedAddress-32;
  return {parentU:U,timerEntryAddress,timerEbp,alignedAddress,beforeEsp:frame-4,afterEsp:frame,outputAddress:frame+24};
}
export function nativeParentWeatherCounterRanges(U,base){
  const l=nativeParentWeatherCounterLayout(U);
  return [
    ['argument',l.beforeEsp,4],['output',l.outputAddress,8],['frame',l.afterEsp,32],
    ['timer-return',l.timerEntryAddress,4],['screen-return',U-44,4],['parent-return',U-20,4],
    ['iat',base+0x16e0fc,4],['initialized',base+0x2e6c8c,4],['origin-frequency',base+0x3135a4,16],['clock',base+0x50a548,4],
  ].map(([name,address,length])=>({id:`native-parent-counter-${name}`,address,length}));
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uint=(value,label)=>{const n=Number(value);assert.ok((typeof value==='number'||typeof value==='string'&&/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))&&Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff,`Counter actual uint32 ${label}`);return n;};
const rows=snapshot=>snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
function bytesAt(snapshot,address,length){
  const bytes=Buffer.alloc(length),covered=Buffer.alloc(length);
  for(const row of rows(snapshot)){const lo=Math.max(address,Number(row.address)),hi=Math.min(address+length,Number(row.address)+row.bytes.length);for(let p=lo;p<hi;p++){const i=p-address,v=row.bytes[p-Number(row.address)];if(covered[i])assert.equal(bytes[i],v,'Counter overlapping raw bytes');bytes[i]=v;covered[i]=1;}}
  assert.ok(covered.every(x=>x),'Counter independently observed span');return bytes;
}
export async function verifyNativeParentWeatherCounterEvidence(){
  const auditPath='analysis/native-parent-weather-counter-plan-20261024.json',auditBytes=await readFile(auditPath),audit=JSON.parse(auditBytes);
  assert.equal(hash(auditBytes),'97c21eeb07747592866080d0d850e123d3f2efaf247de57afd045233c7c72532','Pinned original PE counter import audit');
  assert.equal(audit.targetSha256,REDUX_SHA256);assert.deepEqual(audit.staticImports,[{iatPreferredAddress:0x56e0fc,dll:'KERNEL32.dll',name:'QueryPerformanceCounter'},{iatPreferredAddress:0x56e114,dll:'KERNEL32.dll',name:'QueryPerformanceFrequency'}]);
  const proof=await readInstructionEvidence(['3630-weather-489cd0-procedure_assembly.json','3611-object-effect-498030-procedure_assembly.json'],{directory:'analysis/native-simulation/results'});
  assert.ok(proof.evidence.every(row=>row.subject?.digest?.sha256===REDUX_SHA256),'Counter retained target identity');
  const listing=new Map(proof.instructions.map(row=>[row.address,row]));
  for(const [address,op,args]of [[0x498453,'CALL',['0x00489cd0']],[0x489cd0,'PUSH',['EBP']],[0x489cd1,'MOV',['EBP','ESP']],[0x489cd3,'AND',['ESP','0xfffffff8']],[0x489ce3,'MOV',['ESI','dword ptr [0x0056e0fc]']],[0x489d0c,'LEA',['EAX','[ESP + 0x18]']],[0x489d10,'PUSH',['EAX']],[0x489d11,'CALL',['ESI']],[0x489d13,'MOV',['EAX','dword ptr [ESP + 0x18]']]]){
    const row=listing.get(address);assert.ok(row?.op===op&&JSON.stringify(row.args)===JSON.stringify(args),`Counter retained instruction0x${address.toString(16)}`);
  }
  return {targetSha256:REDUX_SHA256,evidenceIds:proof.evidence.map(row=>row.evidence_id),staticImportIdentity:{auditPath,sha256:hash(auditBytes),...audit.staticImports[0],runtimeResolvedIdentityProved:false},scope:'Initialized489cd0 exact CALL/register/stack producer; original QPC outcome is separately observed.'};
}

const authenticatedCounterProofs=new WeakMap(),authenticatedCounterServices=new WeakSet();
export function assertNativeParentWeatherCounterService(service){assert.ok(authenticatedCounterServices.has(service),'Parent requires its authenticated typed QPC service');}

export function verifyNativeParentWeatherCounterRecords({capture,configuration,records,before,cameras,world,owner,base,U,clock,activationEvent,rttiOutcomes}){
  const enabled=configuration.parentRttiObservation?.weatherCounterObservation!==undefined;
  const shots=capture.snapshots.filter(row=>nativeParentWeatherCounterSites.some(site=>site.id===row.breakpointId));
  const markers=records.filter(row=>row.type?.startsWith('parent-weather-counter-'));
  if(!enabled){assert.equal(shots.length,0);assert.equal(markers.length,0);return undefined;}
  assert.ok(capture.header.helperCapabilities?.includes(nativeParentWeatherCounterCapability),'Counter helper capability');
  const finalSnapshots=configuration.parentRttiObservation?.finalTick?1:0,snapshotLimit=21+finalSnapshots,requiredSnapshots=13+rttiOutcomes.length*2+2+finalSnapshots;
  assert.equal(shots.length,2,'Exactly one counter pair');assert.ok(requiredSnapshots<=snapshotLimit,'Counter joint snapshot budget');
  assert.deepEqual(rttiOutcomes.slice(-2).map(row=>[row.family,row.weatherQueryIndex]),[['weather-screen',1],['weather-screen',2]],'Counter follows both weather calls');
  const l=nativeParentWeatherCounterLayout(U),initialFlag=bytesAt(before,base+0x2e6c8c,4),initialOrigin=bytesAt(before,base+0x3135a4,16),initialIat=bytesAt(before,base+0x16e0fc,4);
  assert.equal(initialFlag.readUInt32LE(),1,'Counter initialized original input');assert.ok(initialOrigin.readBigInt64LE()>0n,'Positive original QPF frequency');assert.ok(initialIat.readUInt32LE()>0,'Actual original QPC IAT target');
  const imported=rows(before).filter(row=>row.id===nativeParentWeatherCounterImportRange().id);assert.equal(imported.length,1);assert.equal(Number(imported[0].address),base+0x16e0fc);assert.equal(imported[0].bytes.length,4);
  const admitted=markers.filter(row=>row.type==='parent-weather-counter-admitted');assert.equal(admitted.length,2);
  const call=shots[0],returned=shots[1];assert.ok(rttiOutcomes.at(-1).returnOrdinal<call.ordinal&&call.ordinal<returned.ordinal&&returned.ordinal<world.ordinal&&cameras.ordinal<call.ordinal,'Counter exact stage9 order');
  let priorDebug=0;const endpoint=[];
  for(const [index,s]of shots.entries()){
    const entry=index===0,p=s.parentWeatherCounterObservation,at=records.findIndex(row=>row.type==='snapshot'&&row.ordinal===s.ordinal),m=admitted[index],debug=records.findIndex(row=>row.type==='debug-event'&&row.ordinal===s.observedDebugEventOrdinal);
    assert.ok(p&&m&&at>debug&&debug>=0);assert.deepEqual(p,m,'Counter exact emitted annotation');assert.ok(records.indexOf(m)>debug&&records.indexOf(m)<at&&!records.slice(debug+1,at).some(row=>row.type==='debug-event'),'Counter same stopped event');
    assert.equal(s.breakpointId,nativeParentWeatherCounterSites[index].id);assert.equal(s.tid,owner.tid);assert.equal(s.context.readUInt32LE(184),base+nativeParentWeatherCounterSites[index].preferredAddress-0x400000);
    assert.equal(s.context.readUInt32LE(196),entry?l.beforeEsp:l.afterEsp);assert.equal(s.context.readUInt32LE(180),l.timerEbp);
    assert.equal(s.context.readUInt32LE(28)&0xffff,before.context.readUInt32LE(28)&0xffff,'Counter preserves original x87 control');
    assert.equal(s.context.readUInt32LE(228)&0xffc0,before.context.readUInt32LE(228)&0xffc0,'Counter preserves original SSE control; status bits remain observed');
    assert.ok(s.observedDebugEventOrdinal>priorDebug);priorDebug=s.observedDebugEventOrdinal;
    assert.deepEqual([m.pid,m.tid,m.ownerMainTid,m.breakpointId,m.observedDebugEventOrdinal,m.parentEntryDebugEventOrdinal,uint(m.parentEntryEsp,'parentEsp'),m.parentClock,m.parentIteration,uint(m.parentCaller,'parentCaller'),m.parentTotalIterations,m.activationDebugEventOrdinal],
      [owner.pid,owner.tid,owner.tid,s.breakpointId,s.observedDebugEventOrdinal,before.observedDebugEventOrdinal,U,clock,before.context.readUInt32LE(168),bytesAt(before,U,4).readUInt32LE(),bytesAt(before,U+4,4).readUInt32LE(),activationEvent],'Counter original parent lineage');
    for(const key of Object.keys(l))assert.equal(uint(m[key],key),l[key]);
    assert.deepEqual([m.role,m.snapshotOrdinal,m.pairIndex,m.observationIndex,m.callDebugEventOrdinal,m.callSnapshotOrdinal,m.open,m.completesPair,m.initialFlagHex,m.initialOriginFrequencyHex,m.initialIatHex,m.initialInputDebugEventOrdinal,m.totalRequiredSnapshots,m.snapshotLimit],
      [entry?'call':'return',s.ordinal,1,index+1,call.observedDebugEventOrdinal,call.ordinal,true,!entry,initialFlag.toString('hex'),initialOrigin.toString('hex'),initialIat.toString('hex'),before.observedDebugEventOrdinal,requiredSnapshots,snapshotLimit],'Counter original inputs and finite pair lifecycle');
    assert.deepEqual([m.beforeSnapshotRangeResolution,m.beforeOriginalInstruction],[true,true],'Counter guard precedes original instruction and range publication');
    assert.ok(Number.isSafeInteger(m.rawHit)&&m.rawHit>=s.hit);assert.equal(s.hit,1);
    const expected=nativeParentWeatherCounterRanges(U,base),parts={};
    assert.deepEqual(rows(s).filter(row=>row.id!=='thread-seh-head').map(row=>row.id).sort(),expected.map(row=>row.id).sort(),'Only exact counter observation rows');
    for(const d of expected){const r=rows(s).find(row=>row.id===d.id);assert.ok(r&&Number(r.address)===d.address&&r.length===d.length&&r.bytes.length===d.length&&hash(r.bytes)===r.sha256,'Counter exact raw range/hash');assert.equal(r.source,'parent-weather-counter-observation');const name=d.id.slice('native-parent-counter-'.length).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());assert.equal(uint(m[`${name}Address`],`${name} address`),d.address);assert.equal(m[`${name}BytesHex`],r.bytes.toString('hex'));parts[name]=r.bytes;}
    assert.equal(parts.argument.readUInt32LE(),l.outputAddress);assert.equal(parts.frame.readUInt32LE(8),l.timerEbp);
    assert.ok(parts.frame.subarray(24,32).equals(parts.output),'Counter overlapping output/frame observation agrees');
    assert.equal(parts.frame.readUInt32LE(12),s.context.readUInt32LE(164),'Counter original PUSH EBX save');
    assert.equal(parts.timerReturn.readUInt32LE(),base+0x98458);assert.equal(parts.screenReturn.readUInt32LE(),base+0x96822);assert.equal(parts.parentReturn.readUInt32LE(),base+0x51116);
    assert.ok(parts.initialized.equals(initialFlag)&&parts.originFrequency.equals(initialOrigin)&&parts.iat.equals(initialIat),'Counter source inputs remain unchanged');assert.equal(parts.clock.readUInt32LE(),clock);
    assert.equal(s.context.readUInt32LE(160),parts.iat.readUInt32LE(),'Counter ESI is actual imported target');
    endpoint.push(parts);
  }
  for(const key of ['argument','frame','timerReturn','screenReturn','parentReturn','iat','initialized','originFrequency','clock']){
    if(key==='frame')continue;assert.ok(endpoint[0][key].equals(endpoint[1][key]),`Counter stable ${key}`);
  }
  assert.ok(endpoint[0].frame.subarray(0,24).equals(endpoint[1].frame.subarray(0,24)),'QPC preserves caller frame outside eight-byte output');
  for(const s of capture.snapshots)if(!shots.includes(s))assert.equal(s.parentWeatherCounterObservation,undefined,'Counter annotation only at its two sites');
  const weatherEnd=capture.snapshots.find(s=>s.ordinal===rttiOutcomes.at(-1).returnOrdinal).observedDebugEventOrdinal;
  const siteHits=new Map();for(const m of markers){assert.ok(['parent-weather-counter-admitted','parent-weather-counter-skipped'].includes(m.type),'Unknown counter lifecycle marker');assert.ok(nativeParentWeatherCounterSites.some(site=>site.id===m.breakpointId));const prior=siteHits.get(m.breakpointId)??0;assert.equal(m.rawHit,prior+1,'Every counter site hit accounted');siteHits.set(m.breakpointId,m.rawHit);if(m.type==='parent-weather-counter-skipped'){const d=records.find(row=>row.type==='debug-event'&&row.ordinal===m.observedDebugEventOrdinal);assert.ok(d&&d.pid===owner.pid&&d.tid===m.tid);assert.deepEqual([m.pid,m.ownerMainTid,m.matchingHitAdvanced,m.snapshotCountAdvanced,m.originalInstructionSkipped],[owner.pid,owner.tid,false,false,false]);if(m.tid===owner.tid&&m.observedDebugEventOrdinal>weatherEnd&&m.observedDebugEventOrdinal<world.observedDebugEventOrdinal)assert.fail('Unproved selected same-thread counter hit cannot be skipped');}}
  const proof=Object.freeze({verified:true,authority:'observed-external-QPC-only',callOrdinal:call.ordinal,returnOrdinal:returned.ordinal,layout:Object.freeze(l),iatTarget:initialIat.readUInt32LE(),preimageHex:endpoint[0].output.toString('hex'),outputHex:endpoint[1].output.toString('hex'),returnedEax:returned.context.readUInt32LE(176),frequency:initialOrigin.readBigInt64LE().toString(),origin:initialOrigin.readBigInt64LE(8).toString(),logicalClock:clock,runtimeResolvedExportIdentityProved:false});
  authenticatedCounterProofs.set(proof,{initialFlag,initialOrigin,initialIat,base,U,expectedEbx:call.context.readUInt32LE(164),preimageHex:proof.preimageHex,outputHex:proof.outputHex,returnedEax:proof.returnedEax,logicalClock:clock});return proof;
}

export function nativeParentWeatherCounterInputRegions(snapshot,base){
  const part=rows(snapshot).find(row=>row.id===nativeParentWeatherCounterImportRange().id);assert.ok(part&&Number(part.address)===base+0x16e0fc&&part.bytes.length===4,'Original counter IAT input');
  return [{id:'parent-weather-counter-original-import',address:base+0x16e0fc,preferredAddress:0x56e0fc,length:4,comparison:'read-only',evidence:'Original parent-entry IAT operand of489ce3; observed target only, no function or timer result.'}];
}

export function createNativeParentWeatherCounterBinding({proof,memory}){
  const evidence=authenticatedCounterProofs.get(proof);assert.ok(evidence&&Buffer.isBuffer(memory),'Authenticated original counter observation required');
  const {base,U,initialFlag,initialOrigin,initialIat}=evidence,l=nativeParentWeatherCounterLayout(U),events=[];let consumed=false;
  const platformCall=(name,args,runtime)=>{
    assert.ok(!consumed,'Counter outcome cannot be reused');assert.equal(name,'QueryPerformanceCounter','Only actual QPC service');assert.equal(runtime?.memory,memory,'Shared source counter memory');assert.deepEqual(args,[l.outputAddress],'Source-produced counter output argument');assert.equal(runtime.scratchBase,l.timerEntryAddress,'Source timer entry ESP');
    const meta=runtime.nativeWeatherCounterCall;assert.ok(meta,'Genuine source weather counter call metadata');
    const ebx=uint(meta.ebx,'source timer EBX');
    assert.deepEqual([meta.returnAddress,meta.screenEntryEsp,meta.entryEsp,meta.frame,meta.outputAddress,meta.preCallEsp,meta.serviceReturnAddress,meta.iatTarget],[0x498458,U-44,l.timerEntryAddress,l.afterEsp,l.outputAddress,l.beforeEsp,base+0x89d13,initialIat.readUInt32LE()],'Source counter caller/frame/import producer');
    assert.equal(memory.readUInt32LE(l.timerEntryAddress),base+0x98458);assert.equal(memory.readUInt32LE(U-44),base+0x96822);assert.equal(memory.readUInt32LE(U-20),base+0x51116);
    assert.equal(memory.readUInt32LE(l.afterEsp+8),l.timerEbp);assert.equal(memory.readUInt32LE(l.afterEsp+12),ebx);assert.equal(memory.readUInt32LE(l.beforeEsp),l.outputAddress);assert.equal(memory.readUInt32LE(l.beforeEsp-4),base+0x89d13);
    assert.equal(ebx,evidence.expectedEbx,'Genuine source timer EBX matches call register');
    assert.ok(memory.subarray(base+0x2e6c8c,base+0x2e6c90).equals(initialFlag));assert.ok(memory.subarray(base+0x3135a4,base+0x3135b4).equals(initialOrigin));assert.equal(memory.readUInt32LE(base+0x16e0fc),initialIat.readUInt32LE());assert.equal(memory.readUInt32LE(base+0x50a548),evidence.logicalClock);
    const before=memory.subarray(l.outputAddress,l.outputAddress+8);assert.equal(before.toString('hex'),evidence.preimageHex,'Complete source-produced QPC preimage');
    const output=Buffer.from(evidence.outputHex,'hex');for(let i=0;i<8;i++)memory[l.outputAddress+i]=output[i];consumed=true;
    events.push({service:name,outputAddress:l.outputAddress,preimageHex:evidence.preimageHex,outputHex:evidence.outputHex,returnedEax:evidence.returnedEax,authority:'observed-external-QPC-only'});return evidence.returnedEax;
  };
  authenticatedCounterServices.add(platformCall);return {platformCall,events,assertComplete(){assert.ok(consumed,'Actual counter observation was not consumed');}};
}
