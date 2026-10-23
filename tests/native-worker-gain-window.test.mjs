import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, unlink, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createNativeWorkerGainWindowCaptureConfig} from '../tools/prepare-native-worker-gain-window-capture.mjs';
import {verifyNativeWorkerGainWindowConfiguration,verifyNativeWorkerGainWindow,pairNativeWorkerWindowRecovery} from '../tools/lib/native-worker-gain-window.mjs';
import {nativeWorkerGainPairRanges} from '../tools/lib/native-worker-gain-pair.mjs';
import {workerSourceVtableWords} from '../tools/lib/native-recovery-worker-observation.mjs';
import {collectNativeThreadRecords} from '../tools/lib/native-thread-observations.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
const configPromise=createNativeWorkerGainWindowCaptureConfig('synthetic','not-launched');
test('independent window retains exact guard/parent but reserves a separate bounded leaf budget', async () => {
  const config = (await configPromise).configuration;
  assert.equal(verifyNativeWorkerGainWindowConfiguration(config).combinedBufferBytes, 128 * 1024 * 1024);
  assert.equal(config.breakpoints.length, 10); assert.equal(config.pendingFrameObserver.nestedBreakpointIds, undefined);
  for (const change of [c => c.ownedWorkerGainWindow.maxSnapshots++, c => c.ownedWorkerGainWindow.maxBufferedBytes++,
    c => c.observationActivation.rawHit++, c => c.pendingFrameObserver.maxPendingBytes++, c => c.pendingFrameObserver.nestedBreakpointIds = ['worker-gain-entry'],
    c => c.ownedWorkerGainPair = {}, c => c.heldForceInput = {}, c => c.maxDurationMs++, c => c.maxSnapshots++,
    c => c.breakpoints.at(-2).ranges.find(r => r.id === 'worker-gain-source').baseRegister = 'esp', c => c.breakpoints.push({id:'extra'})]) {
    const copy = structuredClone(config); change(copy); assert.throws(() => verifyNativeWorkerGainWindowConfiguration(copy));
  }
});
// Synthetic transport and ABI fixtures only; no native runtime or algorithm result.
async function fixture(force = 0, placement = 'after-parent') {
  const configuration = structuredClone((await configPromise).configuration), records = [], snapshots = [];
  const manager = 0x1600000, worker = 0x1610000, table = 0x1620000, mixerHeader = 0x1630000, storage = 0x1640000, source = 0x1800000, S = 0x500000, session = 0x1700000;
  const hex = n => `0x${n.toString(16).padStart(8, '0')}`, word = v => {const b = Buffer.alloc(4); b.writeUInt32LE(v); return b;};
  const add = row => records.push(row), debug = (event, tid, ordinal) => add({type: 'debug-event', event, pid: 100, tid, ordinal});
  add({type: 'owned-process', pid: 100, tid: 1}); debug(3, 1, 1); debug(2, 2, 2);
  const activation = configuration.observationActivation;
  for (const id of activation.observationBreakpointIds) add({type: 'breakpoint-installation-deferred', id, address: hex(0x400000 + Number(configuration.breakpoints.find(p => p.id === id).rva)), originalBytesHex: '90', codeModified: false, activationBreakpointId: activation.breakpointId, activationRawHit: 229});
  debug(1, 1, 10);
  const trigger = {type: 'snapshot', ordinal: 1, breakpointId: activation.breakpointId, hit: 229, tid: 1, observedDebugEventOrdinal: 10, capturePhase: 'before-declared-writes-before-original-instruction'};
  snapshots.push(trigger); add(trigger);
  for (const write of configuration.phaseActions.find(a => a.breakpointId === activation.breakpointId && a.hit === 229).writes)
    add({type: 'intervention', breakpointId: activation.breakpointId, hit: 229, originalBytesHex: write.expectedAnyBytesHex?.[0] ?? write.expectedBytesHex, replacementBytesHex: write.bytesHex, acceptedOriginalBytesHex: write.expectedAnyBytesHex ?? [write.expectedBytesHex]});
  const installed = activation.observationBreakpointIds.map(id => ({id, address: hex(0x400000 + Number(configuration.breakpoints.find(p => p.id === id).rva))}));
  for (const point of installed) add({type: 'breakpoint-activated', ...point, originalBytesHex: '90', patchBytesHex: 'cc', activationBreakpointId: activation.breakpointId, activationRawHit: 229, activationTid: 1, observedDebugEventOrdinal: 10, beforeOriginalInstruction: true, rawHitBefore: 0, matchingHitBefore: 0, captureHitBefore: 0});
  add({type: 'observation-activation-complete', breakpointId: activation.breakpointId, rawHit: 229, tid: 1, observedDebugEventOrdinal: 10, snapshotCount: 1, beforeOriginalInstruction: true, guardActionCompleted: true, installed});
  debug(1, 1, 11); add({type: 'pending-frame-started', frameTid: 1, candidateIndex: 1});
  const before = {type: 'snapshot', ordinal: 2, tid: 1, breakpointId: 'native-recovery-before', observedDebugEventOrdinal: 11,
    pendingFrame: {candidateIndex: 1, nestedSnapshots: 0}, ranges: new Map([['session', {address: session, bytes: Buffer.alloc(0x590)}], ['clock', {address: 0x90a548, bytes: word(228)}]])};
  snapshots.push(before); add(before);
  let ordinal = 2, debugOrdinal = 11;
  const after = {type: 'snapshot', ordinal: ++ordinal, tid: 1, breakpointId: 'native-recovery-after', observedDebugEventOrdinal: placement === 'after-parent' ? 12 : 100};
  if (placement === 'after-parent') {debug(1, 1, ++debugOrdinal); snapshots.push(after); add(after);}
  if (placement === 'before-parent') before.observedDebugEventOrdinal = 99;
  for (let endpoint = 0; endpoint < 2; endpoint++) {
    const id = endpoint ? 'worker-gain-exit' : 'worker-gain-entry', role = endpoint ? 'exit' : 'entry', ranges = new Map();
    const part = (id, address, bytes, extra = {}) => {const row = {id, address, bytes, length: bytes.length, ...extra}; ranges.set(id, row); return row;};
    const managerBytes = Buffer.alloc(0xd74); managerBytes.writeUInt32LE(table); managerBytes.writeUInt32LE(worker, 0x824); managerBytes.writeUInt32LE(mixerHeader, 0x84c);
    const vt = Buffer.alloc(0x64); vt.writeUInt32LE(0x4a79f0, 0x48); vt.writeUInt32LE(0x4b12d0, 0x60);
    const object = Buffer.alloc(80); for (const [off, v] of [[0, 0x5d39f0], [0x24, 2], [0x34, 0x4a3790], [0x38, worker], [0x44, 0x4a94a0], [0x48, manager], [0x4c, 20]]) object.writeUInt32LE(v, off);
    const sourceBytes = Buffer.alloc(0x9a8); sourceBytes.writeUInt32LE(0x5d3f60); const svt = Buffer.alloc(0x88); workerSourceVtableWords.forEach((p, i) => svt.writeUInt32LE(p, i * 4));
    const returned = force ? 0x4a72f6 : 0x4a722c;
    const args = Buffer.alloc(12); args.writeUInt32LE(returned); args.writeUInt32LE(endpoint ? 0x3f000000 : source, 4); args.writeUInt32LE(force, 8);
    const stack = Buffer.alloc(444, 0xba); args.copy(stack, 432);
    const header = Buffer.alloc(12); for (const [off, v] of [[0, storage], [4, storage + 16], [8, storage + 16]]) header.writeUInt32LE(v, off);
    part('worker-gain-manager-root', 0x714b08, word(manager)); part('worker-gain-manager', manager, managerBytes); part('worker-gain-manager-vtable', table, vt);
    part('worker-gain-thread-object', worker, object); part('manager-worker-tid', worker + 0x24, word(2)); part('worker-gain-session-root', 0x5ecb1c, word(session)); part('worker-gain-phase', session + 0x57c, word(4)); part('worker-gain-clock', 0x90a548, word(230 + endpoint));
    part('worker-gain-stack', S - 432, stack); part('worker-gain-arguments', S, args); part('worker-gain-source', source, sourceBytes); part('worker-gain-source-vtable', 0x5d3f60, svt);
    part('worker-gain-mixer-header', mixerHeader, header); part('worker-gain-mixer-storage', storage, Buffer.alloc(16), {rangeMode: 'vector-storage', vectorHeaderAddress: mixerHeader, vectorHeaderHex: header.toString('hex'), vectorBegin: storage, vectorEnd: storage + 16, vectorCapacity: storage + 16, maxVectorBytes: 65536});
    for (const descriptor of nativeWorkerGainPairRanges(!endpoint).filter(r => r.id.startsWith('worker-gain-literal-'))) part(descriptor.id, 0x400000 + Number(descriptor.rva), word(0x3f800000));
    const registers = {edi: 0x3333, esi: source, ebx: 0x1111, edx: 0x4444, ecx: endpoint ? 0x5555 : manager, eax: 0, ebp: 0x2222, eip: endpoint ? 0x4b1990 : 0x4b12d0, esp: S, fpuControlWord: 0x27f, mxcsr: 0x1fa0};
    const context = Buffer.alloc(716); for (const [name, off] of Object.entries({edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196})) context.writeUInt32LE(registers[name], off);
    context.writeUInt32LE(0x27f, 28); context.writeUInt32LE(0x1fa0, 228);
    debug(1, 2, ++debugOrdinal);
    const proof = {breakpointId: id, role, pid: 100, tid: 2, expectedTid: 2, threadIdSourceAddress: hex(worker + 0x24), actualThreadIdBytesHex: '02000000', ownedLiveThread: true,
      ownerMainTid: 1, activationBreakpointId: activation.breakpointId, activationRawHit: 229, activationDebugEventOrdinal: 10, sameParentInterleavingClaimed: false, entryEsp: hex(S), source: hex(source), manager: hex(manager), returnAddress: hex(returned), force,
      entryEbx: hex(0x1111), entryEbp: hex(0x2222), entryEdi: hex(0x3333), stackAddress: hex(S), stackBytesHex: args.toString('hex'), exitArgumentNotDereferenced: Boolean(endpoint), afterRetEsp: hex(S + 12),
      observationIndex: endpoint + 1, maxSnapshots: 2, observedDebugEventOrdinal: debugOrdinal, beforeOriginalInstruction: true, abiReadBeforeSnapshotRanges: true};
    add({type: 'owned-worker-gain-window-abi-checked', breakpointId: id, pid: 100, tid: 2, observedDebugEventOrdinal: debugOrdinal, entry: !endpoint, callerMatched: true, stackAddress: hex(S), stackBytesHex: args.toString('hex'), readBeforeSnapshotRanges: true, counterMutation: false});
    add({type: 'owned-worker-gain-window-admitted', ...proof, elapsedMs: debugOrdinal + 0.1});
    const row = {type: 'snapshot', ordinal: ++ordinal, hit: 1, tid: 2, breakpointId: id, observedDebugEventOrdinal: debugOrdinal, observedElapsedMs: debugOrdinal, elapsedMs: debugOrdinal + 0.5, deferredPublication: true, workerObservationWindow: {role: `worker-leaf-${role}`, activationDebugEventOrdinal: 10, ownerMainTid: 1, sameParentInterleavingClaimed: false}, registers, context, ranges, ownedWorkerGainWindow: {...proof}};
    snapshots.push(row); add(row);
  }
  if (placement !== 'after-parent') {debug(1, 1, ++debugOrdinal); snapshots.push(after); add(after);}
  add({type:'worker-gain-window-parent-retained',activationDebugEventOrdinal:10,parentStartDebugEventOrdinal:before.observedDebugEventOrdinal,parentEndDebugEventOrdinal:after.observedDebugEventOrdinal,sameParentInterleavingClaimed:false});
  add({type:'worker-gain-window-pair-published',activationDebugEventOrdinal:10,tid:2,source,entryEsp:S,snapshotCount:2,sameParentInterleavingClaimed:false});
  const capture = {snapshots, nativeThreadRecords: collectNativeThreadRecords(records),complete:{workerGainWindow:{activationDebugEventOrdinal:10,parentRetained:true,pairComplete:true,endpointSnapshots:2,sameParentInterleavingClaimed:false}}};
  return {configuration,capture,pair:{before,after,moduleBaseAddress:0x400000},records,endpoints:snapshots.filter(r=>r.ownedWorkerGainWindow)};
}

