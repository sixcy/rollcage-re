import {abs32, lookupSqrt, multiplyQ16, dotQ16} from './fixed-integer.mjs';
import {quaternionMatrix} from './fixed-math.mjs';
import {updateBodyDerived} from './body-physics.mjs';
import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';

const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const vector = (memory, address, count = 3) => Array.from({length: count}, (_, index) => memory.readInt32LE(address + index * 4));
const store = (memory, address, values) => values.forEach((value, index) => put(memory, address + index * 4, value));

//474510. Caller output slots are initialized separately, then conditionally
//filled in native order. Differences divide as unsigned32 by40.
export function measureRawBodyStorage(model, size, enabled, outputs, {memory}) {
  for (let index = 0; index < 3; index++) put(memory, outputs[index], -1);
  let auxiliary = memory.readUInt16LE(model + 0x1c);
  for (let index = 3; index < 6; index++) put(memory, outputs[index], -1);
  let offset = size | 0;
  const bytesAt = selected => Math.imul(Math.floor(((memory.readInt32LE(selected + 0x14) - memory.readInt32LE(selected + 0x10)) >>> 0) / 40), 132);
  if (enabled[0]) {
    const bytes = bytesAt(model); put(memory, outputs[0], offset); auxiliary = memory.readUInt16LE(model + 0x1c);
    put(memory, outputs[1], offset + bytes); offset = (offset + bytes * 2) | 0;
  }
  if (enabled[1]) {const bytes = bytesAt(model + auxiliary); put(memory, outputs[2], offset); put(memory, outputs[3], offset + bytes); offset = (offset + bytes * 2) | 0;}
  if (enabled[2]) {put(memory, outputs[4], offset); const bytes = bytesAt(model + memory.readUInt16LE(model + 0x1e)); put(memory, outputs[5], offset + bytes); offset = (offset + bytes * 2) | 0;}
  return offset;
}

//474490. Only the recovered scattered fields of each132-byte output record
//are copied; all other bytes remain allocator/caller-owned.
export function publishRawBodyStorage(output, model, first, second, {memory}) {
  const start = memory.readInt32LE(model + 0x10); put(memory, output + 4, second); put(memory, output, first);
  const count = Math.floor((((memory.readInt32LE(model + 0x14) - memory.readInt32LE(model + 0x10)) << 1) >>> 0) / 40);
  let source = model + start + 12, destination = first + 32;
  for (let index = 0; index < count; index++, source += 40, destination += 132) {
    for (const [from, to] of [[-8, -28], [0, 0], [8, 32], [16, 64], [24, 96]]) put(memory, destination + to, memory.readInt32LE(source + from));
    word(memory, destination + 98, memory.readUInt16LE(source + 18));
  }
  word(memory, model + 10, memory.readUInt16LE(model + 10) + 1);
}

