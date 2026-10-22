import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, access, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createNativeFrameCaptureConfig, prepareNativeFrameCapture, verifyNativeFrameBoundaries, assertNativeFrameBoundaries, nativeFrameDependencyRanges} from '../tools/prepare-native-frame-capture.mjs';
import {pairNativeFrameSnapshots, compareNativeFramePair, checkNativeFrameReplay} from '../tools/check-native-frame-replay.mjs';
import {createReduxCaptureConfig} from '../tools/lib/redux-capture-config.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

test('whole-frame boundaries retain original caller, balanced ESP and real preRET', async () => {
  const evidence = await verifyNativeFrameBoundaries();
  assert.equal(evidence.evidenceIds.length, 2);
  const changed = structuredClone(evidence.instructions);
  changed.find(row => row.address === 0x474b1d).args[0] = 'EDX';
  assert.throws(() => assertNativeFrameBoundaries(changed), /boundary differs/);
  assert.throws(() => assertNativeFrameBoundaries(evidence.instructions.filter(row => row.address !== 0x451012)), /boundary differs/);
});

test('preparer retains hidden policies and gates both full-state boundaries without physics writes', async () => {
  const {configuration: config} = await createNativeFrameCaptureConfig('synthetic-isolated-root', 'new-whole-frame-capture', {frames: 2, stackBytesBefore: 4096});
  const original = createReduxCaptureConfig('synthetic-isolated-root', 'hidden-idle', 'new-whole-frame-capture');
  for (const name of ['phaseActions', 'hideOwnedWindows', 'foregroundWindowSource', 'denyRegistryWrites', 'denyChildProcesses', 'denyPlayerMailslot']) assert.deepEqual(config[name], original[name]);
  assert.equal(config.showWindow, false); assert.deepEqual(config.ranges, []);
  const entry = config.breakpoints.find(row => row.id === 'native-frame-before'), exit = config.breakpoints.find(row => row.id === 'native-frame-after');
  assert.equal(entry.rva, '0x749e0'); assert.equal(exit.rva, '0x74b1e'); assert.equal(exit.stopAfterHits, 2);
  assert.deepEqual(entry.ranges, exit.ranges); assert.deepEqual(entry.captureWhen, exit.captureWhen);
  assert.equal(entry.captureWhen.equalsBytesHex, '04000000');
  assert.equal(entry.skipMatchingHits, 0); assert.equal(exit.skipMatchingHits, 0);
  assert.equal(entry.ranges.find(row => row.id === 'participant-records').length, 6 * 0x30c);
  assert.equal(entry.ranges.find(row => row.id === 'attachment-queue').length, 1024);
  const dependencies = nativeFrameDependencyRanges();
  assert.ok(dependencies.every(row => row.readableRegion && row.maxRegionBytes === 64 * 1024 * 1024 && !row.length));
  assert.deepEqual(dependencies.find(row => row.id === 'spatial-nodes-region').dereferenceOffsets, ['0', '0x38']);
  assert.equal(new Set(entry.ranges.map(row => row.id)).size, entry.ranges.length);
  assert.ok(config.phaseActions.every(action => !action.breakpointId.startsWith('native-frame-')));
  await assert.rejects(createNativeFrameCaptureConfig('root', 'output'), /stack depth/);
  await assert.rejects(createNativeFrameCaptureConfig('root', 'output', {frames: 4, stackBytesBefore: 4096}), /bounded frames/);
  await assert.rejects(createNativeFrameCaptureConfig('root', 'output', {skipFrames: -1, stackBytesBefore: 4096}), /skipFrames/);
  assert.throws(() => nativeFrameDependencyRanges({maxRegionBytes: 64 * 1024 * 1024 + 1}), /region bound/);
});

