//Read-only closed V2 evidence audit; creates only the new report with wx.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {verifyNativeRaceClockCaptureRecords,createNativeRaceClockCounterBinding} from '../tools/lib/native-race-clock-capture.mjs';
import {createNativeRaceClockInputs} from '../tools/lib/native-race-clock-inputs.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {runNativeRaceStepClock} from '../src/native-race-step-clock.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),hex=n=>'0x'+n.toString(16);
const rawDirectory='analysis/native-race-clock-stock-capture-v2-20261024',stage='analysis/native-physics-local/race-clock-stock-resumed-v2-20261024';
const output='analysis/native-race-clock-stock-independent-audit-v2-20261024.json';
const traceBytes=await readFile(path.join(rawDirectory,'trace.jsonl')),lines=traceBytes.toString('utf8').trim().split(/\r?\n/),records=lines.map(JSON.parse);
const configurationBytes=await readFile(path.join(rawDirectory,'configuration.json')),configuration=JSON.parse(configurationBytes);
assert.equal(sha(configurationBytes),'3caceccb52c5bdcbaa74fddcd1213c157d011d0bac2ed7abe432a1180d5b0a61');
const capture=await loadPhysicsCapture(rawDirectory),proof=verifyNativeRaceClockCaptureRecords({capture,configuration,records});
const complete=records.find(r=>r.type==='complete'),cleanups=records.filter(r=>r.type==='owned-process-cleanup');assert.equal(cleanups.length,1);
const cleanup=cleanups[0];assert.deepEqual([cleanup.pid,cleanup.terminated,cleanup.win32Error],[proof.ownerPid,true,0]);assert.ok(records.indexOf(cleanup)>records.indexOf(complete));
const root=await realpath(rawDirectory),blobs=new Map();
function reference(file,hash,length,role){assert.equal(path.basename(file),file);const prior=blobs.get(file);if(prior){assert.equal(prior.sha256,hash);return;}blobs.set(file,{file,sha256:hash,length,role});}
for(const s of records.filter(r=>r.type==='snapshot')){reference(s.contextFile,s.contextSha256,716,'snapshot-context');for(const row of s.ranges)reference(row.file,row.sha256,row.length,'snapshot-range');}
const diagnostics=records.filter(r=>r.type==='thread-context');assert.equal(diagnostics.length,50);
for(const r of diagnostics){assert.equal(r.pid,proof.ownerPid);assert.equal(r.phase,'best-effort-stop-diagnostic-before-owned-child-cleanup');assert.ok(records.indexOf(r)>records.indexOf(complete));
  reference(r.contextFile,r.contextSha256,r.contextLength,'stop-thread-context');assert.equal(r.stackError,null);reference(r.stack.file,r.stack.sha256,r.stack.length,'stop-thread-stack');}
for(const row of blobs.values()){const p=await realpath(path.join(root,row.file));assert.equal(path.dirname(p),root);const bytes=await readFile(p);assert.equal(bytes.length,row.length);assert.equal(sha(bytes),row.sha256);}
const listed=(await readdir(root)).sort();assert.deepEqual(listed,[...blobs.keys(),'configuration.json','trace.jsonl'].sort(),'Every capture file is accounted for.');
const diagnosticComplete=records.filter(r=>r.type==='thread-diagnostics-complete');assert.equal(diagnosticComplete.length,1);assert.deepEqual([diagnosticComplete[0].contexts,diagnosticComplete[0].stacks,diagnosticComplete[0].errors],[50,50,0]);
const helperPath=path.join(stage,'runner-v2/lib/native-physics-debugger.cs'),helper=await readFile(helperPath);assert.equal(sha(helper),'c2e4d9e5b67866dd365adc7c9f3f829d195a6110e1a5313da8eb4e65e8e7b59d');
assert.equal(sha(await readFile(path.join(stage,'race-clock-config-v2.json'))),sha(configurationBytes));
const identity=[];
for(const[manifestPath,roots,expected]of[
  [path.join(stage,'installation-manifest.json'),null,171],
  ['analysis/native-physics-local/parent-rtti-resumed-20261024/installation-manifest.json',null,173]]){
  const bytes=await readFile(manifestPath),manifest=JSON.parse(bytes);assert.equal(manifest.files.length,expected);
  const source=manifest.source,copied=path.join(manifest.destination,'installation');let count=0,total=0;
  for(const row of manifest.files){assert.ok(!path.isAbsolute(row.path)&&!row.path.split(/[\\/]/).includes('..'));
    for(const dir of[source,copied]){const b=await readFile(path.join(dir,row.path));assert.equal(b.length,row.length);assert.equal(sha(b),row.sha256);count++;total+=b.length;}}
  identity.push({manifest:manifestPath,manifestSha256:sha(bytes),filesPerRoot:expected,verifiedRoots:[source,copied],fileHashesChecked:count,bytesRead:total,matched:true});
}
const identityReports=[];for(const filename of['analysis/native-race-clock-stock-installation-before-v2-20261024.json','analysis/native-race-clock-stock-installation-after-v2-20261024.json','analysis/native-race-clock-installed-edits-after-v2-20261024.json']){
  const bytes=await readFile(filename),r=JSON.parse(bytes);assert.equal(r.allInstalledOriginalAndCopiedFilesMatch,true);assert.deepEqual(r.mismatches,[]);identityReports.push({filename,sha256:sha(bytes),files:r.files,matched:true});}
