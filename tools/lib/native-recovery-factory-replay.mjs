import {createHash} from 'node:crypto';
import {createNativeFrameMemory as createCapturedMemory} from './native-frame-memory.mjs';
import {selectNativeRecoverySoundSnapshots} from './native-recovery-sound-selection.mjs';
import {createGameAudioSample, findGameAudioWaveform} from '../../src/game-audio-sample-factory.mjs';
import {nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {emitNativeEffect} from '../../src/effect-emitter.mjs';
import {dispatchNativeSound} from '../../src/sound-dispatch.mjs';
import {createNativeRecoveryFactoryServices, NativeRecoveryFactoryBoundary} from './native-recovery-factory-services.mjs';

const number = value => Number(value);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const imageIds = new Set(['recovery-audio-manager-root', 'recovery-audio-manager-vtable', 'recovery-audio-source-vtable',
  'recovery-audio-debugger-state', 'recovery-audio-application-path-globals', 'recovery-audio-resolver-crt-import',
  'recovery-audio-backend-vtable',
  'recovery-audio-installed-path-callback', 'recovery-audio-cookie', 'recovery-audio-play-format',
  'recovery-audio-debug-category-name', 'recovery-audio-gain', 'recovery-audio-reverb-guard',
  'recovery-audio-constructor-empty-strings', 'recovery-audio-constructor-fallback-name', 'recovery-audio-constructor-one',
  'sound-owner-vector-roots',
  ...Array.from({length: 10}, (_, index) => `recovery-audio-path-literal-${index}`)]);
function requireRange(snapshot, id) {
  const row = snapshot?.ranges?.get(id);
  if (!row || !Buffer.isBuffer(row.bytes)) throw Error(`Factory input requires observed ${id}.`);
  return row;
}
function wide(memory, address, limit = 512) {
  for (let length = 0; length < limit; length++) {
    if (!memory.readUInt16LE(address + length * 2)) return memory.subarray(address, address + length * 2).toString('utf16le');
  }
  throw Error('Factory CRT input lacks its bounded UTF16 terminator.');
}
export function nativeRecoveryFactoryInputAliases(rows, base) {
  const sorted = rows.filter(row => imageIds.has(row.id)).map(row => ({address: number(row.address) - base + 0x400000,
    targetAddress: number(row.address), length: row.bytes.length})).sort((a, b) => a.address - b.address);
  const aliases = [];
  for (const row of sorted) {
    const previous = aliases.at(-1);
    if (previous && previous.address + previous.length >= row.address) previous.length = Math.max(previous.length, row.address + row.length - previous.address);
    else aliases.push({...row});
  }
  return aliases;
}
function nestedSnapshots(capture, pair) {
  return capture.snapshots.filter(row => row.tid === pair.before.tid && row.observedDebugEventOrdinal > pair.before.observedDebugEventOrdinal
    && row.observedDebugEventOrdinal < pair.after.observedDebugEventOrdinal);
}
function oneAt(rows, actual, preferred) {
  const found = rows.filter(row => number(row.registers.eip) === actual(preferred));
  if (found.length !== 1) throw Error(`Factory requires one actual observation at0x${preferred.toString(16)}.`);
  return found[0];
}

//Input producers are the observed pre-comparison cache slots and path fields.
//No initialized source or waveform result is substituted for a game child.
export function inspectNativeRecoveryFactoryCache(capture, pair) {
  const actual = value => nativeCodeAddress(value, {moduleBaseAddress: pair.moduleBaseAddress});
  const rows = nestedSnapshots(capture, pair).filter(row => number(row.registers.eip) === actual(0x4a7b56));
  if (!rows.length) throw Error('Factory cache has no actual pre-comparison observations.');
  const first = rows[0], requested = requireRange(first, 'recovery-audio-cache-requested-path');
  const input = [...first.ranges].filter(([id]) => !['recovery-audio-cache-waveform', 'recovery-audio-cache-slot'].includes(id)).map(([, row]) => row);
  const root = requireRange(first, 'recovery-audio-manager-region'), manager = number(root.address);
  const slots = requireRange(first, 'recovery-audio-cache-vector-storage');
  const entries = [];
  for (const [index, snapshot] of rows.entries()) {
    const slot = requireRange(snapshot, 'recovery-audio-cache-slot'), waveform = requireRange(snapshot, 'recovery-audio-cache-waveform');
    const current = requireRange(snapshot, 'recovery-audio-cache-requested-path');
    if (!current.bytes.equals(requested.bytes) || number(current.address) !== number(requested.address)) throw Error('Factory cache requested input changes during its scan.');
    const offset = number(slot.address) - number(slots.address);
    if (offset !== index * 4 || slot.bytes.length !== 4 || !slot.bytes.equals(slots.bytes.subarray(offset, offset + 4))
      || slot.bytes.readUInt32LE() !== number(waveform.address)) throw Error('Factory cache producer differs from the initial actual vector.');
    //Only the read-before-comparison path is admitted from each nested record.
    input.push({address: number(waveform.address) + 0x1a, bytes: waveform.bytes.subarray(0x1a, 0x41a)});
    entries.push({snapshotOrdinal: snapshot.ordinal, debugEventOrdinal: snapshot.observedDebugEventOrdinal,
      slotAddress: number(slot.address), waveformAddress: number(waveform.address), file: waveform.file,
      path: wide(createCapturedMemory([{address: number(waveform.address), bytes: waveform.bytes}]).memory, number(waveform.address) + 0x1a)});
  }
  const bound = createCapturedMemory(input), m = bound.memory;
  const result = findGameAudioWaveform(manager, number(requested.address), {memory: m, scratchBase: number(first.registers.esp) + 12});
  if (result !== entries.at(-1).waveformAddress || entries.slice(0, -1).some(row => row.path === wide(m, number(requested.address)))) throw Error('Factory cache source scan disagrees with actual comparison sequence.');
  return {matched: true, sourceResult: result, requestedPath: wide(m, number(requested.address)), comparedEntries: entries.length,
    inputBoundary: 'Actual per-read pre-comparison inputs; not a full factory entry/exit replay.', entries};
}

class UnboundFactoryService extends Error {
  constructor(stop) {super(`Unbound factory ${stop.kind} ${stop.name}.`); this.stop = stop;}
}
class DescriptorPrefixBoundary extends Error {}
function boundedCrt(memory, calls) {
  const ascii = text => {if (/[^\x00-\x7f]/.test(text)) throw Error('Factory CRT comparison requires its declared ASCII path domain.'); return text;};
  const write = (address, capacity, text) => {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || text.length >= capacity) throw Error('Factory CRT valid-string bounds differ.');
    Buffer.from(`${text}\0`, 'utf16le').copy(memory.subarray(address, address + (text.length + 1) * 2));
  };
  return (name, args, runtime) => {
    const [a, b, c, d] = args;
    const row = {kind: 'CRT', name, args: [...args], entryEsp: runtime.scratchBase, returnAddress: memory.readUInt32LE(runtime.scratchBase)};
    calls.push(row);
    if (name === 'wcsncpy_s' || name === 'wcscpy_s') {write(a, b, wide(memory, c).slice(0, name === 'wcsncpy_s' ? d : undefined)); return 0;}
    if (name === 'wcscat_s') {write(a, b, wide(memory, a) + wide(memory, c)); return 0;}
    if (name === 'wcsstr') {const index = wide(memory, a).indexOf(wide(memory, b)); return index < 0 ? 0 : a + index * 2;}
    if (name === 'wcsncmp' || name === '_wcsicmp') {
      let left = wide(memory, a), right = wide(memory, b);
      if (name === '_wcsicmp') {left = ascii(left).toLowerCase(); right = ascii(right).toLowerCase();}
      else {left = left.slice(0, c); right = right.slice(0, c);}
      return left === right ? 0 : left < right ? -1 : 1;
    }
    if (name === '_wcslwr_s') {write(a, b, ascii(wide(memory, a)).toLowerCase()); return 0;}
    if (name === 'memset') {memory.subarray(a, a + c).fill(b & 255); return a;}
    if (name === 'strncpy_s') {
      let count = 0; while (count < d && memory.readUInt8(c + count)) count++;
      if (count >= b) throw Error('Factory CRT bounded ANSI capacity differs.');
      Buffer.from(memory.subarray(c, c + count)).copy(memory.subarray(a, a + count)); memory.writeUInt8(0, a + count); return 0;
    }
    throw new UnboundFactoryService({...row, obligation: 'Actual external result and allocation preimage when allocating; no game-child answer supplied.'});
  };
}

