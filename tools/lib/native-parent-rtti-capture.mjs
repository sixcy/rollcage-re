import {isDeepStrictEqual} from 'node:util';
import {verifyNativeControlCaptureConfiguration} from './native-control-capture.mjs';
import {nativeParentRttiSites,nativeParentRttiObservationRanges} from './native-parent-rtti.mjs';
import {createReduxCaptureConfig} from './redux-capture-config.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateCapturedGuardedPointerRanges} from './captured-guarded-pointer-ranges.mjs';
import {createCapturedMemory} from './captured-memory.mjs';
import {bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';
import {nativeControlTyreSound2CaptureRange} from './native-control-tyre-sound-inputs.mjs';
import {nativeControlSurfaceSound7CaptureRange} from './native-control-surface-sound-inputs.mjs';
import {nativeParentWeatherCounterSites,nativeParentWeatherCounterCapability,nativeParentWeatherCounterPolicy,nativeParentWeatherCounterImportRange,verifyNativeParentWeatherCounterRecords} from './native-parent-weather-counter.mjs';
import {nativeParentSoundOwnerGraphPolicy,nativeParentSoundOwnerGraphCapability,verifyNativeParentSoundOwnerGraphRecords,nativeParentSoundOwnerGraphStages} from './native-parent-sound-owner-graph.mjs';
import {nativeParentSoundChannelGraphCapability} from './native-parent-sound-channel-graph.mjs';
import {nativeParentFinalInputPolicy,nativeParentFinalInputsCapability} from './native-parent-final-inputs.mjs';
import {verifyNativeParentFinalCaptureRecords} from './native-parent-final-capture.mjs';

export const nativeParentRttiMapBreakpointIds=Object.freeze(['native-control-before','native-control-after-cameras','native-control-after-world-effects']);
export const nativeParentRttiRequiredCapability='scoped-parent-rtti-and-singleton-map-preflight-v1';
export const nativeParentRttiViewportMapGraphCapability='scoped-parent-rtti-viewport-map-graph-v2';
export const nativeParentRttiWeatherCapability='scoped-parent-camera-weather-rtti-v3';
export function nativeParentRttiWeatherObservationRanges(){return [
  {id:'native-parent-rtti-context',baseRegister:'esp',length:68},
  {id:'native-parent-rtti-clock',rva:'0x50a548',length:4},
  {id:'native-parent-rtti-weather-query-return',baseRegister:'esp',offset:84,length:4},
  {id:'native-parent-rtti-weather-screen-return',baseRegister:'esp',offset:416,length:4},
  {id:'native-parent-rtti-weather-parent-return',baseRegister:'esp',offset:440,length:4},
  {id:'native-parent-rtti-weather-name',baseRegister:'esp',offset:140,length:9},
];}
export function nativeParentRttiPolicy({viewportMapGraph=false,weatherScreenQueries=false,weatherCounterObservation=false,soundBankOwners=false,soundBankChannels=false,finalTick=false}={}){assert.equal(typeof viewportMapGraph,'boolean','RTTI graph option must be boolean');assert.equal(typeof weatherScreenQueries,'boolean','RTTI weather option must be boolean');assert.equal(typeof weatherCounterObservation,'boolean','RTTI counter option must be boolean');assert.equal(typeof soundBankOwners,'boolean','Sound bank owner option must be boolean');assert.equal(typeof soundBankChannels,'boolean','Sound bank channel option must be boolean');assert.equal(typeof finalTick,'boolean','Final tick option must be boolean');if(finalTick&&![viewportMapGraph,weatherScreenQueries,weatherCounterObservation,soundBankOwners,soundBankChannels].every(Boolean))throw Error('Final tick requires full viewport, weather, counter and sound graph observations.');if(soundBankChannels&&!soundBankOwners)throw Error('Sound channel graph requires owner observations.');if(weatherCounterObservation&&!weatherScreenQueries)throw Error('Weather counter requires mixed viewport queries.');return {
  parentBreakpointId:'native-control-before',beginBreakpointId:'native-control-after-auxiliary',endBreakpointId:weatherScreenQueries?'native-control-after-world-effects':'native-control-after-cameras',
  callBreakpointId:'native-parent-rtti-call',returnBreakpointId:'native-parent-rtti-return',maxPairs:4,maxSnapshots:8,
  singletonMapPreflight:{rootRva:'0x2efb38',dereferenceOffsets:['0','0x7c'],fixedHeadRangeId:'late-singleton-candidate-viewport-map-head',
    regionRangeId:'late-singleton-candidate-viewport-map-region',maxRegionBytes:16*1024*1024,breakpointIds:[...nativeParentRttiMapBreakpointIds,...(finalTick?['native-parent-return']:[])]},
  ...(viewportMapGraph?{viewportMapGraph:{maxNodes:8,maxKeyBytes:256,breakpointIds:[...nativeParentRttiMapBreakpointIds,...(finalTick?['native-parent-return']:[])]}}:{}),
  ...(weatherScreenQueries?{weatherScreenQueries:true}:{}),
  ...(weatherCounterObservation?{weatherCounterObservation:nativeParentWeatherCounterPolicy()}:{}),
  ...(soundBankOwners?{soundBankOwnerGraph:nativeParentSoundOwnerGraphPolicy({channelGraph:soundBankChannels,finalTick})}:{}),
  ...(finalTick?{finalTick:nativeParentFinalInputPolicy()}:{}),
};}
export function nativeParentRttiMapCaptureRanges(){return [
  {id:'late-singleton-candidate-viewport-map-head',rva:'0x2efb38',dereferenceOffsets:['0','0x7c'],dereferenceMinimumValues:[1,1],length:100},
  //This is a NONNULL observation domain, conditional on the purpose-specific
  //host preflight BEFORE resolving ANY ranges at the three named points.
  //It is not the unsupported guarded-pointer+readableRegion combination.
  {id:'late-singleton-candidate-viewport-map-region',rva:'0x2efb38',dereferenceOffsets:['0','0x7c'],readableRegion:true,maxRegionBytes:16*1024*1024},
];}
function one(configuration,id){const points=configuration.breakpoints.filter(row=>row.id===id);if(points.length!==1)throw Error(`Parent RTTI requires exactly one ${id}.`);return points[0];}
export function verifyNativeParentRttiCaptureConfiguration(configuration){
  const control=verifyNativeControlCaptureConfiguration(configuration);
  const original=createReduxCaptureConfig('policy-only','hidden-idle','unused-policy-output');
  const paths=['executablePath','workingDirectory','outputDirectory','redirectedDocumentsPath','redirectedShellFolderPath','temporaryDirectory'];
  const allowed=new Set([...Object.keys(original),'captureThreadEnvironment','parentRttiObservation']);
  if(Object.keys(configuration).some(key=>!allowed.has(key)))throw Error('Parent RTTI forbids undeclared service/write/worker/held options.');
  const variable=new Set([...paths,'maxDurationMs','maxEvents','maxSnapshots','breakpoints','ranges','phaseActions']);
  for(const[key,value]of Object.entries(original))if(!variable.has(key)&&!isDeepStrictEqual(configuration[key],value))throw Error(`Parent RTTI owned/security startup policy differs: ${key}.`);
  if(paths.some(key=>typeof configuration[key]!=='string'||!configuration[key])||configuration.maxEvents!==1000000||!isDeepStrictEqual(configuration.ranges,[]))throw Error('Parent RTTI path/event/global range policy differs.');
  const weatherCounterObservation=configuration.parentRttiObservation?.weatherCounterObservation!==undefined,finalTick=configuration.parentRttiObservation?.finalTick!==undefined;
  const pointIds=['launcher-policy','graphics-policy','before-device-creation','native-control-before','native-control-after','native-control-after-ai','native-control-after-physics','native-control-after-attachments','native-control-after-recovery','native-control-after-drive','native-control-after-auxiliary','native-control-after-cameras','native-control-after-world-effects',...nativeParentRttiSites.map(site=>site.id),...(weatherCounterObservation?nativeParentWeatherCounterSites.map(site=>site.id):[]),...(finalTick?['native-parent-return']:[])];
  if(!isDeepStrictEqual(configuration.breakpoints.map(row=>row.id),pointIds))throw Error('Parent RTTI profile has an undeclared, reordered or duplicate observation site.');
  const startup=original.breakpoints.filter(row=>pointIds.slice(0,3).includes(row.id));
  if(!isDeepStrictEqual(configuration.breakpoints.slice(0,3),startup)||!isDeepStrictEqual(configuration.phaseActions,original.phaseActions))throw Error('Parent RTTI requires the exact three original startup breakpoint/action policies, without additional game writes.');
  if(control.frames!==1||control.lateStages!==3||!control.afterAiCheckpoint||!control.physicsExitCheckpoint||!control.postphysics)throw Error('Parent RTTI requires one complete observed parent through world-effects, including AI and physics checkpoints.');
  const viewportMapGraph=configuration.parentRttiObservation?.viewportMapGraph!==undefined,weatherScreenQueries=configuration.parentRttiObservation?.weatherScreenQueries!==undefined,soundBankOwners=configuration.parentRttiObservation?.soundBankOwnerGraph!==undefined,soundBankChannels=configuration.parentRttiObservation?.soundBankOwnerGraph?.channelGraph!==undefined;
  if(!isDeepStrictEqual(configuration.parentRttiObservation,nativeParentRttiPolicy({viewportMapGraph,weatherScreenQueries,weatherCounterObservation,soundBankOwners,soundBankChannels,finalTick})))throw Error('Parent RTTI purpose policy differs from its selected-window/preflight contract.');
  if(configuration.maxSnapshots!==(finalTick?22:21)||configuration.maxDurationMs!==90000||configuration.captureThreadEnvironment!==true)throw Error('Parent RTTI snapshot/duration/TLS bounds differ.');
  if(finalTick){const expected={id:'native-parent-return',rva:'0x50e38',stopAfterHits:1,ranges:one(configuration,'native-control-after-world-effects').ranges};if(one(configuration,'native-control-after-world-effects').stopAfterHits!==0||!isDeepStrictEqual(one(configuration,'native-parent-return'),expected))throw Error('Final parent return site, full comparison ranges or stopping policy differs.');}
  for(const site of nativeParentRttiSites){
    const point=one(configuration,site.id),expected={id:site.id,rva:`0x${(site.preferredAddress-0x400000).toString(16)}`,stopAfterHits:0,ranges:weatherScreenQueries?[]:nativeParentRttiObservationRanges()};
    if(!isDeepStrictEqual(point,expected))throw Error(`Parent RTTI scoped observer differs at ${site.id}.`);
  }
  if(weatherCounterObservation)for(const site of nativeParentWeatherCounterSites){const expected={id:site.id,rva:`0x${(site.preferredAddress-0x400000).toString(16)}`,stopAfterHits:0,ranges:[]};if(!isDeepStrictEqual(one(configuration,site.id),expected))throw Error('Weather counter scoped instruction/ranges differ.');}
  const mapRanges=nativeParentRttiMapCaptureRanges();
  const tyreRange=nativeControlTyreSound2CaptureRange();
  const tyreSound2=one(configuration,'native-control-before').ranges.some(row=>row.id===tyreRange.id);
  if(tyreSound2&&!one(configuration,'native-control-before').ranges.some(row=>row.id==='control-sound-bank-storage'))throw Error('Tyre sound2 requires the original sound-bank observation.');
  const surfaceRange=nativeControlSurfaceSound7CaptureRange(),surfaceSound7=one(configuration,'native-control-before').ranges.some(row=>row.id===surfaceRange.id);
  if(surfaceSound7&&!one(configuration,'native-control-before').ranges.some(row=>row.id==='control-sound-bank-storage'))throw Error('Surface sound7 requires the original sound-bank observation.');
  for(const point of configuration.breakpoints){
    if(Object.keys(point).some(key=>!['id','rva','stopAfterHits','ranges','captureWhen','skipMatchingHits'].includes(key)))throw Error('Parent RTTI breakpoint contains an undeclared service/write policy.');
    if(point.ranges?.some(row=>row.id?.startsWith('parent-sound-bank-owner-')||row.id?.startsWith('parent-sound-channel-')||row.id?.startsWith('parent-final-')))throw Error('Graph rows must be dynamically derived from original objects.');
    const observed=point.ranges?.filter(row=>mapRanges.some(expected=>row.id===expected.id))??[];
    const wanted=configuration.parentRttiObservation.singletonMapPreflight.breakpointIds.includes(point.id)?mapRanges:[];
    if(!isDeepStrictEqual(observed,wanted))throw Error(`Parent RTTI singleton map preflight/ranges differ at ${point.id}.`);
    const tyreObserved=point.ranges?.filter(row=>row.id===tyreRange.id)??[];
    if(!isDeepStrictEqual(tyreObserved,tyreSound2&&(point.id.startsWith('native-control-')||finalTick&&point.id==='native-parent-return')?[tyreRange]:[]))throw Error(`Parent RTTI tyre sound2 input differs at ${point.id}.`);
    const surfaceObserved=point.ranges?.filter(row=>row.id===surfaceRange.id)??[];
    if(!isDeepStrictEqual(surfaceObserved,surfaceSound7&&(point.id.startsWith('native-control-')||finalTick&&point.id==='native-parent-return')?[surfaceRange]:[]))throw Error(`Parent RTTI surface sound7 input differs at ${point.id}.`);
    if(surfaceSound7&&point.id.startsWith('native-control-')&&!point.ranges.some(row=>row.id==='control-sound-bank-storage'))throw Error(`Surface sound7 requires its original bank storage at ${point.id}.`);
    if(soundBankOwners&&configuration.parentRttiObservation.soundBankOwnerGraph.breakpointIds.includes(point.id)){
      for(const expected of [{id:'sound-owner-vector-roots',rva:'0x2f2414',length:12},{id:'control-sound-bank-storage',rva:'0x2f2414',vectorStorage:true,maxVectorBytes:65536}]){
        const actual=point.ranges.filter(row=>row.id===expected.id);if(!isDeepStrictEqual(actual,[expected]))throw Error(`Sound bank graph requires exact original header/storage at ${point.id}.`);
      }
    }
    const counterImport=nativeParentWeatherCounterImportRange(),observedCounter=point.ranges?.filter(row=>row.id===counterImport.id)??[];
    if(!isDeepStrictEqual(observedCounter,weatherCounterObservation&&(point.id.startsWith('native-control-')||finalTick&&point.id==='native-parent-return')?[counterImport]:[]))throw Error(`Weather counter original import input differs at ${point.id}.`);
    if(point.ranges&&new Set(point.ranges.map(row=>row.id)).size!==point.ranges.length)throw Error('Parent RTTI range IDs must be unique within each snapshot.');
  }
  if(configuration.phaseActions?.some(action=>[...nativeParentRttiSites,...nativeParentWeatherCounterSites].some(site=>site.id===action.breakpointId)))throw Error('Parent RTTI cannot write state or alter registers at its external boundaries.');
  return {...control,parentRttiObservation:true,viewportMapGraph,weatherScreenQueries,weatherCounterObservation,soundBankOwners,soundBankChannels,finalTick,tyreSound2,surfaceSound7,requiredHelperCapability:finalTick?nativeParentFinalInputsCapability:soundBankChannels?nativeParentSoundChannelGraphCapability:soundBankOwners?nativeParentSoundOwnerGraphCapability:weatherCounterObservation?nativeParentWeatherCounterCapability:weatherScreenQueries?nativeParentRttiWeatherCapability:viewportMapGraph?nativeParentRttiViewportMapGraphCapability:nativeParentRttiRequiredCapability,maxExternalPairs:4,maxExternalSnapshots:8};
}

const rttiStages=Object.freeze(['native-control-before','native-control-after-ai','native-control-after','native-control-after-physics','native-control-after-attachments','native-control-after-recovery','native-control-after-drive','native-control-after-auxiliary','native-control-after-cameras','native-control-after-world-effects']);
const rttiHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rttiUint=(value,label)=>{const n=Number(value);assert.ok((typeof value==='number'||typeof value==='string'&&/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))&&Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff,`RTTI actual x86 ${label}`);return n;};
const rttiEq=(a,b,label)=>assert.deepEqual(a,b,`RTTI ${label}`);
const contextRegisters={edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,cs:188,eflags:192,esp:196,ss:200};
function rttiRows(snapshot){assert.ok(snapshot.ranges instanceof Map,'RTTI loaded snapshot ranges');return [...snapshot.ranges.values()];}
function rttiBytes(snapshot,address,length){
  assert.ok(Number.isSafeInteger(address)&&address>0&&Number.isSafeInteger(length)&&length>0&&address+length<=0x100000000,'RTTI bounded native read');
  const result=Buffer.alloc(length),covered=Buffer.alloc(length);
  for(const row of rttiRows(snapshot)){
    const start=Number(row.address),lo=Math.max(start,address),hi=Math.min(start+row.bytes.length,address+length);
    for(let p=lo;p<hi;p++){const i=p-address,value=row.bytes[p-start];if(covered[i])assert.equal(result[i],value,'RTTI overlapping observations differ');else{result[i]=value;covered[i]=1;}}
  }
  assert.ok(covered.every(value=>value===1),`RTTI unobserved actual span0x${address.toString(16)}+${length}`);return result;
}
function rttiRange(snapshot,id,address,length){const row=snapshot.ranges.get(id);assert.ok(row,`RTTI missing ${id}`);assert.equal(Number(row.address),address,`RTTI ${id} actual address`);assert.equal(row.length,length,`RTTI ${id} exact length`);return row;}

