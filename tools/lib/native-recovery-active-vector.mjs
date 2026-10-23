import {createCapturedMemory} from './captured-memory.mjs';
import {selectObservedOwnedNativeThread} from './native-thread-observations.mjs';

export const activeVectorAllocationMaxBytes = 65536;
export const activeVectorTransportMaxBytes = 16 * 1024 * 1024;
export function nativeRecoveryActiveVectorRanges(id) {
  return id === 'recovery-sound-channel-allocation-return'
    ? [{id: 'recovery-audio-vector-allocation-region', baseRegister: 'eax', readableRegion: true, maxRegionBytes: activeVectorTransportMaxBytes}]
    : [];
}

function proveWorkerIdentity(capture, rows, {managerAddress, mainTid, actual}, memory, order) {
  let result;
  for (const row of rows) {
    const m = memory(row), worker = row.ranges.get('recovery-audio-worker-object'), table = row.ranges.get('recovery-audio-manager-vtable');
    const workerAddress = m.readUInt32LE(managerAddress + 0x824), managerTable = m.readUInt32LE(managerAddress);
    if (!worker || Number(worker.address) !== workerAddress || worker.bytes.length !== 80 || !table || Number(table.address) !== managerTable || table.bytes.length !== 0x64 || table.bytes.readUInt32LE(0x60) !== actual(0x4b12d0)) throw Error('Recovery worker object/manager callback table provenance differs.');
    const b = worker.bytes, tid = b.readUInt32LE(0x24);
    if (!workerAddress || !tid || tid === mainTid || b.readUInt32LE() !== actual(0x5d39f0) || b.readUInt32LE(0x34) !== actual(0x4a3790) || b.readUInt32LE(0x38) !== workerAddress || b.readUInt32LE(0x44) !== actual(0x4a94a0) || b.readUInt32LE(0x48) !== managerAddress || b.readUInt32LE(0x4c) !== 20) throw Error('Recovery native worker stored TID/callback identities differ.');
    const association = selectObservedOwnedNativeThread(capture.nativeThreadRecords, tid, {atDebugEventOrdinal: order(row)});
    if (result && (result.objectAddress !== workerAddress || result.tid !== tid)) throw Error('Recovery worker identity changed across the observed factory.');
    result ??= {verified: true, objectAddress: workerAddress, tid, workerProcedure: b.readUInt32LE(0x34), selfArgument: b.readUInt32LE(0x38), pollCallback: b.readUInt32LE(0x44), managerArgument: b.readUInt32LE(0x48), managerCallback: table.bytes.readUInt32LE(0x60), pollingMilliseconds: b.readUInt32LE(0x4c), inputHex: b.toString('hex'), association, callerPathProved: false};
  }
  return result;
}

