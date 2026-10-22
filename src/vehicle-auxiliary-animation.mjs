import tables from './vehicle-animation-tables.json' with {type: 'json'};
import {abs32, multiplyQ16, divideQ16, dotQ16, crossQ16, sqrtQ16, multiplyQuaternionQ16} from './fixed-integer.mjs';
import {populateRawVehicleTrackBasis} from './raw-track-basis.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {registerRawBodySpatial} from './raw-body-construction.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const vector = (m, p) => [0, 4, 8].map(o => get(m, p + o)), store = (m, p, v) => v.forEach((x, i) => put(m, p + i * 4, x));
const root = (m, value) => {put(m, 0x91d45c, abs32(value)); put(m, 0x91d460, Math.clz32(abs32(value))); return sqrtQ16(value);};
function length(m, values) {let squares = values.map(x => multiplyQ16(x, x)), reduced = !!(squares.reduce((a, b) => a | b, 0) & 0xe0000000); if (reduced) squares = squares.map(x => x >>> 2); return root(m, squares.reduce((a, b) => a + b | 0, 0)) << (reduced ? 1 : 0);}
const normalize = (m, p, denominator) => {const scale = divideQ16(65536, denominator); for (const o of [0, 4, 8]) put(m, p + o, multiplyQ16(get(m, p + o), scale));};
export function initializeVehicleAnimationTables(memory) {for (const table of tables) Buffer.from(table.bytesHex, 'hex').copy(memory, Number(table.address)); return memory;}

//416da0: edge-controlled phase, target offsets, button masks and HUD mirrors.
export function updateAuxiliaryAnimationControls(control, edges, held, {memory: m}) {
  const previous = m[control + 0x39] & 3;
  if (get(m, 0x91ff80) !== 14) {
    if (edges & 2) {const old = m[control + 0x39]; m[control + 0x39] = old ^ ((old + 1 ^ old) & 3);}
    if (edges & 1) {const old = m[control + 0x39]; if (old & 3) m[control + 0x39] = old ^ ((old - 1 ^ old) & 3);}
  }
  if ((m[control + 0x39] & 3) > 2) m[control + 0x39] = m[control + 0x39] & 0xfe | 2;
  const current = m[control + 0x39] & 3, first = m.readInt16LE(0x5704cc + current * 2), second = m.readInt16LE(0x570464 + current * 2);
  word(m, control + 0x3c, first); word(m, control + 0x3e, second);
  for (const [offset, target] of [[0x40, first], [0x42, second]]) {
    if (m.readInt16LE(control + offset) < target) word(m, control + offset, m.readUInt16LE(control + offset) + 4);
    if (m.readInt16LE(control + offset) > target) word(m, control + offset, m.readUInt16LE(control + offset) - 4);
  }
  const session = ptr(m, 0x5ecb1c); m[control + 0x3b] |= 63;
  if (!m[session + 0x58c]) for (const [mask, clear] of [[0x10000, 3], [0x20000, 12], [0x4000, 48]]) if (held & mask) m[control + 0x3b] &= ~clear;
  if (previous === 1 && !current) word(m, control + 0x48, 1); else if (!previous && current === 1) word(m, control + 0x48, 65535);
  for (let index = 0; index < 2; index++) if (ptr(m, 0x909318 + index * 0x30c) === (control >>> 0)) {m[session + 0xa92 + index] = m.readUInt16LE(control + 0x4a) ? 8 : 0; m[session + 0xa90 + index] = m[control + 0x39] & 3; break;}
}

//417590: deterministic half-velocity cross fallback for opposite directions.
export function mixAntipodalAnimationDirection(output, from, body, {memory: m, scratchBase}) {
  const local = scratchBase - 36 + 12; store(m, local, vector(m, body + 0x68).map(x => x >> 9));
  const size = length(m, vector(m, local)); if (size < 32) return;
  normalize(m, local, size << 1); store(m, local + 12, crossQ16(vector(m, local), vector(m, from)));
  const values = vector(m, from).map((x, i) => x + get(m, local + 12 + i * 4) | 0); store(m, output, values);
}

//417490. Integer weighted direction blend; opposite vectors use the actual
//body-dependent fallback or original RNG jitter, followed by normalization.
export function mixAnimationDirections(output, from, target, fromWeight, targetWeight, body, runtime) {
  const {memory: m, scratchBase} = runtime; let jitter = [0, 0, 0];
  if (dotQ16(vector(m, from), vector(m, target)) < -65000) {
    if (body) {mixAntipodalAnimationDirection(output, from, body, {...runtime, scratchBase: scratchBase - 32}); return;}
    const seed = Math.imul(get(m, 0x5ec954), 0x41a7) & 0x7fffffff; put(m, 0x5ec954, seed); const bits = Math.imul(seed >>> 15, 32767) >>> 16;
    jitter = [(bits & 31) << 6, (bits >>> 5 & 31) << 6, (bits >>> 5 & 0x3e0) << 1];
  }
  for (let lane = 0; lane < 3; lane++) put(m, output + lane * 4, Math.imul(get(m, from + lane * 4), fromWeight) + Math.imul(get(m, target + lane * 4), targetWeight) + jitter[lane]);
  const size = length(m, vector(m, output)); if (size > 256) normalize(m, output, size);
}

