import {nativeGlobalAddress} from './native-global-address.mjs';
import {lookupRawSpatialBucket, expandRawTerrainRanges} from './body-retirement-effects.mjs';
import {transformWheelEffectOffset} from './wheel-effects.mjs';
import {stepRawScriptedMotion} from './raw-scripted-motion.mjs';

const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const lightAddress = (memory,index) => nativeGlobalAddress(memory,(0x80f520 + (index << 6)) >>> 0);

const allocateStorage = (size, runtime) => {
  if (typeof runtime.handlers?.allocate !== 'function') throw Error('Dynamic light construction requires library allocate service.');
  const returned = runtime.handlers.allocate(size >>> 0, runtime), value = typeof returned === 'number' ? returned : returned?.eax;
  if (!Number.isInteger(value)) throw Error('Dynamic light allocation requires explicit EAX pointer.');
  return value >>> 0;
};

//48eeb0 lazy1024-entry attenuation table. The caller supplies actual heap
//storage; original allocation failure still reaches the subsequent writes.
export function initializeDynamicLightAttenuation(runtime) {
  const {memory} = runtime;
  if (pointer(memory, 0x6e6ca8)) return;
  const address = allocateStorage(4096, runtime);
  if (address) memory.fill(0, address, address + 4096);
  put(memory, 0x6e6ca8, address);
  for (let index = 32; index < 1024; index++) put(memory, address + index * 4, Math.max(0, Math.trunc(0x100000 / index) - index - 3));
  for (let index = 0; index < 32; index++) put(memory, address + index * 4, 0x7ffd - index);
}

//48ef30 builds per-sector eight-cell/16-row band storage from the loaded
//GFXM's native segment array, then resets only the native pool ownership fields.
export function initializeDynamicLightStorage(runtime) {
  const {memory} = runtime;
  initializeDynamicLightAttenuation(runtime);
  for (let index = 1; index <= 70; index++) word(memory, lightAddress(memory,index) + 0x24, 0);
  const pack = pointer(memory, 0x90b98c), sectors = pointer(memory, pack), sectorCount = pointer(memory, pack + 16);
  let size = 0, index = 0;
  if (sectorCount) {
    do {
      put(memory, nativeGlobalAddress(memory,0x80f220 + index * 4), size);
      const segment = pointer(memory, sectors + index * 4), bytes = (((pointer(memory, segment + 12) >>> 4) << 5) + 32) | 0;
      size = (size + bytes) >>> 0; index = (index + 1) & 65535;
    } while (index < sectorCount);
  }
  put(memory, nativeGlobalAddress(memory,0x80f220 + index * 4), size);
  const base = allocateStorage(size, runtime);
  if (base) memory.fill(0, base, base + size);
  const pointers = (pointer(memory, pack + 16) + 1) >>> 0;
  put(memory, nativeGlobalAddress(memory,0x80f208), base);
  if (pointers) {
    index = 0;
    do {put(memory, nativeGlobalAddress(memory,0x80f220 + index * 4), get(memory, nativeGlobalAddress(memory,0x80f220 + index * 4)) + base); index = (index + 1) & 65535;} while (index < pointers);
  }
  const words = size >>> 2;
  if (words) {
    index = 0; let cursor = base;
    do {put(memory, cursor, 0); cursor += 4; index = (index + 1) & 65535;} while (index < words);
  }
  put(memory, nativeGlobalAddress(memory,0x80f20c), 0); put(memory, nativeGlobalAddress(memory,0x80f214), 0); put(memory, nativeGlobalAddress(memory,0x80f210), 0);
  memory.fill(0, nativeGlobalAddress(memory,0x80f420), nativeGlobalAddress(memory,0x80f420)+0x100); put(memory, nativeGlobalAddress(memory,0x810920), 0);
}

