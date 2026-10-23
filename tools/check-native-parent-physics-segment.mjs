//Independent4749e0 replay inside an observed450e50 call. Its actual physics
//entry is the input boundary; this cannot establish the earlier parent prefix.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots,verifyNativeControlBoundaries} from './lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from './lib/native-parent-tail-inputs.mjs';
import {nativeControlAdditionalRegions} from './lib/native-frame-control-continuation.mjs';
import {nativeParentLateReplayRegions} from './check-native-parent-tail.mjs';
import {replayNativeFrame} from './lib/native-frame-replay.mjs';
import {compareNativeFramePair} from './check-native-frame-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export function compareNativePhysicsReturnLocal(source,pair){
  const address=Number(pair.after.registers.esp)-4,sourceValue=source.span(address,4).readUInt32LE();
  const stack=pair.physicsAfter.ranges.get('frame-stack'),offset=address-Number(stack.address),nativeValue=stack.bytes.readUInt32LE(offset),nativeEcx=Number(pair.physicsAfter.registers.ecx);
  return {address,sourceValue,nativeValue,nativeEcx,matched:sourceValue===nativeValue&&nativeEcx===nativeValue};
}

export function replayNativeParentPhysicsSegment(pair,options,{lateStages=0}={}){
  const before=pair.after,after=pair.physicsAfter;
  if(!after||!pair.physicsReturnLocal)throw Error('Independent parent physics requires the proven entry/preRET and actual popped local.');
  const replayOptions={...options,moduleBaseAddress:pair.moduleBaseAddress};
  const additionalRegions=[...nativeParentTailAdditionalRegions(before,replayOptions),...(lateStages?nativeParentLateReplayRegions(before,pair.moduleBaseAddress,replayOptions):[])];
  additionalRegions.push(...nativeControlAdditionalRegions(before,{...replayOptions,additionalRegions}));
  const sourceDispatches=[],source=replayNativeFrame(before,{...replayOptions,additionalRegions,onCollisionDispatch:event=>sourceDispatches.push(event)});
  return {source,comparison:compareNativeFramePair({before,after},source),returnLocal:compareNativePhysicsReturnLocal(source,pair),sourceDispatches};
}

export async function checkNativeParentPhysicsSegment(input,output){
  const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'))),pairing=pairNativeControlSnapshots(capture,configuration),evidence=await verifyNativeControlBoundaries();
  if(!pairing.physicsExitCheckpoint)throw Error('Parent capture has no original physics preRET boundary.');
  await mkdir(output);
  const report={schemaVersion:1,method:'independent-source-physics-from-observed-physics-entry',targetSha256:REDUX_SHA256,captureDirectory:path.resolve(input),evidence,joinedParentMatched:false,completeParentTickMatched:false,matched:true,cases:[],completion:capture.complete,
    limits:['Each physics replay starts from actual4749e0 input, not source-carried450e50 output.','Source dispatcher traces are diagnostics; this capture contains no independent original per-dispatch snapshots.','The popped ECX local is separately compared; other private ABI/status and continuous native cadence remain unproved.']};
  for(const pair of pairing.pairs){
    const row={beforeOrdinal:pair.after.ordinal,afterOrdinal:pair.physicsAfter.ordinal,tid:pair.after.tid,logicalClock:pair.logicalClock};report.cases.push(row);
    try{
      const {source, ...result}=replayNativeParentPhysicsSegment(pair,pairing.options,{lateStages:pairing.lateStages});
      Object.assign(row,result,{matched:result.comparison.matched&&result.returnLocal.matched});
    }catch(error){row.matched=false;row.error=error.stack;row.replayStage=error.replayStage;}
    report.matched&&=row.matched;
  }
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [input,output]=process.argv.slice(2);if(!input||!output||process.argv.length!==4)throw Error('Usage: node tools/check-native-parent-physics-segment.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report=await checkNativeParentPhysicsSegment(input,output);
  console.log(JSON.stringify({matched:report.matched,joinedParentMatched:false,cases:report.cases.map(row=>({matched:row.matched,bytes:row.comparison?.comparedBytes,source:row.comparison?.sourceReport,returnLocal:row.returnLocal,error:row.error?.split('\n')[0]})),output}));
  if(!report.matched)process.exitCode=1;
}
