//Read-only proof of host-owned observer activation. This is neither a game
//instruction/service replacement nor proof of the observed game's outputs.
import {nativeWorkerLookupSite, verifyOwnedWorkerSnapshotAdmission} from './native-recovery-worker-observation.mjs';
export function verifyNativeObservationActivation(capture, pair, configuration) {
  const policy = configuration.observationActivation;
  if (policy === undefined) return null;
  const ids = policy.observationBreakpointIds, observer = configuration.pendingFrameObserver;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || observer?.nestedCaptureScope !== 'frame-thread') throw Error('Observation activation configuration/scope differs.');
  const records = capture.observationActivationRecords;
  if (!Array.isArray(records) || !records.length) throw Error('Observation activation lacks actual host records.');
  if (records.some((row, index) => !Number.isSafeInteger(row.traceRecordOrdinal) || row.traceRecordOrdinal < 1 || index && row.traceRecordOrdinal <= records[index - 1].traceRecordOrdinal)) throw Error('Observation activation trace-record order differs.');
  const triggers = capture.snapshots.filter(row => row.breakpointId === policy.breakpointId && row.hit === policy.rawHit);
  if (triggers.length !== 1) throw Error('Observation activation requires its actual unique trigger snapshot.');
  const trigger = triggers[0], before = pair.before, after = pair.after, debugOrdinal = trigger.observedDebugEventOrdinal;
  const triggerMarker = records.find(row => row.type === 'snapshot' && row.ordinal === trigger.ordinal);
  const parentMarker = records.find(row => row.type === 'snapshot' && row.ordinal === before.ordinal);
  if (trigger.tid !== before.tid || !Number.isSafeInteger(debugOrdinal) || debugOrdinal < 1 || !triggerMarker || !parentMarker || triggerMarker.breakpointId !== trigger.breakpointId || triggerMarker.tid !== trigger.tid || triggerMarker.observedDebugEventOrdinal !== debugOrdinal || trigger.capturePhase !== 'before-declared-writes-before-original-instruction' || before.ordinal <= trigger.ordinal || before.observedDebugEventOrdinal <= debugOrdinal) throw Error('Observation activation trigger/parent thread/order proof differs.');
  const actions = configuration.phaseActions.filter(row => row.breakpointId === policy.breakpointId && row.hit === policy.rawHit);
  if (actions.length !== 1 || !actions[0].writes.length) throw Error('Observation activation requires exactly one declared guard action.');
  const guards = records.filter(row => row.type === 'intervention' && row.breakpointId === policy.breakpointId && row.hit === policy.rawHit);
  const installed = records.filter(row => row.type === 'breakpoint-activated');
  const completed = records.filter(row => row.type === 'observation-activation-complete');
  if (guards.length !== actions[0].writes.length || installed.length !== ids.length || completed.length !== 1) throw Error('Observation activation actual guard/site/completion counts differ.');
  for (const [index, guard] of guards.entries()) {
    const write = actions[0].writes[index], accepted = write.expectedAnyBytesHex ?? [write.expectedBytesHex];
    //Pointer-chasing recovery guards are independently resolved by
    //verifyControlledNativeRecoveryEvidence before this host-only proof.
    //Direct guards can additionally be checked here without reading answers.
    const base = write.rva !== undefined ? pair.moduleBaseAddress + Number(write.rva) : write.address !== undefined ? Number(write.address) : write.baseRegister !== undefined ? Number(trigger.registers?.[write.baseRegister]) : NaN;
    const directAddress = write.dereferenceOffsets?.length ? undefined : base + Number(write.offset ?? 0);
    if (!Number.isSafeInteger(Number(guard.address)) || Number(guard.address) < 1 || Number(guard.address) > 0xffffffff || directAddress !== undefined && (!Number.isSafeInteger(directAddress) || Number(guard.address) !== directAddress)) throw Error('Observation activation direct guard address differs.');
    if (!accepted.includes(guard.originalBytesHex) || guard.replacementBytesHex !== write.bytesHex || JSON.stringify(guard.acceptedOriginalBytesHex) !== JSON.stringify(accepted) || guard.traceRecordOrdinal <= triggerMarker.traceRecordOrdinal || guard.traceRecordOrdinal >= installed[0].traceRecordOrdinal) throw Error('Observation activation was not preceded by every successful original-byte guard.');
  }
  for (const [index, id] of ids.entries()) {
    const point = configuration.breakpoints.find(row => row.id === id), expectedAddress = point?.rva === undefined ? Number(point?.address) : pair.moduleBaseAddress + Number(point.rva);
    const deferred = records.filter(row => row.type === 'breakpoint-installation-deferred' && row.id === id), row = installed[index];
    if (deferred.length !== 1 || records.some(entry => entry.type === 'breakpoint-installed' && entry.id === id) || deferred[0].codeModified !== false || Number(deferred[0].address) !== expectedAddress || deferred[0].activationBreakpointId !== policy.breakpointId || deferred[0].activationRawHit !== policy.rawHit || deferred[0].traceRecordOrdinal >= triggerMarker.traceRecordOrdinal) throw Error('Observation site was not genuinely unpatched before guarded activation.');
    if (row.id !== id || Number(row.address) !== expectedAddress || row.originalBytesHex !== deferred[0].originalBytesHex || !/^[0-9a-f]{2}$/.test(row.originalBytesHex) || row.originalBytesHex === 'cc' || row.patchBytesHex !== 'cc' || row.activationBreakpointId !== policy.breakpointId || row.activationRawHit !== policy.rawHit || row.activationTid !== before.tid || row.observedDebugEventOrdinal !== debugOrdinal || row.beforeOriginalInstruction !== true || row.rawHitBefore !== 0 || row.matchingHitBefore !== 0 || row.captureHitBefore !== 0) throw Error('Observation activation actual site/address/zero-hit proof differs.');
  }
  const done = completed[0];
  if (done.breakpointId !== policy.breakpointId || done.rawHit !== policy.rawHit || done.tid !== before.tid || done.observedDebugEventOrdinal !== debugOrdinal || done.snapshotCount !== trigger.ordinal || done.beforeOriginalInstruction !== true || done.guardActionCompleted !== true || done.traceRecordOrdinal <= installed.at(-1).traceRecordOrdinal || done.traceRecordOrdinal >= parentMarker.traceRecordOrdinal || JSON.stringify(done.installed) !== JSON.stringify(installed.map(row => ({id: row.id, address: row.address})))) throw Error('Observation activation completion/parent ordering differs.');
  const nested = capture.snapshots.filter(row => ids.includes(row.breakpointId));
  const workers = configuration.ownedWorkerObservation === undefined ? [] : nested.filter(row => row.breakpointId === nativeWorkerLookupSite[0]);
  if (configuration.ownedWorkerObservation !== undefined && workers.length !== 1) throw Error('Observation activation requires its one actual worker observation.');
  for (const worker of workers) verifyOwnedWorkerSnapshotAdmission(capture, worker, pair, configuration);
  if (nested.length !== before.pendingFrame?.nestedSnapshots || nested.filter(row => !workers.includes(row)).some(row => row.tid !== before.tid || row.deferredPublication !== true || row.pendingFrame?.role !== 'nested' || row.pendingFrame?.frameTid !== before.tid || row.pendingFrame?.candidateIndex !== before.pendingFrame.candidateIndex || row.observedDebugEventOrdinal <= before.observedDebugEventOrdinal || row.observedDebugEventOrdinal >= after.observedDebugEventOrdinal)) throw Error('Observation activation captured outside its actual pending-frame thread.');
  return {verified: true, triggerBreakpointId: policy.breakpointId, triggerRawHit: policy.rawHit, triggerSnapshotOrdinal: trigger.ordinal, triggerTid: trigger.tid,
    activationDebugEventOrdinal: debugOrdinal, successfulGuards: guards.length, activatedSiteCount: ids.length, scope: 'frame-thread', nestedSnapshots: nested.length, ...(workers.length ? {ownedWorkerSnapshots: workers.length} : {})};
}