test('configuration preparation refuses existing files/directories without creating capture output or launching', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rollcage-frame-preparer-'));
  try {
    const filename = path.join(temporary, 'config.json'), output = path.join(temporary, 'capture');
    const result = await prepareNativeFrameCapture(temporary, output, filename, {stackBytesBefore: 4096});
    assert.match(result.method, /no process launched/);
    await assert.rejects(access(output));
    const before = await readFile(filename);
    await assert.rejects(prepareNativeFrameCapture(temporary, output, filename, {stackBytesBefore: 4096}), /existing frame capture output/);
    assert.deepEqual(await readFile(filename), before);
    await mkdir(output);
    const other = path.join(temporary, 'other.json');
    await assert.rejects(prepareNativeFrameCapture(temporary, output, other, {stackBytesBefore: 4096}), /existing frame capture output/);
    await assert.rejects(access(other));
  } finally {await rm(temporary, {recursive: true, force: true});}
});

async function pairedFixture() {
  const {configuration} = await createNativeFrameCaptureConfig('fake-isolated-root', 'fake-output', {stackBytesBefore: 1024});
  const base = 0x6e0000, esp = 0x30000400, sessionAddress = 0x20000000, semanticAddress = 0x40000000;
  function snapshot(after) {
    const session = Buffer.alloc(0x590); session[0x54d] = 6; session.writeUInt32LE(4, 0x57c);
    const stack = Buffer.alloc(1028); stack.writeUInt32LE(base + 0x51017, 1024);
    return {ordinal: after ? 2 : 1, breakpointId: after ? 'native-frame-after' : 'native-frame-before', hit: 1, rawHit: 50, matchingHit: 1, tid: 1234, moduleBaseAddress: base,
      registers: {esp: `0x${esp.toString(16)}`, eip: `0x${(base + (after ? 0x74b1e : 0x749e0)).toString(16)}`, eax: '0x0'},
      captureWhen: {address: `0x${(sessionAddress + 0x57c).toString(16)}`, actualBytesHex: '04000000', equalsBytesHex: '04000000'},
      ranges: new Map([
        ['session', {id: 'session', address: sessionAddress, bytes: session, length: session.length}],
        ['frame-stack', {id: 'frame-stack', address: esp - 1024, bytes: stack, length: stack.length}],
        ['attachment-count', {id: 'attachment-count', address: base + 0x2e6ba0, bytes: Buffer.alloc(4), length: 4}],
        ['semantic', {id: 'semantic', address: semanticAddress, bytes: Buffer.alloc(16), length: 16}],
      ])};
  }
  const capture = {header: {executableSha256: REDUX_SHA256}, complete: {reason: 'snapshot-bound', snapshots: 2}, snapshots: [snapshot(false), snapshot(true)]};
  return {capture, configuration, semanticAddress};
}

test('pairing requires active proof, allsix participants and exact same-thread ESP/caller identity', async () => {
  const f = await pairedFixture(), result = pairNativeFrameSnapshots(f.capture, f.configuration);
  assert.equal(result.pairs.length, 1); assert.equal(result.pairs[0].returnAddress, 0x731017);
  assert.deepEqual(result.options, {stackBytesBefore: 1024, stackBytesAfter: 4, attachmentWindowBytes: 1024});
  for (const [edit, message] of [
    [g => {g.capture.header.executableSha256 = '0'.repeat(64);}, /target SHA/],
    [g => {g.capture.complete.reason = 'duration-bound';}, /return bound/],
    [g => {g.capture.snapshots[1].tid++;}, /same-thread/],
    [g => {g.capture.snapshots[1].registers.esp = '0x30000404';}, /stack region identity/],
    [g => {g.capture.snapshots[1].ranges.get('frame-stack').bytes.writeUInt32LE(0x1234, 1024);}, /caller return address/],
    [g => {g.capture.snapshots[0].ranges.get('session').bytes[0x54d] = 1;}, /six-participant/],
    [g => {g.capture.snapshots[1].ranges.get('session').bytes.writeUInt32LE(1, 0x57c);}, /phase4/],
    [g => {delete g.capture.snapshots[0].captureWhen;}, /predicate evidence/],
    [g => {g.capture.snapshots[1].ranges.get('attachment-count').bytes.writeInt32LE(257);}, /observation window/],
    [g => {g.configuration.phaseActions.push({breakpointId: 'native-frame-before', writes: []});}, /phase writes/],
    [g => {g.configuration.breakpoints.find(row => row.id === 'native-frame-before').captureWhen.equalsBytesHex = '01000000';}, /phase4 gate/],
  ]) {const g = await pairedFixture(); edit(g); assert.throws(() => pairNativeFrameSnapshots(g.capture, g.configuration), message);}
});

