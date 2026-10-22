//Independent47d040/47d440 leaf binding. Captures supply all native pointers,
//geometry/progression/pools and numerical controls; no constructor or answer.
import {bindCapturedNativeRecovery} from './native-recovery-context.mjs';
import {nativePostFrameBoundaries} from './native-post-frame-replay.mjs';
import {extendNativeFrameGeometryComparison} from './native-frame-replay.mjs';
import {queryRawRespawnPlacement} from '../../src/raw-respawn-query.mjs';
import {applyRawRespawn} from '../../src/raw-respawn-state.mjs';
import {nativeMemoryAddress} from '../../src/native-memory-spans.mjs';
import {verifyNativeRecoveryParentBoundaries} from './native-recovery-parent-replay.mjs';
import {createCapturedMemory} from './captured-memory.mjs';
import {firstByteDivergence} from './native-body-replay.mjs';
const uint=(v,label)=>{v=Number(v);if(!Number.isSafeInteger(v)||v<0||v>0xffffffff)throw Error(`Invalid recovery leaf ${label}.`);return v;};
export function recoveryLeafPolicy(stage){
 if(!['query','apply'].includes(stage))throw Error('Recovery leaf stage must be query or apply.');
 return {...nativePostFrameBoundaries[stage],stage,argumentWords:stage==='query'?4:5,stackBytesAfter:stage==='query'?20:24};
}
export function replayNativeRecoveryLeaf(stage,snapshot,options={}){
 let replayStage='recovery-leaf-policy';
 try{
  const policy=recoveryLeafPolicy(stage),stackBytesAfter=options.stackBytesAfter??policy.stackBytesAfter;
  if(!Number.isSafeInteger(stackBytesAfter)||stackBytesAfter<policy.stackBytesAfter)throw Error('Recovery leaf requires its complete actual stack argument words.');
  replayStage='recovery-context';const bound=bindCapturedNativeRecovery(snapshot,{...options,stackBytesAfter}),{memory:m,manifest,geometry}=bound,E=uint(snapshot.registers?.esp,'entry ESP'),actual=preferred=>manifest.moduleBaseAddress+preferred-0x400000;
  if(uint(snapshot.registers?.eip,'entry EIP')!==actual(policy.entry)||m.readUInt32LE(E)!==actual(policy.returnAddress))throw Error('Recovery leaf entry/caller differs from its actual47ccc0 call.');
  const body=uint(snapshot.registers?.ecx,'body'),position=uint(snapshot.registers?.edx,'position'),args=Array.from({length:policy.argumentWords},(_,i)=>m.readUInt32LE(E+4+i*4)),observations=new Map();
  const add=(address,length,evidence)=>{if(!length)return;const bytes=m.subarray(address,address+length),native=nativeMemoryAddress(m,bytes);if(native===null)throw Error('Recovery leaf structure lacks actual native memory ownership.');observations.set(`${native}:${length}`,{id:`native-recovery-leaf-${native.toString(16)}-${length.toString(16)}`,address:native,length,comparison:'mutable',evidence});};
  bound.views.bodyAt(body);replayStage='recovery-leaf-input-coverage';add(position,12,'Actual leaf EDX position span, possibly aliased with body or stack.');
  const[quaternion,rotation]=args;if(stage==='apply'||quaternion){add(quaternion,16,'Actual leaf quaternion argument.');add(rotation,18,'Actual leaf rotation argument, writable492720 output in query.');}
  const input={bodyAddress:body,positionAddress:position,quaternionAddress:quaternion,rotationAddress:rotation,stackArguments:args,entryEsp:E,returnAddress:m.readUInt32LE(E)};
  function observeApply(){
   if((m.readUInt32LE(body)&511)!==3)return;
   const route=args[2];add(route,12,'Actual47d440 route argument, with native route id byte+5.');
   const vehicle=m.readUInt16LE(body+0x65e);if(vehicle>=6)throw Error('Recovery leaf participant exceeds the six captured records.');
   const controller=m.readUInt32LE(0x909318+vehicle*0x30c);if(controller!==0x12345678)add(controller,0x3a,'47d440 actual participant controller through byte39.');
   const mode=m[m.readUInt32LE(0x5ecb1c)+0x551];if(mode===3||mode===8)return;
   const pack=m.readUInt32LE(0x90b98c),count=m[pack+0x44],ids=m.readUInt32LE(pack+0x90);add(ids,count*4,'44a2e0 actual checkpoint ID groups.');
   let maximum=-1;for(let i=0;i<count*4;i++)if(m[ids+i]!==255)maximum=Math.max(maximum,m[ids+i]);add(m.readUInt32LE(pack+0x70),(maximum+1)*20,'44a2e0 actual checkpoint backing derived from captured IDs.');
  }
  let expectedEax,expectedExit;
  if(stage==='query'){
   const output=args[3];add(output,4,'Actual47d040 output reference, compared even when it aliases ABI scratch.');replayStage='recovery-query';expectedEax=queryRawRespawnPlacement(body,position,quaternion,rotation,args[2]|0,output,bound.runtime);expectedExit=m.readInt8(bound.cloneAddress+0x10c)<0?policy.exits[1]:policy.exits[0];
  }else{
   observeApply();replayStage='recovery-apply';applyRawRespawn(body,position,quaternion,rotation,args[2],args[3]|0,args[4]|0,bound.runtime);observeApply();expectedExit=m.readUInt32LE(body+4)?policy.exits[1]:policy.exits[0];
  }
  replayStage='recovery-leaf-output-coverage';extendNativeFrameGeometryComparison(manifest,[...geometry.comparisonRegions,...observations.values()]);manifest.boundary=`0x${policy.entry.toString(16)}`;manifest.caller=`0x${policy.caller.toString(16)}`;manifest.nativeReturnKind=stage==='query'?'EAX boolean placement acceptance':'void; volatile EAX/ECX/EDX/EFLAGS are not gameplay return values';
  return {...bound,report:{stage:`recovery-${stage}`,input,...(expectedEax===undefined?{}:{expectedEax}),expectedExit:actual(expectedExit),registersCompared:[...(stage==='query'?['eax']:[]),'ebx','ebp','esi','edi','esp'],nativeReturnKind:manifest.nativeReturnKind,limits:['Complete declared semantic spans plus query output and actual reached geometry/progression/controller spans are compared.','Private ABI scratch and volatile registers are excluded except query EAX and the explicitly declared query output.','No native route, placement, quaternion, progression answer or no-op game callee is injected.']}};
 }catch(error){error.replayStage=replayStage;throw error;}
}
export function compareNativeRecoveryLeafPair(stage,pair,replay){
 const policy=recoveryLeafPolicy(stage),base=pair.moduleBaseAddress??replay.manifest.moduleBaseAddress,actual=v=>base+v-0x400000,before=pair.before,after=pair.after,E=uint(before.registers?.esp,'entry ESP'),nativeExit=uint(after.registers?.eip,'exit EIP');
 if(before.tid!==after.tid||uint(after.registers?.esp,'exit ESP')!==E||uint(before.registers?.eip,'entry EIP')!==actual(policy.entry)||!policy.exits.map(actual).includes(nativeExit))throw Error('Recovery leaf pair has a different thread/ESP/entry/preRET.');
 const nativeBefore=createCapturedMemory([...before.ranges.values()]),nativeAfter=createCapturedMemory([...after.ranges.values()]);
 if(nativeBefore.memory.readUInt32LE(E)!==actual(policy.returnAddress)||nativeAfter.memory.readUInt32LE(E)!==actual(policy.returnAddress))throw Error('Recovery leaf pair caller return differs.');
 const comparisons=replay.manifest.requiredRegions.filter(row=>row.comparison!=='abi-input').map(row=>{const expected=nativeAfter.span(row.address,row.length),divergence=firstByteDivergence(expected,replay.span(row.address,row.length)),readOnlyDivergence=row.comparison==='read-only'?firstByteDivergence(nativeBefore.span(row.address,row.length),expected):null;return {...row,matched:!divergence&&!readOnlyDivergence,divergence,readOnlyDivergence};});
 if(!comparisons.length)throw Error('Recovery leaf comparison requires complete semantic manifest regions.');
 const registers=replay.report.registersCompared.map(name=>{const expected=name==='eax'?replay.report.expectedEax:uint(before.registers[name],`incoming ${name}`),actualValue=uint(after.registers[name],`outgoing ${name}`);return {name,expected,actual:actualValue,matched:expected===actualValue};}),exit={expected:replay.report.expectedExit,actual:nativeExit,matched:replay.report.expectedExit===nativeExit};
 return {matched:comparisons.every(row=>row.matched)&&registers.every(row=>row.matched)&&exit.matched,comparedBytes:comparisons.reduce((sum,row)=>sum+row.length,0),comparisons,registers,exit,nativeReturnKind:replay.report.nativeReturnKind,firstDivergence:comparisons.find(row=>!row.matched)??registers.find(row=>!row.matched)??(!exit.matched?{kind:'preRET-branch',...exit}:null),sourceReport:replay.report};
}
export {verifyNativeRecoveryParentBoundaries as verifyNativeRecoveryLeafBoundaries};
