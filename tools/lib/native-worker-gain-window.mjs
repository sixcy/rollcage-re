import {isDeepStrictEqual} from 'node:util';
import {createCapturedMemory} from './captured-memory.mjs';
import {nativeWorkerGainSites, nativeWorkerGainPairPolicy, nativeWorkerGainPairBreakpoints, nativeWorkerGainPairRanges} from './native-worker-gain-pair.mjs';
import {verifyNativeRecoverySelection, verifyNativeRecoveryApplicationSnapshots, nativeRecoverySelectionProofKeys} from './native-recovery-selection.mjs';
import {verifyControlledNativeRecoveryConfiguration, verifyControlledNativeRecoveryEvidence} from './native-controlled-recovery.mjs';
import {workerSourceVtableWords} from './native-recovery-worker-observation.mjs';
import {selectObservedOwnedNativeThread} from './native-thread-observations.mjs';
import {REDUX_SHA256} from '../prepare-native-physics-capture.mjs';
import {createReduxCaptureConfig} from './redux-capture-config.mjs';

const equal = (a, b, label) => {if (!isDeepStrictEqual(a, b)) throw Error(`Worker window ${label} differs.`);};
const integer = (x, label) => {const n = Number(x); if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw Error(`Invalid worker window ${label}.`); return n;};
export function nativeWorkerGainWindowPolicy() {return {...nativeWorkerGainPairPolicy(), maxBufferedBytes: 262144};}
export function verifyNativeWorkerGainWindowConfiguration(c) {
  if (c.ownedWorkerGainPair !== undefined || c.ownedWorkerObservation !== undefined || c.heldForceInput !== undefined) throw Error('Worker window is a separate mutually exclusive policy.');
  equal(c.ownedWorkerGainWindow, nativeWorkerGainWindowPolicy(), 'policy');
  const ids = nativeWorkerGainSites.map(p => p[0]);
  equal(c.breakpoints.filter(p => ids.includes(p.id)), nativeWorkerGainPairBreakpoints(), 'exact endpoint ranges');
  equal(c.observationActivation, {breakpointId: 'controlled-recovery-caller', rawHit: 229, observationBreakpointIds: ids}, 'activation');
  if (c.maxDurationMs !== 90000 || c.maxSnapshots !== 350 || c.captureThreadEnvironment !== true || c.pendingFrameObserver?.maxPendingBytes !== 128 * 1024 * 1024 - 262144
    || c.pendingFrameObserver.nestedBreakpointIds !== undefined || c.pendingFrameObserver.maxNestedSnapshots !== undefined || c.pendingFrameObserver.nestedCaptureScope !== undefined) throw Error('Worker window budgets/independent scope differ.');
  const startup = createReduxCaptureConfig('policy-only', 'hidden-idle', 'unused-policy-output').breakpoints.slice(0, 3);
  equal(c.breakpoints.map(p => p.id), [...startup.map(p => p.id), 'native-recovery-before', 'native-recovery-after', 'native-recovery-apply-entry', 'controlled-recovery-caller', ...ids], 'site list');
  equal(c.breakpoints.slice(0, startup.length), startup, 'startup policy');
  verifyControlledNativeRecoveryConfiguration(c); const selection = verifyNativeRecoverySelection(c);
  if (selection.mode !== 'first-respawn-application') throw Error('Worker window requires genuine selected recovery parent.');
  return {verified: true, endpointLimit: 2, workerBufferBytes: 262144, combinedBufferBytes: 128 * 1024 * 1024, sameParentInterleavingClaimed: false};
}

