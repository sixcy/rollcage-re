import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createNativeRecoverySoundCaptureConfig, verifyNativeRecoverySoundPlaybackEvidence} from '../tools/prepare-native-recovery-sound-capture.mjs';
import {verifyNativeRecoverySoundCaptureConfiguration, verifyNativeRecoverySoundObservationPredicate, selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {nativeRecoverySoundPlaybackLayout} from '../tools/lib/native-recovery-sound-bindings.mjs';
import {nativeRecoverySoundPlaybackCopySites, selectNativeRecoverySoundPlaybackCopySnapshots} from '../tools/lib/native-recovery-playback-copy.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const channelOptions = {includeAllocations: true, includeVectorStorage: true, includeServiceSites: true, deferObservationsUntilControlledCaller: true, includeBindingSites: true, includeChannelSites: true};
test('optional playback profile adds exactly two sites and preserves prior channel profile bytes and hard bounds', async () => {
  const baseline = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', channelOptions)).configuration;
  const disabled = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...channelOptions, includePlaybackSites: false})).configuration;
  assert.equal(JSON.stringify(disabled), JSON.stringify(baseline));
  const retainedFile = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v11-20261023/configuration.json';
  if (existsSync(retainedFile)) {
    const retained = JSON.parse(await readFile(retainedFile, 'utf8'));
    for (const key of ['breakpoints', 'phaseActions', 'pendingFrameObserver', 'observationActivation']) assert.equal(JSON.stringify(baseline[key]), JSON.stringify(retained[key]));
  }
  const result = await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...channelOptions, includePlaybackSites: true}), config = result.configuration;
  assert.equal(config.pendingFrameObserver.nestedBreakpointIds.length, 52);
  assert.equal(config.maxDurationMs, 90000); assert.equal(config.maxSnapshots, 350);
  assert.equal(config.pendingFrameObserver.maxNestedSnapshots, 115); assert.equal(config.pendingFrameObserver.maxPendingBytes, 128 * 1024 * 1024);
  assert.equal(config.pendingFrameObserver.nestedCaptureScope, 'frame-thread');
  assert.equal(config.observationActivation.rawHit, 229);
  assert.deepEqual(config.observationActivation.observationBreakpointIds, config.pendingFrameObserver.nestedBreakpointIds);
  assert.deepEqual(config.breakpoints.slice(0, -2), baseline.breakpoints); assert.deepEqual(config.phaseActions, baseline.phaseActions);
  for (const bp of config.breakpoints.slice(-2)) {
    assert.deepEqual(bp.captureWhen, {range: {id: 'recovery-audio-playback-copy-prefix', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 8}, equalsBytesHex: '506c6179696e6720'});
    assert.equal(bp.ranges.find(row => row.id === 'recovery-audio-playback-copy-phase').length, 4);
    assert.equal(bp.ranges.find(row => row.id === 'recovery-audio-playback-copy-destination').length, 32);
    assert.equal(bp.ranges.find(row => row.id === 'recovery-audio-playback-copy-source').length, 21);
  }
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(config).playbackSitesDeclared, true);
  const evidence = await verifyNativeRecoverySoundPlaybackEvidence();
  assert.equal(evidence.noEcxWriterAfterMemcpy, true); assert.equal(evidence.reachedTailInstructionCount, 16);
  assert.equal(evidence.evidenceIds.length, 4); assert.ok(evidence.evidenceIds.every(id => result.evidenceIds.includes(id)));
  assert.ok(evidence.evidenceIds.includes('ev_f8b9e2e30926ba63340507836022e2bc518f19daa95ad37949095ddebe7d889e'));
});

test('playback profile rejects weakened input predicates, phase/range/scope and incomplete prerequisites', async () => {
  const config = (await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...channelOptions, includePlaybackSites: true})).configuration;
  for (const mutate of [
    c => c.breakpoints.at(-1).captureWhen.range.dereferenceOffsets = ['0'],
    c => c.breakpoints.at(-1).captureWhen.equalsBytesHex = '506c6179696e6721',
    c => c.breakpoints.at(-1).ranges.find(r => r.id === 'recovery-audio-playback-copy-phase').offset = '0x580',
    c => c.breakpoints.at(-1).ranges.find(r => r.id === 'recovery-audio-playback-copy-destination').length = 33,
    c => c.observationActivation.observationBreakpointIds.pop(),
    c => delete c.pendingFrameObserver.nestedCaptureScope,
  ]) {const changed = structuredClone(config); mutate(changed); assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(changed));}
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...channelOptions, includePlaybackSites: true, includeChannelSites: false}), /complete channel profile/);
  await assert.rejects(createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {...channelOptions, includePlaybackSites: 'yes'}), /boolean/);
});

