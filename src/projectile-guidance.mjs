import {abs32, multiplyQ16} from './fixed-integer.mjs';
import {normalizeRawFloatVector, normalizeRawFixedVector} from './raw-vector-normalization.mjs';
import {orientWormholeBody} from './wormhole-visuals.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//46bad0. The native distance test uses422c70's reduction shift, not length.
export function updateProjectileHoming(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36, target = ptr(m, body + 0x198);
  if (target) {
    for (const offset of [0, 4, 8]) put(m, body + 0x19c + offset, get(m, target + 0x34 + offset));
    if ((get(m, target) & 0x1ff) === 3) put(m, body + 0x1a0, get(m, body + 0x1a0) - 0x200000);
  }
  for (const offset of [0, 4, 8]) put(m, frame + 0x18 + offset, get(m, body + 0x19c + offset) - get(m, body + 0x34 + offset));
  let half = normalizeRawFloatVector(frame + 0x18, frame + 0x18, runtime) >> 1;
  const force = [0, 4, 8].map(offset => {const value = get(m, frame + 0x18 + offset) << 5; return value + (value >> 2) | 0;});
  if (half < 5) {if (get(m, body + 0x188) === 2) {put(m, body + 0x180, 16); put(m, body + 0x188, 32);} half = 1;}
  else half = Math.min(half, 2);
  const damping = (half + 5) << 13;
  put(m, body + 0x40, multiplyQ16(get(m, body + 0x40), damping)); put(m, body + 0x44, multiplyQ16(get(m, body + 0x44), damping));
  const z = multiplyQ16(get(m, body + 0x48), damping) + force[2] | 0;
  put(m, body + 0x40, get(m, body + 0x40) + force[0]); put(m, body + 0x44, get(m, body + 0x44) + force[1]);
  const x = get(m, body + 0x40), y = get(m, body + 0x44); put(m, body + 0x48, z);
  put(m, body + 0x1a8, x); put(m, body + 0x1ac, y); put(m, body + 0x1b0, z);
}

//44c210. The packed Z word is captured after the first output store; the
//packed XY word is captured after all three initial difference stores.
export function computeProjectileRouteVector(point, position, output, mode, {memory: m}) {
  const y = m.readInt16LE(point + 2), z = m.readInt16LE(point + 4), x = m.readInt16LE(point) - m.readInt16LE(position + 2);
  const dy = y - m.readInt16LE(position + 6); put(m, output, x);
  const dz = z - m.readInt16LE(position + 10), packedZ = get(m, point + 12); put(m, output + 4, dy); put(m, output + 8, dz);
  const packedXY = get(m, point + 8), factor = mode === 1 ? 224 : 160, component = (value, shift) => value >>> shift << 29 >> 24;
  put(m, output, x + (Math.imul(component(packedXY, 20), factor) >> 8));
  put(m, output + 4, dy + (Math.imul(component(packedXY, 23), factor) >> 8));
  put(m, output + 8, dz + (Math.imul(component(packedZ, 28), factor) >> 8));
}

//44bff0→46b070. Real route directions and fixed normalizers set curvature
//damping; the tail call builds the matrix from the resulting momentum.
export function updateProjectileRouteMotion(body, direction, point, mode, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 44;
  normalizeRawFloatVector(direction, direction, runtime);
  let scale = 65536;
  if (point) {
    const base = (Math.max(200, Math.min(256, m[point + 7] + 20)) + 256) << 7;
    const previous = ptr(m, ptr(m, body + 0x6cc) + 8) + (m.readInt16LE(body + 0x6d0) << 4);
    const normal = (record, output) => {const xy = get(m, record + 8), z = get(m, record + 12); put(m, output, xy >>> 20 << 29 >> 16); put(m, output + 4, xy >>> 23 << 29 >> 16); put(m, output + 8, z >>> 28 << 29 >> 16);};
    normal(point, frame + 0x20); normal(previous, frame + 0x14);
    normalizeRawFixedVector(frame + 0x20, runtime); normalizeRawFixedVector(frame + 0x14, runtime);
    let alignment = 0; for (const offset of [8, 4, 0]) alignment = alignment + Math.imul(get(m, frame + 0x20 + offset) >> 8, get(m, frame + 0x14 + offset) >> 8) | 0;
    alignment = abs32(alignment); alignment = alignment < 0x3c18 ? 16384 : Math.min(65536, alignment);
    scale = multiplyQ16((alignment + 65536) >> 1, base);
  }
  let damping;
  if (!mode) damping = ((scale << 3) - scale | 0) >> 3;
  else {put(m, direction, get(m, direction) << 2); put(m, direction + 4, get(m, direction + 4) << 2); damping = scale >> 1; put(m, direction + 8, get(m, direction + 8) << 2);}
  for (const offset of [0, 4, 8]) put(m, body + 0x40 + offset, multiplyQ16(get(m, body + 0x40 + offset), damping));
  const z = get(m, body + 0x48), dy = get(m, direction + 4), dx = get(m, direction), dz = get(m, direction + 8);
  put(m, body + 0x44, get(m, body + 0x44) + Math.imul(dy, 24)); put(m, body + 0x40, get(m, body + 0x40) + Math.imul(dx, 24)); put(m, body + 0x48, z + Math.imul(dz, 24));
  for (const offset of [0, 4, 8]) put(m, body + 0x1a8 + offset, get(m, body + 0x40 + offset) >> 8);
  orientWormholeBody(body + 0x1a8, body + 0xc4, runtime);
}
