import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareNativeCaptureFixture, buildNativeCaptureFixture} from '../tools/prepare-native-capture-fixture.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {verifyNativeObservationActivation} from '../tools/lib/native-observation-activation.mjs';
import {createNativeRecoverySoundCaptureConfig} from '../tools/prepare-native-recovery-sound-capture.mjs';
import {verifyNativeRecoverySoundCaptureConfiguration} from '../tools/lib/native-recovery-sound-selection.mjs';

const helper = fileURLToPath(new URL('../tools/native-physics-capture.ps1', import.meta.url));
const digest = data => createHash('sha256').update(data).digest('hex');
const run = (file, validate = false) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ConfigPath', file, ...(validate ? ['-ValidateOnly'] : []), '-Quiet'], {windowsHide: true, encoding: 'utf8', timeout: 60000});
async function save(directory, value, name) {const file = path.join(directory, `${name}.json`); value.outputDirectory = path.join(directory, `${name}-capture`); await writeFile(file, JSON.stringify(value)); return file;}
async function rows(directory) {return (await readFile(path.join(directory, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);}
async function cleanup(directory) {const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.match(path.basename(resolved), /^rollcage-observer-/); await rm(resolved, {recursive: true, force: true});}

async function pendingFixture(directory, changedSite = false) {
  const prepared = await prepareNativeCaptureFixture(path.join(directory, 'fixture'));
  const config = JSON.parse(await readFile(path.join(prepared.directory, 'pending-frame-config.json'), 'utf8'));
  let trigger = '0x1023';
  if (changedSite) {
    const bytes = await readFile(config.executablePath), tail = Buffer.from(bytes.subarray(0x21e, 0x239));
    bytes.fill(0, 0x21e, 0x240); Buffer.from('c6056110400090', 'hex').copy(bytes, 0x21e); tail.copy(bytes, 0x225);
    bytes.writeInt32LE(0x1040 - 0x102a, 0x226); bytes.writeInt32LE(0x1040 - 0x102f, 0x22b);
    config.executablePath = path.join(directory, 'synthetic-self-modifying-observer.exe'); await writeFile(config.executablePath, bytes); config.expectedSha256 = digest(bytes); trigger = '0x102a';
  }
  config.maxSnapshots = 6;
  config.breakpoints.push({id: 'activation-trigger', rva: trigger, ranges: [{id: 'counter', rva: '0x1100', length: 4}]},
    ...[['nested-compare', '0x1046'], ['nested-return', '0x1061']].map(([id, rva]) => ({id, rva, ranges: [{id: 'counter', rva: '0x1100', length: 4}]})));
  config.phaseActions = [{breakpointId: 'activation-trigger', hit: 1, writes: [{rva: '0x1100', expectedBytesHex: '01000000', bytesHex: '01000000'}]}];
  config.pendingFrameObserver.nestedBreakpointIds = ['nested-compare', 'nested-return']; config.pendingFrameObserver.maxNestedSnapshots = 2; config.pendingFrameObserver.nestedCaptureScope = 'frame-thread';
  config.observationActivation = {breakpointId: 'activation-trigger', rawHit: 1, observationBreakpointIds: ['nested-compare', 'nested-return']};
  return config;
}

test('deferred services profile is explicit and preserves legacy preparation, input, bounds and raw caller guards', async () => {
  const options = {includeAllocations: true, includeVectorStorage: true, includeServiceSites: true};
  const legacy = (await createNativeRecoverySoundCaptureConfig('synthetic', 'unused', options)).configuration;
  const deferred = (await createNativeRecoverySoundCaptureConfig('synthetic', 'unused', {...options, deferObservationsUntilControlledCaller: true})).configuration;
  const {observationActivation, ...rest} = structuredClone(deferred); delete rest.pendingFrameObserver.nestedCaptureScope;
  assert.deepEqual(rest, legacy);
  assert.equal(observationActivation.breakpointId, 'controlled-recovery-caller'); assert.equal(observationActivation.rawHit, 229);
  assert.deepEqual(observationActivation.observationBreakpointIds, deferred.pendingFrameObserver.nestedBreakpointIds);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(deferred).deferredObservationActivation, true);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(legacy).deferredObservationActivation, false);
  for (const edit of [c => {c.observationActivation.rawHit--;}, c => {c.observationActivation.observationBreakpointIds.pop();}, c => {delete c.pendingFrameObserver.nestedCaptureScope;}]) {
    const invalid = structuredClone(deferred); edit(invalid); assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration(invalid), /deferred observer policy/);
  }
});