function fixture() {
  const dispatchEntry = 0x50002c, layout = nativeRecoverySoundPlaybackLayout(dispatchEntry), esp = layout.assignmentEntry - 24;
  const P = 0x1300000, M = layout.formattedBuffer, sourceAddress = 0x1400000, actual = value => value + 0x350000;
  const allocated = Buffer.alloc(32, 0xa5), source = Buffer.from('Playing SFX_PINKPURP\0', 'ascii'), returnedEcx = 0x0badf00d;
  const part = (id, address, bytes) => ({id, address, bytes, length: bytes.length});
  const rows = nativeRecoverySoundPlaybackCopySites.map(([id, address], index) => {
    const chain = Buffer.alloc(4152), destination = Buffer.from(allocated), string = Buffer.alloc(28);
    destination[0] = 0; if (index) source.copy(destination, 0, 0, 20);
    source.copy(chain, M - (esp - 4));
    string.writeUInt32LE(P); string.writeUInt32LE(31, 20);
    const registers = {esp, eip: actual(address), eax: P, ecx: index ? returnedEcx : 0x11111111, edx: index ? 0x33333333 : 0x22222222,
      ebx: M, edi: 20, esi: layout.stringAddress, ebp: layout.playbackEntry - 4};
    const context = Buffer.alloc(716); for (const [name, offset] of [['eax', 176], ['ecx', 172], ['edx', 168]]) context.writeUInt32LE(registers[name], offset);
    const phase = Buffer.alloc(4); phase.writeUInt32LE(4); const clock = Buffer.alloc(4); clock.writeUInt32LE(228);
    return {breakpointId: id, ordinal: 20 + index, observedDebugEventOrdinal: 20 + index, tid: 77, registers, context,
      captureWhen: {address: M, actualBytesHex: '506c6179696e6720', equalsBytesHex: '506c6179696e6720'},
      ranges: new Map([
        part('recovery-audio-playback-copy-chain', esp - 4, chain),
        part('recovery-audio-playback-copy-arguments', esp, chain.subarray(4, 16)),
        part('recovery-audio-playback-copy-source', M, chain.subarray(M - esp + 4, M - esp + 25)),
        part('recovery-audio-playback-copy-destination', P, destination), part('recovery-audio-playback-copy-string', layout.stringAddress, string),
        part('recovery-audio-playback-copy-phase', 0x2000 + 0x57c, phase), part('recovery-audio-clock', actual(0x90a548), clock),
      ].map(r => [r.id, r]))};
  });
  const put = (row, address, value) => {
    let count = 0;
    for (const range of row.ranges.values()) if (address >= Number(range.address) && address + 4 <= Number(range.address) + range.bytes.length) {range.bytes.writeUInt32LE(value >>> 0, address - Number(range.address)); count++;}
    assert.ok(count);
  };
  for (const row of rows) {
    for (const [address, value] of [[esp, P], [esp + 4, M], [esp + 8, 20], [layout.assignmentEntry, actual(0x4a2b9b)], [layout.assignmentEntry + 4, M], [layout.assignmentEntry + 8, 20],
      [layout.formatterEntry, actual(0x4ada5a)], [layout.formatterEntry + 4, layout.stringAddress], [layout.formatterEntry + 8, actual(0x5d3f00)], [layout.formatterEntry + 12, sourceAddress + 4]]) put(row, address, value);
    if (row.ordinal === 21) put(row, esp - 4, actual(0x4053da));
  }
  const allocation = {breakpointId: 'recovery-sound-playback-allocation-return', ordinal: 10, observedDebugEventOrdinal: 10, registers: {esp: layout.allocationEsp}};
  const logger = {breakpointId: 'recovery-sound-playback-logger-entry', ordinal: 30, observedDebugEventOrdinal: 30, registers: {esp: layout.loggerEntry, ecx: returnedEcx}, context: Buffer.alloc(716)};
  logger.context.writeUInt32LE(returnedEcx, 172);
  const bindingObservations = {verified: true, sourceReplayComplete: false, layout, allocation: {address: P, requestedBytes: 32, stringLength: 20, returnOrdinal: 10, inputHex: allocated.toString('hex'), formattedBytesHex: source.toString('hex')}, logger: {ordinal: 30, incomingEcx: returnedEcx}};
  return {rows, candidates: [allocation, ...rows, logger], context: {dispatchEntry, sourceAddress, actual, bindingObservations}, predicateContext: {sessionAddress: 0x2000, clock: 228, tid: 77}, logger, put, P, M, esp, returnedEcx};
}