test('comparison checks complete declared bytes/native return and distinguishes readonly policy violations', async () => {
  const f = await pairedFixture(), pair = pairNativeFrameSnapshots(f.capture, f.configuration).pairs[0], bytes = Buffer.alloc(16);
  // Synthetic comparator contract only; this stub is not a physics replay.
  const replay = {span: (address, length) => {assert.equal(address, f.semanticAddress); return bytes.subarray(0, length);}, report: {nativeReturn: 0},
    manifest: {status: 'synthetic-comparator-test', observed: {participantCount: 6}, requiredRegions: [{id: 'semantic', address: f.semanticAddress, length: 16, comparison: 'read-only'}]}};
  assert.equal(compareNativeFramePair(pair, replay).matched, true);
  replay.report.unrelatedLiveObject = replay.report;
  assert.deepEqual(JSON.parse(JSON.stringify(compareNativeFramePair(pair, replay))).sourceReport, {nativeReturn: 0}, 'Reports never serialize cyclic live body/candidate objects.');
  pair.after.ranges.get('semantic').bytes[15] = 7; bytes[15] = 7;
  const changed = compareNativeFramePair(pair, replay);
  assert.equal(changed.matched, false); assert.equal(changed.firstDivergence.readOnlyDivergence.offset, 15);
  replay.manifest.requiredRegions[0].comparison = 'mutable';
  assert.equal(compareNativeFramePair(pair, replay).matched, true);
  bytes[0] = 9;
  assert.equal(compareNativeFramePair(pair, replay).firstDivergence.divergence.offset, 0);
  bytes[0] = 0; replay.report.nativeReturn = 5;
  assert.deepEqual(compareNativeFramePair(pair, replay).firstDivergence, {kind: 'return', nativeReturn: 0, sourceReturn: 5});
  replay.manifest.observed.participantCount = 1;
  assert.throws(() => compareNativeFramePair(pair, replay), /six-participant/);
});

test('matching-hit windows select later active frames and retain legacy zero-skip captures', async () => {
  const f = await pairedFixture();
  for (const breakpoint of f.configuration.breakpoints.filter(row => row.id.startsWith('native-frame-'))) breakpoint.skipMatchingHits = 17;
  for (const row of f.capture.snapshots) row.matchingHit = 18;
  const result = pairNativeFrameSnapshots(f.capture, f.configuration);
  assert.equal(result.skipFrames, 17); assert.equal(result.pairs[0].matchingHit, 18); assert.equal(result.pairs[0].before.hit, 1);
  f.capture.snapshots[1].matchingHit = 19;
  assert.throws(() => pairNativeFrameSnapshots(f.capture, f.configuration), /matching-hit proof/);
  f.capture.snapshots[1].matchingHit = 18;
  f.configuration.breakpoints.find(row => row.id === 'native-frame-after').skipMatchingHits = 16;
  assert.throws(() => pairNativeFrameSnapshots(f.capture, f.configuration), /skip windows differ/);
  const legacy = await pairedFixture();
  for (const breakpoint of legacy.configuration.breakpoints) delete breakpoint.skipMatchingHits;
  for (const row of legacy.capture.snapshots) delete row.matchingHit;
  assert.equal(pairNativeFrameSnapshots(legacy.capture, legacy.configuration).skipFrames, 0);
  const fresh = await pairedFixture(); delete fresh.capture.snapshots[0].matchingHit;
  assert.throws(() => pairNativeFrameSnapshots(fresh.capture, fresh.configuration), /matching-hit proof/);
});

