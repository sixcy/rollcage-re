import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {publishAnimationMatrix} from './vehicle-auxiliary-animation.mjs';
import {copyToNativeMemory} from './native-memory-spans.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const short = (m, p) => m.readInt16LE(p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const block = (m, destination, source, size) => copyToNativeMemory(m,destination,Buffer.from(m.subarray(source,source+size)));
export function advanceWeatherRandom(memory) {const value = Math.imul(get(memory, 0x5ed2bc), 0x41a7) & 0x7fffffff; put(memory, 0x5ed2bc, value); return value;}

//496ff0. Bounds are signed shorts; reads stay live across aliased outputs.
export function computeWeatherVolumeBounds(row, minimum, maximum, {memory: m}) {
  let body = ptr(m, row + 0x10);
  for (let axis = 0; axis < 3; axis++) word(m, minimum + axis * 2, short(m, body + 0x36 + axis * 4) - (axis === 1 ? 0x300 : 0x400));
  for (let axis = 0; axis < 3; axis++) word(m, maximum + axis * 2, short(m, body + 0x36 + axis * 4) + (axis === 1 ? 0x300 : 0x400));
  body = ptr(m, row + 0x10);
  const z = short(m, body + 0xd4) << 10 >> 12, y = (short(m, body + 0xd2) * 0x300 >> 12) - 0x240, x = short(m, body + 0xd0) << 10 >> 12;
  for (const [axis, offset] of [[0, x], [1, y], [2, z]]) word(m, maximum + axis * 2, short(m, maximum + axis * 2) + offset);
  for (const [axis, offset] of [[0, x], [1, y], [2, z]]) word(m, minimum + axis * 2, short(m, minimum + axis * 2) + offset);
}

//496e80. Fixed2048-record ring, packed-short arithmetic and shared RNG order.
export function seedWeatherVolumeParticles(row, minimum, maximum, {memory: m}) {
  const x = short(m, minimum), y = short(m, minimum + 2), z = short(m, minimum + 4);
  const width = short(m, maximum) - x | 0, height = short(m, maximum + 2) - y | 0, depth = short(m, maximum + 4) - z | 0;
  if ((width & 0xfffff000) || (height & 0xfffff000) || (depth & 0xfffff000)) return;
  const volume = Math.imul(Math.imul(depth >> 2, height >> 2), width >> 2);
  let count = (volume + (volume >> 31 & 0x1ffff) | 0) >> 17;
  const random = advanceWeatherRandom(m) >>> 15;
  if (random < ((volume - Math.imul(count, 0x20000) | 0) >> (m[row + 0x402c] & 31))) count++;
  let particle = ptr(m, row + 0x4014);
  for (; count > 0; count--) {
    const first = advanceWeatherRandom(m), second = advanceWeatherRandom(m), third = advanceWeatherRandom(m);
    word(m, particle, (Math.imul(first >>> 15, width) >>> 16) + x);
    word(m, particle + 2, (Math.imul(second >>> 15, height) >>> 16) + y);
    word(m, particle + 4, (Math.imul(third >>> 15, depth) >>> 16) + z); word(m, particle + 6, 1);
    particle += 8; if ((particle >>> 0) >= (row + 0x4014 >>> 0)) particle = row + 0x14;
  }
  put(m, row + 0x4014, particle);
}

//41bf40. Produce the lowered participant pose used by the extra weather view.
export function buildWeatherParticipantPose(record, output, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 40;
  const source = ptr(m, record) + 0x34;
  for (let index = 0; index < 0x36; index++) put(m, output + index * 4, get(m, source + index * 4));
  put(m, output + 4, get(m, output + 4) - 0x70000);
  const body = ptr(m, record);
  for (let axis = 0; axis < 3; axis++) put(m, frame + 0x1c + axis * 4, -short(m, body + 0xc8 + axis * 6));
  const sign = m[body + 0x64f] === 1 ? 1 : -1;
  for (let axis = 0; axis < 3; axis++) put(m, frame + 0x10 + axis * 4, sign * short(m, body + 0xc6 + axis * 6));
  publishAnimationMatrix(frame + 0x1c, frame + 0x10, output + 0x90, {...runtime, scratchBase: frame - 8});
  put(m, output + 0xac, 0); put(m, output + 0xa8, 0); put(m, output + 0xa4, 0);
  const current = ptr(m, record); block(m, output + 0x34, current + 0x68, 8); put(m, output + 0x3c, get(m, current + 0x70));
}