//Authenticate the host transport BEFORE the separate typed CRT adapter may
//consume an EAX. This verifies observations only; it grants no source memory,
//does not assume any cast result, and never supplies a game-child answer.
export function verifyNativeParentRttiCaptureRecords({capture,configuration,records,pair}={}){
  const policy=verifyNativeParentRttiCaptureConfiguration(configuration);
  assert.ok(capture&&Array.isArray(records)&&records.length&&Array.isArray(capture.snapshots),'RTTI complete loaded capture/trace required');
  const {header,complete,snapshots}=capture;
  rttiEq(records[0],header,'raw capture header');
  const mapChecks=policy.finalTick?4:3,snapshotLimit=policy.finalTick?22:21;
  rttiEq([header.schemaVersion,header.executableSha256,header.maxDurationMs,header.maxEvents,header.maxSnapshots],[1,configuration.expectedSha256,90000,1000000,snapshotLimit],'target and finite header bounds');
  assert.ok(header.helperCapabilities?.includes(nativeParentRttiRequiredCapability),'RTTI host capability missing');
  if(policy.viewportMapGraph)assert.ok(header.helperCapabilities?.includes(nativeParentRttiViewportMapGraphCapability),'RTTI bounded graph host capability missing');
  if(policy.weatherScreenQueries)assert.ok(header.helperCapabilities?.includes(nativeParentRttiWeatherCapability),'RTTI mixed camera/weather host capability missing');
  assert.ok(!records.some(row=>['capture-error','fatal-exception','parent-rtti-map-preflight-failed'].includes(row.type)),'RTTI failed native capture');
  const owners=records.filter(row=>row.type==='owned-process');assert.equal(owners.length,1,'RTTI one owned process');const owner=owners[0];assert.ok(rttiUint(owner.pid,'PID')>0&&rttiUint(owner.tid,'mainTID')>0);
  for(const [type,count]of [['parent-rtti-map-preflight',mapChecks],['parent-rtti-activation',1],['parent-rtti-closed',1]])assert.equal(records.filter(row=>row.type===type).length,count,`RTTI exact ${type} marker count`);
  const markerTypes=new Set(['parent-rtti-map-preflight','parent-rtti-activation','parent-rtti-closed','parent-rtti-breakpoint-activated','parent-rtti-admitted','parent-rtti-skipped','parent-rtti-checkpoint-skipped']);
  if(policy.viewportMapGraph){markerTypes.add('parent-rtti-map-graph');assert.equal(records.filter(row=>row.type==='parent-rtti-map-graph').length,mapChecks,'RTTI exact bounded graph observation count');}
  assert.ok(!records.some(row=>row.type?.startsWith('parent-rtti-')&&!markerTypes.has(row.type)),'RTTI unknown or failed lifecycle marker');
  const completions=records.filter(row=>row.type==='complete');assert.equal(completions.length,1);rttiEq(completions[0],complete,'raw completion');
  const rawSnapshots=records.filter(row=>row.type==='snapshot');assert.equal(rawSnapshots.length,snapshots.length);assert.ok(snapshots.length>=13&&snapshots.length<=snapshotLimit);
  rttiEq([complete.reason,complete.snapshots],['snapshot-bound',snapshots.length],'terminal boundary');
  const startup=configuration.breakpoints.slice(0,3).map(row=>row.id),parent=snapshots.filter(row=>rttiStages.includes(row.breakpointId)),external=snapshots.filter(row=>nativeParentRttiSites.some(site=>site.id===row.breakpointId)),counter=snapshots.filter(row=>nativeParentWeatherCounterSites.some(site=>site.id===row.breakpointId));
  rttiEq(snapshots.slice(0,3).map(row=>row.breakpointId),startup,'three original startup observations');
  rttiEq(parent.map(row=>row.breakpointId),rttiStages,'all ten selected original parent checkpoints');
  const returned=snapshots.filter(s=>s.breakpointId==='native-parent-return');assert.equal(returned.length,policy.finalTick?1:0,'Configured actual parent return');
  assert.equal(snapshots.length,3+parent.length+external.length+counter.length+returned.length,'RTTI no foreign/extra observations');assert.ok(external.length%2===0&&external.length<=8);
  const baseSet=new Set(rttiRows(parent[0]).filter(row=>row.moduleBaseAddress!==undefined&&row.moduleBaseAddress!==null).map(row=>rttiUint(row.moduleBaseAddress,'module base')));assert.equal(baseSet.size,1);const base=[...baseSet][0];assert.ok(base>0&&base+0x51ffff<=0xffffffff);
  const rawIndex=new Map(),debugs=new Map();records.forEach((row,index)=>{if(row.type==='snapshot')rawIndex.set(row.ordinal,index);if(row.type==='debug-event'){assert.ok(!debugs.has(row.ordinal),'RTTI duplicate debug ordinal');debugs.set(row.ordinal,{row,index});}});
  let priorEvent=0;
  for(const [index,snapshot]of snapshots.entries()){
    assert.equal(snapshot.ordinal,index+1);assert.equal(snapshot.tid,owner.tid);assert.ok(Number.isInteger(snapshot.observedDebugEventOrdinal)&&snapshot.observedDebugEventOrdinal>priorEvent);priorEvent=snapshot.observedDebugEventOrdinal;
    const raw=rawSnapshots[index],at=rawIndex.get(snapshot.ordinal),event=debugs.get(snapshot.observedDebugEventOrdinal);
    assert.ok(event&&event.index<at&&!records.slice(event.index+1,at).some(row=>row.type==='debug-event'),'RTTI same stopped debug event before snapshot');
    rttiEq([event.row.event,event.row.pid,event.row.tid],[1,owner.pid,owner.tid],'owned exception event');
    for(const key of ['breakpointId','hit','tid','ordinal','observedDebugEventOrdinal','contextFile','contextSha256','capturePhase','registers','parentRttiMapPreflight','parentRttiActivation','parentRttiObservation','parentRttiClosure','parentRttiViewportMapGraph','parentWeatherCounterObservation','parentSoundBankOwnerGraph','parentFinalInputs','parentFinalReturn','parentFinalReturnActivation'])rttiEq(raw[key],snapshot[key],`raw snapshot ${key}`);
    assert.ok(Buffer.isBuffer(snapshot.context)&&snapshot.context.length===716&&rttiHash(snapshot.context)===snapshot.contextSha256,'RTTI raw716B CONTEXT hash');
    for(const [name,offset]of Object.entries(contextRegisters))assert.equal(rttiUint(snapshot.registers[name],name),snapshot.context.readUInt32LE(offset),`RTTI raw CONTEXT ${name}`);
    for(const [name,offset,mask]of [['fpuControlWord',28,65535],['fpuStatusWord',32,65535],['mxcsr',228,0xffffffff]])assert.equal(rttiUint(snapshot.registers[name],name),(snapshot.context.readUInt32LE(offset)&mask)>>>0,`RTTI raw CONTEXT ${name}`);
    assert.equal(snapshot.capturePhase,'before-declared-writes-before-original-instruction');
    const point=configuration.breakpoints.find(row=>row.id===snapshot.breakpointId);assert.ok(point);assert.equal(snapshot.context.readUInt32LE(184),base+Number(point.rva));
    const rows=rttiRows(snapshot);assert.equal(raw.ranges.length,rows.length);for(const row of rows){const metadata=raw.ranges.find(r=>r.id===row.id);assert.ok(metadata,'RTTI raw range identity');for(const[key,value]of Object.entries(metadata))rttiEq(row[key],value,`range metadata ${row.id}.${key}`);assert.ok(Buffer.isBuffer(row.bytes)&&row.length===row.bytes.length&&rttiHash(row.bytes)===row.sha256,'RTTI range byte/hash identity');rttiUint(row.address,'range address');assert.ok(Number(row.address)+row.length<=0x100000000);}
    validateCapturedGuardedPointerRanges(rows);
    assert.ok(snapshot.threadEnvironment,'RTTI actual stopped-thread environment required');bindCapturedNativeThreadEnvironment(snapshot,{memory:createCapturedMemory(rows).memory});
  }
  assert.ok(Number.isSafeInteger(complete.events)&&complete.events>=priorEvent&&complete.events<=1000000);
  const before=parent[0],U=before.context.readUInt32LE(196),Q=U-276,clockRow=rttiRange(before,'clock',base+0x50a548,4),clock=clockRow.bytes.readUInt32LE(),iteration=before.context.readUInt32LE(168),caller=rttiBytes(before,U,8),callerAddress=caller.readUInt32LE(),total=caller.readUInt32LE(4),saved=['edi','esi','ebp','ebx'].map(name=>before.context.readUInt32LE(contextRegisters[name]));assert.ok(U>=4096&&U+8<=0x100000000);
  const auxiliary=parent[7],cameras=parent[8],world=parent[9],activationEvent=auxiliary.observedDebugEventOrdinal;
  for(const [index,snapshot]of parent.entries()){
    const physical=['native-control-after','native-control-after-physics'].includes(snapshot.breakpointId),esp=snapshot.context.readUInt32LE(196),point=configuration.breakpoints.find(row=>row.id===snapshot.breakpointId),stack=snapshot.ranges.get('frame-stack');
    assert.equal(esp,U-(index===0?0:physical?20:16));assert.ok(stack&&Number(stack.address)===esp-policy.options.stackBytesBefore&&stack.length===policy.options.stackBytesBefore+32);
    assert.equal(rttiRange(snapshot,'clock',base+0x50a548,4).bytes.readUInt32LE(),clock);
    const session=snapshot.ranges.get('session');assert.ok(session&&session.bytes.length>=0x590&&session.bytes[0x54d]===6&&session.bytes.readUInt32LE(0x57c)===4);
    rttiEq([snapshot.hit,snapshot.matchingHit],[1,policy.skipFrames+1],'selected parent match ordinal');assert.ok(Number.isInteger(snapshot.rawHit)&&snapshot.rawHit>=snapshot.matchingHit);
    rttiEq([snapshot.captureWhen?.actualBytesHex,snapshot.captureWhen?.equalsBytesHex,Number(snapshot.captureWhen?.address)],['04000000','04000000',Number(session.address)+0x57c],'actual selected phase predicate');
    if(index){const stackBytes=rttiBytes(snapshot,esp,physical?28:24),shift=physical?4:0;if(physical)assert.equal(stackBytes.readUInt32LE(),base+0x51017);rttiEq(Array.from({length:4},(_,j)=>stackBytes.readUInt32LE(shift+j*4)),saved,'saved parent registers');assert.equal(stackBytes.readUInt32LE(shift+16),callerAddress);assert.equal(stackBytes.readUInt32LE(shift+20),total);assert.equal(snapshot.context.readUInt32LE(180),iteration);}
    assert.equal(Number(point.rva)+base,snapshot.context.readUInt32LE(184));
  }
  if(pair){rttiEq([pair.before.ordinal,pair.before.contextSha256,pair.moduleBaseAddress,pair.logicalClock,pair.iteration>>>0,pair.totalIterations>>>0],[before.ordinal,before.contextSha256,base,clock,iteration,total],'separate paired original parent');for(const [key,snapshot]of [['auxiliary',auxiliary],['cameras',cameras],['world-effects',world]])rttiEq([pair.postphysics?.[key]?.ordinal,pair.postphysics?.[key]?.contextSha256],[snapshot.ordinal,snapshot.contextSha256],`paired ${key}`);}
  const common=(row,snapshot,expectedActivation)=>{
    rttiEq([row.pid,row.tid,row.ownerMainTid,row.breakpointId,row.observedDebugEventOrdinal,row.parentEntryDebugEventOrdinal,rttiUint(row.parentEntryEsp,'proofU'),row.parentClock,row.parentIteration,rttiUint(row.parentCaller,'proofcaller'),row.parentTotalIterations,row.activationDebugEventOrdinal],[owner.pid,owner.tid,owner.tid,snapshot.breakpointId,snapshot.observedDebugEventOrdinal,before.observedDebugEventOrdinal,U,clock,iteration,callerAddress,total,expectedActivation],'proof native parent lineage');
  };
  const annotation=(snapshot,key,type)=>{
    const row=snapshot[key],matches=records.filter(r=>r.type===type&&r.observedDebugEventOrdinal===snapshot.observedDebugEventOrdinal);assert.ok(row&&matches.length===1,'RTTI one independent annotated marker');rttiEq(matches[0],row,'exact emitted annotation');const at=records.indexOf(matches[0]),end=rawIndex.get(snapshot.ordinal),debug=debugs.get(snapshot.observedDebugEventOrdinal);assert.ok(at>debug.index&&at<end&&!records.slice(at+1,end).some(r=>r.type==='debug-event'),'RTTI marker before same-event range snapshot');return matches[0];
  };
  let app,head;const graphObservations=[];
  for(const [index,snapshot]of [before,cameras,world,...returned].entries()){
    const row=annotation(snapshot,'parentRttiMapPreflight','parent-rtti-map-preflight');common(row,snapshot,index===0?0:activationEvent);
    const root=base+0x2efb38,rootBytes=rttiBytes(snapshot,root,4),actualApp=rootBytes.readUInt32LE();assert.ok(actualApp>0&&actualApp+0x84<=0x100000000);const slot=actualApp+0x7c,headBytes=rttiBytes(snapshot,slot,4),actualHead=headBytes.readUInt32LE();assert.ok(actualHead>0&&actualHead+100<=0x100000000);
    rttiEq([row.snapshotOrdinal,rttiUint(row.rootAddress,'root'),row.rootBytesHex,rttiUint(row.appAddress,'APP'),rttiUint(row.headSlotAddress,'headslot'),row.headBytesHex,rttiUint(row.headAddress,'head'),row.identityAction,row.identitiesLatchedOrStable,row.beforeSnapshotRangeResolution,row.phasePredicateAlreadySelected,row.sameStoppedDebugEvent],[snapshot.ordinal,root,rootBytes.toString('hex'),actualApp,slot,headBytes.toString('hex'),actualHead,index===0?'latched':'stable',true,true,snapshot.breakpointId!=='native-parent-return',true],'raw singleton/head preflight');
    if(index){assert.equal(actualApp,app,'RTTI changed APP identity');assert.equal(actualHead,head,'RTTI changed head identity');}else{app=actualApp;head=actualHead;}
    const fixed=rttiRange(snapshot,'late-singleton-candidate-viewport-map-head',head,100),region=snapshot.ranges.get('late-singleton-candidate-viewport-map-region');
    rttiEq([Number(fixed.rootRva),Number(fixed.guardedRootAddress),fixed.dereferenceOffsets.map(Number),fixed.dereferenceMinimumValues,fixed.guardedDeclaredLength,Number(fixed.offset??0)],[0x2efb38,root,[0,0x7c],[1,1],100,0],'configured guarded map-head descriptor');
    assert.ok(fixed.rangeMode==='guarded-pointer'&&fixed.guardedStopIndex===null,'RTTI head is observed nonnull guard');assert.ok(region&&region.rangeMode==='readable-region'&&region.maxRegionBytes===16*1024*1024&&region.length>0&&region.length<=16*1024*1024);
    rttiEq([Number(region.requestedResolvedRoot),Number(region.regionBaseAddress),Number(region.regionSize),Number(region.rootRva),region.dereferenceOffsets.map(Number),Number(region.offset??0)],[head,Number(region.address),region.length,0x2efb38,[0,0x7c],0],'actual containing map region');assert.ok(head>=Number(region.address)&&head+100<=Number(region.address)+region.length);
    const protection=rttiUint(region.regionProtection,'region protection');assert.ok(Number(region.regionState)===0x1000&&!(protection&0x100)&&[2,4,8,0x20,0x40,0x80].includes(protection&255));
    assert.ok(fixed.bytes.equals(rttiBytes(snapshot,head,100)),'RTTI fixed/region bytes differ');
    if(policy.viewportMapGraph){
      const graph=annotation(snapshot,'parentRttiViewportMapGraph','parent-rtti-map-graph');common(graph,snapshot,index===0?0:activationEvent);
      assert.ok(records.indexOf(graph)>records.indexOf(row),'RTTI bounded graph must follow this event singleton preflight');
      graphObservations.push(verifyNativeParentRttiViewportMapGraph(snapshot,graph,{appAddress:app,headAddress:head}));
    }
  }
  for(const snapshot of snapshots){const hasGraph=snapshot.parentRttiViewportMapGraph!==undefined||rttiRows(snapshot).some(row=>row.source==='parent-rtti-viewport-map-graph'||/^parent-rtti-map-(?:graph-|node-|key-)/.test(row.id));assert.equal(hasGraph,policy.viewportMapGraph&&configuration.parentRttiObservation.singletonMapPreflight.breakpointIds.includes(snapshot.breakpointId),'RTTI graph observations exist only at explicitly opted-in checkpoints');}
  const observerSites=[...nativeParentRttiSites,...(policy.weatherCounterObservation?nativeParentWeatherCounterSites:[])];
  const activated=records.filter(row=>row.type==='parent-rtti-breakpoint-activated'),activation=annotation(auxiliary,'parentRttiActivation','parent-rtti-activation');assert.equal(activated.length,observerSites.length);common(activation,auxiliary,activationEvent);
  rttiEq([activation.auxiliarySnapshotOrdinal,activation.afterSnapshotBytesCaptured,activation.beforeSnapshotPublication,activation.beforeOriginalInstruction],[auxiliary.ordinal,true,true,true],'captured auxiliary before activation/publication');
  const installed=observerSites.map((site,index)=>({id:site.id,address:`0x${(base+site.preferredAddress-0x400000).toString(16).padStart(8,'0')}`,originalBytesHex:site.bytesHex??(index?'83c414':'e89f651600'),patchBytesHex:'cc'}));
  const normalized=rows=>rows.map(row=>({id:row.id,address:Number(row.address),originalBytesHex:row.originalBytesHex,patchBytesHex:row.patchBytesHex}));rttiEq(normalized(activation.installed),normalized(installed),'only two native opcode patches');
  for(const [index,row]of activated.entries()){
    common(row,auxiliary,activationEvent);rttiEq(normalized([row]),normalized([installed[index]]),'guarded original code');assert.equal(row.beforeOriginalInstruction,true);
    const deferred=records.filter(r=>r.type==='breakpoint-installation-deferred'&&r.id===row.id);assert.equal(deferred.length,1);const d=deferred[0];rttiEq([Number(d.address),d.originalBytesHex,d.activationBreakpointId,d.activationSelection,d.capability,d.codeModified],[Number(row.address),row.originalBytesHex.slice(0,2),auxiliary.breakpointId,'selected-owned-parent-auxiliary',nativeParentRttiRequiredCapability,false],'unmodified deferred native site');assert.ok(records.indexOf(d)<rawIndex.get(before.ordinal));assert.ok(!records.some(r=>r.type==='breakpoint-installed'&&r.id===row.id),'RTTI observer patched before selected auxiliary');
  }
  const ia=records.indexOf(activated[0]),ib=records.indexOf(activated.at(-1)),ic=records.indexOf(activation),is=rawIndex.get(auxiliary.ordinal);assert.ok(ia<ib&&ib<ic&&ic<is&&!records.slice(ia,is).some(row=>row.type==='debug-event'),'RTTI same-event guarded activation order');for(let i=1;i<activated.length;i++)assert.ok(records.indexOf(activated[i-1])<records.indexOf(activated[i]));
  const admitted=records.filter(row=>row.type==='parent-rtti-admitted');assert.equal(admitted.length,external.length);const outcomes=[];let call,weatherCompleted=0;
  for(const [index,snapshot]of external.entries()){
    const row=annotation(snapshot,'parentRttiObservation','parent-rtti-admitted');common(row,snapshot,activationEvent);
    const entry=index%2===0,actualQ=snapshot.context.readUInt32LE(196),weather=policy.weatherScreenQueries&&actualQ===U-460,family=weather?'weather-screen':'camera';
    assert.equal(snapshot.breakpointId,nativeParentRttiSites[entry?0:1].id);assert.equal(actualQ,weather?U-460:Q,'RTTI proved caller-family stack depth');
    assert.ok(snapshot.ordinal>(weather?cameras:auxiliary).ordinal&&snapshot.ordinal<(weather?world:cameras).ordinal,'RTTI family inside its actual parent stage');
    const stack=rttiRange(snapshot,'native-parent-rtti-context',actualQ,weather?68:52).bytes,clockBytes=rttiRange(snapshot,'native-parent-rtti-clock',base+0x50a548,4).bytes;
    assert.equal(clockBytes.readUInt32LE(),clock);
    let weatherQueryIndex;
    if(weather){
      const queryReturn=rttiRange(snapshot,'native-parent-rtti-weather-query-return',actualQ+84,4).bytes,screenReturn=rttiRange(snapshot,'native-parent-rtti-weather-screen-return',actualQ+416,4).bytes,parentReturn=rttiRange(snapshot,'native-parent-rtti-weather-parent-return',actualQ+440,4).bytes,name=rttiRange(snapshot,'native-parent-rtti-weather-name',actualQ+140,9).bytes;
      const query=queryReturn.readUInt32LE();weatherQueryIndex=query===base+0x98092?1:query===base+0x980f5?2:0;assert.ok(weatherQueryIndex>0,'RTTI exact direct screen-query caller');
      const F=U-360,outputs=weatherQueryIndex===1?[F+0x18,F+0x1c,F+0x14,F+0x20]:[F+0x10,F+0x18,F+0x1c,F+0x20];
      rttiEq([stack.readUInt32LE(40),stack.readUInt32LE(44),stack.readUInt32LE(48),...Array.from({length:4},(_,i)=>stack.readUInt32LE(52+i*4)),screenReturn.readUInt32LE(),parentReturn.readUInt32LE()],[base+0xabf3,actualQ+141,actualQ+140,...outputs,base+0x96822,base+0x51116],'weather saved ECX/NAME/output pointers and caller chain; noMODE');
      assert.equal(name[8],0);assert.ok(name.equals(rttiBytes(before,base+0x1d0254,9)),'RTTI weather NAME matches original-entry executable literal');
      rttiEq([row.weatherQueryIndex,rttiUint(row.queryReturnAddress,'weather queryreturn'),row.queryReturnBytesHex,rttiUint(row.screenReturnAddress,'weather screenreturn'),row.screenReturnBytesHex,rttiUint(row.parentReturnAddress,'weather parentreturn'),row.parentReturnBytesHex,rttiUint(row.nameAddress,'weather NAME'),row.nameBytesHex],[weatherQueryIndex,actualQ+84,queryReturn.toString('hex'),actualQ+416,screenReturn.toString('hex'),actualQ+440,parentReturn.toString('hex'),actualQ+140,name.toString('hex')],'weather actual raw family rows');
      assert.equal(row.cameraReturnAddress,undefined);assert.equal(row.cameraReturnBytesHex,undefined);
      if(entry)assert.equal(weatherQueryIndex,weatherCompleted+1,'RTTI two direct weather queries occur in original order');
    }else{
      const cameraReturn=rttiRange(snapshot,'native-parent-rtti-camera-return',U-20,4).bytes;
      rttiEq([stack.readUInt32LE(40),stack.readUInt32LE(44),stack.readUInt32LE(48),cameraReturn.readUInt32LE()],[base+0x1a0c8,U-60,1,base+0x51107],'corrected common NAME/MODE/camera ABI');
      rttiEq([rttiUint(row.cameraReturnAddress,'camera return'),row.cameraReturnBytesHex],[U-20,cameraReturn.toString('hex')],'raw camera caller return');
      for(const key of ['weatherQueryIndex','queryReturnAddress','queryReturnBytesHex','screenReturnAddress','screenReturnBytesHex','parentReturnAddress','parentReturnBytesHex','nameAddress','nameBytesHex'])assert.equal(row[key],undefined,`RTTI camera cannot carry ${key}`);
    }
    if(policy.weatherScreenQueries)assert.equal(row.family,family);else assert.equal(row.family,undefined,'RTTI legacy proof schema preserved');
    const wantedIds=(weather?nativeParentRttiWeatherObservationRanges():nativeParentRttiObservationRanges()).map(r=>r.id).concat('thread-seh-head').sort();rttiEq([...snapshot.ranges.keys()].sort(),wantedIds,'only exact caller-family observation rows');
    const args=Array.from({length:5},(_,i)=>stack.readUInt32LE(i*4));rttiEq(args,[app,0,base+0x2e213c,base+0x2e20a4,0],'actual ASLR CRT arguments');
    rttiEq([row.role,row.pairIndex,row.snapshotOrdinal,rttiUint(row.derivedQ,'Q'),rttiUint(row.stackAddress,'stack'),row.stackBytesHex,row.actualSingletonBytesHex,row.actualClockBytesHex,row.actualArgumentsHex,row.commonAbiMatched,row.beforeSnapshotRangeResolution,row.beforeOriginalInstruction],[entry?'call':'return',Math.floor(index/2)+1,snapshot.ordinal,actualQ,actualQ,stack.toString('hex'),stack.subarray(0,4).toString('hex'),clockBytes.toString('hex'),stack.subarray(0,20).toString('hex'),true,true,true],'actual endpoint blob and scope proof');
    assert.ok(Number.isInteger(row.rawHit)&&row.rawHit>=snapshot.hit);assert.equal(snapshot.hit,Math.floor(index/2)+1);assert.equal(snapshot.rawHit,undefined,'RTTI unfiltered snapshot has no invented rawHit field');assert.equal(snapshot.matchingHit,undefined);
    if(entry){assert.ok(!call);call={snapshot,args,bytes:stack.subarray(0,20),family,weatherQueryIndex};}else{assert.ok(call);assert.ok(call.bytes.equals(stack.subarray(0,20)),'RTTI call/return arguments changed');rttiEq([family,weatherQueryIndex],[call.family,call.weatherQueryIndex],'same-family paired return');if(weather)weatherCompleted++;outcomes.push({pairIndex:outcomes.length+1,callOrdinal:call.snapshot.ordinal,returnOrdinal:snapshot.ordinal,entryEsp:actualQ-4,args,eax:snapshot.context.readUInt32LE(176),...(policy.weatherScreenQueries?{family,...(weather?{weatherQueryIndex}:{})}:{}),authority:'observed-external-CRT-boundary-only'});call=null;}
  }
  assert.ok(!call);if(policy.weatherScreenQueries)assert.equal(weatherCompleted,2,'RTTI mixed scope requires both original direct weather queries');
  const closing=policy.weatherScreenQueries?world:cameras,closure=annotation(closing,'parentRttiClosure','parent-rtti-closed');common(closure,closing,activationEvent);
  for(const s of snapshots)if(s!==closing)assert.equal(s.parentRttiClosure,undefined,'RTTI closure only at selected policy endpoint');
  rttiEq([closure.snapshotOrdinal,closure.actualPairs,closure.actualSnapshots,closure.callOpen,closure.windowOpen,closure.breakpointsRemainArmedForDeferredReplay,closure.beforeSnapshotRangeResolution,closure.beforeOriginalInstruction],[closing.ordinal,outcomes.length,external.length,false,false,true,true,true],'closed bounded external window');
  assert.ok(records.indexOf(closure)<records.findIndex(row=>row.type==='parent-rtti-map-preflight'&&row.observedDebugEventOrdinal===closing.observedDebugEventOrdinal),'RTTI closure before endpoint map preflight');
  rttiEq(complete.parentRttiObservation,{selectedParentCheckpoints:10,startupSnapshots:3,externalPairs:outcomes.length,externalSnapshots:external.length,mapPreflights:mapChecks,windowClosed:true,callOpen:false,activationDebugEventOrdinal:activationEvent,...(policy.weatherCounterObservation?{counterPairs:1,counterSnapshots:2}:{})},'complete finite host lifecycle');
  if(policy.weatherCounterObservation)rttiEq([closure.actualCounterPairs,closure.actualCounterSnapshots],[1,2],'Counter closed with world checkpoint');
  for(const row of records.filter(r=>r.type==='parent-rtti-skipped'||r.type==='parent-rtti-checkpoint-skipped')){
    const event=debugs.get(row.observedDebugEventOrdinal);assert.ok(event&&event.row.pid===owner.pid&&event.row.tid===row.tid&&records.indexOf(row)>event.index);rttiEq([row.pid,row.ownerMainTid,row.matchingHitAdvanced,row.snapshotCountAdvanced,row.originalInstructionSkipped],[owner.pid,owner.tid,false,false,false],'counter-neutral excluded hit');
    if(row.type==='parent-rtti-checkpoint-skipped')assert.ok(row.tid!==owner.tid&&rttiStages.includes(row.breakpointId));else{assert.ok(nativeParentRttiSites.some(site=>site.id===row.breakpointId));assert.ok(['outside-selected-parent-camera-window','different-owned-thread','different-derived-stack','different-common-camera-caller'].includes(row.reason));if(row.reason==='different-owned-thread')assert.notEqual(row.tid,owner.tid);if(row.reason==='outside-selected-parent-camera-window')assert.ok(row.observedDebugEventOrdinal>=closing.observedDebugEventOrdinal);if(policy.weatherScreenQueries&&row.tid===owner.tid&&row.observedDebugEventOrdinal>activationEvent&&row.observedDebugEventOrdinal<closing.observedDebugEventOrdinal)assert.fail('RTTI mixed scope cannot silently skip an unproved same-main-thread caller');}
  }
  const siteHits=new Map();
  for(const row of records.filter(r=>r.type==='parent-rtti-admitted'||r.type==='parent-rtti-skipped')){
    const prior=siteHits.get(row.breakpointId)??0;assert.equal(row.rawHit,prior+1,'RTTI every armed-site raw hit is admitted or explicitly counter-neutral skipped');siteHits.set(row.breakpointId,row.rawHit);
  }
  const weatherCounter=verifyNativeParentWeatherCounterRecords({capture,configuration,records,before,cameras,world,owner,base,U,clock,activationEvent,rttiOutcomes:outcomes});
  const soundBankOwnerGraph=verifyNativeParentSoundOwnerGraphRecords({capture,configuration,records,before,parent,owner,base,U,clock,activationEvent});
  const finalTick=verifyNativeParentFinalCaptureRecords({capture,configuration,records,before,parent,owner,base,U,clock,activationEvent});
  return {verified:true,scope:'Authenticated captured parent/CRT transport; no source result or map memory admission',ownedPid:owner.pid,ownedMainTid:owner.tid,moduleBaseAddress:base,parentEntryEsp:U,logicalClock:clock,externalPairs:outcomes.length,snapshots:snapshots.length,mapIdentity:{appAddress:app,headAddress:head},activationDebugEventOrdinal:activationEvent,outcomes,...(policy.viewportMapGraph?{viewportMapGraph:graphObservations}:{}),...(weatherCounter?{weatherCounter}:{}),...(soundBankOwnerGraph?{soundBankOwnerGraph}:{}),...(finalTick?{finalTick}:{}),runtimeResolvedExportIdentityProved:false};
}

