import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {cloneNativeFrameWithForce} from '../tools/check-native-chassis-border-preflight.mjs';
import {validateHeldForceRequest,planHeldForceInput,encodeHeldForceDecision,validateHeldForceTransition,validateHeldForceConfiguration,validateHeldBankVector,validateHeldBudgetEvidence,loadHeldForceRequest,waitForHeldForceRequest} from '../tools/lib/native-held-force.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from '../tools/check-native-frame-replay.mjs';
import {traceNativeFrameDispatches} from '../tools/lib/native-frame-event-trace.mjs';
import {createNativeHeldChassisForceCaptureConfig} from '../tools/prepare-native-held-chassis-force-capture.mjs';
import {proveNativeChassisBorderCandidate,checkNativeHeldChassisForce} from '../tools/check-native-held-chassis-force.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
const retained='analysis/native-physics-local/startup-20261022/hidden-selected-collision-capture';
const available=existsSync(`${retained}/trace.jsonl`);
const forceRetained='analysis/native-physics-local/startup-20261022/hidden-selected-force-v2-capture';
let fixturePromise;
async function fixture() {
  return fixturePromise??= (async()=>{
    const capture=await loadPhysicsCapture(retained),before=capture.snapshots.find(s=>s.breakpointId==='native-frame-before');
    //Protocol projection ONLY. The old raw context/input is genuine; this is
    //not an original held run or an original controlled chassis collision.
    const snapshot={...before,breakpointId:'held-force-pre-input',observedBreakpointId:'native-frame-before',capturePhase:'held-pre-input-before-original-instruction'};
    const moduleBaseAddress=[...snapshot.ranges.values()].find(r=>r.moduleBaseAddress)?.moduleBaseAddress;
    const request={schemaVersion:1,kind:'held-chassis-force-input',token:'ab'.repeat(16),targetSha256:REDUX_SHA256,pid:36020,tid:snapshot.tid,moduleBaseAddress,
      clock:snapshot.ranges.get('clock').bytes.readUInt32LE(),observedDebugEventOrdinal:snapshot.observedDebugEventOrdinal,maxHoldMs:20000,maxAttempts:24,maxPendingBytes:128*1024*1024};
    const held={request,snapshot,requestSha256:'cd'.repeat(32)},report=planHeldForceInput(held);
    return {held,report};
  })();
}
const copySnapshot=s=>({...s,context:Buffer.from(s.context),registers:{...s.registers},ranges:new Map([...s.ranges].map(([id,r])=>[id,{...r,bytes:Buffer.from(r.bytes)}]))});
function projectCapturedBank(s) {
  const old=s.ranges.get('active-sound-bank-region'),base=Number(old.moduleBaseAddress),m=createCapturedMemory([...s.ranges.values()]).memory,address=base+0x2f2414,header=m.subarray(address,address+12),[begin,end,capacity]=[0,4,8].map(o=>header.readUInt32LE(o));
  const bytes=Buffer.from(m.subarray(begin,capacity)),row={id:'active-sound-bank-storage',address:begin,length:bytes.length,bytes,sha256:digest(bytes),file:'derived-bank-storage.bin',rootRva:'0x2f2414',rootAddress:null,moduleBaseAddress:old.moduleBaseAddress,baseRegister:null,dereferenceOffsets:[],offset:'0',rangeMode:'vector-storage',requestedResolvedRoot:address,vectorHeaderAddress:address,vectorHeaderHex:header.toString('hex'),vectorBegin:begin,vectorEnd:end,vectorCapacity:capacity,maxVectorBytes:65536};
  const snapshot={...s,ranges:new Map([...s.ranges].filter(([id])=>id!==old.id).concat([[row.id,row]]))};validateHeldBankVector(snapshot,base);return snapshot;
}

