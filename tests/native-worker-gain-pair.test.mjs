import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createNativeWorkerGainPairCaptureConfig, verifyNativeWorkerGainPairEvidence} from '../tools/prepare-native-worker-gain-pair-capture.mjs';
import {createNativeRecoverySoundCaptureConfig} from '../tools/prepare-native-recovery-sound-capture.mjs';
import {nativeRecoveryWorkerProfileOptions} from '../tools/prepare-native-recovery-worker-capture.mjs';
import {nativeWorkerGainSites, nativeWorkerGainPairPolicy, nativeWorkerGainPairRanges, verifyNativeWorkerGainPairConfiguration, verifyNativeWorkerGainPair} from '../tools/lib/native-worker-gain-pair.mjs';
import {workerSourceVtableWords} from '../tools/lib/native-recovery-worker-observation.mjs';
import {collectNativeThreadRecords} from '../tools/lib/native-thread-observations.mjs';

const configPromise = createNativeWorkerGainPairCaptureConfig('synthetic', 'not-launched');
test('new pair policy preserves legacy profiles/budgets and adds only two endpoints plus explicit unsupported exit guard', async () => {
  const config = (await configPromise).configuration, restored = structuredClone(config), ids = nativeWorkerGainSites.map(x => x[0]);
  delete restored.ownedWorkerGainPair; restored.breakpoints = restored.breakpoints.filter(p => !ids.includes(p.id));
  restored.pendingFrameObserver.nestedBreakpointIds.splice(-3); restored.observationActivation.observationBreakpointIds.splice(-3);
  assert.deepEqual(restored, (await createNativeRecoverySoundCaptureConfig('synthetic', 'not-launched', nativeRecoveryWorkerProfileOptions)).configuration);
  assert.equal(config.pendingFrameObserver.nestedBreakpointIds.length, 55); assert.equal(config.ownedWorkerGainPair.maxSnapshots, 2);
  assert.equal((await verifyNativeWorkerGainPairEvidence()).evidenceIds.length, 2);
  for (const change of [c => c.ownedWorkerGainPair.maxSnapshots++, c => c.ownedWorkerGainPair.threadIdSource.offset = '0x28',
    c => c.breakpoints.at(-2).ranges.find(r => r.id === 'worker-gain-source').baseRegister = 'esp',
    c => c.breakpoints.at(-3).captureWhen = {}, c => c.pendingFrameObserver.nestedCaptureScope = 'all-threads',
    c => c.observationActivation.observationBreakpointIds.pop(), c => c.pendingFrameObserver.maxNestedSnapshots++,
    c => c.maxSnapshots++, c => c.maxDurationMs++, c => c.ownedWorkerObservation = {}]) {
    const copy = structuredClone(config); change(copy); assert.throws(() => verifyNativeWorkerGainPairConfiguration(copy));
  }
});

