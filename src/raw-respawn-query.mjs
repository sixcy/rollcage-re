import {quaternionMatrix} from './fixed-math.mjs';
import {prepareBodyShapeCache} from './body-shape-cache.mjs';
import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {appendRespawnRegionCandidates} from './respawn-terrain-candidates.mjs';
import {appendRawRespawnModelCandidates} from './raw-respawn-model-candidates.mjs';
import {queryRawTerrain} from './raw-terrain-query.mjs';
import {queryRawPlacedModelSphere} from './raw-model-sphere-query.mjs';

const CLONE = 0x70f130, ARENA = 0x70ed30;
const get = (memory, address) => memory.readInt32LE(address), pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const vector = (memory, address) => [0, 4, 8].map(offset => get(memory, address + offset));

function cacheState(memory, scratchBase) {
  return {
    cacheRotation: body => {
      for (const offset of [0, 4, 8, 12, 16]) put(memory, 0x91d360 + offset, get(memory, body.address + 0xc4 + offset));
      const scale = memory.readFloatLE(0x5dc5f4);
      for (let index = 0; index < 9; index++) memory.writeFloatLE(Math.fround(Math.fround(memory.readInt16LE(0x91d360 + index * 2)) * scale), 0x91cdc0 + Math.floor(index / 3) * 16 + index % 3 * 4);
    },
    shapeTransform: (record, offset) => {
      put(memory, 0x91d3e4, record.readInt32LE(0)); put(memory, 0x91d3e8, record.readInt32LE(4));
      offset.forEach((value, index) => put(memory, 0x91d448 + index * 4, value));
    },
    //429ab0 PUSH EBP saves its parent's current shape-record pointer. A later
    //zero-row47d9c0 consumes these same bytes as an uninitialized nearest ID.
    beforeShapeCacheEntry: (body, record) => put(memory, scratchBase - 136, record.byteOffset - memory.byteOffset),
  };
}

function terrainSlot(memory, address, terrainVerticesFor) {
  const slot = {};
  for (const [name, offset, width] of [['flagsByte0', 0, 1], ['pointOffset', 1, 1], ['byte2', 2, 1], ['columns', 3, 1], ['id', 4, 4], ['packedNormal', 8, 4]]) Object.defineProperty(slot, name, {enumerable: true, get: () => width === 1 ? memory[address + offset] : pointer(memory, address + offset), set: value => width === 1 ? memory[address + offset] = value & 255 : put(memory, address + offset, value)});
  Object.defineProperty(slot, 'type', {enumerable: true, get: () => memory[address] & 15, set: value => {memory[address] = memory[address] & 240 | value & 15;}});
  Object.defineProperty(slot, 'vertexBase', {enumerable: true, get: () => (pointer(memory, address + 12) - terrainVerticesFor(memory[address + 4])) / 8, set: value => put(memory, address + 12, terrainVerticesFor(memory[address + 4]) + value * 8)});
  return slot;
}

function appendRawRespawnRegion(record, region, center, radiusSquared, {memory, grid, views, scratchBase}) {
  const numeric = key => typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key);
  const slots = new Proxy([], {has: (target, key) => numeric(key) || Reflect.has(target, key), get: (target, key, receiver) => numeric(key) ? terrainSlot(memory, ARENA + Number(key) * 16, sector => {
    const header = pointer(memory, pointer(memory, 0x909240) + sector * 4); return pointer(memory, header + 0x20);
  }) : Reflect.get(target, key, receiver)});
  slots.length = 65536;
  //47da98 initializes final-frame local58h to sector width minus region
  //width; any entered form loop drains it to0. A later49b690 notification
  //copies this surviving numeric local as imported address padding.
  const state = {candidates: slots, scratch: {nearestId: get(memory, scratchBase - 0x50), nearestLocal: get(memory, scratchBase - 0x50), closestMetricLocal: 0x7fffffff, remainingForms: grid.sectors[region.sector].columns - region.columns}};
  for (const [name, offset, width] of [['count', 0x15c, 2], ['closestId', 0x11c, 4], ['closestDistanceSquared', 0x120, 4]]) Object.defineProperty(state, name, {get: () => width === 2 ? memory.readUInt16LE(CLONE + offset) : get(memory, CLONE + offset), set: value => width === 2 ? memory.writeUInt16LE(value & 65535, CLONE + offset) : put(memory, CLONE + offset, value)});
  const sector = grid.sectors[region.sector]; let cursor = 0x70eb30;
  for (let row = 0; row <= region.rows; row++) for (let column = 0; column <= region.columns; column++) {
    const vertex = sector.vertices[(region.row + row) * (sector.columns + 1) + region.column + column];
    const metric = vertex.slice(0, 3).reduce((sum, value, axis) => {const delta = value - center[axis] | 0; return sum + Math.imul(delta, delta) | 0;}, 0) >> 6;
    memory.writeUInt16LE(metric & 0xffff0000 ? 65535 : metric, cursor); cursor += 2;
  }
  const query = {originQ8: vector(memory, record + 8), deltaQ8: vector(memory, record + 20), radiusQ8: get(memory, record + 64)};
  //47da28 stores the region row count before its finalPUSHEDI; its physical
  //slot is entryESP-88, distinct from the final-frame local58h countdown.
  put(memory, scratchBase - 88, region.rows);
  appendRespawnRegionCandidates(grid, region, query, center, radiusSquared, state);
  put(memory, scratchBase - 92, state.scratch.remainingForms);
  //47dc26/2c/3b/40 retain the nearest packed vertex and metric even when
  //the clone's previously closest global does not improve. Later messages
  //observe these private local64h/68h words as imported address padding.
  put(memory, scratchBase - 80, state.scratch.nearestLocal); put(memory, scratchBase - 76, state.scratch.closestMetricLocal);
}

