import {createCapturedMemory} from './captured-memory.mjs';
import {selectObservedOwnedNativeThread} from './native-thread-observations.mjs';

export const nativeWorkerLookupSite = Object.freeze(['recovery-worker-mixer-entry', 0x4a79f0]);
export const ownedWorkerProofKeys = Object.freeze(['breakpointId', 'pid', 'tid', 'threadIdSourceAddress', 'actualThreadIdBytesHex', 'expectedTid', 'ownedLiveThread', 'pendingFrameActive', 'pendingFrameTid', 'candidateIndex', 'observationIndex', 'maxSnapshots', 'observedDebugEventOrdinal', 'beforeOriginalInstruction']);
export const ownedWorkerCallerProofKeys = Object.freeze(['entryReturnRva', 'entryReturnAddress', 'actualEntryReturnBytesHex', 'expectedEntryReturnAddress', 'entryReturnMatched', 'entryReturnReadBeforeSnapshotRanges']);
//Exact shipped read_bytes11714, not an answer copied from initialized heap output.
export const workerSourceVtableWords = Object.freeze([0x4ad8f0,0x4ad170,0x4ad730,0x4ad700,0x4ad6d0,0x4ad6a0,0x4ad680,0x4ad650,
  0x4ad5f0,0x4ad5e0,0x4ad320,0x4ad9e0,0x4ad5c0,0x4ad5b0,0x4ad580,0x4ad570,0x4ad540,0x4ad510,0x4ad500,0x4ad4c0,
  0x4ae4a0,0x4ae420,0x4ae350,0x4ad420,0x4ad410,0x4ad400,0x4ad3f0,0x4ad3e0,0x4ad3d0,0x4ad3c0,0x4ad3b0,0x4ad3a0,0x4ad390,0x4adb20]);
export function nativeOwnedWorkerObservationPolicy({entryReturnRva} = {}) {
  if (entryReturnRva !== undefined && !['0xb1304', '0xa7ca1'].includes(entryReturnRva)) throw Error('Unknown recovery worker caller return RVA.');
  return {breakpointId: nativeWorkerLookupSite[0], threadIdSource: {id: 'manager-worker-tid', rva: '0x314b08', dereferenceOffsets: ['0', '0x824'], offset: '0x24', length: 4}, maxSnapshots: 1,
    ...(entryReturnRva === undefined ? {} : {entryReturnRva})};
}
export function nativeWorkerLookupRanges(id, {includeWorkerSourceEvidence = false} = {}) {
  return id === nativeWorkerLookupSite[0] ? [
    {id: 'worker-lookup-entry', baseRegister: 'esp', length: 8},
    nativeOwnedWorkerObservationPolicy().threadIdSource,
    ...(includeWorkerSourceEvidence ? [{id: 'recovery-worker-source', baseRegister: 'esi', length: 0x9a8},
      {id: 'recovery-worker-source-vtable', baseRegister: 'esi', dereferenceOffsets: ['0'], length: 0x88}] : []),
  ] : [];
}
const positive = n => Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff;

