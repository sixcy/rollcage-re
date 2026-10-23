import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createNativeRecoverySoundCaptureConfig, verifyNativeRecoveryActiveVectorEvidence} from '../tools/prepare-native-recovery-sound-capture.mjs';
import {verifyNativeRecoverySoundCaptureConfiguration, selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {selectNativeRecoveryActiveVectorEvidence, activeVectorTransportMaxBytes} from '../tools/lib/native-recovery-active-vector.mjs';
import {collectNativeThreadRecords, selectObservedOwnedNativeThread} from '../tools/lib/native-thread-observations.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';

const options = {includeAllocations: true, includeVectorStorage: true, includeServiceSites: true, deferObservationsUntilControlledCaller: true, includeBindingSites: true, includeChannelSites: true, includePlaybackSites: true};
const retained = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v12-20261023';
test('services-active preserves V12 profile bytes, existing sites/owner observation and all original bounds', async () => {
  const baseline = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', options)).configuration;
  const disabled = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeActiveVectorEvidence: false})).configuration;
  assert.equal(JSON.stringify(disabled), JSON.stringify(baseline));
  if (existsSync(`${retained}/configuration.json`)) {
    const actual = JSON.parse(await readFile(`${retained}/configuration.json`, 'utf8'));
    for (const key of ['breakpoints', 'phaseActions', 'pendingFrameObserver', 'observationActivation']) assert.equal(JSON.stringify(baseline[key]), JSON.stringify(actual[key]));
  }
  const config = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeActiveVectorEvidence: true})).configuration;
  assert.deepEqual(config.pendingFrameObserver, baseline.pendingFrameObserver); assert.deepEqual(config.observationActivation, baseline.observationActivation);
  assert.deepEqual(config.phaseActions, baseline.phaseActions); assert.equal(config.breakpoints.length, baseline.breakpoints.length);
  assert.equal(config.maxSnapshots, 350); assert.equal(config.maxDurationMs, 90000); assert.equal(config.pendingFrameObserver.maxNestedSnapshots, 115);
  assert.equal(config.pendingFrameObserver.maxPendingBytes, 128 * 1024 * 1024); assert.equal(config.pendingFrameObserver.nestedCaptureScope, 'frame-thread');
  assert.equal(config.pendingFrameObserver.nestedBreakpointIds.length, 52);
  const allocation = config.breakpoints.find(row => row.id === 'recovery-sound-channel-allocation-return');
  assert.equal(allocation.ranges.find(row => row.id === 'recovery-audio-channel-allocation').length, 4);
  assert.deepEqual(allocation.ranges.at(-1), {id: 'recovery-audio-vector-allocation-region', baseRegister: 'eax', readableRegion: true, maxRegionBytes: 16 * 1024 * 1024});
  assert.deepEqual(allocation.ranges.find(row => row.id === 'recovery-audio-worker-object'), {id: 'recovery-audio-worker-object', rva: '0x314b08', dereferenceOffsets: ['0', '0x824'], length: 80});
  assert.equal(allocation.ranges.find(row => row.id === 'recovery-audio-manager-vtable').length, 0x64);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(config).activeVectorEvidenceDeclared, true);
  assert.equal((await verifyNativeRecoveryActiveVectorEvidence()).evidenceIds.length, 6);
  for (const mutate of [
    c => c.breakpoints.find(row => row.id === allocation.id).ranges.at(-1).maxRegionBytes++,
    c => c.breakpoints.find(row => row.id === allocation.id).ranges.find(row => row.id === 'recovery-audio-worker-object').length = 84,
    c => c.breakpoints.find(row => row.id === allocation.id).ranges.find(row => row.id === 'recovery-audio-manager-vtable').length = 0x68,
    c => c.pendingFrameObserver.nestedCaptureScope = 'all-threads',
  ]) {const changed = structuredClone(config); mutate(changed); assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(changed));}
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includePlaybackSites: false, includeActiveVectorEvidence: true}), /complete playback profile/);
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeActiveVectorEvidence: 'yes'}), /boolean/);
});

