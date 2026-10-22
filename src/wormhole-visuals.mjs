import {abs32, multiplyQ16, divideQ16, sqrtQ16, vectorLengthQ16, crossQ16} from './fixed-integer.mjs';
import {normalizeCollisionVector} from './sphere-collision.mjs';
import {transformAttachmentPoint, ATTACHMENT_SCRATCH_BASE, ATTACHMENT_SCRATCH_LENGTH} from './body-attachments.mjs';
import {removeRawParticleSpatial, registerRawEffectSpatial, lookupRawSpatialBucket, initializeBodyRetirementEffectTables} from './body-retirement-effects.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const vector = (m, p) => [0, 4, 8].map(offset => get(m, p + offset)), store = (m, p, values) => values.forEach((value, index) => put(m, p + index * 4, value));
const rng = value => Math.imul(value, 0x41a7) & 0x7fffffff;
const scratch = m => m.subarray(ATTACHMENT_SCRATCH_BASE, ATTACHMENT_SCRATCH_BASE + ATTACHMENT_SCRATCH_LENGTH);
function length(m, values) {
  let squares = values.map(value => multiplyQ16(value, value)), reduced = !!(squares.reduce((a, b) => a | b, 0) & 0xe0000000);
  if (reduced) squares = squares.map(value => value >>> 2);
  const sum = squares.reduce((a, b) => a + b | 0, 0); put(m, 0x91d45c, abs32(sum)); put(m, 0x91d460, Math.clz32(abs32(sum)));
  return sqrtQ16(sum) << (reduced ? 1 : 0);
}

export function initializeWormholeVisualTables(memory) {
  initializeBodyRetirementEffectTables(memory); Buffer.from('a0a0ffff1000ffff8080ffff2000ffff', 'hex').copy(memory, 0x575710); Buffer.from('00008039', 'hex').copy(memory, 0x5dc5f4); return memory;
}

//407190. Each unsigned MUL keeps the prior shifted EAX high bytes while its
//low byte is replaced by the next channel. Alpha is stored AFTER the DWORD.
export function scaleWormholeColor(color, amount, destination, alpha, {memory: m}) {
  let value = Math.imul(color >>> 16 & 255, amount) >>> 8, red = value & 255;
  value = Math.imul((value & 0xffffff00) | (color >>> 8 & 255), amount) >>> 8; const green = value & 255;
  value = Math.imul((value & 0xffffff00) | (color & 255), amount) >>> 8;
  put(m, destination, (color & 0xff000000) | red << 16 | green << 8 | value & 255); m[alpha] = amount & 255;
}

//46b070. Floating Q12 normalization changes the input vector in place, then
//fixed normalization/cross builds the short basis only after both thresholds.
export function orientWormholeBody(direction, matrix, runtime) {
  const {memory: m, scratchBase, roundingMode} = runtime, frame = scratchBase - 52, input = vector(m, direction);
  const normalized = normalizeCollisionVector(input, roundingMode, {normalizeReduction: (bits, leading) => {put(m, 0x91d45c, bits); put(m, 0x91d460, leading);}}).vector;
  store(m, direction, normalized); for (const offset of [0, 4, 8]) put(m, direction + offset, get(m, direction + offset) << 4);
  const forward = vector(m, direction); store(m, frame + 0x28, forward); store(m, frame + 0x10, [forward[2], 0, -forward[0] | 0]);
  if (length(m, vector(m, frame + 0x10)) < 1024) return;
  let side = vector(m, frame + 0x10); if (side.some(value => abs32(value) > 0x230000)) {side = side.map(value => value >> 3); store(m, frame + 0x10, side);}
  const inverse = divideQ16(65536, length(m, side)); store(m, frame + 0x10, side.map(value => multiplyQ16(value, inverse)));
  store(m, frame + 0x1c, crossQ16(vector(m, frame + 0x28), vector(m, frame + 0x10)));
  if (length(m, vector(m, frame + 0x1c)) < 0xff78) return;
  for (let lane = 0; lane < 3; lane++) word(m, matrix + lane * 6, get(m, frame + 0x10 + lane * 4) >> 4);
  for (let lane = 0; lane < 3; lane++) word(m, matrix + 2 + lane * 6, get(m, frame + 0x1c + lane * 4) >> 4);
  for (let lane = 0; lane < 3; lane++) word(m, matrix + 4 + lane * 6, forward[lane] >> 4);
}

