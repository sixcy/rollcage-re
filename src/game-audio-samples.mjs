import {assignGameCString} from './game-string-buffer.mjs';
import {initializeGameAudioDescriptor} from './game-audio-descriptors.mjs';
import {gameAudioNameHasPrefix} from './game-audio-strings.mjs';
import {constructGameSoundOwner, appendGameSoundOwner} from './game-sound-owner.mjs';
import {getGameAsyncFileManager, queueGameAsyncFilePath} from './game-async-file-manager.mjs';
import {initializeRaceAudioListeners} from './audio-listeners.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function save(runtime, name, address) {if (Number.isInteger(runtime.entryRegisters?.[name])) put(runtime.memory, address, runtime.entryRegisters[name]);}
function invoke(runtime, kind, name, args, top, returned, beforeCall) {
  const m = runtime.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  beforeCall?.(); const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof runtime.services?.[kind] !== 'function') throw Error(`Audio samples require ${kind} ${name}.`);
  return runtime.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...runtime, scratchBase: S});
}
const crt = (r, name, args, top, returned, beforeCall) => invoke(r, 'libraryCall', name, args, top, returned, beforeCall);

//40dcd0. This constructs and appends a new owner; it is not a bank lookup.
//constructGameSoundOwner binds actual4a7710 for the known native virtual;
//codec/streaming scope remains explicit in the reached factory descendants.
export function loadGameAudioSample(name, flag, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 0x8b4, string = F + 0x14, descriptor = F + 0x48, path = F + 0x4a8;
  put(m, F + 0x8ac, get(m, 0x5e8890) ^ (S - 0x8a4));
  for (const [reg, offset] of [['EBX', 12], ['EBP', 8], ['ESI', 4], ['EDI', 0]]) save(runtime, reg, F + offset);
  put(m, string + 20, 15); put(m, string + 16, 0); m[string] = 0;
  let input = name || 0x56fe6b, length = 0; while (m[input + length]) length++;
  put(m, F - 4, length); put(m, F - 8, input); put(m, F - 12, 0x40dd34);
  assignGameCString(string, input, length, {...runtime, scratchBase: F - 12, entryRegisters: {...runtime.entryRegisters, ESI: input, EDI: name, EBP: flag}});
  put(m, F + 0x2c, 0);
  crt(runtime, 'wcsncpy_s', [path, 512, 0x5d0328, 511], F, 0x40dd63, () => m.writeUInt16LE(0, path + 1022));
  let wide = 0, count = 0;
  if (name) {
    while (m[name + count]) count++; count = (count + 1) >>> 0;
    wide = crt(runtime, 'operatorNewArray', [count > 0x7fffffff ? 0xffffffff : count * 2], F, 0x40dd94) >>> 0;
    invoke(runtime, 'platformCall', 'MultiByteToWideChar', [0, 0, name, count, wide, count], F, 0x40ddaa, () => m.writeUInt16LE(0, wide));
    put(m, F - 4, wide); put(m, F - 8, 0x40ddb0);
    const context = {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, EBX: wide, EBP: flag, ESI: count, EDI: name}};
    const manager = getGameAsyncFileManager(context); put(m, F - 8, 0x40ddb7);
    queueGameAsyncFilePath(manager, wide, {...context, nativeDequeCopies: true});
  }
  const concatTarget = ptr(m, 0x56e218);
  crt(runtime, 'wcscat_s', [path, 512, wide], F, 0x40ddcd); crt(runtime, 'wcscat_s', [path, 512, 0x5d0358], F, 0x40dde4);
  put(m, F - 4, 0x40ddf0);
  initializeGameAudioDescriptor(descriptor, {...runtime, scratchBase: F - 4, entryRegisters: {...runtime.entryRegisters, EBX: wide, EBP: flag, ESI: concatTarget, EDI: name}});
  if (name) crt(runtime, 'strncpy_s', [F + 0x30, 24, name, 23], F, 0x40de09, () => {m[F + 0x47] = 0;});
  Buffer.from(m.subarray(F + 0x30, F + 0x40)).copy(m, descriptor); m[F + 0x4a2] = 1; m[F + 0x4a4] = 1;
  Buffer.from(m.subarray(F + 0x40, F + 0x48)).copy(m, descriptor + 16);
  //Original REP MOVSD advances both pointers and copies each DWORD live.
  for (let i = 0; i < 256; i++) put(m, descriptor + 48 + i * 4, get(m, path + i * 4));
  put(m, F + 0x488, 0x3f800000); m[F + 0x4a0] = flag ? 1 : 0;
  put(m, F - 4, 0); put(m, F - 8, 0x5d0364); put(m, F + 0x48c, 0x43160000); m[F + 0x4a1] = 0; put(m, F - 12, 0x40de7d);
  const prefixRuntime = {...runtime, scratchBase: F - 12, entryRegisters: {...runtime.entryRegisters, EBX: wide, EBP: flag, ESI: path + 1024, EDI: descriptor + 48 + 1024}};
  if (gameAudioNameHasPrefix(string, 0x5d0364, prefixRuntime) === 1) {put(m, F + 0x488, 0x3f800000); put(m, F + 0x48c, 0x43480000);}
  //The first cookie check leaves its reconstructed cookie in native ECX.
  const cookie = ptr(m, F - 28) ^ (F - 56);
  put(m, F - 4, cookie); put(m, F - 8, 0x5d0370); put(m, F - 12, 0x40dea6);
  let source = path + 1024;
  let special = gameAudioNameHasPrefix(string, 0x5d0370, prefixRuntime) === 1;
  if (!special) {
    source = ptr(m, string + 20) >= 16 ? ptr(m, string) : string;
    const found = crt(runtime, 'strstr', [source, 0x5d0380], F, 0x40dec4) >>> 0;
    special = found !== 0 && ((found - source) | 0) !== -1;
  }
  if (special) {put(m, F + 0x488, 0x40400000); put(m, F + 0x48c, 0x43960000);}
  let owner = crt(runtime, 'operatorNew', [0x490], F, 0x40def3) >>> 0;
  if (owner) {
    put(m, F - 4, descriptor); put(m, F - 8, descriptor); put(m, F - 12, 0x40df07);
    owner = constructGameSoundOwner(owner, descriptor, descriptor, {...runtime, scratchBase: F - 12, entryRegisters: {...runtime.entryRegisters, EBX: wide, EBP: flag, ESI: source, EDI: descriptor + 48 + 1024}});
  }
  put(m, F + 16, owner); put(m, F - 4, F + 16); put(m, F - 8, 0x40df19);
  appendGameSoundOwner(F + 16, {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, EBX: wide, EBP: flag, ESI: source, EDI: descriptor + 48 + 1024}});
  const size = (get(m, 0x6f2418) - get(m, 0x6f2414)) >> 2;
  if (ptr(m, F + 0x2c)) {crt(runtime, 'operatorDeleteArray', [ptr(m, F + 0x2c)], F, 0x40df37); put(m, F + 0x2c, 0);}
  if (ptr(m, string + 20) >= 16) crt(runtime, 'operatorDelete', [ptr(m, string)], F, 0x40df53);
  const finalCookie = ptr(m, F + 0x8ac) ^ (S - 0x8a4); put(m, F + 12, 0x40df6b);
  if (typeof runtime.services?.securityCookie === 'function') runtime.services.securityCookie(finalCookie >>> 0, {...runtime, scratchBase: F + 12});
  else if ((finalCookie >>> 0) !== ptr(m, 0x5e8890)) throw Error('Audio sample security-cookie mismatch.');
  return (size - 1) | 0;
}

//485250. Listener/sample construction precedes the captured-session audio
//and horn record defaults. The participant count is read before horn stores.
export function initializeRaceAudio(runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 12;
  for (const [reg, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) save(runtime, reg, F + offset);
  put(m, F - 4, 0x485258); initializeRaceAudioListeners({...runtime, scratchBase: F - 4});
  crt(runtime, 'memset', [0x713190, 0, 0xf0], F, 0x485269);
  put(m, F - 4, 0x48527d);
  const sample = loadGameAudioSample(0x5d3498, 1, {...runtime, scratchBase: F - 4, entryRegisters: {...runtime.entryRegisters, EBX: 1}}), session = ptr(m, 0x5ecb1c);
  put(m, 0x6e6bdc, sample); let index = 0, limit = m[session + 0x54d];
  if (limit) do {
    const record = 0x713190 + index * 40, horn = 0x713280 + index * 16;
    m.writeUInt16LE(1, record + 38); for (const offset of [20, 16, 12, 8, 4]) put(m, record + offset, 127);
    index++; limit = m[session + 0x54d]; put(m, horn, 255); put(m, horn + 4, 0); put(m, horn + 8, 127); put(m, horn + 12, 0);
  } while (index < limit);
}
