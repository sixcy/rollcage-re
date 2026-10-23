import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mkdtemp, writeFile, copyFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
import {createNativeRecoverySoundCaptureConfig, verifyNativeRecoverySoundBindingEvidence, verifyNativeRecoverySoundChannelEvidence} from '../tools/prepare-native-recovery-sound-capture.mjs';
import {verifyNativeRecoverySoundCaptureConfiguration, verifyNativeRecoverySoundObservationPredicate} from '../tools/lib/native-recovery-sound-selection.mjs';
import {nativeRecoverySoundBindingRanges, nativeRecoverySoundPlaybackLayout, nativeRecoverySoundFileQueryLayouts, selectNativeRecoverySoundBindingSnapshots,
  nativeRecoverySoundChannelSites, selectNativeRecoverySoundChannelSnapshots} from '../tools/lib/native-recovery-sound-bindings.mjs';

const options = {includeAllocations: true, includeVectorStorage: true, includeServiceSites: true, deferObservationsUntilControlledCaller: true, includeBindingSites: true};
test('optional binding profile preserves retained v8 policy and unchanged hard bounds', async () => {
  const retained = JSON.parse(await readFile('analysis/native-physics-local/startup-20261022/controlled-recovery-sound-config-v8-20261023.json', 'utf8'));
  const oldOptions = {...options, includeBindingSites: false};
  const old = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', oldOptions)).configuration;
  for (const key of ['breakpoints', 'phaseActions', 'pendingFrameObserver', 'observationActivation', 'maxSnapshots', 'maxDurationMs', 'maxEvents']) assert.deepEqual(old[key], retained[key]);
  const {configuration: config} = await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', options);
  assert.equal(config.pendingFrameObserver.nestedBreakpointIds.length, 46);
  assert.deepEqual(config.phaseActions, old.phaseActions);
  for (const key of ['maxSnapshots', 'maxDurationMs', 'maxEvents']) assert.equal(config[key], old[key]);
  assert.equal(config.pendingFrameObserver.maxNestedSnapshots, 115);
  assert.equal(config.pendingFrameObserver.maxPendingBytes, 128 * 1024 * 1024);
  assert.equal(config.pendingFrameObserver.maxPendingBytes, old.pendingFrameObserver.maxPendingBytes);
  assert.equal(config.pendingFrameObserver.nestedCaptureScope, 'frame-thread');
  assert.deepEqual(config.observationActivation.observationBreakpointIds, config.pendingFrameObserver.nestedBreakpointIds);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(config).bindingSitesDeclared, true);
  assert.equal((await verifyNativeRecoverySoundBindingEvidence()).evidenceIds.length, 15);
  const changed = structuredClone(config); changed.observationActivation = undefined;
  assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(changed), /guarded activation/);
  const wrong = structuredClone(config); wrong.breakpoints.find(row => row.id === 'recovery-sound-find-first-return').ranges.at(-2).length = 591;
  assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(wrong), /policy differs/);
  for (const change of [bp => bp.captureWhen.range.offset++, bp => bp.captureWhen.equalsBytesHex = '506c6179696e6721', bp => bp.ranges.find(p => p.id === 'recovery-audio-playback-phase').offset = '0x580']) {
    const corrupt = structuredClone(config); change(corrupt.breakpoints.find(row => row.id === 'recovery-sound-playback-allocation-return'));
    assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(corrupt), /policy differs/);
  }
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeServiceSites: false}), /require services/);
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeBindingSites: 'yes'}), /boolean/);
});

