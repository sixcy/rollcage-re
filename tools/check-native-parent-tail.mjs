//Compare saved native checkpoints against a single source-carried execution.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots,verifyNativeControlBoundaries} from './lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from './lib/native-parent-tail-inputs.mjs';
import {replayNativeControlThroughPhysics} from './lib/native-control-physics.mjs';
import {continueNativeParentTail,verifyNativeParentTailEvidence} from './lib/native-parent-tail.mjs';
import {verifyNativeDriveContinuationEvidence} from './lib/native-frame-drive-continuation.mjs';
import {verifyNativeControlPrefixEvidence} from './lib/native-frame-control-continuation.mjs';
import {compareNativeControlOutput} from './check-native-frame-control-prefix.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function checkNativeParentTail(input,output){
  const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256});
  const configuration=JSON.parse(await readFile(path.join(input,'configuration.json')));
  const pairing=pairNativeControlSnapshots(capture,configuration);
  if(!pairing.postphysics)throw Error('Parent-tail comparison requires actual postphysics checkpoints.');
  const proof=await Promise.all([verifyNativeControlBoundaries(),verifyNativeControlPrefixEvidence(),verifyNativeParentTailEvidence(),verifyNativeDriveContinuationEvidence()]);
  await mkdir(output);for(const name of ['configuration.json','trace.jsonl'])await copyFile(path.join(input,name),path.join(output,name),constants.COPYFILE_EXCL);
  const report={schemaVersion:1,method:'source-carried-parent-entry-through-postphysics-drive',authority:'original-process-with-declared-instrumentation',targetSha256:REDUX_SHA256,
    captureDirectory:path.resolve(input),evidenceIds:[...new Set(proof.flatMap(row=>row.evidenceIds))],matched:true,sourceComplete:false,frames:[],completion:capture.complete,
    limits:['Only450e50 entry through45109c is attempted; wheel/camera/weather/final parent stages and the next tick remain open.',
      'All replay inputs come from parent entry; intermediate/exit native bytes are comparison-only.',
      'Full private CPU/CRT ABI and unobserved scenarios are not established by checkpoint memory parity.']};
  for(const pair of pairing.pairs){
    const frame={beforeOrdinal:pair.before.ordinal,logicalClock:pair.logicalClock,stages:[]};report.frames.push(frame);
    try{
      const options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
      const source=replayNativeControlThroughPhysics(pair.before,{...options,additionalRegions:nativeParentTailAdditionalRegions(pair.before,options),
        onBeforeStage:({source})=>{if(pair.checkpoints?.afterAi)frame.afterAi=compareNativeControlOutput(source,pair.checkpoints.afterAi);},
        onPrefixComplete:source=>{frame.prefix=compareNativeControlOutput(source,pair.after);}});
      frame.physics=compareNativeControlOutput(source,pair.physicsAfter);
      const result=continueNativeParentTail(source,{snapshot:pair.before,onStage:row=>{
        const expected=pair.postphysics[row.stage];if(!expected)throw Error('Undeclared source parent-tail stage.');
        frame.stages.push({stage:row.stage,nativeOrdinal:expected.ordinal,comparison:compareNativeControlOutput(row.source,expected),execution:row.report});
      }});
      frame.execution=result.tailReport??result.report;
      frame.matched=frame.physics.matched&&frame.prefix.matched&&(!frame.afterAi||frame.afterAi.matched)&&frame.stages.length===3&&frame.stages.every(row=>row.comparison.matched);
      if(!frame.matched)report.matched=false;
    }catch(error){frame.error=error.stack;frame.replayStage=error.replayStage;frame.partialExecution=error.nativeParentTailProgress;report.matched=false;break;}
  }
  report.comparedFrames=report.frames.filter(frame=>frame.stages.length===3).length;
  report.sourceComplete=report.matched&&report.comparedFrames===pairing.frames;
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  return {report,output:path.resolve(output)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [input,output]=process.argv.slice(2);if(!input||!output||process.argv.length>4)throw Error('Usage: node tools/check-native-parent-tail.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const {report}=await checkNativeParentTail(input,output);
  console.log(JSON.stringify({matched:report.matched,sourceComplete:report.sourceComplete,comparedFrames:report.comparedFrames,
    frames:report.frames.map(frame=>({physics:frame.physics?.matched,stages:frame.stages.map(row=>({stage:row.stage,matched:row.comparison.matched,uniqueBytes:row.comparison.uniqueBytesCompared,firstDivergence:row.comparison.firstDivergence})),error:frame.error?.split('\n')[0]})),output}));
  if(!report.matched)process.exitCode=1;
}
