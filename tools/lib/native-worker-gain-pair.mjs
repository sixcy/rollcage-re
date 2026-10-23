import {isDeepStrictEqual} from 'node:util';
import {createCapturedMemory} from './captured-memory.mjs';
import {verifyNativeRecoverySoundCaptureConfiguration} from './native-recovery-sound-selection.mjs';
import {nativeOwnedWorkerObservationPolicy, workerSourceVtableWords} from './native-recovery-worker-observation.mjs';
import {selectObservedOwnedNativeThread} from './native-thread-observations.mjs';

export const nativeWorkerGainSites = Object.freeze([['worker-gain-entry', 0x4b12d0], ['worker-gain-exit', 0x4b1990], ['worker-gain-spatial-exit', 0x4b1919]].map(Object.freeze));
export function nativeWorkerGainPairPolicy() {
  return {entryBreakpointId: nativeWorkerGainSites[0][0], exitBreakpointId: nativeWorkerGainSites[1][0], unsupportedExitBreakpointId: nativeWorkerGainSites[2][0],
    threadIdSource: nativeOwnedWorkerObservationPolicy().threadIdSource,
    managerSource: {id: 'worker-gain-manager-root', rva: '0x314b08', length: 4}, maxSnapshots: 2};
}
export function nativeWorkerGainPairRanges(entry) {
  return [nativeWorkerGainPairPolicy().managerSource,
    {id: 'worker-gain-manager', rva: '0x314b08', dereferenceOffsets: ['0'], length: 0xd74},
    {id: 'worker-gain-manager-vtable', rva: '0x314b08', dereferenceOffsets: ['0', '0'], length: 0x64},
    {id: 'worker-gain-thread-object', rva: '0x314b08', dereferenceOffsets: ['0', '0x824'], length: 80},
    nativeWorkerGainPairPolicy().threadIdSource,
    {id: 'worker-gain-session-root', rva: '0x1ecb1c', length: 4},
    {id: 'worker-gain-phase', rva: '0x1ecb1c', dereferenceOffsets: ['0'], offset: '0x57c', length: 4},
    {id: 'worker-gain-clock', rva: '0x50a548', length: 4},
    {id: 'worker-gain-stack', baseRegister: 'esp', offset: '-432', length: 444},
    {id: 'worker-gain-arguments', baseRegister: 'esp', length: 12},
    {id: 'worker-gain-source', baseRegister: entry ? 'esp' : 'esi', ...(entry ? {dereferenceOffsets: ['4']} : {}), length: 0x9a8},
    {id: 'worker-gain-source-vtable', baseRegister: entry ? 'esp' : 'esi', dereferenceOffsets: entry ? ['4', '0'] : ['0'], length: 0x88},
    {id: 'worker-gain-mixer-header', rva: '0x314b08', dereferenceOffsets: ['0', '0x84c'], length: 12},
    {id: 'worker-gain-mixer-storage', rva: '0x314b08', dereferenceOffsets: ['0', '0x84c'], vectorStorage: true, maxVectorBytes: 65536},
    ...[0x5dc774, 0x5dcaac, 0x5dc5fc, 0x5dca78, 0x5dca70, 0x5dcab8, 0x5e8890].map(p => ({id: `worker-gain-literal-${p.toString(16)}`, rva: `0x${(p - 0x400000).toString(16)}`, length: 4}))];
}
export function nativeWorkerGainPairBreakpoints() {
  return nativeWorkerGainSites.map(([id, address], i) => ({id, rva: `0x${(address - 0x400000).toString(16)}`, ranges: i < 2 ? nativeWorkerGainPairRanges(i === 0) : []}));
}
export function verifyNativeWorkerGainPairConfiguration(configuration) {
  if (configuration.ownedWorkerObservation !== undefined || !isDeepStrictEqual(configuration.ownedWorkerGainPair, nativeWorkerGainPairPolicy())) throw Error('Worker gain requires its separate exact two-endpoint policy.');
  const ids = nativeWorkerGainSites.map(row => row[0]), points = configuration.breakpoints.filter(p => ids.includes(p.id));
  if (!isDeepStrictEqual(points, nativeWorkerGainPairBreakpoints())) throw Error('Worker gain breakpoint/range/caller policy differs.');
  const baseline = structuredClone(configuration); delete baseline.ownedWorkerGainPair;
  baseline.breakpoints = baseline.breakpoints.filter(p => !ids.includes(p.id));
  for (const [path, list] of [['pending', baseline.pendingFrameObserver?.nestedBreakpointIds], ['activation', baseline.observationActivation?.observationBreakpointIds]]) {
    if (!Array.isArray(list) || !isDeepStrictEqual(list.slice(-3), ids) || ids.some(id => list.filter(x => x === id).length !== 1)) throw Error(`Worker gain ${path} endpoint admission differs.`);
    list.splice(-3);
  }
  const proof = verifyNativeRecoverySoundCaptureConfiguration(baseline);
  if (configuration.maxDurationMs !== 90000 || configuration.maxSnapshots !== 350 || configuration.pendingFrameObserver.maxNestedSnapshots !== 115 || configuration.pendingFrameObserver.maxPendingBytes !== 128 * 1024 * 1024 || configuration.observationActivation.rawHit !== 229) throw Error('Worker gain changed the original budgets/activation.');
  return {verified: true, legacyMainProfile: proof, endpointLimit: 2, unsupportedSpatialExitFails: true};
}

