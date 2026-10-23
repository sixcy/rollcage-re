const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
const scopeReasons = new Set(['different-pending-frame-thread', 'outside-pending-frame']);

// Additive trace preservation only. Scope records omit PID in the raw trace;
// their PID/event provenance comes from the actual current DEBUG_EVENT.
export function collectNativeThreadRecords(records) {
  const owners = records.flatMap((row, index) => row.type === 'owned-process' ? [{...row, traceRecordOrdinal: index + 1}] : []);
  if (!owners.length) return [];
  if (owners.length !== 1 || !positive(owners[0].pid) || !positive(owners[0].tid)) throw Error('Native thread evidence requires one valid owned-process identity.');
  const owner = owners[0], output = [owner]; let current = null, previousOrdinal = 0;
  for (const [index, row] of records.entries()) {
    const traceRecordOrdinal = index + 1;
    if (row.type === 'debug-event') {
      if (!positive(row.pid) || !positive(row.tid) || !positive(row.ordinal) || row.ordinal <= previousOrdinal || !Number.isInteger(row.event) || row.event < 1 || row.event > 9) throw Error('Native thread debug-event identity/order differs.');
      previousOrdinal = row.ordinal; current = {...row, traceRecordOrdinal};
      if ([2, 3, 4, 5].includes(row.event)) {
        if (row.pid !== owner.pid || traceRecordOrdinal <= owner.traceRecordOrdinal || row.event === 3 && row.tid !== owner.tid) throw Error('Native thread lifecycle is not owned by the captured process.');
        output.push({...row, traceRecordOrdinal, ownerTraceRecordOrdinal: owner.traceRecordOrdinal, ownedProcessPid: owner.pid, ownedMainTid: owner.tid,
          observedDebugEventOrdinal: row.ordinal, debugEventTraceRecordOrdinal: traceRecordOrdinal, debugEventPid: row.pid, debugEventTid: row.tid});
      }
    } else if (row.type === 'observation-skipped' && scopeReasons.has(row.reason)) {
      if (!current || current.traceRecordOrdinal <= owner.traceRecordOrdinal || current.event !== 1 || current.pid !== owner.pid || current.tid !== row.tid || row.pid !== undefined && row.pid !== owner.pid || !positive(row.tid) || !positive(row.rawHit) || typeof row.breakpointId !== 'string' || !row.breakpointId || row.nestedCaptureScope !== 'frame-thread' || row.matchingHitAdvanced !== false || row.originalInstructionSkipped !== false || row.reason === 'different-pending-frame-thread' && (row.pendingFrameActive !== true || !positive(row.pendingFrameTid) || row.pendingFrameTid === row.tid) || row.reason === 'outside-pending-frame' && (row.pendingFrameActive !== false || row.pendingFrameTid !== null)) throw Error('Native thread scope skip lacks matching owned debug-event provenance.');
      output.push({...row, traceRecordOrdinal, ownerTraceRecordOrdinal: owner.traceRecordOrdinal, ownedProcessPid: owner.pid, ownedMainTid: owner.tid,
        observedDebugEventOrdinal: current.ordinal, debugEventTraceRecordOrdinal: current.traceRecordOrdinal, debugEventPid: current.pid, debugEventTid: current.tid});
    }
  }
  return output;
}

export function selectObservedOwnedNativeThread(records, tid, {atDebugEventOrdinal} = {}) {
  if (!Array.isArray(records) || !positive(tid) || !positive(atDebugEventOrdinal)) throw Error('Native worker association requires explicit thread records and observation order.');
  const owners = records.filter(row => row.type === 'owned-process');
  if (owners.length !== 1 || !positive(owners[0].pid) || !positive(owners[0].tid) || !positive(owners[0].traceRecordOrdinal)) throw Error('Native worker association requires its owned-process anchor.');
  const owner = owners[0], matching = []; let previousTrace = owner.traceRecordOrdinal;
  for (const row of records.filter(row => row.type !== 'owned-process')) {
    const lifecycle = row.type === 'debug-event' && [2, 3, 4, 5].includes(row.event), skipped = row.type === 'observation-skipped' && scopeReasons.has(row.reason);
    if ((!lifecycle && !skipped) || !positive(row.traceRecordOrdinal) || row.traceRecordOrdinal <= previousTrace || row.ownerTraceRecordOrdinal !== owner.traceRecordOrdinal || row.ownedProcessPid !== owner.pid || row.ownedMainTid !== owner.tid || row.debugEventPid !== owner.pid || row.debugEventTid !== row.tid || !positive(row.observedDebugEventOrdinal) || !positive(row.debugEventTraceRecordOrdinal) || row.debugEventTraceRecordOrdinal <= owner.traceRecordOrdinal || row.debugEventTraceRecordOrdinal > row.traceRecordOrdinal || lifecycle && (row.pid !== owner.pid || row.ordinal !== row.observedDebugEventOrdinal || row.debugEventTraceRecordOrdinal !== row.traceRecordOrdinal) || skipped && (row.pid !== undefined && row.pid !== owner.pid || row.debugEventTraceRecordOrdinal === row.traceRecordOrdinal || row.nestedCaptureScope !== 'frame-thread' || row.matchingHitAdvanced !== false || row.originalInstructionSkipped !== false || row.reason === 'different-pending-frame-thread' && (row.pendingFrameActive !== true || !positive(row.pendingFrameTid) || row.pendingFrameTid === row.tid) || row.reason === 'outside-pending-frame' && (row.pendingFrameActive !== false || row.pendingFrameTid !== null))) throw Error('Native worker association thread-record ownership/provenance differs.');
    previousTrace = row.traceRecordOrdinal;
    if (row.tid === tid && row.observedDebugEventOrdinal <= atDebugEventOrdinal) matching.push(row);
  }
  if (records.some(row => row.type === 'debug-event' && row.event === 5 && row.observedDebugEventOrdinal <= atDebugEventOrdinal)) throw Error('Owned native process exited before the requested worker observation.');
  const lastExit = Math.max(0, ...matching.filter(row => row.type === 'debug-event' && row.event === 4).map(row => row.observedDebugEventOrdinal));
  const evidence = matching.find(row => row.observedDebugEventOrdinal > lastExit && (row.type === 'debug-event' && row.event === 2 || row.type === 'observation-skipped'));
  if (!evidence) throw Error('Stored native worker TID has no live owned debug observation.');
  return {verified: true, pid: owner.pid, tid, evidenceType: evidence.type === 'debug-event' ? 'owned-create-thread' : 'owned-frame-thread-scope-skip',
    traceRecordOrdinal: evidence.traceRecordOrdinal, debugEventTraceRecordOrdinal: evidence.debugEventTraceRecordOrdinal, observedDebugEventOrdinal: evidence.observedDebugEventOrdinal,
    ownerTraceRecordOrdinal: owner.traceRecordOrdinal, callerPathProved: false};
}
