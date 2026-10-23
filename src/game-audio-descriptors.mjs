import {nativeCodeAddress} from './native-memory-spans.mjs';
const put = (m, p, value) => m.writeInt32LE(value | 0, p);

//40cea0. Game-owned sample descriptor defaults. Secure string-copy routines
//are original CRT imports; fields and ordering remain raw native memory.
export function initializeGameAudioDescriptor(object, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  if (Number.isInteger(runtime.entryRegisters?.EDI)) put(m, S - 4, runtime.entryRegisters.EDI);
  const copy = (name, args, top, returned, afterPush, terminator) => {
    for (let i = args.length - 1; i >= 0; i--) {put(m, top - 4 * (args.length - i), args[i]); if (i === afterPush) terminator();}
    const entry = top - args.length * 4 - 4; put(m, entry, nativeCodeAddress(returned, runtime));
    if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Game audio descriptor requires CRT ${name}.`);
    const liveArgs = args.map((_, i) => m.readUInt32LE(entry + 4 + i * 4));
    runtime.services.libraryCall(name, liveArgs, {...runtime, scratchBase: entry});
  };
  copy('strncpy_s', [object, 24, nativeCodeAddress(0x56fe6b, runtime), 23], S - 4, 0x40ceb7, 0, () => {m[object + 0x17] = 0;});
  copy('strncpy_s', [object + 24, 24, nativeCodeAddress(0x5d0320, runtime), 23], S - 20, 0x40cece, 2, () => {m[object + 0x2f] = 0;});
  copy('wcsncpy_s', [object + 48, 512, nativeCodeAddress(0x56feb0, runtime), 511], S - 36, 0x40cef0, 0, () => {m.writeUInt16LE(0, object + 0x42e);});
  for (const [offset, value] of [[0x430, 0], [0x434, 1], [0x438, 0x3f800000], [0x43c, 0x3f800000], [0x440, 0x41f00000], [0x444, 0x43160000], [0x448, 0x43b40000], [0x44c, 0x43b40000], [0x450, 0x3f800000], [0x454, 5], [0x458, 0x10000], [0x45c, 0x1000101]]) put(m, object + offset, value);
  return object;
}