export function restoreWeatherBodyPose(body, {memory: m}) {
  block(m, body + 0x34, 0x7136c4, 8); const z = get(m, 0x7136cc);
  block(m, body + 0x68, 0x713770, 8); const rotation = Buffer.from(m.subarray(0x713750, 0x713760));
  put(m, body + 0x3c, z); const vz = get(m, 0x713778); copyToNativeMemory(m,body+0xc4,rotation); put(m, body + 0x70, vz);
  const tail = Buffer.from(m.subarray(0x713760, 0x713770)), closest = get(m, 0x7135b8); put(m, body + 0x11c, closest); copyToNativeMemory(m,body+0xd4,tail);
}

//496830. The backup is shared across all rows and restored by the outer caller.
export function swapWeatherBodyPose(row, index, restore, runtime) {
  const {memory: m, scratchBase} = runtime, count = get(m, 0x80ddf8), body = ptr(m, row + 0x10);
  if (!(m[0x91ce90] & 2) && index < (count - 2 | 0)) return;
  if (restore) {restoreWeatherBodyPose(body, runtime); return;}
  block(m, 0x7136c4, body + 0x34, 8); put(m, 0x7136cc, get(m, body + 0x3c));
  const velocityZ = get(m, body + 0x70); put(m, 0x713778, velocityZ); const closest = get(m, body + 0x11c);
  block(m, 0x713770, body + 0x68, 8); const rotation = Buffer.from(m.subarray(body + 0xc4, body + 0xd4)); put(m, 0x7135b8, closest); copyToNativeMemory(m,0x713750,rotation); block(m, 0x713760, body + 0xd4, 16);
  let pose = index === (count - 1 | 0) ? 0x91ffc0 : 0x91ffc0 + Math.imul(index, 0x184);
  if (index === (count - 2 | 0)) {buildWeatherParticipantPose(0x909300 + Math.imul(get(m, 0x5ec120), 0x30c), 0x80de00, {...runtime, scratchBase: scratchBase - 20}); pose = 0x80de00;}
  block(m, body + 0x34, pose, 8); put(m, body + 0x3c, get(m, pose + 8)); block(m, body + 0x68, pose + 0x34, 8); put(m, body + 0x70, get(m, pose + 0x3c));
  block(m, body + 0xc4, pose + 0x90, 16); block(m, body + 0xd4, pose + 0xa0, 16);
  const {bucket, outside} = lookupRawSpatialBucket(get(m, pose), get(m, pose + 4), get(m, pose + 8), runtime);
  m[scratchBase - 4] = outside ? 1 : 0;
  const sector = m[ptr(m, 0x9092c0) + (m.readUInt16LE(bucket + 6) & 0x3fff) * 6 + 2] & 127; m[body + 0x11c] = sector;
}

function updateRainVolumeSound(row, sheltered, runtime) {
  const {memory: m} = runtime;
  if (ptr(m, 0x90a548) <= 1) return;
  const channel = ptr(m, row + 0x4024); if (channel === 127) return;
  put(m, row + 0x4028, get(m, row + 0x4028) + (sheltered ? -66 : 100));
  if (get(m, row + 0x4028) < 7000) put(m, row + 0x4028, 7000);
  if (get(m, row + 0x4028) > 13000) put(m, row + 0x4028, 13000);
  if (channel > 256 && ptr(m, channel)) {
    const source = ptr(m, channel), volume = Math.fround(Math.fround(Math.trunc(Math.imul(short(m, row + 0x4028), 32767) / 16383)) * m.readFloatLE(0x5dc5dc));
    if (typeof runtime.handlers?.sourceVolume !== 'function') throw Error('Weather volume requires audio source virtual volume service.');
    runtime.handlers.sourceVolume(source, volume, runtime);
  }
}

//4963e0. Bind a weather volume to the live participant's actual body.
export function initializeWeatherVolume(index, runtime) {
  const {memory: m} = runtime, row = ptr(m, 0x80dde0 + index * 4);
  let participant = index < (get(m, 0x80ddf8) - 2 | 0) ? index : 0;
  if (!participant && m[0x6eafe0] & 1) {participant = get(m, 0x6e9f70); if (participant === -1) participant = 0;}
  put(m, row + 0x10, get(m, ptr(m, 0x909318 + Math.imul(participant, 0x30c))));
  for (let index = 0; index < 2048; index++) word(m, row + 0x1a + index * 8, 0);
  put(m, row + 0x4014, row + 0x14); m[row + 0x4020] = 0;
  updateRainVolumeSound(row, false, runtime); computeWeatherVolumeBounds(row, row, row + 8, runtime); seedWeatherVolumeParticles(row, row, row + 8, runtime);
  put(m, row + 0x4018, m[ptr(m, 0x5ecb1c) + 0x553] & 1 ? 0x320000 : 0x80000); word(m, row + 0x401c, 0);
  put(m, 0x91d45c, 2); put(m, 0x91d460, 30); word(m, row + 0x402c, 1);
}

