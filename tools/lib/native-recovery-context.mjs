//47ccc0/47d040/47d440 bindings over already captured state. No route selection,
//obstruction answer, motion reset, pool initializer or constructor is injected.
import {createCapturedMemory} from './captured-memory.mjs';
import {buildNativeFrameManifest} from './native-frame-manifest.mjs';
import {createNativeFrameGeometry} from './native-frame-geometry.mjs';
import {createPhysicsRuntimeViews} from '../../src/physics-runtime-views.mjs';
import {resolveNativeMemoryAddress} from '../../src/native-memory-spans.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import {bindCapturedNativeThreadEnvironment, createNativeFrameSoundBindings, nativeFrameSoundAdditionalRegions} from './native-frame-sound.mjs';

//70ed30's candidate workflow may overwrite clone70f130; that native alias is
//preserved. The span covers all3e78 clone bytes through712fa7 inclusively.
export const nativeRecoveryGlobalRegions=Object.freeze([
  Object.freeze({id:'recovery-route-metrics-candidates-clone',preferredAddress:0x70eb00,length:0x44a8,comparison:'mutable',evidence:'47ccc0/47d040/47d9c0:70eb00 pointer temporaries,70eb0c pose,70eb18 point,70eb1c direction,70eb30 metrics,70ed30 candidates,70f130 full3e78 clone.'}),
  Object.freeze({id:'recovery-controller-slots',preferredAddress:0x849940,length:36,comparison:'mutable',evidence:'47ccc0 native type7/21 retirement clears controller-index byte in36-entry849940 table.'}),
  Object.freeze({id:'recovery-retirement-clock',preferredAddress:0x903520,length:4,comparison:'mutable',evidence:'46a2d0 active type33 retirement records90a548 at903520 after actual effect burst.'}),
  Object.freeze({id:'recovery-retirement-first-color',preferredAddress:0x919000,length:4,comparison:'read-only',evidence:'435ba0 mask1 particle color919000, distinct from existing919004 frame/color span.'}),
  Object.freeze({id:'recovery-effect-position-queue',preferredAddress:0x919020,length:24*12,comparison:'mutable',evidence:'435ba0 writes the observed9153dc ring index into24 native12-byte position rows before484bb0.'}),
]);

// Source-known audio image inputs can extend the core physics alias coverage.
// Compatible overlaps share one actual route; conflicting translations fail.
// The strict memory facade still verifies captured targets and heap shadows.
function mergeInputAliases(core, extra, moduleBaseAddress) {
  if (extra === undefined) return core;
  if (!Array.isArray(extra)) throw Error('Recovery input aliases require explicit observed module spans.');
  const aliases = [...core, ...extra].map(row => {
    const address = Number(row.address), targetAddress = Number(row.targetAddress), length = Number(row.length);
    if (!Number.isSafeInteger(address) || address < 0x400000 || !Number.isSafeInteger(targetAddress) || targetAddress !== moduleBaseAddress + address - 0x400000
      || !Number.isSafeInteger(length) || length < 1 || address + length > 0x100000000 || targetAddress + length > 0x100000000) throw Error('Recovery input alias differs from the observed module translation.');
    return {address, targetAddress, length};
  }).sort((a, b) => a.address - b.address);
  const merged = [];
  for (const row of aliases) {
    const previous = merged.at(-1);
    if (previous && row.address <= previous.address + previous.length) previous.length = Math.max(previous.length, row.address + row.length - previous.address);
    else merged.push({...row});
  }
  return merged;
}

