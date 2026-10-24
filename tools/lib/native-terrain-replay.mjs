import {createNativeFrameMemory as createCapturedMemory} from './native-frame-memory.mjs';
import {queryRawTerrain} from '../../src/raw-terrain-query.mjs';
import {unpackCollisionNormal} from '../../src/collision-grid.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import sqrt from '../../src/sqrt-table.json' with {type: 'json'};

export function replayNativeTerrain(snapshot) {
  const context = decodePhysicsNumericalContext({x87ControlWord: Number(snapshot.registers.fpuControlWord), mxcsr: Number(snapshot.registers.mxcsr)});
  if (context.x87.roundingMode !== 'nearest-even' || context.sse.roundingMode !== 'nearest-even' || context.sse.flushToZero || context.sse.denormalsAreZero) throw Error('Terrain replay requires the supported observed nearest-even numerical context.');
  const ranges = [...snapshot.ranges.values()];
  const aliases = ranges.filter(row => row.rootRva && !row.dereferenceOffsets?.length && Number(row.offset ?? 0) === 0).map(row => ({address: 0x400000 + Number(row.rootRva), targetAddress: Number(row.address), length: row.bytes.length}));
  const captured = createCapturedMemory(ranges, {aliases}), {memory} = captured;
  const required = id => {const row = snapshot.ranges.get(id); if (!row) throw Error(`Missing native terrain input: ${id}`); return row;};
  const body = Number(required('body').address), query = Number(required('query').address), output = Number(required('output').address);
  const stack = required('entry-stack').bytes, parameter = stack.readInt32LE(8);
  if (memory.readFloatLE(0x5dc774) !== 1 || memory.readFloatLE(0x5dca88) !== 4096) throw Error('Native normalization constants differ from the recovered source.');
  const expectedSqrt = Buffer.alloc(sqrt.values.length * 2);
  sqrt.values.forEach((value, index) => expectedSqrt.writeUInt16LE(value, index * 2));
  if (!required('sqrt-table').bytes.equals(expectedSqrt)) throw Error('Native square-root table differs from the source.');
  const sectorTable = memory.readUInt32LE(memory.readUInt32LE(0x90b98c)), sectors = [], sectorReads = new Map();
  function sectorAt(index) {
    if (!Number.isInteger(index) || index < 0 || index > 255) throw Error('Invalid captured sector index.');
    if (sectors[index]) return sectors[index];
    const address = memory.readUInt32LE(sectorTable + index * 4), vertexAddress = memory.readUInt32LE(address + 0x20);
    const columns = memory.readUInt32LE(address + 8), rows = memory.readUInt32LE(address + 12);
    if (columns > 65535 || rows > 65535 || (columns + 1) * (rows + 1) > 0x800000) throw Error('Native sector dimensions exceed the replay bound.');
    const vertices = new Proxy([], {get(target, key, receiver) {
      if (key === 'length') return (columns + 1) * (rows + 1);
      if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)) return Reflect.get(target, key, receiver);
      const vertex = Number(key);
      if (vertex >= (columns + 1) * (rows + 1)) throw Error('Native candidate exceeds its captured sector.');
      const p = vertexAddress + vertex * 8;
      sectorReads.set(p, Buffer.from(captured.span(p, 8)));
      return [0,2,4,6].map(offset => memory.readInt16LE(p + offset));
    }});
    return sectors[index] = {index, columns, rows, vertices, vertexAddress};
  }
  const grid = {sectors: new Proxy(sectors, {get(target, key, receiver) {return typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) ? sectorAt(Number(key)) : Reflect.get(target, key, receiver);}})};
  const views = {candidateAt(address) {
    const candidate = {address};
    for (const [name, offset] of [['flagsByte0',0], ['byte2',2], ['pointOffset',1], ['columns',3]]) Object.defineProperty(candidate, name, {get: () => memory[address + offset]});
    Object.defineProperties(candidate, {
      type: {get: () => memory[address] & 15}, id: {get: () => memory.readUInt32LE(address + 4)}, packedNormal: {get: () => memory.readUInt32LE(address + 8)},
      normalQ8: {get: () => unpackCollisionNormal(memory.readUInt32LE(address + 8))}, sector: {get: () => memory[address + 4]},
      vertexBase: {get: () => {
        const base = sectorAt(memory[address + 4]).vertexAddress, pointer = memory.readUInt32LE(address + 12), delta = pointer - base;
        if (delta < 0 || delta % 8) throw Error('Native candidate vertex pointer does not map to its explicit sector.');
        return delta / 8;
      }}
    });
    return candidate;
  }};
  const writes = [], fraction = queryRawTerrain(body, query, output, parameter, {memory, views, grid,
    roundingMode: context.x87.roundingMode, scratchBase: Number(required('entry-stack').address), trace: write => writes.push(write)});
  return {...captured, fraction, writes, vertexReads: [...sectorReads].map(([address, bytes]) => ({address, bytes})), context, candidateCount: memory.readUInt16LE(body + 0x15c), radiusQ8: memory.readInt32LE(query + 64)};
}