//44e220 consumes authored32-byte light rows and installs slots1..N. Scripted
//lights claim exactly384 bytes from the existing body arena, preserving gaps.
export function initializeAuthoredDynamicLights(runtime) {
  const {memory} = runtime;
  let index = 1, record = pointer(memory, 0x90926c), count = pointer(memory, 0x909268);
  if (count) do {
    const color = memory.readUIntLE(record, 3) | 0x3c000000, paletteIndex = memory[record + 13];
    let body = 0, x, y, z;
    if (memory[record + 14]) {
      const spawn = memory[record + 15], points = pointer(memory, pointer(memory, 0x90b990) + 0xa8) + spawn * 8, offset = pointer(memory, 0x70dcf4);
      body = (pointer(memory, nativeGlobalAddress(memory, 0x902eec)) + (offset & 0xfffffffc)) >>> 0; put(memory, 0x70dcf4, offset + 384);
      memory.fill(255, body, body + 384); put(memory, body, 0xa00f); put(memory, body + 4, 0); word(memory, body + 8, 0); put(memory, body + 12, 0);
      for (const field of [0x118, 0x110, 0x148]) put(memory, body + field, 0);
      put(memory, body + 0x11c, -1); memory[body + 0x12f] = 255; memory.fill(0, body + 0x16a, body + 0x172); word(memory, body + 0x172, 0);
      const registered = get(memory, 0x6e6b44);
      if (registered < 512) {put(memory, 0x70e200 + registered * 4, body); word(memory, body + 0x10e, registered); put(memory, 0x6e6b44, registered + 1);}
      const scripts = pointer(memory, 0x9092b4); put(memory, body, get(memory, body) | 0x2000);
      put(memory, body + 0x134, scripts + memory.readUInt16LE(scripts + memory[record + 14] * 2));
      put(memory, body + 0x138, 0); word(memory, body + 0x13c, 0); memory[body + 0x13e] = 0; memory[body + 0x13f] = spawn;
      x = memory.readInt16LE(points) << 16; y = memory.readInt16LE(points + 2) << 16; z = memory.readInt16LE(points + 4) << 16;
    } else {x = memory.readInt16LE(record + 6) << 16; y = memory.readInt16LE(record + 8) << 16; z = memory.readInt16LE(record + 10) << 16;}
    let palette = 0, paletteCount = 0;
    if (paletteIndex) {const table = pointer(memory, 0x9092ac), start = memory.readUInt16LE(table + paletteIndex * 2); palette = table + start; paletteCount = ((memory.readUInt16LE(table + paletteIndex * 2 + 2) - start) & 65535) >>> 1;}
    const light = lightAddress(memory,index);
    put(memory, light + 4, y); put(memory, light + 0x28, palette); word(memory, light + 0x2c, 0); put(memory, light + 0x24, 1); put(memory, light, x); put(memory, light + 8, z); word(memory, light + 0x2e, paletteCount); put(memory, light + 0x30, body);
    if (body) {put(memory, body + 0x34, x); put(memory, body + 0x38, y); put(memory, body + 0x3c, z);}
    put(memory, light + 12, color); word(memory, light + 16, memory[record + 12]); word(memory, light + 18, 2);
    insertDynamicLightRanges(index, record + 16, runtime);
    count = pointer(memory, 0x909268); index = (index + 1) >>> 0; record += 32;
  } while (index <= count);
  put(memory, nativeGlobalAddress(memory,0x80f214), count + 1); put(memory, nativeGlobalAddress(memory,0x80f20c), count + 1);
}

//44d5b0 stores four authored ranges and places the index into the first empty
//of eight cells per16-row band. A full band silently receives no new entry.
export function insertDynamicLightRanges(index, ranges, {memory}) {
  const destination = lightAddress(memory,index) + 0x14;
  for (let offset = 0; offset < 16; offset += 4) put(memory, destination + offset, 0);
  for (let range = 0; range < 4; range++) {
    const packed = pointer(memory, ranges + range * 4); if (!packed) return;
    put(memory, destination + range * 4, packed);
    const first = (packed >>> 8) & 4095, last = packed >>> 20, value = (((last + 1) & 2047) << 11) | (first & 2047) | (index << 22), sector = packed & 255;
    for (let band = first >>> 4; band <= last >>> 4; band++) {
      const start = pointer(memory, nativeGlobalAddress(memory,0x80f220 + sector * 4)) + band * 32;
      for (let slot = 0; slot < 8; slot++) if (!get(memory, start + slot * 4)) {put(memory, start + slot * 4, value); break;}
    }
  }
}