const integer = (x, label) => {const n = Number(x); if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw Error(`Invalid worker gain ${label}.`); return n;};
const equal = (a, b, label) => {if (!isDeepStrictEqual(a, b)) throw Error(`Worker gain ${label} differs.`);};

//Own activation proof: actual ordinary and worker rows retain their counters.
//No projected frame/counter/one-shot policy is passed to a legacy validator.
export function verifyWorkerGainActivation(capture, pair, configuration, records) {
  const policy = configuration.observationActivation, ids = policy.observationBreakpointIds;
  const withOrdinal = records.map((r, i) => ({...r, traceRecordOrdinal: i + 1}));
  const trigger = capture.snapshots.filter(r => r.breakpointId === policy.breakpointId && r.hit === policy.rawHit);
  if (trigger.length !== 1 || trigger[0].tid !== pair.before.tid || trigger[0].observedDebugEventOrdinal >= pair.before.observedDebugEventOrdinal || trigger[0].capturePhase !== 'before-declared-writes-before-original-instruction') throw Error('Worker gain activation lacks its guarded actual trigger.');
  const marker = withOrdinal.find(r => r.type === 'snapshot' && r.ordinal === trigger[0].ordinal), parent = withOrdinal.find(r => r.type === 'snapshot' && r.ordinal === pair.before.ordinal);
  const guards = withOrdinal.filter(r => r.type === 'intervention' && r.breakpointId === policy.breakpointId && r.hit === policy.rawHit);
  const actions = configuration.phaseActions.filter(r => r.breakpointId === policy.breakpointId && r.hit === policy.rawHit);
  const installed = withOrdinal.filter(r => r.type === 'breakpoint-activated'), done = withOrdinal.filter(r => r.type === 'observation-activation-complete');
  if (!marker || !parent || actions.length !== 1 || guards.length !== actions[0].writes.length || installed.length !== ids.length || done.length !== 1) throw Error('Worker gain activation actual counts differ.');
  for (const [i, row] of guards.entries()) {
    const write = actions[0].writes[i], accepted = write.expectedAnyBytesHex ?? [write.expectedBytesHex];
    if (!accepted.includes(row.originalBytesHex) || row.replacementBytesHex !== write.bytesHex || !isDeepStrictEqual(row.acceptedOriginalBytesHex, accepted) || row.traceRecordOrdinal <= marker.traceRecordOrdinal || row.traceRecordOrdinal >= installed[0].traceRecordOrdinal) throw Error('Worker gain guard/activation order differs.');
  }
  for (const [i, id] of ids.entries()) {
    const point = configuration.breakpoints.find(p => p.id === id), address = pair.moduleBaseAddress + Number(point.rva), row = installed[i];
    const deferred = withOrdinal.filter(r => r.type === 'breakpoint-installation-deferred' && r.id === id);
    if (deferred.length !== 1 || deferred[0].codeModified !== false || Number(deferred[0].address) !== address || deferred[0].activationBreakpointId !== policy.breakpointId || deferred[0].activationRawHit !== policy.rawHit || deferred[0].traceRecordOrdinal >= marker.traceRecordOrdinal || withOrdinal.some(r => r.type === 'breakpoint-installed' && r.id === id)
      || row.id !== id || Number(row.address) !== address || row.originalBytesHex !== deferred[0].originalBytesHex || !/^[0-9a-f]{2}$/.test(row.originalBytesHex) || row.originalBytesHex === 'cc' || row.patchBytesHex !== 'cc' || row.activationBreakpointId !== policy.breakpointId || row.activationRawHit !== policy.rawHit || row.activationTid !== pair.before.tid || row.observedDebugEventOrdinal !== trigger[0].observedDebugEventOrdinal || row.beforeOriginalInstruction !== true || row.rawHitBefore !== 0 || row.matchingHitBefore !== 0 || row.captureHitBefore !== 0) throw Error('Worker gain actual guarded breakpoint installation differs.');
  }
  const completed = done[0];
  if (completed.breakpointId !== policy.breakpointId || completed.rawHit !== policy.rawHit || completed.tid !== pair.before.tid || completed.observedDebugEventOrdinal !== trigger[0].observedDebugEventOrdinal || completed.snapshotCount !== trigger[0].ordinal || completed.beforeOriginalInstruction !== true || completed.guardActionCompleted !== true || completed.traceRecordOrdinal <= installed.at(-1).traceRecordOrdinal || completed.traceRecordOrdinal >= parent.traceRecordOrdinal) throw Error('Worker gain activation completion provenance differs.');
  equal(completed.installed, installed.map(r => ({id: r.id, address: r.address})), 'activated site list');
  const nested = capture.snapshots.filter(r => ids.includes(r.breakpointId)), workerIds = nativeWorkerGainSites.map(r => r[0]);
  if (nested.length !== pair.before.pendingFrame.nestedSnapshots) throw Error('Worker gain actual nested count differs.');
  for (const row of nested.filter(r => !workerIds.includes(r.breakpointId))) if (row.tid !== pair.before.tid || row.deferredPublication !== true || row.pendingFrame?.role !== 'nested' || row.pendingFrame.frameTid !== pair.before.tid || row.pendingFrame.candidateIndex !== pair.before.pendingFrame.candidateIndex || row.observedDebugEventOrdinal <= pair.before.observedDebugEventOrdinal || row.observedDebugEventOrdinal >= pair.after.observedDebugEventOrdinal) throw Error('Worker gain ordinary nested row escaped parent thread/scope.');
  return {verified: true, activatedSites: ids.length, nestedSnapshots: nested.length, triggerOrdinal: trigger[0].ordinal};
}

