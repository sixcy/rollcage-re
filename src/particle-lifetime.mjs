import {nativeGlobalAddress} from './native-global-address.mjs';
import {removeRawParticleSpatial, calculateRawEffectColor} from './body-retirement-effects.mjs';
const ptr = (m, p) => m.readUInt32LE(p), get = (m, p) => m.readInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p), short = v => (v << 16) >> 16;
const rng = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;
const translate = (p, memory) => {for (let axis = 0; axis < 3; axis++) put(memory, p + 0x88 + axis * 4, get(memory, p + 0x88 + axis * 4) + (memory.readInt16LE(p + 0x9c + axis * 2) << 8));};

//435ec0. Unlink active membership, prepend free list, clear activebyte, then
//remove packed spatial membership even when the incoming activebyte waszero.
export function freeRawEffectParticle(p, {memory}) {
  const previous = ptr(memory, p + 0xac), next = ptr(memory, p + 0xa8);
  if (previous) put(memory, previous + 0xa8, next); else put(memory, 0x6e65c0, next);
  if (next) put(memory, next + 0xac, previous); else put(memory, 0x6e65c8, previous);
  put(memory, p + 0xac, ptr(memory, 0x6e65b4)); put(memory, p + 0xa8, 0); put(memory, 0x6e65b4, p); memory[p + 0x94] = 0;
  removeRawParticleSpatial(p, {memory});
}

//4381c0: translate, truncating7/8 damping and a wrapped gravity decrement.
export function advanceRawType8Particle(p, life, {memory}) {
  translate(p, memory);
  for (const offset of [0x9c, 0x9e, 0xa0]) {const velocity = memory.readInt16LE(p + offset), value = offset === 0x9e ? short(velocity - 128) : velocity; word(memory, p + offset, Math.trunc(value * 7 / 8));}
  memory[p + 0x95] = (memory[p + 0x95] + 4) & 255; memory[p + 0x9b] = Math.min(255, Math.imul(life, 6) >>> 0);
}

//438280. mode changes alpha decrement8/16 and its unsigned lifetime cutoff.
export function advanceRawType27Particle(p, life, mode, {memory}) {
  const velocity = [0, 2, 4].map(offset => memory.readInt16LE(p + 0x9c + offset));
  translate(p, memory); velocity.forEach((v, axis) => word(memory, p + 0x9c + axis * 2, v - (v >> 3)));
  if ((life >>> 0) < (mode ? 8 : 16)) memory[p + 0x9b] = Math.max(0, memory[p + 0x9b] - (mode ? 16 : 8));
}

//438330. Size's second increment tests the particle ADDRESS bit400.
export function advanceRawType34Particle(p, life, {memory}) {
  translate(p, memory); const size = memory[p + 0x95];
  if (size < 253) memory[p + 0x95] = size + (p & 0x400 ? 2 : 1);
  for (const [offset, delta] of [[0x9c, 13], [0x9e, -35], [0xa0, 13]]) word(memory, p + offset, memory.readInt16LE(p + offset) + delta);
  if ((life >>> 0) < 64) memory[p + 0x9b] = Math.max(0, memory[p + 0x9b] - 4);
}

//4383d0. Two RNG steps rotateXZ using the retained yaw table and alterY.
export function advanceRawType23Particle(p, {memory}) {
  const first = rng(get(memory, 0x5ec958)), angle = first >>> 28;
  const a = memory.readInt16LE(0x5ed0b2 + angle * 2), b = memory.readInt16LE(0x5ed032 + angle * 2), x = memory.readInt16LE(p + 0x9c), z = memory.readInt16LE(p + 0xa0);
  const nextX = short((Math.imul(z, b) >>> 14) + (Math.imul(x, a) >>> 14)), nextZ = short((Math.imul(z, a) >>> 14) - (Math.imul(x, b) >>> 14));
  word(memory, p + 0x9c, nextX); put(memory, p + 0x88, get(memory, p + 0x88) + (nextX << 8)); put(memory, p + 0x8c, get(memory, p + 0x8c) + (memory.readInt16LE(p + 0x9e) << 8)); put(memory, p + 0x90, get(memory, p + 0x90) + (nextZ << 8));
  const second = rng(first); word(memory, p + 0xa0, nextZ); put(memory, 0x5ec958, second); word(memory, p + 0x9e, memory.readUInt16LE(p + 0x9e) - (second >>> 25) + 24);
  if (memory.readInt16LE(p + 0x96) < 60) memory[p + 0x9b] = (memory[p + 0x9b] - 4) & 255;
}