//Run the real outer4a7710 from observed caller inputs. Stop before the first
//unsupplied OS/CRT effect; neither infer filesystem answers nor borrow outputs.
export function attemptNativeRecoveryFactoryReplay(capture, pair, configuration, {bindObservedServices = false, typedSuccessfulFindFirst = false,
  includeContinuationAllocations = false, onFactoryCompleted} = {}) {
  if (typeof bindObservedServices !== 'boolean' || typeof typedSuccessfulFindFirst !== 'boolean' || typedSuccessfulFindFirst && !bindObservedServices) throw Error('Typed factory outputs require explicit observed-service binding.');
  if (typeof includeContinuationAllocations !== 'boolean' || onFactoryCompleted !== undefined && typeof onFactoryCompleted !== 'function') throw Error('Factory continuation requires explicit allocation/observer options.');
  const lineage = selectNativeRecoverySoundSnapshots(capture, pair, configuration), base = pair.moduleBaseAddress;
  const actual = value => nativeCodeAddress(value, {moduleBaseAddress: base}), nested = nestedSnapshots(capture, pair);
  const before = oneAt(nested, actual, 0x40dc8a), allocated = oneAt(nested, actual, 0x4a7499), constructor = oneAt(nested, actual, 0x4ad7e0);
  const stack = requireRange(pair.before, 'frame-stack'), callerStack = requireRange(before, 'recovery-audio-stack');
  const bytes = Buffer.from(stack.bytes), offset = number(callerStack.address) - number(stack.address);
  if (offset < 0 || offset + callerStack.bytes.length > bytes.length) throw Error('Factory caller stack is outside its original parent preimage.');
  callerStack.bytes.copy(bytes, offset);
  const rows = [...before.ranges].filter(([id]) => id !== 'recovery-audio-stack').map(([id, row]) => ({...row, id}));
  rows.push({...stack, bytes}, requireRange(pair.before, 'recovery-sound43-owner'), requireRange(allocated, 'recovery-audio-source-allocation'));
  const bankRoots = requireRange(pair.before, 'sound-owner-vector-roots'), bankRegion = requireRange(pair.before, 'recovery-sound-bank-region');
  const bankBegin = bankRoots.bytes.readUInt32LE(), bankEnd = bankRoots.bytes.readUInt32LE(4), bankOffset = bankBegin - number(bankRegion.address);
  if (bankOffset < 0 || bankEnd < bankBegin || bankEnd - number(bankRegion.address) > bankRegion.bytes.length) throw Error('Factory descriptor producer requires its actual bounded bank vector.');
  //The OS region also covers allocations created later. Admit only the live
  //original bank pointer words, never stale bytes at future allocation sites.
  rows.push({...bankRoots, id: 'sound-owner-vector-roots'}, {address: bankBegin, bytes: bankRegion.bytes.subarray(bankOffset, bankOffset + bankEnd - bankBegin)});
  for (const id of ['recovery-audio-constructor-empty-strings', 'recovery-audio-constructor-fallback-name', 'recovery-audio-constructor-one']) rows.push({...requireRange(constructor, id), id});
  if (bindObservedServices) {
    if (!lineage.bindingObservations?.verified) throw Error('Factory observed-service mode requires the rich binding profile.');
    //These are actual read-before-use cache/mixer/interface inputs. Do not
    //admit the manager-return initialized source or waveform as a seed.
    for (const snapshot of nested) {
      if (snapshot.breakpointId === 'recovery-sound-cache-entry') rows.push(requireRange(snapshot, 'recovery-audio-cache-waveform'));
      if (snapshot.breakpointId === 'recovery-sound-mixer-id-call') for (const id of ['recovery-audio-mixer-input', 'recovery-audio-mixer-vtable']) rows.push(requireRange(snapshot, id));
      if (snapshot.breakpointId === 'recovery-sound-com-call') for (const id of ['recovery-audio-com-engine', 'recovery-audio-com-vtable']) rows.push(requireRange(snapshot, id));
    }
  }
  const continuationAllocationInputs = [];
  if (includeContinuationAllocations) {
    const channel = lineage.channelVectorObservations, playback = lineage.bindingObservations?.allocation;
    if (!bindObservedServices || !channel?.verified || !playback || channel.allocation.returnOrdinal >= playback.callOrdinal) throw Error('Factory continuation requires its original channel and playback allocation lifetimes.');
    const wrapperSnapshot = oneAt(nested, actual, 0x40dc56), wrapper = requireRange(wrapperSnapshot, 'recovery-audio-wrapper-allocation');
    const channelSnapshot = capture.snapshots.find(row => row.ordinal === channel.allocation.returnOrdinal), channelRow = requireRange(channelSnapshot, 'recovery-audio-channel-allocation');
    const playbackSnapshot = capture.snapshots.find(row => row.ordinal === playback.returnOrdinal), region = requireRange(playbackSnapshot, 'recovery-audio-playback-allocation-region');
    const offset = playback.address - number(region.address);
    if (wrapperSnapshot.ordinal >= before.ordinal || number(wrapper.address) !== lineage.wrapperAddress || wrapper.bytes.length !== 12 || wrapper.bytes.toString('hex') !== lineage.allocationMemory.wrapper.inputHex
      || number(channelRow.address) !== channel.allocation.address || channelRow.bytes.length !== 4 || channelRow.bytes.toString('hex') !== channel.allocation.inputHex
      || offset < 0 || offset + playback.requestedBytes > region.bytes.length || region.bytes.subarray(offset, offset + playback.requestedBytes).toString('hex') !== playback.inputHex)
      throw Error('Factory continuation allocation-return preimages differ.');
    for (const [kind, ordinal, row] of [['wrapper', wrapperSnapshot.ordinal, wrapper], ['channel', channelSnapshot.ordinal, channelRow],
      ['playback-string', playbackSnapshot.ordinal, {address: playback.address, bytes: region.bytes.subarray(offset, offset + playback.requestedBytes)}]]) {
      rows.push(row); continuationAllocationInputs.push({kind, snapshotOrdinal: ordinal, address: number(row.address), length: row.bytes.length, sha256: sha256(row.bytes)});
    }
  }
  const bound = createCapturedMemory(rows, {aliases: nativeRecoveryFactoryInputAliases(rows, base)}), m = bound.memory;
  const S = number(before.registers.esp) - 4, descriptor = m.readUInt32LE(S + 4), owner = requireRange(pair.before, 'recovery-sound43-owner');
  const observedDescriptor = requireRange(constructor, 'recovery-audio-constructor-descriptor');
  //The real caller changes mode/position/velocity fields before the factory.
  //Run that existing game prefix from the original populated bank. Stop at its
  //first external allocation without returning an allocator/game-child answer.
  let descriptorPrefixStopped = false;
  try {
    emitNativeEffect(43, 0, lineage.emitterArguments, {dispatch40ea40: request => dispatchNativeSound(request, {memory: m,
      handlers: {allocate(size) {
        if (size !== 12) throw Error('Factory descriptor producer reached an unexpected allocation.');
        throw new DescriptorPrefixBoundary();
      }}})});
  } catch (error) {
    if (!(error instanceof DescriptorPrefixBoundary)) throw error;
    descriptorPrefixStopped = true;
  }
  if (!descriptorPrefixStopped) throw Error('Factory descriptor producer did not reach its actual wrapper allocation boundary.');
  if (descriptor !== number(owner.address) + 16 || descriptor !== number(observedDescriptor.address)
    || !bound.span(descriptor, 0x460).equals(observedDescriptor.bytes)) throw Error('Factory descriptor producer disagrees with its actual constructor input.');
  const allocation = requireRange(allocated, 'recovery-audio-source-allocation');
  if (number(allocation.address) !== lineage.sourceAddress || sha256(allocation.bytes) !== lineage.allocationMemory.source.inputSha256) throw Error('Factory source allocation preimage differs.');
  //This return word is the actual CPU CALL40dc8a effect, not saved child output.
  m.writeUInt32LE(actual(0x40dc8d), S);
  const calls = [], description = {descriptorAddress: descriptor, name: bound.span(descriptor, 24).toString('latin1').split('\0')[0],
    path: wide(m, descriptor + 0x30), streaming: m[descriptor + 0x459] !== 0};
  const unboundServices = {libraryCall: boundedCrt(m, calls), platformCall(name, args, runtime) {
    const stop = {kind: 'Win32', name, args: [...args], entryEsp: runtime.scratchBase, returnAddress: m.readUInt32LE(runtime.scratchBase),
      path: name === 'FindFirstFileW' || name === 'CreateFileW' ? wide(m, args[0]) : null,
      obligation: name === 'FindFirstFileW' ? 'Original HANDLE result and WIN32_FIND_DATAW output at args[1], including directory attributes.' : 'Original external result and documented output spans.'};
    calls.push(stop); throw new UnboundFactoryService(stop);
  }};
  const binding = bindObservedServices ? createNativeRecoveryFactoryServices({capture, pair, lineage, memory: m, crt: unboundServices.libraryCall, typedSuccessfulFindFirst}) : null;
  const services = binding?.services ?? unboundServices;
  let stop, result;
  try {
    result = createGameAudioSample(number(before.registers.ecx), descriptor, {memory: m, scratchBase: S, moduleBaseAddress: base,
      entryRegisters: Object.fromEntries(['ebx', 'ebp', 'esi', 'edi'].map(key => [key.toUpperCase(), number(before.registers[key])])),
      sehWord: m.readUInt32LE(number(requireRange(before, 'thread-seh-head').address)), services});
    if (!bindObservedServices) throw Error('Factory unexpectedly completed without the required external evidence.');
  } catch (error) {
    if (!(error instanceof UnboundFactoryService) && !(error instanceof NativeRecoveryFactoryBoundary)) throw error;
    stop = error.stop ?? error.boundary;
  }
  let outputComparison;
  if (result !== undefined) {
    const returned = oneAt(nested, actual, 0x40dc8d);
    const ids = ['recovery-audio-created-source', 'recovery-audio-created-waveform', 'recovery-audio-manager-region',
      'recovery-audio-application-path-globals', 'thread-seh-head',
      ...['cache', 'active', 'vector-838', 'pending', 'retired', 'mixer'].flatMap(name => [`recovery-audio-${name}-vector-object`, `recovery-audio-${name}-vector-storage`])];
    const comparisons = ids.map(id => {
      const row = requireRange(returned, id), address = number(row.address), expected = row.bytes, source = expected.length ? bound.span(address, expected.length) : Buffer.alloc(0);
      let offset = 0; while (offset < expected.length && source[offset] === expected[offset]) offset++;
      const difference = offset === expected.length ? null : {offset, address: address + offset, sourceHex: source.subarray(offset, offset + 24).toString('hex'), originalHex: expected.subarray(offset, offset + 24).toString('hex')};
      return {id, address, length: expected.length, matched: !difference, difference};
    });
    outputComparison = {matched: result === number(returned.registers.eax) && comparisons.every(row => row.matched),
      originalOrdinal: returned.ordinal, comparedBytes: comparisons.reduce((sum, row) => sum + row.length, 0),
      originalEax: number(returned.registers.eax), sourceEax: result, comparisons,
      limits: ['These are declared data-output regions at actual manager return. Private CPU/CRT scratch and volatile registers are not a complete factory ABI comparison.',
        'Every mismatch is retained; concurrent manager/game writes are not folded into Enter/Leave/GetCurrentThreadId service outcomes.']};
    if (onFactoryCompleted) onFactoryCompleted({memory: m, bound, lineage, services, sourceAddress: result, moduleBaseAddress: base, entryEsp: S});
  }
  return {complete: result !== undefined, matchedFullFactory: false, moduleBaseAddress: base, entry: actual(0x4a7710), entryEsp: S, description,
    descriptorProducer: {comparedBytes: 0x460, matched: true, boundary: 'Existing numeric484bb0/40ea40 prefix through first operatorNew12 request; no result returned. Privately saved caller frames are not claimed.'},
    allocationPreimage: {address: number(allocation.address), bytes: allocation.bytes.length, sha256: sha256(allocation.bytes), file: allocation.file},
    inputSnapshots: {parent: pair.before.ordinal, caller: before.ordinal, allocator: allocated.ordinal, immutableLiterals: constructor.ordinal},
    ...(includeContinuationAllocations ? {continuationAllocationInputs} : {}),
    stop, result, outputComparison, calls, ...(binding ? {externalCalls: binding.calls, privateOutputPreimages: binding.privateOutputPreimages, checkpoints: binding.checkpoints, consumedExternalEvents: binding.consumedEvents, expectedExternalEvents: binding.expectedEvents, externalLimits: binding.limits} : {}), cache: inspectNativeRecoveryFactoryCache(capture, pair),
    limits: ['Original parent-before private-stack bytes and descriptor input plus actual caller arguments are used; allocator preimage is not initialized output.',
      bindObservedServices ? 'Only verified original external service outcomes and bounded CRT semantics are supplied. No game child, empty bank or initialized source/voice answer is injected.' : 'The external CRT interface supplies declared bounded valid-string behavior only. No OS, COM, game child, empty bank or voice answer is injected.',
      ...(result === undefined ? ['The stopped attempt has no final factory comparison. Subsequent cache audit consumes actual per-read pre-comparison input fields separately.',
        'Concurrent post-Leave manager changes are outside this stopped attempt and are not attributed to an external service.']
        : ['The real cached factory completes. Its17 declared data regions and EAX are compared at actual manager return; this is not complete private CPU/CRT ABI equality.',
          'Typed successful Win32 outputs preserve reserved words and unused string tails. Their recorded private-buffer differences and volatile registers remain outside the declared-data comparison.',
          'The overall adaptive recovery/audio parent remains separate. Concurrent manager/game writes are never supplied as GetCurrentThreadId or other external service answers; any declared-data mismatch remains visible.'])]};
}