test('allocation observation prefix is independent of exact phase, clock and thread proof', () => {
  const make = () => {
    const chain = Buffer.alloc(4200); Buffer.from('Playing ').copy(chain, 0x58);
    const phase = Buffer.alloc(4); phase.writeUInt32LE(4);
    const clock = Buffer.alloc(4); clock.writeUInt32LE(228);
    return {breakpointId: 'recovery-sound-playback-allocation-return', tid: 44, registers: {esp: 0x1000},
      captureWhen: {address: 0x1054, actualBytesHex: '506c6179696e6720', equalsBytesHex: '506c6179696e6720'},
      ranges: new Map([['recovery-audio-playback-chain', {address: 0xffc, bytes: chain}], ['recovery-audio-playback-phase', {address: 0x257c, bytes: phase}], ['recovery-audio-clock', {bytes: clock}]])};
  };
  const context = {sessionAddress: 0x2000, clock: 228, tid: 44};
  verifyNativeRecoverySoundObservationPredicate(make(), context, true);
  for (const mutate of [r => r.captureWhen.address++, r => r.captureWhen.actualBytesHex = '00'.repeat(8), r => r.ranges.get('recovery-audio-playback-phase').bytes.writeUInt32LE(3), r => r.ranges.get('recovery-audio-clock').bytes.writeUInt32LE(229), r => r.tid++, r => r.ranges.get('recovery-audio-playback-chain').bytes[0x58]++]) {
    const row = make(); mutate(row); assert.throws(() => verifyNativeRecoverySoundObservationPredicate(row, context, true), /prefix\/phase\/clock\/thread/);
  }
});

function fixture() {
  const dispatchEntry = 0x50002c, layout = nativeRecoverySoundPlaybackLayout(dispatchEntry), sourceAddress = 0x1200000;
  const managerEntry = 0x500000, factoryEntry = managerEntry - 0x464, managerAddress = 0x1300000;
  const actual = n => n + 0x230000, rows = [];
  const part = (id, address, length, fill = 0) => ({id, address, length, bytes: Buffer.alloc(length, fill)});
  const row = (name, esp, ordinal, ranges = []) => {
    const value = {breakpointId: `recovery-sound-${name}`, ordinal, observedDebugEventOrdinal: ordinal * 2,
      registers: {esp, eax: 0x1100004, ebx: 15, ecx: 32, edi: 31, esi: layout.stringAddress, ebp: layout.growEntry - 4}, ranges: new Map(ranges.map(x => [x.id, x]))};
    rows.push(value); return value;
  };
  const put = (r, address, value) => {
    const p = [...r.ranges.values()].find(x => address >= x.address && address + 4 <= x.address + x.bytes.length);
    assert.ok(p); p.bytes.writeUInt32LE(value >>> 0, address - p.address);
  };
  for (const [i, name] of ['playback-allocation-call', 'playback-allocation-return'].entries()) {
    const r = row(name, layout.allocationEsp, i + 10, [part('recovery-audio-playback-chain', layout.allocationEsp - 4, 4200), part('recovery-audio-playback-string', layout.stringAddress, 28)]);
    for (const [address, value] of [[layout.allocationEsp, 32], [layout.growEntry, actual(0x40539a)], [layout.assignmentEntry, actual(0x4a2b9b)], [layout.formatterEntry, actual(0x4ada5a)], [layout.formatterEntry + 4, layout.stringAddress], [layout.formatterEntry + 8, actual(0x5d3f00)], [layout.formatterEntry + 12, sourceAddress + 4]]) put(r, address, value);
    put(r, layout.growEntry + 4, 20); put(r, layout.stringAddress + 20, 15);
    if (i) {
      put(r, layout.allocationEsp - 4, actual(0x4058e7));
      const region = part('recovery-audio-playback-allocation-region', 0x1100000, 128, 0xac);
      Object.assign(region, {rangeMode: 'readable-region', requestedResolvedRoot: r.registers.eax, regionBaseAddress: region.address, regionSize: region.length}); r.ranges.set(region.id, region);
    }
  }
  const log = row('playback-logger-entry', layout.loggerEntry, 12, [part('recovery-audio-playback-logger-stack', layout.loggerEntry - 4, 80)]);
  log.registers.ecx = 0x9123abcd; put(log, layout.loggerEntry, actual(0x4ada62));
  log.context = Buffer.alloc(716); log.context.writeUInt32LE(log.registers.ecx, 172);
  put(log, layout.stringAddress, 0x1100004); put(log, layout.stringAddress + 16, 20); put(log, layout.stringAddress + 20, 31);
  for (const [index, query] of nativeRecoverySoundFileQueryLayouts({managerEntry, factoryEntry}).entries()) {
    const frames = () => [part('recovery-audio-find-frame', query.findEbp, 8), part('recovery-audio-find-resolver-frame', query.resolverEntry - 4, 8)];
    const find = row('find-first-call', query.callEsp, 1 + index * 2, [part('recovery-audio-service-arguments', query.callEsp, 8), part('recovery-audio-find-data', query.frame, 592, 0xa5), part('recovery-audio-service-path', query.frame + 0x650, 1024), ...frames()]);
    put(find, query.callEsp, query.frame + 0x650); put(find, query.callEsp + 4, query.frame);
    const returned = row('find-first-return', query.frame, 2 + index * 2, [part('recovery-audio-find-data', query.frame, 592, 0xb6), part('recovery-audio-service-path', query.frame + 0x650, 1024), ...frames()]);
    for (const r of [find, returned]) {r.registers.ebp = query.findEbp; put(r, query.findEbp, query.resolverEntry - 4); put(r, query.findEbp + 4, actual(0x4a7fd6)); put(r, query.resolverEntry, actual(query.returnAddress));}
  }
  const mixerEsp = factoryEntry - 0x848;
  const mixer = row('mixer-id-call', mixerEsp, 5, [part('recovery-audio-mixer-input', 0x1400000, 80), part('recovery-audio-mixer-vtable', 0x1500000, 4), part('manager', managerAddress, 0x850), part('mixer-header', 0x1600000, 12), part('mixer-storage', 0x1700000, 4), part('mixer-argument', mixerEsp + 0x14, 4)]);
  mixer.registers.ecx = 0x1400000; mixer.registers.eax = 0x1500000;
  mixer.registers.ebx = managerAddress; mixer.registers.ebp = 42; mixer.registers.esi = 0x1700000;
  put(mixer, managerAddress + 0x84c, 0x1600000); put(mixer, 0x1600000, 0x1700000); put(mixer, 0x1600004, 0x1700004); put(mixer, 0x1700000, 0x1400000); put(mixer, mixerEsp + 0x14, 42);
  put(mixer, 0x1400000, 0x1500000); put(mixer, 0x1400008, 42); put(mixer, 0x1400048, 0x1600000); put(mixer, 0x1500000, actual(0x4a92e0));
  return {rows, context: {dispatchEntry, managerEntry, factoryEntry, managerAddress, actual, sourceAddress}, layout, put};
}