const sourceReportPath='analysis/native-race-clock-stock-replay-v2-20261024/report.json',sourceReportBytes=await readFile(sourceReportPath),sourceReport=JSON.parse(sourceReportBytes);
assert.equal(sourceReport.matched,false);assert.equal(sourceReport.sourceComplete,false);assert.equal(sourceReport.sourceExecuted,true);assert.equal(sourceReport.clockResultMatched,true);assert.equal(sourceReport.scaledClockMatched,true);
const inputs=createNativeRaceClockInputs(proof.entry,{moduleBaseAddress:proof.moduleBaseAddress}),source=createCapturedMemory(inputs.rows),m=source.memory,l=proof.layout;
const observedStages=[];let sourceAtApiReturn;
const b=createNativeRaceClockCounterBinding({proof,memory:m,onCall:e=>observedStages.push(e),onReturn:e=>{observedStages.push(e);sourceAtApiReturn=Buffer.from(m.subarray(l.stackAddress,l.stackAddress+540));}});
const sourceEvents=[],count=runNativeRaceStepClock({memory:m,moduleBaseAddress:proof.moduleBaseAddress,scratchBase:inputs.entryEsp,entryRegisters:inputs.entryRegisters,numericalContext:inputs.numericalContext,services:{platformCall:b.platformCall},observeNativeClock:e=>sourceEvents.push(e)});b.assertComplete();
assert.equal(count,proof.returnValue);assert.equal(count,1);assert.equal(b.events.length,1);
const stack=s=>s.ranges.get('race-clock-stack').bytes,nativeBefore=stack(proof.counterCall),nativeApiAfter=stack(proof.counterReturn),nativeFinal=stack(proof.returned),sourceFinal=m.subarray(l.stackAddress,l.stackAddress+540);
const apiPrivate=[],apiCpu=[],apiOutput=[],apiOther=[],finalDifferences=[],removedPrivate=[];
for(let i=0;i<540;i++){
  const p=l.stackAddress+i;if(nativeBefore[i]!==nativeApiAfter[i]){const list=p<l.frame-8?apiPrivate:p<l.frame-4?apiCpu:p>=l.outputAddress&&p<l.outputAddress+8?apiOutput:apiOther;list.push(p);}
  if(sourceFinal[i]!==nativeFinal[i])finalDifferences.push(p);
}
const privateSet=new Set(apiPrivate);for(const p of finalDifferences){assert.ok(privateSet.has(p),'Final difference is within actually changed private API bytes.');const i=p-l.stackAddress;assert.equal(sourceAtApiReturn[i],nativeBefore[i]);assert.equal(sourceFinal[i],nativeBefore[i]);assert.equal(nativeFinal[i],nativeApiAfter[i]);}
for(const p of apiPrivate)if(!finalDifferences.includes(p)){removedPrivate.push(p);const i=p-l.stackAddress;assert.equal(sourceFinal[i],nativeFinal[i]);assert.notEqual(sourceFinal[i],sourceAtApiReturn[i]);}
assert.deepEqual([apiPrivate.length,apiCpu.length,apiOutput.length,apiOther.length,finalDifferences.length,removedPrivate.length],[109,3,8,0,105,4]);
const intervals=points=>{const out=[];for(const p of points){const prev=out.at(-1);if(prev&&prev.address+prev.length===p)prev.length++;else out.push({address:p,length:1});}return out;};
const finalNonstack=[];for(const row of proof.returned.ranges.values())if(row.id!=='thread-seh-head'&&row.id!=='race-clock-stack'){
  assert.deepEqual(m.subarray(Number(row.address),Number(row.address)+row.length),row.bytes);finalNonstack.push({id:row.id,length:row.length});}
