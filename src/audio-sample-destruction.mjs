import {destroyQueuedAudioCallback} from './queued-audio-callback.mjs';
import {destroyAudioListenerFunction} from './audio-listener-construction.mjs';
import {releaseAudioVoicePoolRecord} from './audio-voice-pool-retirement.mjs';
import {releaseGameAudioDecoder, releaseCachedGameAudioWaveform} from './game-audio-decoder-lifecycle.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function save(r, name, p) {if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, p, r.entryRegisters[name]);}
function call(r, kind, name, args, top, returned) {
  const m = r.memory; for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Sample destruction requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
function com(owner, offset, args, top, returned, runtime, beforeCall) {
  if (typeof runtime.services?.xAudio2Call !== 'function') throw Error('Sample destruction requires genuine XAudio2 COM interface.');
  return call({...runtime, services: {...runtime.services, com: (_name, words, r) => {beforeCall?.(); return runtime.services.xAudio2Call(owner, offset, words, r);}}}, 'com', offset, args, top, returned);
}
function destroyCallback(input, flag, top, returned, runtime) {
  const m = runtime.memory, table = ptr(m, input), target = ptr(m, table + 16), base = ptr(m, table + 20);
  put(m, top - 4, flag); put(m, top - 8, returned); const r = {...runtime, scratchBase: top - 8};
  if (target === 0x40f2a0 && base === 0x40ee80) return destroyQueuedAudioCallback(input, flag, r);
  if (target === 0x40f2a0 && base === 0x40eea0) return destroyAudioListenerFunction(input, flag, r);
  throw Error(`Unported sample callback destructor0x${target.toString(16)}.`);
}

//4ad250. Owned decoder, waveform reference and callback have distinct
//lifetimes. A final waveform reference invokes4afc80 cache removal.
export function destroyBaseGameAudioSample(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 24;
  put(m, S - 4, -1); put(m, S - 8, 0x56a6c6); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, 'ESI', F + 4); save(runtime, 'EDI', F); put(m, F + 8, object); put(m, object, 0x5d3e14); put(m, S - 4, 1);
  const child = {...runtime, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, ESI: object}};
  const decoder = ptr(m, object + 0x968);
  if (decoder) {
    put(m, F - 4, 1); put(m, F - 8, 0x4ad28c);
    releaseGameAudioDecoder(decoder, 1, {...child, scratchBase: F - 8}); put(m, object + 0x968, 0);
  }
  const waveform = ptr(m, object + 0x964);
  if (waveform) {
    const count = m.readInt32LE(waveform + 4) - 1 | 0; put(m, waveform + 4, count);
    if (count <= 0) {
      const target = ptr(m, ptr(m, waveform) + 4);
      if (target !== 0x4afc80) throw Error(`Unported final waveform reference0x${target.toString(16)}.`);
      put(m, F - 4, 0x4ad2ae); releaseCachedGameAudioWaveform(waveform, {...child, scratchBase: F - 4});
    }
    put(m, object + 0x964, 0);
  }
  m[S - 4] = 0; const storage = object + 0x930, callbackRuntime = {...child, entryRegisters: {...child.entryRegisters, EDI: storage}};
  for (const returned of [0x4ad2d8, 0x4ad2f4]) {
    const value = ptr(m, storage + 16);
    if (value) {destroyCallback(value, Number(value !== storage), F, returned, callbackRuntime); put(m, storage + 16, 0);}
  }
  put(m, object, 0x5d3ea0);
}

//4ad910. Voice COM operations precede pool retirement and base ownership.
//All live voice/global loads remain after their preceding service calls.
export function destroyXAudioSample(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 20;
  put(m, S - 4, -1); put(m, S - 8, 0x56a718); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, 'ESI', F); put(m, F + 4, object); put(m, object, 0x5d3f60); put(m, object + 0x978, 0x5d3f40); put(m, S - 4, 0);
  const child = {...runtime, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, ESI: object}};
  let voice = ptr(m, object + 0x97c);
  if (voice) {
    com(voice, 0x50, [voice, 32, 0], F, 0x4ad959, runtime);
    voice = ptr(m, object + 0x97c); com(voice, 0x58, [voice], F, 0x4ad965, runtime);
    voice = ptr(m, object + 0x97c); m[object + 0x99c] = 1; put(m, object + 0x948, 0);
    com(voice, 0x48, [voice], F, 0x4ad982, runtime);
    const pool = ptr(m, object + 0x9a4); put(m, F - 4, pool); const manager = ptr(m, 0x714b08); put(m, object + 0x97c, 0); put(m, F - 8, 0x4ad99d);
    releaseAudioVoicePoolRecord(manager, pool, {...child, scratchBase: F - 8});
    const allocation = ptr(m, object + 0x9a0);
    if (allocation) {call(runtime, 'libraryCall', 'operatorDelete', [allocation], F, 0x4ad9ae); put(m, object + 0x9a0, 0);}
  }
  put(m, S - 4, -1); put(m, F - 4, 0x4ad9ca); destroyBaseGameAudioSample(object, {...child, scratchBase: F - 4});
}

//4ad8f0. The low-byte deleting flag is read after all nested destruction.
export function releaseXAudioSample(object, flags, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, flags); save(runtime, 'ESI', S - 4); put(m, S - 8, 0x4ad8f8);
  destroyXAudioSample(object, {...runtime, scratchBase: S - 8, entryRegisters: {...runtime.entryRegisters, ESI: object}});
  if (m[S + 4] & 1) call(runtime, 'libraryCall', 'operatorDelete', [object], S - 4, 0x4ad906); return object;
}
