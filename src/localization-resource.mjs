import {findRawArchiveResource, readRawArchiveResource} from './game-resource-files.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//439090. Actual resource8 ownership and in-place preprocessing. The decoded
//size belongs to the first401140 query, independently of401160's duplicate.
export function loadProcessedLocalization(runtime) {
  const {memory: m, scratchBase: S} = runtime;
  const old = ptr(m, 0x6e65f4);
  if (old) {
    if (typeof runtime.services?.libraryCall !== 'function') throw Error('Localization resource loading requires CRT free.');
    put(m, S - 4, old); put(m, S - 8, 0x4390a0); runtime.services.libraryCall('free', [old], {...runtime, scratchBase: S - 8});
  }
  if (runtime.entryRegisters?.ESI !== undefined) put(m, S - 4, runtime.entryRegisters.ESI);
  put(m, S - 8, 8); put(m, 0x6e65f4, 0); put(m, 0x6e65e4, 0); put(m, S - 12, 0x4390bf);
  const entry = findRawArchiveResource(8, runtime);
  put(m, S - 12, 0); put(m, S - 16, 8); put(m, 0x6e65e4, ptr(m, entry + 8)); put(m, S - 20, 0x4390d0);
  const resource = readRawArchiveResource(8, 0, {...runtime, scratchBase: S - 20}) >>> 0, count = ptr(m, 0x6e65e4);
  put(m, 0x6e65f4, resource);
  for (let i = 0; i < count; i++) {
    const p = resource + i;
    if (m[p] < 32 && m[p] !== 9) m[p] = 1;
    if (m[p] === 126 && m[p + 1] === 126) m[p] = 0;
  }
}
