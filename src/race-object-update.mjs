import {nativeGlobalAddress} from './native-global-address.mjs';
import {emitBodyEffectBurst, removeBodySpatial} from './body-retirement.mjs';
import {registerRawEffectSpatial} from './body-retirement-effects.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import tables from './race-object-tables.json' with {type: 'json'};

const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const nextSeed = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;

export function initializeRaceObjectTables(memory) {
  for (const table of tables) Buffer.from(table.bytesHex, 'hex').copy(memory, Number(table.address));
  return memory;
}

//42a0e0: capture three authored UV widths and initialize the global type20
//controller. The final packed color replaces only its low24 bits.
export function initializeRaceObjectType20(owner, {memory, scratchBase, entryRegisters, services}) {
  const frame = scratchBase - 36;
  put(memory, frame + 0x20, get(memory, 0x5e8890) ^ (scratchBase - 24));
  put(memory, 0x91e748, owner); word(memory, 0x91e74c, 3); put(memory, 0x91e744, 1); put(memory, 0x91e740, 0); put(memory, 0x91e750, 0xff252423);
  //Native42a11d/11e save EBX/ESI before the polygon pointer read;42a124
  //saves EDI afterward. Optional publication preserves ordinary numeric APIs.
  for (const [name, offset] of [['EBX',8],['ESI',4]]) if (entryRegisters?.[name] !== undefined) put(memory, frame + offset, entryRegisters[name]);
  const polygons = pointer(memory, owner + 0x14);
  if (entryRegisters?.EDI !== undefined) put(memory, frame, entryRegisters.EDI);
  put(memory, frame + 0x1c, 0);
  put(memory, frame + 0x18, memory[polygons + 0x1374] - memory[polygons + 0x1334]);
  put(memory, frame + 0x14, memory[polygons + 0x12f0] - memory[polygons + 0x12b0]);
  const initial = memory[polygons + 0x122c]; put(memory, frame + 0xc, initial); put(memory, frame + 0x10, memory[polygons + 0x126c] - initial);
  let index = 0, cumulative = 0, previous = initial;
  do {
    const destination = 0x91e754 + index * 8, width = get(memory, frame + 0x10 + index * 4);
    memory[destination] = previous; cumulative = (cumulative + width - 5) | 0;
    previous = (memory[frame + 0xc] + cumulative) & 255;
    memory[destination + 4] = previous; memory[destination + 2] = memory[destination]; memory[destination + 6] = previous;
    for (let vertex = 0; vertex < 4; vertex++) memory[destination + vertex * 2 + 1] = memory[polygons + 0x122d + vertex * 0x20];
    index++;
  } while (index < memory.readInt16LE(0x91e74c));
  const cookie = (pointer(memory, frame + 0x20) ^ (scratchBase - 24)) >>> 0;
  word(memory, 0x91e774, 0x8080); memory[0x91e776] = 0x80;
  if (entryRegisters !== undefined || services?.securityCookie) {
    put(memory, scratchBase - 28, 0x42a1ea);
    if (services?.securityCookie) services.securityCookie(cookie, {memory,scratchBase:scratchBase - 28});
    else if (cookie !== pointer(memory,0x5e8890)) throw Error('Native object type20 security cookie mismatch.');
  }
}

//429fa0: native type31. Keep the signed age lookup and matrix contraction.
export function updateRaceObjectType31(body, runtime) {
  const {memory, scratchBase} = runtime, frame = scratchBase - 44, state = get(memory, body + 0x184);
  if (state === 3) {removeBodySpatial(body, runtime); put(memory, body + 0x184, 0); return;}
  if (state !== 2) return;
  const age = memory.readInt16LE(body + 0x188);
  if (age >= 96) {put(memory, body + 0x184, 3); return;}
  const y = (get(memory, body + 0x38) + 0x280000) | 0, x = get(memory, body + 0x34), z = get(memory, body + 0x3c);
  put(memory, frame + 0x24, y); put(memory, frame + 0x14, 0); put(memory, frame + 0x18, -0x400000); put(memory, frame + 0x1c, 0);
  const seed = nextSeed(get(memory, 0x5ec954)); put(memory, 0x5ec954, seed);
  const random = Math.imul(seed >>> 15, 0x7fff) >>> 16;
  put(memory, frame + 0x20, x + (((random & 63) - 32) << 17)); put(memory, frame + 0x28, z + ((((random >>> 8) & 63) - 32) << 17));
  const mask = get(memory, 0x570660 + memory[0x570600 + age] * 4);
  if (mask) emitBodyEffectBurst(frame + 0x20, frame + 0x14, 9, mask, 11, {...runtime, scratchBase: frame - 16});
  for (let lane = 0; lane < 9; lane++) {
    const address = body + 0xc4 + lane * 2, value = memory.readInt16LE(address);
    put(memory, frame + 0x10, value); word(memory, address, Math.imul(value, 253) >> 8);
  }
  word(memory, body + 0x188, memory.readUInt16LE(body + 0x188) + 1);
}