//4741c0. The object arena advances in128-byte units, while the returned
//address rounds its previous offset down to4 bytes. Registration caps at512.
export function createRawBody(model, flags, size, mode, {memory, scratchBase}) {
  const local = scratchBase - 0x34, auxiliary = model ? model + memory.readUInt16LE(model + 0x1c) : 0, third = model ? model + memory.readUInt16LE(model + 0x1e) : 0;
  const outputs = [local + 0x18, local + 0x14, local + 0x24, local + 0x20, local + 0x30, local + 0x2c];
  let required = size | 0;
  if (model) required = measureRawBodyStorage(model, size, [!mode, auxiliary !== model && !mode, third !== model && !mode], outputs, {memory});
  const old = pointer(memory, 0x70dcf4), body = (pointer(memory, 0x902eec) + (old & 0xfffffffc)) >>> 0, advanced = (old + ((required + 127) & 0xffffff80)) | 0;
  if (model) put(memory, 0x70dcf4, advanced);
  memory.fill(255, body, body + 384);
  put(memory, body, flags); put(memory, body + 4, 0); word(memory, body + 8, 0); put(memory, body + 12, 0);
  for (const offset of [0x118, 0x110, 0x148]) put(memory, body + offset, 0);
  put(memory, body + 0x11c, -1); memory[body + 0x12f] = 255; memory.fill(0, body + 0x16a, body + 0x172); word(memory, body + 0x172, 0);
  if (!model) put(memory, 0x70dcf4, advanced);
  const index = memory.readInt32LE(0x6e6b44);
  if (index < 512) {put(memory, 0x70e200 + index * 4, body); word(memory, body + 0x10e, index); put(memory, 0x6e6b44, index + 1);}
  if (!model) return body;
  put(memory, body + 0x24, memory.readInt32LE(model + 0x40)); memory[body + 0x162] = memory[model + 4]; memory[body + 0x10d] = memory[model + 4];
  put(memory, body + 0x2c, memory.readInt32LE(model + 12)); put(memory, body + 0x28, memory.readInt32LE(model + 12));
  let displacement = memory.readUInt16LE(model + 0x1c);
  if (displacement) {put(memory, body + 0x2c, memory.readInt32LE(model + displacement + 12)); displacement = memory.readUInt16LE(model + 0x1c); memory[body + 0x162] = memory[model + displacement + 4];}
  put(memory, body + 0x30, memory.readInt32LE(body + 0x2c)); memory[body + 0x163] = memory[body + 0x162];
  displacement = memory.readUInt16LE(model + 0x1e);
  if (displacement) {put(memory, body + 0x30, memory.readInt32LE(model + displacement + 12)); displacement = memory.readUInt16LE(model + 0x1e); memory[body + 0x163] = memory[model + displacement + 4];}
  put(memory, body + 0x10, model);
  if (!mode) {
    publishRawBodyStorage(body + 0x14, model, (memory.readInt32LE(outputs[0]) + body) | 0, (memory.readInt32LE(outputs[1]) + body) | 0, {memory});
    if (auxiliary === model) {put(memory, body + 0x1c, memory.readInt32LE(body + 0x14)); put(memory, body + 0x20, memory.readInt32LE(body + 0x18));}
    else publishRawBodyStorage(body + 0x1c, auxiliary, (memory.readInt32LE(outputs[2]) + body) | 0, (memory.readInt32LE(outputs[3]) + body) | 0, {memory});
    if (third !== auxiliary && third !== model) publishRawBodyStorage(body + 0x14c, third, (memory.readInt32LE(outputs[4]) + body) | 0, (memory.readInt32LE(outputs[5]) + body) | 0, {memory});
    else {put(memory, body + 0x14c, memory.readInt32LE(body + 0x1c)); put(memory, body + 0x150, memory.readInt32LE(body + 0x20));}
  }
  return body;
}

//4799f0 through the existing checked arithmetic model. The raw object layout
//keeps its cached matrix distinct from principal inertia and quaternion state.
export function updateRawBodyDerived(body, {memory, scratchBase}) {
  const state = {momentum: vector(memory, body + 0x40), angularMomentum: vector(memory, body + 0x4c), quaternion: vector(memory, body + 0x58, 4), inverseInertia: vector(memory, body + 0x9c), mass: memory.readInt32LE(body + 0xa8), inverseMass: memory.readInt32LE(body + 0xac), rotation: Array.from({length: 9}, (_, index) => memory.readInt16LE(body + 0xc4 + index * 2))};
  const velocity = state.inverseMass === 65536 ? state.momentum : state.momentum.map(value => multiplyQ16(value, state.inverseMass));
  if (velocity.some(value => abs32(value) > 0x490000)) {
    const reduced = velocity.map(value => value >> 8), squared = dotQ16(reduced, reduced);
    if ((squared >>> 0) > 0x4000) {
      const magnitude = abs32(squared << 8);
      put(memory, 0x91d45c, magnitude); put(memory, 0x91d460, Math.clz32(magnitude));
    }
  }
  const nativeScratch = Number.isInteger(scratchBase) ? {memory, scratchBase, beforeQuaternionProduct: () => put(memory, scratchBase - 0xb4, body + 0xe4)} : undefined;
  updateBodyDerived(state, {nativeScratch}); store(memory, body + 0x40, state.momentum); store(memory, body + 0x68, state.linearVelocity); store(memory, body + 0xe4, state.worldInverseInertia); store(memory, body + 0xb8, state.angularVelocity); store(memory, body + 0x8c, state.quaternionDerivative);
}

//474600. Physical objects use bucket+8; particles use its separate+a head.
export function registerRawBodySpatial(body, {memory}) {
  const {bucket, outside} = lookupRawSpatialBucket(...vector(memory, body + 0x34), {memory}), tagged = (bucket + (outside ? 1 : 0)) >>> 0;
  const base = pointer(memory, 0x902eec); put(memory, body + 12, tagged);
  const selected = tagged & 0xfffffffe, head = memory.readUInt16LE(selected + 8), id = (((body - base + 128) >>> 0) >>> 7) & 65535;
  put(memory, body + 4, head);
  if (head) word(memory, (base - 122 + head * 128) >>> 0, id);
  word(memory, selected + 8, id);
}