test('synthetic observations retain exact requested preimage, private logger ECX and file before/after bytes', () => {
  const {rows, context, layout} = fixture(), proof = selectNativeRecoverySoundBindingSnapshots(rows, context);
  assert.equal(proof.sourceReplayComplete, false); assert.deepEqual(proof.layout, layout);
  assert.equal(proof.allocation.requestedBytes, 32); assert.equal(proof.allocation.inputHex, 'ac'.repeat(32));
  assert.equal(proof.allocation.containingRegionBytes, 128); assert.equal(proof.logger.incomingEcx, 0x9123abcd);
  assert.equal(proof.services[0].inputHex, 'a5'.repeat(592)); assert.equal(proof.services[0].outputHex, 'b6'.repeat(592));
  assert.equal(proof.mixers[0].voiceAddress, 0x1600000);
  assert.deepEqual(nativeRecoverySoundBindingRanges('recovery-sound-find-first-return')[0], {id: 'recovery-audio-find-data', baseRegister: 'esp', length: 592});
  assert.equal(nativeRecoverySoundPlaybackLayout(0xf000002c).allocationEsp, 0xefffef74);
});

test('binding proof rejects stack substitution, uncovered allocation, output substitution and wrong service cleanup', () => {
  const mutations = [
    f => f.put(f.rows[0], f.layout.formatterEntry + 12, f.context.sourceAddress + 8),
    f => f.rows[1].ranges.get('recovery-audio-playback-allocation-region').requestedResolvedRoot++,
    f => f.rows[1].registers.eax += 120,
    f => f.put(f.rows[1], f.layout.allocationEsp - 4, f.context.actual(0x4058e8)),
    f => f.rows[2].registers.esp += 4,
    f => f.rows[2].registers.ecx++,
    f => f.rows[2].context.writeUInt32LE(0, 172),
    f => f.rows[4].ranges.get('recovery-audio-find-data').address++,
    f => f.rows[4].registers.esp += 4,
    f => f.rows[7].registers.ecx++,
    f => f.rows[7].registers.esi += 4,
    f => f.rows[3].ranges.get('recovery-audio-find-resolver-frame').bytes.writeUInt32LE(0, 4),
  ];
  for (const mutate of mutations) {const f = fixture(); mutate(f); assert.throws(() => selectNativeRecoverySoundBindingSnapshots(f.rows, f.context));}
});