test('retained real frame supports24 source-only held forecasts without changing original input; no native counterfactual claim', {skip:!available}, async()=>{
  const {held,report}=await fixture();
  assert.equal(validateHeldForceRequest(held.request,held.snapshot).base,0x6e0000);
  assert.equal(report.attempts.length,24);assert.ok(report.attempts.every(r=>r.sourceComplete));assert.equal(report.nativeCounterfactualCompared,false);
  assert.equal(report.nativeControlledExperimentPerformed,false);assert.equal(report.originalInputBytesUnchanged,true);
  assert.equal(report.selected.index,14);assert.deepEqual(report.selected.incrementQ16,[-245760,0,-999424]);
  assert.match(report.selected.border.provenance,/Source-only/);assert.ok(report.elapsedMs<15000);
  const decision=encodeHeldForceDecision(held,report,'ef'.repeat(32));
  assert.equal(decision.split('\n').length,12);assert.match(decision,/^ROLLCAGE_HELD_FORCE_V1\n/);
  for(const mutate of [r=>r.selected=null,r=>r.selected.participantIndex=6,r=>r.selected.inputProof.experimentalForceHex='00'.repeat(12),r=>r.nativeCounterfactualCompared=true,r=>r.attempts[14].sourceComplete=false]){
    const fake=structuredClone(report);mutate(fake);assert.throws(()=>encodeHeldForceDecision(held,fake,'ef'.repeat(32)),/not completed|changed/);
  }
  let clock=0;assert.throws(()=>planHeldForceInput(held,{now:()=>{clock+=1000;return clock;},deadlineMs:1}),/deadline/);
});

test('held input guards reject context, numerical, root-span and request identity tampering', {skip:!available}, async()=>{
  const {held}=await fixture();
  for(const mutate of [s=>s.context[172]^=1,s=>s.registers.mxcsr='0',s=>s.tid++,s=>s.registers.eip='0',s=>s.observedBreakpointId='other',s=>s.ranges.get('clock').bytes[0]^=1]){
    const snapshot=copySnapshot(held.snapshot);mutate(snapshot);assert.throws(()=>validateHeldForceRequest(held.request,snapshot),/Held force|Overlapping captured/);
  }
  for(const change of [{maxHoldMs:20001},{maxAttempts:25},{pid:0},{clock:349},{targetSha256:'00'.repeat(32)},{token:'00'}])assert.throws(()=>validateHeldForceRequest({...held.request,...change},held.snapshot),/Held force/);
});