//47d710. Output remains native local storage, retaining fields a rejected
//geometry query does not overwrite. Physical overlap uses the original folded
//unsigned expression, including its y/z product rather than a repaired norm.
export function queryRawRespawnObstruction(original, mode, runtime) {
  const {memory, views, scratchBase} = runtime, records = pointer(memory, 0x91e79c), output = scratchBase - 40;
  let index = mode ? memory.readInt8(CLONE + 0x10c) : 0, remaining = mode ? 1 : memory.readInt8(CLONE + 0x10c) - 1, queries = 0;
  if (remaining !== 0) do {
    if (queries++ >= 256) throw Error('Raw respawn obstruction exceeded its signed-byte shape workflow.');
    const record = records + memory[CLONE + 0x140 + index] * 72;
    //47d753/47d766 retain the actual parameter/output argument words;
    //non-host49b690 transport later exposes the output pointer as address padding.
    put(memory, scratchBase - 76, 0); put(memory, scratchBase - 80, output);
    queryRawTerrain(CLONE, record, output, 0, {...runtime, scratchBase: scratchBase - 84, maxCandidates: 65535}); if (get(memory, output + 28)) return 1;
    queryRawPlacedModelSphere(CLONE, record, output, 0, {...runtime, scratchBase: scratchBase - 84}); if (get(memory, output + 28)) return 1;
    index++; remaining = remaining - 1 | 0;
  } while (remaining !== 0);
  const excluded = value => [4, 22, 12, 17].includes(value & 511);
  if (excluded(get(memory, CLONE))) return 0;
  const count = memory.readUInt16LE(0x902bc4), radius = get(memory, records + memory[CLONE + 0x140 + memory.readInt8(CLONE + 0x10c)] * 72 + 64);
  let list = pointer(memory, 0x902bc0);
  for (let index = 0; index < count; index++, list += 4) {
    const other = pointer(memory, list); if (other === original || excluded(get(memory, other))) continue;
    const [x, y, z] = vector(memory, CLONE + 0x34).map((value, axis) => (value - get(memory, other + 0x34 + axis * 4) | 0) >>> 8);
    if ((x + y + z >>> 0) > 0x20000) continue;
    const otherRadius = get(memory, records + memory[other + 0x140 + memory.readInt8(other + 0x10c)] * 72 + 64), sum = otherRadius + radius | 0;
    if ((Math.imul(x, x) + Math.imul(y + z | 0, z) >>> 0) < (Math.imul(sum, sum) >>> 0)) return 1;
  }
  return 0;
}

