const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function library(runtime, name, args, entry, returnAddress) {
  const {memory: m} = runtime;
  for (let i = 0; i < args.length; i++) put(m, entry + 4 + i * 4, args[i]);
  put(m, entry, returnAddress);
  if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Game diagnostics require CRT ${name}.`);
  return runtime.services.libraryCall(name, args, {...runtime, scratchBase: entry});
}

//401260. Lazy logfile ownership and optional original session header.
export function openGameDiagnosticLog(runtime) {
  const {memory: m, scratchBase: S} = runtime;
  if (!get(m, 0x5e8114)) return;
  if (!ptr(m, 0x6e4908)) {
    const file = library(runtime, 'fopen', [0x5e8010, get(m, 0x6e490c) ? 0x5e8244 : 0x5e8240], S - 12, 0x401290) >>> 0;
    put(m, 0x6e4908, file); if (!file) return;
  }
  if (get(m, 0x5e8118)) {put(m, S - 4, 0x5e8224); put(m, S - 8, 0x4012af); formatGameDiagnostic(0x5e8224, {...runtime, scratchBase: S - 8});}
}

//4012c0. Read the stream again after fputs, preserving real service aliases.
export function appendGameDiagnostic(message, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, message);
  if (!get(m, 0x5e8114)) return;
  if (!ptr(m, 0x6e4908)) {put(m, S - 4, 0x4012d7); openGameDiagnosticLog({...runtime, scratchBase: S - 4}); if (!ptr(m, 0x6e4908)) return;}
  library(runtime, 'fputs', [ptr(m, S + 4), ptr(m, 0x6e4908)], S - 12, 0x4012eb);
  library(runtime, 'fflush', [ptr(m, 0x6e4908)], S - 16, 0x4012f7);
}

//401300. Variadic arguments already occupy native entryESP+8 onwards.
//Formatting is genuine CRT; bounds, suffix append and logging are game code.
export function formatGameDiagnostic(format, runtime) {
  const {memory: m, scratchBase: S, entryRegisters = {}} = runtime, frame = S - 0x7dc, output = S - 0x7d0;
  put(m, S + 4, format);
  if (!get(m, 0x5e8114)) return;
  for (const [name, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) if (entryRegisters[name] !== undefined) put(m, frame + offset, entryRegisters[name]);
  library(runtime, 'vsnprintf', [output, 0x7ce, ptr(m, S + 4), S + 8], frame - 20, 0x401331);
  let suffixLength = 1; while (m[0x5e8248 + suffixLength - 1]) suffixLength++;
  m[S - 2] = 0; let end = output; while (m[end]) end++;
  //Original forward REP MOVSD/MOVSB, including a possibly aliased suffix.
  const dwords = suffixLength >>> 2; let source = 0x5e8248, destination = end;
  for (let i = 0; i < dwords; i++, source += 4, destination += 4) put(m, destination, get(m, source));
  for (let i = 0; i < (suffixLength & 3); i++) m[destination + i] = m[source + i];
  put(m, frame - 20, output); put(m, frame - 24, 0x401371);
  appendGameDiagnostic(output, {...runtime, scratchBase: frame - 24});
}
