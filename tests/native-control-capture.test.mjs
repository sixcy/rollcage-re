import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeControlCaptureConfig, nativeControlHeapInputRanges} from '../tools/prepare-native-control-capture.mjs';
import {pairNativeControlSnapshots, verifyNativeControlBoundaries} from '../tools/lib/native-control-capture.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

async function fixture() {
  const {configuration} = await createNativeControlCaptureConfig('synthetic', 'never-launched-control', {stackBytesBefore: 64, skipFrames: 2, includeAfterAiCheckpoint: false, guardedAudioChannels: false});
  const base = 0x700000, U = 0x200100, registers = {ebx: 1, ebp: 2, esi: 3, edi: 4, edx: 0, fpuControlWord: 0x7f, mxcsr: 0x1f80};
  const snapshots = ['native-control-before', 'native-control-after'].map((id, index) => {
    const esp = U - index * 20, stack = Buffer.alloc(96), session = Buffer.alloc(0x590), clock = Buffer.alloc(4);
    session[0x54d] = 6; session.writeUInt32LE(4, 0x57c); clock.writeUInt32LE(288);
    const put = (offset, value) => stack.writeUInt32LE(value, 64 + offset);
    if (!index) {put(0, base + 0x41234); put(4, 1);}
    else {
      put(0, base + 0x51017); put(4, registers.edi); put(8, registers.esi); put(12, registers.ebp); put(16, registers.ebx);
      put(20, base + 0x41234); put(24, 1);
    }
    return {breakpointId: id, ordinal: index + 4, tid: 80, hit: 1, matchingHit: 3, rawHit: 230,
      registers: {...registers, esp, eip: base + (index ? 0x749e0 : 0x50e50), ...(index ? {ebp: 0} : {})},
      captureWhen: {address: 0x30057c, actualBytesHex: '04000000', equalsBytesHex: '04000000'},
      ranges: new Map([
        ['frame-stack', {id: 'frame-stack', address: esp - 64, bytes: stack}],
        ['session', {id: 'session', address: 0x300000, bytes: session}],
        ['clock', {id: 'clock', address: base + 0x50a548, moduleBaseAddress: base, bytes: clock}],
        ['attachment-count', {id: 'attachment-count', address: base + 0x2e6ba0, bytes: Buffer.alloc(4)}],
      ])};
  });
  return {configuration, capture: {header: {executableSha256: REDUX_SHA256}, complete: {reason: 'snapshot-bound'}, snapshots}};
}

test('prephysics capture checks retained20-byte child stack relationship and preserves original frame policy', async () => {
  assert.ok((await verifyNativeControlBoundaries()).evidenceIds.length);
  const f = await fixture(), result = pairNativeControlSnapshots(f.capture, f.configuration), pair = result.pairs[0];
  assert.equal(result.frames, 1); assert.equal(result.skipFrames, 2);
  assert.equal(pair.after.registers.esp, pair.before.registers.esp - 20);
  assert.equal(pair.logicalClock, 288); assert.equal(pair.iteration, 0); assert.equal(pair.totalIterations, 1);
  assert.equal(result.options.stackBytesAfter, 32);
  assert.equal(f.configuration.maxDurationMs, 90000); assert.equal(f.configuration.maxSnapshots, 5);
  assert.ok(!f.configuration.pendingFrameObserver);
  const ranges = nativeControlHeapInputRanges();
  assert.equal(ranges.filter(row => row.id.endsWith('-source')).length, 36);
  assert.equal(ranges.filter(row => row.id.endsWith('-effect')).length, 36);
  assert.ok(ranges.filter(row => row.dereferenceMinimumValues).every(row => row.dereferenceMinimumValues.every((value, index) => value === (index ? 1 : 257))));
  assert.ok(ranges.filter(row => row.readableRegion).every(row => row.maxRegionBytes === 16 * 1024 * 1024));
});

test('prephysics pairing rejects wrong clocks, saved registers, caller arguments, threads and missing endpoints', async () => {
  for (const corrupt of [
    f => {f.capture.snapshots[1].ranges.get('clock').bytes.writeUInt32LE(289);},
    f => {f.capture.snapshots[1].ranges.get('frame-stack').bytes.writeUInt32LE(77, 68);},
    f => {f.capture.snapshots[1].ranges.get('frame-stack').bytes.writeUInt32LE(0, 64);},
    f => {f.capture.snapshots[1].ranges.get('frame-stack').bytes.writeUInt32LE(2, 88);},
    f => {f.capture.snapshots[1].registers.ebp = 4;},
    f => {f.capture.snapshots[1].registers.fpuControlWord = 0x27f;},
    f => {f.capture.snapshots[1].tid++;},
    f => {f.capture.snapshots[1].matchingHit++;},
    f => {f.capture.snapshots.pop();},
    f => {f.configuration.phaseActions.push({breakpointId: 'native-control-before', writes: []});},
    f => {f.configuration.breakpoints.find(row => row.id === 'native-control-after').rva = '0x74b1e';},
    f => {f.configuration.breakpoints.find(row => row.id === 'native-control-before').ranges.find(row => row.id === 'frame-stack').length--;},
    f => {f.capture.header.executableSha256 = '0'.repeat(64);},
  ]) {
    const f = await fixture(); corrupt(f);
    assert.throws(() => pairNativeControlSnapshots(f.capture, f.configuration));
  }
});

