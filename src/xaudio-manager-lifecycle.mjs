import {constructXAudioManager} from './xaudio-manager-construction.mjs';
import {initializeSoundManagerPolling} from './sound-manager-polling.mjs';
import {stopSoundManager} from './sound-manager-shutdown.mjs';
import {destroyBaseSoundManager} from './sound-manager-destruction.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function call(r, kind, name, args, top, returned) {
  const m = r.memory; for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`XAudio lifecycle requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
function com(owner, offset, top, returned, runtime) {
  if (typeof runtime.services?.xAudio2Call !== 'function') throw Error('XAudio lifecycle requires genuine COM interface.');
  return call({...runtime, services: {...runtime.services, com: (_name, args, r) => runtime.services.xAudio2Call(owner, offset, args, r)}}, 'com', offset, [owner], top, returned);
}

//4b11f0. Stop every game-owned producer before the mastering voice/engine;
//then free pool storage, base vectors/events and the derived critical section.
export function destroyXAudioManager(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 20;
  put(m, S - 4, -1); put(m, S - 8, 0x56a944); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  if (Number.isInteger(runtime.entryRegisters?.ESI)) put(m, F, runtime.entryRegisters.ESI);
  put(m, F + 4, object); for (const [offset, value] of [[0, 0x5d4190], [0x818, 0x5d4188], [0x81c, 0x5d4180]]) put(m, object + offset, value); put(m, S - 4, 2);
  const child = {...runtime, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, ESI: object}};
  put(m, F - 4, 0x4b1234); stopSoundManager(object, {...child, scratchBase: F - 4});
  const voice = ptr(m, object + 0x914);
  if (voice) {com(voice, 0x48, F, 0x4b1244, runtime); put(m, object + 0x914, 0);}
  let engine = ptr(m, object + 0x910);
  if (engine) {
    com(engine, 0x30, F, 0x4b125e, runtime); engine = ptr(m, object + 0x910);
    if (engine) {com(engine, 8, F, 0x4b126e, runtime); put(m, object + 0x910, 0);}
  }
  const pools = ptr(m, object + 0xd68);
  if (pools) {call(runtime, 'libraryCall', 'operatorDelete', [pools], F, 0x4b1289); for (const offset of [0xd68, 0xd6c, 0xd70]) put(m, object + offset, 0);}
  put(m, F - 4, 0x4b12b1); destroyBaseSoundManager(object, {...child, scratchBase: F - 4});
  call(runtime, 'platformCall', 'DeleteCriticalSection', [object + 0x8f0], F, 0x4b12be);
}

//4b11d0. The final deleting flag stays live across all nested cleanup.
export function releaseXAudioManager(object, flags, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, flags);
  if (Number.isInteger(runtime.entryRegisters?.ESI)) put(m, S - 4, runtime.entryRegisters.ESI);
  put(m, S - 8, 0x4b11d8); destroyXAudioManager(object, {...runtime, scratchBase: S - 8, entryRegisters: {...runtime.entryRegisters, ESI: object}});
  if (m[S + 4] & 1) call(runtime, 'libraryCall', 'operatorDelete', [object], S - 4, 0x4b11e6); return object;
}

//4a5710. Read channel validity, publish the constructed manager, then start
//real polling or run real destruction for a device without channels.
export function initializeXAudioManager(runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 20;
  put(m, S - 4, -1); put(m, S - 8, 0x56a32c); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  let object = call(runtime, 'libraryCall', 'operatorNew', [0xd78], F, 0x4a5733) >>> 0; put(m, F + 4, object); put(m, S - 4, 0);
  const child = {...runtime, sehWord: S - 12, nativeAudioDeviceNames: true};
  if (object) {put(m, F - 4, 0x4a574d); object = constructXAudioManager(object, {...child, scratchBase: F - 4});}
  put(m, S - 4, -1);
  if (!object) {const error = Error('Native XAudio manager allocation reaches null device validation.'); error.address = 0x4a575b; throw error;}
  const channels = ptr(m, object + 0x918); put(m, 0x714b08, object);
  if (channels) {put(m, F - 4, 0x4a576f); initializeSoundManagerPolling(object, {...child, scratchBase: F - 4});}
  else {
    const target = ptr(m, ptr(m, object)); if (target !== 0x4b11d0) throw Error(`Unported XAudio manager destructor0x${target.toString(16)}.`);
    put(m, F - 4, 1); put(m, F - 8, 0x4a5784); releaseXAudioManager(object, 1, {...child, scratchBase: F - 8}); put(m, 0x714b08, 0);
  }
}