//Synthetic transport/provenance fixture only. It is not a native capture or a
//game-child result, and never enters the game/source arithmetic interpreter.
async function fixture(force = 0) {
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
    pendingFrame: {candidateIndex: 1, nestedSnapshots: 54}, ranges: new Map([['session', {address: session, bytes: Buffer.alloc(0x590)}], ['clock', {address: 0x90a548, bytes: word(228)}]])};
  snapshots.push(before); add(before);
  let ordinal = 2, debugOrdinal = 11;
  for (const id of activation.observationBreakpointIds.slice(0, -3)) {
    debug(1, 1, ++debugOrdinal); const row = {type: 'snapshot', ordinal: ++ordinal, tid: 1, breakpointId: id, observedDebugEventOrdinal: debugOrdinal, deferredPublication: true, pendingFrame: {role: 'nested', frameTid: 1, candidateIndex: 1}};
    snapshots.push(row); add(row);
  }
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
    part('worker-gain-thread-object', worker, object); part('manager-worker-tid', worker + 0x24, word(2)); part('worker-gain-session-root', 0x5ecb1c, word(session)); part('worker-gain-phase', session + 0x57c, word(4)); part('worker-gain-clock', 0x90a548, word(228));
    part('worker-gain-stack', S - 432, stack); part('worker-gain-arguments', S, args); part('worker-gain-source', source, sourceBytes); part('worker-gain-source-vtable', 0x5d3f60, svt);
    part('worker-gain-mixer-header', mixerHeader, header); part('worker-gain-mixer-storage', storage, Buffer.alloc(16), {rangeMode: 'vector-storage', vectorHeaderAddress: mixerHeader, vectorHeaderHex: header.toString('hex'), vectorBegin: storage, vectorEnd: storage + 16, vectorCapacity: storage + 16, maxVectorBytes: 65536});
    for (const descriptor of nativeWorkerGainPairRanges(!endpoint).filter(r => r.id.startsWith('worker-gain-literal-'))) part(descriptor.id, 0x400000 + Number(descriptor.rva), word(0x3f800000));
    const registers = {edi: 0x3333, esi: source, ebx: 0x1111, edx: 0x4444, ecx: endpoint ? 0x5555 : manager, eax: 0, ebp: 0x2222, eip: endpoint ? 0x4b1990 : 0x4b12d0, esp: S, fpuControlWord: 0x27f, mxcsr: 0x1fa0};
    const context = Buffer.alloc(716); for (const [name, off] of Object.entries({edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196})) context.writeUInt32LE(registers[name], off);
    context.writeUInt32LE(0x27f, 28); context.writeUInt32LE(0x1fa0, 228);
    debug(1, 2, ++debugOrdinal);
    const proof = {breakpointId: id, role, pid: 100, tid: 2, expectedTid: 2, threadIdSourceAddress: hex(worker + 0x24), actualThreadIdBytesHex: '02000000', ownedLiveThread: true,
      pendingFrameActive: true, pendingFrameTid: 1, candidateIndex: 1, entryEsp: hex(S), source: hex(source), manager: hex(manager), returnAddress: hex(returned), force,
      entryEbx: hex(0x1111), entryEbp: hex(0x2222), entryEdi: hex(0x3333), stackAddress: hex(S), stackBytesHex: args.toString('hex'), exitArgumentNotDereferenced: Boolean(endpoint), afterRetEsp: hex(S + 12),
      observationIndex: endpoint + 1, maxSnapshots: 2, observedDebugEventOrdinal: debugOrdinal, beforeOriginalInstruction: true, abiReadBeforeSnapshotRanges: true};
    add({type: 'owned-worker-gain-abi-checked', breakpointId: id, pid: 100, tid: 2, observedDebugEventOrdinal: debugOrdinal, entry: !endpoint, callerMatched: true, stackAddress: hex(S), stackBytesHex: args.toString('hex'), readBeforeSnapshotRanges: true, counterMutation: false});
    add({type: 'owned-worker-gain-admitted', ...proof});
    const row = {type: 'snapshot', ordinal: ++ordinal, hit: 1, tid: 2, breakpointId: id, observedDebugEventOrdinal: debugOrdinal, deferredPublication: true, pendingFrame: {role: `worker-gain-${role}`, frameTid: 1, candidateIndex: 1}, registers, context, ranges, ownedWorkerGainPair: {...proof}};
    snapshots.push(row); add(row);
  }
  debug(1, 1, ++debugOrdinal); const after = {type: 'snapshot', ordinal: ++ordinal, tid: 1, breakpointId: 'native-recovery-after', observedDebugEventOrdinal: debugOrdinal}; snapshots.push(after); add(after);
  const capture = {snapshots, nativeThreadRecords: collectNativeThreadRecords(records)};
  return {configuration, capture, pair: {before, after, moduleBaseAddress: 0x400000}, records, endpoints: snapshots.filter(r => r.ownedWorkerGainPair)};
}

test('synthetic complete pair binds entry source before overwritten exit argument and preserves original worker PC53', async () => {
  for (const force of [0, 1]) {
    const f = await fixture(force), result = verifyNativeWorkerGainPair(f.capture, f.pair, f.configuration, f.records);
    assert.equal(result.verified, true); assert.equal(result.endpoints.length, 2); assert.equal(result.endpoints[0].fpuControlWord, 0x27f);
    assert.equal(result.endpoints[0].force, force);
    assert.equal(result.endpoints[1].source, result.endpoints[0].source); assert.equal(result.sourceReplayComplete, false); assert.equal(result.wholeGainCallMatched, false);
    assert.notEqual(f.endpoints[1].ranges.get('worker-gain-arguments').bytes.readUInt32LE(4), result.endpoints[0].source);
  }
});

