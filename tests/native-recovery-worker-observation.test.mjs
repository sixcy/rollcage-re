import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createNativeRecoveryWorkerCaptureConfig, nativeRecoveryWorkerProfileOptions, verifyNativeRecoveryWorkerEvidence} from '../tools/prepare-native-recovery-worker-capture.mjs';
import {createNativeRecoverySoundCaptureConfig} from '../tools/prepare-native-recovery-sound-capture.mjs';
import {nativeOwnedWorkerObservationPolicy, nativeWorkerLookupSite, nativeWorkerLookupRanges, workerSourceVtableWords, collectOwnedWorkerObservationRecords, verifyOwnedWorkerSnapshotAdmission} from '../tools/lib/native-recovery-worker-observation.mjs';
import {createNativeRecoveryWorkerSourceCaptureConfig, verifyNativeRecoveryWorkerSourceEvidence} from '../tools/prepare-native-recovery-worker-source-capture.mjs';
import {verifyNativeRecoverySoundCaptureConfiguration, selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {collectNativeThreadRecords} from '../tools/lib/native-thread-observations.mjs';
import {verifyNativeObservationActivation} from '../tools/lib/native-observation-activation.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

test('optional services-worker adds one site/policy while preserving all services-active descriptors, guards and bounds', async () => {
  const baseline = (await createNativeRecoverySoundCaptureConfig('synthetic', 'not-launched', nativeRecoveryWorkerProfileOptions)).configuration;
  const config = (await createNativeRecoveryWorkerCaptureConfig('synthetic', 'not-launched')).configuration;
  const restored = structuredClone(config); delete restored.ownedWorkerObservation;
  restored.breakpoints.pop(); restored.pendingFrameObserver.nestedBreakpointIds.pop(); restored.observationActivation.observationBreakpointIds.pop();
  assert.deepEqual(restored, baseline);
  assert.equal(config.pendingFrameObserver.nestedBreakpointIds.length, 53);
  assert.equal(config.maxDurationMs, 90000); assert.equal(config.maxSnapshots, 350);
  assert.equal(config.pendingFrameObserver.maxNestedSnapshots, 115); assert.equal(config.pendingFrameObserver.maxPendingBytes, 128 * 1024 * 1024);
  assert.equal(config.observationActivation.rawHit, 229); assert.equal(config.pendingFrameObserver.nestedCaptureScope, 'frame-thread');
  assert.deepEqual(config.ownedWorkerObservation, nativeOwnedWorkerObservationPolicy());
  const point = config.breakpoints.at(-1); assert.equal(point.rva, '0xa79f0');
  assert.deepEqual(point.ranges.slice(-2), [{id: 'worker-lookup-entry', baseRegister: 'esp', length: 8}, nativeOwnedWorkerObservationPolicy().threadIdSource]);
  assert.equal(point.ranges.some(row => row.baseRegister === 'esi'), false);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(config).ownedWorkerObservationDeclared, true);
  assert.equal((await verifyNativeRecoveryWorkerEvidence()).evidenceIds.length, 5);
  for (const mutate of [
    c => c.ownedWorkerObservation.maxSnapshots++, c => c.ownedWorkerObservation.threadIdSource.offset = '0x28',
    c => {delete c.ownedWorkerObservation;}, c => c.breakpoints.pop(), c => c.observationActivation.observationBreakpointIds.pop(),
    c => c.pendingFrameObserver.nestedCaptureScope = 'all-threads', c => c.breakpoints.at(-1).ranges.at(-2).length = 12,
    c => c.breakpoints.at(-1).captureWhen.equalsBytesHex = '03000000', c => c.maxSnapshots++,
  ]) {const bad = structuredClone(config); mutate(bad); assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(bad));}
});

function fixture(returnWord = 0x4b1304) {
  const manager = 0x1600000, worker = 0x1610000, table = 0x1620000, esp = 0x500000, session = 0x1700000;
  const policy = nativeOwnedWorkerObservationPolicy();
  const proof = {breakpointId: nativeWorkerLookupSite[0], pid: 100, tid: 2, threadIdSourceAddress: worker + 0x24,
    actualThreadIdBytesHex: '02000000', expectedTid: 2, ownedLiveThread: true, pendingFrameActive: true, pendingFrameTid: 1,
    candidateIndex: 1, observationIndex: 1, maxSnapshots: 1, observedDebugEventOrdinal: 4, beforeOriginalInstruction: true};
  const trace = [{type: 'owned-process', pid: 100, tid: 1}, {type: 'debug-event', event: 3, pid: 100, tid: 1, ordinal: 1},
    {type: 'debug-event', event: 2, pid: 100, tid: 2, ordinal: 2}, {type: 'debug-event', event: 1, pid: 100, tid: 1, ordinal: 3},
    {type: 'pending-frame-started', frameTid: 1, candidateIndex: 1}, {type: 'debug-event', event: 1, pid: 100, tid: 2, ordinal: 4},
    {type: 'owned-worker-observation-admitted', ...proof}];
  const part = (id, address, bytes) => ({id, address, length: bytes.length, bytes});
  const word = value => {const b = Buffer.alloc(4); b.writeUInt32LE(value); return b;};
  const object = Buffer.alloc(80), region = Buffer.alloc(0xd74), vtable = Buffer.alloc(0x64), entry = Buffer.alloc(8);
  for (const [off, value] of [[0,0x5d39f0],[0x24,2],[0x34,0x4a3790],[0x38,worker],[0x44,0x4a94a0],[0x48,manager],[0x4c,20]]) object.writeUInt32LE(value,off);
  region.writeUInt32LE(table); region.writeUInt32LE(worker,0x824); vtable.writeUInt32LE(0x4a79f0,0x48); vtable.writeUInt32LE(0x4b12d0,0x60);
  entry.writeUInt32LE(returnWord); entry.writeUInt32LE(13,4);
  const registers = {edi: 0xdead1111, esi: 0xdeadbeef, ebx: 0xdead2222, edx: 0xdead3333, ecx: manager, eax: table, ebp: 0xdead4444, eip: 0x4a79f0, esp};
  const context = Buffer.alloc(716); for (const [name,offset] of Object.entries({edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,esp:196})) context.writeUInt32LE(registers[name],offset);
  const ranges = [part('recovery-audio-manager-root',0x714b08,word(manager)),part('recovery-audio-manager-region',manager,region),
    part('recovery-audio-worker-object',worker,object),part('recovery-audio-manager-vtable',table,vtable),part('manager-worker-tid',worker+0x24,word(2)),
    part('worker-lookup-entry',esp,entry),part('recovery-audio-clock',0x90a548,word(228))];
  const row = {ordinal:3,hit:1,breakpointId:policy.breakpointId,tid:2,observedDebugEventOrdinal:4,registers,context,ranges:new Map(ranges.map(r=>[r.id,r])),
    deferredPublication:true,pendingFrame:{role:'worker-once',frameTid:1,candidateIndex:1},ownedWorkerObservation:{...proof},
    captureWhen:{address:session+0x57c,actualBytesHex:'04000000',equalsBytesHex:'04000000'}};
  const before = {ordinal:2,tid:1,observedDebugEventOrdinal:3,pendingFrame:{candidateIndex:1,nestedSnapshots:1},ranges:new Map([
    ['clock',part('clock',0x90a548,word(228))],['session',part('session',session,Buffer.alloc(1424))]])};
  const after = {ordinal:4,tid:1,observedDebugEventOrdinal:5};
  const capture = {snapshots:[before,row,after],nativeThreadRecords:collectNativeThreadRecords(trace),ownedWorkerObservationRecords:collectOwnedWorkerObservationRecords(trace)};
  return {capture,row,pair:{before,after,moduleBaseAddress:0x400000},configuration:{ownedWorkerObservation:policy},trace,manager,worker};
}

