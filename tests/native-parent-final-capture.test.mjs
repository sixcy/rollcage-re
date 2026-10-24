import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNativeParentFinalCaptureFixture} from './lib/native-parent-final-fixture.mjs';
import {verifyNativeParentFinalCaptureRecords} from '../tools/lib/native-parent-final-capture.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {bindCapturedNativeThreadEnvironment} from '../tools/lib/native-frame-sound.mjs';
const verify = f => verifyNativeParentFinalCaptureRecords(f.input);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const findMarker = (f, type) => f.records.find(r => r.type === type);
const rehash = row => {row.sha256 = sha(row.bytes);};
function stackWord(f, offset, value) {
  const row = f.final.ranges.find(r => r.id === 'frame-stack'); row.bytes.writeUInt32LE(value >>> 0, 64 + offset); rehash(row);
  const p = f.final.parentFinalReturn; p.stackBytesHex = row.bytes.subarray(48, 76).toString('hex');
  p.returnWordBytesHex = row.bytes.subarray(64, 68).toString('hex'); p.totalWordBytesHex = row.bytes.subarray(68, 72).toString('hex');
}
function rejected(changes) {
  for (const [index, change] of changes.entries()) {const f = createNativeParentFinalCaptureFixture(); change(f); assert.throws(() => verify(f), `Mutation ${index}`);}
}

test('constructed full final lifecycle authenticates both return arms, actual caller ABI and11inputgraphs acrossASLR', () => {
  for (const base of [0x400000, 0xea0000, 0x320000]) for (const returnValue of [0, 1]) {
    const f = createNativeParentFinalCaptureFixture({base, returnValue});
    const beforeHash = sha(Buffer.concat(f.snapshots.flatMap(s => [s.context, ...s.ranges.map(r => r.bytes)])));
    for (const s of [f.before, f.final]) assert.doesNotThrow(() => bindCapturedNativeThreadEnvironment(s, {memory: createCapturedMemory(s.ranges).memory}));
    const result = verify(f); assert.equal(result.verified, true); assert.equal(result.returnValue, returnValue);
    assert.equal(result.originalInputOnly, true); assert.equal(result.sourceResultSupplied, false); assert.equal(result.observations.length, 11);
    assert.deepEqual(result.inputs, {checkpoints: 11, lightBandBytes: 704, listenerWrappers: 11, listenerBytes: 880, managerObservations: 11, additionalBytes: 7392});
    assert.equal(f.final.context.readUInt32LE(196), f.U + 4); assert.equal(f.final.context.readUInt32LE(184), base + 0x50e38);
    assert.equal(beforeHash, sha(Buffer.concat(f.snapshots.flatMap(s => [s.context, ...s.ranges.map(r => r.bytes)]))), 'Observation verification does not initialize or modify game state.');
  }
});

test('native32-bit conditional counters wrap independently instead of copying a logicalclock into sampleclock', () => {
  const f = createNativeParentFinalCaptureFixture({returnValue: 1, clock: 0xffffffff, sampleCounter: 123456});
  assert.equal(verify(f).returnValue, 1);
  assert.equal(f.final.ranges.find(r => r.id === 'logical-clock').bytes.readUInt32LE(), 0);
  assert.equal(f.final.ranges.find(r => r.id === 'sample-clock').bytes.readUInt32LE(), 123457);
});

test('separately parsed trace records authenticate loaded annotations without relying on shared object identity', () => {
  for (const returnValue of [0, 1]) {
    const f = createNativeParentFinalCaptureFixture({base: 0xea0000, returnValue});
    //The real loader adds Buffer contexts/ranges to independently parsed raw
    //snapshot JSON. Raw trace dictionaries and loaded annotations are separate
    //objects even when every value and hash is identical.
    f.input.records = JSON.parse(JSON.stringify(f.records, (key, value) => key === 'context' || key === 'bytes' && value?.type === 'Buffer' ? undefined : value));
    const raw = f.input.records.find(r => r.type === 'parent-final-inputs-observed');
    assert.notEqual(raw, f.before.parentFinalInputs); assert.deepEqual(raw, f.before.parentFinalInputs);
    assert.equal(verify(f).returnValue, returnValue);
  }
});