function updateObjectUvs(restoring, memory) {
  let count = memory.readInt16LE(0x91e74c), object = pointer(memory, 0x91e748);
  for (let buffer = 0; buffer < 2; buffer++) {
    const polygons = pointer(memory, object + (buffer ? 0x18 : 0x14));
    let index = 0;
    if (count > 0) do {
      const polygon = polygons + memory.readInt8(0x91e750 + index) * 0x84;
      const colors = 0x91e754 + index * 8;
      for (let vertex = 0; vertex < 4; vertex++) memory[polygon + 0x20 + vertex * 0x20] = restoring ? memory[colors + vertex * 2] : (memory[0x91e754] + (vertex < 2 ? 0x40 : 0x4f)) & 255;
      for (let vertex = 0; vertex < 4; vertex++) memory[polygon + 0x21 + vertex * 0x20] = memory[(restoring ? colors : 0x91e754) + vertex * 2 + 1];
      index++; count = memory.readInt16LE(0x91e74c);
    } while (index < count);
    object = pointer(memory, 0x91e748);
  }
}

//42a1f0: native type20 uses global phase/UV state, not the body's fields.
export function updateRaceObjectType20(body, runtime) {
  const {memory, scratchBase, handlers = {}} = runtime;
  if (memory[pointer(memory, 0x5ecb1c) + 0x551] === 8) {put(memory, 0x91e744, 0); return;}
  switch (get(memory, 0x91e744)) {
    case 1: put(memory, 0x91e774, 0); return;
    case 2: updateObjectUvs(false, memory); put(memory, 0x91e774, 0); put(memory, 0x91e744, 3);
    //Native phase2 falls through into phase3's periodic sound.
    case 3: {
      if (pointer(memory, 0x90a548) % 25) return;
      const args = [0, 0x400, 10000, 6, 0, 0, 0];
      if (handlers.emit484bb0) handlers.emit484bb0({memory, code: 40, registerEdx: 0, args, scratchBase: scratchBase - 44});
      else emitNativeEffect(40, 0, args, {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
      return;
    }
    case 4: {
      const counter = get(memory, 0x91e740); put(memory, 0x91e774, Math.min(counter << 1, 110)); put(memory, 0x91e740, counter + 1); return;
    }
    case 5: {
      const counter = get(memory, 0x91e740), value = (200 - counter) | 0;
      if (value < 0) put(memory, 0x91e744, 6);
      put(memory, 0x91e774, Math.max(0, Math.min(value, 110)) << 8); put(memory, 0x91e740, counter + 1); return;
    }
    case 6:
      updateObjectUvs(true, memory); put(memory, 0x91e744, 7); put(memory, 0x91e774, 0); put(memory, 0x91e740, 1); return;
    case 7: {
      const counter = get(memory, 0x91e740); let color;
      if (counter < 128) color = counter | ((counter << 8 | counter) << 8);
      else {const seed = nextSeed(get(memory, 0x5ec958)); put(memory, 0x5ec958, seed); color = seed & 0x1ff0000 ? 0x808080 : 0x303030;}
      put(memory, 0x91e774, color); const next = (counter + 1) | 0; put(memory, 0x91e740, next > 1024 ? 512 : next); return;
    }
    default: return;
  }
}

//44ac80: native type32's four-state emission policy and128-byte debris pool.
export function updateRaceObjectType32(body, runtime) {
  const {memory, scratchBase} = runtime, state = get(memory, body + 0x180);
  let seed;
  if (state === 1) {
    word(memory, body + 0x184, memory.readUInt16LE(body + 0x184) + 1);
    if (!(memory[body + 0x184] & 63)) {
      word(memory, body + 0x186, memory.readUInt16LE(body + 0x186) + 1);
      if (memory.readInt16LE(body + 0x186) === 5) {seed = nextSeed(get(memory, 0x5ec958)); put(memory, body + 0x180, 2); put(memory, 0x5ec958, seed); word(memory, body + 0x184, ((seed >>> 16) & 16) + 8);}
    }
  } else if (state === 2) {
    word(memory, body + 0x184, memory.readUInt16LE(body + 0x184) - 1);
    if (!memory.readUInt16LE(body + 0x184)) put(memory, body + 0x180, 3);
  } else if (state === 3) {
    word(memory, body + 0x184, memory.readUInt16LE(body + 0x184) + 1);
    if (!(memory[body + 0x184] & 1)) {
      word(memory, body + 0x186, memory.readUInt16LE(body + 0x186) - 1);
      if (!memory.readUInt16LE(body + 0x186)) {put(memory, body + 0x180, 0); word(memory, body + 0x184, 0);}
    }
  } else {
    seed = nextSeed(get(memory, 0x5ec958)); put(memory, 0x5ec958, seed);
    if (!((seed >>> 16) & 31)) {put(memory, body + 0x180, 1); word(memory, body + 0x186, 1);}
    else word(memory, body + 0x186, ((seed >>> 16) & 0xc0) ? 0 : 1);
  }
  if (seed === undefined) seed = pointer(memory, 0x5ec958);
  const count = memory.readInt16LE(body + 0x186);
  if (count <= 0) return;
  let free = get(memory, nativeGlobalAddress(memory, 0x902b8c)); const frame = scratchBase - 32;
  for (let remaining = count; remaining > 0; remaining--) {
    const first = nextSeed(seed); seed = nextSeed(first);
    const positionBits = first >>> 16, velocityBits = seed >>> 16, z = (((positionBits >>> 6) & 31) + 0xef1) << 17;
    put(memory, frame + 0x10, ((positionBits & 31) + 0x221) << 17);
    put(memory, frame + 0x14, ((velocityBits & 15) - 7) << 15); put(memory, frame + 0x18, (-24 - ((velocityBits >>> 6) & 15)) << 15); put(memory, frame + 0x1c, (((velocityBits >>> 10) & 15) - 7) << 15);
    if (free < 0) continue;
    const id = memory.readUInt16LE(pointer(memory, nativeGlobalAddress(memory, 0x902b7c)) + free * 2); free--;
    const active = get(memory, nativeGlobalAddress(memory, 0x902b88)); word(memory, pointer(memory, nativeGlobalAddress(memory, 0x902b80)) + active * 2, id); put(memory, nativeGlobalAddress(memory, 0x902b88), active + 1);
    //MOVZX of the ID makes the native comparison with -1 unreachable.
    const particle = (pointer(memory, nativeGlobalAddress(memory, 0x902b84)) + (id << 7)) >>> 0, x = get(memory, frame + 0x10);
    put(memory, particle + 0x54, z); put(memory, particle + 0x4c, x); put(memory, particle + 0x50, -0x3000000);
    registerRawEffectSpatial(particle, x, -0x3000000, z, runtime);
    put(memory, particle + 0x30, 0x409f); word(memory, particle + 8, 43); put(memory, particle + 0x14, 0xae000020); word(memory, particle + 0x6a, 1);
    for (const [source, destination] of [[0x4e, 0x64], [0x52, 0x66], [0x56, 0x68]]) word(memory, particle + destination, memory.readUInt16LE(particle + source));
    for (const offset of [0, 4, 8]) put(memory, particle + 0x58 + offset, get(memory, frame + 0x14 + offset));
    memory[particle + 0x6c] = 1;
  }
  put(memory, nativeGlobalAddress(memory, 0x902b8c), free); put(memory, 0x5ec958, seed);
}

//429f30: capture list/count once, but reload every object's live pointer/type.
export function updateRaceObjects(runtime) {
  const {memory, scratchBase} = runtime;
  let cursor = pointer(memory, 0x91e77c), remaining = get(memory, 0x91e778);
  while (remaining > 0) {
    const body = pointer(memory, cursor), type = pointer(memory, body) & 511, child = {...runtime, scratchBase: scratchBase - 16};
    if (type === 20) {
      if (memory[pointer(memory, 0x5ecb1c) + 0x551] === 3) put(memory, 0x91e744, 0);
      else updateRaceObjectType20(body, child);
    } else if (type === 31) updateRaceObjectType31(body, child);
    else if (type === 32) updateRaceObjectType32(body, child);
    remaining--; cursor += 4;
  }
}
