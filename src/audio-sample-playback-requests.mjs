import {assignGameCString} from './game-string-buffer.mjs';
import {getApplicationDebugger, registerApplicationDebuggerName} from './application-bootstrap.mjs';
import {appendGameImagePointer} from './game-image-storage.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function call(r, kind, name, args, top, returned) {
  const m = r.memory;
  args.forEach((v, i) => put(m, top - args.length * 4 + i * 4, v));
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Audio playback request requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}
const adapted = r => ({...r, handlers: {...r.handlers,
  allocate: r.handlers?.allocate ?? ((n, context) => context.services.libraryCall('operatorNew', [n], context)),
  free: r.handlers?.free ?? ((p, context) => context.services.libraryCall('operatorDelete', [p], context)),
  registerExit: r.handlers?.registerExit ?? ((p, context) => context.services.libraryCall('registerExit', [p], context))}});

//4a2b40. Original ANSI variadic formatter into a4096-byte stack buffer,
//then actual405310 assignment. CRT formatting is the library boundary.
function formatRequestString(output, format, argument, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 0x1000;
  put(m, S + 4, output); put(m, S + 8, format); put(m, S + 12, argument); put(m, S - 4, 0x4a2b4a);
  call(runtime, 'libraryCall', 'vsprintf_s', [F, 0x1000, format, S + 12], F, 0x4a2b69);
  let length = 0; while (m[F + length]) length++;
  output = ptr(m, S + 4); put(m, F - 4, length); put(m, F - 8, F); put(m, F - 12, 0x4a2b9b);
  assignGameCString(output, F, length, {...runtime, scratchBase: F - 12});
  //Known non-clobbering CRT fixture convention; the native caller immediately
  //pushes this volatile ECX in4a2290. Arbitrary CRT register clobbers are open.
  return length ? ptr(m, output + 20) >= 16 ? ptr(m, output) : output : output;
}

//4ad9e0. A play request writes deferred state3 and queues the source under
//the live global manager; it does not call Start on the source voice here.
export function requestGameAudioSamplePlayback(object, flag, runtime) {
  const {memory: m, scratchBase: S} = runtime, B = S - 4, A = B & ~7, F = A - 0x38;
  put(m, S + 4, flag);
  if (Number.isInteger(runtime.entryRegisters?.EBP)) put(m, B, runtime.entryRegisters.EBP);
  put(m, A - 4, -1); put(m, A - 8, 0x56a746); if (Number.isInteger(runtime.sehWord)) put(m, A - 12, runtime.sehWord);
  for (const [name, offset] of [['ESI', 4], ['EDI', 0]]) if (Number.isInteger(runtime.entryRegisters?.[name])) put(m, F + offset, runtime.entryRegisters[name]);
  if (!ptr(m, object + 0x97c)) return;
  m[object + 0x950] = m[B + 8]; put(m, object + 0x94c, 3);
  const string = F + 12;
  put(m, F + 0x20, 15); put(m, F + 0x1c, 0); m[string] = 0; put(m, F + 0x24, 0); put(m, F + 0x34, 0);
  put(m, F - 4, object + 4); put(m, F - 8, 0x5d3f00); put(m, F - 12, string); put(m, F - 16, 0x4ada5a);
  const child = {...runtime, sehWord: A - 12, entryRegisters: {...runtime.entryRegisters, EBP: B, ESI: object}};
  const ecx = formatRequestString(string, 0x5d3f00, object + 4, {...child, scratchBase: F - 16});
  put(m, F - 4, 0x4ada62);
  const logger = getApplicationDebugger(adapted({...child, scratchBase: F - 4, nativeDebuggerFrame: 'direct', entryRegisters: {...child.entryRegisters, ECX: ecx}}));
  if (!(ptr(m, 0x714b18) & 1)) {
    put(m, 0x714b18, ptr(m, 0x714b18) | 1); put(m, F - 4, 0x5d3b98); m[F + 0x34] = 1; put(m, F - 8, 0x4ada82);
    const context = adapted({...child, scratchBase: F - 8, nativeDebuggerFrame: 'wrapper', nativeDebuggerRecords: true, entryRegisters: {...child.entryRegisters, ECX: logger}});
    const current = getApplicationDebugger(context); put(m, F - 8, 0x4ada89);
    put(m, 0x714b1c, registerApplicationDebuggerName(current, 0x5d3b98, false, {...context, nativeDebuggerFrame: undefined, entryRegisters: {...context.entryRegisters, ECX: current}})); m[F + 0x34] = 0;
  }
  put(m, F + 8, object);
  const manager = ptr(m, 0x714b08), lock = manager + 0x874;
  call(runtime, 'platformCall', 'EnterCriticalSection', [lock], F, 0x4adaaa);
  const thread = call(runtime, 'platformCall', 'GetCurrentThreadId', [], F, 0x4adab0);
  put(m, lock + 24, ptr(m, lock + 24) + 1); put(m, lock + 28, thread);
  put(m, F - 4, F + 8); put(m, F - 8, 0x4adac6);
  appendGameImagePointer(ptr(m, manager + 0x83c), F + 8, {...child, scratchBase: F - 8, nativePointerVector: true, entryRegisters: {...child.entryRegisters, ESI: manager, EDI: lock}});
  const depth = ptr(m, lock + 24) - 1 | 0; put(m, lock + 24, depth); if (!depth) put(m, lock + 28, 0);
  call(runtime, 'platformCall', 'LeaveCriticalSection', [lock], F, 0x4adad9);
  const extra = ptr(m, F + 0x24);
  if (extra) {call(runtime, 'libraryCall', 'operatorDeleteArray', [extra], F, 0x4adae8); put(m, F + 0x24, 0);}
  if (ptr(m, F + 0x20) >= 16) call(runtime, 'libraryCall', 'operatorDelete', [ptr(m, string)], F, 0x4adb04);
}
