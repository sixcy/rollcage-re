import {initializeTerrainPointAnimation, updateTerrainPointAnimation} from './terrain-point-animation.mjs';
import {nativeMemorySpan} from './native-memory-spans.mjs';

//47eab4/47eaba, owned by47ea40 before450a90/44a5c0. The caller supplies
//its actual captured ECX session identity; zero seeds remain zero.
export function publishTerrainPointStartupSeed(sessionAddress, {memory}) {
  if (!Number.isInteger(sessionAddress) || sessionAddress <= 0) throw Error('Terrain point seed publication requires the actual captured session identity.');
  const seed = nativeMemorySpan(memory, sessionAddress + 0x618, 4).readUInt32LE();
  nativeMemorySpan(memory, 0x5ec954, 4).writeUInt32LE(seed);
  return seed;
}

//Standalone composition of actual44a5c0/44a7a0 plus the exact owned
//450fc3..451006 restoration. It supplies no point coordinates or RNG answers.
//scratchBase is44a5c0's entry; step({scratchBase}) accepts44a7a0's real entry.
export function initializeSoloTerrainPointRuntime(runtime) {
  const {memory, scratchBase} = runtime ?? {};
  if (!Buffer.isBuffer(memory) || !Number.isInteger(scratchBase)) throw Error('Solo terrain points require shared native memory and an explicit entry stack.');
  const u32 = p => nativeMemorySpan(memory, p, 4).readUInt32LE();
  const s32 = p => nativeMemorySpan(memory, p, 4).readInt32LE();
  const u16 = p => nativeMemorySpan(memory, p, 2).readUInt16LE();
  const s16 = p => nativeMemorySpan(memory, p, 2).readInt16LE();
  const byte = p => nativeMemorySpan(memory, p, 1)[0];
  const geometry = () => {
    const pack = u32(0x90b98c), count = u32(pack + 16), table = u32(0x909240);
    if (count > 256) throw Error('Solo terrain point sectors exceed the native byte domain.');
    nativeMemorySpan(memory, table, count * 4);
    return Array.from({length: count}, (_, index) => {
      const header = u32(table + index * 4), columns = u32(header + 8), rows = u32(header + 12), address = u32(header + 32), vertices = (columns + 1) * (rows + 1);
      if (!Number.isSafeInteger(vertices) || vertices > 0x800000) throw Error('Solo terrain point vertices exceed the explicit admission bound.');
      nativeMemorySpan(memory, address, vertices * 8);
      return {index, header, columns, rows, address, vertices};
    });
  };
  const validateCells = () => {
    const sectors = geometry(), auxiliary = u32(0x90b990), count = byte(auxiliary + 0xfc), cells = u32(auxiliary + 0x100);
    nativeMemorySpan(memory, cells, count * 4);
    for (let index = 0; index < count; index++) {
      const cell = cells + index * 4, sector = sectors[byte(cell + 2)], row = u16(cell), column = byte(cell + 3);
      if (!sector || row >= sector.rows || column >= sector.columns) throw Error('Solo terrain point authored cell exceeds its complete sector grid.');
    }
  };
  validateCells();
  if (typeof runtime.handlers?.allocate !== 'function') throw Error('Solo terrain point construction requires its actual CRT allocator.');
  initializeTerrainPointAnimation({...runtime, handlers: {...runtime.handlers, allocate(size, context) {
    const address = runtime.handlers.allocate(size, context);
    if (!Number.isInteger(address) || address <= 0) throw Error('Solo terrain point construction requires nonnull allocated storage; native failed-allocation continuation is not supported.');
    nativeMemorySpan(memory, address, size);
    return address;
  }}});
  const rows = () => {
    const count = s32(0x90b998), address = u32(0x90b994);
    if (count < 0 || count > 1024) throw Error('Solo terrain point row count exceeds its allocated6000h-byte table.');
    nativeMemorySpan(memory, address, count * 24);
    return {count, address};
  };
  rows();
  return Object.freeze({
    //This is a caller section, not44a7a0. Count/root are captured once, while
    //each target and each base WORD remain live at their actual read sites.
    restoreForPhysics() {
      if (!byte(u32(0x90b990) + 0xfc)) return;
      const count = s32(0x90b998), base = u32(0x90b994);
      if (count > 1024) throw Error('Solo terrain point restoration exceeds its allocated row table.');
      for (let index = 0; index < count; index++) {
        const row = base + index * 24, target = u32(row);
        for (let axis = 0; axis < 3; axis++) nativeMemorySpan(memory, target + axis * 2, 2).writeUInt16LE(u16(row + 4 + axis * 2));
      }
    },
    step(context = {}) {
      if (context.memory !== undefined && context.memory !== memory) throw Error('Solo terrain point update cannot replace its shared memory.');
      if (byte(u32(0x90b990) + 0xfc)) {
        const live = rows();
        for (let index = 0; index < live.count; index++) nativeMemorySpan(memory, u32(live.address + index * 24), 8);
      }
      updateTerrainPointAnimation({...runtime, ...context, memory, scratchBase: context.scratchBase ?? scratchBase});
    },
    get snapshot() {
      const live = rows(), sectors = geometry(), affected = new Set();
      const records = Array.from({length: live.count}, (_, index) => {
        const address = live.address + index * 24, target = u32(address), sector = sectors.find(row => target >= row.address && target + 8 <= row.address + row.vertices * 8 && (target - row.address) % 8 === 0);
        if (sector) affected.add(sector.index);
        return Object.freeze({address, targetAddress: target, sector: sector?.index ?? null,
          basePosition: Object.freeze([4,6,8].map(offset => s16(address + offset))),
          position: Object.freeze([0,2,4].map(offset => s16(target + offset))), flags: u16(target + 6),
          phase: s16(address + 16), phaseOffset: s16(address + 18), rateMode: byte(address + 20), amplitudeMode: byte(address + 21)});
      });
      const segments = [...affected].sort((a,b) => a-b).map(index => {
        const sector = sectors[index];
        return Object.freeze({index, columns: sector.columns, rows: sector.rows,
          vertices: Object.freeze(Array.from({length: sector.vertices}, (_, vertex) => Object.freeze([0,2,4,6].map(offset => offset === 6 ? u16(sector.address + vertex * 8 + offset) : s16(sector.address + vertex * 8 + offset)))))});
      });
      return Object.freeze({enabled: Boolean(byte(u32(0x90b990) + 0xfc)), count: live.count,
        constructionSeed: u32(0x5ec954), emissionSeed: u32(0x5ec958), rows: Object.freeze(records), segments: Object.freeze(segments)});
    }
  });
}