//49cc60/49cde0. The first direction is captured before output stores, while
//the second is read live between stores, preserving overlapping vectors.
export function positionWormholeRing(first, second, radius, index, output, colorOutput, runtime, inner = false) {
  const {memory: m} = runtime, counter = inner ? 0x6e65a7 : 0x6e65da;
  m[counter] = m[counter] + 1 & 255;
  const phase = (Math.trunc((index << 8) / (inner ? 32 : 5)) + m[counter]) & 255;
  const a = Math.imul(Math.imul(m.readInt16LE(0x5ed030 + phase * 2), radius), 4), b = Math.imul(Math.imul(m.readInt16LE(0x5ed0b0 + phase * 2), Math.trunc((radius << 2) / 5)), 4);
  const saved = vector(m, first).map(value => multiplyQ16(value, a));
  put(m, output, multiplyQ16(get(m, second), b)); put(m, output + 4, multiplyQ16(get(m, second + 4), b)); const last = multiplyQ16(get(m, second + 8), b);
  put(m, output, get(m, output) + saved[0]); put(m, output + 4, get(m, output + 4) + saved[1]); put(m, output + 8, last + saved[2]);
  const seed = rng(get(m, 0x5ed2c8)); put(m, 0x5ed2c8, seed);
  let amount = ((seed >>> 15 & (inner ? 31 : 63)) + Math.imul(Math.min(radius, 64), 4)) >>> 0; if (amount > 255) amount = 255;
  scaleWormholeColor(inner ? 0xff7070 : 0xff8040, amount, colorOutput, colorOutput + 3, runtime);
}

//49cf60: leave the third DWORD untouched while selecting two coordinates and
//an actual four-entry color from the separate visual RNG stream.
export function randomizeWormholeSpark(record, {memory: m}) {
  const first = rng(get(m, 0x5ed2c8)), second = rng(first); put(m, record, (first >>> 15 & 127) - 64); put(m, record + 4, (second >>> 15 & 127) - 64);
  const third = rng(second); put(m, 0x5ed2c8, third); put(m, record + 12, get(m, 0x575710 + (third >>> 15 & 3) * 4));
}