test('synthetic entry proof identifies all four native callers, retains unknown returns and never dereferences incoming ESI', () => {
  for (const [word, caller] of [[0x4b1304,'manager-gain'],[0x4a7ca1,'manager-frequency'],[0x4a7635,'source-factory'],[0x4adc00,'sample-stream'],[0x12345678,'unclassified-native-return']]) {
    const f=fixture(word), report=verifyOwnedWorkerSnapshotAdmission(f.capture,f.row,f.pair,f.configuration);
    assert.equal(report.caller,caller); assert.equal(report.callerIdentified,word!==0x12345678);
    assert.equal(report.registers.esi,0xdeadbeef); assert.equal(report.requestedId,13); assert.equal(report.association.evidenceType,'owned-create-thread');
    assert.equal(report.sourceReplayComplete,false); assert.equal(report.fullConcurrencyProved,false); assert.equal(report.locks.length,2);
  }
});

test('worker proof rejects raw context, source, vtable, backlink, lifecycle, one-shot and pending admission tampering', () => {
  for (const mutate of [
    f=>f.row.context.writeUInt32LE(0,172), f=>f.row.context.writeUInt32LE(0,196), f=>f.row.registers.esi++,
    f=>f.row.ranges.get('manager-worker-tid').bytes.writeUInt32LE(3), f=>f.row.ranges.get('recovery-audio-worker-object').bytes.writeUInt32LE(0,0x38),
    f=>f.row.ranges.get('recovery-audio-worker-object').bytes.writeUInt32LE(0,0x48), f=>f.row.ranges.get('recovery-audio-manager-vtable').bytes.writeUInt32LE(0,0x48),
    f=>f.row.ranges.get('worker-lookup-entry').address++, f=>f.row.ranges.get('recovery-audio-clock').bytes.writeUInt32LE(229),
    f=>f.row.captureWhen.address++, f=>f.row.pendingFrame.role='nested', f=>f.row.pendingFrame.candidateIndex++,
    f=>f.row.ownedWorkerObservation.pid++, f=>f.row.ownedWorkerObservation.maxSnapshots++, f=>f.row.tid=1,
    f=>f.capture.ownedWorkerObservationRecords=[], f=>f.capture.ownedWorkerObservationRecords.push({...f.capture.ownedWorkerObservationRecords[0]}),
    f=>f.capture.ownedWorkerObservationRecords[0].debugEventTid++, f=>f.capture.nativeThreadRecords[2].pid++,
    f=>f.capture.nativeThreadRecords.splice(2,1), f=>f.capture.snapshots.push({...f.row,ordinal:9}),
  ]) {const f=fixture();mutate(f);assert.throws(()=>verifyOwnedWorkerSnapshotAdmission(f.capture,f.row,f.pair,f.configuration));}
  const f=fixture(); const exited=[...f.trace.slice(0,3),{type:'debug-event',event:4,pid:100,tid:2,ordinal:3}];
  f.capture.nativeThreadRecords=collectNativeThreadRecords(exited);
  assert.throws(()=>verifyOwnedWorkerSnapshotAdmission(f.capture,f.row,f.pair,f.configuration),/no live/);
});

test('actual admission records require owned exception/frame provenance and preserve absence on legacy traces', () => {
  assert.deepEqual(collectOwnedWorkerObservationRecords([{type:'capture'}]),[]);
  for (const mutate of [
    r=>r[5].pid++, r=>r[5].tid++, r=>r[5].event=2, r=>r[5].ordinal=3, r=>r[4].frameTid=2,
    r=>r[4].candidateIndex++, r=>r[6].pendingFrameActive=false, r=>r[6].ownedLiveThread=false,
    r=>r[6].actualThreadIdBytesHex='03000000', r=>r[6].maxSnapshots=2, r=>r[6].beforeOriginalInstruction=false,
    r=>r.push({...r[6]}), r=>r.splice(5,0,{type:'pending-frame-discarded'}), r=>r[6].breakpointId='foreign-site',
  ]) {const r=fixture().trace;mutate(r);assert.throws(()=>collectOwnedWorkerObservationRecords(r));}
});

