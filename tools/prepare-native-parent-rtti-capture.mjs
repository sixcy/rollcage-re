import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeParentTailCaptureConfig} from './prepare-native-parent-tail-capture.mjs';
import {nativeParentRttiSites,nativeParentRttiObservationRanges} from './lib/native-parent-rtti.mjs';
import {nativeParentRttiPolicy,nativeParentRttiMapBreakpointIds,nativeParentRttiMapCaptureRanges,verifyNativeParentRttiCaptureConfiguration} from './lib/native-parent-rtti-capture.mjs';
import {nativeControlTyreSound2CaptureRange} from './lib/native-control-tyre-sound-inputs.mjs';
import {nativeControlSurfaceSound7CaptureRange} from './lib/native-control-surface-sound-inputs.mjs';
import {nativeParentWeatherCounterSites,nativeParentWeatherCounterImportRange} from './lib/native-parent-weather-counter.mjs';

//An explicit NEW profile. Existing parent-tail creation remains unchanged.
//The generated configuration is PREPARED ONLY until the native helper has
//the purpose-specific policy/preflight capability and root review passes.
export async function createNativeParentRttiCaptureConfig(directory,output,options={}){
  if(options.tyreSound2!==undefined&&typeof options.tyreSound2!=='boolean')throw Error('Tyre sound2 observation option must be boolean.');
  if(options.surfaceSound7!==undefined&&typeof options.surfaceSound7!=='boolean')throw Error('Surface sound7 observation option must be boolean.');
  const {viewportMapGraph=false,weatherScreenQueries=false,tyreSound2=false,surfaceSound7=false,weatherCounterObservation=false,soundBankOwners=false,soundBankChannels=false,finalTick=false,...parentOptions}=options;
  if(typeof viewportMapGraph!=='boolean'||typeof weatherScreenQueries!=='boolean'||typeof weatherCounterObservation!=='boolean'||typeof soundBankOwners!=='boolean'||typeof soundBankChannels!=='boolean'||typeof finalTick!=='boolean')throw Error('Viewport map graph/weather/counter/sound/final options must be boolean.');
  if(options.frames!==undefined&&options.frames!==1||options.through!==undefined&&options.through!=='world-effects'||options.includeAfterAiCheckpoint===false)throw Error('Parent RTTI supports one parent through world-effects with its AI checkpoint.');
  const prepared=await createNativeParentTailCaptureConfig(directory,output,{...parentOptions,frames:1,through:'world-effects',includeAfterAiCheckpoint:true,collisionSound19:options.collisionSound19??true});
  const config=prepared.configuration;
  if(options.tyreSound2){if(!(options.collisionSound19??true))throw Error('Tyre sound2 requires the original sound-bank observation.');for(const point of config.breakpoints.filter(row=>row.id.startsWith('native-control-')))point.ranges.push(nativeControlTyreSound2CaptureRange());}
  if(surfaceSound7){if(!(options.collisionSound19??true))throw Error('Surface sound7 requires the original sound-bank observation.');for(const point of config.breakpoints.filter(row=>row.id.startsWith('native-control-')))point.ranges.push(nativeControlSurfaceSound7CaptureRange());}
  if(config.maxSnapshots!==13||config.maxDurationMs!==90000)throw Error('Parent RTTI base profile no longer has its original13-snapshot bound.');
  config.captureThreadEnvironment=true;
  config.parentRttiObservation=nativeParentRttiPolicy({viewportMapGraph,weatherScreenQueries,weatherCounterObservation,soundBankOwners,soundBankChannels,finalTick});config.maxSnapshots+=finalTick?9:8;
  if(weatherCounterObservation)for(const point of config.breakpoints.filter(row=>row.id.startsWith('native-control-')))point.ranges.push(nativeParentWeatherCounterImportRange());
  for(const id of nativeParentRttiMapBreakpointIds){const point=config.breakpoints.find(row=>row.id===id);if(!point)throw Error('Parent RTTI map checkpoint absent.');point.ranges.push(...nativeParentRttiMapCaptureRanges());}
  for(const site of nativeParentRttiSites)config.breakpoints.push({id:site.id,rva:`0x${(site.preferredAddress-0x400000).toString(16)}`,stopAfterHits:0,ranges:weatherScreenQueries?[]:nativeParentRttiObservationRanges()});
  if(weatherCounterObservation)for(const site of nativeParentWeatherCounterSites)config.breakpoints.push({id:site.id,rva:`0x${(site.preferredAddress-0x400000).toString(16)}`,stopAfterHits:0,ranges:[]});
  if(finalTick){const world=config.breakpoints.find(row=>row.id==='native-control-after-world-effects');world.stopAfterHits=0;config.breakpoints.push({id:'native-parent-return',rva:'0x50e38',stopAfterHits:1,ranges:structuredClone(world.ranges)});}
  const policy=verifyNativeParentRttiCaptureConfiguration(config);
  return {...prepared,...policy,configuration:config,preparedOnly:true,launchBlockedUntilHelperCapability:true,
    limits:[...prepared.limits,'PREPARED ONLY: do not launch before scoped parent RTTI and singleton map preflight support is implemented, reviewed and validated.',
      `At most four external CRT pairs are observed only inside the selected main-thread auxiliary-to-${weatherScreenQueries?'world-effects':'cameras'} window; no game-child result is supplied.`,
      ...(weatherScreenQueries?['Mixed camera/weather mode requires both ordered direct screen queries, actual family-specific raw caller chains and distinct observed CRT outcomes; other weather wrappers remain unsupported.']:[]),
      ...(tyreSound2?['Observe only the actual code2 sound-owner slot at each parent checkpoint; its original-entry 490h allocation is source input and later observations are comparison-only. NULL grants no replacement storage.']:[]),
      ...(surfaceSound7?['Observe only the actual code7 sound-owner slot at each parent checkpoint; only original-entry 490h bytes are source input. NULL grants no memory, and channel/source/allocation descendants remain separate reached dependencies.']:[]),
      ...(soundBankOwners?['Observe at most256 actual used sound-owner pointers at the ten existing parent checkpoints, deduplicating exact aliases and reading only their original490h owner extents. Transported owners enter comparison only when genuine source dispatch reaches them; no channel/source/allocation descendant is granted.']:[]),
      ...(soundBankChannels?['Observe at most256 aggregate actual used channel slots from captured owners at the same ten checkpoints; exact wrappers12B, canonical guarded sources9a8h and vtables88h are input transport only. No unused capacity, allocation outcome or automatic semantic admission.']:[]),
      ...(finalTick?['Separate final-return purpose:22 snapshots/18 sites, unchanged90-second/one-million-event bound. The actual450e38 caller endpoint is armed only at the selected original parent entry; no native result or clock value is forced. Typed final-input, owner/channel and viewport observations also cover the final endpoint for comparison only.']:[]),
      ...(weatherCounterObservation?['Observe one initialized original QueryPerformanceCounter pair after both weather queries, retaining real eight-byte pre/post storage and original IAT input. Combined CRT/counter/checkpoint observations must fit21 snapshots; excess pairs fail instead of truncating.']:[]),
      'Before resolving ranges at parent-entry, after-cameras and after-world-effects, the helper must check nonnull singleton/head on the owned main thread, latch their actual identities at entry, and require the same identities later without resuming between check and read.',
      'The fixed100B head allocation has independent guarded chain evidence. The separate readable-region transport uses an explicit nonnull profile domain and a16MiB observation bound, never allocation capacity.',
      'Only parent-entry bytes may supply source input. Later map transport is comparison-only; append semantic head16B/nodes100B/actual key length+1 only when real source accesses reach them.']};
}
export async function prepareNativeParentRttiCapture(directory,output,filename,options={}){
  const result=await createNativeParentRttiCaptureConfig(directory,output,options);
  for(const target of [result.configuration.outputDirectory,path.resolve(filename)]){try{await lstat(target);throw Error(`Refusing existing RTTI output: ${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
  await writeFile(filename,JSON.stringify(result.configuration,null,2),{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,frames:1,skipFrames:result.skipFrames,through:result.through,
    preparedOnly:true,launchBlockedUntilHelperCapability:true,requiredHelperCapability:result.requiredHelperCapability,limits:result.limits};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),flags=new Set();while(args.at(-1)?.startsWith('--')){const flag=args.pop();if(!['--viewport-map-graph','--weather-screen-queries','--tyre-sound2','--surface-sound7','--weather-counter','--sound-bank-owners','--sound-bank-channels'].includes(flag)||flags.has(flag))throw Error('Unknown or duplicate RTTI option.');flags.add(flag);}
  const viewportMapGraph=flags.has('--viewport-map-graph'),weatherScreenQueries=flags.has('--weather-screen-queries'),tyreSound2=flags.has('--tyre-sound2'),surfaceSound7=flags.has('--surface-sound7'),weatherCounterObservation=flags.has('--weather-counter'),soundBankOwners=flags.has('--sound-bank-owners'),soundBankChannels=flags.has('--sound-bank-channels');
  const [directory,output,filename,depth='24576',skip='60']=args;
  if(!directory||!output||!filename||args.length>5||args.some(value=>value.startsWith('--')))throw Error('Usage: node tools/prepare-native-parent-rtti-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [DEPTH SKIP] [--viewport-map-graph] [--weather-screen-queries] [--tyre-sound2] [--surface-sound7] [--weather-counter] [--sound-bank-owners] [--sound-bank-channels]');
  console.log(JSON.stringify(await prepareNativeParentRttiCapture(directory,output,filename,{stackBytesBefore:Number(depth),skipFrames:Number(skip),viewportMapGraph,weatherScreenQueries,tyreSound2,surfaceSound7,weatherCounterObservation,soundBankOwners,soundBankChannels})));
}
