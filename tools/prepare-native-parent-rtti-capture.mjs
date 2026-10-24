import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeParentTailCaptureConfig} from './prepare-native-parent-tail-capture.mjs';
import {nativeParentRttiSites,nativeParentRttiObservationRanges} from './lib/native-parent-rtti.mjs';
import {nativeParentRttiPolicy,nativeParentRttiMapBreakpointIds,nativeParentRttiMapCaptureRanges,verifyNativeParentRttiCaptureConfiguration} from './lib/native-parent-rtti-capture.mjs';

//An explicit NEW profile. Existing parent-tail creation remains unchanged.
//The generated configuration is PREPARED ONLY until the native helper has
//the purpose-specific policy/preflight capability and root review passes.
export async function createNativeParentRttiCaptureConfig(directory,output,options={}){
  if(options.frames!==undefined&&options.frames!==1||options.through!==undefined&&options.through!=='world-effects'||options.includeAfterAiCheckpoint===false)throw Error('Parent RTTI supports one parent through world-effects with its AI checkpoint.');
  const prepared=await createNativeParentTailCaptureConfig(directory,output,{...options,frames:1,through:'world-effects',includeAfterAiCheckpoint:true,collisionSound19:options.collisionSound19??true});
  const config=prepared.configuration;
  if(config.maxSnapshots!==13||config.maxDurationMs!==90000)throw Error('Parent RTTI base profile no longer has its original13-snapshot bound.');
  config.captureThreadEnvironment=true;
  config.parentRttiObservation=nativeParentRttiPolicy();config.maxSnapshots+=8;
  for(const id of nativeParentRttiMapBreakpointIds){const point=config.breakpoints.find(row=>row.id===id);if(!point)throw Error('Parent RTTI map checkpoint absent.');point.ranges.push(...nativeParentRttiMapCaptureRanges());}
  for(const site of nativeParentRttiSites)config.breakpoints.push({id:site.id,rva:`0x${(site.preferredAddress-0x400000).toString(16)}`,stopAfterHits:0,ranges:nativeParentRttiObservationRanges()});
  const policy=verifyNativeParentRttiCaptureConfiguration(config);
  return {...prepared,...policy,configuration:config,preparedOnly:true,launchBlockedUntilHelperCapability:true,
    limits:[...prepared.limits,'PREPARED ONLY: do not launch before scoped parent RTTI and singleton map preflight support is implemented, reviewed and validated.',
      'At most four external CRT pairs are observed only inside the selected main-thread auxiliary-to-cameras window; no game-child result is supplied.',
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
  const [directory,output,filename,depth='24576',skip='60']=process.argv.slice(2);
  if(!directory||!output||!filename||process.argv.length>7)throw Error('Usage: node tools/prepare-native-parent-rtti-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [DEPTH SKIP]');
  console.log(JSON.stringify(await prepareNativeParentRttiCapture(directory,output,filename,{stackBytesBefore:Number(depth),skipFrames:Number(skip)})));
}