const retainedDirectory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v9-20261023';
const retainedAvailable = existsSync(`${retainedDirectory}/trace.jsonl`);

async function retainedFixture() {
  const capture = await loadPhysicsCapture(retainedDirectory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${retainedDirectory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
  assert.equal(pairs.length, 1);
  return {capture, configuration, pair: pairs[0]};
}

test('retained original V9 proves playback allocation, actual logger ECX and file/mixer bindings without claiming full replay', {skip: !retainedAvailable}, async () => {
  const {capture, configuration, pair} = await retainedFixture();
  const report = JSON.parse(await readFile('analysis/physics-native-controlled-recovery-sound-v9-20261023/report.json', 'utf8'));
  const proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration), binding = proof.bindingObservations;
  assert.equal(capture.complete.snapshots, 323); assert.equal(capture.complete.pendingFrameSelection.nestedSnapshots, 88);
  assert.equal(report.lineageVerified, true); assert.equal(report.sourceReplayComplete, false);
  assert.equal(binding.verified, true); assert.equal(binding.sourceReplayComplete, false);
  assert.equal(binding.allocation.requestedBytes, 32); assert.equal(binding.allocation.stringLength, 20);
  assert.equal(Buffer.from(binding.allocation.formattedBytesHex, 'hex').toString('ascii'), 'Playing SFX_PINKPURP\0');
  assert.equal(binding.allocation.inputHex, '0df0adba'.repeat(8));
  assert.equal(binding.allocation.containingRegionBytes, 1449984);
  assert.equal(binding.logger.incomingEcx, 0);
  const logger = capture.snapshots.find(row => row.ordinal === binding.logger.ordinal);
  assert.equal(logger.context.readUInt32LE(172), binding.logger.incomingEcx);
  assert.equal(binding.services.filter(row => row.name === 'find-first').length, 2);
  assert.deepEqual(binding.services.map(row => row.name), ['find-first', 'find-first', 'find-close', 'find-close', 'file-open', 'file-size', 'file-close', 'outer-close']);
  assert.deepEqual(binding.mixers.map(row => [row.id, row.requestedId]), [[0, 1], [1, 1]]);
  assert.deepEqual(binding, report.proof.bindingObservations);

  // Mutations affect only test objects. Original trace/context/memory files
  // remain untouched; OS output contents are not guessed or reinterpreted.
  const corrupt = (id, mutate) => {
    const original = capture.snapshots.find(row => row.breakpointId === `recovery-sound-${id}`);
    assert.ok(original);
    const changed = {...original, registers: {...original.registers}, context: Buffer.from(original.context),
      ranges: new Map([...original.ranges].map(([key, value]) => [key, {...value, bytes: Buffer.from(value.bytes)}]))};
    mutate(changed);
    return {...capture, snapshots: capture.snapshots.map(row => row === original ? changed : row)};
  };
  const put = (row, address, value) => {
    let touched = 0;
    for (const part of row.ranges.values()) if (address >= Number(part.address) && address + 4 <= Number(part.address) + part.bytes.length) {
      part.bytes.writeUInt32LE(value >>> 0, address - Number(part.address)); touched++;
    }
    assert.ok(touched);
  };
  for (const [id, mutate, expected] of [
    ['playback-allocation-call', row => put(row, binding.layout.allocationEsp, 33), /allocation request differs/],
    ['playback-allocation-return', row => put(row, binding.layout.allocationEsp - 4, pair.moduleBaseAddress + 0x58e8), /service return address differs/],
    ['playback-allocation-call', row => put(row, binding.layout.formatterEntry + 12, proof.sourceAddress + 8), /private stack chain differs/],
    ['playback-allocation-return', row => row.ranges.get('recovery-audio-playback-allocation-region').requestedResolvedRoot = '0x1', /preimage coverage differs/],
    ['playback-logger-entry', row => row.registers.ecx = 1, /ECX differs from its actual x86 context/],
    ['playback-logger-entry', row => row.context.writeUInt32LE(1, 172), /ECX differs from its actual x86 context/],
    ['find-first-return', row => row.ranges.get('recovery-audio-find-data').address = Number(row.ranges.get('recovery-audio-find-data').address) + 4, /output preimage differs/],
    ['find-first-call', row => put(row, Number(row.registers.esp) + 4, 0x1000), /output preimage differs/],
    ['file-size-return', row => row.registers.esp = Number(row.registers.esp) + 4, /stack\/clock ranges differ/],
  ]) assert.throws(() => selectNativeRecoverySoundSnapshots(corrupt(id, mutate), pair, configuration), expected, id);
});

test('retained V9 Win32 output byte tampering fails original blob hash verification', {skip: !retainedAvailable}, async () => {
  const records = (await readFile(`${retainedDirectory}/trace.jsonl`, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const source = records.find(row => row.type === 'snapshot' && row.breakpointId === 'recovery-sound-find-first-return');
  const output = source.ranges.find(row => row.id === 'recovery-audio-find-data');
  const directory = await mkdtemp(path.join(tmpdir(), 'rollcage-v9-corrupt-output-'));
  try {
    // A minimal negative loader fixture uses the retained original identity,
    // context and output descriptor. It is not a new native capture.
    const altered = Buffer.from(await readFile(path.join(retainedDirectory, output.file))); altered[100] ^= 1;
    await writeFile(path.join(directory, output.file), altered);
    await copyFile(path.join(retainedDirectory, source.contextFile), path.join(directory, source.contextFile));
    const trace = [records[0], {...source, ordinal: 1, hit: 1, ranges: [output]}, {...records.find(row => row.type === 'complete'), snapshots: 1}];
    await writeFile(path.join(directory, 'trace.jsonl'), trace.map(row => JSON.stringify(row)).join('\n'));
    await assert.rejects(loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256}), /Capture blob hash differs/);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('optional channel profile preserves V9 bindings byte-for-byte and all original bounds', async () => {
  const baseline = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', options)).configuration;
  const disabled = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeChannelSites: false})).configuration;
  assert.equal(JSON.stringify(disabled), JSON.stringify(baseline));
  if (retainedAvailable) {
    const retained = JSON.parse(await readFile(`${retainedDirectory}/configuration.json`, 'utf8'));
    for (const key of ['breakpoints', 'phaseActions', 'pendingFrameObserver', 'observationActivation']) assert.equal(JSON.stringify(baseline[key]), JSON.stringify(retained[key]));
  }
  const config = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeChannelSites: true})).configuration;
  assert.equal(config.pendingFrameObserver.nestedBreakpointIds.length, 50);
  assert.equal(config.maxDurationMs, 90000); assert.equal(config.maxSnapshots, 350);
  assert.equal(config.pendingFrameObserver.maxNestedSnapshots, 115); assert.equal(config.pendingFrameObserver.maxPendingBytes, 128 * 1024 * 1024);
  assert.equal(config.pendingFrameObserver.nestedCaptureScope, 'frame-thread');
  assert.equal(config.observationActivation.rawHit, 229);
  assert.deepEqual(config.breakpoints.slice(0, -4), baseline.breakpoints);
  assert.deepEqual(config.phaseActions, baseline.phaseActions);
  for (const row of config.breakpoints.slice(-4)) assert.deepEqual(row.captureWhen, baseline.breakpoints.find(bp => bp.id === 'recovery-sound-append-call').captureWhen);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(config).channelSitesDeclared, true);
  assert.equal((await verifyNativeRecoverySoundChannelEvidence()).evidenceIds.length, 3);
  const mutated = structuredClone(config);
  mutated.breakpoints.find(row => row.id === 'recovery-sound-channel-allocation-return').ranges.at(-1).length = 8;
  assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(mutated), /policy differs/);
  const unarmed = structuredClone(config); unarmed.observationActivation.observationBreakpointIds.pop();
  assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(unarmed), /observer policy differs/);
  const wrongPhase = structuredClone(config); wrongPhase.breakpoints.at(-1).captureWhen.equalsBytesHex = '03000000';
  assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(wrongPhase), /policy differs/);
  const wrongThread = structuredClone(config); delete wrongThread.pendingFrameObserver.nestedCaptureScope;
  assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(wrongThread), /observer policy differs/);
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeBindingSites: false, includeChannelSites: true}), /complete binding profile/);
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...options, includeChannelSites: 'yes'}), /boolean/);
});