test('synthetic independent worker call after main return preserves exact source/RET8 and allows different native clocks', async () => {
  for (const force of [0, 1]) {
    const f = await fixture(force), proof = verifyNativeWorkerGainWindow(f.capture, f.pair, f.configuration, f.records);
    assert.equal(proof.verified, true); assert.equal(proof.endpoints[0].clock, 230); assert.equal(proof.endpoints[1].clock, 231);
    assert.ok(proof.endpoints[0].debugOrdinal > f.pair.after.observedDebugEventOrdinal);
    assert.equal(proof.fullWorkerInterleavingProved, false); assert.equal(proof.sourceReplayComplete, false);
  }
});

test('synthetic worker call before selected parent is not relabeled as a pending-frame observation', async () => {
  const f = await fixture(0, 'before-parent');
  assert.equal(verifyNativeWorkerGainWindow(f.capture, f.pair, f.configuration, f.records).verified, true);
  assert.ok(f.endpoints[1].observedDebugEventOrdinal < f.pair.before.observedDebugEventOrdinal);
  assert.equal(f.endpoints[0].pendingFrame, undefined);
});

test('window rejects absent pairs, borrowed parent identity, raw context, source, lifetime, and terminal corruption', async () => {
  for (const change of [
    f => f.endpoints[0].pendingFrame = {role:'nested'}, f => f.endpoints[0].ownedWorkerGainWindow.sameParentInterleavingClaimed = true,
    f => f.endpoints[1].tid++, f => f.endpoints[1].registers.esi++, f => f.endpoints[0].context.writeUInt32LE(0,172),
    f => f.endpoints[0].context.writeUInt32LE(0x7f,28), f => f.endpoints[1].ownedWorkerGainWindow.afterRetEsp = '0x500008',
    f => f.endpoints[1].ranges.get('worker-gain-source').address++, f => f.endpoints[0].ranges.delete('worker-gain-literal-5dc774'),
    f => f.endpoints[1].ranges.get('worker-gain-thread-object').bytes.writeUInt32LE(0,0x48),
    f => f.endpoints[1].breakpointId = 'worker-gain-spatial-exit', f => f.capture.snapshots.pop(),
    f => f.records.find(r=>r.type==='owned-worker-gain-window-abi-checked').counterMutation=true,
    f => f.records.find(r=>r.type==='owned-worker-gain-window-admitted').elapsedMs=0,
    f => f.endpoints[0].elapsedMs=0,
    f => f.records.find(r=>r.type==='breakpoint-activated').captureHitBefore++,
    f => f.capture.complete.workerGainWindow.pairComplete=false,
    f => f.records.find(r=>r.type==='worker-gain-window-pair-published').sameParentInterleavingClaimed=true,
    f => f.capture.nativeThreadRecords.push({...f.capture.nativeThreadRecords.at(-1),event:4,ordinal:13,observedDebugEventOrdinal:13,traceRecordOrdinal:1000,debugEventTraceRecordOrdinal:1000})]) {
    const f = await fixture(); change(f); assert.throws(() => verifyNativeWorkerGainWindow(f.capture, f.pair, f.configuration, f.records));
  }
});