test('host activation rejects missing guards, filters, unknown sites and inconsistent thread scopes without launching', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-observer-validation-'));
  try {
    const config = await pendingFixture(directory), good = run(await save(directory, config, 'good'), true);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    for (const [name, edit, pattern] of [
      ['scope', c => {c.pendingFrameObserver.nestedCaptureScope = 'guessed-thread';}, /nestedCaptureScope/],
      ['scope-missing', c => {delete c.pendingFrameObserver.nestedCaptureScope;}, /frame-thread/],
      ['trigger-unknown', c => {c.observationActivation.breakpointId = 'unknown';}, /guarded trigger/],
      ['zero-hit', c => {c.observationActivation.rawHit = 0;}, /guarded trigger/],
      ['no-action', c => {c.phaseActions = [];}, /nonempty declared guard/],
      ['wrong-hit', c => {c.phaseActions[0].hit = 2;}, /nonempty declared guard/],
      ['empty-action', c => {c.phaseActions[0].writes = [];}, /nonempty declared guard/],
      ['duplicate-action', c => {c.phaseActions.push(structuredClone(c.phaseActions[0]));}, /exactly one/],
      ['trigger-filter', c => {c.breakpoints[3].captureWhen = {range: {id: 'trigger-phase', rva: '0x1100', length: 4}, equalsBytesHex: '01000000'};}, /trigger must be unfiltered/],
      ['trigger-stop', c => {c.breakpoints[3].stopAfterHits = 1;}, /trigger must be unfiltered/],
      ['duplicate-sites', c => {c.observationActivation.observationBreakpointIds.push('nested-compare');}, /unique declared nested/],
      ['unknown-site', c => {c.observationActivation.observationBreakpointIds.push('unknown');}, /unique declared nested/],
      ['non-nested', c => {c.observationActivation.observationBreakpointIds.push('frame-before');}, /unique declared nested/],
    ]) {
      const value = structuredClone(config); edit(value); const result = run(await save(directory, value, name), true);
      assert.notEqual(result.status, 0, name); assert.match(result.stdout + result.stderr, pattern, name); await assert.rejects(access(value.outputDirectory));
    }
  } finally {await cleanup(directory);}
});

function pair(capture) {return {before: capture.snapshots.find(row => row.breakpointId === 'frame-before'), after: capture.snapshots.find(row => row.breakpointId === 'frame-after'), moduleBaseAddress: 0x400000};}

