import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {nativePostFrameBoundaries,replayNativeVehiclePrepass,verifyNativePostFrameBoundaries} from './lib/native-post-frame-replay.mjs';
import {inspectNativeFrameScenario} from './lib/native-frame-scenario.mjs';
import {firstByteDivergence} from './lib/native-body-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

const ids=['native-prepass-before','native-prepass-after'],boundary=nativePostFrameBoundaries.prepass;
function baseOf(snapshot){const bases=new Set([snapshot.moduleBaseAddress,...snapshot.ranges.values()].map(row=>typeof row==='object'?row.moduleBaseAddress:row).filter(value=>value!==undefined&&value!==null).map(Number));if(bases.size!==1)throw Error('Native prepass requires one observed module base.');return [...bases][0];}
function policy(bp){
  const stack=bp?.ranges?.find(row=>row.id==='frame-stack'),before=-Number(stack?.offset),after=Number(stack?.length)-before,queue=bp?.ranges?.find(row=>row.id==='attachment-queue'),gate=bp?.captureWhen,row=gate?.range;
  if(stack?.baseRegister!=='esp'||stack.rva!==undefined||stack.address!==undefined||stack.readableRegion||stack.dereferenceOffsets?.length||!Number.isInteger(before)||before<8||before>65536||after!==4)throw Error('Native prepass requires explicit ESP saved-register/return coverage.');
  if(Number(queue?.rva)!==0x502040||!Number.isInteger(queue.length)||queue.length<4||queue.length>65536||queue.length%4||queue.readableRegion||queue.dereferenceOffsets?.length)throw Error('Native prepass attachment observation differs.');
  if(gate?.equalsBytesHex!=='04000000'||Number(row?.rva)!==0x1ecb1c||Number(row.offset)!==0x57c||row.length!==4||row.readableRegion||row.baseRegister!==undefined||row.address!==undefined||JSON.stringify(row.dereferenceOffsets)!=='["0"]')throw Error('Native prepass active-phase observer differs.');
  return {stackBytesBefore:before,stackBytesAfter:4,attachmentWindowBytes:queue.length};
}
export function pairNativePrepassSnapshots(capture,configuration){
  if(capture.header?.executableSha256!==REDUX_SHA256)throw Error('Native prepass target SHA differs.');
  const beforeBp=configuration.breakpoints?.find(row=>row.id===ids[0]),afterBp=configuration.breakpoints?.find(row=>row.id===ids[1]);
  if(Number(beforeBp?.rva)!==boundary.entry-0x400000||Number(afterBp?.rva)!==boundary.exit-0x400000)throw Error('Native prepass boundary RVAs differ.');
  const options=policy(beforeBp);if(JSON.stringify(options)!==JSON.stringify(policy(afterBp)))throw Error('Native prepass observation policies differ.');
  const skipFrames=beforeBp.skipMatchingHits??0;if(!Number.isInteger(skipFrames)||skipFrames<0||skipFrames>0x7fffffff||skipFrames!==(afterBp.skipMatchingHits??0))throw Error('Native prepass skip windows differ.');
  const frames=afterBp.stopAfterHits;if(!Number.isInteger(frames)||frames<1||frames>3||beforeBp.stopAfterHits>0||configuration.pendingFrameObserver||configuration.phaseActions?.some(row=>ids.includes(row.breakpointId)))throw Error('Native prepass requires bounded observer-only calls.');
  if(capture.complete?.reason!=='snapshot-bound'||capture.snapshots.at(-1)?.breakpointId!==ids[1]||capture.snapshots.at(-1).hit!==frames)throw Error('Native prepass lacks its complete terminal bound.');
  const pairs=[],pending=new Map();let entries=0,exits=0;
  for(const snapshot of capture.snapshots){
    if(!ids.includes(snapshot.breakpointId))continue;
    const before=snapshot.breakpointId===ids[0],base=baseOf(snapshot),esp=Number(snapshot.registers?.esp),session=snapshot.ranges.get('session'),stack=snapshot.ranges.get('frame-stack'),gate=snapshot.captureWhen;
    if(Number(snapshot.registers?.eip)!==base+(before?boundary.entry:boundary.exit)-0x400000||!Number.isSafeInteger(esp)||!session||session.bytes.length<0x590||session.bytes[0x54d]!==6||session.bytes.readUInt32LE(0x57c)!==4||!stack||Number(stack.address)!==esp-options.stackBytesBefore||stack.bytes.length!==options.stackBytesBefore+4)throw Error('Native prepass entry/exit/stack/session identity differs.');
    if(gate?.actualBytesHex!=='04000000'||gate.equalsBytesHex!=='04000000'||Number(gate.address)!==Number(session.address)+0x57c||!Number.isInteger(snapshot.rawHit)||snapshot.rawHit<snapshot.hit||(snapshot.matchingHit!==undefined&&(snapshot.matchingHit!==skipFrames+snapshot.hit||snapshot.matchingHit>snapshot.rawHit))||((Object.hasOwn(beforeBp,'skipMatchingHits')||Object.hasOwn(afterBp,'skipMatchingHits'))&&snapshot.matchingHit===undefined))throw Error('Native prepass lacks matching-hit/active predicate proof.');
    const returnAddress=stack.bytes.readUInt32LE(options.stackBytesBefore);if(returnAddress!==base+boundary.returnAddress-0x400000)throw Error('Native prepass caller return differs from47ccff CALL.');
    if(before){if(pending.has(snapshot.tid)||snapshot.hit!==++entries)throw Error('Nested/nonsequential native prepass entry.');pending.set(snapshot.tid,{snapshot,base,esp,returnAddress});}
    else{const entry=pending.get(snapshot.tid);if(!entry||snapshot.hit!==++exits||entry.snapshot.hit!==snapshot.hit||entry.base!==base||entry.esp!==esp||entry.returnAddress!==returnAddress||Number(entry.snapshot.ranges.get('session').address)!==Number(session.address))throw Error('Missing same-thread same-ESP native prepass entry.');pending.delete(snapshot.tid);pairs.push({before:entry.snapshot,after:snapshot,moduleBaseAddress:base,returnAddress,options});}
  }
  if(pending.size||pairs.length!==frames||entries!==frames||exits!==frames)throw Error('Incomplete native prepass pairs.');return {pairs,frames,skipFrames,options};
}
export function compareNativePrepassPair(pair,replay){
  const rows=snapshot=>snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges,before=createCapturedMemory(rows(pair.before)),after=createCapturedMemory(rows(pair.after));
  const comparisons=replay.manifest.requiredRegions.filter(row=>row.comparison!=='abi-input').map(row=>{const expected=after.span(row.address,row.length),divergence=firstByteDivergence(expected,replay.span(row.address,row.length)),readOnlyDivergence=row.comparison==='read-only'?firstByteDivergence(before.span(row.address,row.length),expected):null;return {id:row.id,address:row.address,length:row.length,policy:row.comparison,matched:!divergence&&!readOnlyDivergence,divergence,readOnlyDivergence};});
  const registers=replay.report.registersCompared.map(name=>{const input=Number(pair.before.registers[name]),output=Number(pair.after.registers[name]);if(!Number.isInteger(output)||output<0||output>0xffffffff||(name!=='eax'&&(!Number.isInteger(input)||input<0||input>0xffffffff)))throw Error(`Native prepass register ${name} is absent or invalid.`);const expected=name==='eax'?replay.report.expectedEax:input>>>0,actual=output>>>0;return {name,expected,actual,matched:expected===actual};});
  return {matched:comparisons.every(row=>row.matched)&&registers.every(row=>row.matched),comparedBytes:comparisons.reduce((sum,row)=>sum+row.length,0),comparisons,registers,firstDivergence:comparisons.find(row=>!row.matched)??registers.find(row=>!row.matched)??null,nativeScenario:inspectNativeFrameScenario(pair,replay.manifest,{before,after}),numericalContext:replay.numericalContext,sourceReport:replay.report};
}
export async function checkNativePrepassReplay(input,output){
  const evidence=await verifyNativePostFrameBoundaries(),capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8')),pairing=pairNativePrepassSnapshots(capture,configuration),cases=[];
  await mkdir(output);for(const filename of ['configuration.json','trace.jsonl'])await copyFile(path.join(input,filename),path.join(output,filename),constants.COPYFILE_EXCL);
  for(const pair of pairing.pairs){const row={beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,tid:pair.before.tid,entryEsp:pair.before.registers.esp};try{Object.assign(row,compareNativePrepassPair(pair,replayNativeVehiclePrepass(pair.before,{...pair.options,moduleBaseAddress:pair.moduleBaseAddress})));}catch(error){Object.assign(row,{matched:false,replayStage:error.replayStage??null,replayError:error.stack});}cases.push(row);}
  const report={schemaVersion:1,targetSha256:REDUX_SHA256,authority:'original-process-with-declared-instrumentation',method:'Actual47e180 prepass entry/singlepreRET47e234, original47ccff caller, same-thread same-ESP pairing. Source calls existingraw prepass over captured aliases; allsemantic core+validatedgeometry bytes, EAX endrecord andcalleesaved registers compare. No supplied rejection/route answers.',captureDirectory:path.resolve(input),frames:pairing.frames,skipFrames:pairing.skipFrames,stackPolicy:pairing.options,boundaryEvidence:evidence.evidenceIds,matched:cases.every(row=>row.matched),firstDivergence:cases.find(row=>!row.matched)??null,cases,completion:capture.complete,interventions:capture.interventions,limits:['Exact native vehicle-rejection prepass only; a capture without state32 transitions does not establish a respawn.','Parent47ccc0 route/query/application/emission remains separate work.','Private ABI stack, volatileECX/EDX andEFLAGS are excluded; EAX pointer arithmetic andcallee-preserved registers are checked.']};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return {report,output:path.resolve(output)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/check-native-prepass-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');const result=await checkNativePrepassReplay(input,output);console.log(JSON.stringify({matched:result.report.matched,frames:result.report.frames,firstDivergence:result.report.firstDivergence,output:result.output}));if(!result.report.matched)process.exitCode=1;}