test('missing actual parent and old snapshot terminal remain unsupported', async () => {
  const f = await fixture();
  assert.throws(() => pairNativeWorkerWindowRecovery(f.capture,f.configuration));
  f.capture.complete.reason='snapshot-bound'; assert.throws(() => pairNativeWorkerWindowRecovery(f.capture,f.configuration));
});

// Entirely constructed parent transport. Buffers below describe protocol
// validation inputs, never native runtime evidence or game-child answers.
function parentTransport() {
  const S=0x500000, body=0x1800000, session=0x1700000, physical=0x1900000, pack=0x1a00000, groups=0x1b00000;
  const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
  const range=(id,address,bytes)=>({id,address,bytes,moduleBaseAddress:0x400000});
  const map=rows=>new Map(rows.map(r=>[r.id,r]));
  const sessionBytes=Buffer.alloc(0x590);sessionBytes[0x54d]=6;sessionBytes.writeUInt32LE(4,0x57c);
  const bodyBytes=Buffer.alloc(0x180);bodyBytes.writeUInt32LE(0x1c03);bodyBytes.writeInt32LE(32,0x128);
  const stack=Buffer.alloc(24580);stack.writeUInt32LE(0x451021,24576);
  const proof={candidateIndex:1,frameTid:1,frameEntryEsp:S,frameReturnAddress:0x451021,frameMatchingHit:1,observedEventHits:1,qualifyingEventSnapshots:1,nestedSnapshots:0};
  const common={tid:1,hit:1,rawHit:229,matchingHit:1,moduleBaseAddress:0x400000,deferredPublication:true,
    captureWhen:{actualBytesHex:'04000000',equalsBytesHex:'04000000',address:session+0x57c}};
  const before={...common,ordinal:230,breakpointId:'native-recovery-before',observedDebugEventOrdinal:500,observedElapsedMs:100,
    registers:{esp:S,eip:0x47ccc0},pendingFrame:{...proof,role:'before'},ranges:map([
      range('frame-stack',S-24576,stack),range('session',session,sessionBytes),range('session-root',0x5ecb1c,word(session)),
      range('participant-records',0x909300,word(body)),range('clock',0x90a548,word(228)),range('body',body,bodyBytes)])};
  const after={...before,ordinal:232,breakpointId:'native-recovery-after',observedDebugEventOrdinal:502,observedElapsedMs:102,
    registers:{esp:S,eip:0x47d02d},pendingFrame:{...proof,role:'after'}};
  const args=Buffer.alloc(24);[0x47cf3c,S-24,body+0xc4,groups+12,0,0].forEach((v,i)=>args.writeUInt32LE(v,i*4));
  const list=Buffer.alloc(384);list.writeUInt32LE(body);
  const packBytes=Buffer.alloc(0xa0);packBytes[0x46]=2;packBytes.writeUInt32LE(groups,0x60);
  const route=Buffer.alloc(12);route.writeUInt16LE(1);
  const event={...common,ordinal:231,rawHit:1,matchingHit:1,breakpointId:'native-recovery-apply-entry',observedDebugEventOrdinal:501,observedElapsedMs:101,
    registers:{esp:S-124,eip:0x47d440,ecx:body,edx:0x70eb0c},pendingFrame:{...proof,role:'event',eventIndex:1},ranges:map([
      range('recovery-apply-caller',S-124,args.subarray(0,4)),range('recovery-apply-arguments',S-124,args),range('recovery-apply-body-header',body,bodyBytes),
      range('arena-root',0x6e6b40,word(body)),range('arena-used',0x70dcf4,word(0x180)),range('physical-root',0x902bc0,word(physical)),range('physical-count',0x902bc4,Buffer.from([1,0])),
      range('recovery-apply-physical-list',physical,list),range('pack-root',0x90b98c,word(pack)),range('recovery-apply-pack-header',pack,packBytes),
      range('recovery-apply-route',groups+12,route),range('recovery-apply-position',0x70eb0c,Buffer.alloc(12)),range('recovery-apply-quaternion',S-24,Buffer.alloc(16)),range('recovery-apply-rotation',body+0xc4,Buffer.alloc(18))])};
  const callers=Array.from({length:229},(_,i)=>({ordinal:i+1,hit:i+1,tid:1,moduleBaseAddress:0x400000,breakpointId:'controlled-recovery-caller',
    registers:{eip:0x45101c,esp:S+4},capturePhase:'before-declared-writes-before-original-instruction',ranges:map([
      range('controlled-recovery-clock',0x90a548,word(228)),range('controlled-recovery-session-root',0x5ecb1c,word(session)),range('controlled-recovery-first-body-root',0x909300,word(body))])}));
  const interventions=[[0x90a548,'e4000000','e4000000'],[session+0x57c,'04000000','04000000'],[body,'031c0000','031c0000'],[body+0x128,'00000000','20000000']].map(([address,originalBytesHex,replacementBytesHex])=>({type:'intervention',breakpointId:'controlled-recovery-caller',hit:229,address,originalBytesHex,replacementBytesHex,acceptedOriginalBytesHex:[originalBytesHex]}));
  return {header:{executableSha256:REDUX_SHA256},snapshots:[...callers,before,event,after],interventions,
    complete:{reason:'worker-gain-window-bound',pendingFrameSelection:proof}};
}