function threadTrace() {
  return [
    {type: 'owned-process', pid: 100, tid: 1},
    {type: 'debug-event', event: 3, pid: 100, tid: 1, ordinal: 1},
    {type: 'debug-event', event: 2, pid: 100, tid: 2, ordinal: 2},
    {type: 'debug-event', event: 1, pid: 100, tid: 2, ordinal: 3},
    {type: 'observation-skipped', tid: 2, breakpointId: 'recovery-sound-mixer-enter-return', rawHit: 1, reason: 'different-pending-frame-thread', nestedCaptureScope: 'frame-thread', pendingFrameActive: true, pendingFrameTid: 1, matchingHitAdvanced: false, originalInstructionSkipped: false},
  ];
}

test('owned native thread records retain actual lifecycle/scope PID,TID,ordinal provenance without claiming a caller path', () => {
  const records = collectNativeThreadRecords(threadTrace());
  assert.equal(records.length, 4);
  assert.deepEqual(selectObservedOwnedNativeThread(records, 2, {atDebugEventOrdinal: 10}), {verified: true, pid: 100, tid: 2, evidenceType: 'owned-create-thread', traceRecordOrdinal: 3, debugEventTraceRecordOrdinal: 3, observedDebugEventOrdinal: 2, ownerTraceRecordOrdinal: 1, callerPathProved: false});
  const scopeOnly = records.filter(row => !(row.type === 'debug-event' && row.event === 2));
  assert.equal(selectObservedOwnedNativeThread(scopeOnly, 2, {atDebugEventOrdinal: 10}).evidenceType, 'owned-frame-thread-scope-skip');
  assert.throws(() => selectObservedOwnedNativeThread(records, 55, {atDebugEventOrdinal: 10}), /no live owned debug observation/);
  const exited = collectNativeThreadRecords([...threadTrace(), {type: 'debug-event', event: 4, pid: 100, tid: 2, ordinal: 4}]);
  assert.throws(() => selectObservedOwnedNativeThread(exited, 2, {atDebugEventOrdinal: 10}), /no live owned debug observation/);
  const processExited = collectNativeThreadRecords([...threadTrace(), {type: 'debug-event', event: 5, pid: 100, tid: 1, ordinal: 4}]);
  assert.throws(() => selectObservedOwnedNativeThread(processExited, 2, {atDebugEventOrdinal: 10}), /process exited/);
  assert.deepEqual(collectNativeThreadRecords([{type: 'capture'}]), []);
});

test('native thread provenance rejects foreign processes, malformed skips, duplicate event ordinals and tampered associations', () => {
  for (const mutate of [
    r => r[2].pid++, r => r[2].ordinal = 1, r => r[4].tid++, r => r[4].pid = 200,
    r => r[4].matchingHitAdvanced = true, r => r[4].originalInstructionSkipped = true,
    r => r[4].pendingFrameTid = 2, r => r[4].rawHit = 0,
  ]) {const rows = threadTrace(); mutate(rows); assert.throws(() => collectNativeThreadRecords(rows));}
  for (const mutate of [
    r => r[2].debugEventPid++, r => r[2].ownerTraceRecordOrdinal++, r => r[2].observedDebugEventOrdinal++,
    r => r[3].debugEventTid++, r => r[3].pendingFrameTid = 2, r => r[3].traceRecordOrdinal = 2, r => r[3].debugEventTraceRecordOrdinal = 1,
  ]) {const rows = collectNativeThreadRecords(threadTrace()); mutate(rows); assert.throws(() => selectObservedOwnedNativeThread(rows, 2, {atDebugEventOrdinal: 10}));}
});

