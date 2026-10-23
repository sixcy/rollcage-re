//Saved original450e50 ->4749e0 observations only; never launches the target.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from './lib/native-control-capture.mjs';
import {pairNativeFrameSnapshots} from './check-native-frame-replay.mjs';
import {replayNativeDriveFrame} from './lib/native-frame-drive-continuation.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {replayNativeControlPrefix,verifyNativeControlPrefixEvidence,probeNativeControlDependencies} from './lib/native-frame-control-continuation.mjs';
import {inspectNativeFrameIdentity,compareNativeFrameIdentity} from './lib/native-frame-identity.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export function compareNativeControlOutput(source,after){
  const expected=createCapturedMemory(after.ranges instanceof Map?[...after.ranges.values()]:after.ranges),regions=[];let bytesCompared=0,differingBytes=0,firstDivergence=null;
  for(const region of source.manifest.requiredRegions){
    if(region.comparison==='abi-input')continue;
    const actual=source.span(region.address,region.length),native=expected.span(region.address,region.length);let count=0;
    for(let index=0;index<region.length;index++)if(actual[index]!==native[index]){count++;if(firstDivergence===null)firstDivergence={region:region.id,address:region.address+index,sourceByte:actual[index],nativeByte:native[index]};}
    bytesCompared+=region.length;differingBytes+=count;regions.push({id:region.id,address:region.address,length:region.length,differingBytes:count});
  }
  const owned=(source.ownedRegions??[]).map(region=>{const actual=source.span(region.address,region.length),native=expected.span(region.address,region.length);let differingBytes=0;for(let index=0;index<region.length;index++)if(actual[index]!==native[index])differingBytes++;return {...region,differingBytes};});
  let parentAbiBytesCompared=0,differingParentAbiBytes=0;
  if(Number.isInteger(source.report?.childEsp)){
    //Actual direct-call return, four450e50 saves, outerreturn andtotalargument.
    //Other private scratch remains explicit ABIinput, not a register oracle.
    const address=source.report.childEsp,actual=source.span(address,28),native=expected.span(address,28);parentAbiBytesCompared=28;
    for(let i=0;i<28;i++)if(actual[i]!==native[i]){differingParentAbiBytes++;if(firstDivergence===null)firstDivergence={region:'parent-direct-call-abi',address:address+i,sourceByte:actual[i],nativeByte:native[i]};}
  }
  let uniqueBytesCompared=0,coveredEnd=-1;
  for(const region of [...regions].sort((a,b)=>a.address-b.address)){
    const end=region.address+region.length;uniqueBytesCompared+=Math.max(0,end-Math.max(region.address,coveredEnd));coveredEnd=Math.max(coveredEnd,end);
  }
  return {matched:differingBytes===0&&differingParentAbiBytes===0&&owned.every(row=>row.differingBytes===0),bytesCompared,uniqueBytesCompared,overlappingComparedBytes:bytesCompared-uniqueBytesCompared,differingBytes,parentAbiBytesCompared,differingParentAbiBytes,firstDivergence,regions,protectedControlBytes:owned.reduce((sum,row)=>sum+row.length,0),owned};
}

export async function checkNativeFrameControlPrefix(input,output,{dependencyProbe=false,frameOptions={}}={}){
  const proof=await verifyNativeControlPrefixEvidence(),capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json')));
  const pairing=dependencyProbe?pairNativeFrameSnapshots(capture,configuration):pairNativeControlSnapshots(capture,configuration);
  await mkdir(output);for(const name of ['configuration.json','trace.jsonl'])await copyFile(path.join(input,name),path.join(output,name),constants.COPYFILE_EXCL);
  const report={schemaVersion:1,method:dependencyProbe?'mis-scheduled-native-input-dependency-probe':'genuine-native-prephysics-prefix',matched:!dependencyProbe,sourceComplete:false,targetSha256:REDUX_SHA256,evidence:proof,authority:dependencyProbe?'dependency-diagnostic-only':'original-process-with-declared-instrumentation',captureDirectory:path.resolve(input),frames:[],skipFrames:pairing.skipFrames,stackPolicy:pairing.options,completion:capture.complete,interventions:capture.interventions,limits:['This prephysics boundary proof does not close previous postphysics producers, the clock decision or a source-only continuous trajectory.','No captured AI/control outputs, invented zero state, constructor, default tables or inert child callback are supplied.']};
  for(const pair of pairing.pairs){
    let source;const intermediate=[];
    try{
      if(dependencyProbe){source=await replayNativeDriveFrame(pair.before,{...pairing.options,...frameOptions,moduleBaseAddress:pair.moduleBaseAddress});report.frames.push(probeNativeControlDependencies(source,{entryEsp:Number(pair.after.registers.esp)}));break;}
      source=replayNativeControlPrefix(pair.before,{...pairing.options,...frameOptions,moduleBaseAddress:pair.moduleBaseAddress,onBeforeStage:({source:current,stage,calls})=>{
        if(!pair.checkpoints?.afterAi)return;
        const comparison=compareNativeControlOutput(current,pair.checkpoints.afterAi);intermediate.push({boundary:'0x450f18',beforeStage:stage,completedCalls:calls,comparison});
      }});
      const comparison=compareNativeControlOutput(source,pair.after),identity=compareNativeFrameIdentity(inspectNativeFrameIdentity(pair.before,source.manifest),inspectNativeFrameIdentity(pair.after,source.manifest));
      report.frames.push({beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,matchingHit:pair.before.matchingHit,logicalClock:pair.logicalClock,identity,execution:source.report,intermediate,comparison});if(!comparison.matched||intermediate.some(row=>!row.comparison.matched))report.matched=false;
    }catch(error){report.matched=false;report.frames.push({beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,logicalClock:pair.logicalClock,replayStage:error.replayStage??'control-prefix-comparison',partialSourceExecution:error.nativeControlProgress??null,intermediate,error:error.stack});break;}
  }
  report.comparedFrames=report.frames.filter(row=>row.comparison).length;report.bytesCompared=report.frames.reduce((sum,row)=>sum+(row.comparison?.bytesCompared??0),0);
  report.sourceComplete=!dependencyProbe&&report.comparedFrames===pairing.frames&&report.matched;
  await writeFile(path.join(output,'report.json'),`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});return {report,output:path.resolve(output)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [input,output,mode]=process.argv.slice(2);if(!input||!output||(mode!==undefined&&mode!=='--dependency-probe'))throw Error('Usage: node tools/check-native-frame-control-prefix.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY [--dependency-probe]');
  const result=await checkNativeFrameControlPrefix(input,output,{dependencyProbe:mode==='--dependency-probe'}),failed=result.report.frames.find(row=>row.error||row.failure||row.comparison?.matched===false);console.log(JSON.stringify({matched:result.report.matched,sourceComplete:result.report.sourceComplete,comparedFrames:result.report.comparedFrames,bytesCompared:result.report.bytesCompared,...(failed?{firstFailure:{stage:failed.replayStage,error:(failed.error??failed.failure)?.split('\n')[0],missingInput:failed.missingInput,firstDivergence:failed.comparison?.firstDivergence}}:{}),intermediate:result.report.frames.flatMap(frame=>(frame.intermediate??[]).map(row=>({boundary:row.boundary,matched:row.comparison.matched,bytesCompared:row.comparison.bytesCompared,differingBytes:row.comparison.differingBytes,firstDivergence:row.comparison.firstDivergence,protectedControlBytes:row.comparison.protectedControlBytes}))),output:result.output}));if(!result.report.matched)process.exitCode=1;
}