const finalEvent=sourceEvents.findLast(e=>e.stage==='return'),scaled=sourceEvents.findLast(e=>e.stage==='scale'),scaledBytes=Buffer.alloc(8);scaledBytes.writeDoubleLE(scaled.value);
assert.deepEqual(scaledBytes,proof.returned.context.subarray(364,372));assert.equal(proof.returned.context.readUInt32LE()&0x10020,0x10020);
for(const[name,value]of Object.entries(finalEvent.registers))assert.equal(value>>>0,Number(proof.returned.registers[name])>>>0);
for(const[name,raw]of[['x87ControlWord','fpuControlWord'],['x87StatusWord','fpuStatusWord'],['mxcsr','mxcsr']])assert.equal(finalEvent.numericalState[name],Number(proof.returned.registers[raw]));
const blobRows=[...blobs.values()].sort((a,b)=>a.file.localeCompare(b.file));
const report={schemaVersion:1,authority:'independent-read-only-audit-of-closed-original-process-capture',captureDirectory:rawDirectory,
  identities:{targetSha256:capture.header.executableSha256,helper:{path:helperPath,sha256:sha(helper)},configurationSha256:sha(configurationBytes),traceSha256:sha(traceBytes),sourceReport:{path:sourceReportPath,sha256:sha(sourceReportBytes)},installationChecks:identity,installationReports:identityReports},
  raw:{jsonRecords:records.length,everyLineParsed:true,complete:true,snapshots:7,purposeSnapshots:4,typedRowsPerPurpose:15,originalEntrySemanticBytes:inputs.semanticRegions.reduce((s,r)=>s+r.length,0),
    blobFiles:blobs.size,blobBytes:blobRows.reduce((s,r)=>s+r.length,0),snapshotContexts:7,snapshotRanges:blobRows.filter(r=>r.role==='snapshot-range').length,stopThreadContexts:50,stopThreadStacks:50,
    allBlobHashesMatched:true,unreferencedFiles:0,orderedBlobManifestSha256:sha(Buffer.from(JSON.stringify(blobRows))),exactPolicyAndAdmissionVerified:true,
    ownerPid:proof.ownerPid,ownerMainTid:proof.ownerMainTid,moduleBaseAddress:hex(proof.moduleBaseAddress),entryLogicalClock:proof.logicalClock,layout:l,
    roles:[proof.entry,proof.counterCall,proof.counterReturn,proof.returned].map(s=>({id:s.breakpointId,ordinal:s.ordinal,event:s.observedDebugEventOrdinal,esp:s.registers.esp,eip:s.registers.eip})),
    activationsAfterEntryPublicationSameEvent:3,startupGuardedWrites:6,counterNeutralSkips:records.filter(r=>r.type==='race-clock-skipped').length,
    completion:{events:complete.events,elapsedMs:complete.elapsedMs,returnValue:proof.returnValue},ownedCleanup:cleanup,stopDiagnostics:diagnosticComplete[0]},
  source:{executed:true,onlyOriginalEntryGameInputs:true,aliasesApplied:0,onlyExternalOutcome:b.events[0],counterNumericalStatePreserved:proof.counterStatePreserved,
    strictMatched:false,sourceComplete:false,clockResultMatched:true,sourceReturn:finalEvent.registers,numericalMatched:finalEvent.numericalState,
    finalXmm0:{contextFlags:hex(proof.returned.context.readUInt32LE()),offset:364,bytes:8,sourceHex:scaledBytes.toString('hex'),nativeHex:proof.returned.context.subarray(364,372).toString('hex'),matched:true},
    all14NonstackRegionsMatched:true,nonstackBytes:finalNonstack.reduce((s,r)=>s+r.length,0),privateApiByteChanges:109,cpuReturnByteChanges:3,apiOutputByteChanges:8,otherApiByteChanges:0,
    finalPrivateByteDifferences:105,allFinalDifferencesSubsetOfActualApiPrivateChanges:true,privateBytesSubsequentlyOverwrittenByGenuineSource:removedPrivate.map(hex),finalDifferenceIntervals:intervals(finalDifferences),noAfterStackRefresh:true},
  correctedInitialVerifierFailure:{message:'Race clock uint32 startup module',cause:'Verifier incorrectly required moduleBaseAddress on actual register-rooted startup rows; the original range writer explicitly publishes null for those rows.',
    correction:'Require null for register roots, validate their addresses from actual raw registers, and retain exact actual module base/address checks for RVA roots.',newCaptureRequired:false,focusedNegativeMutationsAdded:4},
  limits:['Capture transport completed; the strict742-byte source comparison did not match because105 actual private QPC stack bytes remain unbound.',
    'The observed count1, scaled XMM0 and declared nonstack state agree for this one warm call; no natural wall-clock cadence, second parent tick or whole-parent continuity is established.',
    'No native after-stack bytes were applied as source input, no private differences were masked, and no game/timer/conversion result callbacks were supplied.',
    'Stop-thread diagnostics are hashed evidence only, not ordered simulation inputs.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,rawVerified:true,blobs:blobs.size,strictMatched:false,semanticMatched:true,privateFinal:finalDifferences.length}));