//4384b0. RGB fade clears alpha when the signed lifetime is below60.
export function advanceRawType30Particle(p, {memory}) {
  translate(p, memory); word(memory, p + 0x9e, memory.readInt16LE(p + 0x9e) + 180);
  if (memory.readInt16LE(p + 0x96) < 60) {const color = ptr(memory, p + 0x98), faded = [0, 8, 16].map(shift => Math.max(0, (color >>> shift & 255) - 4)); put(memory, p + 0x98, faded[0] | faded[1] << 8 | faded[2] << 16);}
}

//438790. Default effect-kind motion has distinct stationary/type1/4000 paths.
export function advanceRawEffectKind(p, kind, {memory}) {
  if (kind === 16) return;
  if (kind === 1) {word(memory, p + 0x9e, memory.readInt16LE(p + 0x9e) - 56); return;}
  if (kind === 0x4000) {
    const life = memory.readInt16LE(p + 0x96);
    for (let axis = 0; axis < 3; axis++) put(memory, p + 0x88 + axis * 4, get(memory, p + 0x88 + axis * 4) + Math.imul(memory.readInt16LE(p + 0x9c + axis * 2) << 2, life));
    put(memory, p + 0x8c, get(memory, p + 0x8c) + (Math.max(0, 30 - life) << 14)); return;
  }
  translate(p, memory);
  for (const offset of [0x9c, 0x9e, 0xa0]) word(memory, p + offset, Math.trunc(memory.readInt16LE(p + offset) * 3 / 4));
  if (kind === 4 || kind === 8) word(memory, p + 0x9e, memory.readInt16LE(p + 0x9e) - (kind === 4 ? 96 : 128));
}

//438550 scans the allocation range, not the active linked list. Lifetime1
//expires only AFTER its final motion/color update; lifetime0 wraps toffff.
export function advanceRawEffectParticles({memory, maxParticles = 65536}) {
  const end = ptr(memory, 0x91900c); let budget = maxParticles;
  for (let p = ptr(memory, 0x9153c4); p < end; p += 256) {
    if (--budget < 0) throw Error('Particle advancement budget exceeded.');
    if (!memory[p + 0x94]) continue;
    const type = get(memory, p), kind = memory.readUInt16LE(p + 0xa2), life = memory.readInt16LE(p + 0x96);
    if (type === 8) advanceRawType8Particle(p, life, {memory});
    else if (type === 23) advanceRawType23Particle(p, {memory});
    else if (type === 27 || type === 28) {advanceRawType27Particle(p, life, type === 28 ? 1 : 0, {memory}); if (type === 27) word(memory, p + 0x9e, memory.readInt16LE(p + 0x9e) - 128);}
    else if (type === 30) advanceRawType30Particle(p, {memory});
    else if (type === 34) advanceRawType34Particle(p, life, {memory});
    else {
      advanceRawEffectKind(p, kind, {memory}); put(memory, p + 0x98, calculateRawEffectColor(kind, life, {memory}));
      if (((kind === 1 && (life >>> 0) > 32) || (kind === 4 && (life >>> 0) > 16)) && memory[p + 0x95] < 128) memory[p + 0x95] += kind === 1 ? 32 : 4;
    }
    if (life === 1) freeRawEffectParticle(p, {memory}); else word(memory, p + 0x96, life - 1);
  }
}