test('pair validator rejects identity, source, raw context, admission, activation, input extent and counter tampering', async () => {
  for (const change of [
    f => f.endpoints[1].tid++, f => f.endpoints[1].registers.esi++, f => f.endpoints[0].context.writeUInt32LE(0, 172),
    f => f.endpoints[0].context.writeUInt32LE(0x7f, 28), f => f.endpoints[1].ownedWorkerGainPair.afterRetEsp = '0x500008',
    f => f.endpoints[0].ranges.get('worker-gain-source').address++, f => f.endpoints[1].ranges.delete('worker-gain-literal-5dc774'),
    f => f.endpoints[1].ranges.get('worker-gain-mixer-storage').vectorCapacity++,
    f => f.endpoints[1].ranges.get('worker-gain-manager-vtable').bytes.writeUInt32LE(0, 0x60),
    f => f.endpoints[1].ranges.get('worker-gain-thread-object').bytes.writeUInt32LE(0, 0x48),
    f => f.endpoints[1].breakpointId = 'worker-gain-spatial-exit', f => f.capture.snapshots.splice(f.capture.snapshots.indexOf(f.endpoints[1]), 1),
    f => f.records.find(r => r.type === 'owned-worker-gain-admitted').maxSnapshots++,
    f => f.records.find(r => r.type === 'owned-worker-gain-abi-checked').readBeforeSnapshotRanges = false,
    f => f.records.find(r => r.type === 'breakpoint-activated').captureHitBefore++,
    f => f.pair.before.pendingFrame.nestedSnapshots--,
    f => f.records.splice(f.records.findIndex(r => r.type === 'owned-worker-gain-admitted'), 0, {type: 'pending-frame-discarded'}),
    f => {f.capture.nativeThreadRecords = f.capture.nativeThreadRecords.filter(r => !(r.type === 'debug-event' && r.event === 2));},
  ]) {const f = await fixture(); change(f); assert.throws(() => verifyNativeWorkerGainPair(f.capture, f.pair, f.configuration, f.records));}
});

