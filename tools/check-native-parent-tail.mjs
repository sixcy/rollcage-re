//Compare saved native checkpoints against a single source-carried execution.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots,verifyNativeControlBoundaries,nativeControlLateBoundaries} from './lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from './lib/native-parent-tail-inputs.mjs';
import {nativeParentLateObservedInputRegions,nativeParentLateHeapInputRanges} from './lib/native-parent-late-inputs.mjs';
import {nativeFrameGlobalRegions} from './lib/native-frame-manifest.mjs';
import {nativeControlSound19ObservedRegions} from './lib/native-control-sound-inputs.mjs';
import {createNativeControlSoundCreationBindings,verifyNativeControlSoundCreationEvidence} from './lib/native-control-sound-creation.mjs';
import {replayNativeControlThroughPhysics} from './lib/native-control-physics.mjs';
import {continueNativeParentTail,bindNativeParentTail,executeNativeParentTail,verifyNativeParentTailEvidence} from './lib/native-parent-tail.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {createNativeParentRttiBindings,verifyNativeParentRttiEvidence} from './lib/native-parent-rtti.mjs';
import {verifyNativeParentRttiCaptureConfiguration} from './lib/native-parent-rtti-capture.mjs';
import {verifyNativeDriveContinuationEvidence} from './lib/native-frame-drive-continuation.mjs';
import {verifyNativeControlPrefixEvidence} from './lib/native-frame-control-continuation.mjs';
import {compareNativeControlOutput} from './check-native-frame-control-prefix.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function checkNativeParentTail(input,output){
  const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256});
  const configuration=JSON.parse(await readFile(path.join(input,'configuration.json')));
  const pairing=pairNativeControlSnapshots(capture,configuration);
  if(!pairing.postphysics)throw Error('Parent-tail comparison requires actual postphysics checkpoints.');
  const parentRttiObservation=configuration.parentRttiObservation!==undefined;
  if(parentRttiObservation)verifyNativeParentRttiCaptureConfiguration(configuration);
  const collisionSound19=configuration.breakpoints.find(point=>point.id==='native-control-before').ranges.some(row=>row.id==='control-sound19-owner');
  const stages=['attachments','recovery','drive',...nativeControlLateBoundaries.slice(0,pairing.lateStages).map(row=>row.stage)],through=stages.at(-1);
  const proof=await Promise.all([verifyNativeControlBoundaries(),verifyNativeControlPrefixEvidence(),verifyNativeParentTailEvidence(),verifyNativeDriveContinuationEvidence()]);
  if(collisionSound19)proof.push(await verifyNativeControlSoundCreationEvidence());
  if(parentRttiObservation)proof.push(await verifyNativeParentRttiEvidence());
  await mkdir(output);for(const name of ['configuration.json','trace.jsonl'])await copyFile(path.join(input,name),path.join(output,name),constants.COPYFILE_EXCL);
  const report={schemaVersion:1,method:`source-carried-parent-entry-through-${through}`,through,collisionSound19,parentRttiObservation,completeParentTickMatched:false,authority:'original-process-with-declared-instrumentation',targetSha256:REDUX_SHA256,
    captureDirectory:path.resolve(input),evidenceIds:[...new Set(proof.flatMap(row=>row.evidenceIds))],matched:true,sourceComplete:false,frames:[],completion:capture.complete,
    limits:[`Only450e50 entry through ${through} is attempted; final parent return, clock advancement and the next tick remain open.`,
      'All replay inputs come from parent entry; intermediate/exit native bytes are comparison-only.',
      'Full private CPU/CRT ABI and unobserved scenarios are not established by checkpoint memory parity.']};
  for(const pair of pairing.pairs){
    const frame={beforeOrdinal:pair.before.ordinal,logicalClock:pair.logicalClock,stages:[]};report.frames.push(frame);
    try{
      const options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
      const late=pairing.lateStages?nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options):[];
      const soundInputs=collisionSound19?nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress):[];
      const source=replayNativeControlThroughPhysics(pair.before,{...options,...(collisionSound19?{createControlAudioBindings:createNativeControlSoundCreationBindings}:{}),additionalRegions:[...nativeParentTailAdditionalRegions(pair.before,options),...late,...soundInputs],
        onBeforeStage:({source})=>{if(pair.checkpoints?.afterAi)frame.afterAi=compareNativeControlOutput(source,pair.checkpoints.afterAi);},
        onPrefixComplete:source=>{frame.prefix=compareNativeControlOutput(source,pair.after);}});
      if(collisionSound19)frame.sourceSoundCreationEvents=source.controlAudioBindings.creationEvents;
      frame.physics=compareNativeControlOutput(source,pair.physicsAfter);
      let bound,rtti;
      if(parentRttiObservation){
        //The CRT adapter receives only authenticated external EAX outcomes.
        //Its storage coverage is checked against ORIGINAL parent entry, not
        //native intermediate/after rows or a newly constructed game object.
        const initial=createCapturedMemory([...pair.before.ranges.values()]);
        bound=bindNativeParentTail(source,{snapshot:pair.before,includeLateInputs:true});
        rtti=createNativeParentRttiBindings({capture,pair,memory:bound.memory,initialSpan:initial.span});
        frame.sourceRttiEvents=rtti.events;
        frame.rttiLimits=rtti.limits;
      }
      const onStage=row=>{
        const expected=pair.postphysics[row.stage];if(!expected)throw Error('Undeclared source parent-tail stage.');
        frame.stages.push({stage:row.stage,nativeOrdinal:expected.ordinal,comparison:compareNativeControlOutput(row.source,expected),execution:row.report});
        if(row.stage==='cameras')rtti?.assertComplete();
      };
      const result=parentRttiObservation
        ?executeNativeParentTail(bound,{through,onStage,crtDynamicCast:rtti.crtDynamicCast})
        :continueNativeParentTail(source,{snapshot:pair.before,through,onStage});
      frame.execution=result.tailReport??result.report;
      frame.matched=frame.physics.matched&&frame.prefix.matched&&(!frame.afterAi||frame.afterAi.matched)&&frame.stages.length===stages.length&&frame.stages.every(row=>row.comparison.matched);
      if(!frame.matched)report.matched=false;
    }catch(error){frame.error=error.stack;frame.replayStage=error.replayStage;frame.partialExecution=error.nativeParentTailProgress;frame.dependency=error.nativeParentTailDependency;frame.boundary=error.boundary;frame.soundCreation=error.nativeControlSoundCreation;report.matched=false;break;}
  }
  report.comparedFrames=report.frames.filter(frame=>frame.stages.length===stages.length).length;
  report.sourceComplete=report.matched&&report.comparedFrames===pairing.frames;
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  return {report,output:path.resolve(output)};
}

