//Continue the carried450e50 prefix+physics state. Native after snapshots are
//never inputs. No constructor, allocator, default table or child answer runs.
import {createNativeFrameMemory as createCapturedMemory} from './native-frame-memory.mjs';
import {nativeSourceCarriedRanges} from './native-source-carried-ranges.mjs';
import {assertNativeParentWeatherCounterService} from './native-parent-weather-counter.mjs';
import {nativeParentTailModuleRegions,nativeParentTailAdditionalRegions} from './native-parent-tail-inputs.mjs';
import {nativeParentLateModuleRegions,nativeParentLateObservedInputRegions} from './native-parent-late-inputs.mjs';
import {mergeNativeDriveModuleAliases,executeNativeDriveContinuation} from './native-frame-drive-continuation.mjs';
import {createNativeFrameContext,extendNativeFrameGeometryComparison,extendNativeFrameSoundComparison} from './native-frame-replay.mjs';
import {createNativeFrameGeometry} from './native-frame-geometry.mjs';
import {createNativeFrameSoundBindings,bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';
import {createNativeRecoveryContext} from './native-recovery-context.mjs';
import {nativeCodeAddress,nativeMemorySpan,copyToNativeMemory} from '../../src/native-memory-spans.mjs';
import {updateRawBodyAttachments} from '../../src/body-attachments.mjs';
import {runRawPostFrameBodyStates} from '../../src/raw-respawn-state.mjs';
import {prepareVehicleWheelRender} from '../../src/wheel-render-state.mjs';
import {updateVehicleAuxiliaryAnimation} from '../../src/vehicle-auxiliary-animation.mjs';
import {updateVehicleAnimationLights} from '../../src/vehicle-animation-lights.mjs';
import {advanceRawBodyDebris,advanceRawEffectParticles} from '../../src/particle-lifetime.mjs';
import {getRaceStageCount} from '../../src/race-stage-count.mjs';
import {updateCamera} from '../../src/camera-update.mjs';
import {updateWeather} from '../../src/weather-update.mjs';
import {updatePlacedModelContactEffects} from '../../src/placed-model-effect-update.mjs';
import {updateVehicleGroundProjection} from '../../src/vehicle-ground-projection.mjs';
import {updateModelContactFragments} from '../../src/model-contact-effects.mjs';
import {updateVehicleWheelHistories} from '../../src/vehicle-wheel-histories.mjs';
import {updateVehicleOverlayGrids} from '../../src/vehicle-overlay-grid.mjs';
import {updateTerrainPointAnimation} from '../../src/terrain-point-animation.mjs';
import {updatePlacedObjectDestruction} from '../../src/placed-object-destruction.mjs';
import {maintainWorldFragments} from '../../src/world-fragment-registry.mjs';
import {updateRawPersistentEmitters,updateRawAttachmentEffects} from '../../src/attachment-effects.mjs';
import {updateDynamicLights} from '../../src/dynamic-light-state.mjs';
import {updateVehicleSurfaceFeedback} from '../../src/vehicle-surface-feedback.mjs';
import {updateRaceAudioListeners} from '../../src/race-phase-audio.mjs';
import {setSoundManagerMasterLevel} from '../../src/sound-manager-level.mjs';
import {updateRacePhaseState} from '../../src/race-phase-state.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';
import {assertNativeParentRttiService} from './native-parent-rtti.mjs';
import {nativeParentFinalSourceRegions} from './native-parent-final-inputs.mjs';

export async function verifyNativeParentTailEvidence(){
  const {evidence,instructions}=await readInstructionEvidence(['310-race-step-parent-assembly.json','084-attachment-update-assembly.json','098-post-frame-body-states-assembly.json'],{directory:'analysis/native-simulation/results'});
  if(evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Native parent-tail target SHA differs.');
  const listing=new Map(instructions.map(row=>[row.address,row]));
  for(const [address,op,args]of [[0x451017,'CALL',['0x0044f050']],[0x45101c,'CALL',['0x0047ccc0']],[0x451038,'CALL',['0x00443d90']],[0x45103f,'CALL',['0x0048d680']],[0x45108d,'CALL',['0x0049ac30']],[0x451092,'CALL',['0x0048d7c0']],[0x451097,'CALL',['0x00469fd0']],
    [0x4510c2,'CALL',['0x0041d2b0']],[0x4510c9,'CALL',['0x00416400']],[0x4510e5,'CALL',['0x0048e310']],[0x4510ea,'CALL',['0x00475e50']],[0x451102,'CALL',['0x004180a0']],[0x451108,'CALL',['0x0041bef0']],[0x451111,'CALL',['0x00496700']],[0x451116,'CALL',['0x00414060']],[0x45111b,'CALL',['0x00438550']],
    [0x44f354,'RET',[]],[0x44f39a,'RET',[]],[0x47d02d,'RET',[]],[0x451208,'RET',[]]]){
    const row=listing.get(address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Native parent-tail boundary differs at0x${address.toString(16)}.`);
  }
  return {targetSha256:REDUX_SHA256,evidenceIds:evidence.map(row=>row.evidence_id)};
}

export async function verifyNativeParentReturnEvidence(){
  const parent=await readInstructionEvidence(['310-race-step-parent-assembly.json'],{directory:'analysis/native-simulation/results'});
  const caller=await readInstructionEvidence(['001-frame-parent.json'],{directory:'analysis/physics-clock-elevated-20261022/results'});
  const evidence=[...parent.evidence,...caller.evidence],listing=new Map([...parent.instructions,...caller.instructions].map(row=>[row.address,row]));
  if(evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Native parent-return target SHA differs.');
  for(const[address,op,args]of [
    [0x4511d8,'PUSH',['dword ptr [0x005ecdb8]']],[0x4511e0,'CALL',['dword ptr [EAX + 0x5c]']],[0x4511e3,'CALL',['0x0047f370']],
    [0x4511e8,'TEST',['EAX','EAX']],[0x4511ea,'JZ',['0x004511f3']],[0x4511ec,'XOR',['EAX','EAX']],
    [0x4511ee,'POP',['EDI']],[0x4511ef,'POP',['ESI']],[0x4511f0,'POP',['EBP']],[0x4511f1,'POP',['EBX']],[0x4511f2,'RET',[]],
    [0x4511f3,'INC',['dword ptr [0x0090a548]']],[0x4511f9,'MOV',['EAX','0x1']],[0x4511fe,'INC',['dword ptr [0x006e675c]']],
    [0x451204,'POP',['EDI']],[0x451205,'POP',['ESI']],[0x451206,'POP',['EBP']],[0x451207,'POP',['EBX']],[0x451208,'RET',[]],
    [0x450e30,'PUSH',['EDI']],[0x450e31,'MOV',['EDX','ESI']],[0x450e33,'CALL',['0x00450e50']],
    [0x450e38,'MOV',['EBX','EAX']],[0x450e3a,'ADD',['ESP','0x4']],[0x450e3d,'TEST',['EBX','EBX']]
  ]){const row=listing.get(address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Native parent-return boundary differs at0x${address.toString(16)}.`);}
  return {targetSha256:REDUX_SHA256,evidenceIds:evidence.map(row=>row.evidence_id)};
}

function contract(source){
  const S=source?.prefixReport?.childEsp,base=source?.manifest?.moduleBaseAddress;
  if(!Buffer.isBuffer(source?.memory)||typeof source.span!=='function'||!Number.isSafeInteger(base)||!Number.isSafeInteger(S)||S<4||source.report?.childEsp!==S||source.prefixReport.entryEsp!==S+20||Number(source.derivedPhysicsRegisters?.registers?.esp)!==S)throw Error('Parent tail requires the completed source-carried prefix/physics and its derived shared ESP.');
  for(const name of ['ebx','ebp']){const value=source.derivedPhysicsRegisters.registers[name];if(!Number.isInteger(value)||value<0||value>0xffffffff)throw Error(`Parent tail requires source-derived preserved${name}.`);}
  return {S,base};
}

//All copies come from live SOURCE bytes. Metadata identifies the original
//observation footprint only; additional image aliases require actualcoverage.
export function bindNativeParentTail(source,{snapshot,includeLateInputs=false,finalTickInput=false}={}){
  if(typeof finalTickInput!=='boolean')throw Error('Parent final-tick input admission must be explicitly boolean.');
  const {S,base}=contract(source),rows=snapshot?.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot?.ranges;
  if(!Array.isArray(rows))throw Error('Parent tail requires original entry observation roots, never a native after snapshot.');
  if(Number(snapshot.registers?.esp)!==source.prefixReport.entryEsp||Number(snapshot.registers?.eip)!==nativeCodeAddress(0x450e50,{moduleBaseAddress:base}))throw Error('Parent-tail observation metadata must identify450e50 entry.');
  //Only original entry inputs identify the caller/nonvolatile provenance.
  //executeNativeControlPrefix already produced the four PUSH stores. Never
  //rewrite those live carried saves here, even when a later child changed one.
  const original=createCapturedMemory(rows),U=source.prefixReport.entryEsp,entryRegisters={};
  for(const name of ['ebx','ebp','esi','edi']){
    const value=Number(snapshot.registers[name]);if(!Number.isInteger(value)||value<0||value>0xffffffff)throw Error(`Parent-tail entry requires original ${name}.`);
    entryRegisters[name]=value;
  }
  const parentEntryAbi=Object.freeze({entryEsp:U,returnAddress:original.memory.readUInt32LE(U),totalIterations:original.memory.readInt32LE(U+4),registers:Object.freeze(entryRegisters)});
  const current={...snapshot,ranges:nativeSourceCarriedRanges(rows,source)};
  const additional=[...nativeParentTailAdditionalRegions(current,{moduleBaseAddress:base,additionalRegions:source.manifest.requiredRegions}),...(includeLateInputs?nativeParentLateObservedInputRegions(current,base):[])];
  const manifest={...source.manifest,requiredRegions:source.manifest.requiredRegions.map(row=>({...row})),aliases:mergeNativeDriveModuleAliases([...source.manifest.aliases,...additional.map(row=>({address:row.preferredAddress,targetAddress:row.address,length:row.length}))],base)};
  extendNativeFrameSoundComparison(manifest,additional);
  //The source must restore the original parent SEH head. Authenticate the
  //original observation against carried memory, never relabel source bytes
  //as a newly observed native thread environment.
  const captured=createCapturedMemory(current.ranges,{aliases:manifest.aliases}),geometry=createNativeFrameGeometry({memory:captured.memory}),threadEnvironment=bindCapturedNativeThreadEnvironment(snapshot,{memory:captured.memory}),sound=createNativeFrameSoundBindings({memory:captured.memory,moduleBaseAddress:base,numericalContext:source.numericalContext,nativeTls:threadEnvironment.nativeTls}),bound=createNativeFrameContext({memory:captured.memory,manifest,geometry,numericalContext:source.numericalContext,sound});
  const parentFinalInput=finalTickInput?Object.freeze({snapshot,moduleBaseAddress:base,entryEsp:U}):null;
  return {...source,...captured,...bound,manifest,sound,threadEnvironment,physicsReport:source.report,report:{childEsp:S},tailAdditionalRegions:additional,parentEntryAbi,parentFinalInput};
}

//4511e8..451208. The phase EAX is computed by genuine47f370 in the caller.
//Pops and RET read LIVE source words; the original metadata is provenance,
//never a replacement for carried saves, the return word or stack argument.
export function completeNativeParentReturn(source,phaseEax){
  const {S,base}=contract(source),U=S+20,entry=source.parentEntryAbi,m=source.memory;
  if(!entry||!Object.isFrozen(entry)||!Object.isFrozen(entry.registers)||entry.entryEsp!==U
    ||!Number.isInteger(entry.totalIterations)||entry.totalIterations!==source.prefixReport.totalIterations
    ||entry.returnAddress!==nativeCodeAddress(0x450e38,{moduleBaseAddress:base}))throw Error('Parent return requires immutable original450e50 caller/argument provenance.');
  for(const name of ['ebx','ebp','esi','edi'])if(!Number.isInteger(entry.registers[name])||entry.registers[name]<0||entry.registers[name]>0xffffffff)throw Error(`Parent return requires original ${name} provenance.`);
  if(!Number.isInteger(phaseEax)||phaseEax< -0x80000000||phaseEax>0xffffffff)throw Error('Parent return requires genuine x86 phase EAX.');
  const eax=(phaseEax>>>0)!==0?0:1;
  if(eax){m.writeInt32LE((m.readInt32LE(0x90a548)+1)|0,0x90a548);m.writeInt32LE((m.readInt32LE(0x6e675c)+1)|0,0x6e675c);}
  const registers={eax,edi:m.readUInt32LE(U-16),esi:m.readUInt32LE(U-12),ebp:m.readUInt32LE(U-8),ebx:m.readUInt32LE(U-4),esp:U+4,eip:m.readUInt32LE(U)};
  const result={parentPreRetReached:true,parentPreRet:eax?0x451208:0x4511f2,parentPreRetAddress:nativeCodeAddress(eax?0x451208:0x4511f2,{moduleBaseAddress:base}),parentPreRetEsp:U,sourceEax:eax,
    parentReturned:false,parentReturn:Object.freeze({entryEsp:U,registers:Object.freeze(registers),stackArgumentAddress:U+4,totalIterations:m.readInt32LE(U+4),cdeclArgumentBytes:4,callerCleanupPending:true})};
  if(registers.eip!==entry.returnAddress){const error=Error('Parent RET reached a changed live caller word instead of authenticated450e38.');error.nativeParentReturn=result;throw error;}
  return {...result,parentReturned:true,parentCheckpointEsp:U+4};
}

//4511d2..4511e3. PUSH precedes the live vtable load. The source method sees
//S-4 as its entry ESP, with the raw float DWORD atS, not a numeric conversion.
export function setNativeParentMasterLevelOnStack(source){
  const {S,base}=contract(source),m=source.memory,manager=m.readUInt32LE(0x714b08),bits=m.readInt32LE(0x5ecdb8);
  m.writeInt32LE(bits,S);
  const target=m.readUInt32LE(m.readUInt32LE(manager)+0x5c),returnAddress=nativeCodeAddress(0x4511e3,{moduleBaseAddress:base});
  m.writeUInt32LE(returnAddress,S-4);
  if(target!==nativeCodeAddress(0x4a90e0,{moduleBaseAddress:base}))throw Error('Unclassified actual SoundManager master-level target.');
  setSoundManagerMasterLevel(manager,bits,{memory:m,moduleBaseAddress:base,scratchBase:S-4});
  return {manager,bits:bits>>>0,target,entryEsp:S-4,returnAddress};
}

//The ordinary parent does not need a clone/checkpoint/audio allocation. A
//real reached clone body or progression access activates the existing complete
//recovery context. Proxy methods expose actual views, never substitute answers.
function lazyRecovery(source,S){
  const {memory,manifest,geometry,numericalContext}=source,clone=manifest.moduleBaseAddress+0x30f130;
  let full;const ensure=()=>full??=createNativeRecoveryContext({memory,manifest,geometry,entryEsp:S,numericalContext,soundRuntime:source.sound.soundRuntime});
  const views=new Proxy(source.views,{get(target,key){
    if(key==='bodyAt')return address=>{if(address===clone||address===0x70f130)return ensure().views.bodyAt(address);return (full?.views??target).bodyAt(address);};
    return Reflect.get(full?.views??target,key);
  }});
  const progression={memory,recordAt:address=>ensure().progression.recordAt(address),get runtime(){return ensure().progression.runtime;}};
  const nativeRecoveryAudio={...source.sound,moduleBaseAddress:manifest.moduleBaseAddress,numericalContext,nativeTls:source.threadEnvironment?.nativeTls};
  return {runtime:{memory,views,grid:geometry.grid,models:geometry.modelContext,modelPointersFor:geometry.candidateMapping.modelPointersFor,scratchBase:S,roundingMode:'nearest-even',x87PrecisionBits:24,progression,soundRuntime:source.sound.soundRuntime,nativeRecoveryAudio},get initialized(){return full!==undefined;}};
}

//The reached4180a0 sprintf format only. This is a real typed CRT operation,
//not a supplied camera pose, viewport object, game-child result or initializer.
export function formatNativeParentCameraName(memory,output,format,index){
  const text=nativeMemorySpan(memory,format,10);
  if(!text.equals(Buffer.from('%d Player\0','ascii')))throw Error('Native camera formatter requires its observed %d Player format.');
  if(!Number.isInteger(index)||index<-2147483648||index>2147483647)throw Error('Native camera formatter requires a signed32 argument.');
  const bytes=Buffer.from(`${index} Player\0`,'ascii');copyToNativeMemory(memory,output,bytes);return bytes.length-1;
}

export function executeNativeParentTail(source,{onStage,through='drive',crtDynamicCast,weatherCounterService}={}){
  const {S,base}=contract(source);if(!['attachments','recovery','drive','auxiliary','cameras','world-effects','parent-return'].includes(through))throw Error('Unknown requested parent-tail boundary.');if(onStage!==undefined&&typeof onStage!=='function')throw Error('Parent-tail stage observer must be a function.');
  if(crtDynamicCast!==undefined)assertNativeParentRttiService(crtDynamicCast);
  if(weatherCounterService!==undefined)assertNativeParentWeatherCounterService(weatherCounterService);
  const {memory:m}=source,ptr=p=>m.readUInt32LE(p),get=p=>m.readInt32LE(p),put=(p,v)=>m.writeInt32LE(v|0,p),stages=[],calls=[],progress={scope:through,stage:'attachments',childEsp:S,parentCheckpointEsp:S+4,stages,calls,parentPreRetReached:false,parentReturned:false,parentReturn:null};
  const admitFinal=stage=>{
    const input=source.parentFinalInput;if(!input)return;
    if(!Object.isFrozen(input)||input.moduleBaseAddress!==base||input.entryEsp!==S+20||Number(input.snapshot?.registers?.esp)!==input.entryEsp)throw Error('Final stage admission requires the unchanged original parent argument/frame identity.');
    const regions=nativeParentFinalSourceRegions(input.snapshot,{moduleBaseAddress:base,stage,memory:m});
    for(const row of regions)source.span(row.address,row.length);
    extendNativeFrameGeometryComparison(source.manifest,regions);
    (progress.finalInputAdmissions??=[]).push({stage,originalOrdinal:input.snapshot.ordinal,regionIds:regions.map(row=>row.id)});
  };
  const runtime={memory:m,moduleBaseAddress:base,scratchBase:S,numericalContext:source.numericalContext,roundingMode:'nearest-even',x87PrecisionBits:24,views:source.views,grid:source.geometry.grid,models:source.geometry.modelContext,modelPointersFor:source.geometry.candidateMapping.modelPointersFor,soundRuntime:source.sound.soundRuntime,
    nativeWeatherCounterCalls:weatherCounterService!==undefined,...(weatherCounterService?{services:{platformCall:weatherCounterService}}:{}),
    handlers:{formatCameraName:(output,format,index)=>formatNativeParentCameraName(m,output,format,index),...(crtDynamicCast?{dynamicCast:crtDynamicCast}:{})}};
  const publishReturn=p=>m.writeUInt32LE(nativeCodeAddress(p,{moduleBaseAddress:base}),S);
  const observe=(stage,entry,returnAddress,report)=>{
    extendNativeFrameGeometryComparison(source.manifest,source.geometry.comparisonRegions??[]);extendNativeFrameSoundComparison(source.manifest,[...(source.sound.comparisonRegions??[]),...(source.threadEnvironment?.comparisonRegions??[])]);
    const entryEsp=stage==='parent-return'?source.prefixReport.entryEsp:S;
    stages.push({stage,entry,returnAddress:nativeCodeAddress(returnAddress,{moduleBaseAddress:base}),entryEsp,report});source.report={...progress,childEsp:S};onStage?.(Object.freeze({stage,source,entry,returnAddress:nativeCodeAddress(returnAddress,{moduleBaseAddress:base}),entryEsp,report}));
  };
  const call=(entry,returnAddress,fn)=>{publishReturn(returnAddress);calls.push({entry,entryEsp:S,returnAddress:nativeCodeAddress(returnAddress,{moduleBaseAddress:base})});return fn();};
  try{
    const attached=call(0x44f050,0x45101c,()=>updateRawBodyAttachments(runtime));observe('attachments',0x44f050,0x45101c,attached);if(through==='attachments')return {...source,report:{...progress,completed:true}};
    progress.stage='recovery';const recovery=lazyRecovery(source,S),recovered=call(0x47ccc0,0x451021,()=>runRawPostFrameBodyStates(recovery.runtime));observe('recovery',0x47ccc0,0x451021,{...recovered,fullRecoveryContextReached:recovery.initialized});if(through==='recovery')return {...source,report:{...progress,completed:true}};
    progress.stage='drive';const registers={...source.derivedPhysicsRegisters.registers,esp:S},drive=executeNativeDriveContinuation({source,pair:{before:{registers},after:{registers}}});observe('drive',0x469fd0,0x45109c,drive);if(through==='drive')return {...source,report:{...progress,completed:true}};
    progress.stage='render-and-late-state';let session=ptr(0x5ecb1c);if(get(session+0x57c)<4)put(0x712fbc,get(0x712fbc)+1);
    for(let i=0;i<m[session+0x54d];i++){const record=0x909300+i*0x30c;call(0x41d2b0,0x4510c7,()=>prepareVehicleWheelRender(ptr(record),runtime));call(0x416400,0x4510ce,()=>updateVehicleAuxiliaryAnimation(record,runtime));session=ptr(0x5ecb1c);}
    call(0x48e310,0x4510ea,()=>updateVehicleAnimationLights(runtime));call(0x475e50,0x4510ef,()=>advanceRawBodyDebris(runtime));observe('auxiliary',0x475e50,0x4510ef,{participants:m[ptr(0x5ecb1c)+0x54d]});if(through==='auxiliary')return {...source,report:{...progress,completed:true}};
    //417d70 reaches the same47d040 temporary clone as recovery. It is
    //declared module storage, not a body registered in the physical arena.
    const cameraRuntime={...runtime,views:recovery.runtime.views};
    let index=0,limit=call(0x41bef0,0x4510f6,()=>getRaceStageCount(runtime));while(index<limit){call(0x4180a0,0x451107,()=>updateCamera(index,cameraRuntime));index++;limit=call(0x41bef0,0x45110d,()=>getRaceStageCount(runtime));}
    observe('cameras',0x41bef0,0x45110d,{cameras:index});if(through==='cameras')return {...source,report:{...progress,completed:true}};
    for(const [entry,returned,fn]of [[0x496700,0x451116,updateWeather],[0x414060,0x45111b,updatePlacedModelContactEffects],[0x438550,0x451120,advanceRawEffectParticles]])call(entry,returned,()=>fn(runtime));
    observe('world-effects',0x438550,0x451120,{});if(through==='world-effects')return {...source,report:{...progress,completed:true}};
    const countdown=get(0x6fb9a4);if(countdown){const next=countdown+1|0;put(0x6fb9a4,next>32?0:next);}
    for(const [entry,returned,fn]of [[0x481200,0x45113c,updateVehicleGroundProjection],[0x48edb0,0x451141,updateModelContactFragments],[0x494140,0x451146,updateVehicleWheelHistories],[0x487540,0x45114b,updateVehicleOverlayGrids],[0x44a7a0,0x451150,updateTerrainPointAnimation],[0x415230,0x451155,updatePlacedObjectDestruction],[0x480e90,0x45115a,maintainWorldFragments],[0x44f990,0x45115f,updateRawPersistentEmitters],[0x44f3a0,0x451164,updateRawAttachmentEffects]])call(entry,returned,()=>fn(runtime));
    const final=(source.prefixReport.iteration|0)===((get(source.prefixReport.entryEsp+4)-1)|0);call(0x44d960,final?0x451174:0x451185,()=>{admitFinal('lights');return updateDynamicLights(final?0:1,runtime);});if(final)call(0x42b530,0x451179,()=>updateVehicleSurfaceFeedback(runtime));
    const mirrored=m[ptr(0x5ecb1c)+0x58b]!==0;put(0x5ecdb4,mirrored?0xb5800000:0x35800000);put(0x5ecdb0,mirrored?0xb7f00000:0x37f00000);put(0x6e6bd4,get(ptr(0x5ecefc)+0x404));call(0x484880,0x4511d2,()=>{admitFinal('listeners');return updateRaceAudioListeners(runtime);});
    admitFinal('manager');setNativeParentMasterLevelOnStack(source);
    const phase=call(0x47f370,0x4511e8,()=>updateRacePhaseState(runtime)),value=typeof phase==='number'?phase:phase?.eax;
    progress.stage='parent-return';
    Object.assign(progress,completeNativeParentReturn(source,value));
    observe('parent-return',0x450e50,0x450e38,{eax:progress.sourceEax,clock:get(0x90a548),parentReturn:progress.parentReturn});return {...source,report:{...progress,completed:true}};
  }catch(error){
    error.nativeParentTailProgress={...progress,lastCall:calls.at(-1)};const match=/Uncaptured native memory at 0x([0-9a-f]+) \((\d+) bytes\)/.exec(error.message);
    if(match){const address=parseInt(match[1],16),region=[...nativeParentTailModuleRegions,...nativeParentLateModuleRegions].find(row=>address>=row.preferredAddress&&address<row.preferredAddress+row.length);error.nativeParentTailDependency={address,length:Number(match[2]),...(region?{preferredAddress:address,actualModuleAddress:base+address-0x400000,region:region.id}:{})};}
    const global=/^Unobserved native global operand0x([0-9a-f]+)\.$/.exec(error.message);
    if(global){const address=parseInt(global[1],16),region=[...nativeParentTailModuleRegions,...nativeParentLateModuleRegions].find(row=>address>=row.preferredAddress&&address<row.preferredAddress+row.length);error.nativeParentTailDependency={address,preferredAddress:address,actualModuleAddress:base+address-0x400000,length:null,kind:'fixed-global-route',...(region?{region:region.id}:{})};}
    throw error;
  }
}

export function continueNativeParentTail(source,{snapshot,onStage,through='drive',finalTickInput=false}={}){
  return executeNativeParentTail(bindNativeParentTail(source,{snapshot,includeLateInputs:!['attachments','recovery','drive'].includes(through),finalTickInput}),{onStage,through});
}
