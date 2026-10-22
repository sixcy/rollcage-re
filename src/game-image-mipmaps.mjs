import {appendGameImagePointer, clearGamePixelImage, releaseGameImageMetadata} from './game-image-storage.mjs';
import {constructGamePixelImageCopy} from './game-image-copy.mjs';
import {resampleGamePixelImage} from './game-image-resampling.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const crt = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Mipmaps require CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//4bc3b0. Retire every extra level, preserving the first image and capacity.
export function clearGameImageMipmaps(list, runtime) {
  const {memory: m, scratchBase} = runtime;
  put(m, scratchBase - 4, -1); put(m, scratchBase - 8, 0x56ab8e);
  if (runtime.sehWord !== undefined) put(m, scratchBase - 12, runtime.sehWord);
  if (runtime.entryRegisters?.ESI !== undefined) put(m, scratchBase - 28, runtime.entryRegisters.ESI);
  if (((get(m, list + 4) - get(m, list)) >> 2) <= 0) return;
  for (const [register, offset] of [['EBX', -32], ['EDI', -36]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  const first = ptr(m, ptr(m, list)); put(m, scratchBase - 24, first); put(m, scratchBase - 20, first);
  for (let i = 1; (i >>> 0) < ((get(m, list + 4) - get(m, list)) >> 2 >>> 0); i++) {
    const image = ptr(m, ptr(m, list) + i * 4); if (image) {clearGamePixelImage(image, {...runtime, scratchBase: scratchBase - 44, entryRegisters: {ESI: list}}); releaseGameImageMetadata(image + 0xa0, {...runtime, scratchBase: scratchBase - 44}); crt(runtime, 'operatorDelete', [image]); put(m, ptr(m, list) + i * 4, 0);}
  }
  put(m, list + 4, get(m, list)); appendGameImagePointer(list, scratchBase - 24, {...runtime, inlineAppend: true, growthScratchBase: scratchBase - 44, growthRegisters: {...runtime.entryRegisters, ESI: list, EDI: 1, EBX: first}});
}

//4bc1c0. Each authored level is copied from the original first level, then
//resampled with the actual3 box/area filter, and appended using native growth.
export function buildGameImageMipmaps(list, minimum, shortestSide, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28; put(m, scratchBase + 4, minimum); put(m, scratchBase + 8, shortestSide);
  put(m, frame - 4, 0x4bc1ce); clearGameImageMipmaps(list, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, ESI: list}}); const original = ptr(m, ptr(m, list)); put(m, frame + 24, original);
  let width = get(m, original + 8), height = get(m, original + 12), extent = (shortestSide & 255) === 1 ? Math.min(width, height) : Math.max(width, height), levels = 1;
  while (minimum < extent) {extent >>= 1; levels++; if (levels > 33) throw RangeError('Native mipmap level loop does not terminate for this minimum.');}
  if (levels <= 1) return;
  put(m, scratchBase + 8, levels - 1);
  while (get(m, scratchBase + 8)) {width = Math.max(minimum, width >> 1); height = Math.max(minimum, height >> 1); put(m, frame - 4, 0x4bc22a); const image = constructGamePixelImageCopy(original, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EBX: width, EBP: height, ESI: list, EDI: original}});
    put(m, frame - 20, 0x4bc237);
    resampleGamePixelImage(image, width, height, 0, image, {...runtime, scratchBase: frame - 20, entryRegisters: {EBX: width, ESI: list, EDI: image}});
    put(m, frame + 20, image); appendGameImagePointer(list, frame + 20, {...runtime, inlineAppend: true, growthScratchBase: frame - 8, growthRegisters: {EBX: width, EBP: height, ESI: list, EDI: image}}); put(m, scratchBase + 8, get(m, scratchBase + 8) - 1);
  }
}
