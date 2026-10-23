import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNativeCameraBodyIdentity, classifyVerifiedCameraIdentity, auditNativeCameraCapture, verifyNativeCameraIdentityProducers} from '../tools/audit-native-camera-body-identity.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

function fixture() {
  const base = 0x500000, actual = address => base + address - 0x400000, ranges = new Map();
  function add(id, address, length) {const row = {id, address, bytes: Buffer.alloc(length), moduleBaseAddress: base}; ranges.set(id, row); return row;}
  function put(address, value, width = 4) {
    const row = [...ranges.values()].find(row => address >= row.address && address + width <= row.address + row.bytes.length);
    if (!row) throw Error('Fixture address is outside declared bytes.');
    if (width === 4) row.bytes.writeUInt32LE(value >>> 0, address - row.address);
    else if (width === 2) row.bytes.writeUInt16LE(value, address - row.address);
    else row.bytes[address - row.address] = value;
  }
  const session = 0x20000000, list = 0x22000000, participants = [];
  add('session-root', actual(0x5ecb1c), 4); put(actual(0x5ecb1c), session);
  add('session', session, 0x590); put(session + 0x54d, 2, 1);
  add('clock', actual(0x90a548), 4); put(actual(0x90a548), 228);
  add('participant-records', actual(0x909300), 2 * 0x30c);
  add('controllers', actual(0x909060), 2 * 0x4c);
  add('physical-root', actual(0x902bc0), 6); put(actual(0x902bc0), list); put(actual(0x902bc4), 4, 2);
  add('physical-list', list, 16);
  for (let index = 0; index < 2; index++) {
    const body = 0x21000000 + index * 0x10000, camera = body + 0x4000, controller = actual(0x909060 + index * 0x4c), record = actual(0x909300 + index * 0x30c);
    add(`car-${index}`, body, 0x800); add(`camera-${index}`, camera, 0x180);
    put(record, body); put(record + 0x18, controller); put(body, 0x1c03);
    put(controller, camera); put(controller + 4, body); put(camera, 0x804); put(camera + 0x164, controller);
    put(list + index * 8, body); put(list + index * 8 + 4, camera);
    const wheels = [];
    for (let wheelIndex = 0; wheelIndex < 4; wheelIndex++) {
      const wheelRecord = body + 0x324 + wheelIndex * 200, wheel = body + 0x5000 + wheelIndex * 0x200;
      add(`wheel-${index}-${wheelIndex}`, wheel, 0x180); put(wheel, 0x8c0b); put(wheel + 0x164, wheelRecord);
      put(wheelRecord + 0x6c, wheel); put(wheelRecord + 0x9c, index, 1); put(wheelRecord + 0x9d, wheelIndex, 1);
      wheels.push({body: wheel, record: wheelRecord});
    }
    participants.push({body, camera, controller, record, wheels});
  }
  const snapshot = {ordinal: 1, breakpointId: 'native-frame-before', tid: 17, moduleBaseAddress: base, registers: {}, ranges};
  return {snapshot, put, add, base, actual, participants};
}

test('camera identity uses full native pointer cycles and distinguishes wheel render owners', () => {
  const f = fixture(), graph = inspectNativeCameraBodyIdentity(f.snapshot, {expectedParticipants: 2});
  assert.equal(graph.cameraBodies, 2); assert.equal(graph.wheelRenderBodies, 8); assert.equal(graph.wheelRenderBodiesInPhysicalList, 0);
  assert.deepEqual(graph.unclassifiedPhysicalType4, []);
  assert.deepEqual(classifyVerifiedCameraIdentity(graph, f.participants[1].camera), {address: f.participants[1].camera, role: 'camera-body', participantIndex: 1,
    controllerAddress: f.participants[1].controller, trackedBodyAddress: f.participants[1].body});
  assert.equal(classifyVerifiedCameraIdentity(graph, f.participants[0].wheels[2].body).role, 'wheel-render-body');
  //A matching flag elsewhere never confers camera identity.
  f.add('unrelated-type4', 0x23000000, 0x180); f.put(0x23000000, 0x804);
  f.add('larger-physical-list', 0x22000100, 20); f.put(f.actual(0x902bc0), 0x22000100); f.put(f.actual(0x902bc4), 5, 2);
  [...f.participants.flatMap(row => [row.body, row.camera]), 0x23000000].forEach((body, index) => f.put(0x22000100 + index * 4, body));
  const withUnrelated = inspectNativeCameraBodyIdentity(f.snapshot, {expectedParticipants: 2});
  assert.deepEqual(withUnrelated.unclassifiedPhysicalType4, [0x23000000]);
  assert.equal(classifyVerifiedCameraIdentity(withUnrelated, 0x23000000).role, 'outside-verified-participant-camera-wheel-graph');
});