//44d6a0 removes the first matching ID per band and queues dirty ranges, with
//the original capacity64 and last-entry-only duplicate suppression.
export function removeDynamicLightRanges(index, {memory}) {
  const ranges = lightAddress(memory,index) + 0x14; let dirtyCount = pointer(memory, nativeGlobalAddress(memory,0x80f210));
  for (let range = 0; range < 4; range++) {
    const packed = pointer(memory, ranges + range * 4); if (!packed) return;
    const sector = packed & 255, first = (packed >>> 12) & 255, last = packed >>> 24;
    if (first > last) continue;
    for (let band = first; band <= last; band++) {
      const start = pointer(memory, nativeGlobalAddress(memory,0x80f220 + sector * 4)) + band * 32;
      for (let slot = 0; slot < 8; slot++) {
        const cell = start + slot * 4, value = pointer(memory, cell);
        if (value && value >>> 22 === (index >>> 0)) {
          const dirty = ((((value & 0x3fffff) | 0x800000) << 7) | (sector & 127)) | 0;
          if (dirtyCount < 64 && (!dirtyCount || get(memory, nativeGlobalAddress(memory,0x80f41c + dirtyCount * 4)) !== dirty)) {put(memory, nativeGlobalAddress(memory,0x80f420 + dirtyCount * 4), dirty); dirtyCount++;}
          put(memory, cell, 0); break;
        }
      }
    }
    put(memory, nativeGlobalAddress(memory,0x80f210), dirtyCount);
  }
}

function collectLightRanges(position, mode, output, outside, {memory}) {
  const found = lookupRawSpatialBucket(get(memory, position), get(memory, position + 4), get(memory, position + 8), {memory});
  put(memory, outside, found.outside);
  expandRawTerrainRanges(found.bucket, output, mode, {memory});
}

//44d7a0. Scan forward from the caller-owned first-search index; no heap call.
//The high-water count increments by one even when a free slot lies farther on.
export function allocateDynamicLight(position, color, mode, runtime) {
  const {memory, scratchBase} = runtime;
  let index = pointer(memory, nativeGlobalAddress(memory,0x80f214)), address = lightAddress(memory,index);
  if (address < nativeGlobalAddress(memory,0x8106e0)) while (address < nativeGlobalAddress(memory,0x8106e0) && memory.readInt16LE(address + 0x24)) {address += 64; index = (index + 1) >>> 0;}
  if (address === nativeGlobalAddress(memory,0x8106e0)) return 0;
  const ranges = scratchBase - 20;
  collectLightRanges(position, (mode << 16) >> 16, ranges, scratchBase - 24, runtime);
  put(memory, address + 0x24, 1);
  for (const offset of [0, 4, 8]) put(memory, address + offset, get(memory, position + offset));
  for (const offset of [0x2c, 0x30, 0x28]) put(memory, address + offset, 0);
  put(memory, address + 12, get(memory, color)); word(memory, address + 16, mode); word(memory, address + 18, 2);
  insertDynamicLightRanges(index, ranges, runtime);
  const count = pointer(memory, nativeGlobalAddress(memory,0x80f20c)); if (count <= index) put(memory, nativeGlobalAddress(memory,0x80f20c), count + 1);
  return index;
}

const changedCell = (memory, light, position) => [0, 4, 8].reduce((bits, offset) => bits | (get(memory, light + offset) ^ get(memory, position + offset)), 0) & 0xff000000;
function moveLight(index, position, ranges, outside, runtime) {
  const {memory} = runtime, address = lightAddress(memory,index);
  if (changedCell(memory, address, position)) {
    removeDynamicLightRanges(index, runtime);
    collectLightRanges(position, memory.readInt16LE(address + 16), ranges, outside, runtime);
    insertDynamicLightRanges(index, ranges, runtime);
  }
  for (const offset of [0, 4, 8]) put(memory, address + offset, get(memory, position + offset));
  word(memory, address + 18, 2);
}

//44d8a0: same-bin moves still copy all position fields and reset refresh age.
export function updateDynamicLightPosition(index, position, runtime) {
  moveLight(index, position, runtime.scratchBase - 20, runtime.scratchBase - 24, runtime);
}