//47d040. The clone is declared storage in views, never a physical registry
//insertion. All temporary shape records and candidates alias the real pools.
export function queryRawRespawnPlacement(bodyAddress, positionAddress, quaternionAddress, rotationAddress, mode, outputAddress, runtime) {
  const {memory, views, grid, scratchBase} = runtime;
  if (!Buffer.isBuffer(memory) || views?.memory !== memory || !Number.isInteger(scratchBase)) throw Error('Raw respawn query requires coherent memory/views and native entry ESP.');
  const records = pointer(memory, 0x91e79c), body = views.bodyAt(CLONE);
  if (quaternionAddress) quaternionMatrix([0, 4, 8, 12].map(offset => get(memory, quaternionAddress + offset))).forEach((value, index) => memory.writeInt16LE(value, rotationAddress + index * 2));
  const words = (get(memory, bodyAddress) & 511) === 3 ? 0xf9e : 0x60;
  put(memory, 0x70eb04, bodyAddress); put(memory, 0x70eb00, CLONE);
  for (let index = 0; index < words; index++) put(memory, CLONE + index * 4, get(memory, bodyAddress + index * 4));
  put(memory, 0x70eb04, bodyAddress + words * 4); put(memory, 0x70eb00, CLONE + words * 4);
  if (quaternionAddress) {
    for (const offset of [0, 4, 8, 12]) put(memory, CLONE + 0xc4 + offset, get(memory, rotationAddress + offset));
    memory.writeUInt16LE(memory.readUInt16LE(rotationAddress + 16), CLONE + 0xd4);
    for (const offset of [0, 4, 8, 12]) put(memory, CLONE + 0x58 + offset, get(memory, quaternionAddress + offset));
    put(memory, 0x70eb00, CLONE + 0x68); put(memory, 0x70eb04, quaternionAddress + 16);
  }
  put(memory, CLONE + 0x120, 0x7fffffff);
  const count = memory.readInt8(bodyAddress + 0x10c); put(memory, 0x70eb08, count);
  if (count >= 0) {
    let freeTop = get(memory, 0x91e794); put(memory, 0x91e798, get(memory, 0x91e798) + count + 1);
    for (let index = 0; index <= count; index++) {
      const from = records + memory[bodyAddress + 0x140 + index] * 72;
      const free = pointer(memory, 0x91e780) + freeTop--, active = pointer(memory, 0x91e78c), activeTop = get(memory, 0x91e784) + 1 | 0;
      put(memory, 0x91e784, activeTop); const id = memory[free]; memory[active + activeTop] = id; memory[pointer(memory, 0x91e790) + id] = activeTop & 255; memory[CLONE + 0x140 + index] = id;
      const to = records + id * 72; for (let offset = 0; offset < 72; offset += 4) put(memory, to + offset, get(memory, from + offset));
      put(memory, 0x70eb00, to + 72); put(memory, 0x70eb04, from + 72);
    }
    put(memory, 0x91e794, freeTop);
  }
  for (const offset of [0, 4, 8]) put(memory, CLONE + 0x34 + offset, get(memory, positionAddress + offset));
  prepareBodyShapeCache(body, get(memory, CLONE + 0x118), memory.subarray(records, records + 256 * 72), {...views.timeOptionsFor(body), nativeState: cacheState(memory, scratchBase)});
  put(memory, CLONE + 0x110, 0); put(memory, CLONE + 0x154, ARENA);
  const aggregate = records + memory[CLONE + 0x140 + memory.readInt8(CLONE + 0x10c)] * 72;
  put(memory, outputAddress, -1); vector(memory, CLONE + 0x34).forEach((value, index) => put(memory, aggregate + 8 + index * 4, value >> 8));
  for (const offset of [20, 24, 28]) put(memory, aggregate + offset, 0);
  if (mode === 2) put(memory, aggregate + 64, 8000); put(memory, CLONE + 0x15c, 0);
  const origin = vector(memory, aggregate + 8), registration = lookupRawSpatialBucket(...origin.map(value => value << 8), {memory}); put(memory, 0x70eb28, registration.bucket);
  let accepted = registration.outside ? 0 : 1;
  if (!registration.outside) {
    const zone = memory.readUInt16LE(registration.bucket + 6) & 0x3fff, table = pointer(memory, pointer(memory, 0x90b98c) + 0x80), regionAddress = table + zone * 6;
    const regionCount = (memory.readUInt16LE(regionAddress + 2) >>> 9) + 1, center = origin.map(value => value >> 8 << 16 >> 16), radius = get(memory, aggregate + 64) >> 8;
    for (let index = 0; index < regionCount; index++) {
      const region = grid.regions.find(value => value.index === (regionAddress - pointer(memory, 0x9092c0)) / 6 + index);
      if (!region) throw Error('Raw respawn query requires the relocated region mapping.');
      appendRawRespawnRegion(aggregate, region, center, Math.imul(radius, radius), {...runtime, scratchBase: scratchBase - 56});
    }
    put(memory, CLONE + 0x158, pointer(memory, CLONE + 0x154) + memory.readUInt16LE(CLONE + 0x15c) * 16);
    if ((get(memory, CLONE) & 511) !== 4) {
      appendRawRespawnModelCandidates(CLONE, aggregate, {...runtime, scratchBase: scratchBase - 44});
    }
    put(memory, outputAddress, get(memory, CLONE + 0x11c));
  }
  if (queryRawRespawnObstruction(bodyAddress, mode, {...runtime, scratchBase: scratchBase - 44})) accepted = 0;
  let index = memory.readInt8(CLONE + 0x10c);
  if (index >= 0) {
    const active = pointer(memory, 0x91e78c); let freeTop = get(memory, 0x91e794), activeTop = get(memory, 0x91e784);
    put(memory, 0x91e798, get(memory, 0x91e798) - index - 1);
    do {
      const id = memory[CLONE + 0x140 + index], reverse = pointer(memory, 0x91e790), slot = memory[reverse + id], last = memory[active + activeTop--];
      freeTop++; index--; memory[active + slot] = last; memory[pointer(memory, 0x91e790) + last] = slot; memory[pointer(memory, 0x91e780) + freeTop] = id;
    } while (index >= 0);
    put(memory, 0x91e794, freeTop); put(memory, 0x91e784, activeTop);
  }
  return accepted;
}