//49d310. Six12-point rings and the center use the actual432080 transform.
//Its EDX preservation means each ring's radius advances by the saved step.
export function buildWormholeMesh(body, runtime) {
  const {memory: m, roundingMode} = runtime; let radius = get(m, body + 0x33c) >> 1, target = body + 0x344;
  for (let offset = 0; offset < 20; offset += 4) put(m, 0x91d360 + offset, get(m, body + 0xc4 + offset));
  const scale = m.readFloatLE(0x5dc5f4);
  for (let lane = 0; lane < 9; lane++) m.writeFloatLE(Math.fround(m.readInt16LE(0x91d360 + lane * 2) * scale), 0x91cdc0 + Math.floor(lane / 3) * 16 + lane % 3 * 4);
  for (let lane = 0; lane < 3; lane++) {const value = m.readInt16LE(body + 0x36 + lane * 4); put(m, 0x91d374 + lane * 4, value); m.writeFloatLE(value, 0x91cdb0 + lane * 4);}
  const baseRadius = radius, step = Math.trunc(radius / 16); let diameter = radius << 2;
  for (let ring = 0; ring < 6; ring++) {
    const height = Math.trunc(Math.imul(Math.imul(ring, ring), baseRadius) / -5), sideRadius = Math.trunc(diameter / 5);
    for (let point = 0; point < 12; point++, target += 8) {
      const phase = Math.trunc(point * 256 / 12);
      word(m, target + 4, height); word(m, target + 2, (Math.imul(m.readInt16LE(0x5ed0b0 + phase * 2), sideRadius) << 2) >> 16); word(m, target, (Math.imul(m.readInt16LE(0x5ed030 + phase * 2), radius) << 2) >> 16);
      put(m, 0x91d3e4, get(m, target)); put(m, 0x91d3e8, get(m, target + 4)); transformAttachmentPoint(scratch(m), roundingMode);
      for (let lane = 0; lane < 3; lane++) word(m, target + lane * 2, m.readUInt16LE(0x91d448 + lane * 4));
    }
    radius = radius + step | 0; diameter = diameter + (step << 2) | 0;
  }
  put(m, body + 0x6a4, 0); word(m, body + 0x6a8, 0); put(m, 0x91d3e4, 0); put(m, 0x91d3e8, get(m, body + 0x6a8)); transformAttachmentPoint(scratch(m), roundingMode);
  const alpha = m.readInt16LE(body + 0x2a34);
  for (let lane = 0; lane < 3; lane++) word(m, body + 0x6a4 + lane * 2, m.readUInt16LE(0x91d448 + lane * 4));
  const inverse = 4096 - alpha | 0, color = (((Math.imul(4096, 0xff0) >> 16) << 8 | Math.imul(alpha, 0xa00) >> 16) << 8) | Math.imul(inverse, 0xa00) >> 16;
  for (let index = 0; index < 6; index++) {const output = body + 0x2a1c + index * 4; scaleWormholeColor(color, 255 - Math.trunc(index * 255 / 5), output, output + 3, runtime);}
  const value = Math.imul(inverse, 224) >> 12; put(m, body + 0x2a1c, (Math.imul(alpha, 224) >> 4 & 0xffffff00) | (value | 0xffffff00) << 16 | value);
  m[body + 0x341] = m[body + 0x341] + 8 & 255; m[body + 0x340] = m[body + 0x340] + 1 & 255; word(m, body + 0x342, m.readUInt16LE(0x5ed030 + m.readInt8(body + 0x341) * 2));
  if (get(m, body + 0x188) === 0x40 || get(m, body + 0x188) === 0x80) word(m, body + 0x2a34, alpha < 4096 ? alpha + 128 : 4096);
}

//4901d0. Fixed256-byte arena render record, not the particle free-list pool.
export function createWormholeRenderParticle(x, y, z, materialIndex, width, flags, {memory: m, scratchBase}) {
  const old = ptr(m, 0x70dcf4), result = ptr(m, 0x902eec) + (old >>> 2) * 4 >>> 0, material = ptr(m, 0x90b988) + (materialIndex << 4) >>> 0;
  put(m, 0x70dcf4, old + 256); m[result + 0x1f] = 0x98; m[result + 0x1b] = 12;
  put(m, result + 0x38, get(m, material)); put(m, result + 0x54, get(m, material + 4)); word(m, result + 0x70, m.readUInt16LE(material + 8)); word(m, result + 0x8c, m.readUInt16LE(material + 10)); word(m, result + 0x56, m.readUInt16LE(result + 0x56) | 0x800);
  m[result + 0x1f] = 0x9a; put(m, result + 4, 0); word(m, result + 8, 0); put(m, result + 12, 0); put(m, result, 2); m[result + 0x17] = flags & 255; m[result + 0x16] = width & 255;
  word(m, result + 0x14, z); word(m, result + 0x12, y); word(m, result + 0x10, x);
  registerRawEffectSpatial(result, (x << 16), (y << 16), (z << 16), {memory: m});
  if (Number.isInteger(scratchBase)) {
    //4901d0 saves EDI=advanced arena offset in474670 at entryESP-40.
    //Its4286e0 outside-output pointer argument survives at entryESP-44.
    //Both become49a820's stale light-payload words after49a6f0 returns.
    put(m, scratchBase - 40, old + 256); put(m, scratchBase - 44, scratchBase - 28);
  }
  return result;
}