//Only the actual parent-entry rows supply input bytes. A skipped NULL graph
//grants no allocation; native after rows never enter this admission function.
export function nativeParentLateReplayRegions(snapshot,moduleBaseAddress,options={}){
  const covered=[...nativeFrameGlobalRegions.map(row=>({address:moduleBaseAddress+row.preferredAddress-0x400000,length:row.id==='attachment-queue'?options.attachmentWindowBytes??row.length:row.length})),...nativeParentTailAdditionalRegions(snapshot,{...options,moduleBaseAddress})];
  const regions=[],rows=snapshot.ranges instanceof Map?snapshot.ranges:new Map(snapshot.ranges.map(row=>[row.id,row]));
  for(const region of nativeParentLateObservedInputRegions(snapshot,moduleBaseAddress)){
    let cursor=region.address;const end=cursor+region.length;
    const add=stop=>{if(stop>cursor)regions.push({...region,id:`${region.id}-${cursor.toString(16)}`,address:cursor,length:stop-cursor,preferredAddress:region.preferredAddress+cursor-region.address});};
    for(const existing of covered.toSorted((a,b)=>a.address-b.address)){
      if(existing.address+existing.length<=cursor||existing.address>=end)continue;
      add(existing.address);cursor=Math.max(cursor,existing.address+existing.length);
    }
    add(end);covered.push(region);
  }
  for(const descriptor of nativeParentLateHeapInputRanges()){
    const row=rows.get(descriptor.id);
    if(!row)throw Error(`Late parent entry lacks declared guarded input ${descriptor.id}.`);
    if(row.guardedStopIndex!==null){
      if(row.bytes.length!==0)throw Error('Skipped late parent guard cannot supply memory.');
      continue;
    }
    if(row.bytes.length!==descriptor.length||!Number.isSafeInteger(Number(row.address))||Number(row.address)<1)throw Error('Late parent allocation differs from its observed logical extent.');
    regions.push({id:descriptor.id,address:Number(row.address),length:descriptor.length,comparison:'mutable',evidence:'Actual guarded parent-entry observation of fixed source consumer extent; not an inferred allocation capacity.'});
  }
  return regions;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [input,output]=process.argv.slice(2);if(!input||!output||process.argv.length>4)throw Error('Usage: node tools/check-native-parent-tail.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const {report}=await checkNativeParentTail(input,output);
  console.log(JSON.stringify({matched:report.matched,sourceComplete:report.sourceComplete,comparedFrames:report.comparedFrames,
    frames:report.frames.map(frame=>({physics:frame.physics?.matched,stages:frame.stages.map(row=>({stage:row.stage,matched:row.comparison.matched,uniqueBytes:row.comparison.uniqueBytesCompared,firstDivergence:row.comparison.firstDivergence})),error:frame.error?.split('\n')[0]})),output}));
  if(!report.matched)process.exitCode=1;
}