test('loader retains actual admission provenance and rejects raw context/blob hash tampering',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rollcage-worker-blobs-')),f=fixture();
  const hash=b=>createHash('sha256').update(b).digest('hex');
  try {
    const rows=[{type:'capture',schemaVersion:1,executableSha256:'a'.repeat(64)},...f.trace];
    for(const snapshot of f.capture.snapshots){
      const {ranges,context=Buffer.alloc(716),...row}=snapshot;
      row.type='snapshot';row.breakpointId??=row===f.pair.before?'before':'parent';row.hit??=1;
      // Parent rows are serialization fixtures only; no native parent replay is claimed.
      if(!snapshot.breakpointId)row.breakpointId=snapshot===f.pair.before?'parent-before':'parent-after';
      row.contextFile=`context-${row.ordinal}.bin`;row.contextSha256=hash(context);await writeFile(path.join(directory,row.contextFile),context);
      row.ranges=[];
      for(const [id,part] of ranges??[]){const file=`range-${row.ordinal}-${id}.bin`;await writeFile(path.join(directory,file),part.bytes);row.ranges.push({...part,bytes:undefined,file,sha256:hash(part.bytes)});}
      rows.push(row);
    }
    rows.push({type:'complete',snapshots:3});
    const save=()=>writeFile(path.join(directory,'trace.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');await save();
    // Serialization snapshot ordinals are globally contiguous.
    rows.filter(r=>r.type==='snapshot').forEach((r,i)=>r.ordinal=i+1);await save();
    const loaded=await loadPhysicsCapture(directory),worker=loaded.snapshots[1];
    assert.equal(loaded.ownedWorkerObservationRecords.length,1);
    assert.equal(verifyOwnedWorkerSnapshotAdmission(loaded,worker,{...f.pair,before:loaded.snapshots[0],after:loaded.snapshots[2]},f.configuration).caller,'manager-gain');
    const file=path.join(directory,worker.contextFile),original=await readFile(file),changed=Buffer.from(original);changed[172]^=1;await writeFile(file,changed);
    await assert.rejects(loadPhysicsCapture(directory),/blob hash differs/);await writeFile(file,original);
    rows.find(r=>r.type==='owned-worker-observation-admitted').expectedTid++;await save();
    await assert.rejects(loadPhysicsCapture(directory),/provenance differs/);
  }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});

test('activation keeps all ordinary nested snapshots on the parent thread with one explicitly proven exception', () => {
  const f=fixture(), id=nativeWorkerLookupSite[0]; f.pair.before.pendingFrame.nestedSnapshots=2;
  const ordinary={ordinal:4,breakpointId:'ordinary',tid:1,observedDebugEventOrdinal:4,deferredPublication:true,pendingFrame:{role:'nested',frameTid:1,candidateIndex:1}};
  f.capture.snapshots.push(ordinary);
  const trigger={ordinal:1,breakpointId:'trigger',hit:229,tid:1,observedDebugEventOrdinal:2,capturePhase:'before-declared-writes-before-original-instruction',registers:{}};
  f.capture.snapshots.unshift(trigger);
  Object.assign(f.configuration,{observationActivation:{breakpointId:'trigger',rawHit:229,observationBreakpointIds:['ordinary',id]},pendingFrameObserver:{nestedCaptureScope:'frame-thread'},
    phaseActions:[{breakpointId:'trigger',hit:229,writes:[{address:'0x100',expectedBytesHex:'00',bytesHex:'00'}]}],breakpoints:[{id:'ordinary',address:'0x400100'},{id,address:'0x4a79f0'}]});
  const records=f.capture.observationActivationRecords=[]; const add=row=>records.push({...row,traceRecordOrdinal:records.length+1});
  for(const [site,address] of [['ordinary','0x400100'],[id,'0x4a79f0']])add({type:'breakpoint-installation-deferred',id:site,address,codeModified:false,activationBreakpointId:'trigger',activationRawHit:229,originalBytesHex:'53'});
  add({type:'snapshot',...trigger}); add({type:'intervention',breakpointId:'trigger',hit:229,address:'0x100',originalBytesHex:'00',replacementBytesHex:'00',acceptedOriginalBytesHex:['00']});
  for(const [site,address] of [['ordinary','0x400100'],[id,'0x4a79f0']])add({type:'breakpoint-activated',id:site,address,originalBytesHex:'53',patchBytesHex:'cc',activationBreakpointId:'trigger',activationRawHit:229,activationTid:1,observedDebugEventOrdinal:2,beforeOriginalInstruction:true,rawHitBefore:0,matchingHitBefore:0,captureHitBefore:0});
  add({type:'observation-activation-complete',breakpointId:'trigger',rawHit:229,tid:1,observedDebugEventOrdinal:2,snapshotCount:1,beforeOriginalInstruction:true,guardActionCompleted:true,installed:[{id:'ordinary',address:'0x400100'},{id,address:'0x4a79f0'}]});
  add({type:'snapshot',ordinal:2,breakpointId:'native-recovery-before',tid:1,observedDebugEventOrdinal:3});
  assert.equal(verifyNativeObservationActivation(f.capture,f.pair,f.configuration).ownedWorkerSnapshots,1);
  ordinary.tid=2; assert.throws(()=>verifyNativeObservationActivation(f.capture,f.pair,f.configuration),/outside/);
  ordinary.tid=1; f.pair.before.pendingFrame.nestedSnapshots=1; assert.throws(()=>verifyNativeObservationActivation(f.capture,f.pair,f.configuration),/outside/);
});

