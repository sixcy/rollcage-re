import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration} from '../tools/lib/native-parent-rtti-capture.mjs';
import {nativeParentWeatherCounterCapability, nativeParentWeatherCounterLayout, nativeParentWeatherCounterRanges,
  nativeParentWeatherCounterPolicy, verifyNativeParentWeatherCounterEvidence, verifyNativeParentWeatherCounterRecords,
  createNativeParentWeatherCounterBinding, assertNativeParentWeatherCounterService} from '../tools/lib/native-parent-weather-counter.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const word = value => {const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value >>> 0); return bytes;};
const row = (id, address, bytes) => ({id, address, bytes, length: bytes.length});
const nameFor = id => id.slice('native-parent-counter-'.length).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

//Constructed direct counter records. The outer parent verifier independently
//authenticates full raw contexts, TLS, startup, RTTI endpoints and completion.
//This fixture is not an original-process QPC or weather arithmetic proof.
function fixture({base = 0x400000, U = 0x100000, ebx = 1} = {}) {
  const layout = nativeParentWeatherCounterLayout(U), clock = 288, owner = {pid: 100, tid: 101};
  const iatTarget = 0x75a01230, context = Buffer.alloc(716);
  context.writeUInt32LE(U, 196); context.writeUInt32LE(0, 168);
  const stack = Buffer.alloc(600, 0x55), stackBase = U - 512;
  const put = (address, value) => stack.writeUInt32LE(value >>> 0, address - stackBase);
  put(U, base + 0x60123); put(U + 4, 1);
  put(layout.timerEntryAddress, base + 0x98458); put(U - 44, base + 0x96822); put(U - 20, base + 0x51116);
  put(layout.afterEsp + 8, layout.timerEbp); put(layout.afterEsp + 12, ebx);
  put(layout.beforeEsp, layout.outputAddress); put(layout.beforeEsp - 4, base + 0x89d13);
  const preimage = Buffer.from('4433221188776655', 'hex'); preimage.copy(stack, layout.outputAddress - stackBase);
  const origin = 10000000000000n, frequency = 10000000n, value = origin + 123456n;
  const originFrequency = Buffer.alloc(16); originFrequency.writeBigInt64LE(frequency); originFrequency.writeBigInt64LE(origin, 8);
  const initialRows = [row('frame-stack', stackBase, stack), row('parent-weather-counter-import', base + 0x16e0fc, word(iatTarget)),
    row('initialized', base + 0x2e6c8c, word(1)), row('origin-frequency', base + 0x3135a4, originFrequency), row('clock', base + 0x50a548, word(clock))];
  const original = createCapturedMemory(initialRows);
  const before = {ordinal: 4, observedDebugEventOrdinal: 20, tid: owner.tid, context, ranges: initialRows};
  const cameras = {ordinal: 14, observedDebugEventOrdinal: 60};
  const weatherReturn = {ordinal: 18, observedDebugEventOrdinal: 80};
  const world = {ordinal: 21, observedDebugEventOrdinal: 110};
  const rttiOutcomes = [{family: 'camera', returnOrdinal: 13}, {family: 'weather-screen', weatherQueryIndex: 1, returnOrdinal: 16},
    {family: 'weather-screen', weatherQueryIndex: 2, returnOrdinal: 18}];
  const configuration = {parentRttiObservation: {weatherCounterObservation: nativeParentWeatherCounterPolicy()}};
  const records = [];
  function endpoint(index) {
    const entry = index === 0, ordinal = 19 + index, debug = 90 + index * 10;
    const memory = createCapturedMemory(initialRows);
    if (!entry) memory.memory.writeBigInt64LE(value, layout.outputAddress);
    const ranges = nativeParentWeatherCounterRanges(U, base).map(d => ({...row(d.id, d.address, Buffer.from(memory.span(d.address, d.length))),
      sha256: sha(memory.span(d.address, d.length)), source: 'parent-weather-counter-observation'}));
    const ctx = Buffer.from(context); ctx.writeUInt32LE(base + (entry ? 0x89d11 : 0x89d13), 184);
    ctx.writeUInt32LE(entry ? layout.beforeEsp : layout.afterEsp, 196); ctx.writeUInt32LE(layout.timerEbp, 180);
    ctx.writeUInt32LE(iatTarget, 160); ctx.writeUInt32LE(ebx, 164); ctx.writeUInt32LE(entry ? layout.outputAddress : 1, 176);
    const proof = {type: 'parent-weather-counter-admitted', pid: owner.pid, tid: owner.tid, ownerMainTid: owner.tid,
      breakpointId: entry ? 'native-parent-weather-counter-call' : 'native-parent-weather-counter-return',
      observedDebugEventOrdinal: debug, parentEntryDebugEventOrdinal: 20, parentEntryEsp: U, parentClock: clock,
      parentIteration: 0, parentCaller: base + 0x60123, parentTotalIterations: 1, activationDebugEventOrdinal: 50,
      ...layout, role: entry ? 'call' : 'return', snapshotOrdinal: ordinal, pairIndex: 1, observationIndex: index + 1,
      callDebugEventOrdinal: 90, callSnapshotOrdinal: 19, open: true, completesPair: !entry,
      initialFlagHex: '01000000', initialOriginFrequencyHex: originFrequency.toString('hex'), initialIatHex: word(iatTarget).toString('hex'),
      initialInputDebugEventOrdinal: 20, totalRequiredSnapshots: 21, snapshotLimit: 21, rawHit: 1, beforeSnapshotRangeResolution: true, beforeOriginalInstruction: true};
    for (const part of ranges) {const name = nameFor(part.id); proof[`${name}Address`] = part.address; proof[`${name}BytesHex`] = part.bytes.toString('hex');}
    const snapshot = {type: 'snapshot', breakpointId: proof.breakpointId, ordinal, observedDebugEventOrdinal: debug,
      hit: 1, tid: owner.tid, context: ctx, ranges, parentWeatherCounterObservation: proof};
    records.push({type: 'debug-event', ordinal: debug, pid: owner.pid, tid: owner.tid}, proof, snapshot);
    return snapshot;
  }
  const call = endpoint(0), returned = endpoint(1);
  const capture = {header: {helperCapabilities: [nativeParentWeatherCounterCapability]}, snapshots: [before, cameras, weatherReturn, call, returned, world]};
  const input = {capture, configuration, records, before, cameras, world, owner, base, U, clock, activationEvent: 50, rttiOutcomes};
  const source = createCapturedMemory(initialRows);
  const runtime = {memory: source.memory, scratchBase: layout.timerEntryAddress, nativeWeatherCounterCall: {
    returnAddress: 0x498458, screenEntryEsp: U - 44, entryEsp: layout.timerEntryAddress, frame: layout.afterEsp,
    outputAddress: layout.outputAddress, preCallEsp: layout.beforeEsp, serviceReturnAddress: base + 0x89d13, iatTarget, ebx}};
  return {input, source, runtime, layout, call, returned, original, value, preimage};
}

