//Retained original-process bytes only. Never opens or launches a target.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export const cameraIdentityEvidenceFiles = Object.freeze([
  '3546-camera-producer-41634d-assembly.json',
  '1531-wheel-render-constructor-owner-assembly.json',
  '3556-camera-producer-47f2ea-assembly.json',
]);

export async function verifyNativeCameraIdentityProducers() {
  const evidence = await readInstructionEvidence(cameraIdentityEvidenceFiles, {directory: 'analysis/native-simulation/results'});
  if (evidence.evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Camera identity producer target SHA differs.');
  const listing = new Map(evidence.instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [
    [0x41618c, 'MOV', ['dword ptr [ESP + 0x8]', 'EDX']],
    [0x41620d, 'MOV', ['dword ptr [EBP]', 'ESI']],
    [0x41621b, 'MOV', ['dword ptr [ESI]', '0x804']],
    [0x41632a, 'MOV', ['EAX', 'dword ptr [ESP + 0x18]']],
    [0x41632e, 'MOV', ['dword ptr [EBP + 0x4]', 'EAX']],
    [0x416352, 'MOV', ['dword ptr [EAX + 0x164]', 'EBP']],
    [0x41cc74, 'MOV', ['EDX', '0x8c0b']],
    [0x41cd31, 'MOV', ['dword ptr [EBP + 0x6c]', 'EAX']],
    [0x41ce30, 'MOV', ['dword ptr [EAX + 0x164]', 'EBP']],
    [0x47f004, 'MOV', ['EBP', '0x909060']],
    [0x47f02e, 'MOV', ['dword ptr [ESI + 0x18]', 'EBP']],
    [0x47f031, 'CALL', ['0x00416180']],
  ]) {
    const row = listing.get(address);
    if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Native camera/wheel identity producer differs at0x${address.toString(16)}.`);
  }
  return evidence.evidence.map(row => ({id: row.evidence_id, targetSha256: row.subject.digest.sha256}));
}

function memoryOf(snapshot) {
  const ranges = [...snapshot.ranges.values()];
  const bases = new Set([snapshot.moduleBaseAddress, ...ranges.map(row => row.moduleBaseAddress)].filter(value => value !== undefined && value !== null).map(Number));
  if (bases.size !== 1 || !Number.isSafeInteger([...bases][0]) || [...bases][0] <= 0) throw Error('Camera identity requires one explicit observed module base.');
  const moduleBaseAddress = [...bases][0];
  //No preferred-address aliases or pointer rewriting: globals use explicit
  //ASLR translation and every pointer from a captured field stays native.
  return {memory: createCapturedMemory(ranges).memory, moduleBaseAddress, actual: preferred => moduleBaseAddress + preferred - 0x400000};
}

export function inspectNativeCameraBodyIdentity(snapshot, {expectedParticipants = 6} = {}) {
  if (!Number.isInteger(expectedParticipants) || expectedParticipants < 1 || expectedParticipants > 6) throw Error('Camera identity participant bound must be1..6.');
  const {memory: m, moduleBaseAddress, actual} = memoryOf(snapshot), ptr = address => m.readUInt32LE(address);
  const session = ptr(actual(0x5ecb1c)), participantCount = m[session + 0x54d];
  if (participantCount !== expectedParticipants) throw Error('Camera identity participant count differs from its declared scope.');
  const physicalCount = m.readUInt16LE(actual(0x902bc4)), physicalList = ptr(actual(0x902bc0));
  if (physicalCount > 96) throw Error('Camera identity physical list exceeds its observed native bound.');
  const physical = Array.from({length: physicalCount}, (_, index) => ptr(physicalList + index * 4));
  if (new Set(physical).size !== physical.length) throw Error('Camera identity physical list contains duplicate pointers.');
  const identities = new Map(), participants = [];
  function claim(address, identity) {
    if (!address || identities.has(address)) throw Error('Camera/participant/wheel body identities overlap or are null.');
    identities.set(address, identity);
  }
  for (let index = 0; index < participantCount; index++) {
    const recordAddress = actual(0x909300 + index * 0x30c), bodyAddress = ptr(recordAddress), controllerAddress = ptr(recordAddress + 0x18);
    if (controllerAddress !== actual(0x909060 + index * 0x4c)) throw Error('Participant camera controller differs from the native startup slot.');
    const cameraBodyAddress = ptr(controllerAddress), trackedBodyAddress = ptr(controllerAddress + 4);
    if (trackedBodyAddress !== bodyAddress || ptr(cameraBodyAddress + 0x164) !== controllerAddress) throw Error('Camera controller/body/tracked-participant pointer cycle differs.');
    const bodyFlags = ptr(bodyAddress), cameraFlags = ptr(cameraBodyAddress);
    if ((bodyFlags & 511) !== 3 || (cameraFlags & 511) !== 4) throw Error('Linked camera/participant body types differ from their producers.');
    if (!physical.includes(bodyAddress) || !physical.includes(cameraBodyAddress)) throw Error('Linked participant/camera body is absent from the captured physical list.');
    claim(bodyAddress, {role: 'participant-car-body', participantIndex: index});
    claim(cameraBodyAddress, {role: 'camera-body', participantIndex: index});
    const wheels = [];
    for (let wheelIndex = 0; wheelIndex < 4; wheelIndex++) {
      const record = bodyAddress + 0x324 + wheelIndex * 200, wheelBody = ptr(record + 0x6c), flags = ptr(wheelBody), backlink = ptr(wheelBody + 0x164);
      if (backlink !== record || (flags & 511) !== 11 || m[record + 0x9c] !== index || m[record + 0x9d] !== wheelIndex) throw Error('Wheel render body/record/participant pointer cycle differs.');
      claim(wheelBody, {role: 'wheel-render-body', participantIndex: index, wheelIndex});
      wheels.push({wheelIndex, recordAddress: record, bodyAddress: wheelBody, flags, backlink, inPhysicalList: physical.includes(wheelBody)});
    }
    participants.push({index, recordAddress, bodyAddress, bodyFlags, controllerAddress, cameraBodyAddress, cameraFlags,
      cameraBodyControllerBacklink: ptr(cameraBodyAddress + 0x164), trackedBodyAddress, wheels});
  }
  const physicalBodies = physical.map(address => ({address, flags: ptr(address), type: ptr(address) & 511,
    ...(identities.get(address) ?? {role: 'unclassified-physical-body'})}));
  return {ordinal: snapshot.ordinal, breakpointId: snapshot.breakpointId, tid: snapshot.tid, moduleBaseAddress,
    logicalClock: ptr(actual(0x90a548)), participantCount, physicalCount, participants, physicalBodies,
    cameraBodies: participants.length, wheelRenderBodies: participants.reduce((sum, row) => sum + row.wheels.length, 0),
    wheelRenderBodiesInPhysicalList: participants.flatMap(row => row.wheels).filter(row => row.inPhysicalList).length,
    unclassifiedPhysicalType4: physicalBodies.filter(row => row.type === 4 && row.role !== 'camera-body').map(row => row.address)};
}

export function classifyVerifiedCameraIdentity(graph, address) {
  for (const participant of graph.participants) {
    if (address === participant.bodyAddress) return {address, role: 'participant-car-body', participantIndex: participant.index};
    if (address === participant.cameraBodyAddress) return {address, role: 'camera-body', participantIndex: participant.index, controllerAddress: participant.controllerAddress, trackedBodyAddress: participant.trackedBodyAddress};
    const wheel = participant.wheels.find(row => row.bodyAddress === address);
    if (wheel) return {address, role: 'wheel-render-body', participantIndex: participant.index, wheelIndex: wheel.wheelIndex, recordAddress: wheel.recordAddress};
  }
  return {address, role: address ? 'outside-verified-participant-camera-wheel-graph' : 'null'};
}

function stableIdentity(graph) {
  return graph.participants.map(row => [row.bodyAddress, row.controllerAddress, row.cameraBodyAddress, row.trackedBodyAddress, ...row.wheels.map(wheel => wheel.bodyAddress)]);
}

export function auditNativeCameraCapture(capture, {expectedParticipants = 6} = {}) {
  if (capture.header.executableSha256 !== REDUX_SHA256 || capture.complete?.reason !== 'snapshot-bound') throw Error('Camera identity requires a successful bounded original Redux capture.');
  const frames = capture.snapshots.filter(row => ['native-frame-before', 'native-frame-after'].includes(row.breakpointId)).map(row => inspectNativeCameraBodyIdentity(row, {expectedParticipants}));
  const observations = [];
  if (frames.length) {
    const before = frames[0];
    if (frames.some(row => row.moduleBaseAddress !== before.moduleBaseAddress || row.tid !== before.tid || JSON.stringify(stableIdentity(row)) !== JSON.stringify(stableIdentity(before)))) throw Error('Captured frame camera/participant/wheel allocation identities changed.');
    for (const snapshot of capture.snapshots) {
      if (!['native-dispatch-entry', 'native-force-entry'].includes(snapshot.breakpointId)) continue;
      const {memory: m, moduleBaseAddress, actual} = memoryOf(snapshot);
      if (snapshot.tid !== before.tid || moduleBaseAddress !== before.moduleBaseAddress) throw Error('Identity observer thread/module differs from the retained frame.');
      if (snapshot.breakpointId === 'native-dispatch-entry') {
        const event = snapshot.ranges.get('dispatch-event'), address = Number(snapshot.registers.ecx);
        if (Number(snapshot.registers.eip) !== actual(0x474bb0) || Number(event?.address) !== address || event.bytes.length !== 104) throw Error('Dispatch identity observer boundary or record differs.');
        observations.push({ordinal: snapshot.ordinal, breakpointId: snapshot.breakpointId, eventAddress: address, kind: event.bytes.readInt32LE(),
          object1: classifyVerifiedCameraIdentity(before, event.bytes.readUInt32LE(4)), object2: classifyVerifiedCameraIdentity(before, event.bytes.readUInt32LE(8))});
      } else {
        const address = Number(snapshot.registers.ecx), body = snapshot.ranges.get('force-body-header'), identity = classifyVerifiedCameraIdentity(before, address);
        if (Number(snapshot.registers.eip) !== actual(0x47b020) || Number(body?.address) !== address || body.bytes.length < 0x168) throw Error('Force identity observer boundary or body differs.');
        if (identity.role === 'camera-body' && m.readUInt32LE(address + 0x164) !== identity.controllerAddress) throw Error('Force call camera-controller backlink differs.');
        observations.push({ordinal: snapshot.ordinal, breakpointId: snapshot.breakpointId, ...identity, flags: body.bytes.readUInt32LE(), controllerBacklink: body.bytes.readUInt32LE(0x164)});
      }
    }
  }
  //The early standalone terrain captures deliberately retained only a384-byte
  //body header. Flags and its +164 word cannot prove the missing pointer cycle.
  const partialBodies = capture.snapshots.filter(row => row.breakpointId === 'terrain-before').map(row => {
    const body = row.ranges.get('body');
    if (!body || body.bytes.length < 0x168 || Number(body.address) !== Number(row.registers.ecx)) throw Error('Terrain identity body header differs.');
    return {ordinal: row.ordinal, hit: row.hit, bodyAddress: Number(body.address), flags: body.bytes.readUInt32LE(), type: body.bytes.readUInt32LE() & 511,
      body164: body.bytes.readUInt32LE(0x164), identity: 'not-proven-by-body-header-alone',
      missingProof: ['participant-record body/controller pointers', 'controller body/tracked-body words', 'four wheel-record/body pointer cycles']};
  });
  return {verifiedSnapshotCount: capture.snapshots.length, verifiedBlobCount: capture.snapshots.reduce((sum, row) => sum + row.ranges.size + 1, 0),
    frames, observations, partialBodies, scope: frames.length ? 'actual-pointer-cycles-in-hash-verified-frame-bytes' : 'hash-verified-body-headers-without-owner-graph'};
}

export async function auditNativeCameraCaptures(inputs, output) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 16) throw Error('Declare1..16 retained captures for the identity audit.');
  const evidence = await verifyNativeCameraIdentityProducers(), captures = [];
  for (const input of inputs) {
    const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
    captures.push({directory: path.resolve(input), ...auditNativeCameraCapture(capture)});
  }
  const report = {schemaVersion: 1, authority: 'retained-original-process-read-only-pointer-identity-audit', targetSha256: REDUX_SHA256, evidence, captures,
    limits: ['No original process or GUI was launched. Installed bytes and earlier reports were not changed.',
      'Identity comes from complete participant/controller/body and wheel-record cycles; flags alone never admit a camera or wheel.',
      'Standalone terrain headers lack the captured owner graph and remain explicitly unclassified.',
      'This corrects body labels; it does not change any earlier byte comparisons, prove audible playback, or establish whole-race fidelity.']};
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, ...inputs] = process.argv.slice(2);
  if (!output || !inputs.length) throw Error('Usage: node tools/audit-native-camera-body-identity.mjs NEW_REPORT_FILE RETAINED_CAPTURE_DIRECTORY [...]');
  const report = await auditNativeCameraCaptures(inputs, output);
  console.log(JSON.stringify({output, captures: report.captures.map(row => ({directory: row.directory, frames: row.frames.length, observations: row.observations.length, partialBodies: row.partialBodies.length}))}));
}