function channelFixture() {
  const A = 0x580000, ownerAddress = 0x610000, wrapperAddress = 0x620000, P = 0x630000, actual = p => p + 0x350000;
  const appendCall = {ordinal: 1, observedDebugEventOrdinal: 10, registers: {esp: A - 4, ecx: ownerAddress + 4, edi: wrapperAddress, ebp: 0x660000}};
  const appendReturn = {ordinal: 6, observedDebugEventOrdinal: 60, registers: {esp: A}};
  const rows = nativeRecoverySoundChannelSites.map(([id], index) => {
    const copy = id.includes('memmove'), esp = A - (copy ? 52 : 40);
    const parts = [{id: 'recovery-audio-channel-chain', address: esp - 4, bytes: Buffer.alloc(84)}, {id: 'recovery-audio-channel-vector', address: ownerAddress + 4, bytes: Buffer.alloc(12)}];
    if (id.endsWith('allocation-return')) parts.push({id: 'recovery-audio-channel-allocation', address: P, bytes: Buffer.from('deadbabe', 'hex')});
    if (copy) parts.push({id: 'recovery-audio-channel-memmove-destination', address: P, bytes: Buffer.from('deadbabe', 'hex')});
    return {breakpointId: id, ordinal: index + 2, observedDebugEventOrdinal: (index + 2) * 10,
      registers: {esp, ebx: 1, edi: ownerAddress + 4, esi: copy ? P : 0, ebp: 0x660000, ecx: copy ? 0 : ownerAddress + 4, eax: index === 0 ? 4 : index === 2 ? 0 : P}, ranges: new Map(parts.map(p => [p.id, p]))};
  });
  const put = (row, address, value) => {
    const part = [...row.ranges.values()].find(p => address >= p.address && address + 4 <= p.address + p.bytes.length);
    assert.ok(part); part.bytes.writeUInt32LE(value >>> 0, address - part.address);
  };
  for (const row of rows) {
    for (const [address, value] of [[A - 36, A + 24], [A - 32, ownerAddress + 4], [A - 28, ownerAddress], [A - 24, actual(0x40ec0b)], [A - 20, 1], [A - 16, wrapperAddress], [A - 8, actual(0x40dcba)], [A - 4, A + 24], [A + 24, wrapperAddress]]) put(row, address, value);
    if (row.breakpointId.includes('allocation')) {put(row, A - 40, 4); if (row.breakpointId.endsWith('return')) put(row, A - 44, actual(0x40f085));}
    else {put(row, A - 52, P); put(row, A - 48, 0); put(row, A - 44, 0); put(row, A - 40, row.registers.ebp); if (row.breakpointId.endsWith('return')) put(row, A - 56, actual(0x40f0a8));}
  }
  return {rows, context: {selectorFrame: A, ownerAddress, wrapperAddress, appendCall, appendReturn, actual}, put, P, A};
}

