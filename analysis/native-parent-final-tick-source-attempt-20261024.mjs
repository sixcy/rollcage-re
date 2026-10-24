//Read-only continuation diagnostic. Only ordinal450e50 entry supplies game bytes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {nativeParentLateReplayRegions} from '../tools/check-native-parent-tail.mjs';
import {nativeControlSound19ObservedRegions} from '../tools/lib/native-control-sound-inputs.mjs';
import {nativeControlTyreSound2ObservedRegions} from '../tools/lib/native-control-tyre-sound-inputs.mjs';
import {nativeControlSurfaceSound7ObservedRegions} from '../tools/lib/native-control-surface-sound-inputs.mjs';
import {nativeParentWeatherCounterInputRegions,createNativeParentWeatherCounterBinding} from '../tools/lib/native-parent-weather-counter.mjs';
import {createNativeControlSoundCreationBindings} from '../tools/lib/native-control-sound-creation.mjs';
import {replayNativeControlThroughPhysics} from '../tools/lib/native-control-physics.mjs';
import {bindNativeParentTail,executeNativeParentTail} from '../tools/lib/native-parent-tail.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeParentRttiBindings} from '../tools/lib/native-parent-rtti.mjs';
import {verifyNativeParentRttiCaptureRecords} from '../tools/lib/native-parent-rtti-capture.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const directory='analysis/native-parent-rtti-stock-capture-v8-20261024';
const output=process.argv[2]??'analysis/native-parent-final-tick-source-attempt-20261024.json';
const capture=await loadPhysicsCapture(directory,{expectedSha256:REDUX_SHA256});
const configuration=JSON.parse(await readFile(`${directory}/configuration.json`));
const records=(await readFile(`${directory}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0];
if(pairing.pairs.length!==1)throw Error('Diagnostic expects exactly one authenticated original parent.');
const proof=verifyNativeParentRttiCaptureRecords({capture,configuration,records,pair});
const options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
const additionalRegions=[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),
  ...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress),...nativeControlTyreSound2ObservedRegions(pair.before,pair.moduleBaseAddress),
  ...nativeControlSurfaceSound7ObservedRegions(pair.before,pair.moduleBaseAddress),...nativeParentWeatherCounterInputRegions(pair.before,pair.moduleBaseAddress)];
const source=replayNativeControlThroughPhysics(pair.before,{...options,createControlAudioBindings:createNativeControlSoundCreationBindings,additionalRegions});
const initial=createCapturedMemory([...pair.before.ranges.values()]);
const bound=bindNativeParentTail(source,{snapshot:pair.before,includeLateInputs:true});
const rtti=createNativeParentRttiBindings({capture,pair,memory:bound.memory,initialSpan:initial.span,weatherScreenQueries:true});
const counter=createNativeParentWeatherCounterBinding({proof:proof.weatherCounter,memory:bound.memory});
const report={schemaVersion:1,scope:'Pure source continuation beyond observed world-effects; no native final/next-tick comparison',targetSha256:REDUX_SHA256,
  captureDirectory:directory,beforeOrdinal:pair.before.ordinal,moduleBaseAddress:pair.moduleBaseAddress,entryEsp:source.prefixReport.entryEsp,
  requestedThrough:'parent-return',completed:false,matchedNativeFinal:false,stages:[],externalInputs:'Only already authenticated same-process CRT RTTI and weather QPC external outcomes; game memory only from original parent entry.',
  limits:['The original capture stops at451120. All newly executed later stages lack an original-process final comparison.','No intermediate/after native snapshot supplies game state.','Private CPU POP/RET and outer450d60 are not performed by this continuation.']};
try{
  const result=executeNativeParentTail(bound,{through:'parent-return',crtDynamicCast:rtti.crtDynamicCast,weatherCounterService:counter.platformCall,
    onStage:row=>{report.stages.push({stage:row.stage,entry:row.entry,returnAddress:row.returnAddress,report:row.report});if(row.stage==='world-effects'){rtti.assertComplete({through:'world-effects'});counter.assertComplete();}}});
  report.completed=true;report.execution=result.report;
}catch(error){report.error=error.stack;report.progress=error.nativeParentTailProgress;report.dependency=error.nativeParentTailDependency;report.boundary=error.boundary;}
report.rttiEvents=rtti.events;report.counterEvents=counter.events;
report.files=[];
for(const name of ['tools/lib/native-parent-tail.mjs','src/race-update.mjs','src/race-phase-state.mjs','src/race-phase-audio.mjs',`${directory}/configuration.json`,`${directory}/trace.jsonl`]){
  const data=await readFile(name);report.files.push({path:name,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
}
await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({output,completed:report.completed,stages:report.stages.map(row=>row.stage),error:report.error?.split('\n')[0],lastCall:report.progress?.lastCall,dependency:report.dependency}));