// This pairs the original main-thread parent directly. Its terminal contract
// differs explicitly from the old same-parent worker observer; no records or
// counters are projected into the old validator.
export function pairNativeWorkerWindowRecovery(capture, configuration) {
  verifyNativeWorkerGainWindowConfiguration(configuration);
  if (capture.header?.executableSha256 !== REDUX_SHA256 || capture.complete?.reason !== 'worker-gain-window-bound') throw Error('Worker window lacks its actual target/terminal bound.');
  const selection = verifyNativeRecoverySelection(configuration), rows = capture.snapshots.filter(r => ['native-recovery-before', 'native-recovery-after'].includes(r.breakpointId));
  if (rows.length !== 2 || rows[0].breakpointId !== 'native-recovery-before' || rows[1].breakpointId !== 'native-recovery-after') throw Error('Worker window requires exactly one real selected parent.');
  const [before, after] = rows;
  const bases = new Set(rows.flatMap(r => [r.moduleBaseAddress, ...[...r.ranges.values()].map(v => v.moduleBaseAddress)]).filter(v => v !== undefined && v !== null).map(Number));
  if (bases.size !== 1) throw Error('Worker window parent module base differs.');
  const base = [...bases][0], S = Number(before.registers.esp), options = {stackBytesBefore: 24576, stackBytesAfter: 4};
  for (const [i, row] of rows.entries()) {
    const group = row.pendingFrame, stack = row.ranges.get('frame-stack'), session = row.ranges.get('session'), point = configuration.breakpoints.find(p => p.id === row.breakpointId);
    if (point.skipMatchingHits !== 0 || Number(point.rva) !== (i ? 0x7d02d : 0x7ccc0) || row.hit !== 1 || row.tid !== before.tid || Number(row.registers.esp) !== S
      || Number(row.registers.eip) !== base + Number(point.rva) || !group || group.role !== (i ? 'after' : 'before') || group.candidateIndex !== 1 || group.frameTid !== row.tid || Number(group.frameEntryEsp) !== S
      || row.deferredPublication !== true || row.matchingHit !== 1 || row.rawHit !== 229 || !Number.isSafeInteger(row.observedDebugEventOrdinal) || !Number.isFinite(row.observedElapsedMs)
      || !stack || Number(stack.address) !== S - 24576 || stack.bytes.length !== 24580 || stack.bytes.readUInt32LE(24576) !== base + 0x51021
      || !session || session.bytes.length < 0x590 || session.bytes[0x54d] !== 6 || session.bytes.readUInt32LE(0x57c) !== 4
      || row.captureWhen?.actualBytesHex !== '04000000' || row.captureWhen.equalsBytesHex !== '04000000' || Number(row.captureWhen.address) !== Number(session.address) + 0x57c
      || Number(group.frameReturnAddress) !== base + 0x51021 || group.frameMatchingHit !== row.matchingHit || group.observedEventHits !== group.qualifyingEventSnapshots || group.observedEventHits < 1 || group.observedEventHits > selection.maxEventSnapshots || group.nestedSnapshots !== 0) throw Error('Worker window parent ABI/selection proof differs.');
    for (const key of nativeRecoverySelectionProofKeys) if (group[key] !== before.pendingFrame[key] || capture.complete.pendingFrameSelection?.[key] !== group[key]) throw Error('Worker window parent terminal selection differs.');
  }
  if (before.observedDebugEventOrdinal >= after.observedDebugEventOrdinal || before.observedElapsedMs > after.observedElapsedMs || Number(before.ranges.get('session').address) !== Number(after.ranges.get('session').address)) throw Error('Worker window parent order/session differs.');
  const pair = {before, after, moduleBaseAddress: base, returnAddress: base + 0x51021, options};
  pair.nativeApplications = verifyNativeRecoveryApplicationSnapshots(capture, pair, selection);
  pair.controlledInput = verifyControlledNativeRecoveryEvidence(capture, pair, configuration);
  return pair;
}

export function verifyWorkerGainWindowActivation(capture, pair, configuration, records) {
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
  return {verified: true, activatedSites: ids.length, triggerOrdinal: trigger[0].ordinal, activationDebugOrdinal: trigger[0].observedDebugEventOrdinal};
}

