import {nativeGlobalAddress} from './native-global-address.mjs';
import {allocateRawEffectParticle, lookupRawSpatialBucket} from './body-retirement-effects.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const rng = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;

//44a5c0: each authored cell contributes its four corner pointers, deduplicated
//in first-seen order. Bases are captured before phase randomization begins.
export function initializeTerrainPointAnimation(runtime) {
  const {memory, scratchBase, handlers = {}} = runtime, local = scratchBase - 44;
  put(memory, scratchBase - 4, get(memory, 0x5e8890) ^ (scratchBase - 28));
  const pack = ptr(memory, 0x90b990); let remaining = memory[pack + 0xfc]; put(memory, local + 16, remaining);
  if (typeof handlers.allocate !== 'function') throw Error('Terrain point animation requires allocate.');
  const output = handlers.allocate(0x6000, runtime) >>> 0;
  if (output) memory.fill(0, output, output + 0x6000);
  let cell = ptr(memory, pack + 0x100), count = 0; put(memory, 0x90b994, output); put(memory, local + 20, cell);
  while (remaining > 0) {
    const sector = ptr(memory, ptr(memory, 0x909240) + memory[cell + 2] * 4), columns = (get(memory, sector + 8) + 1) | 0;
    const first = (ptr(memory, sector + 32) + ((Math.imul(memory.readUInt16LE(cell), columns) + memory[cell + 3]) | 0) * 8) >>> 0;
    put(memory, local + 24, first); put(memory, local + 28, first + 8); put(memory, local + 32, first + columns * 8); put(memory, local + 36, first + columns * 8 + 8);
    for (let corner = 0; corner < 4; corner++) {
      const target = ptr(memory, local + 24 + corner * 4); let index = 0;
      while (index < count && ptr(memory, output + index * 24) !== target) index++;
      if (index === count) {
        const row = output + count * 24; count++; put(memory, row, target);
        const y = memory.readUInt16LE(target + 2), z = memory.readUInt16LE(target + 4), x = memory.readUInt16LE(target);
        word(memory, row + 4, x); word(memory, row + 6, y); word(memory, row + 8, z);
      }
    }
    cell = (ptr(memory, local + 20) + 4) >>> 0; remaining--; put(memory, local + 16, remaining); put(memory, local + 20, cell);
  }
  put(memory, 0x90b998, count);
  if (!count) return;
  let seed = get(memory, 0x5ec954);
  for (let index = 0; index < count; index++) {
    const row = output + index * 24; word(memory, row + 16, 0); seed = rng(seed);
    word(memory, row + 18, (Math.imul(seed >>> 15, 0x7fff) >>> 16) & 255); seed = rng(seed);
    memory[row + 20] = (Math.imul(seed >>> 15, 0x7fff) >>> 16) & 3; seed = rng(seed);
    memory[row + 21] = (Math.imul(seed >>> 15, 0x7fff) >>> 16) & 1;
  }
  put(memory, 0x5ec954, seed);
  const first = ptr(memory, output), palette = ptr(memory, 0x909270), alpha = memory[palette + (memory.readUInt16LE(first + 6) >>> 6) * 4 + 3];
  for (let index = 0; index < 32; index++) {
    const base = ptr(memory, 0x909270), row = base + 0xfbc - index * 4;
    memory[row + 1] = index; memory[row + 2] = index; memory[row] = (index + 8) * 4; memory[row + 3] = alpha;
  }
}

