import {replayNativeFrame} from './native-frame-replay.mjs';
import {inspectNativeEventDispatch} from '../inspect-native-frame-events.mjs';

export function pairSourceDispatchRecords(records) {
  if(!Array.isArray(records)||records.length%2)throw Error('Source dispatch observations require complete before/after pairs.');
  const events=[];
  for(let index=0;index<records.length;index+=2){
    const before=records[index],after=records[index+1];
    if(before.stage!=='before'||after.stage!=='after'||before.eventAddress!==after.eventAddress||before.deltaQ16!==after.deltaQ16)throw Error('Source dispatch observation order/identity differs.');
    events.push({before,after});
  }
  return events;
}

export function classifySourceDispatch(record,{modelQueries}={}) {
  const flags=record.classFlags&255,response=({1:'swept-contact',2:'penetration-contact',8:'sliding-contact',16:'rejected-contact',64:'damping'})[flags]??'other';
  if(!record.object1)return {category:'filtered-out',response};
  if(record.kind!==1){
    const cars=record.object1.type===3&&record.object2?.type===3;
    return {category:cars?'car-car':record.object2?'body-pair':'pair-with-filtered-second-body',response};
  }
  if(modelQueries!==0)return {category:'static-contact-unresolved-producer',response};
  // With no model query calls, the static-contact producer is terrain. Prove
  // a border from the actual matching cell AND plane normal, never flags alone.
  const candidates=record.terrainCandidates??[],sameNormal=candidates.filter(row=>row.normalQ16.every((value,i)=>value===record.normalQ16[i]));
  const planeTypes=[...new Set(sameNormal.map(row=>row.type))].sort((a,b)=>a-b);
  const category=planeTypes.length&&planeTypes.every(type=>type===6||type===7)?'terrain-border':planeTypes.length&&planeTypes.every(type=>type<=5)?'terrain-surface':'terrain-contact-merged-or-edge';
  return {category,response,cellRef:record.field44,matchingPlaneTypes:planeTypes,cellCandidateTypes:[...new Set(candidates.map(row=>row.type))].sort((a,b)=>a-b)};
}

export function traceNativeFrameDispatches(snapshot,options={}) {
  const records=[],external=options.onCollisionDispatch;
  let replay;
  try{replay=replayNativeFrame(snapshot,{...options,onCollisionDispatch:record=>{records.push(record);external?.(record);}});}
  catch(error){if(error&&typeof error==='object')error.dispatchRecords=records;throw error;}
  const events=pairSourceDispatchRecords(records);
  if(events.length!==replay.report.processedEvents)throw Error('Source dispatch observations disagree with the frame processed-event count.');
  return {...replay,dispatchEvents:events.map((event,index)=>({index,...event,classification:classifySourceDispatch(event.before,replay.report)}))};
}