//49d180. Publish the60 outer quads and12 center triangles from live material
//bytes; preserve all other primitive fields and the actual packed material ID.
export function initializeWormholeMeshMaterials(body, {memory: m}) {
  const material = ptr(m, 0x90b988) + (m.readUInt16LE(ptr(m, 0x90b990) + 0x2e) + 0x5c) * 16;
  for (let index = 0, p = body + 0x6ec; index < 60; index++, p += 132) {
    put(m, p - 32, get(m, material)); put(m, p, get(m, material + 4)); word(m, p + 32, m.readUInt16LE(material + 8)); const last = m.readUInt16LE(material + 10);
    put(m, p - 60, 0x80808080); word(m, p + 64, last); put(m, p - 28, 0x80808080); put(m, p + 4, 0x80808080); put(m, p + 36, 0x80808080); m[p - 61] = 12; m[p - 57] = 0x8e;
  }
  let materialId = m.readUInt16LE(0x5ed02c) << 2; materialId = (materialId & 0xffff00ff | ((materialId >>> 8 << 2) & 255) << 8) >>> 2;
  const x = [], y = [];
  for (let index = 0; index < 12; index++) {const phase = Math.trunc(index * 256 / 12); x.push(((Math.imul(m.readInt16LE(0x5ed030 + phase * 2), 63) >> 14) + 63) & 255); y.push(((Math.imul(m.readInt16LE(0x5ed0b0 + phase * 2), -63) >> 14) - 65) & 255);}
  for (let index = 0, p = body + 0x25bc; index < 12; index++, p += 96) {
    put(m, p - 28, -1); word(m, p + 56, 0xbf3f); m[p - 29] = 12; m[p - 25] = 0x96; word(m, p + 30, materialId);
    m[p] = x[index]; m[p + 1] = y[index]; m[p + 28] = x[(index + 1) % 12]; m[p + 29] = y[(index + 1) % 12];
  }
}

//49c790 uses a captured arena base across all47 removals, rather than the
//generic removal helper's fresh base read on each object.
function removeWithArena(object, arena, m) {
  const previous = m.readUInt16LE(object + 6), next = m.readUInt16LE(object + 4);
  if (!previous) {word(m, (ptr(m, object + 12) & 0xfffffffe) + 10, next); if (next) {const p = arena - 128 + next * 128 >>> 0; if (p) word(m, p + 6, 0);}}
  else {if (next) {const p = arena - 128 + next * 128 >>> 0; if (p) word(m, p + 6, previous);} word(m, arena - 124 + previous * 128 >>> 0, next);}
  put(m, object + 4, 0);
}
export function removeWormholeEffects(body, {memory: m}) {
  const arena = ptr(m, 0x902eec);
  for (const [offset, count] of [[0x1e0, 5], [0x1f4, 32]]) for (let index = 0; index < count; index++) removeWithArena(ptr(m, body + offset + index * 4), arena, m);
  for (let index = 0; index < 10; index++) {const life = body + 0x2a4 + index * 16; if (get(m, life) > 0) removeWithArena(ptr(m, body + 0x274 + index * 4), arena, m); put(m, life, 0);}
}