//416fa0. Track normal/angular speed drives a hysteretic direction blend.
export function sampleAuxiliaryAnimationDirection(output, body, control, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 60; let blend = 0;
  put(m, frame + 0x18, body); put(m, frame + 0x20, output); put(m, frame + 0x10, 0); put(m, frame + 0x14, 0);
  if (populateRawVehicleTrackBasis(body, frame + 0x30, frame + 0x24, runtime)) {
    let flags = m[control + 0x39], value = (abs32(dotQ16(vector(m, frame + 0x24), vector(m, body + 0xb8))) - (flags & 64 ? 5000 : 7000)) | 0;
    if (value < 0) {value = 0; flags &= ~64;} else {value <<= 4; if (value > 65536) value = 65536; if (value < 16384) flags &= ~64; else flags |= 64;}
    m[control + 0x39] = flags; blend = Math.trunc((value + Math.imul(get(m, control + 0x44), 7) | 0) / 8); put(m, control + 0x44, blend); put(m, frame + 0x10, blend); put(m, frame + 0x14, blend);
  }
  let facing = [0xc8, 0xce, 0xd4].map(o => -m.readInt16LE(body + o) << 4); if (facing.some(x => abs32(x) > 0x230000)) facing = facing.map(x => x >> 3);
  store(m, frame + 0x24, facing); normalize(m, frame + 0x24, length(m, facing));
  if (blend <= 0) {for (const o of [0, 4, 8]) put(m, output + o, get(m, frame + 0x24 + o)); return;}
  const tangent = frame + 0x30, size = length(m, vector(m, tangent)); if (size > 256) normalize(m, tangent, size);
  const first = vector(m, tangent).map(x => multiplyQ16(x, blend)), complement = (65536 - blend) | 0;
  const values = vector(m, frame + 0x24).map((x, i) => multiplyQ16(x, complement) + first[i] | 0); store(m, output, values);
  const total = length(m, vector(m, output)); if (total > 1024) normalize(m, output, total);
}

//4168d0. Four actual contact vectors must contribute before pose acquisition.
export function blendAuxiliaryAnimationContacts(control, body, direction, position, normal, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 52; let count = 0, sum = [0, 0, 0], points = [0, 0, 0];
  for (let index = 0; index < 4; index++) {const wheel = body + 0x324 + index * 200; if (!(m[wheel] & 1)) continue; count++; sum = sum.map((x, i) => x + get(m, wheel + 0x40 + i * 4) | 0); points = points.map((x, i) => x + Math.trunc(get(m, wheel + 0x1c + i * 4) / 4) | 0);}
  store(m, frame + 0x1c, sum); store(m, frame + 0x28, points); m[control + 0x39] ^= ((count << 3) ^ m[control + 0x39]) & 0x38;
  if (count !== 4) {if (m[control + 0x38] < 255) m[control + 0x38]++; return 0;}
  m[control + 0x38] = 0; const size = length(m, sum); if (size < 1024) return 0;
  normalize(m, frame + 0x1c, size); const forward = m.readInt16LE(control + 0x40), up = m.readInt16LE(control + 0x42), projection = -dotQ16(vector(m, frame + 0x1c), points) | 0;
  const unit = vector(m, frame + 0x1c), source = vector(m, direction), values = unit.map((x, i) => multiplyQ16(x, projection) + Math.imul(x, up) + Math.imul(source[i], forward) | 0);
  put(m, position + 8, values[2]); put(m, position, values[0]); put(m, position + 4, values[1]); put(m, normal + 8, unit[2]); put(m, normal, unit[0]); put(m, normal + 4, unit[1]); return 1;
}

//417390. Preserve magnitude while filtering its normalized direction.
export function filterAnimationPosition(position, target, runtime) {
  const {memory: m, scratchBase} = runtime, local = scratchBase - 36 + 12;
  store(m, local, vector(m, position).map(x => x >> 9)); const first = length(m, vector(m, local)) << 9;
  if (abs32(first) < 512) return; normalize(m, local, first >> 9);
  store(m, local + 12, vector(m, target).map(x => x >> 9)); const second = length(m, vector(m, local + 12)) << 9;
  if (abs32(second) < 512) return; normalize(m, local + 12, second >> 9);
  mixAnimationDirections(local, local, local + 12, 14, 2, 0, {...runtime, scratchBase: scratchBase - 56});
  const magnitude = Math.trunc(((Math.imul(first, 7) + second | 0) << 1) / 16);
  for (const o of [0, 4, 8]) put(m, position + o, multiplyQ16(get(m, local + o), magnitude));
}

