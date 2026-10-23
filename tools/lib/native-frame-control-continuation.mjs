//450e50 entry ->4749e0 entry. Bind captured state; never initialize AI tables,
//construct a controller, poll the host, or inject an observed control answer.
import {runRaceUpdate} from '../../src/race-update.mjs';
import {runAutonomousDispatch} from '../../src/autonomous-dispatch.mjs';
import {updateAutonomousRouteControl} from '../../src/autonomous-route-control.mjs';
import {updateVehicleAudio} from '../../src/vehicle-audio.mjs';
import {updateVehicleInputBlock, copyLinkedVehicleControls, updateVehicleControlState} from '../../src/vehicle-control-state.mjs';
import {updateVehicleAuxiliaryInput} from '../../src/vehicle-auxiliary-input.mjs';
import {updateTrackDeformation} from '../../src/track-deformation.mjs';
import {updateRaceObjects} from '../../src/race-object-update.mjs';
import {runRaceProgressPass} from '../../src/race-progress-pass.mjs';
import {updateRaceHandlingScale} from '../../src/race-handling-scale.mjs';
import {populateRawVehicleTrackBasis} from '../../src/raw-track-basis.mjs';
import {createCapturedMemory} from './captured-memory.mjs';
import {buildNativeFrameManifest, nativeFrameGlobalRegions} from './native-frame-manifest.mjs';
import {createNativeFrameGeometry} from './native-frame-geometry.mjs';
import {createNativeFrameContext, extendNativeFrameGeometryComparison, extendNativeFrameSoundComparison} from './native-frame-replay.mjs';
import {bindCapturedNativeThreadEnvironment, createNativeFrameSoundBindings} from './native-frame-sound.mjs';
import {mergeNativeDriveModuleAliases, nativeFrameDriveInputRegions} from './native-frame-drive-continuation.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import {resolveNativeMemoryAddress, nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';
import {createNativeFixedSqrtState} from '../../src/native-fixed-integer-state.mjs';
import audioTables from '../../src/vehicle-audio-tables.json' with {type: 'json'};
import {createNativeControlAudioBindings} from './native-control-audio.mjs';
import inputConstants from '../../src/vehicle-input-constants.json' with {type: 'json'};

//471250/433200/434360/434210 source access domains. The peer stride does
//not authorize capturing an invented whole peer allocation: expose the exact
//read fields,64 observed history records, and12-byte produced packet only.
const inputProof='471250 retained461 ev_8d6a18530198ebfa7c65f7f3a8562df4e31e15fac2bb9b8e595b124c12d98b0d;433200 retained465 ev_6e08e32b709ae96520d08b55f267f0bb5b7e1a7d22b27daadcf0aad913fb7371.';
export const nativeControlInputPacketRegions=Object.freeze([
  ...Array.from({length:6},(_,index)=>[
    {id:`control-input-packet-${index}`,preferredAddress:0x6e7edc+index*0x67c,length:12,comparison:'mutable'},
    {id:`control-input-peer-ready-${index}`,preferredAddress:0x6e7880+index*0x67c,length:4,comparison:'read-only'},
    {id:`control-input-current-sample-${index}`,preferredAddress:0x6e78b0+index*0x67c,length:8,comparison:'read-only'},
    {id:`control-input-history-${index}`,preferredAddress:0x6e7bd8+index*0x67c,length:64*12,comparison:'read-only'},
    {id:`control-input-peer-address-${index}`,preferredAddress:0x6e788c+index*0x67c,length:8,comparison:'read-only'},
  ]).flat(),
  ...Array.from({length:4},(_,index)=>({id:`control-input-local-sample-${index}`,preferredAddress:0x6e7ac4+index*0x67c,length:8,comparison:'read-only'})),
  {id:'control-input-history-clock',preferredAddress:0x6ea69c,length:4,comparison:'read-only'},
  {id:'control-input-sample-fallback',preferredAddress:0x5eb518,length:4,comparison:'read-only'},
  {id:'control-input-analog-initialized',preferredAddress:0x6e65b0,length:4,comparison:'mutable'},
  {id:'control-input-analog-table',preferredAddress:0x6fb740,length:129*4,comparison:'mutable'},
  {id:'control-input-replay-decode',preferredAddress:0x5706a0,length:16*2,comparison:'read-only'},
].map(row=>Object.freeze({...row,evidence:inputProof})));

