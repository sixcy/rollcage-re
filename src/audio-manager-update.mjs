import {getAudioStopwatch, readAudioNanoseconds} from './audio-stopwatch.mjs';
import {getAudioMixerLevel, getAudioMixerRamp, getAudioMixerRate} from './audio-mixer-update.mjs';
import {releaseXAudioSample} from './audio-sample-destruction.mjs';
import {updateAudioSourcePlaybackState, startAudioSourcePlayback} from './audio-source-update.mjs';
import {pollGameAudioStream} from './audio-stream-polling.mjs';
import {sortAudioSourceCandidates} from './audio-source-sorting.mjs';
import {queryGameAudioSampleActivity, isGameAudioSamplePending, getGameAudioLoopFlag, clearGameAudioSamplePending, getGameAudioSamplePolicyFlag, isGameAudioSampleEligible} from './audio-sample-controls.mjs';
import {prepareGameAudioSamplePlayback} from './audio-sample-stream-reopen.mjs';
import {updateAudioSourceParameters} from './audio-source-parameters.mjs';
import {growGameImagePointerCapacity, reserveGameImagePointers} from './game-image-storage.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
import {nativeCodeAddress} from './native-memory-spans.mjs';

const ptr = (m, p) => m.readUInt32LE(p), get = (m, p) => m.readInt32LE(p), put = (m, p, v) => m.writeUInt32LE(v >>> 0, p);
const f32 = Math.fround, u64 = n => BigInt.asUintN(64, n), low = n => Number(u64(n) & 0xffffffffn), high = n => Number(u64(n) >> 32n);
const A = (r, p) => nativeCodeAddress(p, r), ret = (r, p, v) => put(r.memory, p, A(r, v));
function save(r, rows) {for (const [name, offset] of rows) if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, r.scratchBase + offset, r.entryRegisters[name]);}
function entry(r) {if (!Number.isInteger(r.scratchBase)) throw Error('Audio manager update requires actual native entry ESP.'); return r.scratchBase;}
function preferred(r, child) {if (A(r, 0x400000) !== 0x400000) throw Error(`Unported relocated audio manager child ${child}; no implicit return-word rebasing.`);}
function call(r, kind, name, args, top, returned) {
  const m = r.memory; args.forEach((v, i) => put(m, top - args.length * 4 + i * 4, v));
  const S = top - args.length * 4 - 4; ret(r, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Audio manager requires genuine ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
const os = (r, name, args, top, returned) => call(r, 'platformCall', name, args, top, returned);
const crt = (r, name, args, top, returned) => call(r, 'libraryCall', name, args, top, returned);
function com(r, voice, slot, args, top, returned) {
  const target = ptr(r.memory, ptr(r.memory, voice) + slot);
  if (!voice || !target) throw Error('Audio manager reached an invalid original voice interface.');
  return call({...r, services: {...r.services, com: (_name, values, context) => {
    if (typeof r.services?.xAudio2Call !== 'function') throw Error('Audio manager requires genuine XAudio2 COM outcomes.');
    return r.services.xAudio2Call(voice, slot, values, {...context, interfaceTarget: target});
  }}}, 'com', slot, args, top, returned);
}
function releaseLock(r, lock, top, returned) {
  const m = r.memory, depth = get(m, lock + 24) - 1 | 0; put(m, lock + 24, depth);
  if (!depth) put(m, lock + 28, 0);
  return os(r, 'LeaveCriticalSection', [lock], top, returned);
}

//The old stopwatch port remains the preferred-base default. The original
//warm singleton/read arithmetic is also expressed here with explicit image
//identities for relocated manager calls; cold relocated initialization fails.
function stopwatch(r) {
  if (A(r, 0x400000) === 0x400000) return getAudioStopwatch(r);
  const m = r.memory, S = entry(r), F = S - 32;
  save(r, [['EBP', -4], ['EBX', -24], ['ESI', -28], ['EDI', -32]]);
  put(m, S - 8, -1); ret(r, S - 12, 0x56a30e); put(m, S - 16, r.sehWord); put(m, S - 20, F);
  if (!(get(m, A(r, 0x716d98)) & 1) || !ptr(m, A(r, 0x714b04))) throw Error('Unported relocated cold audio stopwatch initialization.');
  return ptr(m, A(r, 0x714b04));
}
function nanoseconds(watch, output, r) {
  if (A(r, 0x400000) === 0x400000) return readAudioNanoseconds(watch, output, r);
  const m = r.memory, S = entry(r), F = ((S - 4) & ~7) - 32;
  put(m, S + 4, output); save(r, [['EBP', -4]]);
  for (const [name, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) if (Number.isInteger(r.entryRegisters?.[name])) put(m, F + offset, r.entryRegisters[name]);
  os(r, 'QueryPerformanceCounter', [F + 24], F, 0x4a4ae9);
  const difference = u64(m.readBigUInt64LE(F + 24) - m.readBigUInt64LE(watch + 48)), frequency = m.readBigUInt64LE(watch + 40);
  put(m, F + 20, low(difference)); put(m, F + 16, low(frequency)); let quotient = 0n;
  const arithmetic = (left, right, divide, returned) => {
    put(m, F - 4, high(right)); put(m, F - 8, low(right)); put(m, F - 12, high(left)); put(m, F - 16, low(left)); ret(r, F - 20, returned);
    if (divide) {if (!right) throw RangeError('Native audio stopwatch division by zero.'); return u64(left) / u64(right);}
    if (high(left) || high(right)) put(m, F - 24, high(quotient)); return u64(left * right);
  };
  quotient = arithmetic(difference, frequency, true, 0x4a4b0e); put(m, F + 24, low(quotient));
  const product = arithmetic(frequency, quotient, false, 0x4a4b20), scaled = arithmetic(u64(difference - product), 1000000000n, false, 0x4a4b36);
  const fraction = arithmetic(scaled, frequency, true, 0x4a4b42), whole = arithmetic(quotient, 1000000000n, false, 0x4a4b57), value = u64(fraction + whole);
  output = ptr(m, S + 4); put(m, output + 4, high(value)); put(m, output, low(value)); return output;
}
function timestamp(top, output, watchReturn, readReturn, divideReturn, multiplyReturn, r) {
  ret(r, top - 4, watchReturn); const watch = stopwatch({...r, scratchBase: top - 4});
  put(r.memory, top - 4, output); ret(r, top - 8, readReturn);
  const out = nanoseconds(watch, output, {...r, scratchBase: top - 8});
  const ns = r.memory.readBigInt64LE(out); r.memory.writeBigUInt64LE(1000n, top - 8); r.memory.writeBigInt64LE(ns, top - 16); ret(r, top - 20, divideReturn);
  const quotient = BigInt.asIntN(64, ns / 1000n);
  r.memory.writeBigUInt64LE(1000n, top - 8); r.memory.writeBigUInt64LE(u64(quotient), top - 16); ret(r, top - 20, multiplyReturn);
  if (high(quotient)) put(r.memory, top - 24, r.entryRegisters?.EBX ?? 0);
  return u64(quotient * 1000n);
}

//4a90f0's real hierarchy algorithm, retaining its own shared-stack frame and
//original getter slots. The field-only existing getters need no relocation.
function mixerHierarchy(object, r) {
  const m = r.memory, S = entry(r), F = S - 16; save(r, [['ESI', -12], ['EDI', -16]]);
  const getter = (input, slot, target, returned, implementation) => {
    if (ptr(m, ptr(m, input) + slot) !== A(r, target)) throw Error('Unported original mixer hierarchy getter.');
    ret(r, F - 4, returned); return implementation(input, r);
  };
  let value = getter(object, 0x10, 0x4a9320, 0x4a90fe, getAudioMixerRamp); m.writeFloatLE(value, F + 8);
  value = getter(object, 8, 0x4a9300, 0x4a910b, getAudioMixerLevel); m.writeFloatLE(value * m.readFloatLE(F + 8), object + 0x38);
  value = getter(object, 0x20, 0x4a9360, 0x4a911b, getAudioMixerRate); let parent = ptr(m, object + 4), one = m.readFloatLE(A(r, 0x5dc774));
  m.writeFloatLE(value, object + 0x3c);
  while (parent) {
    value = getter(parent, 0x10, 0x4a9320, 0x4a9139, getAudioMixerRamp); m.writeFloatLE(value, F + 8);
    value = getter(parent, 8, 0x4a9300, 0x4a9146, getAudioMixerLevel); one = m.readFloatLE(A(r, 0x5dc774)); m.writeFloatLE(value, F + 12);
    m.writeFloatLE(f32(m.readFloatLE(object + 0x38) - f32(one - f32(m.readFloatLE(F + 8) * m.readFloatLE(F + 12)))), object + 0x38);
    value = getter(parent, 0x20, 0x4a9360, 0x4a9179, getAudioMixerRate); m.writeFloatLE(value * m.readFloatLE(object + 0x3c), object + 0x3c);
    parent = ptr(m, parent + 4); if (!parent) one = m.readFloatLE(A(r, 0x5dc774));
  }
  value = m.readFloatLE(object + 0x38); m.writeFloatLE(value < 0 ? 0 : value > one ? one : value, object + 0x38);
  value = m.readFloatLE(object + 0x3c); m.writeFloatLE(value > 0 ? value : 0, object + 0x3c);
}

function sampleQuery(object, slot, args, top, returned, r) {
  const m = r.memory, target = ptr(m, ptr(m, object) + slot);
  args.forEach((v, i) => put(m, top - args.length * 4 + i * 4, v)); const S = top - args.length * 4 - 4; ret(r, S, returned);
  const child = {...r, scratchBase: S};
  if (target === A(r, 0x4ad570)) return isGameAudioSamplePending(object, child);
  if (target === A(r, 0x4ad580)) return queryGameAudioSampleActivity(object, args[0], child) & 255;
  if (target === A(r, 0x4ad500)) return getGameAudioLoopFlag(object, child);
  if (target === A(r, 0x4ad5b0)) return clearGameAudioSamplePending(object, child);
  if (target === A(r, 0x4ad5e0)) return getGameAudioSamplePolicyFlag(object, child);
  if (target === A(r, 0x4ad4c0)) {if (m[object + 0x45e] && ptr(m, object + 0x96c)) preferred(r, 'spatial source eligibility4ad4c0'); return isGameAudioSampleEligible(object, child);}
  throw Error(`Unported manager source virtual target0x${target.toString(16)}.`);
}

//The three inlined remove/erase sequences in4a6600 preserve unused tails,
//late live header loads and their original zero/nonzero CRT memmove calls.
function removeRetired(header, target, B, F, which, r) {
  const m = r.memory, end = ptr(m, header + 4); let output = ptr(m, header);
  while (output !== end && ptr(m, output) !== target) output += 4;
  if (output !== end) {
    let input = output + 4; const count = input > end ? 0 : ((end - input + 3) >>> 2), zero = which === 0 ? -0x34 : -0x3c, size = which === 0 ? -0x3c : -0x34;
    put(m, B + zero, 0); put(m, B - 0x20, 0); put(m, B + size, count);
    for (let i = 0; i < count; i++, input += 4) {const value = ptr(m, input); if (value !== target) {put(m, output, value); output += 4;} put(m, B - 0x20, i + 1);}
  }
  const reset = output === ptr(m, header) && end === ptr(m, header + 4);
  if (reset) put(m, header + 4, ptr(m, header));
  else if (output !== end) {
    const bytes = (get(m, header + 4) - end) & ~3; put(m, B - 0x3c, bytes);
    crt(r, 'memmove', [output, end, bytes >>> 0], F, [0x4a6857, 0x4a68f7, 0x4a69a6][which]); put(m, header + 4, output + bytes);
  }
  return reset;
}

//4a6600 and its retained4a6a6d normal tail. No manager output or observed
//concurrency transition is copied into game state: wrapper writes are here.
export function updateAudioManager(manager, runtime) {
  const m = runtime.memory, S = entry(runtime), B = S - 4, F = S - 0x54;
  save(runtime, [['EBP', -4], ['EBX', -0x4c], ['ESI', -0x50], ['EDI', -0x54]]);
  put(m, B - 4, -1); ret(runtime, B - 8, 0x56a3a0); put(m, B - 12, runtime.sehWord); put(m, B - 0x18, manager); put(m, B - 0x10, F);
  const seh = B - 12, regs = {...runtime.entryRegisters, EBP: B, EBX: manager};
  const r = {...runtime, sehWord: seh, entryRegisters: regs};
  if (!(get(m, A(r, 0x716df8)) & 1)) {put(m, A(r, 0x716e00), -1); put(m, A(r, 0x716df8), ptr(m, A(r, 0x716df8)) | 1); put(m, A(r, 0x716e04), 0x7fffffff);}
  const time = timestamp(F, B - 0x40, 0x4a6650, 0x4a665b, 0x4a666c, 0x4a667a, r); m.writeBigUInt64LE(time, A(r, 0x716e00));
  const signal = manager + 0x8cc; os(r, 'ResetEvent', [ptr(m, signal + 8)], F, 0x4a6694); put(m, signal, ptr(m, signal) + 1); os(r, 'SetEvent', [ptr(m, signal + 4)], F, 0x4a66a6);
  const enterImport = ptr(m, A(r, 0x56e094)), tidImport = ptr(m, A(r, 0x56e09c)), outer = manager + 0x894;
  os(r, 'EnterCriticalSection', [outer], F, 0x4a66b5); let tid = os(r, 'GetCurrentThreadId', [], F, 0x4a66bd); put(m, outer + 24, get(m, outer + 24) + 1); put(m, outer + 28, tid);
  if (m[manager + 0x820] === 1) {
    const activeLock = manager + 0x854; put(m, B - 4, 0);
    os(r, 'EnterCriticalSection', [activeLock], F, 0x4a66e3); tid = os(r, 'GetCurrentThreadId', [], F, 0x4a66e5); put(m, activeLock + 24, get(m, activeLock + 24) + 1); put(m, activeLock + 28, tid);
    const nextTime = timestamp(F, B - 0x40, 0x4a66f0, 0x4a66fb, 0x4a670c, 0x4a671a,
      {...r, entryRegisters: {...regs, EBX: tidImport, ESI: activeLock, EDI: enterImport}});
    const headers = [ptr(m, manager + 0x834), ptr(m, manager + 0x83c), ptr(m, manager + 0x838)];
    headers.forEach((v, i) => put(m, B - 0x24 - i * 4, v)); const retired = ptr(m, manager + 0x840); put(m, B - 0x30, retired); m.writeBigUInt64LE(nextTime, manager + 0x8b8);
    const pendingLock = manager + 0x874; os(r, 'EnterCriticalSection', [pendingLock], F, 0x4a6756); tid = os(r, 'GetCurrentThreadId', [], F, 0x4a6758); put(m, pendingLock + 24, get(m, pendingLock + 24) + 1); put(m, pendingLock + 28, tid);
    const retiredEnd = ptr(m, retired + 4); put(m, B - 0x14, retiredEnd);
    for (let iterator = ptr(m, retired); iterator !== retiredEnd; iterator += 4) {
      const source = ptr(m, iterator); put(m, B - 0x1c, source);
      if (sampleQuery(source, 0x3c, [], F, 0x4a6786, r) === 1) {
        let voice = ptr(m, source + 0x97c); if (voice) com(r, voice, 0x50, [voice, 32, 0], F, 0x4a679e);
        voice = ptr(m, source + 0x97c); com(r, voice, 0x58, [voice], F, 0x4a67aa); m[source + 0x99c] = 1; put(m, source + 0x948, 0);
      }
      let workingReset; headers.forEach((header, index) => {const reset = removeRetired(header, source, B, F, index, r); if (index === 2) workingReset = reset;});
      const target = ptr(m, ptr(m, source)); if (target !== A(r, 0x4ad8f0)) throw Error('Unported manager source deleting destructor.'); preferred(r, 'releaseXAudioSample4ad8f0');
      put(m, F - 4, 1); ret(r, F - 8, workingReset ? 0x4a6986 : 0x4a69bd); releaseXAudioSample(source, 1, {...r, scratchBase: F - 8, entryRegisters: {...regs, ESI: ptr(m, headers[2] + 4), EDI: iterator, EBX: retiredEnd}});
    }
    put(m, retired + 4, ptr(m, retired)); releaseLock(r, pendingLock, F, 0x4a69e9);
    const mixerHeader = ptr(m, manager + 0x84c); let iterator = ptr(m, mixerHeader), end = ptr(m, mixerHeader + 4);
    put(m, B - 0x38, ptr(m, A(r, 0x5dc9d8))); put(m, B - 0x34, ptr(m, A(r, 0x5dc9dc)));
    while (iterator !== end) {
      const mixer = ptr(m, iterator), table = ptr(m, mixer); if (ptr(m, table + 0x28) !== A(r, 0x4a9380)) throw Error('Unported manager mixer-ramp target.');
      ret(r, F - 4, 0x4a6a18); const seconds = Number(m.readBigInt64LE(A(r, 0x716e00))) / m.readDoubleLE(B - 0x38), value = f32(seconds);
      m.writeFloatLE(value, F - 4); ret(r, F - 8, 0x4a6a2e);
      const next = f32(f32(m.readFloatLE(mixer + 0x30) * m.readFloatLE(F - 4)) + m.readFloatLE(mixer + 0x2c)); m.writeFloatLE(next, mixer + 0x2c);
      const one = m.readFloatLE(A(r, 0x5dc774)); m.writeFloatLE(next < 0 ? 0 : next > one ? one : next, mixer + 0x2c); iterator += 4;
    }
    const currentMixers = ptr(m, manager + 0x84c); iterator = ptr(m, currentMixers); end = ptr(m, currentMixers + 4);
    while (iterator !== end) {ret(r, F - 4, 0x4a6a4c); mixerHierarchy(ptr(m, iterator), {...r, scratchBase: F - 4, entryRegisters: {...regs, ESI: iterator, EDI: end}}); iterator += 4;}
    ret(r, F - 4, 0x4a6a58); updateAudioManagerSources(manager, {...r, scratchBase: F - 4, entryRegisters: {...regs, ESI: iterator, EDI: end}});
    put(m, B - 4, -1); releaseLock(r, activeLock, F, 0x4a6a8d); os(r, 'Sleep', [0], F, 0x4a6a95); put(m, B - 4, 2);
    const streamHeader = ptr(m, manager + 0x844); iterator = ptr(m, streamHeader); end = ptr(m, streamHeader + 4);
    while (iterator !== end) {
      const source = ptr(m, iterator), decoder = ptr(m, source + 0x968), target = ptr(m, ptr(m, decoder) + 0x10); ret(r, F - 4, 0x4a6aba);
      if (target !== A(r, 0x4029b0)) throw Error('Unported manager decoder-ready target.'); preferred(r, 'pollGameAudioStream4aefc0');
      ret(r, F - 4, 0x4a6ac9); pollGameAudioStream(ptr(m, source + 0x968), {...r, scratchBase: F - 4, entryRegisters: {...regs, EBX: source, ESI: iterator, EDI: end}}); iterator += 4;
    }
    const queued = ptr(m, manager + 0x848); iterator = ptr(m, queued); end = ptr(m, queued + 4);
    if (iterator !== end) throw Error('Unported reached queued-source next-playback virtual44 manager consumer.');
  }
  releaseLock(r, outer, F, 0x4a6b28); os(r, 'ResetEvent', [ptr(m, signal + 4)], F, 0x4a6b3a); put(m, signal, ptr(m, signal) + 1); os(r, 'SetEvent', [ptr(m, signal + 8)], F, 0x4a6b48);
  return 1;
}

//4a6b60. The currently supported prefix consumes actual timing and candidate
//state; unsupported populated branches are genuine reached errors below.
export function updateAudioManagerSources(manager, runtime) {
  const m = runtime.memory, S = entry(runtime), savedB = S - 4, aligned = savedB & ~7, F = aligned - 0x48;
  save(runtime, [['EBP', -4]]); put(m, aligned - 4, -1); ret(runtime, aligned - 8, 0x56a3f6); put(m, aligned - 12, runtime.sehWord);
  for (const [name, offset] of [['EBX', 12], ['ESI', 4], ['EDI', 0]]) if (Number.isInteger(runtime.entryRegisters?.[name])) put(m, F + offset, runtime.entryRegisters[name]); put(m, F + 8, savedB);
  const r = {...runtime, sehWord: aligned - 12, entryRegisters: {...runtime.entryRegisters, EBP: manager}};
  if (!(get(m, A(r, 0x716e08)) & 1)) {
    put(m, A(r, 0x716e08), ptr(m, A(r, 0x716e08)) | 1); put(m, F + 0x44, 0); for (const p of [0x716e0c, 0x716e10, 0x716e14]) put(m, A(r, p), 0);
    crt(r, 'registerExit', [A(r, 0x56da20)], F, 0x4a6bc5); put(m, F + 0x44, -1);
  }
  const time = timestamp(F, F + 0x20, 0x4a6bd5, 0x4a6be1, 0x4a6bf2, 0x4a6c00, r);
  if (ptr(m, manager + 0x8e0) === 0xffffffff && ptr(m, manager + 0x8e4) === 0x7fffffff) m.writeBigUInt64LE(time, manager + 0x8e0);
  const difference = u64(time - m.readBigUInt64LE(manager + 0x8e0)); m.writeBigUInt64LE(difference, manager + 0x8e8); m.writeBigUInt64LE(time, manager + 0x8e0);
  put(m, A(r, 0x716e10), ptr(m, A(r, 0x716e0c)));
  const working = ptr(m, manager + 0x838), streams = ptr(m, manager + 0x844); put(m, F + 0x18, working); put(m, F + 0x1c, streams);
  let iterator = ptr(m, working), nextSlot = iterator + 4, nativeEdi = runtime.entryRegisters?.EDI;
  const candidateVector = A(r, 0x716e0c);
  while (iterator !== ptr(m, working + 4)) {
    const source = ptr(m, iterator), paused = m[manager + 0x821], changed = Number(m[A(r, 0x714b14)] !== paused);
    preferred(r, 'updateAudioSourcePlaybackState4adc40');
    put(m, F - 4, (working & 0xffffff00) | paused); put(m, F - 8, changed); put(m, F + 0x14, source); ret(r, F - 12, 0x4a6ca1);
    const childRegs = {...r.entryRegisters, EBX: nextSlot, ESI: iterator, EDI: source}; nativeEdi = source;
    updateAudioSourcePlaybackState(source, {...r, scratchBase: F - 12, entryRegisters: childRegs});
    if (!ptr(m, source + 0x948) && ptr(m, source + 0x94c) === 4) {
      crt(r, 'memmove', [iterator, nextSlot, (get(m, working + 4) - nextSlot) & ~3], F, 0x4a6cc8); put(m, working + 4, ptr(m, working + 4) - 4); continue;
    }
    if (m[source + 0x45e] === 1) throw Error('Unported reached manager spatial listener/attenuation branch4a6ceb.');
    m.writeFloatLE(f32(m.readFloatLE(source + 0x494) * m.readFloatLE(source + 0x43c)), source + 0x958); put(m, source + 0x970, 0);
    const input = F + 0x14, begin = ptr(m, candidateVector), end = ptr(m, candidateVector + 4), inside = input < end && begin <= input, index = inside ? (input - begin) >> 2 : -1;
    if (inside) nativeEdi = index;
    if (end === ptr(m, candidateVector + 8)) {
      ret(r, F - 8, inside ? 0x4a6eb3 : 0x4a6edc);
      growGameImagePointerCapacity(candidateVector, {...r, scratchBase: F - 8, nativePointerVector: true, entryRegisters: {...childRegs, EDI: nativeEdi}});
    }
    const output = ptr(m, candidateVector + 4); if (output) put(m, output, inside ? ptr(m, ptr(m, candidateVector) + index * 4) : nativeEdi);
    put(m, candidateVector + 4, ptr(m, candidateVector + 4) + 4); iterator += 4; nextSlot += 4;
  }
  m[A(r, 0x714b14)] = m[manager + 0x821];
  const begin = ptr(m, candidateVector), candidateEnd = ptr(m, candidateVector + 4), candidateCount = (candidateEnd - begin) >> 2;
  put(m, F - 4, ptr(m, F + 0x20)); put(m, F - 8, candidateCount); ret(r, F - 12, 0x4a6f30);
  sortAudioSourceCandidates(begin, candidateEnd, {...r, scratchBase: F - 12, entryRegisters: {...r.entryRegisters, EBX: streams, ESI: iterator, EDI: nativeEdi}});
  const maximum = Math.min(candidateCount >>> 0, ptr(m, manager + 0x850)); put(m, F + 0x18, maximum);
  for (let i = maximum; i < (ptr(m, candidateVector + 4) - ptr(m, candidateVector)) >>> 2; i++) {
    const source = ptr(m, ptr(m, candidateVector) + i * 4);
    if (sampleQuery(source, 0x3c, [], F, 0x4a6f6a, r) === 1) throw Error('Unported reached manager over-limit source debugger/stop branch4a6f72.');
  }
  ret(r, F - 4, 0x4a7056); getApplicationDebugger({...r, scratchBase: F - 4, nativeDebuggerFrame: 'direct', entryRegisters: {...r.entryRegisters, EBX: streams, ESI: iterator, EDI: maximum, ECX: ptr(m, candidateVector)}});
  if (!(get(m, A(r, 0x714b10)) & 1)) throw Error('Unported reached inlined manager debugger-category registration4a7063.');
  for (let i = 0; i < (ptr(m, candidateVector + 4) - ptr(m, candidateVector)) >>> 2; i++) {
    const source = ptr(m, ptr(m, candidateVector) + i * 4), child = {...r, entryRegisters: {...r.entryRegisters, EBX: maximum, ESI: source, EDI: i}};
    if (m[manager + 0x821] && sampleQuery(source, 0x24, [], F, 0x4a71a5, child)) continue;
    if (sampleQuery(source, 0x4c, [], F, 0x4a71b6, child) !== 1 || sampleQuery(source, 0x38, [1], F, 0x4a71c9, child) !== 1 || i >= maximum) continue;
    let resume = false;
    if (sampleQuery(source, 0x38, [0], F, 0x4a71e4, child) === 1 && !sampleQuery(source, 0x3c, [], F, 0x4a71f1, child)) resume = true;
    const restart = ptr(m, source + 0x94c) === 3 && !m[source + 0x950]; m[F + 0x13] = Number(resume);
    if (!resume && !restart) {
      if (ptr(m, ptr(m, manager) + 0x60) !== A(r, 0x4b12d0)) throw Error('Unported manager source-parameters virtual60 target.');
      put(m, F - 4, 0); put(m, F - 8, source); ret(r, F - 12, 0x4a722c); updateAudioSourceParameters(manager, source, 0, {...child, scratchBase: F - 12}); continue;
    }
    if (sampleQuery(source, 0x3c, [], F, 0x4a723e, child) === 1) {
      let voice = ptr(m, source + 0x97c); if (voice) com(child, voice, 0x50, [voice, 32, 0], F, 0x4a7256);
      voice = ptr(m, source + 0x97c); com(child, voice, 0x58, [voice], F, 0x4a7262); m[source + 0x99c] = 1; put(m, source + 0x948, 0);
    }
    if (resume) throw Error('Unported reached manager resuming-source debugger branch4a727a.');
    preferred(r, 'prepareGameAudioSamplePlayback4addc0'); ret(r, F - 4, 0x4a72e7);
    if (prepareGameAudioSamplePlayback(source, {...child, scratchBase: F - 4}) !== 1) continue;
    if (ptr(m, ptr(m, manager) + 0x60) !== A(r, 0x4b12d0)) throw Error('Unported manager source-parameters virtual60 target.');
    put(m, F - 4, 1); put(m, F - 8, source); ret(r, F - 12, 0x4a72f6); updateAudioSourceParameters(manager, source, 1, {...child, scratchBase: F - 12});
    ret(r, F - 4, 0x4a72fd); startAudioSourcePlayback(source, {...child, scratchBase: F - 4});
  }
  put(m, streams + 4, ptr(m, streams));
  let finalEax = ptr(m, streams);
  for (let i = 0; i < ptr(m, F + 0x18); i++) {
    finalEax = ptr(m, candidateVector); const source = ptr(m, finalEax + i * 4); put(m, F + 0x14, source);
    if (!ptr(m, source + 0x968)) continue;
    const output = ptr(m, streams + 4), first = ptr(m, streams), input = F + 0x14, inside = input < output && first <= input, index = inside ? (input - first) >> 2 : source;
    if (output === ptr(m, streams + 8)) {
      const length = (output - first) >> 2, capacity = (ptr(m, streams + 8) - first) >> 2;
      if (length >= 0x3fffffff) throw RangeError('Native manager stream vector length error.');
      put(m, F + 0x20, length + 1); const half = capacity >>> 1, grown = 0x3fffffff - half < capacity ? 0 : capacity + half, count = Math.max(grown, length + 1);
      put(m, F - 4, count); ret(r, F - 8, inside ? 0x4a73b9 : 0x4a741f);
      reserveGameImagePointers(streams, count, {...r, scratchBase: F - 8, nativePointerVector: true, entryRegisters: {...r.entryRegisters, EBX: streams, EBP: i, ESI: index, EDI: first}});
    }
    const end = ptr(m, streams + 4); finalEax = inside && end ? ptr(m, ptr(m, streams) + index * 4) : end;
    if (end) put(m, end, inside ? finalEax : source); put(m, streams + 4, end + 4);
  }
  return finalEax;
}
