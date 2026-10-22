import {constructBaseSoundManager} from './sound-manager-construction.mjs';
import {getApplicationDebugger, registerApplicationDebuggerName} from './application-bootstrap.mjs';
import {assignRendererWideString} from './renderer-startup-strings.mjs';
import {destroyRendererWideString} from './renderer-command-line.mjs';
import {assignGameWideString} from './game-wide-string-buffer.mjs';
import constants from './xaudio-manager-constants.json' with {type: 'json'};

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export function initializeXAudioManagerConstants(memory) {
  for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
  return memory;
}
function invoke(runtime, kind, name, args, top, returned) {
  const m = runtime.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof runtime.services?.[kind] !== 'function') throw Error(`XAudio manager requires ${kind} ${name}.`);
  return runtime.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...runtime, scratchBase: S});
}
const adapted = runtime => ({...runtime, handlers: {...runtime.handlers,
  allocate: runtime.handlers?.allocate ?? ((size, r) => r.services.libraryCall('operatorNew', [size], r)),
  free: runtime.handlers?.free ?? ((p, r) => r.services.libraryCall('operatorDelete', [p], r)),
  registerExit: runtime.handlers?.registerExit ?? ((p, r) => r.services.libraryCall('registerExit', [p], r))}});
//4a91d0. Category creation is actual debugger registration, not a host logger.
export function getAudioDebuggerCategory(runtime) {
  const m = runtime.memory;
  const native = runtime.nativeCategoryFrame, S = runtime.scratchBase;
  if (native) {put(m, S - 4, -1); put(m, S - 8, 0x56a48e); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);}
  if (!(get(m, 0x714b18) & 1)) {
    put(m, 0x714b18, get(m, 0x714b18) | 1);
    let context = adapted(runtime);
    if (native) {put(m, S - 16, 0x5d3b98); put(m, S - 4, 0); put(m, S - 20, 0x4a9208); context = {...context, scratchBase: S - 20, sehWord: S - 12, nativeDebuggerFrame: 'wrapper', nativeDebuggerRecords: true};}
    const logger = getApplicationDebugger(context);
    if (native) {put(m, S - 20, 0x4a920f); context = {...context, nativeDebuggerFrame: undefined, entryRegisters: {...context.entryRegisters, ECX: logger}};}
    put(m, 0x714b1c, registerApplicationDebuggerName(logger, 0x5d3b98, false, context));
  }
  return get(m, 0x714b1c);
}
//4a2a90 is wide→wide construction, distinct from4066c0's ANSI conversion.
export function constructAudioDeviceName(output, input, runtime) {
  if (runtime.nativeAudioDeviceNames) return constructNativeAudioDeviceName(output, input, runtime);
  const m = runtime.memory, source = input || 0x56feb0; let count = 0;
  while (m.readUInt16LE(source + count * 2)) count++;
  put(m, runtime.scratchBase + 4, input); put(m, output + 20, 7); put(m, output + 16, 0); m.writeUInt16LE(0, output);
  assignRendererWideString(output, source, count, {...runtime, scratchBase: runtime.scratchBase - 16}); put(m, output + 24, 0); return output;
}
//402000. The separately owned ANSI buffer has one byte per UTF16 code unit,
//including the terminator; ACP conversion is the genuine Win32 boundary.
export function cacheAudioDeviceName(object, runtime) {
  if (runtime.nativeAudioDeviceNames) return cacheNativeAudioDeviceName(object, runtime);
  const m = runtime.memory, old = ptr(m, object + 24);
  if (old) {runtime.services.libraryCall('operatorDeleteArray', [old], runtime); put(m, object + 24, 0);}
  const source = ptr(m, object + 20) > 7 ? ptr(m, object) : object;
  if (!source) {put(m, object + 24, 0); return 0;}
  let count = 0; while (m.readUInt16LE(source + count * 2)) count++; count++;
  const output = runtime.services.libraryCall('operatorNewArray', [count >>> 0], runtime) >>> 0; m[output] = 0;
  runtime.services.platformCall('WideCharToMultiByte', [0, 0, source, count, output, count, 0, 0], runtime); put(m, object + 24, output); return output;
}