export function createNativeRecoveryContext({memory,manifest,geometry,entryEsp,numericalContext,completionHandlers={},soundRuntime,retirementHandlers={},onRecoveryApply,nativeRecoveryAudio,onRecoveryAudioCall}={}){
  if(!Buffer.isBuffer(memory)||!manifest?.observed||!geometry?.grid||!Number.isInteger(entryEsp))throw Error('Native recovery requires coherent captured memory, geometry, manifest and entry ESP.');
  if(numericalContext?.x87?.precisionBits!==24||numericalContext.x87.roundingMode!=='nearest-even'||numericalContext.x87.exceptionMask!==63||numericalContext.sse?.roundingMode!=='nearest-even'||numericalContext.sse.exceptionMask!==63||numericalContext.sse.flushToZero||numericalContext.sse.denormalsAreZero)throw Error('Native recovery query requires captured PC24/nearest-even, masked exceptions and noFTZ/DAZ.');
  if(soundRuntime&&soundRuntime.memory!==memory)throw Error('Native recovery sound must share its captured memory.');
  const clone=resolveNativeMemoryAddress(memory,0x70f130,0x3e78),arena=manifest.requiredRegions.find(row=>row.id==='body-arena-allocation-bytes');
  if(!arena)throw Error('Native recovery requires the verified full body arena.');
  const ptr=address=>memory.readUInt32LE(address),read=address=>memory.readInt32LE(address),storage=new Map(manifest.bodyStorage.map(row=>[row.address,row.length]));
  const bodyAt=address=>{
    if(address===clone)return {address,bytes:memory.subarray(address,address+0x3e78)};
    const base=manifest.observed.arenaBaseAddress,used=ptr(0x70dcf4),length=Math.max(storage.get(address)??0x180,(ptr(address)&511)===3?0x3e78:0x180);
    if(address<base||(address-base)%128||address+length>base+used||address+length>arena.address+arena.length)throw Error('Native recovery body pointer exceeds the observed arena.');
    return {address,bytes:memory.subarray(address,address+length)};
  };
  const views=createPhysicsRuntimeViews({memory,bodyAt,bodyLists:manifest.bodyLists,candidateMapping:geometry.candidateMapping});
  const records=new Map(),packs=new Map();
  const recordAt=address=>{
    address=resolveNativeMemoryAddress(memory,address,0x30c);
    const first=resolveNativeMemoryAddress(memory,0x909300,6*0x30c);
    if(address<first||(address-first)%0x30c||address+0x30c>first+6*0x30c)throw Error('Native recovery progression record is outside its six native slots.');
    if(records.has(address))return records.get(address);
    const record={address,bytes:memory.subarray(address,address+0x30c)};Object.defineProperty(record,'body00',{enumerable:true,get:()=>views.bodyAt(ptr(address))});records.set(address,record);return record;
  };
  function packAt(address){
    if(packs.has(address))return packs.get(address);
    const pack={address};Object.defineProperties(pack,{
      checkpointCount44:{enumerable:true,get:()=>memory[address+0x44]},
      checkpointIds90:{enumerable:true,get:()=>memory.subarray(ptr(address+0x90),ptr(address+0x90)+memory[address+0x44]*4)},
      checkpoints70:{enumerable:true,get:()=>{
        const ids=pack.checkpointIds90;let maximum=-1;for(const id of ids)if(id!==255)maximum=Math.max(maximum,id);
        const start=ptr(address+0x70);return memory.subarray(start,start+(maximum+1)*20);
      }},
    });packs.set(address,pack);return pack;
  }
  const progressionRuntime={memory};Object.defineProperties(progressionRuntime,{
    pack:{enumerable:true,get:()=>packAt(ptr(0x90b98c))},
    session:{enumerable:true,get:()=>({get mode579(){return memory[ptr(0x5ecb1c)+0x579];}})},
    clock90a548:{enumerable:true,get:()=>read(0x90a548)},
  });
  const progression={memory,recordAt,runtime:progressionRuntime};
  const runtime={memory,views,grid:geometry.grid,models:geometry.modelContext,modelPointersFor:geometry.candidateMapping.modelPointersFor,scratchBase:entryEsp,roundingMode:'nearest-even',x87PrecisionBits:24,progression,completionHandlers,soundRuntime,handlers:retirementHandlers,nativeRecoveryAudio,onRecoveryAudioCall,...(onRecoveryApply===undefined?{}:{onRecoveryApply})};
  return {memory,views,geometry,progression,runtime,cloneAddress:clone,
    limits:['Reached completion/audio services remain their real required handlers; none are replaced with inert callbacks.', 'Checkpoint backing is bounded by actual captured IDs; missing rows/storage fail instead of supplying authored or zero-filled data.', 'The caller must compare route/checkpoint/controller/emission descendants reached beyond core/geometry declarations.']};
}

export function bindCapturedNativeRecovery(snapshot,options={}){
  if(options.nativeAudio!==undefined&&typeof options.nativeAudio!=='boolean')throw Error('Native recovery audio binding option must be boolean.');
  if(options.nativeSoundContinuations!==undefined&&(!options.nativeAudio||!options.nativeSoundContinuations||typeof options.nativeSoundContinuations!=='object'||Object.keys(options.nativeSoundContinuations).some(key=>!['selectAdaptiveSoundChannelOnStack','playSelectedNativeSoundOnStack'].includes(key))))throw Error('Native recovery sound continuations require explicit native audio and only declared game-source handlers.');
  const bases=new Set([snapshot.moduleBaseAddress,...(snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges).map(row=>row.moduleBaseAddress),options.moduleBaseAddress].filter(value=>value!==undefined&&value!==null).map(Number));
  if(bases.size!==1)throw Error('Native recovery requires one observed module base.');const moduleBaseAddress=[...bases][0];
  const additionalRegions=[...nativeRecoveryGlobalRegions.map(row=>({...row,address:moduleBaseAddress+row.preferredAddress-0x400000})),...(options.nativeAudio?nativeFrameSoundAdditionalRegions({moduleBaseAddress}):[]),...(options.additionalRegions??[])];
  const manifest=buildNativeFrameManifest(snapshot,{...options,moduleBaseAddress,additionalRegions});manifest.boundary='0x47ccc0-or-declared-child';
  manifest.aliases=mergeInputAliases(manifest.aliases,options.additionalInputAliases,moduleBaseAddress);
  const rows=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges,captured=createCapturedMemory(rows,{aliases:manifest.aliases});
  const numericalContext=decodePhysicsNumericalContext({x87ControlWord:Number(snapshot.registers?.fpuControlWord),mxcsr:Number(snapshot.registers?.mxcsr)});
  const geometry=createNativeFrameGeometry({...options.geometryOptions,memory:captured.memory});
  let nativeAudio;
  if(options.nativeAudio){
    const tls=bindCapturedNativeThreadEnvironment(snapshot,{memory:captured.memory});
    if(!tls.nativeTls)throw Error('Native recovery audio requires its actual captured thread environment.');
    const binding=createNativeFrameSoundBindings({memory:captured.memory,moduleBaseAddress,numericalContext,nativeTls:tls.nativeTls,...options.nativeSoundContinuations});
    nativeAudio={...binding,moduleBaseAddress,numericalContext,nativeTls:tls.nativeTls};
  }
  return {...captured,manifest,numericalContext,nativeAudio,...createNativeRecoveryContext({memory:captured.memory,manifest,geometry,entryEsp:Number(snapshot.registers?.esp),numericalContext,completionHandlers:options.completionHandlers,soundRuntime:options.soundRuntime,retirementHandlers:options.retirementHandlers,onRecoveryApply:options.onRecoveryApply,nativeRecoveryAudio:nativeAudio,onRecoveryAudioCall:options.onRecoveryAudioCall})};
}
