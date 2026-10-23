import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeControlCaptureConfig} from './prepare-native-control-capture.mjs';
import {nativeControlTailBoundaries,verifyNativeControlCaptureConfiguration} from './lib/native-control-capture.mjs';
import {nativeParentTailModuleRegions} from './lib/native-parent-tail-inputs.mjs';

export async function createNativeParentTailCaptureConfig(directory,output,options={}){
  const prepared=await createNativeControlCaptureConfig(directory,output,{...options,includePhysicsExit:true});
  const config=prepared.configuration,physicsExit=config.breakpoints.find(row=>row.id==='native-control-after-physics');
  physicsExit.stopAfterHits=0;
  for(const [index,boundary]of nativeControlTailBoundaries.entries()){
    const point=structuredClone(physicsExit);point.id=boundary.id;point.rva=`0x${(boundary.address-0x400000).toString(16)}`;
    point.stopAfterHits=index===nativeControlTailBoundaries.length-1?prepared.frames:0;
    config.breakpoints.push(point);config.maxSnapshots+=prepared.frames;
  }
  for(const point of config.breakpoints.filter(row=>row.id.startsWith('native-control-'))){
    point.ranges.push(...nativeParentTailModuleRegions.map(row=>({id:row.id,rva:`0x${(row.preferredAddress-0x400000).toString(16)}`,length:row.length})),
      {id:'tail-pickup-list-region',rva:'0x502020',dereferenceOffsets:['0'],readableRegion:true,maxRegionBytes:16*1024*1024});
    if(new Set(point.ranges.map(row=>row.id)).size!==point.ranges.length)throw Error('Parent-tail input descriptor IDs conflict.');
  }
  return {...prepared,...verifyNativeControlCaptureConfiguration(config),limits:[...prepared.limitations,
    'Three parent checkpoints independently observe attachments, recovery and drive completion. They supply no source replay output.',
    'Type2 table observation is the4096-ID encoded access domain, not native allocation capacity.',
    'Pickup list transport requires its actual nonnull root; replay must admit only902024 count times four bytes. A null root fails instead of inventing a list.',
    'This stops after469fd0, before wheel/camera/weather/remaining parent-tail stages; it does not establish a complete450e50 tick.']};
}
export async function prepareNativeParentTailCapture(directory,output,filename,options={}){
  const result=await createNativeParentTailCaptureConfig(directory,output,options);
  for(const target of [result.configuration.outputDirectory,path.resolve(filename)]){
    try{await lstat(target);throw Error(`Refusing existing parent-tail output:${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await writeFile(filename,JSON.stringify(result.configuration,null,2),{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,frames:result.frames,skipFrames:result.skipFrames,
    options:result.options,limits:result.limits,method:'Prepared native parent-entry through postphysics drive checkpoints only; no process launched.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,output,filename,frames='1',depth='24576',skip='60']=process.argv.slice(2);
  if(!directory||!output||!filename||process.argv.length>8)throw Error('Usage: node tools/prepare-native-parent-tail-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [FRAMES DEPTH SKIP]');
  console.log(JSON.stringify(await prepareNativeParentTailCapture(directory,output,filename,{frames:Number(frames),stackBytesBefore:Number(depth),skipFrames:Number(skip)})));
}