//432a70: signed64 weighted color products shift separately before addition.
//The Q12 output and clamped signed16 input writes are independent ofRGB clamp.
export function blendRawEffectColor({memory}) {
  const fraction = memory.readInt16LE(0x91d404), sourceWeight = 4096 - fraction;
  for (let channel = 0; channel < 3; channel++) {
    const input = memory.readInt16LE(0x91d408 + channel * 4) << 8, target = get(memory, 0x91d3b4 + channel * 4) << 8;
    const total = (BigInt(input) * BigInt(sourceWeight) >> 12n) + (BigInt(target) * BigInt(fraction) >> 12n), output = total >> 12n;
    put(memory, 0x91d448 + channel * 4, Number(BigInt.asIntN(32, output))); word(memory, 0x91d408 + channel * 4, Number(output < -32768n ? -32768n : output > 32767n ? 32767n : output));
    const color = Number(total < 0n ? 0n : total > 0xff000n ? 255n : total >> 12n);
    for (const base of [0x91d434, 0x91d438, 0x91d43c]) memory[base + channel] = color;
  }
  for (const base of [0x91d434, 0x91d438, 0x91d43c]) memory[base + 3] = memory[0x91d3ff];
}

//475e50. Incoming life3 detaches spatially;0 returns ID to free list and
//reprocesses the swapped final active ID. Neither1 nor2 moves or frees.
export function advanceRawBodyDebris({memory, maxIterations = 65536}) {
  word(memory, 0x91d404, 500); put(memory, 0x91d3fc, get(memory, 0x5ec9b0));
  for (const offset of [0x91d3b4, 0x91d3b8, 0x91d3bc]) put(memory, offset, 0);
  let remaining = ptr(memory, nativeGlobalAddress(memory, 0x902b88)), count = remaining, active = ptr(memory, nativeGlobalAddress(memory, 0x902b80)), last = active + (remaining - 1) * 2, index = 0, budget = maxIterations;
  while ((index >>> 0) < (remaining >>> 0)) {
    if (--budget < 0) throw Error('Debris advancement budget exceeded.');
    const p = ptr(memory, nativeGlobalAddress(memory, 0x902b84)) + memory.readUInt16LE(active) * 128, life = memory.readUInt16LE(p + 8); word(memory, p + 8, life - 1);
    if (life === 3) {removeRawParticleSpatial(p, {memory}); count = ptr(memory, nativeGlobalAddress(memory, 0x902b88));}
    else if (life === 0) {
      const id = memory.readUInt16LE(active), freeLast = (get(memory, nativeGlobalAddress(memory, 0x902b8c)) + 1) | 0;
      count = (count - 1) | 0; put(memory, nativeGlobalAddress(memory, 0x902b8c), freeLast); put(memory, nativeGlobalAddress(memory, 0x902b88), count); word(memory, ptr(memory, nativeGlobalAddress(memory, 0x902b7c)) + freeLast * 2, id);
      word(memory, ptr(memory, nativeGlobalAddress(memory, 0x902b80)) + index * 2, memory.readUInt16LE(last)); last -= 2; remaining--; index--; active -= 2;
    } else if (life > 3) {
      const position = [0, 4, 8].map(offset => get(memory, p + 0x4c + offset)), velocity = [0, 4, 8].map(offset => get(memory, p + 0x58 + offset));
      for (let axis = 0; axis < 3; axis++) put(memory, p + 0x4c + axis * 4, position[axis] + velocity[axis]);
      for (let axis = 0; axis < 3; axis++) word(memory, p + 0x64 + axis * 2, (velocity[axis] >> 14) + (position[axis] >>> 16) + (axis === 1 ? 1 : 0));
      put(memory, p + 0x5c, velocity[1] + 0x8000);
      if (memory[p + 0x6c] && life <= 11) for (const offset of [0x14, 0x30]) {
        const color = ptr(memory, p + offset); for (let channel = 0; channel < 3; channel++) word(memory, 0x91d408 + channel * 4, (color >>> (channel * 8) & 255) << 4);
        blendRawEffectColor({memory}); put(memory, p + offset, get(memory, 0x91d43c));
      }
      count = ptr(memory, nativeGlobalAddress(memory, 0x902b88));
    }
    index++; active += 2;
  }
}