test('C# pure worker policy matrix compiles and rejects invalid configurations without launching native code', {skip:process.platform!=='win32'}, async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rollcage-worker-policy-'));
  try {
    const source=path.resolve('tools/lib/native-physics-debugger.cs').replaceAll("'","''"), script=path.join(directory,'policy.ps1');
    await writeFile(script,`$ErrorActionPreference='Stop'
Add-Type -Path '${source}'
function Check([bool]$ok) { if (!$ok) { throw 'Policy assertion failed' } }
$p=New-Object RollcageCapture.OwnedWorkerObservationProgress
Check (!$p.NeedsThreadSourceRead($false,$true)); Check (!$p.NeedsThreadSourceRead($true,$false)); Check ($p.NeedsThreadSourceRead($true,$true))
Check (!$p.CanCapture($false,$true,2,0,1,$false)); Check (!$p.CanCapture($true,$false,2,0,1,$false))
foreach($case in @(@(0,1,$true),@(1,1,$true),@(2,1,$false))) { $failed=$false; try { $p.CanCapture($true,$true,2,$case[0],$case[1],$case[2]) } catch {$failed=$true}; Check $failed }
Check (!$p.CanCapture($true,$true,3,2,1,$true)); Check ($p.CanCapture($true,$true,2,2,1,$true)); $p.CommitSnapshot()
Check (!$p.NeedsThreadSourceRead($true,$true)); Check (!$p.CanCapture($true,$true,2,2,1,$true))
$failed=$false; try {$p.CommitSnapshot()}catch{$failed=$true}; Check $failed
function NewOptions {
 $o=New-Object RollcageCapture.Options
 $o.ownedWorkerObservation=New-Object RollcageCapture.OwnedWorkerObservation
 $o.ownedWorkerObservation.breakpointId='worker'; $o.ownedWorkerObservation.maxSnapshots=1
 $o.ownedWorkerObservation.threadIdSource=New-Object RollcageCapture.MemoryRange
 $o.ownedWorkerObservation.threadIdSource.id='tid'; $o.ownedWorkerObservation.threadIdSource.rva='0x100'; $o.ownedWorkerObservation.threadIdSource.length=4
 $o.pendingFrameObserver=New-Object RollcageCapture.PendingFrameObserver
 $o.pendingFrameObserver.nestedCaptureScope='frame-thread'; $o.pendingFrameObserver.nestedBreakpointIds=@('worker')
 $o.observationActivation=New-Object RollcageCapture.ObservationActivation
 $o.observationActivation.observationBreakpointIds=@('worker')
 $b=New-Object RollcageCapture.Breakpoint; $b.id='worker'; $o.breakpoints=@($b)
 return $o
}
[RollcageCapture.NativeDebugger]::ValidateOwnedWorkerObservationPolicy((New-Object RollcageCapture.Options))
[RollcageCapture.NativeDebugger]::ValidateOwnedWorkerObservationPolicy((NewOptions))
foreach($rva in @('0xb1304','0xa7ca1')) {
 $o=NewOptions; $o.ownedWorkerObservation.entryReturnRva=$rva
 $range=New-Object RollcageCapture.MemoryRange; $range.id='source'; $range.baseRegister='esi'; $range.length=2472
 $o.breakpoints[0].ranges=@($range)
 [RollcageCapture.NativeDebugger]::ValidateOwnedWorkerObservationPolicy($o)
}
Check ([RollcageCapture.NativeDebugger]::OwnedWorkerEntryReturnMatches(0x6e0000,0x791304,'0xb1304'))
Check (![RollcageCapture.NativeDebugger]::OwnedWorkerEntryReturnMatches(0x6e0000,0x787ca1,'0xb1304'))
Check ([RollcageCapture.NativeDebugger]::OwnedWorkerEntryReturnMatches(0x6e0000,0x787ca1,'0xa7ca1'))
# Shared pure runtime gates must never reach an unreadable ESI resolver on a
# wrong thread/caller. The source-code ordering assertion below covers wiring.
$p=New-Object RollcageCapture.OwnedWorkerObservationProgress
foreach($case in @(@(3,0x791304),@(2,0x787ca1))) {
 if($p.CanCapture($true,$true,$case[0],2,1,$true) -and [RollcageCapture.NativeDebugger]::OwnedWorkerEntryReturnMatches(0x6e0000,$case[1],'0xb1304')) { throw 'Unreadable ESI resolver reached' }
}
Check ($p.captured -eq 0)
$changes=@({param($o)$o.ownedWorkerObservation.maxSnapshots=2},{param($o)$o.ownedWorkerObservation.breakpointId='missing'},
 {param($o)$o.pendingFrameObserver.nestedCaptureScope='all-threads'},{param($o)$o.observationActivation=$null},
 {param($o)$o.observationActivation.observationBreakpointIds=@()},{param($o)$o.pendingFrameObserver.nestedBreakpointIds=@()},
 {param($o)$o.breakpoints[0].stopAfterHits=1},{param($o)$o.breakpoints[0].skipMatchingHits=0},
 {param($o)$o.ownedWorkerObservation.threadIdSource.length=8},{param($o)$o.ownedWorkerObservation.threadIdSource.readableRegion=$true},
 {param($o)$o.ownedWorkerObservation.threadIdSource.vectorStorage=$true},{param($o)$o.ownedWorkerObservation.threadIdSource.baseRegister='esi'},
 {param($o)$o.ownedWorkerObservation.threadIdSource.address='0x400100'},{param($o)$o.ownedWorkerObservation.threadIdSource.dereferenceOffsets=@('0','0','0','0','0','0','0','0','0')},
 {param($o)$o.ownedWorkerObservation.entryReturnRva=''}, {param($o)$o.ownedWorkerObservation.entryReturnRva='0xa7635'},
 {param($o)$r=New-Object RollcageCapture.MemoryRange;$r.baseRegister='esi';$o.breakpoints[0].ranges=@($r)},
 {param($o)$r=New-Object RollcageCapture.MemoryRange;$r.baseRegister='ESI';$o.ranges=@($r)})
foreach($change in $changes){$o=NewOptions; & $change $o; $failed=$false; try{[RollcageCapture.NativeDebugger]::ValidateOwnedWorkerObservationPolicy($o)}catch{$failed=$true}; Check $failed}
Write-Output 'Pure worker policy PASS; no native process launched.'
`);
    // Direct policy commands only: no execution-policy/security setting changes,
    // native fixture build or native process launch.
    const run=spawnSync('powershell.exe',['-NoProfile','-Command',await readFile(script,'utf8')],{windowsHide:true,encoding:'utf8',timeout:60000});
    assert.equal(run.status,0,run.stdout+run.stderr); assert.match(run.stdout,/Pure worker policy PASS/);
  } finally {assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});