test('final provenance rejects foreign threads/events, changed parent lineage and reordered snapshots', () => {
  rejected([
    f => {f.final.tid++;},
    f => {f.records.find(r => r.type === 'debug-event' && r.ordinal === 220).tid++;},
    f => {f.records.find(r => r.type === 'debug-event' && r.ordinal === 220).pid++;},
    f => {f.records.find(r => r.type === 'debug-event' && r.ordinal === 220).event = 2;},
    f => {f.final.parentFinalReturn.parentEntryEsp += 4;},
    f => {f.final.parentFinalReturn.parentClock++;},
    f => {f.final.parentFinalReturn.parentCaller++;},
    f => {f.before.context.writeUInt32LE(2, 168);},
    f => {[f.input.parent[2], f.input.parent[3]] = [f.input.parent[3], f.input.parent[2]];},
    f => {[f.input.capture.snapshots[20], f.input.capture.snapshots[21]] = [f.input.capture.snapshots[21], f.input.capture.snapshots[20]];},
    f => {const at = f.records.indexOf(f.final); f.records[at] = {...f.final, tid: 999};},
    f => {f.records.splice(f.records.indexOf(f.final), 0, {type: 'debug-event', ordinal: 221, event: 1, pid: 100, tid: 101});},
    f => {f.records.splice(f.records.indexOf(f.final.parentFinalReturn), 1);}
  ]);
});

test('activation must remain deferred until the selected entry and occur after captured input proofs before publication', () => {
  rejected([
    f => {f.records.splice(f.records.indexOf(findMarker(f, 'breakpoint-installation-deferred')), 1);},
    f => {findMarker(f, 'breakpoint-installation-deferred').address++;},
    f => {findMarker(f, 'breakpoint-installation-deferred').codeModified = true;},
    f => {findMarker(f, 'breakpoint-installation-deferred').capability = 'other';},
    f => {f.records.splice(f.records.indexOf(f.before.parentFinalReturnActivation), 1);},
    f => {delete f.before.parentFinalReturnActivation;},
    f => {f.before.parentFinalReturnActivation.id = 'other-site';},
    f => {f.before.parentFinalReturnActivation.address++;},
    f => {f.before.parentFinalReturnActivation.mainModuleBaseAddress++;},
    f => {f.before.parentFinalReturnActivation.afterSnapshotBytesCaptured = false;},
    f => {f.before.parentFinalReturnActivation.patchBytesHex = '9090';},
    f => {const p = f.before.parentFinalReturnActivation; f.records.splice(f.records.indexOf(p), 1); f.records.splice(f.records.indexOf(f.before.parentFinalInputs), 0, p);},
    f => {const p = findMarker(f, 'breakpoint-installation-deferred'); f.records.splice(f.records.indexOf(p), 1); f.records.push(p);},
    f => {f.final.parentFinalReturnActivation = f.before.parentFinalReturnActivation;}
  ]);
});

test('admission precedes final range resolution and binds raw restored registers, live caller, argument and stack words', () => {
  rejected([
    f => {f.final.context.writeUInt32LE(0, 156); f.final.parentFinalReturn.actualNonvolatile[0] = 0;},
    f => {f.final.parentFinalReturn.entryNonvolatile[1]++;},
    f => {f.final.context.writeUInt32LE(f.U + 8, 196);},
    f => {f.final.context.writeUInt32LE(f.base + 0x50e3a, 184);},
    f => {stackWord(f, 0, f.base + 0x50e3a);},
    f => {stackWord(f, 4, 2);},
    f => {stackWord(f, -16, 0);},
    f => {stackWord(f, -12, 0);},
    f => {f.final.parentFinalReturn.returnValue = 2; f.final.context.writeUInt32LE(2, 176);},
    f => {f.final.parentFinalReturn.stackAddress++;},
    f => {f.final.parentFinalReturn.beforeSnapshotRangeResolution = false;},
    f => {f.final.parentFinalReturn.observationPhase = 'pre-RET';},
    f => {const p = f.final.parentFinalReturn; f.records.splice(f.records.indexOf(p), 1); f.records.splice(f.records.indexOf(f.final.parentFinalInputs) + 1, 0, p);}
  ]);
});

test('independent counter increments, SEH restoration and numerical controls cannot be replaced by outcome metadata', () => {
  rejected([
    f => {const r = f.final.ranges.find(r => r.id === 'logical-clock'); r.bytes.writeUInt32LE(288); rehash(r);},
    f => {const r = f.final.ranges.find(r => r.id === 'sample-clock'); r.bytes.writeUInt32LE(289); rehash(r);},
    f => {f.final.threadEnvironment.sehWord++;},
    f => {f.final.context.writeUInt32LE(0x27f, 28); f.final.contextSha256 = sha(f.final.context);},
    f => {f.final.context.writeUInt32LE(0x3f80, 228); f.final.contextSha256 = sha(f.final.context);}
  ]);
  const f = createNativeParentFinalCaptureFixture({returnValue: 0}), r = f.final.ranges.find(r => r.id === 'logical-clock'); r.bytes.writeUInt32LE(289); rehash(r);
  assert.throws(() => verify(f), /conditional parent clock/);
});