export function verifyNativeWorkerGainWindow(capture, pair, configuration, records) {
  verifyNativeWorkerGainWindowConfiguration(configuration);
  const activation = verifyWorkerGainWindowActivation(capture, pair, configuration, records);
  const rows = capture.snapshots.filter(r => nativeWorkerGainSites.some(([id]) => id === r.breakpointId));
  if (rows.length !== 2 || rows[0].breakpointId !== 'worker-gain-entry' || rows[1].breakpointId !== 'worker-gain-exit') throw Error('Actual worker gain requires one entry and normal exit; absent/spatial/unmatched calls fail.');
  const admitted = records.map((r, i) => ({...r, traceRecordOrdinal: i + 1})).filter(r => r.type === 'owned-worker-gain-window-admitted');
  const owners = capture.nativeThreadRecords.filter(r => r.type === 'owned-process');
  if (admitted.length !== 2 || owners.length !== 1 || pair.before.tid !== owners[0].tid) throw Error('Worker gain admission/owned main-process count differs.');
  const actual = p => pair.moduleBaseAddress + p - 0x400000, endpoints = [];
  for (const [i, row] of rows.entries()) {
    const proof = row.ownedWorkerGainWindow, admission = admitted[i], role = i ? 'exit' : 'entry';
    if (!proof || row.hit !== 1 || row.deferredPublication !== true || row.pendingFrame !== undefined || row.workerObservationWindow?.role !== `worker-leaf-${role}` || row.workerObservationWindow.ownerMainTid !== pair.before.tid || row.workerObservationWindow.sameParentInterleavingClaimed !== false || row.workerObservationWindow.activationDebugEventOrdinal !== activation.activationDebugOrdinal || row.tid === pair.before.tid || row.observedDebugEventOrdinal <= activation.activationDebugOrdinal) throw Error('Worker leaf endpoint escaped independent activation/thread scope.');
    const {type, traceRecordOrdinal, elapsedMs, ...metadata} = admission; equal(proof, metadata, 'admission snapshot metadata');
    if (!Number.isFinite(row.observedElapsedMs) || row.observedElapsedMs < 0 || !Number.isFinite(elapsedMs) || elapsedMs < row.observedElapsedMs || !Number.isFinite(row.elapsedMs) || elapsedMs > row.elapsedMs) throw Error('Worker leaf observation/admission/publication timing differs.');
    const previous = records.slice(0, traceRecordOrdinal - 1), debug = previous.findLast(r => r.type === 'debug-event'), gate = previous.findLast(r => r.type === 'owned-worker-gain-window-abi-checked');
    if (!debug || debug.event !== 1 || debug.pid !== owners[0].pid || debug.tid !== row.tid || debug.ordinal !== row.observedDebugEventOrdinal || !gate || previous.indexOf(gate) < previous.indexOf(debug) || gate.breakpointId !== row.breakpointId || gate.pid !== debug.pid || gate.tid !== row.tid || gate.observedDebugEventOrdinal !== debug.ordinal || gate.entry !== !i || gate.callerMatched !== true || gate.readBeforeSnapshotRanges !== true || gate.counterMutation !== false || gate.stackBytesHex !== proof.stackBytesHex || gate.stackAddress !== proof.stackAddress) throw Error('Worker gain gate/exception/owned process provenance differs.');
    const association = selectObservedOwnedNativeThread(capture.nativeThreadRecords, row.tid, {atDebugEventOrdinal: debug.ordinal});
    if (association.evidenceType !== 'owned-create-thread' || association.pid !== proof.pid || proof.pid !== debug.pid || proof.tid !== row.tid || proof.expectedTid !== row.tid || proof.ownedLiveThread !== true || proof.ownerMainTid !== pair.before.tid || proof.sameParentInterleavingClaimed !== false || proof.activationDebugEventOrdinal !== activation.activationDebugOrdinal || proof.activationBreakpointId !== configuration.observationActivation.breakpointId || proof.activationRawHit !== 229 || Object.hasOwn(proof, 'pendingFrameActive') || Object.hasOwn(proof, 'candidateIndex') || proof.observationIndex !== i + 1 || proof.maxSnapshots !== 2 || proof.role !== role || proof.breakpointId !== row.breakpointId || proof.beforeOriginalInstruction !== true || proof.abiReadBeforeSnapshotRanges !== true || proof.observedDebugEventOrdinal !== debug.ordinal || proof.exitArgumentNotDereferenced !== Boolean(i)) throw Error('Worker gain owned thread/ABI admission differs.');
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
    const session = span('worker-gain-session-root', actual(0x5ecb1c), 4).readUInt32LE();
    if (span('worker-gain-phase', session + 0x57c, 4).readUInt32LE() !== 4) throw Error('Worker gain phase/clock differs.');
    endpoints.push({ordinal: row.ordinal, tid: row.tid, debugOrdinal: debug.ordinal, source, manager, entryEsp: S, returnAddress: returned, force,
      association, clock: span('worker-gain-clock', actual(0x90a548), 4).readUInt32LE(), registers: regs, fpuControlWord: cw, mxcsr, sourceSha256: row.ranges.get('worker-gain-source').sha256 ?? null, sourceFields: {spatial45e: bytes[0x45e], effect9a0: bytes.readUInt32LE(0x9a0), waveform964: bytes.readUInt32LE(0x964), decoder968: bytes.readUInt32LE(0x968), voice97c: bytes.readUInt32LE(0x97c)}});
  }
  for (const name of ['source', 'manager', 'entryEsp', 'returnAddress', 'force', 'tid']) equal(endpoints[0][name], endpoints[1][name], `paired ${name}`);
  for (const name of ['ebx', 'ebp', 'esi', 'edi']) equal(endpoints[0].registers[name], endpoints[1].registers[name], `saved ${name}`);
  if (endpoints[0].ordinal >= endpoints[1].ordinal || endpoints[0].debugOrdinal >= endpoints[1].debugOrdinal) throw Error('Worker gain endpoint order differs.');
  equal(endpoints[0].association.traceRecordOrdinal, endpoints[1].association.traceRecordOrdinal, 'same owned worker lifetime');
  const terminal = capture.complete?.workerGainWindow;
  if (!terminal || terminal.activationDebugEventOrdinal !== activation.activationDebugOrdinal || terminal.parentRetained !== true || terminal.pairComplete !== true || terminal.endpointSnapshots !== 2 || terminal.sameParentInterleavingClaimed !== false) throw Error('Worker leaf terminal completion differs.');
  const retained = records.filter(r => r.type === 'worker-gain-window-parent-retained'), published = records.filter(r => r.type === 'worker-gain-window-pair-published');
  if (retained.length !== 1 || published.length !== 1 || retained[0].activationDebugEventOrdinal !== activation.activationDebugOrdinal || retained[0].parentStartDebugEventOrdinal !== pair.before.observedDebugEventOrdinal || retained[0].parentEndDebugEventOrdinal !== pair.after.observedDebugEventOrdinal || retained[0].sameParentInterleavingClaimed !== false || published[0].activationDebugEventOrdinal !== activation.activationDebugOrdinal || published[0].tid !== endpoints[0].tid || Number(published[0].source) !== endpoints[0].source || Number(published[0].entryEsp) !== endpoints[0].entryEsp || published[0].snapshotCount !== 2 || published[0].sameParentInterleavingClaimed !== false) throw Error('Worker leaf actual publication/parent markers differ.');
  return {verified: true, endpoints, activation, sourceReplayComplete: false, wholeGainCallMatched: false, fullPrivateAbiMatched: false, fullWorkerInterleavingProved: false,
    limits: ['Independent activation-window entry/normal-RET8 observation only; no same-parent interleaving is asserted. Output source bytes never initialize a reconstruction.', 'Mixer object/getter, nullable waveform/voice/decoder and reached COM/CRT/Win32 service inputs remain explicit missing dependencies.', 'Manager/lock concurrency is not replayed or relabeled as service outcomes.']};
}