test('actual guarded activation leaves earlier nested instructions unpatched and proves every host ordering edge', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-observer-order-'));
  try {
    const config = await pendingFixture(directory), result = run(await save(directory, config, 'ordered'));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const raw = await rows(config.outputDirectory), capture = await loadPhysicsCapture(config.outputDirectory), selected = pair(capture);
    const proof = verifyNativeObservationActivation(capture, selected, config);
    assert.equal(proof.activatedSiteCount, 2); assert.equal(proof.nestedSnapshots, 2); assert.equal(proof.successfulGuards, 1);
    for (const id of config.observationActivation.observationBreakpointIds) {
      const nested = capture.snapshots.find(row => row.breakpointId === id);
      assert.equal(nested.rawHit, 1, 'The earlier native call at this site executed without an INT3 trap.');
      assert.equal(nested.hit, 1); assert.equal(nested.pendingFrame.role, 'nested');
    }
    assert.equal(raw.filter(row => row.type === 'pending-frame-discarded').length, 1);
    for (const mutate of [
      c => {c.observationActivationRecords = [];},
      c => {c.observationActivationRecords.find(row => row.type === 'breakpoint-activated').rawHitBefore = 1;},
      c => {c.observationActivationRecords.find(row => row.type === 'breakpoint-activated').activationTid++;},
      c => {c.observationActivationRecords.find(row => row.type === 'observation-activation-complete').guardActionCompleted = false;},
      c => {c.observationActivationRecords.find(row => row.type === 'intervention').replacementBytesHex = '00000000';},
      c => {c.observationActivationRecords.find(row => row.type === 'intervention').address = '0x401104';},
      c => {c.observationActivationRecords.find(row => row.type === 'breakpoint-installed').id = 'nested-compare';},
      c => {c.snapshots.find(row => row.breakpointId === 'nested-compare').tid++;},
    ]) {
      const changed = structuredClone(capture); mutate(changed); assert.throws(() => verifyNativeObservationActivation(changed, pair(changed), config), /activation|outside|Observation/i);
    }
  } finally {await cleanup(directory);}
});

test('failed guards never arm observations and partial activation restores only debugger-owned patches', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-observer-failures-'));
  try {
    for (const partial of [false, true]) {
      const sub = path.join(directory, partial ? 'partial' : 'guard'); await mkdir(sub);
      const config = await pendingFixture(sub, partial);
      if (!partial) config.phaseActions[0].writes[0].expectedBytesHex = '02000000';
      const result = run(await save(sub, config, 'capture'));
      assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, partial ? /code changed before guarded activation/ : /original-byte mismatch/);
      const raw = await rows(config.outputDirectory);
      assert.equal(raw.filter(row => row.type === 'breakpoint-activated').length, partial ? 1 : 0);
      assert.equal(raw.filter(row => row.type === 'observation-activation-complete').length, 0);
      const restored = raw.filter(row => row.type === 'owned-breakpoint-restored');
      assert.equal(restored.some(row => row.breakpointId === 'nested-compare'), partial);
      assert.equal(restored.some(row => row.breakpointId === 'nested-return'), false, 'The helper must not restore code it never patched.');
      assert.ok(restored.every(row => row.readbackVerified && row.restoredBytesHex === row.originalBytesHex));
      assert.equal(raw.find(row => row.type === 'owned-process-cleanup').terminated, true);
    }
  } finally {await cleanup(directory);}
});