function saveDeviceRegisters(r, S, rows) {for (const [name, offset] of rows) if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, S + offset, r.entryRegisters[name]);}
function constructNativeAudioDeviceName(output, input, runtime) {
  const {memory: m, scratchBase: S} = runtime, source = input || 0x56feb0;
  put(m, S + 4, input); saveDeviceRegisters(runtime, S, [['ESI', -4]]);
  put(m, output + 20, 7); put(m, output + 16, 0); m.writeUInt16LE(0, output);
  let count = 0;
  if (m.readUInt16LE(source)) {saveDeviceRegisters(runtime, S, [['EDI', -8]]); while (m.readUInt16LE(source + count * 2)) count++;}
  put(m, S - 8, count); put(m, S - 12, source); put(m, S - 16, 0x4a2adc);
  assignGameWideString(output, source, count, {...runtime, scratchBase: S - 16, entryRegisters: {...runtime.entryRegisters, ESI: output}});
  put(m, output + 24, 0); return output;
}
function cacheNativeAudioDeviceName(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 20;
  put(m, S - 4, object); saveDeviceRegisters(runtime, S, [['EBX', -8]]); const old = ptr(m, object + 24);
  saveDeviceRegisters(runtime, S, [['EBP', -12], ['ESI', -16], ['EDI', -20]]);
  if (old) {invoke(runtime, 'libraryCall', 'operatorDeleteArray', [old], F, 0x402018); put(m, object + 24, 0);}
  const source = ptr(m, object + 20) >= 8 ? ptr(m, object) : object;
  if (!source) {put(m, object + 24, 0); return 0;}
  let count = 0; while (m.readUInt16LE(source + count * 2)) count++; count++;
  const output = invoke(runtime, 'libraryCall', 'operatorNewArray', [count], F, 0x40204a) >>> 0;
  const args = [0, 0, source, count, output, count, 0, 0];
  args.forEach((v, i) => put(m, F - 32 + i * 4, v)); m[output] = 0; put(m, F - 36, 0x402064);
  runtime.services.platformCall('WideCharToMultiByte', args.map((_, i) => ptr(m, F - 32 + i * 4)), {...runtime, scratchBase: F - 36});
  put(m, object + 24, output); return output;
}

