import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from './check-native-frame-replay.mjs';
import {traceNativeFrameDispatches,compareNativeDispatchSnapshots} from './lib/native-frame-event-trace.mjs';
import {nativeEventBoundaries,verifyNativeEventBoundaries} from './inspect-native-frame-events.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export function verifyNativeEventFrameConfiguration(configuration) {
  const pending=configuration.pendingFrameObserver,eventId=pending?.eventBreakpointId??'native-dispatch-entry';
  const event=configuration.breakpoints?.find(row=>row.id===eventId),predicate=event?.captureWhen?.range;
  if(Number(event?.rva)!==nativeEventBoundaries.dispatchEntry-0x400000||event.stopAfterHits>0||event.skipMatchingHits!==undefined)throw Error('Native dispatcher breakpoint must observe every matching entry without an early stop.');
  for(const[id,register,length]of[['dispatch-event','ecx',0x68],['dispatch-return','esp',4]]){
    const row=event.ranges?.find(range=>range.id===id);
    if(row?.baseRegister!==register||row.length!==length||row.address!==undefined||row.rva!==undefined||row.readableRegion||row.dereferenceOffsets?.length||Number(row.offset??0)!==0)throw Error(`Native ${id} range differs from its exact ABI input.`);
  }
  if(configuration.phaseActions?.some(row=>row.breakpointId===eventId))throw Error('Native event observations cannot perform phase writes.');
  if(pending){
    const keys=['beforeBreakpointId','afterBreakpointId','eventBreakpointId','maxPendingBytes','maxCandidateFrames','maxEventSnapshots','eventStackOffset','eventReturnRva','eventPointerRegister','eventPoolRoot','eventPoolCapacity','eventRecordBytes'];
    if(Object.keys(pending).some(key=>!keys.includes(key)))throw Error('Full-stream pending dispatch comparison rejects unknown/subset event filters.');
    if(pending.beforeBreakpointId!=='native-frame-before'||pending.afterBreakpointId!=='native-frame-after'||!eventId||pending.eventStackOffset!==-28||Number(pending.eventReturnRva)!==0x74ada||pending.eventPointerRegister!=='ecx'||pending.eventRecordBytes!==104)throw Error('Pending dispatch selector differs from the exact native frame/caller ABI.');
    for(const[key,maximum]of[['maxPendingBytes',134217728],['maxCandidateFrames',600],['maxEventSnapshots',64]])if(!Number.isSafeInteger(pending[key])||pending[key]<1||pending[key]>maximum)throw Error(`Invalid pending dispatch ${key} bound.`);
    for(const[key,rva]of[['eventPoolRoot',0x502ba8],['eventPoolCapacity',0x502ba4]]){
      const row=pending[key];if(Number(row?.rva)!==rva||row.length!==4||row.address!==undefined||row.baseRegister!==undefined||row.readableRegion||row.dereferenceOffsets?.length||Number(row.offset??0)!==0)throw Error('Pending dispatch pool observer differs from the native queue roots.');
    }
    let subset='all';
    if(event.captureWhen!==undefined&&event.captureWhen!==null){
      if(event.captureWhen.equalsBytesHex!=='00000000'||predicate?.baseRegister!=='ecx'||predicate.length!==4||predicate.address!==undefined||predicate.rva!==undefined||predicate.readableRegion||predicate.maxRegionBytes||predicate.dereferenceOffsets?.length||Number(predicate.offset??0)!==0)throw Error('Pending dispatch comparison requires the unfiltered full event stream or explicit exact kind0 body-pair subset.');
      subset='body-pair';
    }
    return {mode:'pending-frame',subset,logicalClock:null,eventBreakpointId:eventId};
  }
  if(Number(predicate?.rva)!==0x50a548||predicate.length!==4||predicate.address!==undefined||predicate.baseRegister!==undefined||predicate.readableRegion||predicate.dereferenceOffsets?.length||Number(predicate.offset??0)!==0)throw Error('Native dispatcher requires the exact logical-clock root predicate.');
  const hex=event.captureWhen.equalsBytesHex;
  if(typeof hex!=='string'||!/^[0-9a-f]{8}$/i.test(hex))throw Error('Native dispatcher logical-clock predicate must be four exact bytes.');
  return {mode:'fixed-clock',logicalClock:Buffer.from(hex,'hex').readUInt32LE(),eventBreakpointId:eventId};
}

