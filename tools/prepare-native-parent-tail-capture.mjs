import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeControlCaptureConfig} from './prepare-native-control-capture.mjs';
import {nativeControlTailBoundaries,nativeControlLateBoundaries,verifyNativeControlCaptureConfiguration} from './lib/native-control-capture.mjs';
import {nativeParentTailModuleRegions} from './lib/native-parent-tail-inputs.mjs';
import {nativeParentLateModuleRegions,nativeParentLateHeapInputRanges} from './lib/native-parent-late-inputs.mjs';
import {nativeControlSound19CaptureRanges} from './lib/native-control-sound-inputs.mjs';

export async function createNativeParentTailCaptureConfig(directory,output,options={}){
  const collisionSound19=options.collisionSound19??false;
  if(typeof collisionSound19!=='boolean')throw Error('Collision-sound observation option must be boolean.');
  const through=options.through??'drive',lateStages=['drive',...nativeControlLateBoundaries.map(row=>row.stage)].indexOf(through);
  if(lateStages<0)throw Error('Parent-tail capture through must be drive, auxiliary, cameras or world-effects.');
  const prepared=await createNativeControlCaptureConfig(directory,output,{...options,includePhysicsExit:true});
  const config=prepared.configuration,physicsExit=config.breakpoints.find(row=>row.id==='native-control-after-physics');
  if(collisionSound19)config.captureThreadEnvironment=true;
  physicsExit.stopAfterHits=0;
  for(const [index,boundary]of nativeControlTailBoundaries.entries()){
    const point=structuredClone(physicsExit);point.id=boundary.id;point.rva=`0x${(boundary.address-0x400000).toString(16)}`;
    point.stopAfterHits=index===nativeControlTailBoundaries.length-1?prepared.frames:0;
    config.breakpoints.push(point);config.maxSnapshots+=prepared.frames;
  }
  const drive=config.breakpoints.find(row=>row.id==='native-control-after-drive');
  if(lateStages){
    drive.stopAfterHits=0;
    for(const [index,boundary]of nativeControlLateBoundaries.slice(0,lateStages).entries()){
      const point=structuredClone(drive);point.id=boundary.id;point.rva=`0x${(boundary.address-0x400000).toString(16)}`;
      point.stopAfterHits=index===lateStages-1?prepared.frames:0;
      config.breakpoints.push(point);config.maxSnapshots+=prepared.frames;
    }
  }
  for(const point of config.breakpoints.filter(row=>row.id.startsWith('native-control-'))){
    point.ranges.push(...nativeParentTailModuleRegions.map(row=>({id:row.id,rva:`0x${(row.preferredAddress-0x400000).toString(16)}`,length:row.length})),
      //44d7a0's71-record light pool reserves index0;44d960 consumes
      //70 position/flag rows. Source admission still follows reached handles.
      {id:'tail-attached-light-position-table',rva:'0x50b688',length:70*8},
      {id:'tail-pickup-list-region',rva:'0x502020',dereferenceOffsets:['0'],readableRegion:true,maxRegionBytes:16*1024*1024});
    if(lateStages)point.ranges.push(...nativeParentLateModuleRegions.map(row=>({id:row.id,rva:`0x${(row.preferredAddress-0x400000).toString(16)}`,length:row.length})),...nativeParentLateHeapInputRanges());
    if(collisionSound19)point.ranges.push(...nativeControlSound19CaptureRanges());
    if(new Set(point.ranges.map(row=>row.id)).size!==point.ranges.length)throw Error('Parent-tail input descriptor IDs conflict.');
  }
  return {...prepared,...verifyNativeControlCaptureConfiguration(config),through,collisionSound19,limits:[...prepared.limitations,
    'Three parent checkpoints independently observe attachments, recovery and drive completion. They supply no source replay output.',
    'Type2 table observation is the4096-ID encoded access domain, not native allocation capacity.',
    'Pickup list transport requires its actual nonnull root; replay must admit only902024 count times four bytes. A null root fails instead of inventing a list.',
    `This stops at ${through}; it does not establish a complete450e50 tick or supply intermediate observations to source execution.`,
    ...(lateStages?['Late module tables are observed from the actual process; recovered metadata supplies addresses and lengths only.',
      'Late heap graphs use explicit nonnull guards and fixed consumer extents. Weather sentinel roots, nullable vectors and post-RTTI application maps are not invented or blindly followed.']:[]),
    ...(collisionSound19?['Collision sound observes the full actual owner-vector capacity and the exact NULL-guarded code19 owner. Channel backing, allocation and services remain reached dependencies; no null owner is substituted.']:[])]};
}
export async function prepareNativeParentTailCapture(directory,output,filename,options={}){
  const result=await createNativeParentTailCaptureConfig(directory,output,options);
  for(const target of [result.configuration.outputDirectory,path.resolve(filename)]){
    try{await lstat(target);throw Error(`Refusing existing parent-tail output:${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await writeFile(filename,JSON.stringify(result.configuration,null,2),{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,frames:result.frames,skipFrames:result.skipFrames,
    options:result.options,through:result.through,collisionSound19:result.collisionSound19,limits:result.limits,method:'Prepared native parent-entry checkpoints only; no process launched.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,output,filename,frames='1',depth='24576',skip='60',through='drive']=process.argv.slice(2);
  if(!directory||!output||!filename||process.argv.length>9)throw Error('Usage: node tools/prepare-native-parent-tail-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [FRAMES DEPTH SKIP THROUGH]');
  console.log(JSON.stringify(await prepareNativeParentTailCapture(directory,output,filename,{frames:Number(frames),stackBytesBefore:Number(depth),skipFrames:Number(skip),through})));
}
