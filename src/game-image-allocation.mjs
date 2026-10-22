const put = (m, p, v) => m.writeInt32LE(v | 0, p);

//4a3290. Successful allocation is an actual game wrapper around CRT malloc.
//The allocation-failure reporter4a1fe0 remains a named game boundary, also
//used by the existing pixel-image allocator; no constant success is supplied.
export function allocateGameImagePalette(bytes, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  if (Number.isInteger(S)) {for (const [register, offset] of [['ESI', -4], ['EDI', -8]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, S + offset, runtime.entryRegisters[register]); put(m, S - 12, bytes); put(m, S - 16, 0x4a329b);}
  if (typeof runtime.services?.libraryCall !== 'function') throw Error('Game image palette allocation requires CRT malloc.');
  const pointer = runtime.services.libraryCall('allocate', [bytes >>> 0], runtime) >>> 0;
  if (!pointer) {
    if (Number.isInteger(S)) {for (const [i, value] of [0x5d399c, 26, 0x5d3938, bytes >>> 10].entries()) put(m, S - 24 + i * 4, value); put(m, S - 28, 0x4a32b9);}
    if (typeof runtime.handlers?.allocationFailure4a1fe0 !== 'function') throw Error('Game image palette allocation failure reaches debug reporter4a1fe0.');
    if (runtime.handlers.allocationFailure4a1fe0(0x5d399c, 26, 0x5d3938, bytes >>> 10, {...runtime, scratchBase: S - 28})) throw Error('Native image palette allocation debug breakpoint.');
  }
  return pointer;
}