//44a7a0. Authored mutable terrain vertices, dirty ranges and two independent
//RNG-gated emissions. Records are24 bytes; their target pointers stay live.
export function updateTerrainPointAnimation({memory, scratchBase}) {
  const local = scratchBase - 48;
  put(memory, scratchBase - 4, get(memory, 0x5e8890) ^ (scratchBase - 32));
  if (!memory[ptr(memory, 0x90b990) + 0xfc]) return;
  let remaining = get(memory, 0x90b998), row = ptr(memory, 0x90b994); put(memory, local + 16, remaining);
  if (remaining > 0) put(memory, 0x5ed2b4, 1);
  while (remaining > 0) {
    word(memory, row + 16, memory.readUInt16LE(row + 16) + 1);
    const phase = memory.readInt16LE(row + 16), mode = memory[row + 20], scale = mode === 1 ? 3 : mode === 2 ? 4 : mode === 3 ? 6 : 2;
    if (phase > (mode === 1 ? 85 : mode === 2 ? 63 : mode === 3 ? 42 : 127)) word(memory, row + 16, 0);
    const index = (memory.readInt16LE(row + 18) + Math.imul(phase, scale)) & 255, target = ptr(memory, row), amplitude = memory[row + 21];
    const baseX = memory.readUInt16LE(row + 4), wave = memory.readInt16LE(0x5ed030 + index * 2), delta = wave >> ((12 - amplitude) & 31);
    word(memory, target, baseX + delta); word(memory, target + 2, (wave >> ((11 - amplitude) & 31)) + memory.readUInt16LE(row + 6));
    word(memory, target + 4, memory.readUInt16LE(row + 8) + delta);
    const intensity = Math.max(0, Math.min(31, 16 - (memory.readInt16LE(0x5ed030 + index * 2) >> 9))), live = ptr(memory, row);
    remaining--; put(memory, local + 16, remaining);
    word(memory, live + 6, (0xfbc0 - (intensity << 6)) | (memory.readUInt16LE(live + 6) & 63)); row += 24;
  }
  const pack = ptr(memory, 0x90b990); let count = memory[pack + 0x11c], range = ptr(memory, pack + 0x118), dirty = ptr(memory, nativeGlobalAddress(memory,0x80f210));
  if (count) {
    do {
      const coordinates = ((memory.readUInt16LE(range + 2) & 2047) << 11) | (memory.readUInt16LE(range) & 2047);
      if (dirty < 64) {
        const value = (((coordinates | 0x800000) << 7) | (memory[range + 4] & 127)) | 0;
        if (!dirty || get(memory, nativeGlobalAddress(memory,0x80f41c + dirty * 4)) !== value) {put(memory, nativeGlobalAddress(memory,0x80f420 + dirty * 4), value); dirty++;}
      }
      range += 8; count--;
    } while (count > 0);
    put(memory, nativeGlobalAddress(memory,0x80f210), dirty);
  }
  let seed = rng(get(memory, 0x5ec958)), records = ptr(memory, 0x90b994), selected = (seed >>> 16) & 511;
  if (selected < ptr(memory, 0x90b998)) {
    const vertex = ptr(memory, records + selected * 24), x = memory.readInt16LE(vertex) << 16, y = memory.readInt16LE(vertex + 2) << 16, z = memory.readInt16LE(vertex + 4) << 16;
    seed = rng(seed); let debrisCount = (seed >>> 16) & 7;
    put(memory, local + 16, x); put(memory, local + 36, y); put(memory, local + 40, z);
    while (debrisCount > 0) {
      seed = rng(seed); const value = seed >>> 16, vx = ((value & 15) - 7) << 15, vy = (-4 - ((value >>> 6) & 15)) << 15; let vz = (((value >>> 10) & 15) - 7) << 15;
      put(memory, local + 32, vx); put(memory, local + 20, vy); put(memory, local + 28, vz);
      const freeLast = get(memory, nativeGlobalAddress(memory, 0x902b8c));
      if (freeLast >= 0) {
        const id = memory.readUInt16LE(ptr(memory, nativeGlobalAddress(memory, 0x902b7c)) + freeLast * 2), active = ptr(memory, nativeGlobalAddress(memory, 0x902b80));
        put(memory, nativeGlobalAddress(memory, 0x902b8c), freeLast - 1); const index = get(memory, nativeGlobalAddress(memory, 0x902b88)); word(memory, active + index * 2, id); put(memory, nativeGlobalAddress(memory, 0x902b88), index + 1);
        const debris = (ptr(memory, nativeGlobalAddress(memory, 0x902b84)) + id * 128) >>> 0;
        put(memory, debris + 0x4c, x); put(memory, debris + 0x54, get(memory, local + 40)); put(memory, debris + 0x50, get(memory, local + 36));
        const found = lookupRawSpatialBucket(get(memory, local + 16), y, z, {memory}); put(memory, local + 24, found.outside);
        const tagged = found.bucket + found.outside; put(memory, debris + 12, tagged);
        const base = ptr(memory, nativeGlobalAddress(memory, 0x902eec)), bucket = tagged & 0xfffffffe, packedId = (((debris - base + 128) >>> 0) >>> 7) & 65535, head = memory.readUInt16LE(bucket + 10);
        put(memory, debris + 4, head);
        if (head) {word(memory, (base - 122 + head * 128) >>> 0, packedId); vz = get(memory, local + 28);}
        word(memory, bucket + 10, packedId); word(memory, debris + 8, 21); word(memory, debris + 0x6a, 1);
        word(memory, debris + 0x64, memory.readUInt16LE(debris + 0x4e)); word(memory, debris + 0x66, memory.readUInt16LE(debris + 0x52)); word(memory, debris + 0x68, memory.readUInt16LE(debris + 0x56));
        put(memory, debris + 0x58, get(memory, local + 32)); put(memory, debris + 0x5c, get(memory, local + 20)); put(memory, debris + 0x60, vz);
        put(memory, debris + 0x30, 0x9f); put(memory, debris + 0x14, 0xae000020); memory[debris + 0x6c] = 1;
      }
      debrisCount--;
    }
    records = ptr(memory, 0x90b994);
  }
  seed = rng(seed); put(memory, 0x5ec958, seed); selected = (seed >>> 16) & 255;
  if (selected < ptr(memory, 0x90b998)) {
    const vertex = ptr(memory, records + selected * 24), x = memory.readInt16LE(vertex) << 16, y = memory.readInt16LE(vertex + 2) << 16, z = memory.readInt16LE(vertex + 4) << 16;
    const particle = allocateRawEffectParticle({memory});
    word(memory, particle + 0x96, 32); put(memory, particle + 0xa0, 0); put(memory, particle, 8); memory[particle + 0x95] = 24;
    put(memory, particle + 0x88, x); put(memory, particle + 0x8c, y); put(memory, particle + 0x90, z); put(memory, particle + 0x9c, 0xfc000000); put(memory, particle + 0x98, 0xc0ffe0e0);
    const found = lookupRawSpatialBucket(x, y, z, {memory}); put(memory, local + 20, found.outside);
    const base = ptr(memory, nativeGlobalAddress(memory, 0x902eec)), tagged = found.bucket + found.outside, bucket = tagged & 0xfffffffe;
    put(memory, particle + 12, tagged);
    const head = memory.readUInt16LE(bucket + 10), id = (((particle - base + 128) >>> 0) >>> 7) & 65535;
    put(memory, particle + 4, head); if (head) word(memory, (base - 122 + head * 128) >>> 0, id);
    const material = get(memory, 0x919140); word(memory, bucket + 10, id); memory[particle + 0x94] = 1; put(memory, particle + 0xa4, material);
  }
}