//416f20. Weighted maximum error controls collision-disable hysteresis.
export function updateAnimationMotionGate(control, delta, {memory: m}) {
  let [largest, other, third] = vector(m, delta).map(abs32); if (largest < other) [largest, other] = [other, largest]; if (largest < third) [largest, third] = [third, largest];
  const score = Math.imul(largest, 4) + other + third | 0;
  if (!(m[control + 0x39] & 128)) {if (score > 0x3480000) {m[control + 0x3a] = 20; put(m, ptr(m, control), get(m, ptr(m, control)) | 512); m[control + 0x39] |= 128;}}
  else if (score < 0x16e0000) {if (m[control + 0x3a]) m[control + 0x3a]--; else {put(m, ptr(m, control), get(m, ptr(m, control)) & ~512); m[control + 0x39] &= ~128;}}
}

//416c50. Airborne direction/position recovery with the original rounding.
export function recoverAuxiliaryAnimation(control, body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24;
  store(m, frame + 12, vector(m, control + 0x20).map(x => x >> 4));
  if ((length(m, vector(m, frame + 12)) << 4) < 0xf00000) for (const o of [0, 4, 8]) put(m, control + 0x20 + o, Math.imul(Math.trunc(get(m, control + 0x20 + o) / 32), 33));
  mixAnimationDirections(control + 0x14, control + 0x14, 0x5eac34, 15, 1, body, {...runtime, scratchBase: frame - 20});
  const y = get(m, control + 0x24), difference = (y + (m.readInt16LE(control + 0x42) << 16)) | 0; put(m, control + 0x24, y - Math.trunc(difference / 32));
  store(m, frame + 12, [get(m, body + 0x68) >> 8, 0, get(m, body + 0x70) >> 8]); const size = length(m, vector(m, frame + 12));
  if (size > 128) {normalize(m, frame + 12, size); const scale = m.readInt16LE(control + 0x40); for (const o of [0, 8]) {const offset = control + 0x20 + o, value = (-Math.imul(scale, get(m, frame + 12 + o)) - get(m, offset)) | 0; put(m, offset, get(m, offset) + Math.trunc(value / 32));}}
}

//4165c0. Reposition, copy acquired pose and reinsert the actual spatial body.
export function snapAuxiliaryAnimationBody(control, body, runtime) {
  const {memory: m} = runtime, object = ptr(m, control); removeBodySpatial(object, runtime);
  for (const o of [0, 4, 8]) put(m, object + 0x34 + o, get(m, body + 0x34 + o) + get(m, control + 0x20 + o));
  for (const [source, output] of [[0x14, 8], [0x18, 12], [0x1c, 16], [0x20, 0x2c], [0x24, 0x30], [0x28, 0x34]]) put(m, control + output, get(m, control + source));
  registerRawBodySpatial(object, runtime); m[control + 0x39] &= ~4;
}

//416620. Cached position errors become forces after the live motion gate.
export function applyAuxiliaryAnimationForces(control, body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36, object = ptr(m, control);
  filterAnimationPosition(control + 0x2c, control + 0x20, {...runtime, scratchBase: frame - 12});
  const delta = [0, 4, 8].map(o => get(m, control + 0x2c + o) - get(m, object + 0x34 + o) + get(m, body + 0x34 + o) | 0);
  store(m, frame + 0x18, delta); put(m, frame + 0x14, delta[1]);
  updateAnimationMotionGate(control, frame + 0x18, runtime);
  const force = delta.map((x, i) => (x >> 2) - Math.trunc(get(m, object + 0x40 + i * 4) / 2) | 0); store(m, object + 0x74, force);
}

//492900. Quaternion rotation via the actual Hamilton-product order.
export function rotateAnimationVector(quaternion, target, {memory: m}) {
  const q = [0, 4, 8, 12].map(o => get(m, quaternion + o)), first = multiplyQuaternionQ16([0, ...vector(m, target)], [q[0], ...q.slice(1).map(x => -x | 0)]);
  store(m, target, multiplyQuaternionQ16(q, first).slice(1));
}

