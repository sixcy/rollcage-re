// CLOSED original capture audit. No game, DLL, native fixture or tests run.
// Optional report path is exclusive (wx); absent output prints only summary.
import assert from 'node:assert/strict';
import {readFile, realpath, writeFile, readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {loadHeldForceRequest, planHeldForceInput, validateHeldForceTransition, encodeHeldForceDecision} from '../tools/lib/native-held-force.mjs';
import {pairNativeFrameSnapshots, compareNativeFramePair} from '../tools/check-native-frame-replay.mjs';
import {traceNativeFrameDispatches, compareNativeDispatchSnapshots} from '../tools/lib/native-frame-event-trace.mjs';

const directory='analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev3-shared-v5-20261023';
const checkedReport='analysis/physics-native-held-chassis-border-high-lev3-shared-v5-verified-20261023.json';
const helperPath='analysis/native-physics-local/startup-20261022/bounded-contained-held-runner-v4-20261023/native-physics-debugger.cs';
const installationPath='analysis/native-held-chassis-border-installation-after-high-lev3-shared-v5-20261023.json';
const ownershipPath='analysis/native-held-chassis-border-point-ownership-v5-20261023.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=await realpath(directory),trace=await readFile(path.join(root,'trace.jsonl'));
const records=trace.toString().trim().split(/\r?\n/).map(JSON.parse), configurationBytes=await readFile(path.join(root,'configuration.json'));
const helperBytes=await readFile(helperPath),checkedBytes=await readFile(checkedReport),reported=JSON.parse(checkedBytes);
assert.equal(sha(helperBytes),'a77e6894a235316f0f65274b5b262370e921ea0211196bdf4804c1c98b0773e9');
assert.equal(sha(configurationBytes),'601e04ca2ce30fe41ba5988f00ea375e66c44169ca1fc709ac91acfdf9673a27');
const configuration=JSON.parse(configurationBytes);
const one=type=>{const found=records.filter(r=>r.type===type);assert.equal(found.length,1,type);return found[0];};
const owner=one('owned-process'),complete=one('complete'),cleanup=one('owned-process-cleanup');
assert.equal(records.some(r=>r.type==='capture-error'||r.type==='fatal-exception'),false);
assert.equal(complete.snapshots,15);assert.equal(cleanup.pid,owner.pid);assert.equal(cleanup.terminated,true);
assert.equal(records[0].executableSha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
const files=new Map();
function add(file,hash,length,kind) {
  if(files.has(file)){const old=files.get(file);assert.equal(old.hash,hash);assert.equal(old.length,length);old.kinds.add(kind);}
  else files.set(file,{hash,length,kinds:new Set([kind])});
}
for(const r of records){
  if(r.contextFile)add(r.contextFile,r.contextSha256,r.contextLength??716,r.type==='snapshot'?'snapshot-context':'stop-thread-context');
  for(const b of r.ranges??[])if(b.file)add(b.file,b.sha256,b.length,'snapshot-range');
  if(r.stack?.file)add(r.stack.file,r.stack.sha256,r.stack.length,'stop-thread-stack');
}
assert.deepEqual((await readdir(root)).filter(f=>f.endsWith('.bin')).sort(),[...files.keys()].sort(),'Every actual binary blob has recorded hash evidence');
let rawBytes=0;const counts={};
for(const[file,expected]of files){
  assert.equal(path.basename(file),file);const resolved=await realpath(path.join(root,file));assert.equal(path.dirname(resolved),root);
  const hash=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(resolved)){bytes+=chunk.length;hash.update(chunk);}
  assert.equal(hash.digest('hex'),expected.hash,file);if(expected.length!==undefined)assert.equal(bytes,expected.length,file);rawBytes+=bytes;
  for(const kind of expected.kinds){counts[kind]??={files:0,bytes:0};counts[kind].files++;counts[kind].bytes+=bytes;}
}
const installationBytes=await readFile(installationPath),installation=JSON.parse(installationBytes);
assert.equal(installation.allInstalledOriginalAndCopiedFilesMatch,true);assert.equal(installation.files,171);assert.equal(installation.mismatches.length,0);
const capture=await loadPhysicsCapture(root,{expectedSha256:records[0].executableSha256});
const pairing=pairNativeFrameSnapshots(capture,configuration);assert.equal(pairing.pairs.length,1);const pair=pairing.pairs[0];
const held=await loadHeldForceRequest(root),intervention=one('held-force-intervention'),waiting=one('held-force-waiting');
const debug=records.filter(r=>r.type==='debug-event'&&r.ordinal===held.request.observedDebugEventOrdinal);assert.equal(debug.length,1);
assert.equal(debug[0].pid,owner.pid);assert.equal(debug[0].tid,owner.tid);assert.equal(debug[0].event,1);
assert.equal(held.request.pid,owner.pid);assert.equal(held.request.tid,owner.tid);
const rawPre=capture.snapshots.filter(r=>r.breakpointId==='held-force-pre-input');assert.equal(rawPre.length,1);assert.equal(rawPre[0].ordinal,5);
assert.equal(rawPre[0].ordinal,held.snapshot.ordinal);assert.ok(rawPre[0].context.equals(held.snapshot.context));assert.equal(rawPre[0].ranges.size,held.snapshot.ranges.size);
for(const[id,r]of rawPre[0].ranges){const source=held.snapshot.ranges.get(id);assert.equal(Number(r.address),Number(source.address));assert.ok(r.bytes.equals(source.bytes));}
const index=r=>records.indexOf(r),preRecord=records.find(r=>r.type==='snapshot'&&r.ordinal===5);
assert.ok(index(debug[0])<index(preRecord)&&index(preRecord)<index(waiting)&&index(waiting)<index(intervention));
assert.equal(records.slice(index(waiting)+1,index(intervention)).some(r=>r.type==='debug-event'),false);
assert.equal(waiting.allOwnedThreadsStoppedByDebugEvent,true);assert.equal(waiting.preInputOrdinal,5);assert.equal(waiting.requestSha256,held.requestSha256);
// Fresh bounded SOURCE forecast. The native unmodified counterfactual was
// never captured; none is synthesized or inferred here.
const fresh=planHeldForceInput(held),planBytes=await readFile(path.join(root,'held-force-plan.json')),saved=JSON.parse(planBytes);
const untimed=value=>{const{elapsedMs,...rest}=value;return rest;};assert.deepEqual(untimed(fresh),untimed(saved));
assert.equal(await readFile(path.join(root,'held-force-decision.txt'),'utf8'),encodeHeldForceDecision(held,fresh,sha(planBytes)));
const input=validateHeldForceTransition(held,pair.before,intervention,fresh,sha(planBytes));assert.equal(input.matched,true);
assert.equal(fresh.attempts.length,24);assert.equal(fresh.selected.index,12);assert.equal(intervention.holdElapsedMs,2641);
assert.deepEqual(fresh.selected.border.normalQ16,[26624,0,59392]);assert.equal(fresh.selected.signedScalarQ16,-4*65536);
const force=Buffer.from(intervention.replacementBytesHex,'hex');assert.equal(force.length,12);assert.deepEqual([0,4,8].map(o=>force.readInt32LE(o)),[-106496,0,-237568]);
const replay=traceNativeFrameDispatches(pair.before,pair.options),frame=compareNativeFramePair(pair,replay);
const native=capture.snapshots.filter(r=>r.breakpointId==='native-dispatch-entry');assert.equal(native.length,8);
const dispatch=compareNativeDispatchSnapshots(native,replay.dispatchEvents,{...pair,logicalClock:held.request.clock,mode:'pending-frame',subset:'all',sourceProcessedEvents:replay.report.processedEvents});
assert.equal(frame.matched,true);assert.equal(dispatch.matched,true);assert.equal(dispatch.scope,'complete-dispatch-stream');assert.equal(replay.dispatchEvents.length,8);
assert.equal(reported.matched,true);assert.equal(reported.nativeCounterfactualCompared,false);
assert.deepEqual(frame.comparisons,reported.frame.comparisons);assert.deepEqual(dispatch,reported.dispatch);assert.equal(frame.comparedBytes,4885468);
const intervals=frame.comparisons.map(r=>{assert.equal(r.matched,true);assert.equal(r.divergence,null);assert.equal(r.readOnlyDivergence,null);return [r.address,r.address+r.length];}).sort((a,b)=>a[0]-b[0]);
const union=[];for(const[a,b]of intervals){const last=union.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else union.push([a,b]);}
const uniqueBytes=union.reduce((n,[a,b])=>n+b-a,0),summedBytes=frame.comparisons.reduce((n,r)=>n+r.length,0);
assert.equal(summedBytes,frame.comparedBytes);assert.equal(uniqueBytes,4885336);
const borderEvents=[];
for(const i of [2,4]){
  const snapshot=native[i],bytes=snapshot.ranges.get('dispatch-event').bytes,body=snapshot.ranges.get('dispatch-body-header');
  assert.equal(bytes.length,104);assert.equal(bytes.readUInt32LE(),1);assert.equal(bytes.readUInt32LE(4),fresh.selected.bodyAddress);
  assert.equal(Number(body.address),fresh.selected.bodyAddress);assert.equal(body.bytes.readUInt32LE()&511,3);
  assert.equal(bytes.readInt32LE(0x44),fresh.selected.border.cellId);assert.deepEqual([0x38,0x3c,0x40].map(o=>bytes.readInt32LE(o)),fresh.selected.border.normalQ16);
  assert.equal(bytes[0x54],i===2?1:2);
  const proof=reported.chassisBorders.find(r=>r.nativeOrdinal===snapshot.ordinal);assert.ok(proof);assert.ok(proof.candidates.some(c=>c.type===7&&c.column===21&&c.vertexIndex===1781&&c.side==='right'));
  borderEvents.push({sourceEventIndex:i,nativeOrdinal:snapshot.ordinal,eventBytes:104,bodyKind:3,candidateKind:7,response:i===2?'swept-contact':'penetration-contact',eventAddress:Number(snapshot.ranges.get('dispatch-event').address),cellId:bytes.readInt32LE(0x44),normalQ16:fresh.selected.border.normalQ16,ownershipProof:ownershipPath});
}
const ownershipBytes=await readFile(ownershipPath);
const report={schemaVersion:1,method:'independent-closed-v5-raw-evidence-and-fresh-source-audit',captureDirectory:directory,
  captureSucceeded:true,verifiedControlledFrame:true,nativeCounterfactualCompared:false,fullParentClosureClaimed:false,
  targetSha256:records[0].executableSha256,traceSha256:sha(trace),configurationSha256:sha(configurationBytes),immutableHelper:{file:helperPath,sha256:sha(helperBytes)},
  allEmittedBinaryBlobs:{files:files.size,summedFileBytes:rawBytes,allHashesAndDeclaredLengthsMatch:true,byKind:counts,includesStopThreadDiagnostics:true,rangeOverlapNotDeduplicatedInFileByteTotal:true},
  metadataIntegrity:{requestSha256:held.requestSha256,sourcePlanSha256:sha(planBytes),decisionMatchesFreshEncodedPlan:true,verifiedRootReport:{file:checkedReport,sha256:sha(checkedBytes)},pointOwnershipAudit:{file:ownershipPath,sha256:sha(ownershipBytes)},installationAudit:{file:installationPath,sha256:sha(installationBytes),files:171,allMatch:true}},
  owner,completion:complete,cleanup,
  input:{...input,oneWrite:true,sameStoppedDebugEvent:true,debugEventOrdinal:held.request.observedDebugEventOrdinal,force:[-106496,0,-237568],originalForceHex:intervention.originalBytesHex,normalQ16:fresh.selected.border.normalQ16,signedScalarQ16:fresh.selected.signedScalarQ16,sourceTrialSelected:12,sourceTrials:24,freshSourcePlanMatchesSaved:true,holdElapsedMs:2641},
  frameComparison:{matched:true,comparisonRegions:frame.comparisons.length,summedDeclaredBytes:summedBytes,uniqueAddressIntervalBytes:uniqueBytes,uniqueIntervals:union.length,duplicatedIntervalBytes:summedBytes-uniqueBytes,byPolicy:Object.fromEntries([...new Set(frame.comparisons.map(r=>r.policy))].map(p=>[p,{regions:frame.comparisons.filter(r=>r.policy===p).length,summedBytes:frame.comparisons.filter(r=>r.policy===p).reduce((n,r)=>n+r.length,0)}])),nativeReturn:frame.nativeReturn,sourceReturn:frame.sourceReturn,freshFullFrameComparisonMatchesRetainedReport:true},
  dispatcherComparison:{matched:true,scope:'complete-dispatch-stream',actualRecords:8,sourceRecords:8,bytesPerRecord:104,temporalRecordBytes:832,exactEventBytesAddressesAndDeltasCompared:true,rows:dispatch.events.map(r=>({index:r.index,nativeOrdinal:r.nativeOrdinal,eventAddress:r.eventAddress,deltaQ16:r.deltaQ16,matched:r.matched})),plannedChassisBorderEvents:borderEvents,scopeNote:'Eight records are compared at eight ordered dispatch entries. Reused pool addresses are distinct temporal observations; 832 record bytes are not added to the final-frame unique address union.'},
  limits:['One controlled force experiment and its actual HIGH/LEV3 frame/event outputs only.','No native unforced counterfactual was captured; source-only forecasts do not prove native contact absence without the force.','The right-border21 ownership proof is separately retained; this audit confirms its original event association, not a new independent geometry reconstruction.','No whole parent, wall/ceiling/inverted matrix, runtime cadence, audio or whole-game closure claim.']};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({audit:process.argv[2]??null,matched:true,blobFiles:files.size,rawFileBytes:rawBytes,frameDeclaredBytes:summedBytes,frameUniqueBytes:uniqueBytes,dispatchRecords:8,dispatcherRecordBytes:832,inputMatched:input.matched,plannedBorderEvents:2,nativeCounterfactualCompared:false}));
