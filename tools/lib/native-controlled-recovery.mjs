import {createReduxCaptureConfig} from './redux-capture-config.mjs';
import {createCapturedMemory} from './captured-memory.mjs';
import {controlledNativeRecoveryInput,controlledNativeRecoveryAction,controlledNativeRecoveryCallerRanges} from '../prepare-controlled-native-recovery-capture.mjs';
import {recoveryLeafPolicy} from './native-recovery-leaf-replay.mjs';

const id=controlledNativeRecoveryInput.callerId,originalActions=()=>createReduxCaptureConfig('policy-only','hidden-idle','unused-policy-output').phaseActions;
export function verifyControlledNativeRecoveryConfiguration(configuration,{scope='parent'}={}){
  if(!['parent','query','apply'].includes(scope))throw Error('Controlled recovery scope must be parent,query orapply.');
  const caller=configuration.breakpoints?.find(row=>row.id===id),actions=configuration.phaseActions??[],controlled=actions.filter(row=>row.breakpointId===id);
  if(!caller&&!controlled.length){
    if(scope!=='parent'&&actions.length===0)return null;
    if(JSON.stringify(actions)!==JSON.stringify(originalActions()))throw Error('Native recovery observations contain an undeclared gameplay action.');
    return null;
  }
  if(!caller||Number(caller.rva)!==0x5101c||caller.captureWhen!==undefined||caller.skipMatchingHits!==undefined||caller.stopAfterHits!==undefined||JSON.stringify(caller.ranges)!==JSON.stringify(controlledNativeRecoveryCallerRanges())||JSON.stringify(actions)!==JSON.stringify([...originalActions(),controlledNativeRecoveryAction()])||configuration.captureThreadEnvironment!==true||configuration.maxSnapshots!==350)throw Error('Controlled recovery caller/guard/no-op policy differs from the declared input.');
  if(scope==='parent'){
    if(configuration.pendingFrameObserver?.beforeBreakpointId!=='native-recovery-before')throw Error('Controlled recovery parent requires its exact pending observer.');
    for(const bp of configuration.breakpoints.filter(row=>['native-recovery-before','native-recovery-after'].includes(row.id)))if(bp.skipMatchingHits!==0)throw Error('Controlled recovery must observe the first post-write parent.');
  }else{
    const leaf=recoveryLeafPolicy(scope),entry=configuration.breakpoints.find(row=>row.id===`native-recovery-${scope}-before`),exits=['a','b'].map((suffix,index)=>({bp:configuration.breakpoints.find(row=>row.id===`native-recovery-${scope}-after-${suffix}`),address:leaf.exits[index]}));
    if(configuration.pendingFrameObserver||Number(entry?.rva)!==leaf.entry-0x400000||entry.skipMatchingHits!==0||entry.stopAfterHits>0||exits.some(({bp,address})=>Number(bp?.rva)!==address-0x400000||bp.skipMatchingHits!==0||bp.stopAfterHits!==1))throw Error('Controlled recovery leaf scope requires its first entry and both native preRETs without pending selection.');
  }
  return controlledNativeRecoveryInput;
}