function twoThreadFixture(count) {
  const bytes = Buffer.alloc(0xa00); buildNativeCaptureFixture().copy(bytes); bytes.fill(0, 0x200, 0x400);
  bytes.writeUInt32LE(0x800, 0x98 + 4); bytes.writeUInt32LE(0x800, 0x178 + 8); bytes.writeUInt32LE(0x800, 0x178 + 16);
  const code = [], labels = new Map(), fixups = [];
  const hex = value => code.push(...Buffer.from(value, 'hex')), word = value => {const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); code.push(...b);};
  const label = name => labels.set(name, code.length), absolute = name => {fixups.push({at: code.length, name, absolute: true, width: 4}); word(0);};
  const branch = (op, name, width = 1) => {hex(op); fixups.push({at: code.length, name, width}); if (width === 4) word(0); else code.push(0);};
  const callImport = p => {hex('ff15'); word(p);};
  hex('6a006a006a0068'); absolute('background'); hex('6a006a00'); callImport(0x4012c4); hex('a3'); word(0x401618); hex('be'); word(0x401600);
  label('ready-spin'); hex('833d'); word(0x401614); hex('01'); branch('75', 'ready-spin');
  label('activation-trigger'); hex('90'); branch('e8', 'frame-before', 4);
  hex('6affff35'); word(0x401618); callImport(0x4012c8); hex('ff35'); word(0x401618); callImport(0x4012cc); hex('6a00'); callImport(0x4012c0); hex('cc');
  label('frame-before'); hex('9031ff'); label('main-loop'); hex('47893d'); word(0x40160c);
  label('served-spin'); hex('393d'); word(0x401610); branch('72', 'served-spin'); branch('e8', 'nested-site', 4); hex('81ff'); word(count); branch('72', 'main-loop');
  hex('83ec18b9'); word(0x401700); branch('e8', 'dispatch', 4); label('dispatch-return'); hex('83c418'); label('frame-after'); hex('90c3');
  label('background'); hex('be'); word(0x401604); hex('b9'); word(count);
  label('pre-loop'); branch('e8', 'nested-site', 4); branch('e2', 'pre-loop'); hex('c705'); word(0x401614); word(1);
  label('activation-spin'); hex('833d'); word(0x401608); hex('01'); branch('75', 'activation-spin'); hex('31ff'); label('background-loop'); hex('47');
  label('request-spin'); hex('393d'); word(0x40160c); branch('72', 'request-spin'); branch('e8', 'nested-site', 4); hex('893d'); word(0x401610); hex('81ff'); word(count); branch('72', 'background-loop'); hex('31c0c20400');
  label('nested-site'); hex('ff06c3'); label('dispatch'); hex('90c3');
  const assembled = Buffer.from(code);
  for (const f of fixups) {const value = f.absolute ? 0x401000 + labels.get(f.name) : labels.get(f.name) - f.at - f.width; if (f.width === 1) {assert.ok(value >= -128 && value <= 127); assembled.writeInt8(value, f.at);} else assembled.writeUInt32LE(value >>> 0, f.at);}
  assert.ok(assembled.length < 0x200); assembled.copy(bytes, 0x200);
  bytes.writeUInt32LE(0x12a0, 0x400); bytes.writeUInt32LE(0x12c0, 0x410); bytes.writeUInt32LE(0x12c0, 0x98 + 192); bytes.writeUInt32LE(20, 0x98 + 196);
  for (const [index, [rva, name]] of [[0x12e0, 'ExitProcess'], [0x12f0, 'CreateThread'], [0x1300, 'WaitForSingleObject'], [0x1320, 'CloseHandle']].entries()) {bytes.writeUInt32LE(rva, 0x4a0 + index * 4); bytes.writeUInt32LE(rva, 0x4c0 + index * 4); bytes.writeUInt16LE(0, rva - 0xe00); bytes.write(`${name}\0`, rva - 0xe00 + 2);}
  bytes.writeUInt32LE(0x401700, 0x820); bytes.writeUInt32LE(1, 0x824);
  return {bytes, rva: name => `0x${(0x1000 + labels.get(name)).toString(16)}`};
}

