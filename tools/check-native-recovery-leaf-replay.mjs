import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {recoveryLeafPolicy,replayNativeRecoveryLeaf,compareNativeRecoveryLeafPair,verifyNativeRecoveryLeafBoundaries} from './lib/native-recovery-leaf-replay.mjs';
import {verifyControlledNativeRecoveryConfiguration,verifyControlledNativeRecoveryEvidence} from './lib/native-controlled-recovery.mjs';
export function nativeRecoveryLeafIds(stage){recoveryLeafPolicy(stage);return {before:`native-recovery-${stage}-before`,after:[`native-recovery-${stage}-after-a`,`native-recovery-${stage}-after-b`]};}
function observationPolicy(bp,leaf){
 const row=bp?.ranges?.find(r=>r.id==='frame-stack'),before=-Number(row?.offset),after=Number(row?.length)-before,gate=bp?.captureWhen,p=gate?.range;
 if(row?.baseRegister!=='esp'||row.rva!==undefined||row.address!==undefined||row.readableRegion||row.dereferenceOffsets?.length||!Number.isSafeInteger(before)||before<4||before>65536||after!==leaf.stackBytesAfter)throw Error('Recovery leaf requires its exact ESP scratch/complete argument observation.');
 if(gate?.equalsBytesHex!=='04000000'||Number(p?.rva)!==0x1ecb1c||Number(p.offset)!==0x57c||p.length!==4||p.readableRegion||p.baseRegister!==undefined||p.address!==undefined||JSON.stringify(p.dereferenceOffsets)!=='["0"]')throw Error('Recovery leaf requires its explicit active-phase4 predicate.');
 //Independent exit counters cannot represent a shared skip count when calls
 //take different return paths. Admit only the first matching bounded call.
 if((bp.skipMatchingHits??0)!==0||bp.service!==undefined&&bp.service!==null)throw Error('Recovery leaf rejects branch-dependent skip windows and breakpoint services.');
 const queue=bp.ranges?.find(r=>r.id==='attachment-queue');if(Number(queue?.rva)!==0x502040||!Number.isSafeInteger(queue.length)||queue.length<4||queue.length>65536||queue.length%4||queue.readableRegion||queue.dereferenceOffsets?.length)throw Error('Recovery leaf requires an explicit attachment observation window.');
 return {stackBytesBefore:before,stackBytesAfter:after,attachmentWindowBytes:queue.length};
}
export function pairNativeRecoveryLeafSnapshots(stage,capture,configuration){
 const leaf=recoveryLeafPolicy(stage),ids=nativeRecoveryLeafIds(stage),beforeBp=configuration.breakpoints?.find(bp=>bp.id===ids.before),afterBps=ids.after.map(id=>configuration.breakpoints?.find(bp=>bp.id===id));
 if(capture.header?.executableSha256!==REDUX_SHA256)throw Error('Recovery leaf target SHA differs.');
 if(Number(beforeBp?.rva)!==leaf.entry-0x400000||afterBps.some((bp,i)=>Number(bp?.rva)!==leaf.exits[i]-0x400000))throw Error('Recovery leaf requires its entry and both exact preRET observations.');
 const options=observationPolicy(beforeBp,leaf);for(const bp of afterBps)if(JSON.stringify(observationPolicy(bp,leaf))!==JSON.stringify(options))throw Error('Recovery leaf observation policies differ.');
 if(beforeBp.stopAfterHits>0||afterBps.some(bp=>bp.stopAfterHits!==1)||configuration.pendingFrameObserver||configuration.phaseActions?.some(row=>[ids.before,...ids.after].includes(row.breakpointId)))throw Error('Recovery leaf requires observer-only first-entry/single-exit bounds.');
 const snapshots=capture.snapshots.filter(row=>[ids.before,...ids.after].includes(row.breakpointId));
 if(snapshots.length!==2||snapshots[0].breakpointId!==ids.before||!ids.after.includes(snapshots[1].breakpointId)||capture.snapshots.at(-1)!==snapshots[1]||capture.complete?.reason!=='snapshot-bound')throw Error('Recovery leaf lacks exactly one complete bounded entry/preRET pair.');
 let moduleBaseAddress;for(const snapshot of snapshots){
  const baseSet=new Set([snapshot.moduleBaseAddress,...snapshot.ranges.values()].map(row=>typeof row==='object'?row.moduleBaseAddress:row).filter(v=>v!==undefined&&v!==null).map(Number));if(baseSet.size!==1)throw Error('Recovery leaf requires one observed module base.');const base=[...baseSet][0];if(moduleBaseAddress!==undefined&&base!==moduleBaseAddress)throw Error('Recovery leaf module base changes across the call.');moduleBaseAddress=base;
  const esp=Number(snapshot.registers?.esp),stack=snapshot.ranges.get('frame-stack'),session=snapshot.ranges.get('session'),gate=snapshot.captureWhen,isEntry=snapshot===snapshots[0],expectedEip=base+(isEntry?leaf.entry:leaf.exits[ids.after.indexOf(snapshot.breakpointId)])-0x400000;
  if(Number(snapshot.registers?.eip)!==expectedEip||!Number.isSafeInteger(esp)||!stack||Number(stack.address)!==esp-options.stackBytesBefore||stack.bytes.length!==options.stackBytesBefore+options.stackBytesAfter||stack.bytes.readUInt32LE(options.stackBytesBefore)!==base+leaf.returnAddress-0x400000)throw Error('Recovery leaf native instruction/ESP/caller observation differs.');
  if(snapshot.hit!==1||!Number.isSafeInteger(snapshot.rawHit)||snapshot.rawHit<1||snapshot.matchingHit!==undefined&&snapshot.matchingHit!==1||Object.hasOwn(beforeBp,'skipMatchingHits')&&snapshot.matchingHit===undefined)throw Error('Recovery leaf lacks its first-matching-hit proof.');
  if(!session||session.bytes.length<0x590||session.bytes.readInt32LE(0x57c)!==4||gate?.actualBytesHex!=='04000000'||gate.equalsBytesHex!=='04000000'||Number(gate.address)!==Number(session.address)+0x57c)throw Error('Recovery leaf lacks its observed active-phase predicate.');
 }
 const[before,after]=snapshots;if(before.tid!==after.tid||Number(before.registers.esp)!==Number(after.registers.esp)||before.ordinal>=after.ordinal||Number(before.ranges.get('session').address)!==Number(after.ranges.get('session').address))throw Error('Recovery leaf lacks same-thread/ESP/session ordered pairing.');
 const pair={before,after,moduleBaseAddress,returnAddress:moduleBaseAddress+leaf.returnAddress-0x400000,options};
 const controlledInput=verifyControlledNativeRecoveryConfiguration(configuration,{scope:stage});if(controlledInput)pair.controlledInput=verifyControlledNativeRecoveryEvidence(capture,pair,configuration,{scope:stage});
 return {pairs:[pair],stage,options,controlledInput};
}
export async function checkNativeRecoveryLeafReplay(input,output,stage){
 const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8')),pairing=pairNativeRecoveryLeafSnapshots(stage,capture,configuration),pair=pairing.pairs[0];let comparison;
 try{comparison=compareNativeRecoveryLeafPair(stage,pair,replayNativeRecoveryLeaf(stage,pair.before,{...pair.options,moduleBaseAddress:pair.moduleBaseAddress}));}catch(error){comparison={matched:false,replayStage:error.replayStage??null,replayError:error.stack??String(error)};}
 const report={schemaVersion:1,targetSha256:REDUX_SHA256,authority:pairing.controlledInput?.authority??'original-process-declared-recovery-leaf-comparison',method:(pairing.controlledInput?'Controlled firstbody state32 input at guarded caller229/clock228 precedes the leaf observation; this is not a natural rejection trigger. ':'')+'Exact47ccc0 child CALL ABI at independently captured query/apply entry and one of both genuine preRET sites. Reconstruct from complete captured geometry/pools/clone/progression; compare every semantic manifest span, query output and declared registers. No route/pose/query answers or game-callee stubs.',captureDirectory:path.resolve(input),stage,beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,...(pair.controlledInput?{controlledInput:pair.controlledInput}:{}),...comparison,boundaryEvidence:(await verifyNativeRecoveryLeafBoundaries()).evidenceIds,completion:capture.complete,interventions:capture.interventions,limits:['This checker admits only the first matching active-phase4 leaf call; independent exit counters are not a shared skip window.','Parent controls, route selection, surrounding particle/sound emission and complete47ccc0 are separate boundaries.','Apply is void; volatile EAX/ECX/EDX/EFLAGS are not interpreted as success/failure. Query EAX is checked as its boolean result.','Missing geometry, progression, completion/service or ownership coverage fails explicitly.','No game is launched by this checker.']};
 await mkdir(output);for(const name of['configuration.json','trace.jsonl'])await copyFile(path.join(input,name),path.join(output,name),constants.COPYFILE_EXCL);await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[input,output,stage]=process.argv.slice(2);if(!input||!output||!stage)throw Error('Usage: node tools/check-native-recovery-leaf-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY query|apply');const report=await checkNativeRecoveryLeafReplay(input,output,stage);console.log(JSON.stringify({matched:report.matched,stage:report.stage,comparedBytes:report.comparedBytes,firstDivergence:report.firstDivergence,replayStage:report.replayStage,output}));if(!report.matched)process.exitCode=1;}