test('pending frame pairing retains discarded candidate counters and requires final selection proof', async () => {
  async function pendingFixture() {
    const f = await pairedFixture();
    f.configuration.breakpoints.push({id: 'dispatch', rva: '0x74bb0'});
    f.configuration.pendingFrameObserver = {beforeBreakpointId: 'native-frame-before', afterBreakpointId: 'native-frame-after', eventBreakpointId: 'dispatch', maxCandidateFrames: 600, maxEventSnapshots: 64};
    for (const bp of f.configuration.breakpoints.filter(row => row.id.startsWith('native-frame-'))) bp.skipMatchingHits = 120;
    const proof = {candidateIndex: 7, frameTid: 1234, frameEntryEsp: '0x30000400', frameReturnAddress: '0x731017', frameMatchingHit: 127, observedEventHits: 3, qualifyingEventSnapshots: 3};
    for (const [index, row] of f.capture.snapshots.entries()) {
      row.rawHit = 200; row.matchingHit = 127; row.deferredPublication = true; row.observedElapsedMs = 30 + index; row.observedDebugEventOrdinal = 100 + index;
      row.pendingFrame = {...proof, role: index ? 'after' : 'before'};
    }
    f.capture.complete.pendingFrameSelection = {...proof};
    return f;
  }
  const f = await pendingFixture(), paired = pairNativeFrameSnapshots(f.capture, f.configuration);
  assert.equal(paired.pairs[0].matchingHit, 127); assert.equal(paired.pairs[0].before.hit, 1);
  for (const [edit, message] of [
    [g => {delete g.capture.complete.pendingFrameSelection;}, /terminal proof/],
    [g => {g.capture.complete.pendingFrameSelection.candidateIndex++;}, /selection proof differs/],
    [g => {g.capture.snapshots[1].pendingFrame.candidateIndex++;}, /matching-hit proof/],
    [g => {g.capture.snapshots[0].pendingFrame.frameTid++;}, /candidate\/ABI\/event proof/],
    [g => {g.capture.snapshots[1].pendingFrame.observedEventHits++;}, /selection proof differs/],
    [g => {g.capture.snapshots[0].pendingFrame.qualifyingEventSnapshots = 0;}, /candidate\/ABI\/event proof/],
    [g => {g.capture.snapshots[1].observedDebugEventOrdinal = 1;}, /observation order/],
    [g => {delete g.capture.snapshots[0].deferredPublication;}, /candidate\/ABI\/event proof/],
    [g => {delete g.configuration.pendingFrameObserver;}, /matching-hit proof/],
  ]) {const g = await pendingFixture(); edit(g); assert.throws(() => pairNativeFrameSnapshots(g.capture, g.configuration), message);}
});

test('checker retains unsupported synthetic replay failure in a fresh report without executing a target', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rollcage-frame-checker-'));
  try {
    const input = path.join(temporary, 'synthetic-capture'), output = path.join(temporary, 'report'); await mkdir(input);
    const f = await pairedFixture(), trace = [{type: 'capture', schemaVersion: 1, executableSha256: REDUX_SHA256, fixture: 'Synthetic pairing bytes; no target execution.'}];
    const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
    for (const snapshot of f.capture.snapshots) {
      const ranges = [];
      for (const range of snapshot.ranges.values()) {
        const file = `${snapshot.ordinal}-${range.id}.bin`; await writeFile(path.join(input, file), range.bytes, {flag: 'wx'});
        const {bytes, ...metadata} = range; ranges.push({...metadata, file, sha256: sha256(bytes)});
      }
      const context = Buffer.alloc(716), contextFile = `${snapshot.ordinal}-context.bin`; await writeFile(path.join(input, contextFile), context, {flag: 'wx'});
      trace.push({...snapshot, type: 'snapshot', ranges, contextFile, contextSha256: sha256(context)});
    }
    trace.push({type: 'complete', ...f.capture.complete});
    await writeFile(path.join(input, 'configuration.json'), JSON.stringify(f.configuration), {flag: 'wx'});
    await writeFile(path.join(input, 'trace.jsonl'), `${trace.map(row => JSON.stringify(row)).join('\n')}\n`, {flag: 'wx'});
    const {report} = await checkNativeFrameReplay(input, output);
    assert.equal(report.matched, false); assert.equal(report.cases.length, 1);
    assert.ok(report.cases[0].replayError, 'Incomplete synthetic numerical/native state never becomes a success.');
    const retained = await readFile(path.join(output, 'report.json'));
    assert.equal(JSON.parse(retained).matched, false);
    await assert.rejects(checkNativeFrameReplay(input, output), /EEXIST/);
    assert.deepEqual(await readFile(path.join(output, 'report.json')), retained);
  } finally {await rm(temporary, {recursive: true, force: true});}
});