export async function checkNativeEventFrameReplay(input,output) {
  const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8')),selection=verifyNativeEventFrameConfiguration(configuration),pairing=pairNativeFrameSnapshots(capture,configuration);
  if(pairing.pairs.length!==1)throw Error('Direct native dispatcher comparison requires exactly one complete parent frame.');
  const pair=pairing.pairs[0],beforeClock=pair.before.ranges.get('clock').bytes.readUInt32LE(),afterClock=pair.after.ranges.get('clock').bytes.readUInt32LE();
  if(selection.mode==='pending-frame')selection.logicalClock=beforeClock;
  if(beforeClock!==selection.logicalClock||afterClock!==selection.logicalClock)throw Error('Complete native frame clock differs from dispatcher selection.');
  const nativeSnapshots=capture.snapshots.filter(row=>row.breakpointId===selection.eventBreakpointId);
  let frame,dispatch,sourceEvents=[],partialSourceRecords;
  try{
    const replay=traceNativeFrameDispatches(pair.before,pair.options);sourceEvents=replay.dispatchEvents;frame=compareNativeFramePair(pair,replay);
    try{dispatch=compareNativeDispatchSnapshots(nativeSnapshots,sourceEvents,{...pair,...selection,sourceProcessedEvents:replay.report.processedEvents});}
    catch(error){dispatch={matched:false,firstDivergence:{kind:'observation-contract',error:error.message},events:[]};}
    if(!dispatch.events.length&&dispatch.matched){dispatch.matched=false;dispatch.firstDivergence={kind:'no-dispatched-events',nativeCount:nativeSnapshots.length,sourceCount:0};}
  }catch(error){
    frame={matched:false,replayStage:error.replayStage??null,replayError:error.stack??String(error)};
    dispatch={matched:false,firstDivergence:{kind:'source-replay-failed',error:error.message??String(error)},events:[]};partialSourceRecords=error.dispatchRecords??[];
  }
  const report={schemaVersion:1,authority:'original-process-direct-dispatch-and-complete-frame-comparison',matched:frame.matched&&dispatch.matched,
    clock:selection.logicalClock,selectionMode:selection.mode,dispatchScope:selection.subset==='body-pair'?'kind0-body-pair-substream':'complete-dispatch-stream',
    method:selection.subset==='body-pair'?'Compare only exact native kind0 dispatcher entries against the ordered source kind0 subset; verify the full source processed count against all observed native dispatcher calls. Uncaptured terrain dispatcher records are not claimed.':'Compare every native dispatcher entry against the complete ordered source dispatch stream.',
    frame:{beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,...frame},dispatch,
    sourceEvents,...(partialSourceRecords?{partialSourceRecords}:{}),eventBoundaryEvidence:await verifyNativeEventBoundaries(),
    limits:['Direct native474bb0 entries compare ordered exact104-byte postfilter event records, event pointers and signedEDX deltas.','Complete paired4749e0 final semantic bytes/return are a separate comparison; no native dispatcher-exit snapshots are implied.','Source after-dispatch body state is an observer trace; its final whole-frame agreement does not independently isolate every intermediate native write.','No native game is launched by this checker.']};
  await mkdir(output);
  for(const name of ['configuration.json','trace.jsonl'])await copyFile(path.join(input,name),path.join(output,name),constants.COPYFILE_EXCL);
  await writeFile(path.join(output,'report.json'),`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/check-native-event-frame-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report=await checkNativeEventFrameReplay(input,output);console.log(JSON.stringify({matched:report.matched,clock:report.clock,events:report.dispatch.events.length,dispatchDivergence:report.dispatch.firstDivergence,frameDivergence:report.frame.firstDivergence,output}));if(!report.matched)process.exitCode=1;
}