const fixed = [
  ['pickup-probabilities',0x5704f8,8], ['weapon-thresholds',0x570540,0x70], ['pickup-shifts',0x5705b0,32],
  ['candidate-weights',0x5705d0,32], ['profile-thresholds',0x5705f0,16],
  ['object-fade-table',0x570600,96], ['object-effect-masks',0x570660,32],
  ['digital-throttle',0x570680,32], ['digital-brake',0x5706c0,16], ['digital-steering',0x5706d0,33],
  ['ai-rng-difficulty',0x5ea4d4,8], ['ai-shared-and-obstacle-counts',0x6e650e,0x16], ['ai-start-count',0x6e65a8,4],
  ['ai-route-queue-cursors',0x6e6cc0,8], ['ai-route-queue-points',0x80df20,40], ['ai-route-queue-groups',0x80df60,40],
  ['ai-route-visited',0x7136d0,128], ['ai-special-durations',0x91f1c0,20], ['ai-candidates',0x91f1e0,20*52],
  ['ai-special-points',0x91f600,20*8], ['ai-candidate-directions',0x6fb3a0,20*8],
  ['ai-nearby-body-distance',0x920ec0,36*4], ['ai-nearby-body-indices',0x920f60,36], ['ai-stage-difficulty',0x920f84,4],
  //Explicit capture observation of50rows, NOT an inferred native capacity.
  ['ai-obstacle-registry-observation',0x920b40,50*12], ['ai-obstacle-distance-observation',0x920da0,50*4], ['ai-obstacle-indices-observation',0x920e80,50],
  ['ai-obstacle-polygon-pointer-pool',0x6f95a0,60*4],
  ['world-fragment-registry-root',0x849a5c,4], ['input-selected-player',0x6e9f70,4], ['input-network-flags',0x6eafe0,4],
  ['input-clock',0x6e675c,4], ['display-flags',0x91ce90,4], ['deformation-root-count',0x80df00,8],
  ['coordinate-restoration-root-count',0x90b994,8], ['authored-controller-and-list',0x91e740,0x40],
  ['vehicle-audio-and-horn-records',0x713190,6*40+6*16], ['vehicle-audio-collision-state',0x5eced0,8], ['vehicle-boost-sound',0x6e6bdc,1],
  ['vehicle-reverb-input-scale',0x5dc8e0,4], ['vehicle-reverb-output-scale',0x5dc920,4],
  //42be80's optional native preset-chat branch and actual mode2 transport.
  ['notification-interface-root',0x6e6d10,4], ['notification-sequence',0x6e65db,1], ['notification-local-address',0x6e9f74,8],
  ['notification-address-default',0x5e8280,10], ['notification-socket-template',0x6f2424,20],
  ['notification-separator',0x5d049c,3], ['notification-history',0x6eaedc,4*65],
];
//Widths are source access domains, not newly inferred allocation capacities.
//The obstacle producer44cf99 appends without a capacity check. Its variable
//registry/distance/index rows are admitted separately from actual capturedcount.
export const nativeFrameControlInputRegions = Object.freeze([
  ...nativeFrameDriveInputRegions,
  ...nativeControlInputPacketRegions,
  ...fixed.map(([name,preferredAddress,length])=>({id:`control-${name}`,preferredAddress,length,comparison:'mutable',evidence:'450e50 prephysics source-owned module inputs;20 candidates,36 fragments,64 visited words and20 queue slots follow recovered loops.'})),
  ...audioTables.tables.map((row,index)=>({id:`control-audio-table-${index}`,preferredAddress:Number(row.address),length:Buffer.from(row.bytes_hex,'hex').length,comparison:'read-only',evidence:'485300 retained original table extents; actual observed bytes only, no table installation.'})),
  ...inputConstants.constants.map(row=>({id:`control-input-constant-${row.name}`,preferredAddress:Number(row.address),length:Buffer.from(row.bytes_hex,'hex').length,comparison:'read-only',evidence:inputConstants.evidence_id})),
].map(Object.freeze));