// Preserve actual host admission plus its exception/frame/owner provenance.
// No snapshot counters or pending counts are projected to another policy.
export function collectOwnedWorkerObservationRecords(records) {
  const admitted = records.filter(row => row.type === 'owned-worker-observation-admitted');
  if (!admitted.length) return [];
  if (admitted.length !== 1) throw Error('Owned worker observation exceeds its one-shot admission bound.');
  const owners = records.flatMap((row, index) => row.type === 'owned-process' ? [{...row, traceRecordOrdinal: index + 1}] : []);
  if (owners.length !== 1 || !positive(owners[0].pid) || !positive(owners[0].tid)) throw Error('Owned worker admission lacks its process identity.');
  const owner = owners[0]; let debug = null, frame = null, callerGate = null;
  for (const [index, row] of records.entries()) {
    if (row.type === 'debug-event') debug = {...row, traceRecordOrdinal: index + 1};
    if (row.type === 'pending-frame-started') frame = {...row, traceRecordOrdinal: index + 1, observedDebugEventOrdinal: debug?.ordinal};
    if (row.type === 'pending-frame-discarded' || row.type === 'pending-frame-selected') frame = null;
    if (row.type === 'owned-worker-entry-return-checked') {
      if (!debug || debug.event !== 1 || debug.pid !== owner.pid || debug.tid !== row.tid || row.pid !== owner.pid || row.breakpointId !== nativeWorkerLookupSite[0] || row.observedDebugEventOrdinal !== debug.ordinal || !frame || frame.frameTid === row.tid || !['0xb1304','0xa7ca1'].includes(row.entryReturnRva) || !positive(Number(row.entryReturnAddress)) || !positive(Number(row.expectedEntryReturnAddress)) || !/^[0-9a-f]{8}$/.test(row.actualEntryReturnBytesHex ?? '') || typeof row.entryReturnMatched !== 'boolean' || row.entryReturnMatched !== (Buffer.from(row.actualEntryReturnBytesHex,'hex').readUInt32LE() === Number(row.expectedEntryReturnAddress)) || row.entryReturnReadBeforeSnapshotRanges !== true || row.matchingHitAdvanced !== false || row.counterMutation !== false || row.oneSnapshotConsumed !== false) throw Error('Owned worker caller-return check provenance differs.');
      callerGate = {...row, traceRecordOrdinal: index + 1};
    }
    if (row.type !== 'owned-worker-observation-admitted') continue;
    if (row.breakpointId !== nativeWorkerLookupSite[0] || !positive(debug?.ordinal) || !positive(row.candidateIndex) || !debug || debug.event !== 1 || debug.traceRecordOrdinal <= owner.traceRecordOrdinal || debug.pid !== owner.pid || debug.tid !== row.tid || row.pid !== owner.pid || row.observedDebugEventOrdinal !== debug.ordinal || !frame || frame.frameTid !== owner.tid || frame.frameTid !== row.pendingFrameTid || frame.candidateIndex !== row.candidateIndex || frame.traceRecordOrdinal >= debug.traceRecordOrdinal || frame.observedDebugEventOrdinal >= debug.ordinal || row.pendingFrameActive !== true || row.observationIndex !== 1 || row.maxSnapshots !== 1 || row.beforeOriginalInstruction !== true || row.ownedLiveThread !== true || !positive(row.tid) || row.tid === row.pendingFrameTid || row.expectedTid !== row.tid || !/^[0-9a-f]{8}$/.test(row.actualThreadIdBytesHex ?? '') || Buffer.from(row.actualThreadIdBytesHex, 'hex').readUInt32LE() !== row.tid || !positive(Number(row.threadIdSourceAddress))) throw Error('Owned worker admission exception/frame/thread provenance differs.');
    if (row.entryReturnRva !== undefined && (!callerGate || callerGate.entryReturnMatched !== true || callerGate.observedDebugEventOrdinal !== debug.ordinal || callerGate.tid !== row.tid || ownedWorkerCallerProofKeys.some(key => row[key] !== callerGate[key]))) throw Error('Owned worker admission lacks its actual preceding caller-return check.');
    return [{...row, traceRecordOrdinal: index + 1, ownerTraceRecordOrdinal: owner.traceRecordOrdinal, debugEventTraceRecordOrdinal: debug.traceRecordOrdinal,
      debugEventPid: debug.pid, debugEventTid: debug.tid, pendingFrameStartTraceRecordOrdinal: frame.traceRecordOrdinal,
      ...(row.entryReturnRva === undefined ? {} : {entryReturnCheckTraceRecordOrdinal: callerGate.traceRecordOrdinal})}];
  }
  return [];
}