test('exact bank-vector projection preserves all semantic native frame comparisons and actual capacity preimages', {skip:!existsSync(`${forceRetained}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(forceRetained),configuration=JSON.parse(await readFile(`${forceRetained}/configuration.json`,'utf8')),pair=pairNativeFrameSnapshots(capture,configuration).pairs[0];
  const original=compareNativeFramePair(pair,traceNativeFrameDispatches(pair.before,pair.options));
  const projected={...pair,before:projectCapturedBank(pair.before),after:projectCapturedBank(pair.after)};
  const actual=compareNativeFramePair(projected,traceNativeFrameDispatches(projected.before,projected.options));
  assert.equal(original.matched,true);assert.equal(actual.matched,true);assert.equal(actual.comparedBytes,original.comparedBytes);
  assert.deepEqual(actual.comparisons.map(r=>[r.id,r.address,r.length,r.policy]),original.comparisons.map(r=>[r.id,r.address,r.length,r.policy]),'No output policy or semantic comparison was dropped.');
  const vector=projected.before.ranges.get('active-sound-bank-storage');assert.equal(vector.length,376);assert.equal(Number(vector.vectorEnd)-Number(vector.vectorBegin),256);
  const originalMemory=createCapturedMemory([...pair.before.ranges.values()]).memory;
  assert.deepEqual(vector.bytes,originalMemory.subarray(Number(vector.vectorBegin),Number(vector.vectorCapacity)));
  assert.ok(pair.before.ranges.get('active-sound-bank-region').length>3000000);
});

test('synthetic bank pointer-vector proof requires a separate exact header, capacity rather than used length, and never grants null memory',()=>{
  const base=0x400000,address=base+0x2f2414,begin=0x1200000,header=Buffer.alloc(12);[begin,begin+8,begin+16].forEach((v,i)=>header.writeUInt32LE(v,i*4));
  const row={id:'active-sound-bank-storage',address:begin,length:16,bytes:Buffer.alloc(16,0x53),rangeMode:'vector-storage',requestedResolvedRoot:address,vectorHeaderAddress:address,vectorHeaderHex:header.toString('hex'),vectorBegin:begin,vectorEnd:begin+8,vectorCapacity:begin+16,maxVectorBytes:65536};
  const fixture=()=>({ranges:new Map([['sound-owner-vector-roots',{id:'sound-owner-vector-roots',address,length:12,bytes:Buffer.from(header)}],['active-sound-bank-storage',{...row,bytes:Buffer.from(row.bytes)}]])});
  assert.equal(validateHeldBankVector(fixture(),base).storageBytes,16);
  for(const mutate of [s=>s.ranges.delete('sound-owner-vector-roots'),s=>s.ranges.get(row.id).vectorHeaderAddress++,s=>s.ranges.get(row.id).vectorHeaderHex='00'.repeat(12),s=>s.ranges.get(row.id).length=8,s=>s.ranges.get(row.id).maxVectorBytes++,s=>s.ranges.get(row.id).vectorEnd++,s=>s.ranges.get(row.id).vectorBegin=0]){
    const s=fixture();mutate(s);assert.throws(()=>validateHeldBankVector(s,base),/bank vector/);
  }
  const empty=fixture(),r=empty.ranges.get(row.id);Object.assign(r,{address:0,length:0,bytes:Buffer.alloc(0),vectorBegin:0,vectorEnd:0,vectorCapacity:0,vectorHeaderHex:'00'.repeat(12)});empty.ranges.get('sound-owner-vector-roots').bytes.fill(0);
  assert.equal(validateHeldBankVector(empty,base).storageBytes,0);
  const memory=createCapturedMemory([...empty.ranges.values()]).memory;assert.throws(()=>memory.readUInt32LE(0),/Uncaptured|unmapped|captured/i);
});

test('synthetic force-only post-input wire proof accepts12 bytes and rejects pose/geometry/context or intervention changes', {skip:!available}, async()=>{
  const {held,report}=await fixture(),s=report.selected,p=s.inputProof,planSha='ef'.repeat(32),changed=cloneNativeFrameWithForce(held.snapshot,s).snapshot;
  const post={...changed,breakpointId:'native-frame-before',ordinal:5,heldForceInputPhase:'post-input',heldForcePreInputOrdinal:held.snapshot.ordinal,observedElapsedMs:held.snapshot.observedElapsedMs+1000};
  const intervention={type:'held-force-intervention',pid:held.request.pid,tid:held.request.tid,observedDebugEventOrdinal:held.request.observedDebugEventOrdinal,preInputOrdinal:held.snapshot.ordinal,token:held.request.token,requestSha256:held.requestSha256,sourcePlanSha256:planSha,participantIndex:s.participantIndex,bodyAddress:s.bodyAddress,address:s.bodyAddress+0x74,length:12,originalBytesHex:p.originalForceHex,replacementBytesHex:p.experimentalForceHex,originalBodySha256:p.originalBodySha256,normalQ16:s.border.normalQ16,signedScalarQ16:s.signedScalarQ16,nativeCounterfactualCompared:false,beforeOriginalInstruction:true,allCapturedInputSpansRevalidated:true,allNonForceBytesUnchanged:true,contextUnchanged:true,holdElapsedMs:1000};
  assert.equal(validateHeldForceTransition(held,post,intervention,report,planSha).matched,true);
  for(const change of [{address:s.bodyAddress+0x68},{length:16},{contextUnchanged:false},{holdElapsedMs:20000},{nativeCounterfactualCompared:true},{participantIndex:0},{pid:1}])assert.throws(()=>validateHeldForceTransition(held,post,{...intervention,...change},report,planSha),/Held force/);
  const pose=copySnapshot(post),row=[...pose.ranges.values()].find(r=>Number(r.address)<=s.bodyAddress+0x34&&Number(r.address)+r.length>s.bodyAddress+0x34);row.bytes[s.bodyAddress+0x34-Number(row.address)]^=1;row.sha256=digest(row.bytes);
  assert.throws(()=>validateHeldForceTransition(held,pose,intervention,report,planSha),/span/);
  const ctx=copySnapshot(post);ctx.context[180]^=1;assert.throws(()=>validateHeldForceTransition(held,ctx,intervention,report,planSha),/context/);
});

test('optional profile preserves exact sites, phase gates, current-candidate transport and declared bounds; mutations fail closed', {skip:!available}, async()=>{
  const {configuration:o}=await createNativeHeldChassisForceCaptureConfig('analysis/native-physics-local/startup-20261022','analysis/held-force-unused-test-output');
  assert.equal(validateHeldForceConfiguration(o),true);assert.equal(o.maxSnapshots,70);
  for(const b of o.breakpoints.filter(b=>b.id==='native-frame-before'||b.id==='native-frame-after'))assert.deepEqual(b.ranges.find(r=>r.id==='active-sound-bank-storage'),{id:'active-sound-bank-storage',rva:'0x2f2414',vectorStorage:true,maxVectorBytes:65536});
  const bank=o=>o.breakpoints.find(b=>b.id==='native-frame-before').ranges.find(r=>r.id==='active-sound-bank-storage');
  for(const mutate of [o=>o.heldForceInput.maxHoldMs++,o=>o.maxDurationMs++,o=>o.pendingFrameObserver.maxCandidateFrames++,o=>o.ownedWorkerObservation={},o=>o.breakpoints.find(b=>b.id==='native-frame-before').captureWhen.equalsBytesHex='03000000',o=>o.breakpoints.find(b=>b.id==='native-dispatch-entry').ranges.find(r=>r.id==='dispatch-candidate-arena').length=16,o=>o.phaseActions[0].writes[0].rva='0x509300',o=>o.breakpoints[0].rva='0x51012',o=>o.phaseActions[0].writes[0].expectedAnyBytesHex.push('02000000'),o=>o.breakpoints.push({id:'position-input',rva:'0x51012',ranges:[]}),o=>o.phaseActions[0].writes.push({rva:'0x509300',dereferenceOffsets:['0'],offset:'0x34',bytesHex:'00'.repeat(12),expectedBytesHex:'00'.repeat(12)}),o=>bank(o).maxVectorBytes++,o=>bank(o).rva='0x2f2418',o=>bank(o).dereferenceOffsets=['0'],o=>bank(o).id='some-other-vector']){
    const changed=structuredClone(o);mutate(changed);assert.throws(()=>validateHeldForceConfiguration(changed),/Held force|Native|Pending/);
  }
});

test('prepared optional configuration passes the full typed C# Validate API; no fixture executable or game is launched', {skip:process.platform!=='win32'||!available}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-held-force-'));
  try {
    const {configuration}=await createNativeHeldChassisForceCaptureConfig('analysis/native-physics-local/startup-20261022',path.join(dir,'capture'));
    const file=path.join(dir,'config.json');await writeFile(file,JSON.stringify(configuration));
    const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url)),script=path.join(dir,'typed-validation.ps1');
    await writeFile(script,`$ErrorActionPreference='Stop'\nAdd-Type -Path '${source.replaceAll("'","''")}'\nAdd-Type -AssemblyName System.Web.Extensions\n$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer\n$options=$reader.Deserialize([IO.File]::ReadAllText('${file.replaceAll("'","''")}'),[RollcageCapture.Options])\n[RollcageCapture.NativeDebugger]::Validate($options)\n'Full typed held config PASS; no process launched.'\n`);
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',await readFile(script,'utf8')],{encoding:'utf8',windowsHide:true,timeout:30000});
    assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(existsSync(configuration.outputDirectory),false);
    const bank=o=>o.breakpoints.find(b=>b.id==='native-frame-before').ranges.find(r=>r.id==='active-sound-bank-storage');
    for(const mutate of [o=>o.heldForceInput.maxHoldMs=20001,o=>o.phaseActions[0].writes[0].rva='0x509300',o=>o.breakpoints[0].rva='0x51012',o=>o.phaseActions[0].writes[0].expectedAnyBytesHex.push('02000000'),o=>{o.breakpoints.push({id:'position-input',rva:'0x51012',ranges:[]});o.phaseActions.push({breakpointId:'position-input',hit:1,writes:[{rva:'0x509300',dereferenceOffsets:['0'],offset:'0x34',bytesHex:'00'.repeat(12),expectedBytesHex:'00'.repeat(12)}]});},o=>bank(o).maxVectorBytes++,o=>bank(o).dereferenceOffsets=['0'],o=>bank(o).rva='0x2f2418',o=>bank(o).id='other-vector']){
      const changed=structuredClone(configuration);mutate(changed);await writeFile(file,JSON.stringify(changed));
      const bad=spawnSync('powershell.exe',['-NoProfile','-Command',await readFile(script,'utf8')],{encoding:'utf8',windowsHide:true,timeout:30000});
      assert.notEqual(bad.status,0);assert.match(bad.stderr,/Held force/);assert.equal(existsSync(configuration.outputDirectory),false);
    }
  }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});

test('partial snapshot loader binds configured spans/raw context and strict thread evidence; legacy native collisions cannot pass as held results', {skip:!available}, async()=>{
  const native=await loadPhysicsCapture(forceRetained),original=native.snapshots.find(s=>s.breakpointId==='native-frame-before'),snapshot=projectCapturedBank(original);
  snapshot.breakpointId='held-force-pre-input';snapshot.observedBreakpointId='native-frame-before';snapshot.capturePhase='held-pre-input-before-original-instruction';
  const records=(await readFile(`${forceRetained}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse),owner=records.find(r=>r.type==='owned-process');
  const held={snapshot,request:{schemaVersion:1,kind:'held-chassis-force-input',token:'ab'.repeat(16),targetSha256:REDUX_SHA256,pid:owner.pid,tid:snapshot.tid,moduleBaseAddress:Number([...snapshot.ranges.values()].find(r=>r.moduleBaseAddress).moduleBaseAddress),clock:snapshot.ranges.get('clock').bytes.readUInt32LE(),observedDebugEventOrdinal:snapshot.observedDebugEventOrdinal,maxHoldMs:20000,maxAttempts:24,maxPendingBytes:128*1024*1024}},dir=await mkdtemp(path.join(tmpdir(),'rollcage-held-force-'));
  try {
    const {configuration}=await createNativeHeldChassisForceCaptureConfig('analysis/native-physics-local/startup-20261022',path.join(dir,'unused-capture'));
    const old=JSON.parse(await readFile(`${forceRetained}/configuration.json`,'utf8'));
    for(const id of ['native-frame-before','native-frame-after'])configuration.breakpoints.find(b=>b.id===id).ranges=old.breakpoints.find(b=>b.id===id).ranges.map(r=>r.id==='active-sound-bank-region'?{id:'active-sound-bank-storage',rva:'0x2f2414',vectorStorage:true,maxVectorBytes:65536}:r);
    await writeFile(path.join(dir,'configuration.json'),JSON.stringify(configuration));
    const row={...held.snapshot,ranges:[...held.snapshot.ranges.values()].map(({bytes,...r})=>r)};delete row.context;
    //All bytes, including capacity and FS evidence, derive from this single
    //retained process. Only its transport/role is projected; no live hold claim.
    await Promise.all([...held.snapshot.ranges.values()].map(r=>writeFile(path.join(dir,r.file),r.bytes,{flag:'wx'})));
    await writeFile(path.join(dir,row.contextFile),held.snapshot.context,{flag:'wx'});
    const request={...held.request,snapshot:row};await writeFile(path.join(dir,'held-force-request.json'),JSON.stringify(request));
    const loaded=await loadHeldForceRequest(dir);assert.equal(loaded.snapshot.ranges.size,held.snapshot.ranges.size);assert.equal(loaded.snapshot.contextSha256,held.snapshot.contextSha256);assert.equal(loaded.snapshot.ranges.get('active-sound-bank-storage').length,376);
    const rangeFootprints=[...loaded.snapshot.ranges.values()].filter(r=>r.id!=='thread-seh-head').map(r=>({id:r.id,address:r.address,length:r.length,vectorHeaderBytes:r.rangeMode==='vector-storage'?12:0,byteFootprint:r.length+(r.rangeMode==='vector-storage'?12:0)}));
    const preSnapshotBytes=720+rangeFootprints.reduce((n,r)=>n+r.byteFootprint,0),eventSnapshotBytes=720+configuration.breakpoints.find(b=>b.id==='native-dispatch-entry').ranges.reduce((n,r)=>n+r.length,0);
    const budget={type:'held-force-budget',metadataBeforeBlobRead:true,pid:loaded.request.pid,tid:loaded.request.tid,observedDebugEventOrdinal:loaded.request.observedDebugEventOrdinal,preSnapshotBytes,eventSnapshotBytes,eventReserveBytes:eventSnapshotBytes*64,requiredPendingBytes:preSnapshotBytes*3+eventSnapshotBytes*64,pendingLimitBytes:134217728,snapshotLimit:70,requiredAdditionalSnapshots:67,snapshotsBefore:loaded.snapshot.ordinal-1,sufficient:true,contextBytes:716,threadEnvironmentBytes:4,rangeFootprints};
    assert.equal(validateHeldBudgetEvidence(loaded,configuration,budget).verified,true);
    for(const mutate of [b=>b.requiredPendingBytes--,b=>b.rangeFootprints[0].length--,b=>b.rangeFootprints.find(r=>r.id==='active-sound-bank-storage').vectorHeaderBytes=0,b=>b.sufficient=false]){const changed=structuredClone(budget);mutate(changed);assert.throws(()=>validateHeldBudgetEvidence(loaded,configuration,changed),/budget/);}
    await waitForHeldForceRequest(dir,{timeoutMs:100});
    const original=request.snapshot.ranges[0].file;request.snapshot.ranges[0].file='../escape.bin';await writeFile(path.join(dir,'held-force-request.json'),JSON.stringify(request));
    await assert.rejects(loadHeldForceRequest(dir),/unsafe blob/);request.snapshot.ranges[0].file=original;
    request.snapshot.threadEnvironment.fsBase++;await writeFile(path.join(dir,'held-force-request.json'),JSON.stringify(request));await assert.rejects(loadHeldForceRequest(dir),/descriptor\/base\/SEH/);
    request.snapshot.threadEnvironment.fsBase--;request.snapshot.ranges.find(r=>r.id==='active-sound-bank-storage').vectorHeaderHex='00'.repeat(12);await writeFile(path.join(dir,'held-force-request.json'),JSON.stringify(request));await assert.rejects(loadHeldForceRequest(dir),/bank vector independent header/);
    const missing=path.join(dir,'missing');await assert.rejects(waitForHeldForceRequest(missing,{timeoutMs:1}),/watch deadline/);
    const report=await checkNativeHeldChassisForce(retained,path.join(dir,'not-held.json'));assert.equal(report.matched,false);assert.match(report.failure.message,/ENOENT|request/);assert.equal(report.nativeCounterfactualCompared,false);
  }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});