//4969d0. Preserve native local-word aliases while exposing the volume algorithm.
export function updateWeatherVolume(row, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 100, body = ptr(m, row + 0x10);
  const at = offset => short(m, frame + offset), set = (offset, value) => word(m, frame + offset, value), local = (offset, value) => put(m, frame + offset, value);
  const maxX = short(m, row + 8), maxY = short(m, row + 10), maxZ = short(m, row + 12), minX = short(m, row), minY = short(m, row + 2), minZ = short(m, row + 4);
  local(0x14, 0); local(0x18, row + 8); local(0x1c, row); local(0x28, maxY); local(0x40, maxZ); local(0x38, minX); local(0x30, minY); local(0x50, body); local(0x10, maxX); local(0x48, minZ);
  if (m[row + 0x4020]) {for (let p = row + 0x14; p < row + 0x4014; p += 8) word(m, p + 6, 0);}
  else {
    const delta = get(m, row + 0x4018), dz = short(m, row + 0x401c);
    for (let p = row + 0x14; p < row + 0x4014; p += 8) if (short(m, p + 6)) {
      const packed = get(m, p), x = short(m, p), y = packed >> 16, z = short(m, p + 4);
      if (y > maxY || y < minY || x > maxX || x < minX || z > maxZ || z < minZ) word(m, p + 6, 0);
      else {put(m, p, packed + delta); word(m, p + 4, z + dz);}
    }
  }
  let sheltered = false;
  if (get(m, body + 0x11c) >= 0) sheltered = !!(m[ptr(m, ptr(m, ptr(m, 0x90b98c)) + m[body + 0x11c] * 4) + 4] & 8);
  if (sheltered) {computeWeatherVolumeBounds(row, row, row + 8, runtime); local(0x14, 1);}
  m[row + 0x4020] = sheltered ? 1 : 0; updateRainVolumeSound(row, sheltered, runtime); if (sheltered) return;
  computeWeatherVolumeBounds(row, frame + 0x40, frame + 0x38, runtime);
  let si = at(0x38), bx = at(0x3c), bp = at(0x40), dx, cx;
  local(0x10, si); local(0x50, Math.abs(si - short(m, row + 8)) >= 1024 ? 1 : 0);
  if (Math.abs(at(0x3a) - short(m, row + 10)) < 1024 && !get(m, frame + 0x50)) {
    cx = at(0x44); dx = cx;
    for (const offset of [0x5a, 0x32, 0x4a]) set(offset, at(0x42));
    for (const offset of [0x22, 0x2a, 0x52]) set(offset, at(0x3a));
    for (const offset of [0x58, 0x30, 0x48]) set(offset, bp);
    set(0x5c, dx); set(0x34, cx); set(0x4c, cx);
    for (const offset of [0x20, 0x28, 0x50]) set(offset, si);
    for (const offset of [0x24, 0x2c, 0x54]) set(offset, bx);
    if (bx > short(m, row + 12)) {dx = short(m, row + 12); local(0x14, 1); set(0x5c, dx);} else {set(0x24, short(m, row + 4)); local(0x14, 0);}
    if (si > short(m, row + 8)) {set(0x30, short(m, row + 8)); local(0x1c, 1);} else {set(0x28, short(m, row)); local(0x1c, 0);}
    if (at(0x3a) > short(m, row + 10)) set(0x4a, short(m, row + 10)); else set(0x52, short(m, row + 2));
    if (get(m, frame + 0x14)) {cx = Math.min(bx, dx); set(0x2c, cx); if (bx > dx) set(0x54, dx);}
    else {cx = Math.max(cx, at(0x24)); set(0x34, cx); set(0x4c, Math.max(at(0x44), at(0x24)));}
    if (get(m, frame + 0x1c)) {if (si > at(0x30)) set(0x50, at(0x30));} else set(0x48, Math.max(bp, si));
    seedWeatherVolumeParticles(row, frame + 0x30, frame + 0x28, runtime);
    seedWeatherVolumeParticles(row, frame + 0x48, frame + 0x50, runtime);
    seedWeatherVolumeParticles(row, frame + 0x58, frame + 0x20, runtime);
    const ax = at(0x44); cx = at(0x42); si = at(0x38); set(0x4c, ax); set(0x4a, cx); set(0x48, bp); set(0x50, si); set(0x54, bx); set(0x52, cx + short(m, row + 0x401a));
    seedWeatherVolumeParticles(row, frame + 0x48, frame + 0x50, runtime);
  } else {seedWeatherVolumeParticles(row, frame + 0x40, frame + 0x38, runtime);}
  word(m, row + 2, at(0x42)); word(m, row + 4, at(0x44)); word(m, row, bp); word(m, row + 8, si); word(m, row + 10, at(0x3a)); word(m, row + 12, bx);
}
