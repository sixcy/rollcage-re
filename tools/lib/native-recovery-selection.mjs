import {createCapturedMemory} from './captured-memory.mjs';
import {nativeRecoveryApplicationRanges,nativeRecoveryApplicationBoundary} from '../prepare-native-recovery-capture.mjs';

const eventId='native-recovery-apply-entry',proofKeys=['candidateIndex','frameTid','frameEntryEsp','frameReturnAddress','frameMatchingHit','observedEventHits','qualifyingEventSnapshots'];
export function verifyNativeRecoverySelection(configuration){
  const pending=configuration.pendingFrameObserver;
  if(pending===undefined||pending===null)return {mode:'all'};
  const keys=['beforeBreakpointId','afterBreakpointId','eventBreakpointId','maxPendingBytes','maxCandidateFrames','maxEventSnapshots','eventStackOffset','eventReturnRva','eventPointerRegister','eventRecordBytes','eventPoolRoot','eventPoolCapacity','nestedBreakpointIds','maxNestedSnapshots','nestedCaptureScope'];
  if(Object.keys(pending).some(key=>!keys.includes(key))||pending.beforeBreakpointId!=='native-recovery-before'||pending.afterBreakpointId!=='native-recovery-after'||pending.eventBreakpointId!==eventId||pending.eventStackOffset!==-124||Number(pending.eventReturnRva)!==0x7cf3c||pending.eventPointerRegister!=='ecx'||pending.eventRecordBytes!==1)throw Error('Pending recovery observer differs from the exact application ABI.');
  for(const[key,min,max]of [['maxPendingBytes',716,128*1024*1024],['maxCandidateFrames',1,10000],['maxEventSnapshots',1,64]])if(!Number.isSafeInteger(pending[key])||pending[key]<min||pending[key]>max)throw Error(`Pending recovery observer ${key} bound differs.`);
  if(pending.nestedBreakpointIds!==undefined||pending.maxNestedSnapshots!==undefined){
    const nested=pending.nestedBreakpointIds;
    if(!Array.isArray(nested)||!nested.length||nested.length>128||new Set(nested).size!==nested.length||!Number.isInteger(pending.maxNestedSnapshots)||pending.maxNestedSnapshots<1||pending.maxNestedSnapshots>128)throw Error('Pending recovery nested observation policy differs.');
    for(const id of nested){
      const point=configuration.breakpoints?.find(row=>row.id===id);
      if(typeof id!=='string'||!point||[pending.beforeBreakpointId,pending.afterBreakpointId,eventId].includes(id)||point.stopAfterHits||point.skipMatchingHits||point.service||configuration.phaseActions?.some(row=>row.breakpointId===id))throw Error('Pending recovery nested observations must be declared read-only nonstopping breakpoints.');
    }
  }
  if(pending.nestedCaptureScope!==undefined&&pending.nestedCaptureScope!=='frame-thread')throw Error('Pending recovery nested capture scope differs.');
  for(const[key,id,rva]of [['eventPoolRoot','recovery-body-arena-root',0x2e6b40],['eventPoolCapacity','recovery-body-arena-used-bytes',0x30dcf4]]){
    const row=pending[key];if(JSON.stringify(row)!==JSON.stringify({id,rva:`0x${rva.toString(16)}`,length:4}))throw Error('Pending recovery observer used-byte arena descriptor differs.');
  }
  const event=configuration.breakpoints?.find(row=>row.id===eventId);
  if(Number(event?.rva)!==nativeRecoveryApplicationBoundary.entry-0x400000||event.stopAfterHits!==undefined||event.skipMatchingHits!==undefined||event.captureWhen!==undefined||JSON.stringify(event.ranges)!==JSON.stringify(nativeRecoveryApplicationRanges()))throw Error('Pending recovery observer requires every exact application entry/range without filters.');
  if(configuration.phaseActions?.some(row=>[pending.beforeBreakpointId,pending.afterBreakpointId,eventId].includes(row.breakpointId)))throw Error('Pending recovery observer cannot perform gameplay writes.');
  return {mode:'first-respawn-application',...pending};
}