function growthFixture(capacity = 94) {
  const factoryEntry = 0x580000, F = factoryEntry - 0x830, managerAddress = 0x1600000, H = 0x1610000, W = 0x1620000, T = 0x1630000, backend = 0x1640000;
  const O = 0x1650000, P = 0x1800000, sourceAddress = 0x1a00000, next = capacity + Math.floor(capacity / 2), requestedBytes = next * 4;
  const actual = value => value + 0x320000, nativeThreadRecords = collectNativeThreadRecords(threadTrace());
  const old = Buffer.alloc(capacity * 4); for (let i = 0; i < capacity; i++) old.writeUInt32LE(0x1900000 + i * 256, i * 4);
  const input = Buffer.from({length: requestedBytes}, (_, i) => (i * 17 + 3) & 255), rows = [];
  const part = (id, address, bytes) => ({id, address, bytes, length: bytes.length});
  const put = (row, address, value) => {
    let touched = 0;
    for (const p of row.ranges.values()) if (address >= p.address && address + 4 <= p.address + p.bytes.length) {p.bytes.writeUInt32LE(value >>> 0, address - p.address); touched++;}
    assert.ok(touched);
  };
  const sequence = [['factory-thread-return', F], ['channel-allocation-call', F - 40], ['channel-allocation-return', F - 40], ['channel-memmove-call', F - 52], ['channel-memmove-return', F - 52], ['factory-leave-return', F]];
  for (const [index, [name, esp]] of sequence.entries()) {
    const header = Buffer.alloc(12); header.writeUInt32LE(index === 5 ? P : O); header.writeUInt32LE(index === 5 ? P + old.length + 4 : O + old.length, 4); header.writeUInt32LE(index === 5 ? P + requestedBytes : O + old.length, 8);
    const ranges = [part('manager', managerAddress, Buffer.alloc(0xd74)), part('recovery-audio-manager-vtable', T, Buffer.alloc(0x64)), part('recovery-audio-worker-object', W, Buffer.alloc(80)),
      part('recovery-audio-channel-vector', H, header), part('old-storage', O, Buffer.from(old)), part('recovery-audio-channel-chain', esp - 4, Buffer.alloc(84))];
    if (index === 2) {
      const region = Buffer.alloc(requestedBytes + 128, 0xee); input.copy(region, 64);
      ranges.push({...part('recovery-audio-vector-allocation-region', P - 64, region), rangeMode: 'readable-region', requestedResolvedRoot: P, regionBaseAddress: P - 64, regionSize: region.length});
      ranges.push(part('recovery-audio-channel-allocation', P, Buffer.from(input.subarray(0, 4))));
    }
    if (index === 3 || index === 4) ranges.push(part('recovery-audio-channel-memmove-destination', P, Buffer.from((index === 3 ? input : old).subarray(0, 4))));
    if (index === 5) {const output = Buffer.from(input); old.copy(output); output.writeUInt32LE(sourceAddress, old.length); ranges.push(part('published-active-storage', P, output));}
    const row = {breakpointId: `recovery-sound-${name}`, ordinal: index + 1, observedDebugEventOrdinal: 10 + index * 2, tid: 1,
      registers: {esp, eax: index === 0 ? 1 : index === 1 ? requestedBytes : P, ecx: H, ebx: next, edi: H, esi: index === 3 || index === 4 ? P : 0, ebp: sourceAddress}, ranges: new Map(ranges.map(p => [p.id, p]))};
    rows.push(row);
    for (const [address, value] of [[managerAddress, T], [managerAddress + 0x834, H], [managerAddress + 0x824, W], [managerAddress + 0x81c, backend], [managerAddress + 0x854 + 24, 1], [managerAddress + 0x854 + 28, 1],
      [T + 0x60, actual(0x4b12d0)], [W, actual(0x5d39f0)], [W + 0x24, 2], [W + 0x34, actual(0x4a3790)], [W + 0x38, W], [W + 0x44, actual(0x4a94a0)], [W + 0x48, managerAddress], [W + 0x4c, 20]]) put(row, address, value);
    if (index > 0 && index < 5) {
      for (const [address, value] of [[F - 36, F + 20], [F - 32, H], [F - 28, managerAddress], [F - 24, actual(0x40ec0b)], [F - 20, next], [F - 16, backend], [F - 12, managerAddress + 0x854], [F - 8, actual(0x4a76ad)], [F - 4, F + 20], [F + 20, sourceAddress]]) put(row, address, value);
      if (index === 1 || index === 2) {put(row, F - 40, requestedBytes); if (index === 2) put(row, F - 44, actual(0x40f085));}
      else {put(row, F - 52, P); put(row, F - 48, O); put(row, F - 44, old.length); if (index === 4) put(row, F - 56, actual(0x40f0a8));}
    }
  }
  return {capture: {nativeThreadRecords}, rows, context: {factoryEntry, managerAddress, sourceAddress, mainTid: 1, actual}, input, old, F, H, W, T, O, P, put};
}