export function verifyOwnedWorkerSnapshotAdmission(capture, row, pair, configuration) {
  const entryReturnRva = configuration.ownedWorkerObservation?.entryReturnRva;
  if (JSON.stringify(configuration.ownedWorkerObservation) !== JSON.stringify(nativeOwnedWorkerObservationPolicy({entryReturnRva}))) throw Error('Recovery owned worker observation policy differs.');
  if (!row) throw Error('Recovery worker actual snapshot is missing.');
  const all = capture.snapshots.filter(snapshot => snapshot.breakpointId === nativeWorkerLookupSite[0]);
  const records = capture.ownedWorkerObservationRecords;
  if (all.length !== 1 || all[0].ordinal !== row.ordinal || !Array.isArray(records) || records.length !== 1) throw Error('Recovery worker requires exactly one actual admitted snapshot.');
  const admission = records[0], proof = row.ownedWorkerObservation;
  if (!proof || proof.breakpointId !== nativeWorkerLookupSite[0] || proof.pendingFrameActive !== true || proof.ownedLiveThread !== true || proof.beforeOriginalInstruction !== true || proof.observationIndex !== 1 || proof.maxSnapshots !== 1 || !positive(proof.pid) || !positive(proof.tid) || ownedWorkerProofKeys.some(key => proof[key] !== admission[key]) || admission.debugEventPid !== proof.pid || admission.debugEventTid !== row.tid || !positive(admission.traceRecordOrdinal) || !positive(admission.debugEventTraceRecordOrdinal) || admission.debugEventTraceRecordOrdinal >= admission.traceRecordOrdinal || !positive(admission.pendingFrameStartTraceRecordOrdinal) || admission.pendingFrameStartTraceRecordOrdinal >= admission.debugEventTraceRecordOrdinal || row.tid === pair.before.tid || proof.tid !== row.tid || proof.expectedTid !== row.tid || proof.pendingFrameTid !== pair.before.tid || proof.candidateIndex !== pair.before.pendingFrame.candidateIndex || row.deferredPublication !== true || row.pendingFrame?.role !== 'worker-once' || row.pendingFrame.frameTid !== pair.before.tid || row.pendingFrame.candidateIndex !== pair.before.pendingFrame.candidateIndex || row.observedDebugEventOrdinal !== proof.observedDebugEventOrdinal || row.observedDebugEventOrdinal <= pair.before.observedDebugEventOrdinal || row.observedDebugEventOrdinal >= pair.after.observedDebugEventOrdinal) throw Error('Recovery worker snapshot admission/thread/pending-frame proof differs.');
  const association = selectObservedOwnedNativeThread(capture.nativeThreadRecords, row.tid, {atDebugEventOrdinal: row.observedDebugEventOrdinal});
  if (association.evidenceType !== 'owned-create-thread' || association.pid !== proof.pid || association.ownerTraceRecordOrdinal !== admission.ownerTraceRecordOrdinal || admission.ownerTraceRecordOrdinal >= admission.pendingFrameStartTraceRecordOrdinal) throw Error('Recovery worker requires its actual live owned CREATE_THREAD event.');
  const m = createCapturedMemory([...row.ranges.values()]).memory, actual = address => pair.moduleBaseAddress + address - 0x400000;
  const manager = m.readUInt32LE(actual(0x714b08)), worker = m.readUInt32LE(manager + 0x824), object = row.ranges.get('recovery-audio-worker-object');
  const source = row.ranges.get('manager-worker-tid'), table = row.ranges.get('recovery-audio-manager-vtable');
  if (!manager || !worker || !object || Number(object.address) !== worker || object.bytes.length !== 80 || !source || Number(source.address) !== worker + 0x24 || source.bytes.length !== 4 || source.bytes.readUInt32LE() !== row.tid || Number(proof.threadIdSourceAddress) !== worker + 0x24 || proof.actualThreadIdBytesHex !== source.bytes.toString('hex') || object.bytes.readUInt32LE(0x24) !== row.tid || object.bytes.readUInt32LE() !== actual(0x5d39f0) || object.bytes.readUInt32LE(0x34) !== actual(0x4a3790) || object.bytes.readUInt32LE(0x38) !== worker || object.bytes.readUInt32LE(0x44) !== actual(0x4a94a0) || object.bytes.readUInt32LE(0x48) !== manager || object.bytes.readUInt32LE(0x4c) !== 20 || !table || Number(table.address) !== m.readUInt32LE(manager) || table.bytes.length !== 0x64 || table.bytes.readUInt32LE(0x60) !== actual(0x4b12d0) || table.bytes.readUInt32LE(0x48) !== actual(0x4a79f0)) throw Error('Recovery worker source/object/manager backlink proof differs.');
  const clock = row.ranges.get('recovery-audio-clock'), parentClock = pair.before.ranges.get('clock'), session = pair.before.ranges.get('session');
  if (!clock || Number(clock.address) !== actual(0x90a548) || clock.bytes.length !== 4 || !parentClock || parentClock.bytes.length !== 4 || clock.bytes.readUInt32LE() !== parentClock.bytes.readUInt32LE() || !session || Number(row.captureWhen?.address) !== Number(session.address) + 0x57c || row.captureWhen?.actualBytesHex !== '04000000' || row.captureWhen?.equalsBytesHex !== '04000000') throw Error('Recovery worker phase/clock proof differs.');
  const offsets = {edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196}, registers = {};
  if (!Buffer.isBuffer(row.context) || row.context.length !== 716) throw Error('Recovery worker needs its actual raw x86 context.');
  for (const [name, offset] of Object.entries(offsets)) {
    registers[name] = Number(row.registers[name]);
    if (!Number.isSafeInteger(registers[name]) || registers[name] < 0 || registers[name] > 0xffffffff || row.context.readUInt32LE(offset) !== registers[name]) throw Error(`Recovery worker ${name} differs from raw context.`);
  }
  if (registers.eip !== actual(0x4a79f0) || registers.ecx !== manager) throw Error('Recovery worker actual lookup entry/manager ABI differs.');
  const stack = row.ranges.get('worker-lookup-entry');
  if (!stack || Number(stack.address) !== registers.esp || stack.bytes.length !== 8) throw Error('Recovery worker lookup requires its actual eight-byte entry stack.');
  const returnAddress = stack.bytes.readUInt32LE(), requestedId = stack.bytes.readUInt32LE(4);
  let sourceInputs;
  const sourceDeclared = configuration.breakpoints?.find(point => point.id === nativeWorkerLookupSite[0])?.ranges?.some(part => ['recovery-worker-source','recovery-worker-source-vtable'].includes(part.id));
  if (entryReturnRva !== undefined) {
    if (ownedWorkerCallerProofKeys.some(key => proof[key] !== admission[key]) || proof.entryReturnRva !== entryReturnRva || Number(proof.entryReturnAddress) !== registers.esp || proof.actualEntryReturnBytesHex !== stack.bytes.subarray(0,4).toString('hex') || Number(proof.expectedEntryReturnAddress) !== pair.moduleBaseAddress + Number(entryReturnRva) || returnAddress !== Number(proof.expectedEntryReturnAddress) || proof.entryReturnMatched !== true || proof.entryReturnReadBeforeSnapshotRanges !== true || !positive(admission.entryReturnCheckTraceRecordOrdinal) || admission.entryReturnCheckTraceRecordOrdinal <= admission.debugEventTraceRecordOrdinal || admission.entryReturnCheckTraceRecordOrdinal >= admission.traceRecordOrdinal) throw Error('Recovery worker caller-return gate/entry proof differs.');
    const object = row.ranges.get('recovery-worker-source'), vtable = row.ranges.get('recovery-worker-source-vtable');
    if (sourceDeclared || object || vtable) {
      if (entryReturnRva !== '0xb1304' || !object || Number(object.address) !== registers.esi || object.bytes.length !== 0x9a8 || object.bytes.readUInt32LE() !== actual(0x5d3f60) || object.bytes.readUInt32LE(0x438) !== requestedId || !vtable || Number(vtable.address) !== object.bytes.readUInt32LE() || vtable.bytes.length !== 0x88 || workerSourceVtableWords.some((word,i) => vtable.bytes.readUInt32LE(i*4) !== actual(word))) throw Error('Recovery worker original source input/span/vtable/mixer identity differs.');
      sourceInputs = {verified:true,address:registers.esi,length:0x9a8,sha256:object.sha256 ?? null,vtableAddress:Number(vtable.address),vtableSha256:vtable.sha256 ?? null,
        observationBoundary:'manager-gain mixer lookup entry; source read-before-use, not whole-function entry/exit',mixerId:requestedId,
        fields:{spatialFlag45e:object.bytes[0x45e],effectObjectPointer9a0:object.bytes.readUInt32LE(0x9a0),waveformPointer964:object.bytes.readUInt32LE(0x964),decoderPointer968:object.bytes.readUInt32LE(0x968),voicePointer97c:object.bytes.readUInt32LE(0x97c),gainBits43c:object.bytes.readUInt32LE(0x43c),gainBits494:object.bytes.readUInt32LE(0x494)}};
    }
  } else if (ownedWorkerCallerProofKeys.some(key => proof[key] !== undefined || admission[key] !== undefined) || sourceDeclared || row.ranges.has('recovery-worker-source') || row.ranges.has('recovery-worker-source-vtable')) throw Error('Recovery worker ESI source or caller proof appeared without a declared caller gate.');
  const callers = new Map([[actual(0x4b1304), 'manager-gain'], [actual(0x4a7ca1), 'manager-frequency'], [actual(0x4a7635), 'source-factory'], [actual(0x4adc00), 'sample-stream']]);
  const locks = [0x854, 0x874].map(offset => ({address: manager + offset, bytesHex: m.subarray(manager + offset, manager + offset + 32).toString('hex')}));
  return {verified: true, observationOrdinal: row.ordinal, observedDebugEventOrdinal: row.observedDebugEventOrdinal, pid: proof.pid, tid: row.tid,
    association, managerAddress: manager, workerAddress: worker, entryEsp: registers.esp, returnAddress, requestedId, requestedIdSigned: requestedId | 0,
    callerIdentified: callers.has(returnAddress), caller: callers.get(returnAddress) ?? 'unclassified-native-return', registers, rawContextSha256: row.contextSha256 ?? null,
    workerObjectHex: object.bytes.toString('hex'), locks, sourceReplayComplete: false, fullConcurrencyProved: false,
    ...(entryReturnRva === undefined ? {} : {entryReturnGate:{verified:true,rva:entryReturnRva,checkTraceRecordOrdinal:admission.entryReturnCheckTraceRecordOrdinal}}),
    ...(sourceInputs ? {sourceInputs} : {}),
    limits: ['The actual entry return word identifies only this immediate lookup caller; outer worker interleaving remains a separate proof.', sourceInputs ? 'The original source bytes precede this caller use; no whole-function output comparison or branch-flag changes are made.' : 'Incoming ESI is retained as a raw register and is never dereferenced.', 'Observed manager or lock bytes never substitute for source game writes.']};
}