export function verifyNativeWorkerGainPair(capture, pair, configuration, records) {
  verifyNativeWorkerGainPairConfiguration(configuration);
  const rows = capture.snapshots.filter(r => nativeWorkerGainSites.some(([id]) => id === r.breakpointId));
  if (rows.length !== 2 || rows[0].breakpointId !== 'worker-gain-entry' || rows[1].breakpointId !== 'worker-gain-exit') throw Error('Actual worker gain requires one entry and normal exit; absent/spatial/unmatched calls fail.');
  const admitted = records.map((r, i) => ({...r, traceRecordOrdinal: i + 1})).filter(r => r.type === 'owned-worker-gain-admitted');
  const owners = capture.nativeThreadRecords.filter(r => r.type === 'owned-process');
  if (admitted.length !== 2 || owners.length !== 1 || pair.before.tid !== owners[0].tid) throw Error('Worker gain admission/owned main-process count differs.');
  const actual = p => pair.moduleBaseAddress + p - 0x400000, endpoints = [];
  for (const [i, row] of rows.entries()) {
    const proof = row.ownedWorkerGainPair, admission = admitted[i], role = i ? 'exit' : 'entry';
    if (!proof || row.hit !== 1 || row.deferredPublication !== true || row.pendingFrame?.role !== `worker-gain-${role}` || row.pendingFrame.frameTid !== pair.before.tid || row.pendingFrame.candidateIndex !== pair.before.pendingFrame.candidateIndex || row.tid === pair.before.tid || row.observedDebugEventOrdinal <= pair.before.observedDebugEventOrdinal || row.observedDebugEventOrdinal >= pair.after.observedDebugEventOrdinal || row.ordinal <= pair.before.ordinal || row.ordinal >= pair.after.ordinal) throw Error('Worker gain endpoint escaped actual parent/thread/order.');
    const {type, traceRecordOrdinal, ...metadata} = admission; equal(proof, metadata, 'admission snapshot metadata');
    const previous = records.slice(0, traceRecordOrdinal - 1), debug = previous.findLast(r => r.type === 'debug-event'), gate = previous.findLast(r => r.type === 'owned-worker-gain-abi-checked');
    const frame = previous.findLast(r => ['pending-frame-started', 'pending-frame-selected', 'pending-frame-discarded'].includes(r.type));
    if (!frame || frame.type !== 'pending-frame-started' || frame.frameTid !== pair.before.tid || frame.candidateIndex !== pair.before.pendingFrame.candidateIndex || previous.indexOf(frame) >= previous.indexOf(debug)) throw Error('Worker gain admission lacks its actual open parent frame.');
    if (!debug || debug.event !== 1 || debug.pid !== owners[0].pid || debug.tid !== row.tid || debug.ordinal !== row.observedDebugEventOrdinal || !gate || previous.indexOf(gate) < previous.indexOf(debug) || gate.breakpointId !== row.breakpointId || gate.pid !== debug.pid || gate.tid !== row.tid || gate.observedDebugEventOrdinal !== debug.ordinal || gate.entry !== !i || gate.callerMatched !== true || gate.readBeforeSnapshotRanges !== true || gate.counterMutation !== false || gate.stackBytesHex !== proof.stackBytesHex || gate.stackAddress !== proof.stackAddress) throw Error('Worker gain gate/exception/owned process provenance differs.');
    const association = selectObservedOwnedNativeThread(capture.nativeThreadRecords, row.tid, {atDebugEventOrdinal: debug.ordinal});
    if (association.evidenceType !== 'owned-create-thread' || association.pid !== proof.pid || proof.pid !== debug.pid || proof.tid !== row.tid || proof.expectedTid !== row.tid || proof.ownedLiveThread !== true || proof.pendingFrameActive !== true || proof.pendingFrameTid !== pair.before.tid || proof.candidateIndex !== pair.before.pendingFrame.candidateIndex || proof.observationIndex !== i + 1 || proof.maxSnapshots !== 2 || proof.role !== role || proof.breakpointId !== row.breakpointId || proof.beforeOriginalInstruction !== true || proof.abiReadBeforeSnapshotRanges !== true || proof.observedDebugEventOrdinal !== debug.ordinal || proof.exitArgumentNotDereferenced !== Boolean(i)) throw Error('Worker gain owned thread/ABI admission differs.');
    if (!Buffer.isBuffer(row.context) || row.context.length !== 716) throw Error('Worker gain requires original raw CONTEXT716.');
    const regs = {};
    for (const [name, offset] of Object.entries({edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196})) {regs[name] = integer(row.registers[name], name); if (regs[name] !== row.context.readUInt32LE(offset)) throw Error(`Worker gain raw ${name} context differs.`);}
    const cw = row.context.readUInt32LE(28) & 65535, mxcsr = row.context.readUInt32LE(228);
    if (cw !== Number(row.registers.fpuControlWord) || mxcsr !== Number(row.registers.mxcsr) || (cw & 0xf3f) !== 0x23f) throw Error('Worker gain requires actual masked nearest PC53 worker mode, not main PC24.');
    const m = createCapturedMemory([...row.ranges.values()]), span = (id, address, length) => {const r = row.ranges.get(id); if (!r || Number(r.address) !== address || r.bytes.length !== length) throw Error(`Worker gain span ${id} differs.`); return length ? m.span(address, length) : r.bytes;};
    for (const descriptor of nativeWorkerGainPairRanges(i === 0)) {
      let address = descriptor.rva === undefined ? regs[descriptor.baseRegister] : pair.moduleBaseAddress + Number(descriptor.rva);
      for (const offset of descriptor.dereferenceOffsets ?? []) address = m.memory.readUInt32LE(address + Number(offset));
      address += Number(descriptor.offset ?? 0);
      if (!descriptor.vectorStorage) span(descriptor.id, address, descriptor.length);
      else {
        const header = m.span(address, 12), begin = header.readUInt32LE(), end = header.readUInt32LE(4), capacity = header.readUInt32LE(8), observed = row.ranges.get(descriptor.id);
        if (begin > end || end > capacity || (end - begin) % 4 || (capacity - begin) % 4 || capacity - begin > 65536 || !observed || observed.rangeMode !== 'vector-storage' || Number(observed.vectorHeaderAddress) !== address || observed.vectorHeaderHex !== header.toString('hex') || Number(observed.vectorBegin) !== begin || Number(observed.vectorEnd) !== end || Number(observed.vectorCapacity) !== capacity || observed.maxVectorBytes !== 65536) throw Error('Worker gain mixer-vector input extent differs.');
        span(descriptor.id, begin, capacity - begin);
      }
    }
    const S = integer(proof.entryEsp, 'bound entryESP'), source = integer(proof.source, 'bound source'), manager = integer(proof.manager, 'bound manager');
    const args = span('worker-gain-arguments', S, 12); span('worker-gain-stack', S - 432, 444);
    if (regs.esp !== S || regs.eip !== actual(i ? 0x4b1990 : 0x4b12d0) || args.toString('hex') !== proof.stackBytesHex || Number(proof.stackAddress) !== S || args.readUInt32LE() !== Number(proof.returnAddress) || Number(proof.afterRetEsp) !== S + 12) throw Error('Worker gain entry/RET8 stack differs.');
    for (const name of ['ebx', 'ebp', 'edi']) if (Number(proof[`entry${name[0].toUpperCase()}${name.slice(1)}`]) !== regs[name]) throw Error('Worker gain saved-register proof differs.');
    const returned = args.readUInt32LE(), force = Number(proof.force);
    if (!((returned === actual(0x4a722c) && force === 0) || (returned === actual(0x4a72f6) && force === 1)) || regs.esi !== source || !i && (args.readUInt32LE(4) !== source || args.readUInt32LE(8) !== force || regs.ecx !== manager)) throw Error('Worker gain actual source/caller/force ABI differs.');
    const bytes = span('worker-gain-source', source, 0x9a8), vtable = span('worker-gain-source-vtable', bytes.readUInt32LE(), 0x88);
    if (bytes.readUInt32LE() !== actual(0x5d3f60) || workerSourceVtableWords.some((p, j) => vtable.readUInt32LE(j * 4) !== actual(p))) throw Error('Worker gain source backend/vtable differs.');
    if (span('worker-gain-manager-root', actual(0x714b08), 4).readUInt32LE() !== manager) throw Error('Worker gain manager root changed.');
    const managerBytes = span('worker-gain-manager', manager, 0xd74), table = span('worker-gain-manager-vtable', managerBytes.readUInt32LE(), 0x64);
    const worker = managerBytes.readUInt32LE(0x824), object = span('worker-gain-thread-object', worker, 80), tidBytes = span('manager-worker-tid', worker + 0x24, 4);
    if (tidBytes.readUInt32LE() !== row.tid || object.readUInt32LE(0x24) !== row.tid || Number(proof.threadIdSourceAddress) !== worker + 0x24 || proof.actualThreadIdBytesHex !== tidBytes.toString('hex') || object.readUInt32LE() !== actual(0x5d39f0) || object.readUInt32LE(0x34) !== actual(0x4a3790) || object.readUInt32LE(0x38) !== worker || object.readUInt32LE(0x44) !== actual(0x4a94a0) || object.readUInt32LE(0x48) !== manager || object.readUInt32LE(0x4c) !== 20 || table.readUInt32LE(0x60) !== actual(0x4b12d0) || table.readUInt32LE(0x48) !== actual(0x4a79f0)) throw Error('Worker gain original thread object/manager backlink differs.');
    const session = Number(pair.before.ranges.get('session').address);
    if (span('worker-gain-phase', session + 0x57c, 4).readUInt32LE() !== 4 || span('worker-gain-clock', actual(0x90a548), 4).readUInt32LE() !== pair.before.ranges.get('clock').bytes.readUInt32LE()) throw Error('Worker gain phase/clock differs.');
    endpoints.push({ordinal: row.ordinal, tid: row.tid, debugOrdinal: debug.ordinal, source, manager, entryEsp: S, returnAddress: returned, force,
      registers: regs, fpuControlWord: cw, mxcsr, sourceSha256: row.ranges.get('worker-gain-source').sha256 ?? null, sourceFields: {spatial45e: bytes[0x45e], effect9a0: bytes.readUInt32LE(0x9a0), waveform964: bytes.readUInt32LE(0x964), decoder968: bytes.readUInt32LE(0x968), voice97c: bytes.readUInt32LE(0x97c)}});
  }
  for (const name of ['source', 'manager', 'entryEsp', 'returnAddress', 'force', 'tid']) equal(endpoints[0][name], endpoints[1][name], `paired ${name}`);
  for (const name of ['ebx', 'ebp', 'esi', 'edi']) equal(endpoints[0].registers[name], endpoints[1].registers[name], `saved ${name}`);
  if (endpoints[0].ordinal >= endpoints[1].ordinal || endpoints[0].debugOrdinal >= endpoints[1].debugOrdinal) throw Error('Worker gain endpoint order differs.');
  const activation = verifyWorkerGainActivation(capture, pair, configuration, records);
  return {verified: true, endpoints, activation, sourceReplayComplete: false, wholeGainCallMatched: false, fullPrivateAbiMatched: false, fullWorkerInterleavingProved: false,
    limits: ['Entry/normal-RET8 observation only; output source bytes never initialize a reconstruction.', 'Mixer object/getter, nullable waveform/voice/decoder and reached COM/CRT/Win32 service inputs remain explicit missing dependencies.', 'Manager/lock concurrency is not replayed or relabeled as service outcomes.']};
}