//44df50: vehicle-authored RGB pulse, renderer scratch transform and attached
//light offset. Original yaw/short tables and source body fields are inputs.
export function updateVehicleDynamicLight(light, index, runtime) {
  const {memory, scratchBase} = runtime, body = pointer(memory, light + 0x34);
  const colors = [0, 1, 2].map(offset => memory[body + 0x2e78 + offset]), maximum = Math.max(...colors);
  let bias = Math.imul(memory.readInt16LE(0x5ed030 + memory[body + 0x2e7c] * 2) >> 9, maximum) >> 8;
  if (memory[body + 0x2e7d] & 1) bias = -150;
  const selected = colors.map(color => Math.max(0, Math.min(255, (color + bias) >> 1)));
  const speed = get(memory, body + 0x664);
  if (speed < 0x400000) {
    const shifted = speed << 8, factor = ((shifted + ((shifted >> 31) & 0x3fffff)) | 0) >> 22;
    selected.forEach((value, offset) => {memory[light + 12 + offset] = (Math.imul(value, factor) >> 8) & 255;});
  } else selected.forEach((value, offset) => {memory[light + 12 + offset] = value;});
  for (let offset = 0; offset < 20; offset += 4) put(memory, 0x91d360 + offset, get(memory, body + 0xc4 + offset));
  const scale = memory.readFloatLE(0x5dc5f4);
  for (let lane = 0; lane < 9; lane++) memory.writeFloatLE(Math.fround(Math.fround(memory.readInt16LE(0x91d360 + lane * 2)) * scale), nativeGlobalAddress(memory,0x91cdc0 + Math.floor(lane / 3) * 16 + lane % 3 * 4));
  put(memory, 0x91d3e4, 0xffec0000); put(memory, 0x91d3e8, 0xff6a);
  transformWheelEffectOffset({memory});
  const position = scratchBase - 12;
  for (let lane = 0; lane < 3; lane++) put(memory, position + lane * 4, get(memory, 0x91d448 + lane * 4) + get(memory, body + 0x34 + lane * 4));
  updateDynamicLightPosition(index, position, {...runtime, scratchBase: scratchBase - 48});
}

