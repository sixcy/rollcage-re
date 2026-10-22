const put = (m, p, value) => m.writeInt32LE(value | 0, p);

//40d8c0. Descriptor strings use the original secure-copy imports; the ten
//DWORDs and eight flag bytes are separate live forward reads, preserving
//native overlap effects. scratchBase is entry ESP (RET4 consumes source).
export function copyGameAudioDescriptor(object, source, runtime) {
  const {memory: m, scratchBase: S, entryRegisters = {}} = runtime;
  if (Number.isInteger(entryRegisters.EBX)) put(m, S - 4, entryRegisters.EBX);
  if (Number.isInteger(entryRegisters.EDI)) put(m, S - 8, entryRegisters.EDI);
  put(m, S + 4, source);
  const copy = (name, args, top, returned, afterPush, terminate) => {
    for (let i = args.length - 1; i >= 0; i--) {put(m, top - (args.length - i) * 4, args[i]); if (i === afterPush) terminate();}
    const entry = top - args.length * 4 - 4; put(m, entry, returned);
    if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Audio descriptor copy requires CRT ${name}.`);
    runtime.services.libraryCall(name, args.map((_, i) => m.readUInt32LE(entry + 4 + i * 4)), {...runtime, scratchBase: entry});
  };
  copy('strncpy_s', [object, 24, source, 23], S - 8, 0x40d8d8, 0, () => {m[object + 0x17] = 0;});
  copy('strncpy_s', [object + 24, 24, source + 24, 23], S - 24, 0x40d8ee, 3, () => {m[object + 0x2f] = 0;});
  m.writeUInt16LE(0, object + 0x42e);
  copy('wcsncpy_s', [object + 48, 512, source + 48, 511], S - 40, 0x40d90f, -1, () => {});
  for (let offset = 0x430; offset <= 0x454; offset += 4) put(m, object + offset, m.readInt32LE(source + offset));
  for (let offset = 0x458; offset < 0x460; offset++) m[object + offset] = m[source + offset];
  return object;
}