async function checkpointFixture() {
  const f = await fixture();
  f.configuration = (await createNativeControlCaptureConfig('synthetic', 'never-launched-control', {stackBytesBefore: 64, skipFrames: 2, guardedAudioChannels: false})).configuration;
  const before = f.capture.snapshots[0], after = f.capture.snapshots[1]; after.ordinal = 6;
  const stack = Buffer.alloc(96), put = (offset, value) => stack.writeUInt32LE(value, 64 + offset);
  for (const [offset, register] of [[0, 'edi'], [4, 'esi'], [8, 'ebp'], [12, 'ebx']]) put(offset, before.registers[register]);
  put(16, 0x741234); put(20, 1);
  const mid = {...before, breakpointId: 'native-control-after-ai', ordinal: 5,
    registers: {...before.registers, esp: before.registers.esp - 16, eip: 0x750f18, ebp: 0},
    ranges: new Map(before.ranges)};
  mid.ranges.set('frame-stack', {id: 'frame-stack', address: mid.registers.esp - 64, bytes: stack});
  f.capture.snapshots.splice(1, 0, mid);
  return f;
}

test('AI checkpoint has its own exact pre-audio boundary and cannot replace or cross the full prefix endpoints', async () => {
  const f = await checkpointFixture(), paired = pairNativeControlSnapshots(f.capture, f.configuration);
  assert.equal(f.configuration.maxSnapshots, 6);
  assert.equal(paired.afterAiCheckpoint, true);
  assert.equal(paired.pairs[0].checkpoints.afterAi.breakpointId, 'native-control-after-ai');
  assert.equal(paired.pairs[0].after.breakpointId, 'native-control-after');
  for (const corrupt of [
    f => {f.capture.snapshots[1].registers.esp--;},
    f => {f.capture.snapshots[1].ordinal = f.capture.snapshots[2].ordinal;},
    f => {f.capture.snapshots[1].ranges.get('frame-stack').bytes.writeUInt32LE(0, 80);},
    f => {f.capture.snapshots.splice(1, 1);},
    f => {f.configuration.breakpoints = f.configuration.breakpoints.filter(row => row.id !== 'native-control-after-ai');},
  ]) {
    const broken = await checkpointFixture(); corrupt(broken);
    assert.throws(() => pairNativeControlSnapshots(broken.capture, broken.configuration));
  }
});

test('control pairer checks actual guard metadata against its declared configuration', async () => {
  const f = await fixture();
  f.capture.snapshots[0].ranges.set('undeclared-guard', {id: 'undeclared-guard', address: 0, bytes: Buffer.alloc(0), rangeMode: 'guarded-pointer'});
  assert.throws(() => pairNativeControlSnapshots(f.capture, f.configuration), /[Gg]uarded/);
});

async function physicsExitFixture() {
  const f = await fixture();
  f.configuration = (await createNativeControlCaptureConfig('synthetic', 'never-launched-control', {
    stackBytesBefore: 64, skipFrames: 2, includeAfterAiCheckpoint: false, includePhysicsExit: true, guardedAudioChannels: false,
  })).configuration;
  const entry = f.capture.snapshots[1]; entry.registers.ecx = 123;
  const exit = {...entry, breakpointId: 'native-control-after-physics', ordinal: 6,
    registers: {...entry.registers, eip: 0x774b1e, eax: 0},
    ranges: new Map([...entry.ranges].map(([id, row]) => [id, {...row, bytes: Buffer.from(row.bytes)}]))};
  f.capture.snapshots.push(exit);
  return f;
}

test('optional physics exit preserves both real boundaries and terminates only after preRET', async () => {
  const f = await physicsExitFixture(), paired = pairNativeControlSnapshots(f.capture, f.configuration);
  assert.equal(paired.physicsExitCheckpoint, true);
  assert.equal(paired.pairs[0].after.breakpointId, 'native-control-after');
  assert.equal(paired.pairs[0].physicsAfter.breakpointId, 'native-control-after-physics');
  assert.equal(f.configuration.breakpoints.find(row => row.id === 'native-control-after').stopAfterHits, 0);
  assert.equal(f.configuration.breakpoints.find(row => row.id === 'native-control-after-physics').stopAfterHits, 1);
  assert.equal(f.configuration.maxSnapshots, 6);
  const all = await createNativeControlCaptureConfig('synthetic', 'never-launched-control', {includePhysicsExit: true});
  assert.equal(all.configuration.maxSnapshots, 7);
  assert.equal(all.physicsExitCheckpoint, true);
});

test('optional physics exit rejects altered return ABI, pairing and early stop policies', async () => {
  for (const corrupt of [
    f => {f.capture.snapshots.pop();},
    f => {f.capture.snapshots[2].registers.eax = 1;},
    f => {f.capture.snapshots[2].registers.ebx++;},
    f => {f.capture.snapshots[2].registers.ecx++;},
    f => {f.capture.snapshots[2].registers.mxcsr |= 0x8000;},
    f => {f.capture.snapshots[2].registers.esp++;},
    f => {f.capture.snapshots[2].tid++;},
    f => {f.capture.snapshots[2].ordinal = 5;},
    f => {f.capture.snapshots[2].ranges.get('clock').bytes.writeUInt32LE(289);},
    f => {f.capture.snapshots[2].ranges.get('frame-stack').bytes.writeUInt32LE(0, 64);},
    f => {f.configuration.breakpoints.find(row => row.id === 'native-control-after').stopAfterHits = 1;},
    f => {f.configuration.breakpoints.find(row => row.id === 'native-control-after-physics').rva = '0x74b1d';},
    f => {f.configuration.phaseActions.push({breakpointId: 'native-control-after-physics', writes: []});},
    f => {f.configuration.breakpoints = f.configuration.breakpoints.filter(row => row.id !== 'native-control-after-physics');},
  ]) {
    const f = await physicsExitFixture(); corrupt(f);
    assert.throws(() => pairNativeControlSnapshots(f.capture, f.configuration));
  }
  await assert.rejects(createNativeControlCaptureConfig('synthetic', 'never-launched-control', {includePhysicsExit: 1}), /must be boolean/);
});