test('synthetic factory growth slices exactly564 genuine bytes, keeps owner4B separate and proves observed worker identity only', () => {
  const f = growthFixture(), proof = selectNativeRecoveryActiveVectorEvidence(f.capture, f.rows, f.context);
  assert.equal(proof.verified, true); assert.equal(proof.sourceReplayComplete, false); assert.equal(proof.fullConcurrencyProved, false);
  assert.equal(proof.mode, 'allocation-growth');
  assert.equal(proof.old.used, 94); assert.equal(proof.old.bytes, 376); assert.equal(proof.allocation.capacityCount, 141);
  assert.equal(proof.allocation.requestedBytes, 564); assert.equal(proof.allocation.inputHex, f.input.toString('hex'));
  assert.equal(proof.allocation.inputHex.length / 2, 564); assert.equal(proof.allocation.transportRegionBytes, 692);
  assert.deepEqual(proof.memmove.arguments, [f.P, f.O, 376]); assert.equal(proof.workerIdentity.tid, 2);
  assert.equal(proof.workerIdentity.association.verified, true); assert.equal(proof.workerIdentity.callerPathProved, false);
  assert.notEqual(proof.allocation.inputHex, f.rows[5].ranges.get('published-active-storage').bytes.toString('hex'));
});

function noGrowthFixture() {
  const f = growthFixture(), entered = f.rows[0], left = f.rows[5];
  f.put(entered, f.H + 4, f.O + 90 * 4);
  f.put(left, f.H, f.O); f.put(left, f.H + 4, f.O + 91 * 4); f.put(left, f.H + 8, f.O + 94 * 4);
  f.put(left, f.O + 90 * 4, f.context.sourceAddress);
  left.ranges.delete('published-active-storage'); f.rows = [entered, left];
  return f;
}

test('no-growth proof requires independent spare-capacity headers, one appended source and absence of relevant growth', () => {
  const f = noGrowthFixture(), proof = selectNativeRecoveryActiveVectorEvidence(f.capture, f.rows, f.context);
  assert.equal(proof.mode, 'no-growth-needed'); assert.equal(proof.allocation, null);
  assert.equal(proof.old.used, 90); assert.equal(proof.old.capacityCount, 94); assert.equal(proof.workerIdentity.association.verified, true);
  for (const mutate of [
    f => f.put(f.rows[1], f.H, f.P), f => f.put(f.rows[1], f.H + 8, f.O + 380),
    f => f.put(f.rows[1], f.H + 4, f.O + 92 * 4), f => f.put(f.rows[1], f.O + 90 * 4, 0),
    f => f.rows.splice(1, 0, growthFixture().rows[1]),
  ]) {const bad = noGrowthFixture(); mutate(bad); assert.throws(() => selectNativeRecoveryActiveVectorEvidence(bad.capture, bad.rows, bad.context));}
  const missing = growthFixture(); missing.rows[2].ranges.delete('recovery-audio-vector-allocation-region');
  assert.throws(() => selectNativeRecoveryActiveVectorEvidence(missing.capture, missing.rows, missing.context), /preimage is not covered/);
});

test('active allocation rejects later-output substitution, bad bounds/ABI/header/region and unobserved or forged worker identities', () => {
  for (const mutate of [
    f => f.rows[2].ranges.delete('recovery-audio-vector-allocation-region'),
    f => f.rows[2].ranges.get('recovery-audio-vector-allocation-region').requestedResolvedRoot++,
    f => f.rows[2].ranges.get('recovery-audio-vector-allocation-region').regionSize++,
    f => {const p = f.rows[2].ranges.get('recovery-audio-vector-allocation-region'); p.bytes = Buffer.alloc(activeVectorTransportMaxBytes + 1); p.regionSize = p.bytes.length;},
    f => f.put(f.rows[1], f.F - 40, 560), f => f.rows[2].registers.ebx++, f => f.rows[2].registers.eax++,
    f => f.put(f.rows[2], f.F - 8, f.context.actual(0x40dcba)), f => f.put(f.rows[2], f.H + 8, f.O + 380),
    f => f.put(f.rows[3], f.F - 44, 372), f => f.put(f.rows[4], f.F - 56, f.context.actual(0x40f0a9)),
    f => f.put(f.rows[2], f.W + 0x24, 55), f => f.put(f.rows[2], f.W + 0x34, 1),
    f => f.put(f.rows[2], f.W + 0x38, f.W + 4), f => f.put(f.rows[2], f.W + 0x44, 1),
    f => f.put(f.rows[2], f.W + 0x48, f.context.managerAddress + 4), f => f.put(f.rows[2], f.T + 0x60, 1),
    f => f.capture.nativeThreadRecords = [], f => f.rows[2].observedDebugEventOrdinal = 9,
  ]) {const f = growthFixture(); mutate(f); assert.throws(() => selectNativeRecoveryActiveVectorEvidence(f.capture, f.rows, f.context));}
  const oversized = growthFixture(11000);
  assert.throws(() => selectNativeRecoveryActiveVectorEvidence(oversized.capture, oversized.rows, oversized.context), /exact native bound/);
});