test('synthetic final memcpy preserves genuine allocation tail and links arbitrary returned raw ECX to logger', () => {
  const f = fixture();
  for (const row of f.rows) verifyNativeRecoverySoundObservationPredicate(row, f.predicateContext, true);
  const proof = selectNativeRecoverySoundPlaybackCopySnapshots(f.candidates, f.context);
  assert.equal(proof.sourceReplayComplete, false); assert.equal(proof.verified, true);
  assert.deepEqual(proof.arguments, [f.P, f.M, 20]); assert.equal(proof.beforeHex, `00${'a5'.repeat(31)}`);
  assert.equal(Buffer.from(proof.afterHex, 'hex').subarray(0, 20).toString('ascii'), 'Playing SFX_PINKPURP');
  assert.equal(Buffer.from(proof.afterHex, 'hex').subarray(20).toString('hex'), 'a5'.repeat(12));
  assert.equal(proof.returnedRegisters.ecx, f.returnedEcx); assert.notEqual(proof.beforeRegisters.ecx, f.returnedEcx);
  assert.notEqual(proof.returnedRegisters.ecx, f.P); assert.equal(proof.logger.incomingEcx, proof.returnedRegisters.ecx);
  const zero = fixture(); zero.rows[1].registers.ecx = 0; zero.rows[1].context.writeUInt32LE(0, 172);
  zero.logger.registers.ecx = 0; zero.logger.context.writeUInt32LE(0, 172); zero.context.bindingObservations.logger.incomingEcx = 0;
  assert.equal(selectNativeRecoverySoundPlaybackCopySnapshots(zero.candidates, zero.context).returnedRegisters.ecx, 0);
});

test('new prefix observations independently reject source/phase/clock/thread tampering', () => {
  for (const mutate of [
    f => f.rows[0].captureWhen.address++, f => f.rows[0].captureWhen.actualBytesHex = '00'.repeat(8),
    f => f.rows[0].ranges.get('recovery-audio-playback-copy-source').bytes[0]++,
    f => f.rows[0].ranges.get('recovery-audio-playback-copy-phase').bytes.writeUInt32LE(3),
    f => f.rows[0].ranges.get('recovery-audio-clock').bytes.writeUInt32LE(229), f => f.rows[0].tid++,
  ]) {const f = fixture(); mutate(f); assert.throws(() => verifyNativeRecoverySoundObservationPredicate(f.rows[0], f.predicateContext, true), /prefix\/phase\/clock\/thread/);}
});

