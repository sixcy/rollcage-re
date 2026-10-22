import {getApplicationDebugger, registerApplicationDebuggerName} from './application-bootstrap.mjs';
import {getAudioDebuggerCategory} from './xaudio-manager-construction.mjs';
import {resolveGameAudioSamplePath} from './game-audio-file-paths.mjs';
import {openGameAudioDecoder} from './game-audio-decoder-open.mjs';
import {pollGameAudioStream} from './audio-stream-polling.mjs';
import {queryGameAudioSampleActivity, clearGameAudioSamplePending} from './audio-sample-controls.mjs';

const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function call(r, kind, name, args, top, returned) {
  const m = r.memory; args.forEach((v, i) => put(m, top - args.length * 4 + i * 4, v));
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Sample stream reopen requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
const adapted = r => ({...r, handlers: {...r.handlers,
  allocate: r.handlers?.allocate ?? ((n, context) => context.services.libraryCall('operatorNew', [n], context)),
  free: r.handlers?.free ?? ((p, context) => context.services.libraryCall('operatorDelete', [p], context)),
  registerExit: r.handlers?.registerExit ?? ((p, context) => context.services.libraryCall('registerExit', [p], context))}});
function com(owner, slot, args, top, returned, runtime) {
  return call({...runtime, services: {...runtime.services, comCall: (_name, values, r) => {
    if (typeof runtime.services?.xAudio2Call !== 'function') throw Error('Sample reopen requires genuine XAudio2 COM interface.');
    return runtime.services.xAudio2Call(owner, slot, values, r);
  }}}, 'comCall', slot, args, top, returned);
}

//40cf70. The terminator is stored after the secure-copy arguments are pushed.
export function copyGameAudioReopenPath(output, input, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, input);
  if (Number.isInteger(runtime.entryRegisters?.ESI)) put(m, S - 4, runtime.entryRegisters.ESI);
  for (const [i, value] of [output, 512, input, 511].entries()) put(m, S - 20 + i * 4, value);
  m.writeUInt16LE(0, output + 1022); put(m, S - 24, 0x40cf91);
  runtime.services.libraryCall('wcsncpy_s', Array.from({length: 4}, (_, i) => ptr(m, S - 20 + i * 4)), {...runtime, scratchBase: S - 24});
  return output;
}

//4addc0. Flush/GetState precede stream reopening. A nonzero buffers-queued
//word rejects the request before path I/O. Known game virtuals bind actual
//decoder open, stream polling and source predicates; unknown targets throw.
export function prepareGameAudioSamplePlayback(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, B = S - 4, A = B & ~7, F = A - 0x420;
  if (Number.isInteger(runtime.entryRegisters?.EBP)) put(m, B, runtime.entryRegisters.EBP);
  put(m, A - 4, -1); put(m, A - 8, 0x56a48e); if (Number.isInteger(runtime.sehWord)) put(m, A - 12, runtime.sehWord);
  for (const [name, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) if (Number.isInteger(runtime.entryRegisters?.[name])) put(m, F + offset, runtime.entryRegisters[name]);
  let esi = runtime.entryRegisters?.ESI, ebx = runtime.entryRegisters?.EBX;
  const child = () => adapted({...runtime, sehWord: A - 12, entryRegisters: {...runtime.entryRegisters, EBP: B, EDI: object, ESI: esi, EBX: ebx}});
  const log = (ecx, returned, categoryReturned) => {
    put(m, F - 4, returned);
    const context = {...child(), scratchBase: F - 4, nativeDebuggerFrame: 'direct', entryRegisters: {...child().entryRegisters, ECX: ecx}};
    getApplicationDebugger(context);
    if (categoryReturned) {put(m, F - 4, categoryReturned); getAudioDebuggerCategory({...child(), scratchBase: F - 4, nativeCategoryFrame: true, nativeDebuggerRecords: true, entryRegisters: {...child().entryRegisters, ECX: ecx}});}
  };
  const state = ptr(m, object + 0x948);
  if (ptr(m, object + 0x94c) === 3 && state !== 1 && state !== 2) {
    const voice = ptr(m, object + 0x97c); com(voice, 0x58, [voice], F, 0x4ade17, runtime);
    const currentVoice = ptr(m, object + 0x97c); esi = object + 0x98c; m.writeUInt16LE(1, object + 0x99c);
    com(currentVoice, 0x64, [currentVoice, esi], F, 0x4ade33, runtime);
    if (ptr(m, esi)) {log(currentVoice, 0x4ade3d, 0x4ade42); return 0;}
    const decoder = ptr(m, object + 0x968); esi = decoder;
    if (decoder) {
      const T = F - 0x400; put(m, T - 4, object + 0x34); put(m, T - 8, 0x4ade74);
      copyGameAudioReopenPath(T, object + 0x34, {...child(), scratchBase: T - 8});
      put(m, T - 4, F + 0x10); put(m, T - 8, 0x4ade81);
      const path = resolveGameAudioSamplePath(F + 0x10, {...child(), scratchBase: T - 8});
      const target = ptr(m, ptr(m, decoder) + 4); if (target !== 0x4b48f0) throw Error(`Unported decoder reopen target0x${target.toString(16)}.`);
      put(m, F - 4, path); put(m, F - 8, 0x4ade8b);
      const opened = openGameAudioDecoder(decoder, path, {...child(), scratchBase: F - 8});
      if ((opened & 255) === 1) {
        const current = ptr(m, object + 0x968), ready = ptr(m, ptr(m, current) + 0x10);
        if (ready !== 0x4029b0) throw Error(`Unported decoder ready target0x${ready.toString(16)}.`);
        put(m, F - 4, 0x4ade9c); //Original4029b0 is MOV AL,1;RET.
        put(m, F - 4, 0x4adeab); pollGameAudioStream(ptr(m, object + 0x968), {...child(), scratchBase: F - 4});
      } else {
        //Known4b48f0 failed-open/WAV-parser exits restore ECX from this SEH.
        log(A - 12, 0x4adeb2, 0x4adeb7);
        const clear = ptr(m, ptr(m, object) + 0x34); if (clear !== 0x4ad5b0) throw Error(`Unported sample pending clear0x${clear.toString(16)}.`);
        put(m, F - 4, 0x4adebe); clearGameAudioSamplePending(object, {...child(), scratchBase: F - 4});
      }
    }
  }
  const query = ptr(m, ptr(m, object) + 0x38); if (query !== 0x4ad580) throw Error(`Unported source activity target0x${query.toString(16)}.`);
  put(m, F - 4, 1); put(m, F - 8, 0x4adec9);
  const active = queryGameAudioSampleActivity(object, 1, {...child(), scratchBase: F - 8}) & 255;
  ebx = ((ebx ?? 0) & 0xffffff00) | active;
  if (!active) {
    log(object, 0x4aded4);
    const guard = ptr(m, 0x714b18);
    if (!(guard & 1)) {
      put(m, 0x714b18, guard | 1); put(m, F - 4, 0x5d3b98); put(m, F + 0x41c, 0); put(m, F - 8, 0x4adefd);
      const context = {...child(), scratchBase: F - 8, nativeDebuggerFrame: 'wrapper', nativeDebuggerRecords: true, entryRegisters: {...child().entryRegisters, ECX: guard | 1}};
      const logger = getApplicationDebugger(context); put(m, F - 8, 0x4adf04);
      put(m, 0x714b1c, registerApplicationDebuggerName(logger, 0x5d3b98, false, {...context, nativeDebuggerFrame: undefined, entryRegisters: {...context.entryRegisters, ECX: logger}}));
    }
  }
  return active;
}