export function compareNativeDispatchSnapshots(nativeSnapshots,sourceEvents,{before,after,logicalClock,mode='fixed-clock',subset='all',sourceProcessedEvents,moduleBaseAddress,returnAddress}={}) {
  if(!Array.isArray(nativeSnapshots)||!Array.isArray(sourceEvents)||!before||!after)throw Error('Native dispatch comparison requires ordered source events and a complete parent frame.');
  if(!['fixed-clock','pending-frame'].includes(mode))throw Error('Unknown native dispatch observation selection mode.');
  if(!['all','body-pair'].includes(subset)||(subset==='body-pair'&&mode!=='pending-frame'))throw Error('Unknown native dispatch subset or unsupported selection mode.');
  const sourceTotal=sourceEvents.length;
  if(subset==='body-pair'&&sourceProcessedEvents!==sourceTotal)throw Error('Body-pair subset requires the complete source processed-event count.');
  const selectedSource=subset==='body-pair'?sourceEvents.filter(row=>(row.before??row).kind===0):sourceEvents,expectedCount=selectedSource.length;
  if(nativeSnapshots.length!==expectedCount)return {matched:false,firstDivergence:{kind:'event-count',nativeCount:nativeSnapshots.length,sourceCount:expectedCount},events:[]};
  let pendingIdentity;
  if(mode==='pending-frame'){
    pendingIdentity=before.pendingFrame;
    if(!pendingIdentity||pendingIdentity.role!=='before'||after.pendingFrame?.role!=='after'||!Number.isSafeInteger(pendingIdentity.candidateIndex)||pendingIdentity.candidateIndex<1)throw Error('Pending native dispatch comparison requires the accepted parent-frame metadata.');
    if(!expectedCount)throw Error('Selected pending frame must contain a nonempty native dispatch stream.');
    for(const parent of [before,after]){
      const identity=parent.pendingFrame;
      if(parent.deferredPublication!==true||identity.observedEventHits!==sourceTotal||identity.qualifyingEventSnapshots!==expectedCount)throw Error(subset==='all'?'Pending native event totals do not describe an unfiltered complete dispatch stream.':'Pending native event totals do not describe the declared kind0 subset dispatch stream.');
      for(const key of ['candidateIndex','frameTid','frameEntryEsp','frameReturnAddress','frameMatchingHit'])if(String(identity[key])!==String(pendingIdentity[key]))throw Error('Pending native parent identities differ.');
      if(identity.eventIndex!==undefined)throw Error('Pending parent snapshot cannot have an event index.');
    }
    if(!Number.isSafeInteger(before.observedDebugEventOrdinal)||!Number.isSafeInteger(after.observedDebugEventOrdinal)||before.observedDebugEventOrdinal>=after.observedDebugEventOrdinal)throw Error('Pending native parent observed order is invalid.');
    if(!Number.isSafeInteger(before.observedElapsedMs)||!Number.isSafeInteger(after.observedElapsedMs)||before.observedElapsedMs>after.observedElapsedMs)throw Error('Pending native parent observation times are invalid.');
  }
  const events=[];
  let previousOrdinal=before.ordinal,previousObservedEvent=before.observedDebugEventOrdinal;
  for(let index=0;index<expectedCount;index++){
    const snapshot=nativeSnapshots[index],source=selectedSource[index].before??selectedSource[index];
    if(snapshot.ordinal<=previousOrdinal||snapshot.ordinal>=after.ordinal||snapshot.tid!==before.tid||snapshot.tid!==after.tid)throw Error('Native dispatch observation is outside the ordered same-thread parent frame.');
    previousOrdinal=snapshot.ordinal;
    const gate=snapshot.captureWhen;
    if(mode==='fixed-clock'){
      if(gate?.actualBytesHex!==gate?.equalsBytesHex||!gate||gate.actualBytesHex.length!==8||Buffer.from(gate.actualBytesHex,'hex').readUInt32LE()!==logicalClock)throw Error('Native dispatch observation lacks the explicit logical-clock predicate proof.');
    }else{
      const identity=snapshot.pendingFrame;
      if(subset==='all'&&gate!==undefined&&gate!==null)throw Error('Pending native dispatcher snapshots must retain the unfiltered event stream.');
      if(subset==='body-pair'&&(!gate||gate.actualBytesHex!=='00000000'||gate.equalsBytesHex!=='00000000'||Number(gate.address)!==Number(snapshot.registers.ecx)))throw Error('Body-pair native event lacks the exact kind0 predicate at its ECX event pointer.');
      if(!identity||identity.role!=='event'||snapshot.deferredPublication!==true)throw Error('Missing deferred pending native event metadata.');
      if(identity.eventIndex!==index+1||identity.observedEventHits!==sourceTotal||identity.qualifyingEventSnapshots!==expectedCount)throw Error('Pending event index/totals do not describe the declared ordered native dispatch stream.');
      for(const key of ['candidateIndex','frameTid','frameEntryEsp','frameReturnAddress','frameMatchingHit'])if(String(identity[key])!==String(pendingIdentity[key]))throw Error('Native dispatch event belongs to a different pending candidate.');
      if(Number(identity.frameTid)!==before.tid||Number(identity.frameEntryEsp)!==Number(before.registers.esp)||(returnAddress!==undefined&&Number(identity.frameReturnAddress)!==returnAddress))throw Error('Pending native event parent ABI metadata differs.');
      if(!Number.isSafeInteger(snapshot.observedDebugEventOrdinal)||snapshot.observedDebugEventOrdinal<=previousObservedEvent||snapshot.observedDebugEventOrdinal>=after.observedDebugEventOrdinal)throw Error('Pending native event observation order differs from deferred publication.');
      if(!Number.isSafeInteger(snapshot.observedElapsedMs)||snapshot.observedElapsedMs<before.observedElapsedMs||snapshot.observedElapsedMs>after.observedElapsedMs)throw Error('Pending native event observation time differs from its parent interval.');
      previousObservedEvent=snapshot.observedDebugEventOrdinal;
    }
    const native=inspectNativeEventDispatch(snapshot,{frameEntryEsp:Number(before.registers.esp)}),range=snapshot.ranges.get('dispatch-event');
    if(native.logicalClock!==logicalClock||(mode==='fixed-clock'&&Number(gate.address)!==native.moduleBaseAddress+0x90a548-0x400000)||(moduleBaseAddress!==undefined&&native.moduleBaseAddress!==moduleBaseAddress))throw Error('Native dispatch observed clock/root differs from its parent selection.');
    if(!range||Number(range.address)!==native.address||range.bytes.length!==0x68)throw Error('Native dispatch observation lacks its exact104-byte event range.');
    if(subset==='body-pair'&&(native.kind!==0||range.bytes.readInt32LE()!==0||source.kind!==0))throw Error('Body-pair subset contains a nonzero native/source event kind.');
    if(typeof source.eventBytesHex!=='string'||!/^[0-9a-f]{208}$/i.test(source.eventBytesHex))throw Error('Source dispatch observation lacks its exact104-byte event image.');
    const nativeHex=range.bytes.toString('hex');
    const divergence=native.deltaQ16!==source.deltaQ16?{kind:'delta',nativeDelta:native.deltaQ16,sourceDelta:source.deltaQ16}:native.address!==source.eventAddress?{kind:'event-address',nativeAddress:native.address,sourceAddress:source.eventAddress}:nativeHex!==source.eventBytesHex?{kind:'event-bytes',firstByte:[...range.bytes].findIndex((value,offset)=>value!==Number.parseInt(source.eventBytesHex.slice(offset*2,offset*2+2),16))}:null;
    events.push({index,...(subset==='body-pair'?{sourceEventIndex:sourceEvents.indexOf(selectedSource[index])}:{}),nativeOrdinal:snapshot.ordinal,eventAddress:native.address,deltaQ16:native.deltaQ16,matched:!divergence,divergence});
  }
  const first=events.find(row=>!row.matched);
  return {matched:!first,scope:subset==='body-pair'?'kind0-body-pair-substream':'complete-dispatch-stream',sourceProcessedEvents:sourceTotal,firstDivergence:first?{eventIndex:first.index,...first.divergence}:null,events};
}