test('two owned native threads keep preactivation calls untrapped and background calls out of the pending snapshot budget', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-observer-threads-'));
  try {
    const count = 8, fixture = twoThreadFixture(count), executablePath = path.join(directory, 'two-thread-observer.exe'); await writeFile(executablePath, fixture.bytes);
    const range = {id: 'state', rva: '0x1600', length: 40};
    const config = {schemaVersion: 1, executablePath, workingDirectory: directory, arguments: [], expectedSha256: digest(fixture.bytes), outputDirectory: '', maxDurationMs: 10000, maxEvents: 10000, maxSnapshots: count + 4, showWindow: false,
      breakpoints: ['frame-before', 'frame-after', 'dispatch', 'activation-trigger', 'nested-site'].map(id => ({id, rva: fixture.rva(id), ranges: [range], ...(id === 'frame-after' ? {stopAfterHits: 1} : {})})),
      phaseActions: [{breakpointId: 'activation-trigger', hit: 1, writes: [{rva: '0x1614', expectedBytesHex: '01000000', bytesHex: '01000000'}, {rva: '0x1608', expectedBytesHex: '00000000', bytesHex: '01000000'}]}],
      pendingFrameObserver: {beforeBreakpointId: 'frame-before', afterBreakpointId: 'frame-after', eventBreakpointId: 'dispatch', maxPendingBytes: 65536, maxCandidateFrames: 1, maxEventSnapshots: 1, eventStackOffset: -28, eventReturnRva: fixture.rva('dispatch-return'), eventPointerRegister: 'ecx', eventRecordBytes: 104, eventPoolRoot: {id: 'pool', rva: '0x1620', length: 4}, eventPoolCapacity: {id: 'capacity', rva: '0x1624', length: 4}, nestedBreakpointIds: ['nested-site'], maxNestedSnapshots: count, nestedCaptureScope: 'frame-thread'},
      observationActivation: {breakpointId: 'activation-trigger', rawHit: 1, observationBreakpointIds: ['nested-site']}};
    const result = run(await save(directory, config, 'capture'));
    if (result.status !== 0) {
      let trace = [], traceReadError;
      try {trace = await rows(config.outputDirectory);} catch (error) {traceReadError = String(error);}
      const report = {method: 'Supported owned activation fixture failure; no original game execution.', exitStatus: result.status,
        stdout: result.stdout, stderr: result.stderr, traceReadError,
        lifecycle: trace.filter(row => row.type === 'owned-thread-lifecycle'), tail: trace.slice(-12)};
      const evidencePath = path.resolve('analysis', `native-observer-thread-failure-${Date.now()}.json`);
      await writeFile(evidencePath, JSON.stringify(report, null, 2), {flag: 'wx'});
      assert.equal(result.status, 0, `${result.stdout}${result.stderr}\nRetained lifecycle evidence: ${evidencePath}\n${JSON.stringify(report.lifecycle)}`);
    }
    const raw = await rows(config.outputDirectory), capture = await loadPhysicsCapture(config.outputDirectory), selected = pair(capture);
    assert.equal(verifyNativeObservationActivation(capture, selected, config).nestedSnapshots, count);
    const trigger = capture.snapshots[0].ranges.get('state').bytes, final = selected.after.ranges.get('state').bytes;
    assert.equal(trigger.readUInt32LE(4), count, 'Background preactivation INCs execute without observer traps.');
    assert.deepEqual([final.readUInt32LE(), final.readUInt32LE(4), final.readUInt32LE(12), final.readUInt32LE(16)], [count, count * 2, count, count]);
    const nested = capture.snapshots.filter(row => row.breakpointId === 'nested-site');
    assert.equal(nested.length, count); assert.ok(nested.every(row => row.tid === selected.before.tid));
    const skipped = raw.filter(row => row.type === 'observation-skipped' && row.reason === 'different-pending-frame-thread');
    assert.equal(skipped.length, count); assert.ok(skipped.every(row => row.tid !== selected.before.tid && !row.matchingHitAdvanced && !row.originalInstructionSkipped));
    assert.equal(raw.find(row => row.type === 'complete').pendingFrameSelection.nestedSnapshots, count);
    const copies = raw.filter(row => row.type === 'owned-debug-thread-handle');
    assert.equal(copies.length, raw.filter(row => row.type === 'debug-event' && [2, 3].includes(row.event)).length);
    assert.ok(copies.length >= 2);
    for (const copy of copies) {
      assert.notEqual(copy.sourceHandle, copy.trackingHandle); assert.equal(copy.sameAccess, true);
      assert.equal(copy.eventHandleOwnership, 'system-closes-on-exit-continuation'); assert.equal(copy.trackingHandleOwnership, 'debugger-copy');
    }
    for (const closed of raw.filter(row => row.type === 'owned-debug-thread-handle-closed')) {
      assert.equal(closed.eventHandleClosedByDebugger, false); assert.equal(closed.reason, 'actual-exit-thread-event');
      assert.ok(copies.some(copy => copy.tid === closed.tid && copy.trackingHandle === closed.trackingHandle));
    }
  } finally {await cleanup(directory);}
});