test('pure C# decision, ownership and deadline policies reject malformed or unbounded input; no native process is launched', {skip:process.platform!=='win32'||!available}, async()=>{
  const {held,report}=await fixture(),text=encodeHeldForceDecision(held,report,'ef'.repeat(32)),body=createCapturedMemory([...held.snapshot.ranges.values()]).memory.subarray(report.selected.bodyAddress,report.selected.bodyAddress+0x3e78);
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-held-force-'));
  try {
    const packet=path.join(dir,'decision.txt'),bytes=path.join(dir,'body.bin'),script=path.join(dir,'policy.ps1');await writeFile(packet,text);await writeFile(bytes,body);
    const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url));
    await writeFile(script,`$ErrorActionPreference='Stop'\nAdd-Type -Path '${source.replaceAll("'","''")}'\n$t=[IO.File]::ReadAllText('${packet.replaceAll("'","''")}')\n$token='${held.request.token}';$sha='${held.requestSha256}'\n$d=[RollcageCapture.NativeDebugger]::ParseHeldForceDecision($t,$token,$sha)\n$b=[IO.File]::ReadAllBytes('${bytes.replaceAll("'","''")}')\n$p=New-Object byte[] 8;[BitConverter]::GetBytes([uint32]$d.body).CopyTo($p,0)\n[RollcageCapture.NativeDebugger]::ValidateHeldForceBody($d,$b,$d.body,$d.body,16384,$p)\nfunction Reject($block){$bad=$false;try{&$block|Out-Null}catch{$bad=$true};if(!$bad){throw 'Expected rejection'}}\nReject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision($t,'00'*16,$sha)}\nReject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision($t,$token,'00'*32)}\nReject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision($t.Replace('ROLLCAGE_HELD_FORCE_V1','other'),$token,$sha)}\nReject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision($t.Replace([char]10,[char]13),$token,$sha)}\n$v=$t.Split([char]10);$v[3]='6';Reject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision(($v -join [char]10),$token,$sha)}\n$v=$t.Split([char]10);$v[7]='000000000000000000000000';Reject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision(($v -join [char]10),$token,$sha)}\n$v=$t.Split([char]10);$v[8]='65537,0,1';Reject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision(($v -join [char]10),$token,$sha)}\n$v=$t.Split([char]10);$v[9]='65536';Reject {[RollcageCapture.NativeDebugger]::ParseHeldForceDecision(($v -join [char]10),$token,$sha)}\n$b[52]=$b[52] -bxor 1;Reject {[RollcageCapture.NativeDebugger]::ValidateHeldForceBody($d,$b,$d.body,$d.body,16384,$p)}\nif([RollcageCapture.NativeDebugger]::HeldForceDeadlineExpired(1000,20999,90000)){throw 'Premature deadline'}\nif(![RollcageCapture.NativeDebugger]::HeldForceDeadlineExpired(1000,21000,90000)){throw 'Missing hold deadline'}\nif(![RollcageCapture.NativeDebugger]::HeldForceDeadlineExpired(80000,90000,90000)){throw 'Missing total deadline'}\nReject {[RollcageCapture.NativeDebugger]::HeldForceDeadlineExpired(2,1,90000)}\nReject {[RollcageCapture.NativeDebugger]::HeldForceDeadlineExpired(1,2,90001)}\n'Pure held policy passed; no native launch.'\n`);
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',await readFile(script,'utf8')],{encoding:'utf8',windowsHide:true,timeout:30000});
    assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/Pure held policy passed/);
  } finally {assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));assert.match(path.basename(dir),/^rollcage-held-force-/);await rm(dir,{recursive:true,force:true});}
});

