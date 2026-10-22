import {assignViewportString} from './weather-viewport.mjs';
import {initializeGameImageColorTransform, initializeGameImageMetadata, clearGamePixelImage} from './game-image-storage.mjs';
import {countGameImageAffinityCpus, readGameImageThreadQuota} from './game-image-workers.mjs';
import {constructGameImageCopyTask, appendGameImageJob, releaseGameImageFutureState, waitGameImageJobs, releaseGameImageJobs} from './game-image-jobs.mjs';
import {allocateGameImagePalette} from './game-image-allocation.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), copy = (m, out, input, n) => Buffer.from(m.subarray(input, input + n)).copy(m, out);
const crt = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Image copy requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//40b600 reached non-self assignment plus40b8a0/40bb70 growth. Metadata's
//outer identity guards make the self-assignment erase helpers unreachable.
function copyWideString(output, input, runtime) {
  const {memory: m} = runtime, length = ptr(m, input + 16), data = ptr(m, input + 20) > 7 ? ptr(m, input) : input;
  if (length > 0x7ffffffe) throw RangeError('Native wide string length error.');
  if (ptr(m, output + 20) < length) {
    const oldCapacity = ptr(m, output + 20), oldLength = ptr(m, output + 16), rounded = length | 7; let capacity = length;
    if (rounded < 0x7fffffff) {capacity = rounded; const half = oldCapacity >>> 1; if (Math.trunc(rounded / 3) < half) capacity = oldCapacity > 0x7ffffffe - half ? 0x7ffffffe : oldCapacity + half;}
    const allocated = crt(runtime, 'operatorNew', [(capacity + 1) * 2]) >>> 0; if (!allocated) throw Error('Native wide string bad_alloc.');
    if (oldLength) crt(runtime, 'memcpy', [allocated, oldCapacity > 7 ? ptr(m, output) : output, oldLength * 2]);
    if (oldCapacity > 7) crt(runtime, 'operatorDelete', [ptr(m, output)]); put(m, output, allocated); put(m, output + 20, capacity); put(m, output + 16, oldLength); m.writeUInt16LE(0, allocated + oldLength * 2);
  }
  const destination = ptr(m, output + 20) > 7 ? ptr(m, output) : output;
  if (length) crt(runtime, 'memcpy', [destination, data, length * 2]); put(m, output + 16, length); m.writeUInt16LE(0, destination + length * 2);
}