//4b0eb0. Concrete XAAudioManager, real base/database producers and game
//debugger/string children. All COM/device operations below are genuine
//XAudio2/Win32 interfaces; no game virtual is passed to those services.
export function constructXAudioManager(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 60, voiceSlot = object + 0x914;
  put(m, S - 4, -1); put(m, S - 8, 0x56a908); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  for (const [name, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) if (Number.isInteger(runtime.entryRegisters?.[name])) put(m, F + offset, runtime.entryRegisters[name]);
  put(m, F + 16, object); put(m, object + 0x908, 0); put(m, object + 0x90c, 0);
  invoke(runtime, 'platformCall', 'InitializeCriticalSectionAndSpinCount', [object + 0x8f0, 0x1000], F, 0x4b0ef1);
  put(m, F + 56, 0); put(m, F - 4, 0x4b0f00);
  constructBaseSoundManager(object, {...runtime, scratchBase: F - 4, sehWord: F + 48, entryRegisters: {...runtime.entryRegisters, EDI: object}});
  for (const [offset, value] of [[0, 0x5d4190], [0x818, 0x5d4188], [0x81c, 0x5d4180], [0x910, 0], [0x914, 0], [0x918, 0], [0xd68, 0], [0xd6c, 0], [0xd70, 0]]) put(m, object + offset, value);
  m[F + 56] = 2;
  const loggerAt = returned => {put(m, F - 4, returned); return getApplicationDebugger(adapted({...runtime, scratchBase: F - 4}));};
  const unavailable = firstReturn => {
    loggerAt(firstReturn);
    if (!(get(m, 0x714b18) & 1)) {
      put(m, 0x714b18, get(m, 0x714b18) | 1); put(m, F - 4, 0x5d3b98); m[F + 56] = firstReturn === 0x4b0f78 ? 3 : 4;
      put(m, F - 8, firstReturn === 0x4b0f78 ? 0x4b0f98 : 0x4b11a5);
      const context = adapted({...runtime, scratchBase: F - 8}), logger = getApplicationDebugger(context);
      put(m, F - 8, firstReturn === 0x4b0f78 ? 0x4b0f9f : 0x4b11ac);
      put(m, 0x714b1c, registerApplicationDebuggerName(logger, 0x5d3b98, false, context));
      if (firstReturn === 0x4b0f78) m[F + 56] = 2;
    }
  };
  const feature6 = invoke(runtime, 'platformCall', 'IsProcessorFeaturePresent', [6], F, 0x4b0f67);
  if (!feature6 || !invoke(runtime, 'platformCall', 'IsProcessorFeaturePresent', [10], F, 0x4b0f6f)) unavailable(0x4b0f78);
  const instance = invoke(runtime, 'platformCall', 'CoCreateInstance', [0x5d416c, 0, 1, 0x5d415c, F + 12], F, 0x4b0fc2) | 0;
  const com = (owner, offset, args, returned) => {
    if (typeof runtime.services?.xAudio2Call !== 'function') throw Error('XAudio manager requires genuine XAudio2 COM service.');
    return invoke({...runtime, services: {...runtime.services, comCall: (method, words, context) => runtime.services.xAudio2Call(owner, method, words, context)}}, 'comCall', offset, args, F, returned) | 0;
  };
  if (instance < 0) {unavailable(0x4b1185); return object;}
  const status = com(ptr(m, F + 12), 0x14, [ptr(m, F + 12), 0, 0xffffffff], 0x4b0fd8);
  if (status < 0) com(ptr(m, F + 12), 8, [ptr(m, F + 12)], 0x4b0ff4);
  else put(m, object + 0x910, get(m, F + 12));
  if (status < 0) {unavailable(0x4b1185); return object;}
  let engine = ptr(m, object + 0x910);
  let result = com(engine, 0x28, [engine, voiceSlot, 0, 48000, 0, 0, 0], 0x4b1016);
  if (result < 0) {engine = ptr(m, object + 0x910); result = com(engine, 0x28, [engine, voiceSlot, 0, 0, 0, 0, 0], 0x4b1031);}
  const cleanup = () => {
    let voice = ptr(m, voiceSlot); if (voice) {com(voice, 0x48, [voice], 0x4b104b); put(m, voiceSlot, 0);}
    engine = ptr(m, object + 0x910); com(engine, 0x30, [engine], 0x4b105d);
    engine = ptr(m, object + 0x910); if (engine) {com(engine, 8, [engine], 0x4b1071); put(m, object + 0x910, 0);}
  };
  if (result < 0) {loggerAt(0x4b103a); getAudioDebuggerCategory(adapted({...runtime, scratchBase: F - 4})); cleanup(); return object;}
  invoke(runtime, 'libraryCall', 'memset', [object + 0x91c, 0, 0x42c], F, 0x4b10a2);
  engine = ptr(m, object + 0x910); result = com(engine, 0x10, [engine, 0, object + 0x91c], 0x4b10b4);
  if (result < 0) {
    loggerAt(0x4b10bd); getAudioDebuggerCategory(adapted({...runtime, scratchBase: F - 4}));
    const voice = ptr(m, voiceSlot); com(voice, 0x48, [voice], 0x4b10ca); put(m, voiceSlot, 0); cleanup(); return object;
  }
  const logger = loggerAt(0x4b10d4), temporary = F + 20;
  put(m, F - 4, object + 0xb1c); put(m, F - 8, 0x4b10e6);
  const deviceContext = runtime.nativeAudioDeviceNames ? {...runtime, sehWord: F + 48, entryRegisters: {...runtime.entryRegisters, EBX: voiceSlot, ESI: logger, EDI: object}} : runtime;
  constructAudioDeviceName(temporary, object + 0xb1c, {...deviceContext, scratchBase: F - 8});
  m[F + 56] = 5; put(m, F - 4, 0x4b10f2); const name = cacheAudioDeviceName(temporary, {...deviceContext, scratchBase: F - 4});
  put(m, F - 4, name); put(m, F - 8, 0x5d40fc); put(m, F - 12, 0);
  const category = getAudioDebuggerCategory(adapted({...runtime, scratchBase: F - 20}));
  put(m, F - 16, category); put(m, F - 20, logger); put(m, F - 24, 0x4b110a); void m[logger + 0x24]; //Actual4a18d0 getter.
  m[F + 56] = 2; put(m, F - 4, 0x4b111b); destroyRendererWideString(temporary, {...runtime, scratchBase: F - 4});
  for (const offset of [0, 4, 8]) put(m, object + 0xd48 + offset, 0);
  const voice = ptr(m, voiceSlot); com(voice, 0, [voice, object + 0xd48], 0x4b1137); put(m, object + 0x850, 0x20);
  invoke(runtime, 'platformCall', 'X3DAudioInitialize', [ptr(m, object + 0xd34), 0x43abc000, object + 0xd54], F, 0x4b115c);
  put(m, object + 0x918, m.readUInt16LE(object + 0xd22)); return object;
}