test('pure C# bank headers and live metadata budget accounting reject forged capacity and emit before reservation/blob reads', {skip:process.platform!=='win32'},async()=>{
  const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url));
  const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${source.replaceAll("'","''")}'
function VectorHeaderBytes([uint32]$a,[uint32]$b,[uint32]$c){return ,([BitConverter]::GetBytes($a)+[BitConverter]::GetBytes($b)+[BitConverter]::GetBytes($c))}
function Reject($block){$bad=$false;try{&$block|Out-Null}catch{$bad=$true};if(!$bad){throw 'Expected rejection'}}
$h=VectorHeaderBytes 4096 4104 4112
$v=[RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($h,$h,0x6f2414,0x6f2414)
if($v.length-ne16){throw 'Used bytes replaced full capacity'}
$empty=VectorHeaderBytes 0 0 0
if(([RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($empty,$empty,0x6f2414,0x6f2414)).length-ne0){throw 'Empty vector gained storage'}
$unused=VectorHeaderBytes 4096 4096 4112
if(([RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($unused,$unused,0x6f2414,0x6f2414)).length-ne16){throw 'Unused capacity lost'}
Reject {[RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($h,$empty,0x6f2414,0x6f2414)}
Reject {[RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($h,$h,0x6f2414,0x6f2418)}
foreach($words in @(@(0,0,16),@(4096,4108,4104),@(4097,4105,4113),@(4096,4104,69636))){$x=VectorHeaderBytes $words[0] $words[1] $words[2];Reject {[RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($x,$x,0x6f2414,0x6f2414)}}
if([RollcageCapture.NativeDebugger]::HeldForceRequiredBytes(43659392,50618)-ne134217728){throw 'Budget boundary differs'}
if([RollcageCapture.NativeDebugger]::HeldForceRequiredBytes(43659393,50618)-ne134217731){throw 'Budget overflow hidden'}
Reject {[RollcageCapture.NativeDebugger]::HeldForceRequiredBytes(719,50618)}
Reject {[RollcageCapture.NativeDebugger]::HeldForceRequiredBytes([long]::MaxValue,50618)}
'Bank header/budget pure checks passed; no native process launched.'`;
  const run=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(run.status,0,run.stdout+run.stderr);
  const cs=await readFile(source,'utf8'),reader=cs.slice(cs.indexOf('static BufferedSnapshot ReadBufferedSnapshot('),cs.indexOf('static void CommitBufferedGroup('));
  const diagnostic=reader.indexOf('footprintObserver(diagnostic)'),reserve=reader.indexOf('if(separateReserve==null)progress.Reserve'),sharedReads=reader.indexOf('storage=ReadContainedRangeStorage'),blobs=reader.indexOf('range.data = ReadCaptureRangeBytes');
  assert.ok(diagnostic>=0&&reserve>diagnostic&&sharedReads>reserve&&blobs>reserve,'Resolved per-range footprints precede byte reservation and both shared/default full blob reads.');
});

test('synthetic native wire candidates prove actual type3/border7 geometry, with wrong-body/plane/ownership rejected',()=>{
  const base=0x400000,body=0x1300000,pool=0x1400000,vertices=0x1500000,eventAddress=0x1200000,normal=[0,0,65536];
  const b=Buffer.alloc(0x180),c=Buffer.alloc(0x8000),e=Buffer.alloc(104),root=Buffer.alloc(4);b.writeUInt32LE(3);b.writeUInt32LE(pool,0x154);b.writeUInt16LE(1,0x15c);c[0]=7;c[5]=1;c.writeUInt32LE(256,8);c.writeUInt32LE(vertices+8,12);e.writeUInt32LE(1);e.writeUInt32LE(body,4);e.writeInt32LE(65536,0x40);e.writeInt32LE(256,0x44);e[0x54]=1;root.writeUInt32LE(pool);
  const row=(id,address,bytes)=>({id,address,length:bytes.length,bytes}),snapshot={ordinal:9,ranges:new Map([row('dispatch-event',eventAddress,e),row('dispatch-body-header',body,b),row('dispatch-candidate-arena',pool,c),row('candidate-root',base+0x51e788,root)].map(r=>[r.id,r]))};
  const replay={manifest:{moduleBaseAddress:base},geometry:{grid:{normals:[{packed:256}],sectors:[{rows:1,columns:1,vertexAddress:vertices,vertices:[[0,0,0],[100,0,0],[0,100,0],[100,100,0]],borders:[{left:{type:6,column:0,covered:true,normal:0},right:{type:7,column:1,covered:true,normal:0}}]}]}}};
  const event={classification:{category:'terrain-border',response:'swept-contact'},before:{field44:256,normalQ16:normal,terrainCandidates:[{address:pool,type:7,id:256,normalQ16:normal}]}},selected={bodyAddress:body,border:{cellId:256,normalQ16:normal}};
  assert.equal(proveNativeChassisBorderCandidate(snapshot,event,replay,selected).candidates[0].type,7);
  for(const mutate of [s=>s.ranges.get('dispatch-body-header').bytes.writeUInt32LE(4),s=>s.ranges.get('dispatch-candidate-arena').bytes[0]=5,s=>s.ranges.get('dispatch-candidate-arena').bytes[1]=1,s=>s.ranges.get('dispatch-candidate-arena').bytes.writeUInt32LE(vertices+16,12),s=>s.ranges.get('dispatch-candidate-arena').bytes.writeUInt32LE(vertices+1000,12)]){
    const changed={...snapshot,ranges:new Map([...snapshot.ranges].map(([id,r])=>[id,{...r,bytes:Buffer.from(r.bytes)}]))};mutate(changed);assert.throws(()=>proveNativeChassisBorderCandidate(changed,event,replay,selected),/proof|candidate|geometry/);
  }
  const left={...snapshot,ranges:new Map([...snapshot.ranges].map(([id,r])=>[id,{...r,bytes:Buffer.from(r.bytes)}]))};
  const wire=left.ranges.get('dispatch-candidate-arena').bytes;wire[0]=6;wire[5]=0;wire.writeUInt32LE(vertices+16,12);left.ranges.get('dispatch-event').bytes.writeInt32LE(0,0x44);
  const leftEvent={...event,before:{...event.before,field44:0,terrainCandidates:[{address:pool,type:6,id:0,normalQ16:normal}]}},leftSelected={...selected,border:{...selected.border,cellId:0}};
  assert.equal(proveNativeChassisBorderCandidate(left,leftEvent,replay,leftSelected).candidates[0].vertexIndex,2);
});

const controlledWall='analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev3-shared-v5-20261023';
test('original controlled V5 matches force-only input, all eight native responses and the exact right-border vertex',{skip:!existsSync(`${controlledWall}/trace.jsonl`)},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rollcage-held-wall-regression-'));
  try{
    const report=await checkNativeHeldChassisForce(controlledWall,path.join(directory,'report.json'));
    assert.equal(report.matched,true,report.failure?.stack);assert.equal(report.input.matched,true);assert.equal(report.input.changedLength,12);
    assert.equal(report.frame.matched,true);assert.equal(report.frame.comparedBytes,4885468);
    assert.equal(report.dispatch.matched,true);assert.equal(report.dispatch.sourceProcessedEvents,8);assert.equal(report.dispatch.events.length,8);
    assert.equal(report.chassisBorders.length,2);
    for(const proof of report.chassisBorders){
      const plane=proof.candidates[0];assert.equal(plane.type,7);assert.equal(plane.side,'right');assert.equal(plane.column,21);assert.equal(plane.row,80);assert.equal(plane.vertexIndex,1781);
      assert.deepEqual(plane.normalQ16,[26624,0,59392]);assert.deepEqual(plane.planePoint,[-1149,-204,-8011]);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
