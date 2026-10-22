// Genuine47ccc0 parent observer. Never relabels a4749e0/prepass observation,
// installs a route/placement answer, or launches the original executable.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {nativePostFrameBoundaries} from './lib/native-post-frame-replay.mjs';
import {replayNativeRecoveryParent,verifyNativeRecoveryParentBoundaries} from './lib/native-recovery-parent-replay.mjs';
import {compareNativePrepassPair} from './check-native-prepass-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {verifyNativeRecoverySelection,verifyNativeRecoveryApplicationSnapshots,compareNativeRecoveryApplications,nativeRecoverySelectionProofKeys} from './lib/native-recovery-selection.mjs';
import {verifyControlledNativeRecoveryConfiguration,verifyControlledNativeRecoveryEvidence} from './lib/native-controlled-recovery.mjs';

const ids=['native-recovery-before','native-recovery-after'],boundary=nativePostFrameBoundaries.parent;
function moduleBase(snapshot){
  const values=new Set([snapshot.moduleBaseAddress,...snapshot.ranges.values()].map(row=>typeof row==='object'?row.moduleBaseAddress:row).filter(value=>value!==undefined&&value!==null).map(Number));
  if(values.size!==1)throw Error('Native recovery requires one observed module base.');return [...values][0];
}
function observerPolicy(bp){
  const stack=bp?.ranges?.find(row=>row.id==='frame-stack'),before=-Number(stack?.offset),after=Number(stack?.length)-before,queue=bp?.ranges?.find(row=>row.id==='attachment-queue'),gate=bp?.captureWhen,row=gate?.range;
  if(stack?.baseRegister!=='esp'||stack.rva!==undefined||stack.address!==undefined||stack.readableRegion||stack.dereferenceOffsets?.length||!Number.isInteger(before)||before<104||before>65536||after!==4)throw Error('Native recovery requires explicit ESP local/callee/return coverage.');
  if(Number(queue?.rva)!==0x502040||!Number.isInteger(queue.length)||queue.length<4||queue.length>65536||queue.length%4||queue.readableRegion||queue.dereferenceOffsets?.length)throw Error('Native recovery attachment observation differs.');
  if(gate?.equalsBytesHex!=='04000000'||Number(row?.rva)!==0x1ecb1c||Number(row.offset)!==0x57c||row.length!==4||row.readableRegion||row.baseRegister!==undefined||row.address!==undefined||JSON.stringify(row.dereferenceOffsets)!=='["0"]')throw Error('Native recovery active-phase observer differs.');
  return {stackBytesBefore:before,stackBytesAfter:4,attachmentWindowBytes:queue.length};
}
export function pairNativeRecoverySnapshots(capture,configuration){
  if(capture.header?.executableSha256!==REDUX_SHA256)throw Error('Native recovery target SHA differs.');
  const beforeBp=configuration.breakpoints?.find(row=>row.id===ids[0]),afterBp=configuration.breakpoints?.find(row=>row.id===ids[1]);
  if(Number(beforeBp?.rva)!==boundary.entry-0x400000||Number(afterBp?.rva)!==boundary.exit-0x400000)throw Error('Native recovery parent boundary RVAs differ.');
  const options=observerPolicy(beforeBp);if(JSON.stringify(options)!==JSON.stringify(observerPolicy(afterBp)))throw Error('Native recovery observation policies differ.');
  const skipFrames=beforeBp.skipMatchingHits??0;if(!Number.isInteger(skipFrames)||skipFrames<0||skipFrames>0x7fffffff||skipFrames!==(afterBp.skipMatchingHits??0))throw Error('Native recovery skip windows differ.');
  const frames=afterBp.stopAfterHits;
  const selection=verifyNativeRecoverySelection(configuration),selected=selection.mode!=='all';
  if(!Number.isInteger(frames)||frames<1||frames>3||beforeBp.stopAfterHits>0||configuration.phaseActions?.some(row=>ids.includes(row.breakpointId)))throw Error('Native recovery requires bounded observer-only calls.');
  const controlledInput=verifyControlledNativeRecoveryConfiguration(configuration);
  if(selected&&(frames!==1||!capture.complete?.pendingFrameSelection))throw Error('Selected recovery lacks complete one-parent terminal proof.');
  if(capture.complete?.reason!=='snapshot-bound'||capture.snapshots.at(-1)?.breakpointId!==ids[1]||capture.snapshots.at(-1).hit!==frames)throw Error('Native recovery lacks its complete terminal bound.');
  const pairs=[],pending=new Map();let entries=0,exits=0;
  for(const snapshot of capture.snapshots){
    if(!ids.includes(snapshot.breakpointId))continue;
    const before=snapshot.breakpointId===ids[0],base=moduleBase(snapshot),esp=Number(snapshot.registers?.esp),session=snapshot.ranges.get('session'),stack=snapshot.ranges.get('frame-stack'),gate=snapshot.captureWhen;
    const group=snapshot.pendingFrame,candidate=selected?group?.candidateIndex:snapshot.hit;
    if(selected&&(!group||snapshot.deferredPublication!==true||snapshot.hit!==1||!Number.isInteger(candidate)||candidate<1||candidate>selection.maxCandidateFrames||group.role!==(before?'before':'after')||group.frameTid!==snapshot.tid||Number(group.frameEntryEsp)!==esp||group.frameMatchingHit!==snapshot.matchingHit||!Number.isInteger(group.observedEventHits)||!Number.isInteger(group.qualifyingEventSnapshots)||group.observedEventHits!==group.qualifyingEventSnapshots||group.observedEventHits<1||group.observedEventHits>selection.maxEventSnapshots||!Number.isInteger(snapshot.observedDebugEventOrdinal)||!Number.isFinite(snapshot.observedElapsedMs)))throw Error('Selected recovery lacks deferred candidate/ABI/all-call proof.');
    if(!selected&&group)throw Error('Pending recovery evidence lacks its opt-in observer policy.');
    if(Number(snapshot.registers?.eip)!==base+(before?boundary.entry:boundary.exit)-0x400000||!Number.isSafeInteger(esp)||!session||session.bytes.length<0x590||session.bytes[0x54d]!==6||session.bytes.readUInt32LE(0x57c)!==4||!stack||Number(stack.address)!==esp-options.stackBytesBefore||stack.bytes.length!==options.stackBytesBefore+4)throw Error('Native recovery entry/exit/stack/session identity differs.');
    if(gate?.actualBytesHex!=='04000000'||gate.equalsBytesHex!=='04000000'||Number(gate.address)!==Number(session.address)+0x57c||!Number.isInteger(snapshot.rawHit)||snapshot.rawHit<snapshot.hit||(snapshot.matchingHit!==undefined&&(snapshot.matchingHit!==skipFrames+candidate||snapshot.matchingHit>snapshot.rawHit))||((Object.hasOwn(beforeBp,'skipMatchingHits')||Object.hasOwn(afterBp,'skipMatchingHits'))&&snapshot.matchingHit===undefined))throw Error('Native recovery lacks matching-hit/active predicate proof.');
    const returnAddress=stack.bytes.readUInt32LE(options.stackBytesBefore);if(returnAddress!==base+boundary.returnAddress-0x400000)throw Error('Native recovery caller return differs from45101c CALL.');
    if(selected&&Number(group.frameReturnAddress)!==returnAddress)throw Error('Selected recovery parent caller proof differs.');
    if(before){if(pending.has(snapshot.tid)||snapshot.hit!==++entries)throw Error('Nested/nonsequential native recovery entry.');pending.set(snapshot.tid,{snapshot,base,esp,returnAddress});}
    else{const entry=pending.get(snapshot.tid);if(!entry||snapshot.hit!==++exits||entry.snapshot.hit!==snapshot.hit||entry.base!==base||entry.esp!==esp||entry.returnAddress!==returnAddress||Number(entry.snapshot.ranges.get('session').address)!==Number(session.address))throw Error('Missing same-thread same-ESP native recovery entry.');pending.delete(snapshot.tid);
      if(selected){for(const key of nativeRecoverySelectionProofKeys)if(entry.snapshot.pendingFrame[key]!==group[key]||capture.complete.pendingFrameSelection[key]!==group[key])throw Error('Selected recovery entry/after/terminal proof differs.');if(entry.snapshot.observedDebugEventOrdinal>=snapshot.observedDebugEventOrdinal||entry.snapshot.observedElapsedMs>snapshot.observedElapsedMs)throw Error('Selected recovery observation order differs.');}
      pairs.push({before:entry.snapshot,after:snapshot,moduleBaseAddress:base,returnAddress,options});}
  }
  if(pending.size||pairs.length!==frames||entries!==frames||exits!==frames)throw Error('Incomplete native recovery pairs.');
  if(selected)pairs[0].nativeApplications=verifyNativeRecoveryApplicationSnapshots(capture,pairs[0],selection);
  if(controlledInput)pairs[0].controlledInput=verifyControlledNativeRecoveryEvidence(capture,pairs[0],configuration);
  return {pairs,frames,skipFrames,options,selection,controlledInput};
}