export const nativeControlPrefixCalls = Object.freeze([
  [0x410220,0x450ec0], [0x431750,0x450f00], [0x485300,0x450f39], [0x42a6e0,0x450f69], [0x42be80,0x450f70],
  [0x49bbc0,0x450f8d], [0x42a9a0,0x450fa7], [0x494f60,0x450fbe], [0x429f30,0x450fc3], [0x449640,0x45100d], [0x420500,0x451012],
].map(([entry,returnAddress])=>Object.freeze({entry,returnAddress})));

export async function verifyNativeControlPrefixEvidence() {
  const {evidence,instructions}=await readInstructionEvidence(['310-race-step-parent-assembly.json','273-vehicle-state-42a6e0-assembly.json','275-vehicle-state-42be80-assembly.json','277-vehicle-state-42a9a0-assembly.json','285-vehicle-state-49bbc0-assembly.json','199-race-progress-pass-assembly.json','126-checkpoint-transition-assembly.json'],{directory:'analysis/native-simulation/results'});
  if(evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Control prefix retained target SHA differs.');
  const listing=new Map(instructions.map(row=>[row.address,row]));
  for(const {entry,returnAddress} of nativeControlPrefixCalls){const row=listing.get(returnAddress-5);if(row?.op!=='CALL'||Number(row.args[0])!==entry)throw Error(`Control prefix retained call boundary differs at${returnAddress.toString(16)}.`);}
  if(listing.get(0x451012)?.op!=='CALL'||Number(listing.get(0x451012).args[0])!==0x4749e0)throw Error('Control prefix physics stop differs.');
  return {targetSha256:REDUX_SHA256,evidenceIds:evidence.map(row=>row.evidence_id)};
}

const rowsOf=snapshot=>snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
function baseOf(snapshot,requested){const values=new Set([requested,snapshot.moduleBaseAddress,...rowsOf(snapshot).map(row=>row.moduleBaseAddress)].filter(x=>x!==undefined&&x!==null).map(Number));if(values.size!==1)throw Error('Control prefix requires one observed module base.');return [...values][0];}
function difference(region,covered){let cursor=region.address;const end=cursor+region.length,result=[];for(const row of covered.toSorted((a,b)=>a.address-b.address)){if(row.address+row.length<=cursor||row.address>=end)continue;if(row.address>cursor)result.push({address:cursor,length:row.address-cursor});cursor=Math.max(cursor,row.address+row.length);}if(cursor<end)result.push({address:cursor,length:end-cursor});return result.map(part=>({...region,...part,id:`${region.id}-${part.address.toString(16)}`,preferredAddress:region.preferredAddress+part.address-region.address}));}

export function nativeControlAdditionalRegions(snapshot,options={}){
  const base=baseOf(snapshot,options.moduleBaseAddress),captured=createCapturedMemory(rowsOf(snapshot)),declared=[...nativeFrameGlobalRegions.map(row=>({...row,address:base+row.preferredAddress-0x400000,length:row.id==='attachment-queue'?options.attachmentWindowBytes??row.length:row.length})),...(options.additionalRegions??[])],result=[];
  for(const row of nativeFrameControlInputRegions){const address=base+row.preferredAddress-0x400000;try{captured.span(address,row.length);}catch{continue;}const additions=difference({...row,address},declared);result.push(...additions);declared.push(...additions);}
  return result;
}

//This discovery diagnostic intentionally executes410220 on an existing frame
//state. Its failure identifies missing actual bytes, NOT a correctly scheduled
//AI result; the original4749e0 boundaries occur after this tick's AI already.
export function probeNativeControlDependencies(source,{entryEsp}={}){
  const memory=source.memory,session=memory.readUInt32LE(0x5ecb1c),clock=memory.readUInt32LE(0x90a548),count=memory[session+0x54d],bodies=Array.from({length:count},(_,i)=>memory.readUInt32LE(0x909300+i*0x30c));
  const report={authority:'original-captured-inputs-with-mis-scheduled-source-dependency-probe',matched:false,clock,moduleBaseAddress:source.manifest.moduleBaseAddress,participantCount:count,modes:bodies.map(body=>memory[body+0x718]),phases:bodies.map(body=>memory[body+0x6d9]),completedCalls:[],limits:['This probe starts after native AI has already executed. It cannot establish AI parity, a next-clock transition or a closed carried trajectory.']};
  try{for(const body of bodies){if(memory[body+0x718]!==8)continue;runAutonomousDispatch(body,{memory,scratchBase:entryEsp});report.completedCalls.push({entry:'410220',body});}report.probeCompleted=true;}
  catch(error){report.failure=error.stack;const match=/Uncaptured native memory at 0x([0-9a-f]+) \((\d+) bytes\)/.exec(error.message);if(match){const preferredAddress=parseInt(match[1],16);report.missingInput={sourceAddress:preferredAddress,length:Number(match[2]),...(preferredAddress>=0x400000&&preferredAddress<0x940000?{actualModuleAddress:source.manifest.moduleBaseAddress+preferredAddress-0x400000}:{})};}}
  return report;
}

function progressionFor(source){
  const {memory,views}=source,ptr=p=>memory.readUInt32LE(p),records=new Map(),packs=new Map();
  const recordAt=address=>{address=resolveNativeMemoryAddress(memory,address,0x30c);const first=resolveNativeMemoryAddress(memory,0x909300,6*0x30c);if(address<first||(address-first)%0x30c||address+0x30c>first+6*0x30c)throw Error('Control progression record exceeds its captured six slots.');if(!records.has(address)){const record={address,bytes:memory.subarray(address,address+0x30c)};Object.defineProperty(record,'body00',{get:()=>views.bodyAt(ptr(address))});records.set(address,record);}return records.get(address);};
  const packAt=address=>{if(packs.has(address))return packs.get(address);const pack={address};Object.defineProperties(pack,{checkpointCount44:{get:()=>memory[address+0x44]},checkpointIds90:{get:()=>memory.subarray(ptr(address+0x90),ptr(address+0x90)+memory[address+0x44]*4)},checkpoints70:{get:()=>{let maximum=-1;for(const id of pack.checkpointIds90)if(id!==255)maximum=Math.max(maximum,id);return memory.subarray(ptr(address+0x70),ptr(address+0x70)+(maximum+1)*20);}}});packs.set(address,pack);return pack;};
  const runtime={memory};Object.defineProperties(runtime,{pack:{get:()=>packAt(ptr(0x90b98c))},session:{get:()=>({get mode579(){return memory[ptr(0x5ecb1c)+0x579];}})},clock90a548:{get:()=>memory.readInt32LE(0x90a548)}});return {memory,recordAt,runtime};
}

export {createNativeFixedSqrtState as createNativeControlNumericalState};

//Variable backing is bounded by the actual pointer/count/ID producers. These
//are native addresses, never installed-file offsets or invented spare capacity.
export function nativeControlStructureRegions(source,{phase='all'}={}){
  const {memory}=source,ptr=p=>memory.readUInt32LE(p),rows=[];
  const add=(id,address,length,comparison='read-only')=>{if(length===0)return;source.span(address,length);rows.push({id:`control-structure-${id}`,address,length,comparison,evidence:'Actual captured pointer/count producer consumed by450e50 prephysics children.'});};
  const includes=value=>phase==='all'||phase===value,pack=ptr(0x90b98c);
  if(includes('ai')){
    const groups=ptr(pack+0x60),groupCount=memory[pack+0x46];add('route-groups',groups,groupCount*12);
    for(let index=0;index<groupCount;index++){const group=groups+index*12;add(`route-points-${index}`,ptr(group+8),memory.readUInt16LE(group)*16);}
    const resource=ptr(0x90b990),markerResource=ptr(pack+8);add('ai-event-rows',ptr(resource+0xf8),memory[resource+0xf6]*8,'mutable');add('ai-marker-rows',ptr(markerResource+0xe4),memory[markerResource+0xf5]*20);
    const targetCount=memory.readInt32LE(0x82e904);if(targetCount>0)add('ai-authored-target-rows',ptr(resource+0xec),targetCount*20);
    add('fragment-registry',ptr(0x849a5c),36*8);
  }
  if(includes('progress')){const count=memory[pack+0x44],ids=ptr(pack+0x90);add('checkpoint-ids',ids,count*4);let maximum=-1;for(let i=0;i<count*4;i++)if(memory[ids+i]!==255)maximum=Math.max(maximum,memory[ids+i]);add('checkpoints',ptr(pack+0x70),(maximum+1)*20);}
  if(includes('deformation')){const count=memory.readInt32LE(0x80df00);if(count>0)add('deformation-rows',ptr(0x80df04),count*28,'mutable');}
  if(includes('objects')){const count=memory.readInt32LE(0x91e778);if(count>0)add('authored-body-list',ptr(0x91e77c),count*4);}
  if(includes('restoration')&&memory[ptr(0x90b990)+0xfc]){const count=memory.readInt32LE(0x90b998);if(count>0)add('coordinate-restoration',ptr(0x90b994),count*24);}
  return rows;
}

//All fields are protected even when their native bytes happen not to change.
//AI private storage/body arena is already in the complete semantic manifest.
export function nativeControlOwnedRegions(source){const {memory}=source,count=memory[memory.readUInt32LE(0x5ecb1c)+0x54d];return Array.from({length:count},(_,index)=>{const body=memory.readUInt32LE(0x909300+index*0x30c);return [{id:`control-car${index}-handling`,address:body+0x644,length:16},{id:`control-car${index}-ai-state`,address:body+0x6c0,length:0x48},{id:`control-car${index}-axes-controls`,address:body+0x708,length:0x1c},{id:`control-car${index}-rank-scale`,address:body+0x2f38,length:4}];}).flat();}

export function executeNativeControlPrefix(source,{snapshot,entryEsp=Number(snapshot?.registers?.esp),onBeforeStage}={}){
  if(Number(snapshot?.registers?.eip)!==nativeCodeAddress(0x450e50,{moduleBaseAddress:source.manifest.moduleBaseAddress}))throw Error('Control prefix requires an actual450e50 entry snapshot; physics-exit state is not equivalent.');
  const {memory}=source,base=source.manifest.moduleBaseAddress,childEsp=entryEsp-20,calls=[],stop=Symbol('physics-entry'),iteration=Number(snapshot.registers.edx),total=memory.readInt32LE(entryEsp+4);
  const parentTrace={sessionAfterInput:memory.readUInt32LE(0x5ecb1c),audioCompleted:0,inputCompleted:0,handlingCompleted:0};
  if(!Number.isInteger(iteration)||iteration<0||iteration>0xffffffff)throw Error('Control prefix requires observed EDX iteration.');
  if(onBeforeStage!==undefined&&typeof onBeforeStage!=='function')throw Error('Control stage observer must be a function.');
  for(const [name,offset]of [['ebx',4],['ebp',8],['esi',12],['edi',16]]){const value=Number(snapshot.registers[name]);if(!Number.isInteger(value)||value<0||value>0xffffffff)throw Error(`Control prefix requires captured parent ${name}.`);memory.writeUInt32LE(value,entryEsp-offset);}
  const runtime={memory,scratchBase:entryEsp,moduleBaseAddress:base,roundingMode:'nearest-even',x87PrecisionBits:24,numericalContext:source.numericalContext,nativeState:createNativeFixedSqrtState({memory,moduleBaseAddress:base}),views:source.views,grid:source.geometry.grid,models:source.geometry.modelContext,progression:progressionFor(source),soundRuntime:source.sound.soundRuntime};
  const delegates={410220:r=>runAutonomousDispatch(r.ecx,runtimeFor(r)),431750:r=>updateAutonomousRouteControl(r.ecx,runtimeFor(r)),485300:r=>updateVehicleAudio(r.ecx,r.edx,runtimeFor(r)),'42a6e0':r=>updateVehicleInputBlock(r.ecx,r.edx,runtimeFor(r)),'42be80':r=>updateVehicleAuxiliaryInput(r.ecx,runtimeFor(r)),'49bbc0':r=>copyLinkedVehicleControls(runtimeFor(r)),'42a9a0':r=>updateVehicleControlState(r.ecx,runtimeFor(r)),'494f60':r=>updateTrackDeformation(runtimeFor(r)),'429f30':r=>updateRaceObjects(runtimeFor(r)),'449640':r=>{
    //Unlike the newer raw APIs,449640's existing source adapter takes its
    //post-prologue LOCAL ESP: SUB38h and three saves, verified199.
    const local=r.scratchBase-0x44,derivativeEntry=local-4;
    return runRaceProgressPass({...runtimeFor(r),scratchBase:local,checkpointOptions:{trackBasis:body=>{
      //449d40 SUB5ch/four saves;449ff3/f8 form these actual twooutputs.
      const tangent=derivativeEntry-0x18,normal=derivativeEntry-0x0c,basisEntry=derivativeEntry-0x74;
      memory.writeUInt32LE(nativeCodeAddress(0x44a001,{moduleBaseAddress:base}),basisEntry);memory.writeUInt32LE(body.address,basisEntry+4);
      if(!populateRawVehicleTrackBasis(body.address,tangent,normal,{memory}))throw Error('Reached checkpoint basis has a negative terrain registration.');
      return {tangentQ16:[0,4,8].map(offset=>memory.readInt32LE(tangent+offset))};
    }}});
  },'420500':r=>updateRaceHandlingScale(runtimeFor(r))};
  function runtimeFor(request){return {...runtime,scratchBase:request.scratchBase,handlers:request.nativeEntry===0x485300?source.controlAudioBindings?.handlers??{}:{},...(request.nativeEntry===0x485300?{nativeAudioCalls:true,entryRegisters:{EBX:resolveNativeMemoryAddress(memory,0x909300+request.edx*0x30c,4),EDI:request.edx,ESI:memory.readUInt32LE(0x5ecb1c),EBP:iteration}}:{})};}
  let observedAudioBoundary=false;
  const handlers=Object.fromEntries(nativeControlPrefixCalls.map(({entry,returnAddress})=>[`call${entry.toString(16)}`,request=>{if(request.scratchBase!==childEsp)throw Error('Control prefix child ESP differs from native saves.');memory.writeUInt32LE(nativeCodeAddress(returnAddress,{moduleBaseAddress:base}),childEsp);const ecx=[0x42be80].includes(entry)?resolveNativeMemoryAddress(memory,request.ecx,0x30c):request.ecx;const row={entry:`0x${entry.toString(16)}`,returnAddress:nativeCodeAddress(returnAddress,{moduleBaseAddress:base}),entryEsp:childEsp,...(ecx===undefined?{}:{ecx}),...(request.edx===undefined?{}:{edx:request.edx})};
    if(entry===0x485300&&!observedAudioBoundary){observedAudioBoundary=true;
      extendNativeFrameGeometryComparison(source.manifest,source.geometry.comparisonRegions??[]);extendNativeFrameSoundComparison(source.manifest,[...(source.sound.comparisonRegions??[]),...(source.threadEnvironment?.comparisonRegions??[]),...(source.controlAudioBindings?.comparisonRegions??[])]);
      onBeforeStage?.(Object.freeze({stage:'0x485300',source,calls:Object.freeze(calls.map(row=>Object.freeze({...row}))),entryEsp,childEsp}));}
    calls.push(row);
    const phase={0x494f60:'deformation',0x429f30:'objects',0x449640:'progress'}[entry];if(phase)extendNativeFrameSoundComparison(source.manifest,nativeControlStructureRegions(source,{phase}));
    const result=delegates[entry.toString(16)]({...request,ecx,nativeEntry:entry});
    //These are the parent's actual post-CALL reload/count producers, before
    //later children can replace global/session state. No checkpoint registers
    //or expected output bytes participate in the trace.
    if([0x410220,0x431750,0x485300,0x42be80].includes(entry))parentTrace.sessionAfterInput=memory.readUInt32LE(0x5ecb1c);
    if(entry===0x485300)parentTrace.audioCompleted++;
    if(entry===0x42be80)parentTrace.inputCompleted++;
    if(entry===0x42a9a0)parentTrace.handlingCompleted++;
    if(entry===0x429f30){
      const restorationEnabled=memory[memory.readUInt32LE(0x90b990)+0xfc]!==0;
      parentTrace.afterObjects={restorationEnabled,...(restorationEnabled?{restorationCount:memory.readInt32LE(0x90b998),restorationBase:memory.readUInt32LE(0x90b994)}:{})};
      extendNativeFrameSoundComparison(source.manifest,nativeControlStructureRegions(source,{phase:'restoration'}));
    }
    return result;}]));
  handlers.call4749e0=()=>{memory.writeUInt32LE(nativeCodeAddress(0x451017,{moduleBaseAddress:base}),childEsp);throw stop;};
  try{runRaceUpdate(iteration,total,{...runtime,handlers});throw Error('Control prefix returned without reaching native physics boundary.');}catch(error){if(error!==stop){error.nativeControlProgress={stage:calls.at(-1)?.entry??'parent-prologue',calls,entryEsp,childEsp};throw error;}}
  return {entryEsp,childEsp,iteration,totalIterations:total,calls,parentTrace,stop:'0x4749e0',limits:['Genuine prephysics prefix only; no4749e0 physics step or previous postphysics producer chain is executed.','All reached missing services, sparse APIs and frozen source address defects fail explicitly.']};
}

export function replayNativeControlPrefix(snapshot,options={}){
  let stage='control-core-coverage';
  try{
    const additionalRegions=[...(options.additionalRegions??[]),...nativeControlAdditionalRegions(snapshot,options)],manifest=buildNativeFrameManifest(snapshot,{...options,additionalRegions});
    manifest.aliases=mergeNativeDriveModuleAliases(manifest.aliases,manifest.moduleBaseAddress);
    const captured=createCapturedMemory(rowsOf(snapshot),{aliases:manifest.aliases}),numericalContext=decodePhysicsNumericalContext({x87ControlWord:Number(snapshot.registers.fpuControlWord),mxcsr:Number(snapshot.registers.mxcsr)});
    if(numericalContext.x87.precisionBits!==24||numericalContext.x87.roundingMode!=='nearest-even'||numericalContext.sse.roundingMode!=='nearest-even'||numericalContext.sse.flushToZero||numericalContext.sse.denormalsAreZero||numericalContext.x87.exceptionMask!==63||numericalContext.sse.exceptionMask!==63)throw Error('Control prefix requires actual captured PC24/nearest-even masked context.');
    //At450e50 entry the future4749e0 stack is20bytes lower. Contexts bind
    //there from the outset; original parent argument/save slots remain live.
    manifest.observed={...manifest.observed,entryEsp:Number(snapshot.registers.esp)-20};
    //44cf99 appends unchecked.50 is a declared observer window only.
    //Reject rather than truncate any native loop that would exceed it.
    try{if(captured.memory.readUInt32LE(0x6e6514)>50)throw Error('Native obstacle count exceeds the explicit50-row observation; no allocation capacity is inferred.');}catch(error){if(!/Uncaptured native memory/.test(error.message))throw error;}
    stage='control-geometry-binding';const geometry=createNativeFrameGeometry({...options.geometryOptions,memory:captured.memory}),threadEnvironment=bindCapturedNativeThreadEnvironment(snapshot,{memory:captured.memory}),sound=createNativeFrameSoundBindings({memory:captured.memory,moduleBaseAddress:manifest.moduleBaseAddress,numericalContext,nativeTls:threadEnvironment.nativeTls});
    const source={...captured,...createNativeFrameContext({memory:captured.memory,manifest,geometry,numericalContext,sound}),manifest,numericalContext,sound,threadEnvironment};
    const audioFactory=options.createControlAudioBindings??createNativeControlAudioBindings;if(typeof audioFactory!=='function')throw Error('Control audio binding requires an explicit genuine source factory.');source.controlAudioBindings=audioFactory({memory:captured.memory,moduleBaseAddress:manifest.moduleBaseAddress,numericalContext,nativeTls:threadEnvironment.nativeTls,source});
    stage='control-variable-input-coverage';const structures=nativeControlStructureRegions(source,{phase:'ai'});
    extendNativeFrameGeometryComparison(manifest,geometry.comparisonRegions);extendNativeFrameSoundComparison(manifest,[...structures,...sound.comparisonRegions,...threadEnvironment.comparisonRegions]);source.ownedRegions=nativeControlOwnedRegions(source);
    stage='control-prefix';const report=executeNativeControlPrefix(source,{snapshot,onBeforeStage:options.onBeforeStage});
    extendNativeFrameGeometryComparison(manifest,geometry.comparisonRegions);extendNativeFrameSoundComparison(manifest,[...structures,...sound.comparisonRegions,...threadEnvironment.comparisonRegions,...(source.controlAudioBindings?.comparisonRegions??[])]);
    return {...source,report,ownedRegions:nativeControlOwnedRegions(source)};
  }catch(error){error.replayStage=stage;throw error;}
}