test('copy selection rejects substituted CRT ECX, private chains, changed bytes/tails and wrong allocation/ABI/order', () => {
  for (const mutate of [
    f => f.rows[1].registers.ecx++, f => f.rows[1].context.writeUInt32LE(0, 172), f => f.rows[1].context.writeUInt32LE(0, 168),
    f => {f.rows[1].registers.eax++; f.rows[1].context.writeUInt32LE(f.rows[1].registers.eax, 176);},
    f => {f.logger.registers.ecx = 0; f.logger.context.writeUInt32LE(0, 172); f.context.bindingObservations.logger.incomingEcx = 0;},
    f => f.context.bindingObservations.allocation.requestedBytes = 16,
    f => f.put(f.rows[0], f.esp + 8, 21), f => f.put(f.rows[1], f.esp - 4, f.context.actual(0x4053db)),
    f => f.put(f.rows[0], f.context.bindingObservations.layout.assignmentEntry, f.context.actual(0x4a2b9c)),
    f => f.rows[0].ranges.get('recovery-audio-playback-copy-destination').bytes[0] = 1,
    f => f.rows[1].ranges.get('recovery-audio-playback-copy-destination').bytes[0]++,
    f => f.rows[1].ranges.get('recovery-audio-playback-copy-destination').bytes[20] = 0,
    f => f.rows[1].ranges.get('recovery-audio-playback-copy-destination').bytes[31] = 0,
    f => f.rows[1].ranges.get('recovery-audio-playback-copy-source').bytes[8]++,
    f => f.rows[1].ranges.get('recovery-audio-playback-copy-string').bytes[16] = 20,
    f => f.rows[1].observedDebugEventOrdinal = 31, f => f.rows[1].registers.esp++,
    f => f.rows[1].registers.ebx++, f => f.candidates.splice(1, 1),
  ]) {const f = fixture(); mutate(f); assert.throws(() => selectNativeRecoverySoundPlaybackCopySnapshots(f.candidates, f.context));}
});

const retainedDirectory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v12-20261023';
const retainedAvailable = existsSync(`${retainedDirectory}/trace.jsonl`);

test('retained clean V12 binds actual memcpy return ECX to logger and rejects context/ABI/preimage/tail substitutions', {skip: !retainedAvailable}, async () => {
  const capture = await loadPhysicsCapture(retainedDirectory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${retainedDirectory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration); assert.equal(pairs.length, 1);
  const pair = pairs[0], proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration), copy = proof.playbackCopyObservations;
  const report = JSON.parse(await readFile('analysis/physics-native-controlled-recovery-sound-v12-20261023/report.json', 'utf8'));
  assert.equal(capture.complete.snapshots, 333); assert.equal(capture.complete.pendingFrameSelection.nestedSnapshots, 98);
  assert.equal(capture.complete.elapsedMs, 46456); assert.equal(copy.verified, true); assert.equal(copy.sourceReplayComplete, false);
  assert.equal(report.sourceReplayComplete, false); assert.deepEqual(copy, report.proof.playbackCopyObservations);
  assert.deepEqual(copy.arguments, [proof.bindingObservations.allocation.address, proof.bindingObservations.layout.formattedBuffer, 20]);
  assert.equal(copy.beforeRegisters.ecx, 3331866503);
  assert.deepEqual(copy.returnedRegisters, {eax: 278658336, ecx: 0, edx: 20});
  assert.equal(copy.logger.incomingEcx, 0); assert.equal(copy.logger.agreesWithObservedMemcpyReturn, true);
  assert.notEqual(copy.beforeRegisters.ecx, copy.returnedRegisters.ecx);
  assert.equal(copy.beforeHex, `00f0adba${'0df0adba'.repeat(7)}`);
  const before = Buffer.from(copy.beforeHex, 'hex'), after = Buffer.from(copy.afterHex, 'hex');
  assert.equal(after.subarray(0, 20).toString('ascii'), 'Playing SFX_PINKPURP');
  assert.deepEqual(after.subarray(20), before.subarray(20));
  assert.notEqual(after[20], 0, 'The post-CRT observation precedes the game terminator write.');
  const returned = capture.snapshots.find(row => row.ordinal === copy.returnOrdinal);
  assert.equal(returned.context.readUInt32LE(172), 0); assert.equal(returned.context.readUInt32LE(168), 20);
  assert.equal(returned.context.readUInt32LE(176), copy.arguments[0]);
  assert.equal(returned.contextSha256, copy.returnContextSha256);

  const corrupt = (ordinal, mutate) => {
    const original = capture.snapshots.find(row => row.ordinal === ordinal); assert.ok(original);
    const changed = {...original, registers: {...original.registers}, context: Buffer.from(original.context),
      ranges: new Map([...original.ranges].map(([id, part]) => [id, {...part, bytes: Buffer.from(part.bytes)}]))};
    mutate(changed);
    return {...capture, snapshots: capture.snapshots.map(row => row === original ? changed : row)};
  };
  const put = (row, address, value, width = 4) => {
    let count = 0;
    for (const part of row.ranges.values()) if (address >= Number(part.address) && address + width <= Number(part.address) + part.bytes.length) {
      if (width === 1) part.bytes[address - Number(part.address)] = value;
      else part.bytes.writeUInt32LE(value >>> 0, address - Number(part.address));
      count++;
    }
    assert.ok(count);
  };
  for (const [ordinal, mutate, expected] of [
    [copy.returnOrdinal, row => row.registers.ecx = 1, /ecx differs from its actual x86 context/],
    [copy.returnOrdinal, row => row.context.writeUInt32LE(1, 172), /ecx differs from its actual x86 context/],
    [copy.returnOrdinal, row => row.context.writeUInt32LE(21, 168), /edx differs from its actual x86 context/],
    [copy.returnOrdinal, row => {row.registers.ecx = 1; row.context.writeUInt32LE(1, 172);}, /logger ECX differs from its observed memcpy return/],
    [copy.logger.ordinal, row => {row.registers.ecx = copy.beforeRegisters.ecx; row.context.writeUInt32LE(copy.beforeRegisters.ecx, 172);}, /logger ECX differs from its observed memcpy return/],
    [copy.callOrdinal, row => put(row, copy.esp + 8, 21), /private ABI differs/],
    [copy.returnOrdinal, row => put(row, copy.esp - 4, pair.moduleBaseAddress + 0x53db), /CRT return address differs/],
    [copy.callOrdinal, row => put(row, copy.arguments[0], 1, 1), /allocation-to-growth preimage differs/],
    [copy.returnOrdinal, row => put(row, copy.arguments[0] + 20, 0, 1), /bytes\/tail preservation differs/],
    [copy.returnOrdinal, row => put(row, copy.arguments[0] + 31, 0, 1), /bytes\/tail preservation differs/],
    [copy.callOrdinal, row => put(row, copy.arguments[1] + 8, 0, 1), /source\/metadata preservation differs/],
  ]) assert.throws(() => selectNativeRecoverySoundSnapshots(corrupt(ordinal, mutate), pair, configuration), expected);
});