test('loader additively preserves native records and rejects tampered ownership in a minimal synthetic capture', async () => {
  const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'rollcage-native-thread-records-'));
  assert.equal(path.dirname(directory), root);
  try {
    const context = Buffer.alloc(716), bytes = Buffer.alloc(4), hash = data => createHash('sha256').update(data).digest('hex');
    await writeFile(path.join(directory, 'context.bin'), context); await writeFile(path.join(directory, 'body.bin'), bytes);
    const trace = [{type: 'capture', schemaVersion: 1, executableSha256: REDUX_SHA256}, ...threadTrace(), {type: 'snapshot', ordinal: 1, hit: 1, breakpointId: 'synthetic', contextFile: 'context.bin', contextSha256: hash(context), ranges: [{id: 'body', address: 0x1000, file: 'body.bin', length: 4, sha256: hash(bytes)}]}, {type: 'complete', snapshots: 1}];
    const save = rows => writeFile(path.join(directory, 'trace.jsonl'), rows.map(row => JSON.stringify(row)).join('\n'));
    await save(trace); const captured = await loadPhysicsCapture(directory);
    assert.equal(captured.nativeThreadRecords.length, 4); assert.equal(selectObservedOwnedNativeThread(captured.nativeThreadRecords, 2, {atDebugEventOrdinal: 10}).verified, true);
    const changed = structuredClone(trace); changed.find(row => row.type === 'debug-event' && row.event === 2).pid = 999;
    await save(changed); await assert.rejects(loadPhysicsCapture(directory), /not owned/);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('retained V12 owned worker TID has native debug provenance while larger allocation preimage remains missing', {skip: !existsSync(`${retained}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(retained, {expectedSha256: REDUX_SHA256});
  assert.equal(capture.nativeThreadRecords.length, 435);
  const observed = selectObservedOwnedNativeThread(capture.nativeThreadRecords, 3700, {atDebugEventOrdinal: 3300});
  assert.equal(observed.pid, 27100); assert.equal(observed.observedDebugEventOrdinal, 368); assert.equal(observed.traceRecordOrdinal, 806);
  assert.equal(observed.callerPathProved, false);
  const allocation = capture.snapshots.find(row => row.ordinal === 313);
  assert.equal(allocation.ranges.get('recovery-audio-channel-allocation').bytes.length, 4);
  assert.equal(allocation.ranges.has('recovery-audio-vector-allocation-region'), false);
  assert.equal(allocation.ranges.has('recovery-audio-worker-object'), false);
});

const retainedV13 = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v13-20261023';
test('retained clean V13 independently proves no-growth publication and owned worker identity without claiming concurrency closure', {skip: !existsSync(`${retainedV13}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(retainedV13, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${retainedV13}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration); assert.equal(pairs.length, 1);
  const pair = pairs[0], proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration), active = proof.activeVectorObservations;
  const report = JSON.parse(await readFile('analysis/physics-native-controlled-recovery-sound-v13-20261023/report.json', 'utf8'));
  assert.equal(report.lineageVerified, true); assert.equal(report.sourceReplayComplete, false);
  assert.equal(capture.complete.snapshots, 329); assert.equal(capture.complete.pendingFrameSelection.nestedSnapshots, 94);
  assert.equal(capture.complete.elapsedMs, 46930); assert.deepEqual(active, report.proof.activeVectorObservations);
  assert.equal(active.verified, true); assert.equal(active.mode, 'no-growth-needed'); assert.equal(active.allocation, null);
  assert.equal(active.old.used, 97); assert.equal(active.old.capacityCount, 141);
  assert.equal(active.sourceReplayComplete, false); assert.equal(active.fullConcurrencyProved, false);
  assert.equal(active.workerIdentity.callerPathProved, false); assert.equal(active.workerIdentity.association.callerPathProved, false);
  assert.equal(active.workerIdentity.tid, 32368);
  assert.deepEqual(active.workerIdentity.association, {verified: true, pid: 10788, tid: 32368, evidenceType: 'owned-create-thread', traceRecordOrdinal: 811, debugEventTraceRecordOrdinal: 811, observedDebugEventOrdinal: 371, ownerTraceRecordOrdinal: 3, callerPathProved: false});
  const entered = capture.snapshots.find(row => row.breakpointId === 'recovery-sound-factory-thread-return' && Number(row.registers.esp) === active.factoryFrame && row.tid === pair.before.tid);
  const left = capture.snapshots.find(row => row.ordinal === active.publicationOrdinal);
  const originalHeader = entered.ranges.get('recovery-audio-active-vector-object'), publishedHeader = left.ranges.get('recovery-audio-active-vector-object');
  assert.equal(Number(originalHeader.address), active.headerAddress); assert.equal(Number(publishedHeader.address), active.headerAddress);
  assert.equal(originalHeader.bytes.readUInt32LE(), publishedHeader.bytes.readUInt32LE());
  assert.equal(originalHeader.bytes.readUInt32LE(8), publishedHeader.bytes.readUInt32LE(8));
  assert.equal(publishedHeader.bytes.readUInt32LE(4), originalHeader.bytes.readUInt32LE(4) + 4);
  const storage = left.ranges.get('recovery-audio-active-vector-storage');
  assert.equal(storage.bytes.readUInt32LE(active.old.end - active.old.begin), proof.sourceAddress);
  const relevantGrowth = capture.snapshots.filter(row => row.observedDebugEventOrdinal > entered.observedDebugEventOrdinal && row.observedDebugEventOrdinal < left.observedDebugEventOrdinal && /^recovery-sound-channel-(allocation|memmove)-(call|return)$/.test(row.breakpointId) && [active.factoryFrame - 40, active.factoryFrame - 52].includes(Number(row.registers.esp)));
  assert.equal(relevantGrowth.length, 0);
  const worker = entered.ranges.get('recovery-audio-worker-object'), table = entered.ranges.get('recovery-audio-manager-vtable');
  assert.equal(worker.bytes.length, 80); assert.equal(worker.bytes.readUInt32LE(0x24), 32368);
  assert.equal(table.bytes.length, 0x64); assert.equal(table.bytes.readUInt32LE(0x60), pair.moduleBaseAddress + 0xb12d0);
  const creation = capture.nativeThreadRecords.find(row => row.traceRecordOrdinal === 811);
  assert.equal(creation.type, 'debug-event'); assert.equal(creation.event, 2); assert.equal(creation.pid, 10788); assert.equal(creation.tid, 32368); assert.equal(creation.ordinal, 371);

  const corruptRow = (ordinal, mutate) => {
    const original = capture.snapshots.find(row => row.ordinal === ordinal);
    const changed = {...original, registers: {...original.registers}, ranges: new Map([...original.ranges].map(([id, part]) => [id, {...part, bytes: Buffer.from(part.bytes)}]))};
    mutate(changed);
    return {...capture, snapshots: capture.snapshots.map(row => row === original ? changed : row)};
  };
  const put = (row, address, value) => {
    let count = 0;
    for (const part of row.ranges.values()) if (address >= Number(part.address) && address + 4 <= Number(part.address) + part.bytes.length) {part.bytes.writeUInt32LE(value >>> 0, address - Number(part.address)); count++;}
    assert.ok(count);
  };
  for (const [ordinal, mutate] of [
    [left.ordinal, row => put(row, active.headerAddress + 4, active.old.end + 8)],
    [left.ordinal, row => put(row, active.headerAddress + 8, active.old.capacity + 4)],
    [left.ordinal, row => put(row, active.old.end, 0)],
    [entered.ordinal, row => put(row, Number(worker.address) + 0x24, 55)],
    [entered.ordinal, row => put(row, Number(worker.address) + 0x44, 0)],
    [entered.ordinal, row => put(row, Number(table.address) + 0x60, 0)],
  ]) assert.throws(() => selectNativeRecoverySoundSnapshots(corruptRow(ordinal, mutate), pair, configuration));
  const noObservedWorker = {...capture, nativeThreadRecords: capture.nativeThreadRecords.filter(row => row.tid !== 32368)};
  assert.throws(() => selectNativeRecoverySoundSnapshots(noObservedWorker, pair, configuration), /no live owned debug observation/);
  const foreignCreation = {...capture, nativeThreadRecords: capture.nativeThreadRecords.map(row => row === creation ? {...row, pid: 999} : row)};
  assert.throws(() => selectNativeRecoverySoundSnapshots(foreignCreation, pair, configuration), /ownership\/provenance differs/);
});