//49bf10. Create the actual5+10+32 detached render records and randomized
//spark descriptors from shared arena/material/spatial storage.
export function initializeWormholeEffectPool(body, runtime) {
  const {memory: m, scratchBase} = runtime; let texture = m.readUInt16LE(ptr(m, 0x90b990) + 0x2e);
  const allocate = (material, size) => {const object = createWormholeRenderParticle(0, 0, 0, material, size, 0x80, {...runtime, scratchBase: Number.isInteger(scratchBase) ? scratchBase - 52 : undefined}); put(m, object, 13); word(m, object + 0x90, 0); m[object + 0x92] = 0; return object;};
  for (let index = 0; index < 5; index++) {const object = allocate(texture + 0x3f, 0x30); removeRawParticleSpatial(object, runtime); put(m, body + 0x1e0 + index * 4, object);}
  const arena = ptr(m, 0x902eec); texture = m.readUInt16LE(ptr(m, 0x90b990) + 0x2e); let seed = get(m, 0x5ed2c8);
  for (let index = 0; index < 10; index++) {
    const object = allocate(texture + 100, 0x20); removeWithArena(object, arena, m); put(m, body + 0x274 + index * 4, object);
    seed = rng(seed); const first = seed; seed = rng(seed); const second = seed;
    put(m, body + 0x29c + index * 16, (first >>> 15 & 127) - 64); put(m, body + 0x2a0 + index * 16, (second >>> 15 & 127) - 64); seed = rng(seed); put(m, body + 0x2a8 + index * 16, get(m, 0x575710 + (seed >>> 15 & 3) * 4));
  }
  texture = m.readUInt16LE(ptr(m, 0x90b990) + 0x2e); put(m, 0x5ed2c8, seed);
  for (let index = 0; index < 32; index++) {const object = allocate(texture + 0x2e, 0x10); removeWithArena(object, arena, m); put(m, body + 0x1f4 + index * 4, object);}
  initializeWormholeMeshMaterials(body, runtime);
}

//49cfd0. Forward/right/up directions have pointer identity and remain live
//between scaled-vector stores. Spark lifetime wraps384 rather than clearing.
export function updateWormholeSpark(forward, right, up, body, index, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 60, descriptor = body + index * 16, object = ptr(m, body + 0x274 + index * 4);
  if (get(m, descriptor + 0x2a4) > 0) removeRawParticleSpatial(object, runtime);
  put(m, descriptor + 0x2a4, get(m, descriptor + 0x2a4) + 25);
  if (get(m, descriptor + 0x2a4) > 384) {put(m, descriptor + 0x2a4, get(m, descriptor + 0x2a4) - 384); randomizeWormholeSpark(descriptor + 0x29c, runtime);}
  if (get(m, descriptor + 0x2a4) <= 0) return;
  const scale = (amount, source, destination) => {for (const offset of [0, 4, 8]) put(m, destination + offset, multiplyQ16(get(m, source + offset), amount));};
  scale(get(m, descriptor + 0x29c) << 16, right, frame + 0x24); scale(get(m, descriptor + 0x2a0) << 16, up, frame + 0x30); scale(get(m, descriptor + 0x2a4) << 16, forward, frame + 0x18);
  const delta = [0, 4, 8].map(offset => get(m, frame + 0x18 + offset) + get(m, frame + 0x24 + offset) + get(m, frame + 0x30 + offset) | 0), life = get(m, descriptor + 0x2a4);
  if (life < 128) scaleWormholeColor(get(m, descriptor + 0x2a8), life * 2, object + 0x90, object + 0x93, runtime);
  else if (life > 320) scaleWormholeColor(get(m, descriptor + 0x2a8), 255 - (life * 4 - 1280) | 0, object + 0x90, object + 0x93, runtime);
  else put(m, object + 0x90, get(m, descriptor + 0x2a8));
  for (let axis = 0; axis < 3; axis++) word(m, object + 0x10 + axis * 2, (get(m, body + 0x34 + axis * 4) + delta[axis] | 0) >> 16);
  if (get(m, descriptor + 0x2a4) > 0) registerRawEffectSpatial(object, ...[0, 2, 4].map(offset => m.readInt16LE(object + 0x10 + offset) << 16), runtime);
}