test('native dispatch and force observations use verified pointer identity rather than type4 wheel labels', () => {
  const f = fixture(), selected = f.participants[1], address = 0x24000000;
  const event = f.add('dispatch-event', address, 104); event.bytes.writeInt32LE(1); event.bytes.writeUInt32LE(selected.camera, 4);
  const dispatch = {...f.snapshot, ordinal: 2, breakpointId: 'native-dispatch-entry', registers: {ecx: address, eip: f.actual(0x474bb0)}};
  const forceRanges = new Map(f.snapshot.ranges); forceRanges.set('force-body-header', {...forceRanges.get('camera-1'), id: 'force-body-header'});
  const force = {...f.snapshot, ordinal: 3, breakpointId: 'native-force-entry', registers: {ecx: selected.camera, eip: f.actual(0x47b020)}, ranges: forceRanges};
  const after = {...f.snapshot, ordinal: 4, breakpointId: 'native-frame-after'};
  const capture = {header: {executableSha256: REDUX_SHA256}, complete: {reason: 'snapshot-bound'}, snapshots: [f.snapshot, dispatch, force, after]};
  const report = auditNativeCameraCapture(capture, {expectedParticipants: 2});
  assert.equal(report.observations[0].object1.role, 'camera-body'); assert.equal(report.observations[0].object1.participantIndex, 1);
  assert.equal(report.observations[1].role, 'camera-body'); assert.equal(report.observations[1].controllerBacklink, selected.controller);
  assert.equal(report.observations.some(row => row.role === 'wheel-render-body' || row.object1?.role === 'wheel-render-body'), false);
  force.tid++;
  assert.throws(() => auditNativeCameraCapture(capture, {expectedParticipants: 2}), /thread\/module/);
});

test('camera/wheel audit rejects broken ownership, missing bytes, incorrect participant slots and conflicting ASLR', () => {
  for (const mutate of [
    f => f.put(f.participants[0].camera + 0x164, f.participants[1].controller),
    f => f.put(f.participants[0].controller + 4, f.participants[1].body),
    f => f.put(f.participants[0].record + 0x18, f.participants[1].controller),
    f => f.put(f.participants[0].wheels[0].body + 0x164, f.participants[0].wheels[1].record),
    f => f.put(f.participants[0].wheels[0].record + 0x6c, f.participants[0].camera),
    f => f.put(f.participants[0].wheels[0].record + 0x9d, 3, 1),
    f => f.snapshot.ranges.delete('controllers'),
    f => {f.snapshot.moduleBaseAddress += 0x10000;},
    f => f.put(f.actual(0x902bc4), 97, 2),
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => inspectNativeCameraBodyIdentity(f.snapshot, {expectedParticipants: 2}), /cycle|slot|types|Uncaptured|module base|physical list/);
  }
});

test('standalone type4 body headers remain unclassified without captured participant/controller links', () => {
  const body = Buffer.alloc(0x180); body.writeUInt32LE(0x804); body.writeUInt32LE(0x12345678, 0x164);
  const capture = {header: {executableSha256: REDUX_SHA256}, complete: {reason: 'snapshot-bound'}, snapshots: [{ordinal: 1, hit: 1,
    breakpointId: 'terrain-before', registers: {ecx: 0x20000000}, ranges: new Map([['body', {address: 0x20000000, bytes: body}]])}]};
  const report = auditNativeCameraCapture(capture);
  assert.equal(report.frames.length, 0); assert.equal(report.partialBodies[0].type, 4);
  assert.equal(report.partialBodies[0].identity, 'not-proven-by-body-header-alone');
  assert.equal(report.partialBodies[0].missingProof.length, 3);
});

test('retained camera, wheel and race-startup instructions prove their distinct ownership stores', async () => {
  const evidence = await verifyNativeCameraIdentityProducers();
  assert.equal(evidence.length, 3); assert.ok(evidence.every(row => row.targetSha256 === REDUX_SHA256 && /^ev_/.test(row.id)));
});