test('synthetic channel evidence observes four-byte allocator preimage before zero-copy and append', () => {
  const {rows, context, P} = channelFixture(), proof = selectNativeRecoverySoundChannelSnapshots(rows, context);
  assert.equal(proof.verified, true); assert.equal(proof.sourceReplayComplete, false);
  assert.equal(proof.allocation.address, P); assert.equal(proof.allocation.requestedBytes, 4); assert.equal(proof.allocation.inputHex, 'deadbabe');
  assert.deepEqual(proof.memmove.arguments, [P, 0, 0]); assert.equal(proof.memmove.beforeHex, 'deadbabe'); assert.equal(proof.memmove.afterHex, 'deadbabe');
  assert.deepEqual(proof.selectedOrdinals, [1, 2, 3, 4, 5, 6]);
});

test('channel evidence rejects nonempty vectors, wrong request/chain/result/preimages and observation order', () => {
  for (const mutate of [
    f => f.put(f.rows[0], f.A - 40, 8),
    f => f.put(f.rows[1], f.A - 44, f.context.actual(0x40f086)),
    f => f.put(f.rows[0], f.A - 24, f.context.actual(0x40ebe7)),
    f => f.put(f.rows[2], f.A - 44, 4),
    f => f.rows[1].registers.eax += 4,
    f => f.rows[1].ranges.get('recovery-audio-channel-allocation').bytes.fill(0),
    f => f.rows[3].ranges.get('recovery-audio-channel-memmove-destination').bytes.fill(0),
    f => f.rows[0].ranges.get('recovery-audio-channel-vector').bytes[0] = 1,
    f => f.rows[2].registers.esi += 4,
    f => f.rows[3].observedDebugEventOrdinal = 15,
    f => f.rows.pop(),
    f => f.context.appendCall.registers.ecx += 4,
  ]) {const f = channelFixture(); mutate(f); assert.throws(() => selectNativeRecoverySoundChannelSnapshots(f.rows, f.context));}
});