test('constructed parent protocol retains genuine caller/application validation under the new independent terminal contract', async () => {
  const config=(await configPromise).configuration, capture=parentTransport();
  const pair=pairNativeWorkerWindowRecovery(capture,config);
  assert.equal(pair.nativeApplications.length,1);assert.equal(pair.controlledInput.nativeFirstBodyApplications,1);
  for (const change of [c=>c.snapshots.at(-1).registers.esp++,c=>c.snapshots.at(-1).pendingFrame.nestedSnapshots=1,
    c=>c.snapshots.at(-2).registers.ecx++,c=>c.complete.pendingFrameSelection.qualifyingEventSnapshots=2,
    c=>c.snapshots.at(-3).ranges.get('frame-stack').bytes.writeUInt32LE(0,24576),c=>c.interventions[3].replacementBytesHex='00000000']) {
    const copy=parentTransport();change(copy);assert.throws(()=>pairNativeWorkerWindowRecovery(copy,config));
  }
});

test('pure C# window state requires guarded activation, exact call, parent and bounded bytes', {skip:process.platform!=='win32'}, () => {
  const cs = path.resolve('tools/lib/native-physics-debugger.cs').replaceAll("'","''");
  const script = `$ErrorActionPreference='Stop'
Add-Type -Path '${cs}'
function Check([bool]$ok){if(!$ok){throw 'Window assertion failed'}}
function MustFail([scriptblock]$action){$failed=$false;try{&$action}catch{$failed=$true};Check $failed}
$w=New-Object RollcageCapture.OwnedWorkerGainWindowProgress
MustFail {$w.RequireComplete()};MustFail {$w.Activate(0,1)};$w.Activate(10,1);MustFail {$w.Activate(11,1)}
$w.Reserve(262144,262144);MustFail {$w.Reserve(1,262144)};MustFail {$w.Reserve(-1,262144)}
$p=$w.call;$p.Begin(2,1,10,0x500000,0x1800000,0x1600000,0x4a722c,0,0x1111,0x2222,0x3333,0x400000,0x1800000);$p.Commit($true)
MustFail {$w.RequireComplete()};MustFail {$p.ValidateExit(2,1,11,0x500000,0x4a722c,0x1800000,0x1600000,0x1111,0x2222,0x3333)}
$p.ValidateExit(2,1,10,0x500000,0x4a722c,0x1800000,0x1600000,0x1111,0x2222,0x3333);$p.Commit($false)
Check (!$w.Ready);MustFail {$w.RequireComplete()};$w.parentComplete=$true;Check $w.Ready;$w.RequireComplete()
Write-Output 'Pure worker window PASS; no process launched.'`;
  const run=spawnSync('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true,encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,run.stdout+run.stderr); assert.match(run.stdout,/Pure worker window PASS/);
});

test('typed window configuration passes and rejects budget/scope/register/legacy-policy changes without launching', {skip:process.platform!=='win32'}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'rollcage-worker-window-')), filename = path.join(dir,'config.json');
  const prepared = await createNativeWorkerGainWindowCaptureConfig('analysis/native-physics-local/startup-20261022', path.join(dir,'not-launched'));
  await writeFile(filename,JSON.stringify(prepared.configuration));
  try {
    const cs=path.resolve('tools/lib/native-physics-debugger.cs').replaceAll("'","''"), config=filename.replaceAll("'","''");
    const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${cs}'
Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
function Load {return $reader.Deserialize([IO.File]::ReadAllText('${config}'),[RollcageCapture.Options])}
[RollcageCapture.NativeDebugger]::Validate((Load))
$changes=@({param($o)$o.ownedWorkerGainWindow.maxSnapshots=1},{param($o)$o.ownedWorkerGainWindow.maxBufferedBytes=262145},
 {param($o)$o.ownedWorkerGainPair=New-Object RollcageCapture.OwnedWorkerGainPair},{param($o)$o.heldForceInput=New-Object RollcageCapture.HeldForceInput},
 {param($o)$o.observationActivation.rawHit=230},{param($o)$o.pendingFrameObserver.maxPendingBytes=134217728},
 {param($o)$o.pendingFrameObserver.nestedBreakpointIds=@('worker-gain-entry')},{param($o)$o.maxDurationMs=90001},
 {param($o)$o.maxSnapshots=351},{param($o)$o.captureThreadEnvironment=$false},
 {param($o)$p=$o.breakpoints|Where-Object id -eq 'worker-gain-exit';($p.ranges|Where-Object id -eq 'worker-gain-source').baseRegister='esp'},
 {param($o)$o.ownedWorkerGainWindow.threadIdSource.offset='0x28'})
foreach($change in $changes){$bad=Load;&$change $bad;$failed=$false;try{[RollcageCapture.NativeDebugger]::ValidateOwnedWorkerGainWindowPolicy($bad)}catch{$failed=$true};if(!$failed){throw 'Invalid window passed'}}
Write-Output 'Typed worker window PASS; no process launched.'`;
    const run=spawnSync('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true,encoding:'utf8',timeout:60000});
    assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/Typed worker window PASS/);
  } finally {await unlink(filename); await rmdir(dir);}
});