//4798d0. Copies remain forward and field-wise so overlapping configurations
//observe native ordering. Mass/inertia fields are read after matrix writes.
export function initializeRawBody(body, configuration, {memory, scratchBase}) {
  put(memory, body + 0x108, 0);
  for (let offset = 0; offset <= 0x30; offset += 4) put(memory, body + 0x34 + offset, memory.readInt32LE(configuration + offset));
  quaternionMatrix(vector(memory, body + 0x58, 4)).forEach((value, index) => word(memory, body + 0xc4 + index * 2, value));
  for (let index = 0; index < 6; index++) put(memory, body + 0x9c + index * 4, memory.readInt32LE(configuration + 0x68 + index * 4));
  put(memory, body + 0xb4, 0x20000);
  for (const offset of [0x90, 0x94, 0x98, 0x8c, 0x74, 0x78, 0x7c, 0x80, 0x84, 0x88]) put(memory, body + offset, 0);
  updateRawBodyDerived(body, {memory, scratchBase: Number.isInteger(scratchBase) ? scratchBase - 16 : undefined}); registerRawBodySpatial(body, {memory});
}

//428270 raw adapter. Pool counters/pointers stay live and byte-sized IDs keep
//their native free/active/reverse order, without assuming an allocator setup.
export function registerRawBodyShapes(body, count, descriptors, {memory}) {
  memory[body + 0x10c] = count & 255;
  const pool = count ? pointer(memory, 0x91e79c) : 0;
  const allocate = () => {
    const old = memory.readInt32LE(0x91e794), source = pointer(memory, 0x91e780) + old;
    put(memory, 0x91e798, memory.readInt32LE(0x91e798) + 1); put(memory, 0x91e794, old - 1);
    const active = (memory.readInt32LE(0x91e784) + 1) | 0, id = memory[source]; put(memory, 0x91e784, active);
    memory[pointer(memory, 0x91e78c) + active] = id; memory[pointer(memory, 0x91e790) + id] = active & 255;
    return {id, record: pool + id * 72};
  };
  let radius = 0, index = 0;
  if (count) {
    do {
      const {id, record} = allocate(); memory[body + 0x140 + index] = id;
      for (let axis = 0; axis < 3; axis++) word(memory, record + axis * 2, memory.readUInt16LE(descriptors + axis * 4));
      put(memory, record + 0x40, memory.readInt32LE(descriptors + 12)); word(memory, record + 0x44, memory.readUInt16LE(descriptors + 16)); descriptors += 20;
      memory.fill(0, record + 0x20, record + 0x38); put(memory, record + 0x38, -1);
      const squared = [0, 2, 4].reduce((sum, offset) => {const value = memory.readInt16LE(record + offset); return (sum + Number((BigInt(value) * BigInt(value)) >> 8n)) | 0;}, 0);
      const input = abs32(squared); put(memory, 0x91d45c, input); put(memory, 0x91d460, Math.clz32(input));
      const bound = ((lookupSqrt(input) << 4) + memory.readInt32LE(record + 0x40)) | 0; if ((bound >>> 0) > (radius >>> 0)) radius = bound;
      word(memory, record + 0x46, index); index = (index + 1) & 65535;
    } while (index < (count >>> 0));
    const {id, record} = allocate(); memory[body + 0x140 + index] = id; put(memory, record, 0); word(memory, record + 4, 0); memory.fill(0, record + 0x20, record + 0x38); word(memory, record + 0x44, 0);
    put(memory, record + 0x40, (memory.readUInt32LE(body) & 0x1ff) === 17 ? 0x5000 : radius); word(memory, record + 0x46, count);
  }
  const physicalCount = memory.readUInt16LE(0x902bc4), physical = pointer(memory, 0x902bc0); put(memory, physical + physicalCount * 4, body); put(memory, physical + physicalCount * 4 + 4, 0); word(memory, 0x902bc4, physicalCount + 1);
  if (count) put(memory, body, memory.readInt32LE(body) & 0xffff7fff);
  put(memory, body + 0x130, 0);
}