//49c930. Ring removal/insertion is native's custom head-aware variant; its
//cached arena is refreshed after each actual spatial lookup.
export function updateWormholeEffects(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 64;
  for (let lane = 0; lane < 3; lane++) {put(m, frame + 0x28 + lane * 4, m.readInt16LE(body + 0xc4 + lane * 6) << 4); put(m, frame + 0x1c + lane * 4, m.readInt16LE(body + 0xc6 + lane * 6) << 4);}
  let arena;
  const insert = (object, outsideSlot) => {
    const position = [0, 2, 4].map(offset => m.readInt16LE(object + 0x10 + offset) << 16), found = lookupRawSpatialBucket(...position, runtime); put(m, outsideSlot, found.outside);
    arena = ptr(m, 0x902eec); const tagged = found.bucket + found.outside, selected = tagged & 0xfffffffe, id = ((object - arena + 128) >>> 7) & 65535;
    put(m, object + 12, tagged); const head = m.readUInt16LE(selected + 10); put(m, object + 4, head); if (head) word(m, arena - 122 + head * 128 >>> 0, id); word(m, selected + 10, id);
  };
  for (const [offset, count, inner, outsideOffset] of [[0x1e0, 5, false, 0x14], [0x1f4, 32, true, 0x18]]) for (let index = 0; index < count; index++) {
    const object = ptr(m, body + offset + index * 4);
    if (inner) removeWithArena(object, arena, m); else removeRawParticleSpatial(object, runtime);
    positionWormholeRing(frame + 0x28, frame + 0x1c, Math.trunc(get(m, body + 0x33c) / 2), index, frame + 0x34, object + 0x90, runtime, inner);
    for (let lane = 0; lane < 3; lane++) word(m, object + 0x10 + lane * 2, (get(m, body + 0x34 + lane * 4) + get(m, frame + 0x34 + lane * 4) | 0) >> 16);
    insert(object, frame + outsideOffset);
  }
  for (let lane = 0; lane < 3; lane++) put(m, frame + 0x34 + lane * 4, -m.readInt16LE(body + 0xc8 + lane * 6) << 4);
  for (let index = 0; index < 10; index++) updateWormholeSpark(frame + 0x34, frame + 0x28, frame + 0x1c, body, index, {...runtime, scratchBase: frame - 28});
  const mode = get(m, body + 0x188), amount = get(m, body + 0x33c), limit = mode === 0x40 || mode === 0x80 ? 176 : 128;
  if (amount < limit) put(m, body + 0x33c, amount + (limit === 176 ? 8 : 3));
  buildWormholeMesh(body, runtime);
}

//49c190. Reactivate the37 ring records at their current short positions, then
//reset ten staggered spark rows and tail into the actual visual update.
export function activateWormholeEffects(body, runtime) {
  const {memory: m} = runtime, arena = ptr(m, 0x902eec);
  for (const [offset, count] of [[0x1e0, 5], [0x1f4, 32]]) for (let index = 0; index < count; index++) {
    const object = ptr(m, body + offset + index * 4), position = [0, 2, 4].map(lane => m.readInt16LE(object + 0x10 + lane) << 16), found = lookupRawSpatialBucket(...position, runtime), tagged = found.bucket + found.outside, bucket = tagged & 0xfffffffe, id = ((object - arena + 128) >>> 7) & 65535;
    put(m, object + 12, tagged); const head = m.readUInt16LE(bucket + 10); put(m, object + 4, head); if (head) word(m, arena - 122 + head * 128 >>> 0, id); word(m, bucket + 10, id);
  }
  let seed = get(m, 0x5ed2c8);
  for (let index = 0; index < 10; index++) {
    const descriptor = body + index * 16; seed = rng(seed); const first = seed; seed = rng(seed); const second = seed;
    put(m, descriptor + 0x2a4, -1536 + index * 38); put(m, descriptor + 0x29c, (first >>> 15 & 127) - 64); put(m, descriptor + 0x2a0, (second >>> 15 & 127) - 64); seed = rng(seed);
    if (index === 9) put(m, 0x5ed2c8, seed);
    put(m, descriptor + 0x2a8, get(m, 0x575710 + (seed >>> 15 & 3) * 4));
  }
  put(m, body + 0x33c, 0); word(m, body + 0x340, 0); word(m, body + 0x342, m.readUInt16LE(0x5ed030)); word(m, body + 0x2a34, 0);
  updateWormholeEffects(body, runtime);
}
