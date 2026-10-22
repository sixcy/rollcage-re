import {releaseManagedAudioThread} from './managed-audio-shutdown.mjs';
import {destroyQueuedAudioSource, releaseGameAudioListener} from './audio-source-retirement.mjs';
import {releaseXAudioSample} from './audio-sample-destruction.mjs';
import {releaseGameWaveform} from './game-audio-sample-state.mjs';
import {destroyQueuedAudioCallback} from './queued-audio-callback.mjs';
import {destroyAudioListenerFunction} from './audio-listener-construction.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function save(r, name, p) {if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, p, r.entryRegisters[name]);}
function call(r, kind, name, args, top, returned) {
  const m = r.memory; for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Sound shutdown requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
function target(m, object, expected) {const actual = ptr(m, ptr(m, object)); if (actual !== expected) throw Error(`Unported SoundManager shutdown destructor0x${actual.toString(16)}.`);}
function clearVector(m, manager, offset) {const header = ptr(m, manager + offset); put(m, header + 4, ptr(m, header));}
function capturedVector(m, manager, offset) {
  const header = ptr(m, manager + offset), start = ptr(m, header), end = ptr(m, header + 4);
  return {start, count: start > end ? 0 : (end - start + 3 >>> 2)};
}

//4a5e70. Stop the producer thread, retire queued wrappers, then destroy sample,
//cache, listener and mixer ownership in original order. Vector840h contains
//deferred source pointers and is deliberately not reset by this routine.
export function stopSoundManager(manager, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 36;
  put(m, S - 4, -1); put(m, S - 8, 0x56a388); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  for (const [name, offset] of [['EBX', 12], ['EBP', 8], ['ESI', 4], ['EDI', 0]]) save(runtime, name, F + offset);
  put(m, F + 20, manager); m[manager + 0x820] = 0;
  const critical = manager + 0x894;
  call(runtime, 'platformCall', 'EnterCriticalSection', [critical], F, 0x4a5ea6);
  const threadId = call(runtime, 'platformCall', 'GetCurrentThreadId', [], F, 0x4a5eac); put(m, critical + 28, threadId);
  const depth = ptr(m, critical + 24); put(m, critical + 24, depth); if (!depth) put(m, critical + 28, 0);
  call(runtime, 'platformCall', 'LeaveCriticalSection', [critical], F, 0x4a5ec3);
  const child = (registers, scratchBase) => ({...runtime, scratchBase, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, ...registers}});
  const thread = ptr(m, manager + 0x824);
  if (thread) {
    const destructor = ptr(m, ptr(m, thread));
    if (![0x4a34a0, 0x4a34c0].includes(destructor)) throw Error(`Unported managed-thread destructor0x${destructor.toString(16)}.`);
    put(m, F - 4, 1); put(m, F - 8, 0x4a5ed3);
    releaseManagedAudioThread(thread, 1, destructor === 0x4a34c0, child({EBP: manager, ESI: critical}, F - 8)); put(m, manager + 0x824, 0);
  }
  const queued = capturedVector(m, manager, 0x848); put(m, F + 16, queued.count);
  let limit = queued.count;
  for (let i = 0, cursor = queued.start; i !== limit; i++, cursor += 4) {
    const object = ptr(m, cursor);
    if (object) {
      put(m, F - 4, 0x4a5f10); destroyQueuedAudioSource(object, child({EBX: i, EBP: manager, ESI: cursor, EDI: object}, F - 4));
      call(runtime, 'libraryCall', 'operatorDelete', [object], F, 0x4a5f17); limit = ptr(m, F + 16);
    }
  }
  clearVector(m, manager, 0x848);
  const samples = capturedVector(m, manager, 0x834);
  for (let i = 0, cursor = samples.start; i < samples.count; i++, cursor += 4) {
    const object = ptr(m, cursor);
    if (object) {target(m, object, 0x4ad8f0); put(m, F - 4, 1); put(m, F - 8, 0x4a5f5f); releaseXAudioSample(object, 1, child({EBX: samples.count, EBP: manager, ESI: cursor, EDI: i}, F - 8));}
  }
  clearVector(m, manager, 0x834); for (const offset of [0x83c, 0x838, 0x844]) clearVector(m, manager, offset);
  let cursor = ptr(m, ptr(m, manager + 0x830));
  while (cursor !== ptr(m, ptr(m, manager + 0x830) + 4)) {
    const object = ptr(m, cursor);
    if (object) {target(m, object, 0x4afc00); put(m, F - 4, 1); put(m, F - 8, 0x4a5fac); releaseGameWaveform(object, 1, child({EBX: samples.count, EBP: manager, ESI: cursor, EDI: samples.count}, F - 8));}
    cursor += 4;
  }
  clearVector(m, manager, 0x830);
  const listeners = capturedVector(m, manager, 0x82c);
  for (let i = 0, cursor = listeners.start; i < listeners.count; i++, cursor += 4) {
    const object = ptr(m, cursor);
    if (object) {target(m, object, 0x4aa000); put(m, F - 4, 1); put(m, F - 8, 0x4a5ff3); releaseGameAudioListener(object, 1, child({EBX: listeners.count, EBP: manager, ESI: cursor, EDI: i}, F - 8));}
  }
  clearVector(m, manager, 0x82c);
  const mixerHeader = ptr(m, manager + 0x84c); put(m, manager + 0x828, 0);
  let mixerCursor = ptr(m, mixerHeader); const mixerEnd = ptr(m, mixerHeader + 4), entered = mixerCursor !== mixerEnd;
  for (; mixerCursor !== mixerEnd; mixerCursor += 4) {
    const object = ptr(m, mixerCursor); put(m, F + 16, object); if (!object) continue;
    put(m, object, 0x5d3ba8); put(m, S - 4, 0);
    const voice = ptr(m, object + 72);
    if (voice) {
      if (typeof runtime.services?.xAudio2Call !== 'function') throw Error('Mixer shutdown requires genuine XAudio2 COM interface.');
      call({...runtime, services: {...runtime.services, com: (_name, args, r) => runtime.services.xAudio2Call(voice, 0x48, args, r)}}, 'com', 0x48, [voice], F, 0x4a6048);
    }
    const storage = object + 16; put(m, object + 72, 0); put(m, S - 4, -1);
    for (const returned of [0x4a606f, 0x4a608b]) {
      const value = ptr(m, storage + 16); if (!value) continue;
      const table = ptr(m, value), destructor = ptr(m, table + 16), base = ptr(m, table + 20);
      if (destructor !== 0x40f2a0 || ![0x40ee80, 0x40eea0].includes(base)) throw Error(`Unported mixer callback destructor0x${destructor.toString(16)}.`);
      const flag = Number(value !== storage); put(m, F - 4, flag); put(m, F - 8, returned);
      (base === 0x40ee80 ? destroyQueuedAudioCallback : destroyAudioListenerFunction)(value, flag, child({EBX: object, EBP: storage, ESI: mixerCursor, EDI: mixerEnd}, F - 8)); put(m, storage + 16, 0);
    }
    call(runtime, 'libraryCall', 'operatorDelete', [object], F, 0x4a6099);
  }
  clearVector(m, entered ? ptr(m, F + 20) : manager, 0x84c);
}