test('retained clean V12/V13 remain valid without a worker exception or projected counters',async()=>{
  for(const version of [12,13]) {
    const directory=`analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v${version}-20261023`;
    if(!existsSync(`${directory}/configuration.json`))continue;
    const config=JSON.parse(await readFile(`${directory}/configuration.json`,'utf8')),capture=await loadPhysicsCapture(directory);
    const pair=pairNativeRecoverySnapshots(capture,config).pairs[0];
    const proof=selectNativeRecoverySoundSnapshots(capture,pair,config);
    assert.equal(proof.observationActivation.activatedSiteCount,52); assert.equal(proof.workerLookupObservation,undefined);
    assert.deepEqual(capture.ownedWorkerObservationRecords,[]);
    assert.equal(proof.observationActivation.nestedSnapshots,pair.before.pendingFrame.nestedSnapshots);
  }
});

const retainedV14='analysis/native-physics-local/startup-20261022/controlled-recovery-worker-v14-20261023';
const hasV14=existsSync(`${retainedV14}/configuration.json`);
test('retained clean V14 observes actual owned worker manager-gain caller and preserves real nested/deferral/cleanup counts', {skip:!hasV14},async()=>{
  const configuration=JSON.parse(await readFile(`${retainedV14}/configuration.json`,'utf8'));
  const capture=await loadPhysicsCapture(retainedV14,{expectedSha256:REDUX_SHA256});
  const pair=pairNativeRecoverySnapshots(capture,configuration).pairs[0],proof=selectNativeRecoverySoundSnapshots(capture,pair,configuration);
  const worker=proof.workerLookupObservation,row=capture.snapshots.find(r=>r.ordinal===worker.observationOrdinal);
  assert.equal(capture.complete.snapshots,330);assert.equal(capture.complete.events,3334);assert.equal(capture.complete.elapsedMs,44263);
  assert.equal(pair.moduleBaseAddress,0x6e0000);assert.equal(worker.observationOrdinal,274);assert.equal(worker.observedDebugEventOrdinal,2478);
  assert.equal(worker.pid,29304);assert.equal(worker.tid,34972);assert.equal(pair.before.tid,34612);
  assert.equal(worker.caller,'manager-gain');assert.equal(worker.callerIdentified,true);assert.equal(worker.returnAddress,pair.moduleBaseAddress+0xb1304);
  assert.equal(worker.requestedId,1);assert.equal(worker.registers.esi,0x173017c8);
  assert.equal(worker.association.evidenceType,'owned-create-thread');assert.equal(worker.association.observedDebugEventOrdinal,366);
  assert.equal(worker.association.traceRecordOrdinal,805);assert.equal(worker.association.callerPathProved,false);
  assert.equal(worker.sourceReplayComplete,false);assert.equal(worker.fullConcurrencyProved,false);
  assert.equal(proof.observationActivation.activatedSiteCount,53);assert.equal(proof.observationActivation.nestedSnapshots,95);assert.equal(proof.observationActivation.ownedWorkerSnapshots,1);
  const buffered=capture.snapshots.filter(r=>r.deferredPublication);
  assert.deepEqual(buffered.reduce((counts,r)=>(counts[r.pendingFrame.role]=(counts[r.pendingFrame.role]??0)+1,counts),{}),{before:1,event:1,nested:94,'worker-once':1,after:1});
  assert.equal(buffered.length,98);assert.equal(pair.before.pendingFrame.nestedSnapshots,95);
  assert.equal([...row.ranges.values()].some(p=>Number(p.address)<=worker.registers.esi&&Number(p.address)+p.bytes.length>=worker.registers.esi+0x9a8),false,'The worker ESI source extent was not observed.');
  const raw=(await readFile(`${retainedV14}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const deferred=raw.filter(r=>r.type==='owned-breakpoint-deferred'),replayed=raw.filter(r=>r.type==='owned-breakpoint-replayed');
  assert.equal(deferred.length,32);assert.equal(replayed.length,27);
  const replayedEvents=replayed.flatMap(r=>r.deferredDebugEventOrdinals);
  assert.equal(replayedEvents.length,32);assert.equal(new Set(replayedEvents).size,32);
  assert.deepEqual([...replayedEvents].sort((a,b)=>a-b),deferred.map(r=>r.observedDebugEventOrdinal).sort((a,b)=>a-b));
  const selected=raw.find(r=>r.type==='pending-frame-selected');assert.equal(selected.bufferedBytes,117881980);assert.ok(selected.bufferedBytes<128*1024*1024);
  const cleanup=raw.find(r=>r.type==='owned-process-cleanup');assert.equal(cleanup.terminated,true);assert.equal(cleanup.win32Error,0);assert.equal(cleanup.elapsedMs,44314);
  assert.equal(raw.find(r=>r.type==='owned-process-cleanup-freeze').allTrackedThreadsQuiescent,true);
  assert.equal(raw.filter(r=>r.type==='owned-worker-observation-skipped'&&r.reason==='one-snapshot-bound').length,60);

  for(const mutate of [
    r=>r.context.writeUInt32LE(0,172),r=>r.registers.esi='0x1',r=>r.pendingFrame.role='nested',r=>r.ownedWorkerObservation.expectedTid++,
    r=>r.ranges.get('manager-worker-tid').bytes.writeUInt32LE(1),r=>r.ranges.get('recovery-audio-worker-object').bytes.writeUInt32LE(0,0x48),
    r=>r.ranges.get('worker-lookup-entry').address='0x1',r=>r.ranges.get('recovery-audio-clock').bytes.writeUInt32LE(229),
  ]){
    const changed={...row,registers:{...row.registers},context:Buffer.from(row.context),pendingFrame:{...row.pendingFrame},ownedWorkerObservation:{...row.ownedWorkerObservation},
      ranges:new Map([...row.ranges].map(([id,p])=>[id,{...p,bytes:Buffer.from(p.bytes)}]))};mutate(changed);
    const bad={...capture,snapshots:capture.snapshots.map(r=>r===row?changed:r)};
    assert.throws(()=>verifyOwnedWorkerSnapshotAdmission(bad,changed,pair,configuration));
  }
  const forged={...capture,nativeThreadRecords:capture.nativeThreadRecords.map(r=>r.traceRecordOrdinal===worker.association.traceRecordOrdinal?{...r,pid:r.pid+1}:r)};
  assert.throws(()=>verifyOwnedWorkerSnapshotAdmission(forged,row,pair,configuration),/ownership/);
});

test('retained V14 raw worker context, entry stack, TID and object blobs reject byte tampering', {skip:!hasV14},async()=>{
  const records=(await readFile(`${retainedV14}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const source=records.find(r=>r.type==='snapshot'&&r.breakpointId===nativeWorkerLookupSite[0]);
  for(const name of ['context','worker-lookup-entry','manager-worker-tid','recovery-audio-worker-object']){
    const directory=await mkdtemp(path.join(tmpdir(),'rollcage-v14-worker-tamper-'));
    try{
      // Minimal negative loader fixtures reuse genuine native hashes/blobs;
      // they are not additional original-process captures.
      const context=Buffer.from(await readFile(path.join(retainedV14,source.contextFile))),ranges=[];
      if(name==='context')context[172]^=1;
      else{const p=source.ranges.find(r=>r.id===name),bytes=Buffer.from(await readFile(path.join(retainedV14,p.file)));bytes[0]^=1;await writeFile(path.join(directory,p.file),bytes);ranges.push(p);}
      await writeFile(path.join(directory,source.contextFile),context);
      const trace=[records[0],{...source,ordinal:1,hit:1,ranges},{...records.find(r=>r.type==='complete'),snapshots:1}];
      await writeFile(path.join(directory,'trace.jsonl'),trace.map(r=>JSON.stringify(r)).join('\n'));
      await assert.rejects(loadPhysicsCapture(directory,{expectedSha256:REDUX_SHA256}),/blob hash differs/);
    }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
  }
});

test('gain source profile preserves V14 descriptors/default policy and adds only a known return gate and two exact ESI ranges',async()=>{
  const baseline=(await createNativeRecoveryWorkerCaptureConfig('synthetic','not-launched')).configuration;
  const config=(await createNativeRecoveryWorkerSourceCaptureConfig('synthetic','not-launched')).configuration;
  const restored=structuredClone(config);delete restored.ownedWorkerObservation.entryReturnRva;
  restored.breakpoints.at(-1).ranges.splice(-2);assert.deepEqual(restored,baseline);
  if(hasV14){const retained=JSON.parse(await readFile(`${retainedV14}/configuration.json`,'utf8'));for(const key of ['breakpoints','phaseActions','pendingFrameObserver','observationActivation','ownedWorkerObservation'])assert.deepEqual(baseline[key],retained[key]);}
  assert.equal(config.ownedWorkerObservation.entryReturnRva,'0xb1304');assert.equal(config.ownedWorkerObservation.maxSnapshots,1);
  assert.deepEqual(config.breakpoints.at(-1).ranges.slice(-2),[{id:'recovery-worker-source',baseRegister:'esi',length:0x9a8},{id:'recovery-worker-source-vtable',baseRegister:'esi',dereferenceOffsets:['0'],length:0x88}]);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(config).workerSourceEvidenceDeclared,true);
  assert.equal((await verifyNativeRecoveryWorkerSourceEvidence()).evidenceIds.length,6);
  for(const mutate of [c=>{delete c.ownedWorkerObservation.entryReturnRva;},c=>c.ownedWorkerObservation.entryReturnRva='0xa7635',c=>c.ownedWorkerObservation.entryReturnRva='0xa7ca1',
    c=>c.breakpoints.at(-1).ranges.at(-2).length++,c=>c.breakpoints.at(-1).ranges.at(-1).length=0x84,c=>c.breakpoints.at(-1).ranges.at(-1).dereferenceOffsets=['0x964'],
    c=>c.breakpoints.at(-1).ranges.push({id:'forbidden-decoder',baseRegister:'esi',dereferenceOffsets:['0x968'],length:4}),c=>c.ownedWorkerObservation.maxSnapshots++]){
    const bad=structuredClone(config);mutate(bad);assert.throws(()=>verifyNativeRecoverySoundCaptureConfiguration(bad));
  }
  const source=await readFile('tools/lib/native-physics-debugger.cs','utf8'),loop=source.slice(source.indexOf('OwnedWorkerObservation workerPolicy = o.ownedWorkerObservation;'));
  for(const text of ['byte[] callerBytes = Bytes(child.process, entryEsp, 4)','if (capture && hit.captureWhen != null)','workerAccepted = callerMatches','ReadBufferedSnapshot('])assert.ok(loop.indexOf(text)>=0,text);
  assert.ok(loop.indexOf('byte[] callerBytes = Bytes(child.process, entryEsp, 4)')<loop.indexOf('if (capture && hit.captureWhen != null)'));
  assert.ok(loop.indexOf('workerAccepted = callerMatches')<loop.indexOf('ReadBufferedSnapshot('));
});

function sourceFixture(){
  const f=fixture(),esp=f.row.registers.esp,entry=f.row.ranges.get('worker-lookup-entry').bytes;
  const gate={entryReturnRva:'0xb1304',entryReturnAddress:esp,actualEntryReturnBytesHex:entry.subarray(0,4).toString('hex'),expectedEntryReturnAddress:0x4b1304,entryReturnMatched:true,entryReturnReadBeforeSnapshotRanges:true};
  Object.assign(f.row.ownedWorkerObservation,gate);Object.assign(f.trace.at(-1),gate);
  f.trace.splice(-1,0,{type:'owned-worker-entry-return-checked',breakpointId:nativeWorkerLookupSite[0],pid:100,tid:2,observedDebugEventOrdinal:4,matchingHitAdvanced:false,counterMutation:false,oneSnapshotConsumed:false,...gate});
  f.capture.ownedWorkerObservationRecords=collectOwnedWorkerObservationRecords(f.trace);
  f.configuration.ownedWorkerObservation=nativeOwnedWorkerObservationPolicy({entryReturnRva:'0xb1304'});
  f.configuration.breakpoints=[{id:nativeWorkerLookupSite[0],ranges:nativeWorkerLookupRanges(nativeWorkerLookupSite[0],{includeWorkerSourceEvidence:true})}];
  const object=Buffer.alloc(0x9a8),table=Buffer.alloc(0x88);object.writeUInt32LE(0x5d3f60);object.writeUInt32LE(13,0x438);object[0x45e]=1;object.writeUInt32LE(0xfefefefe,0x9a0);
  workerSourceVtableWords.forEach((word,i)=>table.writeUInt32LE(word,i*4));
  f.row.ranges.set('recovery-worker-source',{id:'recovery-worker-source',address:f.row.registers.esi,length:object.length,bytes:object});
  f.row.ranges.set('recovery-worker-source-vtable',{id:'recovery-worker-source-vtable',address:0x5d3f60,length:table.length,bytes:table});
  return f;
}

test('synthetic gain caller proof retains exact opaque source pointer/spatial/effect bytes without nullable pointer chases or flag edits',()=>{
  const f=sourceFixture(),report=verifyOwnedWorkerSnapshotAdmission(f.capture,f.row,f.pair,f.configuration),input=report.sourceInputs;
  assert.equal(report.entryReturnGate.verified,true);assert.equal(input.verified,true);assert.equal(input.address,0xdeadbeef);assert.equal(input.length,0x9a8);
  assert.equal(input.mixerId,13);assert.equal(input.fields.spatialFlag45e,1);assert.equal(input.fields.effectObjectPointer9a0,0xfefefefe);
  assert.equal(input.fields.waveformPointer964,0);assert.equal(input.fields.decoderPointer968,0);
  assert.equal(f.row.ranges.get('recovery-worker-source').bytes[0x45e],1);assert.equal(report.sourceReplayComplete,false);assert.equal(report.fullConcurrencyProved,false);
  for(const mutate of [
    f=>f.row.ownedWorkerObservation.actualEntryReturnBytesHex='00000000',f=>f.row.ownedWorkerObservation.entryReturnReadBeforeSnapshotRanges=false,
    f=>f.capture.ownedWorkerObservationRecords[0].entryReturnCheckTraceRecordOrdinal=0,
    f=>{f.row.registers.esi++;f.row.context.writeUInt32LE(f.row.registers.esi,160);},f=>f.row.ranges.get('recovery-worker-source').bytes.writeUInt32LE(14,0x438),
    f=>f.row.ranges.get('recovery-worker-source').bytes.writeUInt32LE(0,0),f=>f.row.ranges.get('recovery-worker-source-vtable').bytes.writeUInt32LE(0,0x50),
    f=>{f.row.ranges.delete('recovery-worker-source');f.row.ranges.delete('recovery-worker-source-vtable');},f=>{delete f.configuration.ownedWorkerObservation.entryReturnRva;},
  ]){const f=sourceFixture();mutate(f);assert.throws(()=>verifyOwnedWorkerSnapshotAdmission(f.capture,f.row,f.pair,f.configuration));}
});

test('actual host caller-check trace provenance rejects mismatched, missing, late, foreign and counter-consuming gate records',()=>{
  for(const mutate of [
    r=>r.splice(6,1),r=>r[6].tid++,r=>r[6].pid++,r=>r[6].observedDebugEventOrdinal++,r=>r[6].actualEntryReturnBytesHex='00000000',
    r=>r[6].entryReturnMatched=false,r=>r[6].entryReturnReadBeforeSnapshotRanges=false,r=>r[6].matchingHitAdvanced=true,r=>r[6].counterMutation=true,
    r=>r[6].oneSnapshotConsumed=true,r=>r[6].entryReturnRva='0xa7635',r=>{const gate=r.splice(6,1)[0];r.push(gate);},
  ]){const trace=sourceFixture().trace;mutate(trace);assert.throws(()=>collectOwnedWorkerObservationRecords(trace));}
  const f=sourceFixture();f.trace[6].actualEntryReturnBytesHex='a17c4a00';f.trace[6].entryReturnMatched=false;
  assert.throws(()=>collectOwnedWorkerObservationRecords(f.trace),/preceding caller/);
});

const retainedV15='analysis/native-physics-local/startup-20261022/controlled-recovery-worker-source-v15-20261023';
const hasV15=existsSync(`${retainedV15}/configuration.json`);
test('retained clean V15 proves gate-before-source admission and one actual nonspatial effect-free worker source input only', {skip:!hasV15},async()=>{
  const configuration=JSON.parse(await readFile(`${retainedV15}/configuration.json`,'utf8')),capture=await loadPhysicsCapture(retainedV15,{expectedSha256:REDUX_SHA256});
  const pair=pairNativeRecoverySnapshots(capture,configuration).pairs[0],proof=selectNativeRecoverySoundSnapshots(capture,pair,configuration),worker=proof.workerLookupObservation,input=worker.sourceInputs;
  const row=capture.snapshots.find(r=>r.ordinal===worker.observationOrdinal),raw=(await readFile(`${retainedV15}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(worker.observationOrdinal,242);assert.equal(worker.observedDebugEventOrdinal,2420);assert.equal(worker.pid,6952);assert.equal(worker.tid,38080);assert.equal(pair.before.tid,39612);
  assert.equal(worker.association.evidenceType,'owned-create-thread');assert.equal(worker.association.observedDebugEventOrdinal,370);assert.equal(worker.association.traceRecordOrdinal,811);
  assert.equal(worker.caller,'manager-gain');assert.equal(worker.requestedId,1);assert.equal(worker.returnAddress,pair.moduleBaseAddress+0xb1304);
  assert.equal(input.address,395396120);assert.equal(input.address,Number(row.registers.esi));assert.equal(input.length,2472);
  assert.deepEqual(input.fields,{spatialFlag45e:0,effectObjectPointer9a0:0,waveformPointer964:283116728,decoderPointer968:0,voicePointer97c:300204608,gainBits43c:1064960500,gainBits494:1065353216});
  assert.equal(input.sha256,'22229183b75094ae438e7ef9d8c4a7795f1c5fe90b6f78bb2b204f7c81262a67');
  const source=row.ranges.get('recovery-worker-source'),table=row.ranges.get('recovery-worker-source-vtable'),entry=row.ranges.get('worker-lookup-entry');
  assert.equal(source.bytes.readUInt32LE(0x438),entry.bytes.readUInt32LE(4));
  for(const [i,word]of workerSourceVtableWords.entries())assert.equal(table.bytes.readUInt32LE(i*4),pair.moduleBaseAddress+word-0x400000);
  const gateIndex=raw.findIndex(r=>r.type==='owned-worker-entry-return-checked'),admissionIndex=raw.findIndex(r=>r.type==='owned-worker-observation-admitted'),publicationIndex=raw.findIndex(r=>r.type==='snapshot'&&r.ordinal===row.ordinal);
  assert.equal(gateIndex+1,5887);assert.equal(admissionIndex+1,5888);assert.equal(publicationIndex+1,8800);assert.ok(gateIndex<admissionIndex&&admissionIndex<publicationIndex);
  const gate=raw[gateIndex];assert.equal(gate.entryReturnReadBeforeSnapshotRanges,true);assert.equal(gate.actualEntryReturnBytesHex,'04137900');assert.equal(gate.actualEntryReturnBytesHex,entry.bytes.subarray(0,4).toString('hex'));
  assert.equal(Number(gate.entryReturnAddress),Number(row.registers.esp));assert.equal(gate.matchingHitAdvanced,false);assert.equal(gate.counterMutation,false);assert.equal(gate.oneSnapshotConsumed,false);
  assert.equal(capture.ownedWorkerObservationRecords[0].entryReturnCheckTraceRecordOrdinal,5887);
  assert.equal(capture.complete.snapshots,330);assert.equal(capture.complete.events,3585);assert.equal(capture.complete.elapsedMs,44292);
  assert.equal(proof.observationActivation.nestedSnapshots,95);assert.equal(proof.observationActivation.ownedWorkerSnapshots,1);
  assert.equal(raw.find(r=>r.type==='pending-frame-selected').bufferedBytes,63931472);assert.equal(raw.find(r=>r.type==='owned-process-cleanup').elapsedMs,44351);assert.equal(raw.find(r=>r.type==='owned-process-cleanup').terminated,true);
  assert.equal(raw.find(r=>r.type==='owned-process-cleanup-freeze').allTrackedThreadsQuiescent,true);
  for(const [pointer,length]of [[input.fields.waveformPointer964,0x440],[input.fields.voicePointer97c,4]])assert.equal([...row.ranges.values()].some(p=>Number(p.address)<=pointer&&Number(p.address)+p.bytes.length>=pointer+length),false,'The worker source input does not include opaque descendant contents.');
  assert.equal(worker.sourceReplayComplete,false);assert.equal(worker.fullConcurrencyProved,false);
  for(const mutate of [
    r=>r.context.writeUInt32LE(0,160),r=>r.ownedWorkerObservation.entryReturnMatched=false,r=>r.ownedWorkerObservation.actualEntryReturnBytesHex='00000000',
    r=>r.ranges.get('recovery-worker-source').address='0x1',r=>r.ranges.get('recovery-worker-source').bytes.writeUInt32LE(2,0x438),
    r=>r.ranges.get('recovery-worker-source-vtable').bytes.writeUInt32LE(0,0x50),r=>r.ranges.delete('recovery-worker-source'),
  ]){
    const changed={...row,context:Buffer.from(row.context),registers:{...row.registers},ownedWorkerObservation:{...row.ownedWorkerObservation},ranges:new Map([...row.ranges].map(([id,p])=>[id,{...p,bytes:Buffer.from(p.bytes)}]))};mutate(changed);
    assert.throws(()=>verifyOwnedWorkerSnapshotAdmission({...capture,snapshots:capture.snapshots.map(r=>r===row?changed:r)},changed,pair,configuration));
  }
  for(const mutate of [r=>r.find(p=>p.type==='owned-worker-entry-return-checked').entryReturnReadBeforeSnapshotRanges=false,r=>r.find(p=>p.type==='owned-worker-entry-return-checked').tid++,r=>r.splice(gateIndex,1)]){
    const changed=structuredClone(raw);mutate(changed);assert.throws(()=>collectOwnedWorkerObservationRecords(changed));
  }
});

test('retained V15 source spatial/effect bytes, vtable and raw ESI context reject blob tampering by genuine hashes', {skip:!hasV15},async()=>{
  const records=(await readFile(`${retainedV15}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse),source=records.find(r=>r.type==='snapshot'&&r.breakpointId===nativeWorkerLookupSite[0]);
  for(const [name,offset]of [['context',160],['recovery-worker-source',0x45e],['recovery-worker-source',0x9a0],['recovery-worker-source-vtable',0x50]]){
    const directory=await mkdtemp(path.join(tmpdir(),'rollcage-v15-source-tamper-'));
    try{
      const context=Buffer.from(await readFile(path.join(retainedV15,source.contextFile))),ranges=[];
      if(name==='context')context[offset]^=1;
      else{const p=source.ranges.find(r=>r.id===name),bytes=Buffer.from(await readFile(path.join(retainedV15,p.file)));bytes[offset]^=1;await writeFile(path.join(directory,p.file),bytes);ranges.push(p);}
      await writeFile(path.join(directory,source.contextFile),context);
      // Negative loader fixture only, retaining genuine native descriptor hashes.
      await writeFile(path.join(directory,'trace.jsonl'),[records[0],{...source,ordinal:1,hit:1,ranges},{...records.find(r=>r.type==='complete'),snapshots:1}].map(r=>JSON.stringify(r)).join('\n'));
      await assert.rejects(loadPhysicsCapture(directory,{expectedSha256:REDUX_SHA256}),/blob hash differs/);
    }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
  }
});
