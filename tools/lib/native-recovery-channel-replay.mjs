import {selectNativeRecoverySoundSnapshots} from './native-recovery-sound-selection.mjs';
import {createNativeRecoveryFactoryServices} from './native-recovery-factory-services.mjs';
import {createGameAudioSample} from '../../src/game-audio-sample-factory.mjs';
import {appendGameImagePointer} from '../../src/game-image-storage.mjs';
import {copyGameAudioSampleState, setGameAudioSampleGain, setGameAudioSampleFrameOffset} from '../../src/audio-sample-controls.mjs';
import {requestGameAudioSamplePlayback} from '../../src/audio-sample-playback-requests.mjs';
import {configureSoundPlayback} from '../../src/sound-dispatch.mjs';
import {nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {inspectNativeRecoverySourceServices} from './native-recovery-source-replay.mjs';

export class NativeRecoveryChannelBoundary extends Error {
  constructor(boundary) {super(boundary.message); this.boundary = boundary;}
}
const fail = (kind, message, details = {}) => {throw new NativeRecoveryChannelBoundary({kind, message, ...details});};
const n = value => Number(value), put = (m, p, value) => m.writeUInt32LE(value >>> 0, p);
function equal(actual, expected, message) {if (!actual.equals(expected)) fail('input-divergence', message, {sourceHex: actual.toString('hex'), originalHex: expected.toString('hex')});}

//Parent-owned memory is supplied by each source continuation. Allocation rows
//describe capacity only; their preimages are written at actual allocator return.
export function createNativeRecoveryAdaptiveSoundBindings({capture, pair, configuration, memory: declaredMemory} = {}) {
  const proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration), channel = proof.channelVectorObservations, playback = proof.bindingObservations?.allocation;
  if (!channel?.verified || !playback) fail('missing-evidence', 'Adaptive audio requires original channel and playback allocator observations.');
  const actual = value => nativeCodeAddress(value, {moduleBaseAddress: pair.moduleBaseAddress}), snapshots = new Map(capture.snapshots.map(row => [row.ordinal, row]));
  const observedServices = inspectNativeRecoverySourceServices(capture, pair, proof), playbackLock = observedServices.criticalSections.find(row => row.kind === 'playback');
  const nested = capture.snapshots.filter(row => row.tid === pair.before.tid && row.observedDebugEventOrdinal > pair.before.observedDebugEventOrdinal && row.observedDebugEventOrdinal < pair.after.observedDebugEventOrdinal);
  const one = id => {const rows = nested.filter(row => row.breakpointId === id); if (rows.length !== 1) fail('missing-evidence', `Adaptive audio requires one ${id}.`); return rows[0];};
  const required = [], additionalInputSpans = [], allocations = [], events = [], checkpoints = [];
  const add = (id, row, ordinal, offset = 0, length = row.bytes.length, preferredAddress) => {
    const part = {id, address: n(row.address) + offset, length, bytes: Buffer.from(row.bytes.subarray(offset, offset + length)),
      role: 'actual-read-before-use-input', originalOrdinal: ordinal, ...(preferredAddress === undefined ? {} : {preferredAddress})};
    required.push(part); additionalInputSpans.push(part);
  };
  const ctor = one('recovery-sound-constructor-entry');
  for (const [id, preferred] of [['empty-strings', 0x56fe60], ['fallback-name', 0x5d0320], ['one', 0x5dc774]]) add(`constructor-${id}`, ctor.ranges.get(`recovery-audio-constructor-${id}`), ctor.ordinal, 0, id === 'empty-strings' ? 96 : id === 'fallback-name' ? 24 : 4, preferred);
  const managerCall = one('recovery-sound-manager-call');
  add('backend-vtable', managerCall.ranges.get('recovery-audio-backend-vtable'), managerCall.ordinal);
  const cache = nested.filter(row => row.breakpointId === 'recovery-sound-cache-entry');
  for (const row of cache) add(`cache-path-${row.ordinal}`, row.ranges.get('recovery-audio-cache-waveform'), row.ordinal, 0x1a, 1024);
  const winner = cache.at(-1); add('cached-reference-count', winner.ranges.get('recovery-audio-cache-waveform'), winner.ordinal, 4, 4);
  add('cached-format', winner.ranges.get('recovery-audio-cache-waveform'), winner.ordinal, 8, 18);
  const mixers = nested.filter(row => row.breakpointId === 'recovery-sound-mixer-id-call');
  for (const row of mixers) {
    add(`mixer-vtable-pointer-${row.ordinal}`, row.ranges.get('recovery-audio-mixer-input'), row.ordinal, 0, 4);
    add(`mixer-id-${row.ordinal}`, row.ranges.get('recovery-audio-mixer-input'), row.ordinal, 8, 4);
    add(`mixer-slot-zero-${row.ordinal}`, row.ranges.get('recovery-audio-mixer-vtable'), row.ordinal);
  }
  add('selected-mixer-voice', mixers.at(-1).ranges.get('recovery-audio-mixer-input'), mixers.at(-1).ordinal, 0x48, 4);
  const com = one('recovery-sound-com-call');
  for (const name of ['engine', 'vtable']) add(`COM-${name}`, com.ranges.get(`recovery-audio-com-${name}`), com.ordinal);
  const wrapperReturn = one('recovery-sound-new-wrapper-return'), wrapperRow = wrapperReturn.ranges.get('recovery-audio-wrapper-allocation');
  const sourceReturn = one('recovery-sound-new-source-return'), sourceRow = sourceReturn.ranges.get('recovery-audio-source-allocation');
  const stringRegion = snapshots.get(playback.returnOrdinal).ranges.get('recovery-audio-playback-allocation-region');
  for (const [id, address, length, bytes, ordinal] of [
    ['wrapper', proof.wrapperAddress, 12, wrapperRow.bytes, wrapperReturn.ordinal],
    ['source', proof.sourceAddress, 0x9a8, sourceRow.bytes, sourceReturn.ordinal],
    ['channel', channel.allocation.address, 4, Buffer.from(channel.allocation.inputHex, 'hex'), channel.allocation.returnOrdinal],
    ['playback-string', playback.address, playback.requestedBytes, stringRegion.bytes.subarray(playback.address - n(stringRegion.address), playback.address - n(stringRegion.address) + playback.requestedBytes), playback.returnOrdinal],
  ]) {
    if (bytes.length !== length || ordinal <= pair.before.ordinal || ordinal >= pair.after.ordinal) fail('missing-evidence', 'Adaptive allocation requested span/lifetime differs.');
    const span = {id: `allocator-${id}`, address, length, role: 'allocator-output-capacity', initializeAt: 'matched-original-allocator-return', originalOrdinal: ordinal, preimageBytes: Buffer.from(bytes)};
    additionalInputSpans.push(span); allocations.push(span);
  }
  let activeMemory, factoryServices, selected, copied = false;
  const bind = runtime => {
    const m = runtime.memory;
    if (declaredMemory && m !== declaredMemory || activeMemory && m !== activeMemory) fail('memory-identity', 'Adaptive audio descendants must share the actual parent memory.');
    if (!activeMemory) {
      for (const row of required) equal(m.subarray(row.address, row.address + row.length), row.bytes, `Adaptive ${row.id} original input differs.`);
      for (const row of allocations) m.subarray(row.address, row.address + row.length);
      activeMemory = m;
      factoryServices = createNativeRecoveryFactoryServices({capture, pair, lineage: proof, memory: m, crt: library, typedSuccessfulFindFirst: true, allocationPreimagesAtReturn: true});
    }
    return m;
  };
  function allocate(name, args, runtime, row, callEsp, returnedAt) {
    const m = runtime.memory;
    if (name !== 'operatorNew' || args.length !== 1 || args[0] !== row.length || runtime.scratchBase !== callEsp - 4
      || m.readUInt32LE(runtime.scratchBase) !== actual(returnedAt) || m.readUInt32LE(runtime.scratchBase + 4) !== row.length)
      fail('external-abi', `Adaptive ${row.id} allocator ABI differs.`);
    row.preimageBytes.copy(m.subarray(row.address, row.address + row.length));
    events.push({name, allocation: row.id, address: row.address, bytes: row.length, originalOrdinal: row.originalOrdinal}); return row.address;
  }
  function library(name, args, runtime) {
    const m = runtime.memory, [a, b, c, d] = args;
    if (name === 'operatorNew') {
      if (runtime.scratchBase === channel.allocation.callEsp - 4) return allocate(name, args, runtime, allocations[2], channel.allocation.callEsp, 0x40f085);
      if (runtime.scratchBase === proof.bindingObservations.layout.allocationEsp - 4) return allocate(name, args, runtime, allocations[3], proof.bindingObservations.layout.allocationEsp, 0x4058e7);
      fail('external-abi', 'Adaptive allocator is outside its observed call.');
    }
    if (name === 'memmove') {
      const observed = channel.memmove;
      if (runtime.scratchBase !== observed.callEsp - 4 || args.some((value, index) => value !== observed.arguments[index]) || args.length !== 3
        || m.readUInt32LE(runtime.scratchBase) !== actual(0x40f0a8)) fail('external-abi', 'Adaptive original zero memmove ABI differs.');
      equal(m.subarray(a, a + 4), Buffer.from(observed.beforeHex, 'hex'), 'Adaptive memmove destination preimage differs.');
      if (c !== 0 || b !== 0 || observed.beforeHex !== observed.afterHex) fail('external-abi', 'Adaptive memmove requires its actual zero-length branch.');
      events.push({name, originalOrdinal: observed.returnOrdinal, args: [...args]}); return observed.actualReturnEax;
    }
    const wide = address => {let count = 0; while (count < 512 && m.readUInt16LE(address + count * 2)) count++; if (count === 512) fail('CRT-domain', 'Unterminated adaptive UTF16 input.'); return m.subarray(address, address + count * 2).toString('utf16le');};
    if (['wcsncpy_s', 'wcscpy_s', 'wcscat_s'].includes(name)) {
      let text = name === 'wcscat_s' ? wide(a) + wide(c) : wide(c).slice(0, name === 'wcsncpy_s' ? d : undefined);
      if (text.length >= b) fail('CRT-domain', 'Adaptive UTF16 capacity differs.'); Buffer.from(`${text}\0`, 'utf16le').copy(m.subarray(a, a + (text.length + 1) * 2)); return 0;
    }
    if (name === '_wcsicmp' || name === 'wcsncmp') {const left = name === '_wcsicmp' ? wide(a).toLowerCase() : wide(a).slice(0, c), right = name === '_wcsicmp' ? wide(b).toLowerCase() : wide(b).slice(0, c); return left === right ? 0 : left < right ? -1 : 1;}
    if (name === 'wcsstr') {const index = wide(a).indexOf(wide(b)); return index < 0 ? 0 : a + index * 2;}
    if (name === '_wcslwr_s') {const text = wide(a).toLowerCase(); if (text.length >= b) fail('CRT-domain', 'Adaptive lower-case capacity differs.'); Buffer.from(`${text}\0`, 'utf16le').copy(m.subarray(a, a + (text.length + 1) * 2)); return 0;}
    if (name === 'memset') {m.subarray(a, a + c).fill(b & 255); return a;}
    if (name === 'strncpy_s') {let count = 0; while (count < d && m.readUInt8(c + count)) count++; if (count >= b) fail('CRT-domain', 'Adaptive ANSI capacity differs.'); Buffer.from(m.subarray(c, c + count)).copy(m.subarray(a, a + count)); m.writeUInt8(0, a + count); return 0;}
    if (name === 'vsprintf_s') {
      const string = address => {let count = 0; while (count < 4096 && m.readUInt8(address + count)) count++; if (count === 4096) fail('CRT-domain', 'Adaptive ANSI formatter input lacks NUL.'); return m.subarray(address, address + count).toString('latin1');};
      if (c !== actual(0x5d3f00) || string(c) !== 'Playing %s') fail('CRT-domain', 'Adaptive original formatter differs.');
      const text = `Playing ${string(m.readUInt32LE(d))}`; if (text.length >= b) fail('CRT-domain', 'Adaptive formatter capacity differs.');
      Buffer.from(`${text}\0`, 'latin1').copy(m.subarray(a, a + text.length + 1)); return text.length;
    }
    if (name === 'memcpy') {
      if (runtime.scratchBase !== proof.bindingObservations.layout.assignmentEntry - 28 || a !== playback.address || b !== proof.bindingObservations.layout.formattedBuffer || c !== playback.stringLength
        || m.readUInt32LE(runtime.scratchBase) !== actual(0x4053da)) fail('external-abi', 'Adaptive last formatter memcpy ABI differs.');
      equal(m.subarray(b, b + c + 1), Buffer.from(playback.formattedBytesHex, 'hex'), 'Adaptive formatter source bytes differ.');
      const copy = proof.playbackCopyObservations;
      if (!copy?.verified) fail('unobserved-CRT-volatile', 'Original memcpy return ECX at4053da is required before the native debugger caller can continue; logger ECX is not used as an answer.', {call: actual(0x4053d5), returnAddress: actual(0x4053da), entryEsp: runtime.scratchBase, args: [...args]});
      if (runtime.scratchBase !== copy.esp - 4 || args.some((value, index) => value !== copy.arguments[index]) || !runtime.volatileRegisters) fail('external-abi', 'Adaptive actual memcpy context differs.');
      equal(m.subarray(a, a + playback.requestedBytes), Buffer.from(copy.beforeHex, 'hex'), 'Adaptive memcpy destination preimage differs.');
      Buffer.from(m.subarray(b, b + c)).copy(m.subarray(a, a + c));
      equal(m.subarray(a, a + playback.requestedBytes), Buffer.from(copy.afterHex, 'hex'), 'Adaptive memcpy actual output/tail differs.');
      runtime.volatileRegisters.ECX = copy.returnedRegisters.ecx;
      runtime.volatileRegisters.EDX = copy.returnedRegisters.edx;
      events.push({name, originalOrdinal: copy.returnOrdinal, args: [...args], returnedEcx: copy.returnedRegisters.ecx}); return copy.returnedRegisters.eax;
    }
    if (name === 'operatorDelete') {
      if (args.length !== 1 || a !== playback.address || runtime.scratchBase !== proof.bindingObservations.layout.frame - 8 || m.readUInt32LE(runtime.scratchBase) !== actual(0x4adb04) || playbackLockStage !== 3) fail('external-abi', 'Adaptive playback string deletion differs.');
      events.push({name, args: [...args], returnKind: 'void; native volatile registers not supplied'}); return;
    }
    fail('unbound-external', `Adaptive source reached unsupplied CRT ${name}.`);
  }
  const call = (m, args, top, returned) => {args.forEach((value, index) => put(m, top - args.length * 4 + index * 4, value)); const S = top - args.length * 4 - 4; put(m, S, actual(returned)); return S;};
  let playbackLockStage = 0;
  function playbackPlatform(name, args, runtime) {
    const m = runtime.memory, sequence = [['EnterCriticalSection', 0x4adaaa], ['GetCurrentThreadId', 0x4adab0], ['LeaveCriticalSection', 0x4adad9]], expected = sequence[playbackLockStage];
    const top = proof.bindingObservations.layout.frame, address = playbackLock.address;
    if (!expected || name !== expected[0] || m.readUInt32LE(runtime.scratchBase) !== actual(expected[1]) || runtime.scratchBase !== top - (name === 'GetCurrentThreadId' ? 4 : 8)
      || args.length !== (name === 'GetCurrentThreadId' ? 0 : 1) || args.length && args[0] !== address) fail('external-abi', 'Adaptive playback platform order/ABI differs.');
    if (name === 'EnterCriticalSection') {
      const manager = managerCall.ranges.get('recovery-audio-manager-region');
      equal(m.subarray(address, address + 32), manager.bytes.subarray(0x874, 0x894), 'Adaptive playback original lock input differs.');
      Buffer.from(playbackLock.enteredWin32BytesHex, 'hex').copy(m.subarray(address, address + 24));
    } else if (name === 'GetCurrentThreadId') {
      if (playbackLock.changedWin32ByteOffsets.length) fail('unbound-concurrency', 'Adaptive playback waiter changes require their separate producer.');
      equal(m.subarray(address, address + 24), Buffer.from(playbackLock.enteredWin32BytesHex, 'hex'), 'Adaptive thread query lock input differs.');
    } else {
      equal(m.subarray(address, address + 24), Buffer.from(playbackLock.afterThreadIdWin32BytesHex, 'hex'), 'Adaptive playback leave input differs.');
      if (m.readUInt32LE(address + 24) || m.readUInt32LE(address + 28)) fail('game-state', 'Adaptive game lock wrapper was not released by its own source.');
      Buffer.from(playbackLock.leftWin32BytesHex, 'hex').copy(m.subarray(address, address + 24));
    }
    playbackLockStage++; events.push({name, args: [...args], stage: 'playback'});
    return name === 'GetCurrentThreadId' ? playbackLock.threadId : 0;
  }
  function selectAdaptiveSoundChannelOnStack(input, runtime) {
    const m = bind(runtime), {sound, position, velocity, entryEsp, frame: F, incoming, maximum} = input;
    if (sound !== proof.ownerAddress || entryEsp !== proof.layout.selectorEntry || F !== proof.layout.selectorFrame || maximum > 0 || m.readUInt32LE(sound + 4) || m.readUInt32LE(sound + 8) || m.readUInt32LE(sound + 12)) fail('game-branch', 'Adaptive source binding requires its actual empty owner-vector branch.');
    if (position || velocity || m.readUInt32LE(sound + 0x480)) fail('game-branch', 'Adaptive positional/populated callable requires its actual additional game children.');
    const wrapperCall = one('recovery-sound-new-wrapper-call');
    const wrapper = allocate('operatorNew', [12], {...runtime, scratchBase: call(m, [12], F, 0x40dc56)}, allocations[0], n(wrapperCall.registers.esp), 0x40dc56);
    put(m, F + 24, wrapper); put(m, F + 40, 0);
    //Actual40eb10 empty std::function child, including its saved SEH/cookie.
    const temporary = F - 24, S = call(m, [sound + 0x470], temporary, 0x40dc82), previous = runtime.nativeTls.sehWord;
    put(m, S - 4, -1); put(m, S - 8, actual(0x569f78)); put(m, S - 12, previous); put(m, S - 16, temporary); put(m, S - 20, proof.managerAddress);
    put(m, S - 24, m.readUInt32LE(0x5e8890) ^ (S - 20)); put(m, temporary + 16, 0); put(m, S - 4, 0); runtime.nativeTls.sehWord = S - 12; runtime.nativeTls.sehWord = previous;
    const factoryS = call(m, [sound + 16], temporary, 0x40dc8d);
    const source = createGameAudioSample(proof.managerAddress, sound + 16, {...runtime, scratchBase: factoryS, sehWord: previous,
      entryRegisters: {EBX: sound, EBP: incoming.ebp, ESI: proof.managerAddress, EDI: wrapper}, services: factoryServices.services});
    put(m, wrapper, source); put(m, wrapper + 4, 0); put(m, wrapper + 8, 0); put(m, F + 40, -1); put(m, F + 24, wrapper);
    const appendS = call(m, [F + 24], F, 0x40dcba);
    appendGameImagePointer(sound + 4, F + 24, {...runtime, scratchBase: appendS, nativePointerVector: true, entryRegisters: {EBX: sound, EBP: incoming.ebp, ESI: proof.managerAddress, EDI: wrapper}, services: {libraryCall: library}});
    if (m.readUInt32LE(m.readUInt32LE(source) + 4) !== actual(0x4ad170)) fail('game-target', 'Adaptive selected source virtual04 differs.');
    copyGameAudioSampleState(source, sound + 16, {...runtime, scratchBase: call(m, [sound + 16], F, 0x40db8b), entryRegisters: {ESI: proof.managerAddress, EDI: wrapper}});
    runtime.nativeTls.sehWord = m.readUInt32LE(F + 32); selected = wrapper;
    checkpoints.push({stage: 'adaptive-channel-selected', wrapper, source, vector: m.readUInt32LE(sound + 4), vectorEnd: m.readUInt32LE(sound + 8)});
    return wrapper;
  }
  function playSelectedNativeSoundOnStack({request, channel: wrapper, sound, entryEsp}, runtime) {
    const m = bind(runtime), source = m.readUInt32LE(wrapper), top = entryEsp - 12;
    if (wrapper !== selected || sound !== proof.ownerAddress || entryEsp !== proof.layout.dispatchEntry || source !== proof.sourceAddress) fail('game-branch', 'Adaptive selected playback identity differs.');
    if (m.readUInt32LE(m.readUInt32LE(source) + 0x14) !== actual(0x4ad6a0)) fail('game-target', 'Adaptive gain target differs.');
    const gain = Math.fround(Math.fround(request.parameters.readInt32LE(0)) * m.readFloatLE(actual(0x5dc5dc)));
    const gainS = call(m, [0], top, 0x40eadc); m.writeFloatLE(gain, gainS + 4); setGameAudioSampleGain(source, gain, {...runtime, scratchBase: gainS});
    const rate = request.parameters.readInt32LE(4); if (rate >= 0) setGameAudioSampleFrameOffset(source, rate, {...runtime, scratchBase: call(m, [rate], top, 0x40eaeb)});
    const reverbS = call(m, [1], top, 0x40eaf7); configureSoundPlayback(wrapper, request.parameters.readInt32LE(12), 1, {...runtime, scratchBase: reverbS});
    if (m.readUInt32LE(m.readUInt32LE(source) + 0x2c) !== actual(0x4ad9e0)) fail('game-target', 'Adaptive play-request target differs.');
    requestGameAudioSamplePlayback(source, 0, {...runtime, scratchBase: call(m, [0], top, 0x40eb03), sehWord: runtime.nativeTls.sehWord,
      entryRegisters: {EBX: request.registerEdx, EBP: runtime.nativeStack.entryRegisters.ebp, ESI: wrapper, EDI: request.parameterAddress},
      services: {libraryCall: library, platformCall: playbackPlatform}});
    copied = true; return wrapper;
  }
  return {selectAdaptiveSoundChannelOnStack, playSelectedNativeSoundOnStack, additionalInputSpans, events, checkpoints,
    get factoryExternalEvents() {return factoryServices?.consumedEvents ?? 0;}, get playbackComplete() {return copied;},
    limits: ['Actual empty adaptive owner-vector branch only; reused/positional/callable paths remain explicit errors.',
      'Allocation preimages are genuine external outputs admitted only at validated allocator returns; no initialized game child output is supplied.',
      proof.playbackCopyObservations?.verified ? 'Original memcpy return registers come only from its observed external boundary; complete CPU/CRT private ABI remains unclaimed.' : 'Private CPU/CRT ABI is incomplete. Original memcpy return ECX at4053da is still required; logger ECX cannot seed that result.']};
}