//405720/4061a0/406660 (retained3673/3687/3689) establish the nil byte,
//100-byte node allocation, and inline/heap string layout. Recompute only
//observed bytes. A graph observation
//does not prove the cast result or admit any nodes as source semantic state.
export function verifyNativeParentRttiViewportMapGraph(snapshot,proof,{appAddress,headAddress}={}){
  const app=rttiUint(appAddress,'candidateAPP'),head=rttiUint(headAddress,'candidateHEAD');assert.ok(app>0&&app+0x84<=0x100000000&&head>0&&head+16<=0x100000000);
  const graphRows=rttiRows(snapshot).filter(row=>row.source==='parent-rtti-viewport-map-graph'||/^parent-rtti-map-(?:graph-|node-|key-)/.test(row.id));
  const checked=new Set(),read=(id,address,length,role)=>{
    const row=rttiRange(snapshot,id,address,length);assert.equal(row.source,'parent-rtti-viewport-map-graph');assert.equal(row.graphRole,role);assert.ok(row.bytes.length===length&&rttiHash(row.bytes)===row.sha256,'RTTI graph raw hash/length');assert.ok(!checked.has(id));checked.add(id);assert.ok(row.bytes.equals(rttiBytes(snapshot,address,length)),'RTTI graph overlapping actual bytes differ');return row;
  };
  const header=read('parent-rtti-map-graph-header',app+0x7c,8,'header').bytes,headBytes=read('parent-rtti-map-graph-head',head,16,'head').bytes,count=header.readUInt32LE(4),root=headBytes.readUInt32LE(4);
  assert.equal(header.readUInt32LE(),head);assert.ok(count<=8,'RTTI candidate map exceeds8-node observation bound');assert.equal(headBytes[13],1,'RTTI actual map HEAD nil flag');assert.equal(headBytes[12],1,'RTTI original black HEAD sentinel');
  rttiEq([proof.snapshotOrdinal,rttiUint(proof.appAddress,'graphAPP'),rttiUint(proof.headerAddress,'mapheader'),proof.headerBytesHex,rttiUint(proof.headAddress,'graphHEAD'),proof.headBytesHex,rttiUint(proof.rootAddress,'treeroot'),proof.count,proof.maxNodes,proof.maxKeyBytes,proof.sameStoppedDebugEvent,proof.beforeOriginalInstruction,proof.afterSingletonPreflight,proof.completeGraphObserved],[snapshot.ordinal,app,app+0x7c,header.toString('hex'),head,headBytes.toString('hex'),root,count,8,256,true,true,true,true],'bounded graph proof header');
  const nodes=[],seen=new Set(),pending=count?[{address:root,parent:head,path:'root'}]:[];
  if(count===0)rttiEq([headBytes.readUInt32LE(),root,headBytes.readUInt32LE(8)],[head,head,head],'empty candidate map head links');
  while(pending.length){
    const next=pending.shift(),index=nodes.length,address=next.address;assert.ok(address>0&&address!==head&&address+100<=0x100000000&&!seen.has(address)&&index<8,'RTTI graph duplicate/cycle/null/out-of-bound node');seen.add(address);
    const row=read(`parent-rtti-map-node-${index}`,address,100,'node'),bytes=row.bytes;
    rttiEq([row.graphNodeIndex,row.graphPath,rttiUint(row.nodeAddress,'row node')],[index,next.path,address],'BFS node row identity');
    const left=bytes.readUInt32LE(),parent=bytes.readUInt32LE(4),right=bytes.readUInt32LE(8),length=bytes.readUInt32LE(32),capacity=bytes.readUInt32LE(36),heap=capacity>=16,keyAddress=heap?bytes.readUInt32LE(16):address+16;
    assert.equal(bytes[13],0,'RTTI normal node nil flag');assert.ok(bytes[12]<=1,'RTTI original red/black color domain');assert.equal(parent,next.parent,'RTTI parent backlink');assert.ok(left>0&&right>0&&length<=capacity&&length+1<=256&&keyAddress>0&&keyAddress+length+1<=0x100000000,'RTTI actual key/child bounds');
    const keyId=heap?`parent-rtti-map-key-${index}`:null,key=heap?read(keyId,keyAddress,length+1,'heap-key').bytes:bytes.subarray(16,16+length+1);
    assert.equal(key.length,length+1);assert.equal(key[length],0,'RTTI key terminator at actual length');
    if(heap){const kr=snapshot.ranges.get(keyId);rttiEq([kr.graphNodeIndex,kr.graphPath,rttiUint(kr.nodeAddress,'key node')],[index,next.path,address],'heap key row identity');}
    const metadata={index,path:next.path,address,parentAddress:parent,leftAddress:left,rightAddress:right,keyAddress,keyLength:length,keyCapacity:capacity,heapKey:heap,nodeRangeId:row.id,keyRangeId:keyId};
    assert.ok(Array.isArray(proof.nodes));const claimed=proof.nodes[index];assert.ok(claimed,'RTTI missing claimed graph node');
    const pointerFields=['address','parentAddress','leftAddress','rightAddress','keyAddress'];
    rttiEq(Object.fromEntries(Object.entries(claimed).map(([key,value])=>[key,pointerFields.includes(key)?rttiUint(value,key):value])),metadata,'recomputed BFS node metadata');
    nodes.push({...metadata,keyHex:key.subarray(0,length).toString('hex')});
    if(left!==head)pending.push({address:left,parent:address,path:next.path+'.left'});if(right!==head)pending.push({address:right,parent:address,path:next.path+'.right'});
  }
  assert.equal(nodes.length,count,'RTTI observed tree cardinality');assert.equal(proof.nodes.length,count,'RTTI claimed tree cardinality');assert.equal(graphRows.length,checked.size,'RTTI undeclared/extraneous graph range');
  if(count){
    const map=new Map(nodes.map(node=>[node.address,node])),walk=(which)=>{let node=map.get(root);assert.ok(node);while(node[which]!==head){node=map.get(node[which]);assert.ok(node);}return node.address;};
    rttiEq([headBytes.readUInt32LE(),headBytes.readUInt32LE(8)],[walk('leftAddress'),walk('rightAddress')],'actual head min/max links');
    const order=(address,lower,upper)=>{if(address===head)return;const node=map.get(address),key=Buffer.from(node.keyHex,'hex');assert.ok((!lower||Buffer.compare(lower,key)<0)&&(!upper||Buffer.compare(key,upper)<0),'RTTI actual map key order');order(node.leftAddress,lower,key);order(node.rightAddress,key,upper);};order(root,null,null);
  }
  return {snapshotOrdinal:snapshot.ordinal,appAddress:app,headAddress:head,rootAddress:root,count,nodes,wholeGraphAdmittedToSource:false};
}