//44d960 advances per-substep light colors/attachments. Only finalSubstep==0
//also ages dirty ranges and consumes the queued36-byte allocation records.
export function updateDynamicLights(intermediateSubstep, runtime) {
  const {memory, scratchBase, handlers = {}} = runtime, frame = scratchBase - 84;
  //44d96a. This saved cookie can survive into48e310's partly initialized
  //three-DWORD queue payload on a later call using the same entry stack.
  put(memory, scratchBase - 8, pointer(memory, 0x5e8890) ^ ((scratchBase - 0x44) >>> 0));
  let count = pointer(memory, nativeGlobalAddress(memory,0x80f20c));
  if (!(intermediateSubstep | 0)) {
    const end = lightAddress(memory,count);
    if (end > nativeGlobalAddress(memory,0x80f560)) for (let address = nativeGlobalAddress(memory,0x80f572); address < end; address += 64) {const age = memory.readUInt16LE(address); if (age) word(memory, address, age - 1);}
    let dirtyCount = pointer(memory, nativeGlobalAddress(memory,0x80f210)), tail = nativeGlobalAddress(memory,0x80f41c + dirtyCount * 4);
    for (let cursor = tail; cursor >= nativeGlobalAddress(memory,0x80f420); cursor -= 4) {
      const value = pointer(memory, cursor), age = value >>> 29;
      if (age) put(memory, cursor, ((age - 1) << 29) | (value & 0x1fffffff));
      if (!(pointer(memory, cursor) & 0xe0000000)) {put(memory, cursor, get(memory, tail)); tail -= 4; dirtyCount = (dirtyCount - 1) >>> 0;}
    }
    if (pointer(memory, nativeGlobalAddress(memory,0x80f210))) put(memory, nativeGlobalAddress(memory,0x80f210), dirtyCount);
    const queued = pointer(memory, nativeGlobalAddress(memory,0x810920));
    for (let index = 0, item = nativeGlobalAddress(memory,0x8106ec); index < queued; index++, item += 36) {
      const selected = allocateDynamicLight(item - 12, item, memory.readUInt16LE(item + 4), {...runtime, scratchBase: frame - 8});
      if (selected) {
        const light = lightAddress(memory,selected); word(memory, light + 0x24, memory.readUInt16LE(item + 6)); word(memory, light + 0x26, memory.readUInt16LE(item + 8));
        const first = memory.readBigUInt64LE(item + 12); memory.writeBigUInt64LE(first, light + 0x34); put(memory, light + 0x3c, get(memory, item + 20));
      }
    }
    if (queued) count = pointer(memory, nativeGlobalAddress(memory,0x80f20c));
    put(memory, nativeGlobalAddress(memory,0x810920), 0);
  }
  let seed = get(memory, 0x5ec958);
  const remove = index => {removeDynamicLightRanges(index, runtime); word(memory, lightAddress(memory,index) + 0x24, 0); if (count === index + 1) {count--; put(memory, nativeGlobalAddress(memory,0x80f20c), count);}};
  for (let index = 1; index < count; index++) {
    const light = lightAddress(memory,index), kind = memory.readInt16LE(light + 0x24);
    if (kind === 1) {
      const palette = pointer(memory, light + 0x28);
      if (palette) {
        const next = (memory.readUInt16LE(light + 0x2c) + 1) & 65535, selected = next < memory.readUInt16LE(light + 0x2e) ? next : 0; word(memory, light + 0x2c, selected);
        const color = memory.readUInt16LE(palette + selected * 2); put(memory, light + 12, ((color & 31) << 2) | (((color >>> 5) & 31) << 10) | (((color >>> 10) & 31) << 18)); word(memory, light + 18, 2);
      }
    } else if (kind === 2 || kind === 3) {
      const age = (memory.readInt16LE(light + 0x26) - 1) << 16 >> 16; word(memory, light + 0x26, age);
      if (age <= 0) {remove(index); continue;}
      word(memory, light + 18, 2); let red = Math.min(age << 2, 128), green;
      if (kind === 2) green = Math.trunc(Math.imul(red, 3) / 4);
      else {seed = Math.imul(seed, 0x41a7) & 0x7fffffff; put(memory, 0x5ec958, seed); const product = Math.imul((((seed >>> 15) * 96) >>> 16) + 32, red); red = Math.trunc(product / 128); green = Math.trunc(red / 2);}
      put(memory, light + 12, (green << 8) | red);
    } else if (kind === 5 || kind === 7) {
      const body = pointer(memory, light + 0x34), state = get(memory, body + 0x188);
      if (kind === 5 ? state === 16 : !state) {remove(index); continue;}
      for (let lane = 0; lane < 3; lane++) memory[light + 12 + lane] = memory[body + (kind === 5 ? 0x1b4 : 0x2a3d) + lane] >>> (kind === 5 ? 3 : 1);
      moveLight(index, body + 0x34, frame + (kind === 5 ? 0x2c : 0x3c), frame + (kind === 5 ? 0x20 : 0x24), runtime);
    } else if (kind === 8) {
      updateVehicleDynamicLight(light, index, {...runtime, scratchBase: frame - 4}); seed = get(memory, 0x5ec958); count = pointer(memory, nativeGlobalAddress(memory,0x80f20c));
    }
  }
  for (let index = 1; index < count; index++) {
    const light = lightAddress(memory,index); if (memory.readInt16LE(light + 0x24) !== 1) continue;
    const body = pointer(memory, light + 0x30);
    if (body) {
      if (typeof handlers.call476550 === 'function') handlers.call476550({memory, ecx: body, args: [], scratchBase: frame - 4});
      else stepRawScriptedMotion(body, {...runtime, scratchBase: frame - 4});
      for (const offset of [0, 4, 8]) put(memory, body + 0x34 + offset, get(memory, body + 0x34 + offset) + get(memory, body + 0x68 + offset));
      moveLight(index, body + 0x34, frame + 0x3c, frame + 0x24, runtime); count = pointer(memory, nativeGlobalAddress(memory,0x80f20c));
    } else {
      const queued = 0x90b688 + (index - 1) * 8;
      if (memory.readInt16LE(queued + 6) === 1) {
        const x = memory.readInt16LE(queued) << 16, y = memory.readInt16LE(queued + 2) << 16, z = memory.readInt16LE(queued + 4) << 16;
        put(memory, frame + 0x14, y); put(memory, frame + 0x20, z);
        if (((get(memory, light) ^ x) | (get(memory, light + 4) ^ y) | (get(memory, light + 8) ^ z)) & 0xff000000) {
          removeDynamicLightRanges(index, runtime);
          const found = lookupRawSpatialBucket(x, y, z, runtime); put(memory, frame + 0x28, found.outside);
          expandRawTerrainRanges(found.bucket, frame + 0x2c, memory.readInt16LE(light + 16), runtime);
          insertDynamicLightRanges(index, frame + 0x2c, runtime);
        }
        put(memory, light + 4, get(memory, frame + 0x14)); put(memory, light + 8, get(memory, frame + 0x20)); put(memory, light, x); word(memory, light + 18, 2); word(memory, queued + 6, 0);
      }
    }
  }
}