function mutatePart(snapshot, name, change) {
  const part = snapshot.ranges.find(r => r.id === `native-parent-counter-${name}`); change(part.bytes);
  part.sha256 = sha(part.bytes); snapshot.parentWeatherCounterObservation[`${nameFor(part.id)}BytesHex`] = part.bytes.toString('hex');
}

test('counter layout/ranges follow retained initialized CALL and both eight-byte alignment classes', async () => {
  const evidence = await verifyNativeParentWeatherCounterEvidence();
  assert.equal(evidence.targetSha256, 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  assert.equal(evidence.evidenceIds.length, 2);
  for (const U of [0x100000, 0x100004]) {
    const l = nativeParentWeatherCounterLayout(U), aligned = Math.floor((U - 368) / 8) * 8;
    assert.equal(l.beforeEsp, aligned - 36); assert.equal(l.afterEsp, aligned - 32);
    assert.equal(l.outputAddress, aligned - 8); assert.equal(l.timerEntryAddress, U - 364);
  }
  for (const U of [0, 4097, 0x100000000, NaN]) assert.throws(() => nativeParentWeatherCounterLayout(U));
});

test('counter opt-in preserves old profiles and adds exactly two deferred sites and original IAT input at ten parent points', async () => {
  const options = {viewportMapGraph: true, weatherScreenQueries: true, tyreSound2: true, stackBytesBefore: 64, skipFrames: 60};
  const baseline = await createNativeParentRttiCaptureConfig('synthetic', 'never-launched-counter', options);
  const disabled = await createNativeParentRttiCaptureConfig('synthetic', 'never-launched-counter', {...options, weatherCounterObservation: false});
  assert.deepEqual(disabled.configuration, baseline.configuration);
  const enabled = await createNativeParentRttiCaptureConfig('synthetic', 'never-launched-counter', {...options, weatherCounterObservation: true}), c = enabled.configuration;
  assert.equal(enabled.requiredHelperCapability, nativeParentWeatherCounterCapability); assert.equal(enabled.preparedOnly, true);
  assert.equal(c.maxSnapshots, 21); assert.equal(c.maxDurationMs, 90000); assert.equal(c.breakpoints.length, 17);
  assert.deepEqual(c.phaseActions, baseline.configuration.phaseActions);
  assert.deepEqual(c.parentRttiObservation.weatherCounterObservation, nativeParentWeatherCounterPolicy());
  for (const point of c.breakpoints) {
    const imports = point.ranges.filter(r => r.id === 'parent-weather-counter-import');
    assert.deepEqual(imports, point.id.startsWith('native-control-') ? [{id: 'parent-weather-counter-import', rva: '0x16e0fc', length: 4}] : []);
  }
  const restored = structuredClone(c); delete restored.parentRttiObservation.weatherCounterObservation;
  restored.breakpoints = restored.breakpoints.filter(p => !p.id.startsWith('native-parent-weather-counter-'));
  for (const point of restored.breakpoints) point.ranges = point.ranges.filter(r => r.id !== 'parent-weather-counter-import');
  assert.deepEqual(restored, baseline.configuration);
  const changes = [
    value => {value.parentRttiObservation.weatherScreenQueries = false;},
    value => {value.parentRttiObservation.weatherCounterObservation.maxPairs = 2;},
    value => {value.maxSnapshots = 23;},
    value => {value.breakpoints.at(-1).rva = '0x89d14';},
    value => {value.breakpoints.at(-2).ranges.push({id: 'injected-output', baseRegister: 'eax', length: 8});},
    value => {value.breakpoints.find(p => p.id === 'native-control-before').ranges.find(r => r.id === 'parent-weather-counter-import').length = 8;},
    value => {value.breakpoints.find(p => p.id === 'native-control-after').ranges = value.breakpoints.find(p => p.id === 'native-control-after').ranges.filter(r => r.id !== 'parent-weather-counter-import');}
  ];
  for (const change of changes) {const bad = structuredClone(c); change(bad); assert.throws(() => verifyNativeParentRttiCaptureConfiguration(bad));}
  await assert.rejects(createNativeParentRttiCaptureConfig('synthetic', 'never-launched-counter', {weatherCounterObservation: true}), /requires mixed/);
});

test('preferred/relocated direct records authenticate external outcome and service changes only its eight output bytes', () => {
  for (const base of [0x400000, 0x5f0000]) for (const U of [0x100000, 0x100004]) {
    const f = fixture({base, U}), proof = verifyNativeParentWeatherCounterRecords(f.input);
    assert.equal(proof.authority, 'observed-external-QPC-only'); assert.equal(proof.runtimeResolvedExportIdentityProved, false);
    const before = f.input.before.ranges.map(r => ({address: r.address, bytes: Buffer.from(f.source.span(r.address, r.length))}));
    const binding = createNativeParentWeatherCounterBinding({proof, memory: f.source.memory});
    assert.doesNotThrow(() => assertNativeParentWeatherCounterService(binding.platformCall));
    assert.throws(() => binding.assertComplete(), /not consumed/);
    assert.equal(binding.platformCall('QueryPerformanceCounter', [f.layout.outputAddress], f.runtime), 1);
    assert.equal(f.source.memory.readBigInt64LE(f.layout.outputAddress), f.value);
    for (const r of before) for (let i = 0; i < r.bytes.length; i++) {
      const p = r.address + i; if (p < f.layout.outputAddress || p >= f.layout.outputAddress + 8) assert.equal(f.source.memory[p], r.bytes[i], 'No other source byte is written by this external service.');
    }
    assert.doesNotThrow(() => binding.assertComplete()); assert.equal(binding.events.length, 1);
    assert.throws(() => binding.platformCall('QueryPerformanceCounter', [f.layout.outputAddress], f.runtime), /reused/);
  }
});

test('proof provenance cannot be replaced by verified:true or modified to supply another outcome', () => {
  const f = fixture(), proof = verifyNativeParentWeatherCounterRecords(f.input);
  assert.throws(() => createNativeParentWeatherCounterBinding({proof: {...proof}, memory: f.source.memory}), /Authenticated/);
  assert.throws(() => createNativeParentWeatherCounterBinding({proof: {verified: true}, memory: f.source.memory}), /Authenticated/);
  assert.throws(() => assertNativeParentWeatherCounterService(() => 1), /authenticated/);
  const original = proof.outputHex;
  try {proof.outputHex = 'ffffffffffffffff'; proof.returnedEax = 0x1234;} catch (error) {assert.ok(error instanceof TypeError);}
  const binding = createNativeParentWeatherCounterBinding({proof, memory: f.source.memory});
  assert.equal(binding.platformCall('QueryPerformanceCounter', [f.layout.outputAddress], f.runtime), 1);
  assert.equal(f.source.span(f.layout.outputAddress, 8).toString('hex'), original);
});

test('verified external payload is isolated from later mutation of original observation rows and contexts', () => {
  const f = fixture({base: 0x5f0000}), proof = verifyNativeParentWeatherCounterRecords(f.input);
  const original = proof.outputHex;
  f.returned.ranges.find(r => r.id === 'native-parent-counter-output').bytes.fill(0xff);
  f.returned.context.writeUInt32LE(0xdeadbeef, 176);
  f.call.context.writeUInt32LE(0xdeadbeef, 164);
  f.input.before.ranges.find(r => r.id === 'origin-frequency').bytes.fill(0);
  f.input.before.ranges.find(r => r.id === 'parent-weather-counter-import').bytes.fill(0);
  const binding = createNativeParentWeatherCounterBinding({proof, memory: f.source.memory});
  assert.equal(binding.platformCall('QueryPerformanceCounter', [f.layout.outputAddress], f.runtime), 1);
  assert.equal(f.source.span(f.layout.outputAddress, 8).toString('hex'), original);
  assert.equal(binding.events[0].returnedEax, 1);
});

test('counter proof rejects missing/extra pairs, unsupported family order, absent capability and joint budget overflow', () => {
  const changes = [
    f => f.input.capture.snapshots.splice(4, 1),
    f => f.input.capture.snapshots.push({...f.returned, ordinal: 22}),
    f => {f.input.rttiOutcomes = f.input.rttiOutcomes.slice(0, 2);},
    f => {f.input.rttiOutcomes[1].weatherQueryIndex = 2;},
    f => {f.input.rttiOutcomes[2].family = 'camera';},
    f => {f.input.capture.header.helperCapabilities = [];},
    f => {f.input.rttiOutcomes.unshift({family: 'camera', returnOrdinal: 10});},
    f => {f.call.ordinal = 17;},
    f => {f.returned.ordinal = 22;},
    f => {f.call.tid++;}
  ];
  for (const change of changes) {const f = fixture(); change(f); assert.throws(() => verifyNativeParentWeatherCounterRecords(f.input));}
});

test('counter proof rejects wrong raw rows, contexts, argument ABI, stable inputs and annotation provenance', () => {
  const changes = [
    f => {f.call.ranges[0].sha256 = '0'.repeat(64);},
    f => {f.call.ranges[0].source = 'invented';},
    f => {f.call.ranges.push(row('foreign', 123, word(7)));},
    f => {f.call.context.writeUInt32LE(f.layout.beforeEsp + 4, 196);},
    f => {f.call.context.writeUInt32LE(f.layout.timerEbp + 4, 180);},
    f => {f.call.context.writeUInt32LE(0x489d0a, 184);},
    f => {f.returned.context.writeUInt32LE(0, 160);},
    f => mutatePart(f.call, 'argument', b => b.writeUInt32LE(f.layout.outputAddress + 4)),
    f => mutatePart(f.call, 'timer-return', b => b.writeUInt32LE(0x498453)),
    f => mutatePart(f.returned, 'origin-frequency', b => b[8] ^= 1),
    f => mutatePart(f.returned, 'frame', b => b[0] ^= 1),
    f => {f.call.parentWeatherCounterObservation = {...f.call.parentWeatherCounterObservation, ownerMainTid: 999};},
    f => {f.input.records.splice(1, 0, {type: 'debug-event', ordinal: 91});},
    f => {f.input.records.splice(1, 1);},
    f => {f.call.parentWeatherCounterObservation.initialOriginFrequencyHex = '00'.repeat(16);}
  ];
  for (const change of changes) {const f = fixture(); change(f); assert.throws(() => verifyNativeParentWeatherCounterRecords(f.input));}
});

test('counter binding fails before external writes for changed source preimage, globals or private call ABI', () => {
  const changes = [
    f => {f.source.memory[f.layout.outputAddress] ^= 1;},
    f => {f.source.memory.writeUInt32LE(0, f.input.base + 0x2e6c8c);},
    f => {f.source.memory[f.input.base + 0x3135ac] ^= 1;},
    f => {f.source.memory.writeUInt32LE(0, f.input.base + 0x16e0fc);},
    f => {f.source.memory.writeUInt32LE(289, f.input.base + 0x50a548);},
    f => {f.runtime.scratchBase += 4;},
    f => {delete f.runtime.nativeWeatherCounterCall;},
    f => {f.runtime.nativeWeatherCounterCall.ebx++;},
    f => {f.runtime.nativeWeatherCounterCall.serviceReturnAddress++;},
    f => {f.source.memory.writeUInt32LE(0, f.layout.beforeEsp - 4);}
  ];
  for (const change of changes) {
    const f = fixture({base: 0x5f0000}), proof = verifyNativeParentWeatherCounterRecords(f.input), binding = createNativeParentWeatherCounterBinding({proof, memory: f.source.memory});
    change(f); const original = Buffer.from(f.source.span(f.layout.outputAddress, 8));
    assert.throws(() => binding.platformCall('QueryPerformanceCounter', [f.layout.outputAddress], f.runtime));
    assert.ok(f.source.span(f.layout.outputAddress, 8).equals(original)); assert.equal(binding.events.length, 0);
  }
  for (const [name, wrongArgs, foreignMemory] of [['QueryPerformanceFrequency', false, false], ['QueryPerformanceCounter', true, false], ['QueryPerformanceCounter', false, true]]) {
    const f = fixture(), proof = verifyNativeParentWeatherCounterRecords(f.input), binding = createNativeParentWeatherCounterBinding({proof, memory: f.source.memory});
    assert.throws(() => binding.platformCall(name, [f.layout.outputAddress + (wrongArgs ? 4 : 0)], {...f.runtime, memory: foreignMemory ? Buffer.alloc(1) : f.source.memory}));
    assert.ok(f.source.span(f.layout.outputAddress, 8).equals(f.preimage));
  }
  const f = fixture({ebx: 0}), proof = verifyNativeParentWeatherCounterRecords(f.input), binding = createNativeParentWeatherCounterBinding({proof, memory: f.source.memory});
  delete f.runtime.nativeWeatherCounterCall.ebx;
  assert.throws(() => binding.platformCall('QueryPerformanceCounter', [f.layout.outputAddress], f.runtime), /uint32/,
    'A missing source register is not coerced to the legitimately observed zero EBX.');
  assert.ok(f.source.span(f.layout.outputAddress, 8).equals(f.preimage));
});