test('C# pure pair state compiles and keeps same-frame/thread/caller/RET8 bounds fail closed; no native fixture or game launch', {skip: process.platform !== 'win32'}, async () => {
  const source = path.resolve('tools/lib/native-physics-debugger.cs').replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop'
Add-Type -Path '${source}'
function Check([bool]$ok){if(!$ok){throw 'Pair policy assertion failed'}}
function MustFail([scriptblock]$action){$failed=$false;try{&$action}catch{$failed=$true};Check $failed}
$p=New-Object RollcageCapture.OwnedWorkerGainPairProgress
Check (!$p.CanObserve($false,$true,2,0,1,$false));Check (!$p.CanObserve($true,$false,2,0,1,$false))
MustFail {$p.CanObserve($true,$true,2,1,1,$true)};MustFail {$p.CanObserve($true,$true,2,2,1,$false)}
Check (!$p.CanObserve($true,$true,3,2,1,$true));Check ($p.CanObserve($true,$true,2,2,1,$true))
Check ([RollcageCapture.OwnedWorkerGainPairProgress]::CallerMatches(0x6e0000,0x78722c,0))
Check ([RollcageCapture.OwnedWorkerGainPairProgress]::CallerMatches(0x6e0000,0x7872f6,1))
Check (![RollcageCapture.OwnedWorkerGainPairProgress]::CallerMatches(0x6e0000,0x78722c,1))
MustFail {$p.Begin(2,1,1,0x500000,0x1800000,0x1600000,0x4a722c,0,0x1111,0x2222,0x3333,0x400000,0x1800004)}
$p.Begin(2,1,1,0x500000,0x1800000,0x1600000,0x4a722c,0,0x1111,0x2222,0x3333,0x400000,0x1800000)
MustFail {$p.ValidateParentClose(1,$true)};MustFail {$p.ValidateExit(2,1,1,0x500000,0x4a722c,0x1800000,0x1600000,0x1111,0x2222,0x3333)}
$p.Commit($true)
MustFail {$p.Begin(2,1,1,0x500000,0x1800000,0x1600000,0x4a722c,0,0x1111,0x2222,0x3333,0x400000,0x1800000)}
MustFail {$p.ValidateExit(2,1,2,0x500000,0x4a722c,0x1800000,0x1600000,0x1111,0x2222,0x3333)}
MustFail {$p.ValidateExit(2,1,1,0x500004,0x4a722c,0x1800000,0x1600000,0x1111,0x2222,0x3333)}
MustFail {$p.ValidateExit(2,1,1,0x500000,0x4a722c,0x1800004,0x1600000,0x1111,0x2222,0x3333)}
$p.ValidateExit(2,1,1,0x500000,0x4a722c,0x1800000,0x1600000,0x1111,0x2222,0x3333);$p.Commit($false)
Check ($p.captured -eq 2);Check $p.complete;Check (!$p.open);Check (!$p.CanObserve($true,$true,2,2,1,$true))
MustFail {$p.Commit($false)};MustFail {$p.ValidateParentClose(2,$true)};MustFail {$p.ValidateParentClose(1,$false)}
$p.ValidateParentClose(1,$true)
$empty=New-Object RollcageCapture.OwnedWorkerGainPairProgress;MustFail {$empty.ValidateParentClose(1,$true)};$empty.ValidateParentClose(1,$false)
Write-Output 'Pure worker gain pair PASS; no process launched.'`;
  const run = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8', timeout: 60000});
  assert.equal(run.status, 0, run.stdout + run.stderr); assert.match(run.stdout, /Pure worker gain pair PASS/);
});

test('C# runtime checks caller/source before ranges and commits only bounded pair endpoints', async () => {
  const cs = await readFile('tools/lib/native-physics-debugger.cs', 'utf8');
  assert.ok(cs.indexOf('workerGainPair.Begin(tid') < cs.indexOf('gainAccepted ? (gainEntry ?'));
  assert.ok(cs.indexOf('workerGainPair.ValidateExit(tid') < cs.indexOf('gainAccepted ? (gainEntry ?'));
  assert.match(cs, /workerGainPair\.ValidateParentClose\(frame\.candidateIndex,frame\.qualifyingEventSnapshots!=0\)/);
  assert.match(cs, /if\(hit\.id==gainPolicy\.unsupportedExitBreakpointId\) throw/);
  assert.match(cs, /workerGainPair\.Commit\(gainEntry\)/);
});

const preparedConfig = 'analysis/native-worker-gain-pair-policy-only-20261023.json';
test('prepared pair profile passes typed C# Validate API without executing a PowerShell script file or launching a process', {skip: process.platform !== 'win32' || !existsSync(preparedConfig)}, async () => {
  verifyNativeWorkerGainPairConfiguration(JSON.parse(await readFile(preparedConfig)));
  const source = path.resolve('tools/lib/native-physics-debugger.cs').replaceAll("'", "''"), config = path.resolve(preparedConfig).replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop'
Add-Type -Path '${source}'
Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$options=$reader.Deserialize([IO.File]::ReadAllText('${config}'),[RollcageCapture.Options])
[RollcageCapture.NativeDebugger]::Validate($options)
$changes=@({param($o)$o.ownedWorkerGainPair.maxSnapshots=1},{param($o)$o.ownedWorkerObservation=New-Object RollcageCapture.OwnedWorkerObservation},
 {param($o)$o.ownedWorkerGainPair.threadIdSource.baseRegister='esi'},{param($o)$o.ownedWorkerGainPair.threadIdSource.offset='0x28'},
 {param($o)$o.ownedWorkerGainPair.managerSource.length=8},{param($o)$o.observationActivation.rawHit=230},
 {param($o)$o.pendingFrameObserver.maxNestedSnapshots=116},{param($o)$o.maxSnapshots=351},
 {param($o)$o.maxDurationMs=90001},{param($o)$o.captureThreadEnvironment=$false},
 {param($o)$p=$o.breakpoints|Where-Object id -eq 'worker-gain-exit';($p.ranges|Where-Object id -eq 'worker-gain-source').baseRegister='esp'},
 {param($o)$p=$o.breakpoints|Where-Object id -eq 'worker-gain-entry';($p.ranges|Where-Object id -eq 'worker-gain-stack').length=448})
foreach($change in $changes){$bad=$reader.Deserialize([IO.File]::ReadAllText('${config}'),[RollcageCapture.Options]);&$change $bad;$failed=$false;try{[RollcageCapture.NativeDebugger]::ValidateOwnedWorkerGainPairPolicy($bad)}catch{$failed=$true};if(!$failed){throw 'Invalid pair configuration passed'}}
Write-Output 'Full typed pair config PASS; no process launched.'`;
  const run = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8', timeout: 60000});
  assert.equal(run.status, 0, run.stdout + run.stderr); assert.match(run.stdout, /Full typed pair config PASS/);
});