export function selectNativeRecoveryActiveVectorEvidence(capture, candidates, {factoryEntry, managerAddress, sourceAddress, mainTid, actual}) {
  const F = factoryEntry - 0x830, allocatorEsp = F - 40, copyEsp = F - 52;
  const memory = row => createCapturedMemory([...row.ranges.values()]).memory;
  const reg = (row, name) => {
    const value = Number(row.registers[name]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Recovery active vector requires actual x86 ${name}.`);
    return value;
  };
  const order = row => {
    if (!Number.isSafeInteger(row.observedDebugEventOrdinal) || row.observedDebugEventOrdinal < 1) throw Error('Recovery active vector requires actual observed order.');
    return row.observedDebugEventOrdinal;
  };
  const unique = (id, esp) => {
    const rows = candidates.filter(row => row.breakpointId === `recovery-sound-${id}` && reg(row, 'esp') === esp);
    if (rows.length !== 1) throw Error(`Recovery active vector requires one ${id} at its native factory ESP.`);
    return rows[0];
  };
  const entered = unique('factory-thread-return', F), left = unique('factory-leave-return', F);
  if (order(entered) >= order(left) || reg(entered, 'eax') !== mainTid) throw Error('Recovery active vector factory thread result/order differs from the observed main thread.');
  const entryMemory = memory(entered), entryHeader = entryMemory.readUInt32LE(managerAddress + 0x834);
  const entryBegin = entryMemory.readUInt32LE(entryHeader), entryEnd = entryMemory.readUInt32LE(entryHeader + 4), entryCapacity = entryMemory.readUInt32LE(entryHeader + 8);
  if (!entryHeader || !entryBegin || entryEnd < entryBegin || entryCapacity < entryEnd || (entryEnd - entryBegin) % 4 || (entryCapacity - entryBegin) % 4 || entryCapacity - entryBegin > activeVectorAllocationMaxBytes) throw Error('Recovery active vector entry header/bound differs.');
  if (entryEnd < entryCapacity) {
    const relevant = candidates.filter(row => order(row) > order(entered) && order(row) < order(left) && /^recovery-sound-channel-(allocation|memmove)-(call|return)$/.test(row.breakpointId) && (reg(row, 'edi') === entryHeader || [allocatorEsp, copyEsp].includes(reg(row, 'esp'))));
    if (relevant.length) throw Error('Recovery active vector no-growth branch contains an unproved growth observation.');
    const published = memory(left);
    if (entryEnd + 4 > entryCapacity || published.readUInt32LE(managerAddress + 0x834) !== entryHeader || published.readUInt32LE(entryHeader) !== entryBegin || published.readUInt32LE(entryHeader + 8) !== entryCapacity || published.readUInt32LE(entryHeader + 4) !== entryEnd + 4 || published.readUInt32LE(entryEnd) !== sourceAddress) throw Error('Recovery active vector no-growth publication differs.');
    const workerIdentity = proveWorkerIdentity(capture, [entered, left], {managerAddress, mainTid, actual}, memory, order);
    return {verified: true, mode: 'no-growth-needed', sourceReplayComplete: false, fullConcurrencyProved: false, factoryFrame: F, headerAddress: entryHeader,
      old: {begin: entryBegin, end: entryEnd, capacity: entryCapacity, used: (entryEnd - entryBegin) / 4, capacityCount: (entryCapacity - entryBegin) / 4},
      allocation: null, publicationOrdinal: left.ordinal, workerIdentity,
      limits: ['Actual before/after headers prove spare capacity, unchanged allocation and one appended source; no relevant growth observation is present.', 'No-growth is not inferred from a missing allocation transport. The worker caller path and full concurrency remain unproved.']};
  }
  const call = unique('channel-allocation-call', allocatorEsp), returned = unique('channel-allocation-return', allocatorEsp);
  const copyCall = unique('channel-memmove-call', copyEsp), copyReturn = unique('channel-memmove-return', copyEsp);
  const sequence = [entered, call, returned, copyCall, copyReturn, left];
  for (let i = 1; i < sequence.length; i++) if (order(sequence[i - 1]) >= order(sequence[i])) throw Error('Recovery active vector factory/growth/copy order differs.');
  if (reg(entered, 'eax') !== mainTid) throw Error('Recovery active vector factory thread result differs from the observed main thread.');
  const before = memory(call), header = before.readUInt32LE(managerAddress + 0x834), O = before.readUInt32LE(header), E = before.readUInt32LE(header + 4), C = before.readUInt32LE(header + 8);
  if (!header || !O || E < O || C !== E || (E - O) % 4 || C - O > activeVectorAllocationMaxBytes) throw Error('Recovery active vector requires its actual full allocated header.');
  const used = (E - O) / 4, capacity = (C - O) / 4, nextCapacity = Math.max(used + 1, capacity + Math.floor(capacity / 2)), requestedBytes = nextCapacity * 4;
  const P = reg(returned, 'eax');
  if (!requestedBytes || requestedBytes > activeVectorAllocationMaxBytes || !P || P + requestedBytes > 0x100000000 || P < C && P + requestedBytes > O) throw Error('Recovery active vector allocation exceeds its exact native bound or overlaps live old storage.');
  if (header !== entryHeader || O !== entryBegin || E !== entryEnd || C !== entryCapacity) throw Error('Recovery active vector changed between the owned factory lock and reserve.');
  const oldBytes = Buffer.from(before.subarray(O, E));
  const workerIdentity = proveWorkerIdentity(capture, sequence, {managerAddress, mainTid, actual}, memory, order);
  for (const row of sequence) {
    const m = memory(row);
    if ([call, returned, copyCall, copyReturn].includes(row)) {
      const direct = row.ranges.get('recovery-audio-channel-vector');
      if (!direct || Number(direct.address) !== header || direct.bytes.length !== 12 || direct.bytes.readUInt32LE() !== O || direct.bytes.readUInt32LE(4) !== E || direct.bytes.readUInt32LE(8) !== C || m.readUInt32LE(managerAddress + 0x834) !== header || !m.subarray(O, E).equals(oldBytes) || !m.readUInt32LE(managerAddress + 0x854 + 24) || m.readUInt32LE(managerAddress + 0x854 + 28) !== mainTid || reg(row, 'edi') !== header || reg(row, 'ebx') !== nextCapacity || reg(row, 'ebp') !== sourceAddress || reg(row, 'esi') !== ([call, returned].includes(row) ? 0 : P)) throw Error('Recovery active vector header/storage/reserve ABI differs.');
      for (const [address, value] of [[F - 36, F + 20], [F - 32, header], [F - 28, managerAddress], [F - 24, actual(0x40ec0b)], [F - 20, nextCapacity], [F - 16, m.readUInt32LE(managerAddress + 0x81c)], [F - 12, managerAddress + 0x854], [F - 8, actual(0x4a76ad)], [F - 4, F + 20], [F + 20, sourceAddress]]) if (m.readUInt32LE(address) !== value) throw Error('Recovery active vector factory append/growth private chain differs.');
      if (row === call || row === returned) {
        if (m.readUInt32LE(allocatorEsp) !== requestedBytes || row === call && (reg(row, 'eax') !== requestedBytes || reg(row, 'ecx') !== header) || row === returned && m.readUInt32LE(allocatorEsp - 4) !== actual(0x40f085)) throw Error('Recovery active vector actual request/return differs from EBX*4.');
      } else {
        if (m.readUInt32LE(copyEsp) !== P || m.readUInt32LE(copyEsp + 4) !== O || m.readUInt32LE(copyEsp + 8) !== oldBytes.length || row === copyReturn && m.readUInt32LE(copyEsp - 4) !== actual(0x40f0a8)) throw Error('Recovery active vector actual memmove arguments differ.');
        const destination = row.ranges.get('recovery-audio-channel-memmove-destination');
        if (!destination || Number(destination.address) !== P || destination.bytes.length !== 4) throw Error('Recovery active vector observed memmove prefix differs.');
      }
    }
  }
  const region = returned.ranges.get('recovery-audio-vector-allocation-region');
  if (!region || region.rangeMode !== 'readable-region' || Number(region.requestedResolvedRoot) !== P || Number(region.address) !== Number(region.regionBaseAddress) || Number(region.regionSize) !== region.bytes.length || region.bytes.length > activeVectorTransportMaxBytes || P < Number(region.address) || P + requestedBytes > Number(region.address) + region.bytes.length) throw Error('Recovery active vector genuine allocation preimage is not covered by its bounded transport.');
  const input = Buffer.from(region.bytes.subarray(P - Number(region.address), P - Number(region.address) + requestedBytes));
  const prefix = returned.ranges.get('recovery-audio-channel-allocation');
  if (!prefix || Number(prefix.address) !== P || prefix.bytes.length !== 4 || !prefix.bytes.equals(input.subarray(0, 4)) || !copyCall.ranges.get('recovery-audio-channel-memmove-destination').bytes.equals(input.subarray(0, 4)) || !copyReturn.ranges.get('recovery-audio-channel-memmove-destination').bytes.equals(oldBytes.subarray(0, 4))) throw Error('Recovery active vector allocation/copy prefix linkage differs.');
  const published = memory(left);
  if (published.readUInt32LE(header) !== P || published.readUInt32LE(header + 4) !== P + oldBytes.length + 4 || published.readUInt32LE(header + 8) !== P + requestedBytes || published.readUInt32LE(P + oldBytes.length) !== sourceAddress) throw Error('Recovery active vector actual append publication differs.');
  return {verified: true, mode: 'allocation-growth', sourceReplayComplete: false, fullConcurrencyProved: false, factoryFrame: F, headerAddress: header,
    old: {begin: O, end: E, capacity: C, used, capacityCount: capacity, bytes: oldBytes.length, inputHex: oldBytes.toString('hex')},
    allocation: {callOrdinal: call.ordinal, returnOrdinal: returned.ordinal, address: P, requestedBytes, capacityCount: nextCapacity, inputHex: input.toString('hex'), transportRegionBytes: region.bytes.length, maxTransportBytes: activeVectorTransportMaxBytes, maxRequestedBytes: activeVectorAllocationMaxBytes},
    memmove: {callOrdinal: copyCall.ordinal, returnOrdinal: copyReturn.ordinal, arguments: [P, O, oldBytes.length], beforePrefixHex: copyCall.ranges.get('recovery-audio-channel-memmove-destination').bytes.toString('hex'), afterPrefixHex: copyReturn.ranges.get('recovery-audio-channel-memmove-destination').bytes.toString('hex')},
    publicationOrdinal: left.ordinal, workerIdentity,
    limits: ['Only the exact allocator-return request span supplies the new vector preimage; later initialized storage is output evidence only.', 'Stored worker fields and owned debug TID association do not prove the lookup caller path or complete concurrent game execution.']};
}