//4c45b0. Live field order and the original selectively copied metadata lanes.
export function copyGameImageMetadata(output, input, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  //4c45b0/b1 and4c45c0. The later image clear can publish these original
  //saved registers and string argument words; no synthetic stack is invented.
  if (Number.isInteger(S)) for (const [register, offset] of [['ESI', -4], ['EDI', -8]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, S + offset, runtime.entryRegisters[register]);
  if (output === input) return output;
  if (Number.isInteger(S) && runtime.entryRegisters?.EBX !== undefined) put(m, S - 12, runtime.entryRegisters.EBX);
  const stringRuntime = {...runtime, handlers: {...runtime.handlers, allocate: n => crt(runtime, 'operatorNew', [n]), free: p => crt(runtime, 'operatorDelete', [p])}};
  const argumentsFor = (offset, returnAddress) => {if (Number.isInteger(S)) {put(m, S - 16, -1); put(m, S - 20, 0); put(m, S - 24, input + offset); put(m, S - 28, returnAddress);}};
  for (const [i, o] of [0, 28].entries()) {argumentsFor(o, i ? 0x4c45e8 : 0x4c45cb); const data = ptr(m, input + o + 20) > 15 ? ptr(m, input + o) : input + o; assignViewportString(output + o, data, ptr(m, input + o + 16), stringRuntime); put(m, output + o + 24, 0);}
  for (let o = 0x38; o <= 0x7c; o += 4) put(m, output + o, get(m, input + o));
  for (const [i, o] of [0x80, 0x9c, 0xb8].entries()) {argumentsFor(o, [0x4c4677, 0x4c469a, 0x4c46bd][i]); copyWideString(output + o, input + o, runtime); put(m, output + o + 24, 0);}
  m[output + 0xd4] = m[input + 0xd4]; for (const o of [0xd8, 0xdc, 0xec, 0xf8, 0xf8, 0xfc, 0x100, 0x104, 0x108]) put(m, output + o, get(m, input + o)); return output;
}

//4c7300. Full clipping/partition/descriptor parent. The worker explicitly
//rejects rotation/compositing until those separate game branches are recovered.
export function copyGameImageRegion(source, args, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 0x74, target = args[0]; args.forEach((v, i) => put(m, scratchBase + 4 + i * 4, v)); put(m, frame + 0x14, 0); put(m, frame + 0x18, 0); put(m, frame + 0x1c, source);
  let width = get(m, scratchBase + 0x20), height = get(m, scratchBase + 0x24); if (get(m, source + 8) <= 0 || get(m, source + 12) <= 0) return 0;
  if (width < 0) width = get(m, source + 8); if (height < 0) height = get(m, source + 12); width = Math.min(width, get(m, source + 8)); height = Math.min(height, get(m, source + 12)); put(m, scratchBase + 0x20, width); put(m, scratchBase + 0x24, height);
  if (get(m, source + 16) >= 3 && get(m, source + 16) <= 7 || get(m, target + 8) <= 0 || get(m, target + 12) <= 0) return 0;
  width = Math.min(width, get(m, target + 8)); height = Math.min(height, get(m, target + 12)); const affinity = countGameImageAffinityCpus({...runtime, scratchBase: frame - 4}), quota = readGameImageThreadQuota({...runtime, scratchBase: frame - 4}), count = Math.min(height, affinity, quota), descriptor = frame + 0x30, vector = frame + 0x24;
  for (const [o, value] of [[0, 0], [4, 0], [8, width], [12, height], [16, 0], [20, 0], [24, 0], [28, 0], [32, 0], [36, get(m, scratchBase + 0x28)], [52, target]]) put(m, descriptor + o, value);
  m.writeFloatLE(Math.fround(Math.fround(get(m, source + 8)) * m.readFloatLE(scratchBase + 0x2c)), descriptor + 40); m.writeFloatLE(Math.fround(Math.fround(get(m, source + 12)) * m.readFloatLE(scratchBase + 0x30)), descriptor + 44); m.writeUInt16LE(0, descriptor + 48);
  [0, 4, 8].forEach(o => put(m, vector + o, 0));
  if (count > 0) {const regular = Math.trunc(height / count), remainder = height - Math.imul(count - 1, regular) | 0; put(m, scratchBase + 0x24, 0x4c75b0); put(m, scratchBase + 0x20, get(m, frame + 0x1c));
    for (let i = 0; i < count; i++) {put(m, frame + 0x40, Math.imul(regular, i) + get(m, frame + 0x34)); put(m, frame + 0x44, i === count - 1 ? remainder : regular); constructGameImageCopyTask(frame + 0x1c, scratchBase + 0x24, scratchBase + 0x20, descriptor, {...runtime, scratchBase: frame - 16}); appendGameImageJob(vector, frame + 0x1c, {...runtime, scratchBase: frame - 8}); releaseGameImageFutureState(ptr(m, frame + 0x1c), {...runtime, scratchBase: frame - 16});}
  }
  waitGameImageJobs(vector, {...runtime, scratchBase: frame - 4}); releaseGameImageJobs(vector, {...runtime, scratchBase: frame - 4}); return 1;
}

//4c2850 deep copy and4c2710 allocating copy constructor. The bitmap/mipmap
//path uses uncompressed identical formats, with actual copy-row callbacks.
export function copyGamePixelImage(output, input, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 16; if (output === input) return output;
  for (const [register, offset] of [['EBX', -4], ['EBP', -8], ['ESI', -12], ['EDI', -16]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  clearGamePixelImage(output, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: runtime.entryRegisters?.ESI ?? output}});
  put(m, output + 8, get(m, input + 8)); put(m, output + 12, get(m, input + 12)); for (const o of [0x10, 0x20, 0x30]) copy(m, output + o, input + o, 16); copy(m, output + 0x40, input + 0x40, 8); put(m, output + 0x48, get(m, input + 0x48)); for (const o of [0x4c, 0x4d, 0x4e, 0x58]) m[output + o] = m[input + o]; for (const o of [0x50, 0x54, 0x5c]) put(m, output + o, get(m, input + o)); for (const o of [0x60, 0x70, 0x80, 0x90]) copy(m, output + o, input + o, 16);
  if (Number.isInteger(scratchBase)) {put(m, frame - 4, input + 0xa0); put(m, frame - 8, 0x4c2911);}
  copyGameImageMetadata(output + 0xa0, input + 0xa0, {...runtime, scratchBase: frame - 8, entryRegisters: {...runtime.entryRegisters, EDI: output}});
  const type = get(m, output + 16), width = get(m, output + 8), height = get(m, output + 12), depth = get(m, output + 0x44), compressed = type >= 3 && type <= 7;
  const product = BigInt.asUintN(64, BigInt(width) * BigInt(height)); let size;
  if (compressed) size = Math.imul(Math.imul(type === 3 ? 4 : 8, width), height) >> 3;
  else {const words = [Number(product & 0xffffffffn), Number(product >> 32n), depth, depth >> 31]; words.forEach((v, i) => put(m, frame - 16 + i * 4, v)); size = Number(BigInt.asUintN(64, product * BigInt(depth)) >> 3n & 0xffffffffn) | 0;}
  const pixels = crt(runtime, 'allocate', [size >>> 0]) >>> 0; put(m, output + 4, pixels);
  if (!pixels) throw Error('Image copy allocation failure reaches4a1fe0.');
  if (ptr(m, input + 4)) {if (compressed) crt(runtime, 'memcpy', [pixels, ptr(m, input + 4), size >>> 0]); else {put(m, frame - 4, 0); put(m, frame - 8, 0); put(m, frame - 12, 0); put(m, frame - 16, height); put(m, frame - 20, width); const entry = frame - 52, args = Array.from({length: 12}, (_, i) => get(m, entry + 4 + i * 4)); args[0] = output; copyGameImageRegion(input, args, {...runtime, scratchBase: entry});}}
  if (ptr(m, input)) {if (Number.isInteger(scratchBase)) put(m, frame - 4, 0x4c2a19); const paletteRuntime = {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EDI: output}}, palette = (runtime.handlers?.allocatePalette4a3290 ? runtime.handlers.allocatePalette4a3290(1024, paletteRuntime) : allocateGameImagePalette(1024, paletteRuntime)) >>> 0; put(m, output, palette); if (palette) crt(runtime, 'memcpy', [palette, ptr(m, input), 1024]); else {crt(runtime, 'free', [pixels]); put(m, output + 4, 0); clearGamePixelImage(output, {...runtime, scratchBase: frame - 4});}}
  return output;
}
export function constructGamePixelImageCopy(input, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28, output = crt(runtime, 'operatorNew', [0x1b8]) >>> 0; put(m, frame + 12, output); put(m, frame + 24, 0); if (!output) return 0;
  put(m, output, 0); put(m, output + 4, 0); put(m, output + 16, 8); put(m, output + 0x44, 0); m[output + 0x48] = 0; initializeGameImageColorTransform(output + 0x60, runtime);
  const metaEntry = frame - 4; put(m, metaEntry - 28, input); put(m, metaEntry - 24, output); put(m, metaEntry - 12, scratchBase - 12); initializeGameImageMetadata(output + 0xa0, {...runtime, scratchBase: metaEntry});
  put(m, frame + 24, 1); put(m, frame - 4, input); put(m, frame - 8, 0x4c278b); copyGamePixelImage(output, input, {...runtime, scratchBase: frame - 8, entryRegisters: {...runtime.entryRegisters, ESI: output, EDI: input}}); return output;
}