//4167f0. Normalize and cross twice, publishing only after both thresholds.
export function publishAnimationMatrix(direction, other, output, runtime) {
  const {memory: m, scratchBase} = runtime, local = scratchBase - 32 + 8;
  let size = length(m, vector(m, direction)); if (size < 256) return 0; normalize(m, direction, size);
  store(m, local, crossQ16(vector(m, direction), vector(m, other))); size = length(m, vector(m, local)); if (size < 1024) return 0; normalize(m, local, size);
  store(m, local + 12, crossQ16(vector(m, direction), vector(m, local)));
  for (const [source, start] of [[local, 0], [local + 12, 6], [direction, 12]]) for (let lane = 0; lane < 3; lane++) word(m, output + start + lane * 2, get(m, source + lane * 4) >> 4);
  return 1;
}

//4166d0. Tail-stage matrix publication and held-button quaternion policy.
export function updateAuxiliaryAnimationMatrix(control, body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 60, object = ptr(m, control);
  store(m, frame + 0x10, [0, 4, 8].map(o => (get(m, body + 0x34 + o) - get(m, object + 0x34 + o) | 0) >> 8));
  mixAnimationDirections(frame + 0x1c, control + 8, control + 0x14, 15, 1, body, {...runtime, scratchBase: frame - 20});
  const blended = vector(m, frame + 0x1c); store(m, control + 8, blended); const size = length(m, vector(m, frame + 0x10)); if (size < 256) return;
  normalize(m, frame + 0x10, size); const shift = m[ptr(m, 0x5ecb1c) + 0x552] ? 3 : 2;
  for (let lane = 0; lane < 3; lane++) put(m, frame + 0x10 + lane * 4, get(m, frame + 0x10 + lane * 4) + (blended[lane] >> shift));
  const flags = m[control + 0x3b]; let scalar, q = blended;
  if (!(flags & 48)) scalar = 0; else if (!(flags & 3)) scalar = 65536; else if (!(flags & 12)) {scalar = 65536; q = q.map(x => -x | 0);}
  if (scalar !== undefined) {put(m, frame + 0x28, scalar); store(m, frame + 0x2c, q); rotateAnimationVector(frame + 0x28, frame + 0x10, runtime);}
  publishAnimationMatrix(frame + 0x10, frame + 0x1c, ptr(m, control) + 0xc4, {...runtime, scratchBase: frame - 8});
}

//416510. Acquired vectors survive only through the native live state flags.
export function stepAuxiliaryAnimationPose(control, body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28;
  sampleAuxiliaryAnimationDirection(frame + 0x10, body, control, {...runtime, scratchBase: frame - 8});
  const acquired = blendAuxiliaryAnimationContacts(control, body, frame + 0x10, control + 0x20, control + 0x14, {...runtime, scratchBase: frame - 16});
  const flags = m[control + 0x3b]; if (!(flags & 0xc0)) {if (!acquired) return; for (const [source, output] of [[0x14, 8], [0x18, 12], [0x1c, 16], [0x20, 0x2c], [0x24, 0x30], [0x28, 0x34]]) put(m, control + output, get(m, control + source)); m[control + 0x3b] = flags & 63 | 64;}
  if (m[control + 0x38] > 5) recoverAuxiliaryAnimation(control, body, {...runtime, scratchBase: frame - 4});
  if (m[control + 0x39] & 4) snapAuxiliaryAnimationBody(control, body, {...runtime, scratchBase: frame - 4});
  applyAuxiliaryAnimationForces(control, body, {...runtime, scratchBase: frame - 4}); updateAuxiliaryAnimationMatrix(control, body, runtime);
}

//416400. Secondary source body is captured before controls may alter aliases.
export function updateVehicleAuxiliaryAnimation(record, runtime) {
  const {memory: m, scratchBase} = runtime, original = ptr(m, record + 0x18), object = ptr(m, original), source = ptr(m, record), secondary = ptr(m, original + 4), edges = get(m, source + 0x714), held = get(m, source + 0x710);
  for (const offset of [0x4c, 0x50, 0x54, 0x80, 0x84, 0x88, 0x90, 0x94, 0x98, 0x5c, 0x60, 0x64, 0xb8, 0xbc, 0xc0, 0x8c, 0x58]) put(m, object + offset, 0);
  updateAuxiliaryAnimationControls(ptr(m, record + 0x18), edges, held, {...runtime, scratchBase: scratchBase - 20});
  const control = ptr(m, record + 0x18), step = m.readUInt16LE(control + 0x48);
  if (step) {word(m, control + 0x4a, m.readUInt16LE(control + 0x4a) + step); const position = m.readInt16LE(control + 0x4a); if (position <= 0) put(m, control + 0x48, 0); else if (position >= 8) put(m, control + 0x48, 0x80000);}
  stepAuxiliaryAnimationPose(ptr(m, record + 0x18), secondary, runtime);
}