test('input annotations/raw rows, finite completion counts and unknown final claims remain strict', () => {
  rejected([
    f => {f.input.capture.header.helperCapabilities = [];},
    f => {f.final.parentFinalInputs.lightBands.totalBytes++;},
    f => {const r = f.final.ranges.find(r => r.id === 'parent-final-listener-wrapper-0'); r.bytes[0] ^= 1;},
    f => {f.final.ranges.push({id: 'parent-final-guessed', source: 'parent-final-inputs', address: 0x41000000, length: 4, bytes: Buffer.alloc(4)});},
    f => {f.before.parentFinalInputs = {...f.before.parentFinalInputs, parentClock: 289};},
    f => {f.snapshots[0].parentFinalInputs = f.before.parentFinalInputs;},
    f => {f.records.push({type: 'parent-final-unknown'});},
    f => {f.records.push({...f.final.parentFinalReturn});},
    f => {f.input.capture.complete.parentFinalTick.returnValue = 0;},
    f => {f.input.capture.complete.parentFinalTick.inputs.listenerBytes += 12;},
    f => {f.input.capture.complete.parentFinalTick.inputs.managerObservations = 10;},
    f => {f.input.capture.complete.parentFinalTick.inputs.additionalBytes++;},
    f => {f.input.capture.complete.parentFinalTick.completed = false;}
  ]);
});

function addForeignSkip(f, change = () => {}) {
  const event = {type: 'debug-event', event: 1, ordinal: 215, pid: 100, tid: 999};
  const marker = {type: 'parent-final-return-skipped', pid: 100, tid: 999, ownerMainTid: 101, breakpointId: 'native-parent-return', observedDebugEventOrdinal: 215,
    reason: 'different-owned-thread', matchingHitAdvanced: false, snapshotCountAdvanced: false, originalInstructionSkipped: false};
  const at = f.records.findIndex(r => r.type === 'debug-event' && r.ordinal === 220); f.records.splice(at, 0, event, marker); change(marker, event);
}
test('foreign thread return hits are explicitly counter-neutral and cannot hide selected-thread admission', () => {
  const f = createNativeParentFinalCaptureFixture(); addForeignSkip(f); assert.equal(verify(f).verified, true);
  for (const change of [m => {m.tid = 101;}, m => {m.matchingHitAdvanced = true;}, m => {m.originalInstructionSkipped = true;},
    m => {m.reason = 'unproved';}, (m, e) => {e.pid++;}, (m, e) => {e.tid++;},
    (m, e) => {m.tid = 0; e.tid = 0;}, (m, e) => {delete m.tid; delete e.tid;}]) {
    const f = createNativeParentFinalCaptureFixture(); addForeignSkip(f, change); assert.throws(() => verify(f));
  }
  const duplicate = createNativeParentFinalCaptureFixture(); addForeignSkip(duplicate);
  duplicate.records.push({...findMarker(duplicate, 'parent-final-return-skipped')}); assert.throws(() => verify(duplicate));
});

test('absent final policy rejects naked endpoint, data, annotations, activation and terminal claims', () => {
  const clean = () => {
    const f = createNativeParentFinalCaptureFixture(); delete f.input.configuration.parentRttiObservation.finalTick;
    f.input.records = f.records.filter(r => !r.type.startsWith('parent-final-') && !(r.type === 'snapshot' && r.breakpointId === 'native-parent-return'));
    f.input.capture.snapshots = f.snapshots.filter(s => s.breakpointId !== 'native-parent-return'); delete f.input.capture.complete.parentFinalTick;
    for (const s of f.input.capture.snapshots) {delete s.parentFinalInputs; delete s.parentFinalReturn; delete s.parentFinalReturnActivation; s.ranges = s.ranges.filter(r => r.source !== 'parent-final-inputs');}
    return f;
  };
  assert.equal(verify(clean()), undefined);
  for (const change of [f => f.input.capture.snapshots.push({breakpointId: 'native-parent-return', ranges: []}),
    f => {f.before.parentFinalReturnActivation = {};}, f => {f.before.parentFinalInputs = {};}, f => {f.input.capture.complete.parentFinalTick = {};},
    f => f.input.records.push({type: 'parent-final-return-skipped'})]) {
    const f = clean(); change(f); assert.throws(() => verify(f));
  }
});