export function verifyNativeRecoveryApplicationSnapshots(capture,pair,selection){
  const group=pair.before.pendingFrame,events=capture.snapshots.filter(row=>row.breakpointId===eventId),expected=group.observedEventHits;
  if(events.length!==expected||group.qualifyingEventSnapshots!==expected)throw Error('Selected recovery must retain every application call.');
  const actual=p=>pair.moduleBaseAddress+p-0x400000,records=[];
  let ordinal=pair.before.observedDebugEventOrdinal,elapsed=pair.before.observedElapsedMs;
  for(const[snapshotIndex,snapshot]of events.entries()){
    const proof=snapshot.pendingFrame,esp=Number(snapshot.registers?.esp),body=Number(snapshot.registers?.ecx),position=Number(snapshot.registers?.edx);
    const bases=[snapshot.moduleBaseAddress,...[...snapshot.ranges.values()].map(row=>row.moduleBaseAddress)].filter(value=>value!==undefined&&value!==null);
    if(!bases.length||bases.some(value=>Number(value)!==pair.moduleBaseAddress)||!proof||snapshot.deferredPublication!==true||snapshot.hit!==snapshotIndex+1||proof.eventIndex!==snapshot.hit||proof.role!=='event'||snapshot.tid!==pair.before.tid||esp!==Number(pair.before.registers.esp)-124||Number(snapshot.registers?.eip)!==actual(0x47d440)||!Number.isInteger(snapshot.rawHit)||snapshot.rawHit<snapshot.hit||snapshot.matchingHit!==snapshot.rawHit||!Number.isInteger(snapshot.observedDebugEventOrdinal)||snapshot.observedDebugEventOrdinal<=ordinal||snapshot.observedDebugEventOrdinal>=pair.after.observedDebugEventOrdinal||!Number.isFinite(snapshot.observedElapsedMs)||snapshot.observedElapsedMs<elapsed||snapshot.observedElapsedMs>pair.after.observedElapsedMs)throw Error('Selected recovery application thread/ESP/order proof differs.');
    for(const key of proofKeys)if(proof[key]!==group[key])throw Error('Selected recovery application candidate/all-call proof differs.');
    const m=createCapturedMemory([...snapshot.ranges.values()]),memory=m.memory,span=(id,address,length)=>{
      const row=snapshot.ranges.get(id);if(!row||Number(row.address)!==address||row.bytes.length!==length)throw Error(`Selected recovery application range ${id} differs.`);return m.span(address,length);
    };
    const caller=span('recovery-apply-caller',esp,4).readUInt32LE(),args=span('recovery-apply-arguments',esp,24);
    if(caller!==actual(0x47cf3c)||args.readUInt32LE()!==caller)throw Error('Selected recovery application caller differs.');
    const arena=memory.readUInt32LE(actual(0x6e6b40)),used=memory.readUInt32LE(actual(0x70dcf4)),base=Math.ceil(arena/128)*128,allocationEnd=arena+used;
    if(!arena||!used||allocationEnd>0x100000000||!Number.isSafeInteger(body)||body<base||(body-base)%128||body+0x180>base+used||body>=allocationEnd)throw Error('Selected recovery application body exceeds its native used-byte arena.');
    const header=span('recovery-apply-body-header',body,0x180),physical=memory.readUInt32LE(actual(0x902bc0)),count=memory.readUInt16LE(actual(0x902bc4)),list=span('recovery-apply-physical-list',physical,96*4);
    if(count>=96||list.readUInt32LE(count*4)!==0||!Array.from({length:count},(_,i)=>list.readUInt32LE(i*4)).includes(body)||header.readInt32LE(0x128)!==32||[4,7,21,33].includes(header.readUInt32LE()&511))throw Error('Selected recovery application body lacks native rejected-list membership.');
    const quaternion=args.readUInt32LE(4),rotation=args.readUInt32LE(8),route=args.readUInt32LE(12),index=args.readInt32LE(16),terrain=args.readInt32LE(20);
    if(position!==actual(0x70eb0c)||quaternion!==Number(pair.before.registers.esp)-24||rotation!==body+0xc4)throw Error('Selected recovery application input pointer ABI differs.');
    const routeBytes=span('recovery-apply-route',route,12),pack=memory.readUInt32LE(actual(0x90b98c)),packBytes=span('recovery-apply-pack-header',pack,0xa0),groupBase=packBytes.readUInt32LE(0x60),groupCount=packBytes[0x46];
    if(route<groupBase+12||(route-groupBase)%12||(route-groupBase)/12>=groupCount||index<0||index>=routeBytes.readUInt16LE())throw Error('Selected recovery application route/index differs from native group storage.');
    records.push({bodyAddress:body,bodyHeaderHex:header.toString('hex'),entryEsp:esp,positionAddress:position,positionHex:span('recovery-apply-position',position,12).toString('hex'),quaternionAddress:quaternion,quaternionHex:span('recovery-apply-quaternion',quaternion,16).toString('hex'),rotationAddress:rotation,rotationHex:span('recovery-apply-rotation',rotation,18).toString('hex'),routeAddress:route,routeHex:routeBytes.toString('hex'),index,terrain});
    ordinal=snapshot.observedDebugEventOrdinal;elapsed=snapshot.observedElapsedMs;
  }
  return records;
}

export function compareNativeRecoveryApplications(nativeRecords,sourceRecords,{sourceComplete=false,respawnedBodies}={}){
  let firstDivergence=null;
  for(let i=0;i<Math.min(nativeRecords.length,sourceRecords.length)&&!firstDivergence;i++)for(const key of Object.keys(nativeRecords[i]))if(nativeRecords[i][key]!==sourceRecords[i][key]){firstDivergence={event:i+1,field:key,native:nativeRecords[i][key],source:sourceRecords[i][key]};break;}
  if(!firstDivergence&&nativeRecords.length!==sourceRecords.length)firstDivergence={kind:'application-call-count',native:nativeRecords.length,source:sourceRecords.length};
  if(!firstDivergence&&sourceComplete&&respawnedBodies!==nativeRecords.length)firstDivergence={kind:'completed-respawn-count',nativeApplications:nativeRecords.length,respawnedBodies};
  return {matched:!firstDivergence,sourceComplete,nativeCalls:nativeRecords.length,sourceCalls:sourceRecords.length,firstDivergence,nativeApplications:nativeRecords,sourceApplications:sourceRecords};
}

export const nativeRecoverySelectionProofKeys=Object.freeze(proofKeys);