export function verifyControlledNativeRecoveryEvidence(capture,pair,configuration,{scope='parent'}={}){
  const policy=verifyControlledNativeRecoveryConfiguration(configuration,{scope});if(!policy)return null;
  const callers=capture.snapshots.filter(row=>row.breakpointId===id),actual=p=>pair.moduleBaseAddress+p-0x400000;
  if(callers.length!==229||(scope==='parent'&&(pair.before.rawHit!==229||pair.before.pendingFrame?.candidateIndex!==1)))throw Error('Controlled recovery lacks exact229 caller/first-parent counts.');
  for(const[index,row]of callers.entries()){
    const bases=[row.moduleBaseAddress,...[...row.ranges.values()].map(value=>value.moduleBaseAddress)].filter(value=>value!==undefined&&value!==null);
    //Immediate unfiltered CS snapshots publish only hit. Their absent raw/
    //matching counters are not fabricated; the exact unfiltered descriptor
    //and sequential229 observations prove the hit domain. Reject contradictions.
    if(row.hit!==index+1||(row.rawHit!==undefined&&row.rawHit!==row.hit)||(row.matchingHit!==undefined&&row.matchingHit!==row.hit)||row.tid!==pair.before.tid||!bases.length||bases.some(value=>Number(value)!==pair.moduleBaseAddress)||Number(row.registers?.eip)!==actual(0x45101c)||row.captureWhen!==undefined)throw Error('Controlled recovery unfiltered caller order/thread/address proof differs.');
  }
  const caller=callers.at(-1);
  if(caller.ordinal>=pair.before.ordinal||caller.capturePhase!=='before-declared-writes-before-original-instruction')throw Error('Controlled recovery entry was not observed after its declared input.');
  const readRoot=(name,preferred)=>{
    const row=caller.ranges.get(name);if(!row||Number(row.address)!==actual(preferred)||row.bytes.length!==4)throw Error('Controlled recovery scalar root observation differs.');return row.bytes.readUInt32LE();
  };
  const clock=readRoot('controlled-recovery-clock',0x90a548),session=readRoot('controlled-recovery-session-root',0x5ecb1c),body=readRoot('controlled-recovery-first-body-root',0x909300);
  if(clock!==228||!session||!body)throw Error('Controlled recovery clock/participant/session scalar proof differs.');
  const writes=capture.interventions.filter(row=>row.breakpointId===id);
  const addresses=[actual(0x90a548),session+0x57c,body,body+0x128],action=controlledNativeRecoveryAction();
  if(writes.length!==4)throw Error('Controlled recovery requires all four actual guard/write records.');
  const guards=writes.map((row,index)=>{
    const expected=action.writes[index];
    if(row.type!=='intervention'||row.hit!==229||Number(row.address)!==addresses[index]||row.originalBytesHex!==expected.expectedBytesHex||row.replacementBytesHex!==expected.bytesHex||JSON.stringify(row.acceptedOriginalBytesHex)!==JSON.stringify([expected.expectedBytesHex]))throw Error('Controlled recovery actual guard/no-op intervention proof differs.');
    return {address:addresses[index],originalBytesHex:row.originalBytesHex,replacementBytesHex:row.replacementBytesHex,noOp:index<3};
  });
  const before=createCapturedMemory([...pair.before.ranges.values()]).memory;
  if(before.readUInt32LE(actual(0x5ecb1c))!==session||before.readUInt32LE(actual(0x909300))!==body||before.readUInt32LE(actual(0x90a548))!==228||before.readUInt32LE(session+0x57c)!==4||before.readUInt32LE(body)!==0x1c03||before.readInt32LE(body+0x128)!==32)throw Error('Controlled recovery parent/applications do not consume the declared native state32 input.');
  if(scope!=='parent'){
    const leaf=recoveryLeafPolicy(scope),esp=Number(pair.before.registers?.esp),callerEsp=Number(caller.registers?.esp),parentEsp=callerEsp-4,position=Number(pair.before.registers?.edx),quaternion=before.readUInt32LE(esp+4),rotation=before.readUInt32LE(esp+8);
    if(!Number.isSafeInteger(callerEsp)||Number(pair.before.registers?.eip)!==actual(leaf.entry)||esp!==parentEsp-(scope==='query'?120:124)||Number(pair.before.registers?.ecx)!==body||position!==actual(0x70eb0c)||before.readUInt32LE(esp)!==actual(leaf.returnAddress)||quaternion!==parentEsp-24||rotation!==body+0xc4)throw Error('Controlled recovery leaf actual-parent pointer/stack ABI differs.');
    before.subarray(position,position+12);before.subarray(quaternion,quaternion+16);before.subarray(rotation,rotation+18);
    const input={entryEsp:esp,parentEntryEsp:parentEsp,returnAddress:actual(leaf.returnAddress),bodyAddress:body,positionAddress:position,quaternionAddress:quaternion,rotationAddress:rotation};
    if(scope==='query'){
      const mode=before.readInt32LE(esp+12),output=before.readUInt32LE(esp+16);if(mode!==1||output!==parentEsp-44)throw Error('Controlled recovery query mode/output ABI differs.');before.readInt32LE(output);Object.assign(input,{mode,outputAddress:output});
    }else{
      const route=before.readUInt32LE(esp+12),index=before.readInt32LE(esp+16),terrain=before.readInt32LE(esp+20),pack=before.readUInt32LE(actual(0x90b98c)),groups=before.readUInt32LE(pack+0x60),count=before[pack+0x46];
      if(route<groups+12||(route-groups)%12||(route-groups)/12>=count||index<0||index>=before.readUInt16LE(route))throw Error('Controlled recovery apply route/index is outside its actual native pack.');before.subarray(route,route+12);Object.assign(input,{routeAddress:route,index,terrain});
    }
    return {authority:policy.authority,scope,callerOrdinal:caller.ordinal,callerRawHit:229,leafBeforeOrdinal:pair.before.ordinal,clock,sessionAddress:session,bodyAddress:body,guards,input,limits:['State32 was supplied before the captured leaf entry; this is not evidence of a naturally produced rejection.','Leaf query/application output is native-produced; no route,pose or query answer is injected.']};
  }
  if(pair.nativeApplications?.filter(row=>row.bodyAddress===body).length!==1)throw Error('Controlled recovery parent/applications do not consume the declared native state32 input.');
  return {authority:policy.authority,callerOrdinal:caller.ordinal,callerRawHit:229,parentBeforeOrdinal:pair.before.ordinal,clock,sessionAddress:session,bodyAddress:body,guards,nativeFirstBodyApplications:1,limits:['State32 is supplied by a declared guarded intervention; this is not evidence of a natural physics/rejection trigger.','The three no-op writes are assertion records; only body+128 changes bytes. No pose, route or query result is injected.']};
}