const channelDirectory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v11-20261023';
test('retained clean V11 observes channel storage before append and rejects changed allocation or copy bytes', {skip: !existsSync(`${channelDirectory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(channelDirectory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${channelDirectory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
  assert.equal(pairs.length, 1);
  const pair = pairs[0], proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration);
  const channel = proof.channelVectorObservations;
  assert.equal(capture.complete.snapshots, 327);
  assert.equal(capture.complete.pendingFrameSelection.nestedSnapshots, 92);
  assert.equal(channel.verified, true);
  assert.equal(channel.sourceReplayComplete, false);
  assert.equal(channel.allocation.requestedBytes, 4);
  assert.equal(channel.allocation.inputHex, '0df0adba');
  assert.deepEqual(channel.memmove.arguments, [channel.allocation.address, 0, 0]);
  assert.equal(channel.memmove.actualReturnEax, channel.allocation.address);
  assert.equal(channel.memmove.beforeHex, channel.allocation.inputHex);
  assert.equal(channel.memmove.afterHex, channel.allocation.inputHex);
  const report = JSON.parse(await readFile('analysis/physics-native-controlled-recovery-sound-v11-20261023/report.json', 'utf8'));
  assert.deepEqual(channel, report.proof.channelVectorObservations);

  for (const [ordinal, id] of [
    [channel.allocation.returnOrdinal, 'recovery-audio-channel-allocation'],
    [channel.memmove.callOrdinal, 'recovery-audio-channel-memmove-destination'],
    [channel.memmove.returnOrdinal, 'recovery-audio-channel-memmove-destination'],
  ]) {
    const original = capture.snapshots.find(row => row.ordinal === ordinal);
    const ranges = new Map(original.ranges), part = ranges.get(id), bytes = Buffer.from(part.bytes);
    bytes[0] ^= 1; ranges.set(id, {...part, bytes});
    const changed = {...original, ranges};
    const corrupted = {...capture, snapshots: capture.snapshots.map(row => row === original ? changed : row)};
    assert.throws(() => selectNativeRecoverySoundSnapshots(corrupted, pair, configuration), /zero-copy destination preimage differs/);
  }
});