export async function checkNativeRecoveryReplay(input,output){
  const evidence=await verifyNativeRecoveryParentBoundaries(),capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8')),pairing=pairNativeRecoverySnapshots(capture,configuration),cases=[];
  await mkdir(output);for(const filename of ['configuration.json','trace.jsonl'])await copyFile(path.join(input,filename),path.join(output,filename),constants.COPYFILE_EXCL);
  for(const pair of pairing.pairs){
    const row={beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,tid:pair.before.tid,entryEsp:pair.before.registers.esp,...(pair.controlledInput?{controlledInput:pair.controlledInput}:{})},sourceApplications=[];let complete=false;
    try{Object.assign(row,compareNativePrepassPair(pair,replayNativeRecoveryParent(pair.before,{...pair.options,moduleBaseAddress:pair.moduleBaseAddress,onRecoveryApply:record=>sourceApplications.push(record)})));complete=true;}
    catch(error){Object.assign(row,{matched:false,replayStage:error.replayStage??null,replayError:error.stack});}
    if(pair.nativeApplications){row.applicationComparison=compareNativeRecoveryApplications(pair.nativeApplications,sourceApplications,{sourceComplete:complete,respawnedBodies:row.sourceReport?.respawnedBodies});row.matched&&=row.applicationComparison.matched;row.firstDivergence??=row.applicationComparison.firstDivergence;row.pendingFrame=pair.before.pendingFrame;}
    cases.push(row);
  }
  const report={schemaVersion:1,targetSha256:REDUX_SHA256,authority:pairing.controlledInput?.authority??'original-process-with-declared-instrumentation',method:(pairing.controlledInput?'Controlled native input: exact guarded caller229/clock228 supplies firstbody state32 before the parent snapshot; this is not a natural recovery trigger. ':'')+'Actual47ccc0 entry/singlepreRET47d02d, original45101c caller, same-thread same-ESP pairing. Existing raw parent consumes captured clone/routes/geometry/pools/progression. All declared core/recovery/geometry/reached route-controller spans compare exactly; no placement answers or pose resets supplied.',captureDirectory:path.resolve(input),frames:pairing.frames,skipFrames:pairing.skipFrames,selectionMode:pairing.selection.mode,stackPolicy:pairing.options,boundaryEvidence:evidence.evidenceIds,matched:cases.every(row=>row.matched),firstDivergence:cases.find(row=>!row.matched)??null,cases,completion:capture.complete,interventions:capture.interventions,limits:['Parent observations with zero respawns do not establish positive native route/query/application/emission execution.','Private ABI stack, volatileEAX/ECX/EDX/EFLAGS and unreconstructed external completion/audio services are excluded; reached missing services fail explicitly.','Selected application input-stream evidence is separate from final parent output; partial source records survive a later replay failure.','This checks independent parent calls, not externally closed consecutive game frames.']};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return {report,output:path.resolve(output)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/check-native-recovery-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const result=await checkNativeRecoveryReplay(input,output);console.log(JSON.stringify({matched:result.report.matched,frames:result.report.frames,firstDivergence:result.report.firstDivergence,output:result.output}));if(!result.report.matched)process.exitCode=1;
}