test('retained V12 raw CRT context and copied buffer blobs reject byte tampering by recorded hash', {skip: !retainedAvailable}, async () => {
  const records = (await readFile(`${retainedDirectory}/trace.jsonl`, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const report = JSON.parse(await readFile('analysis/physics-native-controlled-recovery-sound-v12-20261023/report.json', 'utf8'));
  const source = records.find(row => row.type === 'snapshot' && row.ordinal === report.proof.playbackCopyObservations.returnOrdinal);
  const originalContext = await readFile(path.join(retainedDirectory, source.contextFile));
  for (const name of ['context', 'recovery-audio-playback-copy-destination', 'recovery-audio-playback-copy-source']) {
    const tempRoot = path.resolve(tmpdir()), directory = await mkdtemp(path.join(tempRoot, 'rollcage-v12-copy-tamper-'));
    assert.equal(path.dirname(path.resolve(directory)), tempRoot);
    assert.ok(path.basename(directory).startsWith('rollcage-v12-copy-tamper-'));
    try {
      // Minimal negative loader fixtures retain original descriptor hashes and
      // genuine native blobs. They are not new original-process observations.
      const context = Buffer.from(originalContext), ranges = [];
      if (name === 'context') context[172] ^= 1;
      else {
        const part = source.ranges.find(row => row.id === name); assert.ok(part);
        const bytes = Buffer.from(await readFile(path.join(retainedDirectory, part.file))); bytes[0] ^= 1;
        await writeFile(path.join(directory, part.file), bytes); ranges.push(part);
      }
      await writeFile(path.join(directory, source.contextFile), context);
      const trace = [records[0], {...source, ordinal: 1, hit: 1, ranges}, {...records.find(row => row.type === 'complete'), snapshots: 1}];
      await writeFile(path.join(directory, 'trace.jsonl'), trace.map(row => JSON.stringify(row)).join('\n'));
      await assert.rejects(loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256}), /Capture blob hash differs/);
    } finally {await rm(directory, {recursive: true, force: true});}
  }
});
