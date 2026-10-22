import tables from './renderer-texture-upload-tables.json' with {type: 'json'};
import {associateRendererTexture, normalizeRendererTextureDimensions, countRendererTextureMipLevels, allocateRendererTextureSurface, releaseRendererTextureResource} from './renderer-texture-creation.mjs';
import {gameImageFormatsMatch} from './game-image-copy-rows.mjs';
import {copyGamePixelImage} from './game-image-copy.mjs';
import {initializeGameImageColorTransform, initializeGameImageMetadata, clearGamePixelImage, releaseGameImageMetadata, releaseGameImageList, appendGameImagePointer} from './game-image-storage.mjs';
import {convertGamePixelImage} from './game-image-conversion.mjs';
import {resampleGamePixelImage} from './game-image-resampling.mjs';
import {clearGameImageMipmaps, buildGameImageMipmaps} from './game-image-mipmaps.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const compressed = format => [0x31545844, 0x33545844, 0x35545844].includes(format);
const crt = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer upload requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const device = (r, object, method, args) => {if (typeof r.services?.direct3DCall !== 'function') throw Error('Renderer upload requires Direct3D COM services.'); return r.services.direct3DCall(object, method, args, r) | 0;};
const save = (r, base, pairs) => {if (Number.isInteger(base)) for (const [reg, offset] of pairs) if (r.entryRegisters?.[reg] !== undefined) put(r.memory, base + offset, r.entryRegisters[reg]);};
export function initializeRendererTextureUploadTables(memory) {for (const table of tables.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//51f230. The native return preserves the count's upper three bytes.
export function rendererSupportsTextureFormat(manager, format, {memory: m}) {
  const count = () => Math.trunc((get(m, manager + 0x4c4) - get(m, manager + 0x4c0) | 0) / 36) | 0;
  let total = count(); if (!total) return 0;
  for (let index = 0, row = ptr(m, manager + 0x4c0);;) {
    if (get(m, row) === (format | 0)) return total & ~255 | 1;
    total = count(); index++; row += 36; if ((index >>> 0) >= (total >>> 0)) return total & ~255;
  }
}

//51f510. Alpha/category selection deliberately rereads an aliased image.
export function selectRendererTextureCategory(resource, image, {memory: m}) {
  const type = get(m, image + 16);
  if (type >= 3 && type <= 7) {put(m, resource + 0x454, 3); if ([5, 7].includes(get(m, image + 16))) put(m, resource + 0x454, 11);}
  else if (type === 1) {put(m, resource + 0x454, get(m, image + 0x44) === 128 ? 5 : 4); put(m, resource + 0x454, get(m, resource + 0x454) | 8);}
  else {const depth = get(m, image + 0x44); put(m, resource + 0x454, depth === 8 ? 0 : depth === 16 ? 1 : 2); if (m[image + 0x4c]) put(m, resource + 0x454, get(m, resource + 0x454) | 8);}
}

//51f5c0. Only a genuinely enumerated device format enables a direct copy.
export function selectRendererTextureFormat(resource, image, runtime) {
  const m = runtime.memory, type = get(m, image + 16); let format = 0;
  if (type >= 3 && type <= 7) format = (0x31545844 + ((type - 3) << 24)) | 0;
  else if (type === 1 && [64, 128].includes(get(m, image + 0x44)) && [0, 1, 2, 3].every((v, i) => get(m, image + 0x14 + i * 4) === v)) format = get(m, image + 0x44) === 64 ? 0x71 : 0x74;
  put(m, resource + 0x444, 0);
  if (format && (rendererSupportsTextureFormat(ptr(m, 0x714ae8), format, runtime) & 255)) put(m, resource + 0x444, format);
}

//51f2a0. Dirty-region publication and primary-to-secondary device transfer.
export function commitRendererTexture(resource, runtime) {
  const {memory: m, scratchBase: S} = runtime, frame = S - 36, primary = ptr(m, resource + 0x438);
  save(runtime, S, [['ESI', -32], ['EDI', -36]]);
  const call = (object, method, args, ret) => {args.forEach((v,i)=>put(m,frame-args.length*4+i*4,v)); const entry=frame-args.length*4-4;put(m,entry,ret);return device({...runtime,scratchBase:entry},object,method,args);};
  if (!primary || get(m, resource + 0x458)) return;
  if (get(m, resource + 16) === 1) {for (let p = 0x5db7c8; p < 0x5db7e0; p += 4) {const live = ptr(m, resource + 0x438); call(live, 0x54, [live, get(m, p), 0],0x51f2e0);}}
  else {let box = 0; if (get(m, resource + 16) === 2) {put(m, frame + 16, get(m, resource + 0x420)); put(m, frame + 20, get(m, resource + 0x424)); const depth = get(m, resource + 0x44c); for (const o of [8, 12, 24]) put(m, frame + o, 0); put(m, frame + 28, depth); box = frame + 8;} call(primary, 0x54, [primary, box],0x51f337);}
  const secondary = ptr(m, resource + 0x43c); if (secondary) {const live = ptr(m, resource + 0x438); if (live !== secondary) {const object = ptr(m, ptr(m, 0x714ae8) + 0x36c); call(object, 0x7c, [object, live, secondary],0x51f35e);}}
}

//4c4150, stack/value deep-copy constructor used by upload conversion.
export function constructRendererUploadImage(output, input, runtime) {
  const {memory: m, scratchBase: S} = runtime, frame = S - 24;
  put(m, S - 4, -1); put(m, S - 8, 0x56ab8e); if (runtime.sehWord !== undefined) put(m, S - 12, runtime.sehWord); save(runtime, S, [['ESI', -24]]); put(m, frame + 8, output);
  put(m, output, 0); put(m, output + 4, 0); put(m, output + 16, 8); put(m, output + 0x44, 0); m[output + 0x48] = 0;
  initializeGameImageColorTransform(output + 0x60, runtime); initializeGameImageMetadata(output + 0xa0, {...runtime, scratchBase: frame - 4}); put(m, frame + 20, 0);
  copyGamePixelImage(output, input, {...runtime, scratchBase: frame - 8, entryRegisters: {...runtime.entryRegisters, ESI: output}}); return output;
}

function imageBytes(image, m) {
  const type = get(m, image + 16), width = get(m, image + 8), height = get(m, image + 12);
  if (type >= 3 && type <= 7) return Math.imul(Math.imul(type === 3 ? 4 : 8, width), height) >> 3;
  return Number(BigInt.asUintN(64, BigInt(width) * BigInt(height) * BigInt(get(m, image + 0x44))) >> 3n & 0xffffffffn) | 0;
}

//51fb10. Copy packed/compressed bytes directly when supported; otherwise
//construct a real temporary, convert using the game image algorithms and retire it.
export function copyRendererTexturePixels(manager, image, category, directFormat, locked, runtime) {
  const {memory: m, scratchBase: S} = runtime, frame = S - 0x394, output = ptr(m, locked + 4), descriptor = ptr(m, manager + 0x43c + Math.imul(category, 4));
  put(m, S - 4, -1); put(m, S - 8, 0x56c1e2); if (runtime.sehWord !== undefined) put(m, S - 12, runtime.sehWord); save(runtime, frame, [['EBX', 12], ['EBP', 8], ['ESI', 4], ['EDI', 0]]);
  const copy = input => crt(runtime, 'memcpy', [output, ptr(m, input + 4), imageBytes(input, m) >>> 0]);
  if (directFormat) {copy(image); return;}
  const type = get(m, image + 16), masks = () => [12, 16, 20, 24].map(o => get(m, descriptor + o)), depth = () => get(m, descriptor + 28);
  if (type === 0 && gameImageFormatsMatch(image, 0, depth(), masks(), {...runtime, scratchBase: frame - 28})) {copy(image); return;}
  if (type === 1) {const values = [depth(), ...masks()].map((v, i) => v === -1 ? [64, 0, 1, 2, 3][i] : v); if (values.every((v, i) => get(m, image + [0x44, 0x14, 0x18, 0x1c, 0x20][i]) === v)) {copy(image); return;}}
  if (![0, 1, 2].includes(type)) return;
  const temporary = frame + (type === 1 ? 0x1cc : 0x14), state = type === 1 ? 4 : type === 0 ? 2 : 0;
  constructRendererUploadImage(temporary, image, {...runtime, scratchBase: frame - 8, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, ESI: descriptor, EDI: image}}); put(m, frame + 0x390, state);
  convertGamePixelImage(temporary, 1, type === 1 ? 1 : 0, depth(), ...masks(), {...runtime, scratchBase: frame - 32, sehWord: S - 12}); copy(temporary); put(m, frame + 0x390, state + 1);
  clearGamePixelImage(temporary, {...runtime, scratchBase: frame - 4}); releaseGameImageMetadata(temporary + 0xa0, {...runtime, scratchBase: frame - 4});
}

//4bc770/4bc720. Upload-owned deep copy and normal-byte conversion of a list.
export function copyRendererUploadImages(output, input, runtime) {
  const {memory: m, scratchBase: S} = runtime, frame = S - 32;
  if (output === input) return;
  releaseGameImageList(output, {...runtime, scratchBase: frame - 4});
  for (let index = 0; (index >>> 0) < ((get(m, input + 4) - get(m, input)) >> 2 >>> 0); index++) {
    const image = crt(runtime, 'operatorNew', [0x1b8]) >>> 0;
    if (image) {put(m, image, 0); put(m, image + 4, 0); put(m, image + 16, 8); put(m, image + 0x44, 0); m[image + 0x48] = 0;
      initializeGameImageColorTransform(image + 0x60, runtime); initializeGameImageMetadata(image + 0xa0, {...runtime, scratchBase: frame - 4}); clearGamePixelImage(image, {...runtime, scratchBase: frame - 4});}
    put(m, frame - 4, ptr(m, ptr(m, input) + index * 4)); put(m, frame - 8, 0x4bc826);
    copyGamePixelImage(image, ptr(m, ptr(m, input) + index * 4), {...runtime, scratchBase: frame - 8, entryRegisters: {...runtime.entryRegisters, EBX: input, EBP: index, ESI: output, EDI: image}}); put(m, frame + 16, image); appendGameImagePointer(output, frame + 16, {...runtime, inlineAppend: true, growthScratchBase: frame - 8});
  }
}

export function convertRendererUploadImages(list, runtime) {
  const {memory: m, scratchBase: S} = runtime, frame = S - 12; let result = 1;
  save(runtime, S, [['EBX', -4], ['ESI', -8], ['EDI', -12]]);
  for (let index = 0; (index >>> 0) < ((get(m, list + 4) - get(m, list)) >> 2 >>> 0); index++) {put(m, frame - 32, 0x4bc74d); result &= convertGamePixelImage(ptr(m, ptr(m, list) + index * 4), 1, 0, 32, -1, -1, -1, -1, {...runtime, scratchBase: frame - 32});}
  return result;
}

//51ff30. Actual dimension search, optional owned image-list conversion,
//surface/volume locking and retirement. Direct3D objects alone are services.
export function uploadRendererTextureLevels(manager, resource, list, face, startLevel, runtime) {
  const {memory: m, scratchBase: S} = runtime, bp = S - 4, aligned = bp & ~7, frame = aligned - 0x70, temporary = frame + 0x28;
  put(m, bp, runtime.entryRegisters?.EBP ?? 0); put(m, aligned - 4, -1); put(m, aligned - 8, 0x56c200); if (runtime.sehWord !== undefined) put(m, aligned - 12, runtime.sehWord);
  [resource, list, face, startLevel].forEach((v, i) => put(m, bp + 8 + i * 4, v)); put(m, frame + 0x18, manager);
  const firstArray = ptr(m, list), first = ptr(m, firstArray), count = (get(m, list + 4) - get(m, list)) >> 2;
  let resize = false;
  const matches = shift => get(m, resource + 0x420) === (get(m, first + 8) >> (shift & 31)) && get(m, resource + 0x424) === (get(m, first + 12) >> (shift & 31));
  if (!matches(startLevel)) {let n = 0, shift = startLevel; for (; n < count; n++, shift++) if (matches(shift)) {startLevel = startLevel + n | 0; put(m, bp + 20, startLevel); break;} resize = n === count;}
  put(m, frame + 0x10, firstArray & ~255); const format = get(m, resource + 0x444); put(m, frame + 0x14, format); for (const o of [0, 4, 8]) put(m, temporary + o, 0); put(m, frame + 0x6c, 0);
  let currentEdi = first;
  const call = (args, returnAddress, action) => {args.forEach((v, i) => put(m, frame - args.length * 4 + i * 4, v)); const entry = frame - args.length * 4 - 4; put(m, entry, returnAddress); return action({...runtime, scratchBase: entry, sehWord: aligned - 12, entryRegisters: {...runtime.entryRegisters, EBP: bp, ESI: resource, EDI: currentEdi}});};
  let copied = false, result = 0;
  if (!(resize && get(m, first + 16) >= 3 && get(m, first + 16) <= 7)) {
    const canonical = get(m, first + 16) === 0 && get(m, first + 0x44) === 32 && [0xff0000, 0xff00, 255, -16777216].every((v, i) => get(m, first + 0x14 + i * 4) === v);
    if (!canonical && !format) {call([list], 0x520054, r => copyRendererUploadImages(temporary, list, r)); copied = true; put(m, frame - 32, 0x520060); convertRendererUploadImages(temporary, {...runtime, scratchBase: frame - 32, sehWord: aligned - 12, entryRegisters: {EBX: count & ~255 | 1, EBP: bp, ESI: resource, EDI: first}});}
    if (resize) {
      if (!copied) call([list], 0x520078, r => copyRendererUploadImages(temporary, list, r)); copied = true;
      const levels = (get(m, temporary + 4) - get(m, temporary)) >> 2, width = get(m, resource + 0x420), height = get(m, resource + 0x424); put(m, frame + 0x10, height); put(m, frame + 0x1c, width);
      if (levels > 0) {clearGameImageMipmaps(temporary, {...runtime, scratchBase: frame - 4, sehWord: aligned - 12}); const image = ptr(m, ptr(m, temporary)); call([width, height, image, image], 0x5200bb, r => resampleGamePixelImage(image, width, height, image, image, r)); if (levels > 1) call([1, 0], 0x5200cd, r => buildGameImageMipmaps(temporary, 1, 0, r));}
    }
    const selected = copied ? temporary : list; put(m, frame + 0x10, selected);
    const com = (object, method, args, returnAddress) => call(args, returnAddress, r => device(r, object, method, args));
    const pixels = (level, ret) => {const image = ptr(m, ptr(m, ptr(m, frame + 0x10)) + Math.imul(level, 4)); call([image, get(m, resource + 0x454), get(m, frame + 0x14), frame + 0x20], ret, r => copyRendererTexturePixels(ptr(m, frame + 0x18), image, get(m, resource + 0x454), get(m, frame + 0x14), frame + 0x20, r));};
    if (get(m, resource + 16) === 1) put(m, frame + 0x1c, get(m, 0x5db7c8 + Math.imul(face, 4)));
    for (let level = 0, imageLevel = startLevel; level < get(m, resource + 0x428); level++, imageLevel++) {
      currentEdi = level;
      const kind = get(m, resource + 16);
      if (kind === 2) {
        put(m, frame + 0x48, get(m, resource + 0x420)); put(m, frame + 0x4c, get(m, resource + 0x424)); put(m, frame + 0x54, face + 1); put(m, frame + 0x40, 0); put(m, frame + 0x44, 0); put(m, frame + 0x50, face);
        const object = ptr(m, resource + 0x438);
        if (com(object, 0x4c, [object, level, frame + 0x34, frame + 0x40, 0], 0x520215) === 0) {put(m, frame + 0x24, get(m, frame + 0x3c)); put(m, frame + 0x20, get(m, frame + 0x34)); pixels(imageLevel, 0x52024a); const live = ptr(m, resource + 0x438); com(live, 0x50, [live, level], 0x520257);}
      } else {
        let object = ptr(m, resource + 0x438);
        if (kind !== 1) {
          com(object, 0x44, [object, level, frame + 0x40], 0x520296); const image = ptr(m, ptr(m, selected) + Math.imul(imageLevel, 4)), width = get(m, frame + 0x58), height = get(m, frame + 0x5c);
          if (width !== get(m, image + 8) && height !== get(m, image + 12)) call([width, height, image, image], 0x5202ba, r => resampleGamePixelImage(image, width, height, image, image, r));
          object = ptr(m, resource + 0x438); com(object, 0x48, [object, level, frame + 12], 0x5202cc);
        } else com(object, 0x48, [object, get(m, frame + 0x1c), level, frame + 12], 0x520123);
        let surface = ptr(m, frame + 12);
        if (surface) {
          if (com(surface, 0x34, [surface, frame + 0x20, 0, 0], kind === 1 ? 0x52013d : 0x5202e3) === 0) {pixels(imageLevel, kind === 1 ? 0x520167 : 0x52030d); surface = ptr(m, frame + 12); com(surface, 0x38, [surface], kind === 1 ? 0x520171 : 0x520317);}
          surface = ptr(m, frame + 12); if (surface) {com(surface, 8, [surface], kind === 1 ? 0x52017f : 0x520325); put(m, frame + 12, 0);}
        }
      }
    }
    result = 1;
  }
  put(m, frame + 0x6c, 1); releaseGameImageList(temporary, {...runtime, scratchBase: frame - 4}); if (ptr(m, temporary)) crt(runtime, 'operatorDelete', [ptr(m, temporary)]); return result;
}

//520940, renderer virtual88, six original DWORD arguments.
export function uploadRendererTexture(manager, index, list, startLevel, levelCount, flags, output, runtime) {
  const {memory: m, scratchBase: S} = runtime, frame = S - 16;
  save(runtime,S,[['EBX',-4],['EBP',-8],['ESI',-12],['EDI',-16]]);
  [index, list, startLevel, levelCount, flags, output].forEach((v, i) => put(m, S + 4 + i * 4, v));
  const resource = ptr(m, ptr(m, manager + 0x48c) + Math.imul(index, 4)), callback = ptr(m, resource + 24);
  if (callback) {if (typeof runtime.handlers?.textureUploadCallback !== 'function') throw Error(`Unrecovered renderer texture callback0x${callback.toString(16)}.`); runtime.handlers.textureUploadCallback(callback, list, {...runtime, scratchBase: frame - 8});}
  m[resource + 12] = m[ptr(m, ptr(m, list)) + 0x4c]; associateRendererTexture(manager, get(m, frame + 20), get(m, frame + 20), runtime);
  let count = get(m, frame + 32), start = get(m, frame + 28), total = (get(m, list + 4) - get(m, list)) >> 2; if (!count) count = total - start | 0; if (start >= total) {start = total - 1 | 0; put(m, frame + 28, start);} if ((start + count | 0) > total) count = total - start | 0;
  selectRendererTextureCategory(resource, ptr(m, ptr(m, list)), {...runtime, scratchBase: frame - 8}); selectRendererTextureFormat(resource, ptr(m, ptr(m, list)), {...runtime, scratchBase: frame - 8});
  output = ptr(m, frame + 40); m[output] = 0; const image = ptr(m, ptr(m, list)), type = get(m, image + 16), oldFormat = get(m, resource + 0x444);
  if (type === 0) m[output] = [21, 22].includes(oldFormat) ? 1 : 0; else if (type === 1 || type === 2) m[output] = oldFormat === (type === 1 ? 0x71 : 0x29) ? 1 : 0;
  put(m, frame + 40, get(m, image + 0x44)); put(m, frame + 32, get(m, image + 12)); put(m, frame + 24, get(m, image + 8)); put(m, resource + 16, 0);
  if (!oldFormat) put(m, resource + 0x444, get(m, ptr(m, manager + Math.imul(get(m, resource + 0x454), 4) + 0x43c)));
  const minimum = compressed(get(m, resource + 0x444)) ? 4 : 1, shift = get(m, frame + 28) & 31;
  put(m, frame + 24, ptr(m, frame + 24) >>> shift); if (ptr(m, frame + 24) < minimum) return 0;
  put(m, frame + 32, ptr(m, frame + 32) >>> shift); if (ptr(m, frame + 32) < minimum) return 0;
  normalizeRendererTextureDimensions(manager, frame + 24, frame + 32, 0, 0, minimum, get(m, frame + 36), {...runtime, scratchBase: frame - 28});
  if (!(get(m, ptr(m, manager + 0x488) + 0x440) & 0x4000)) count = 1;
  if (count) {const maximum = countRendererTextureMipLevels(get(m, frame + 24), get(m, frame + 32), resource, runtime); if ((count >>> 0) >= (maximum >>> 0)) count = countRendererTextureMipLevels(get(m, frame + 24), get(m, frame + 32), resource, runtime);} else count = countRendererTextureMipLevels(get(m, frame + 24), get(m, frame + 32), resource, runtime);
  put(m, resource + 0x420, get(m, frame + 24)); put(m, resource + 0x424, get(m, frame + 32)); put(m, resource + 0x458, 0); put(m, resource + 0x44c, 1); put(m, resource + 0x428, count); put(m, resource + 0x434, 0); put(m, resource + 0x450, -1);
  const flag = m[frame + 36]; put(m, resource + 0x42c, get(m, frame + 40)); m[resource + 0x45c] = flag; m[resource + 0x45d] = flag === 0 ? 1 : 0;
  if (get(m, resource + 16) === 1) {const w = get(m, resource + 0x420), h = get(m, resource + 0x424); if (w > h) put(m, resource + 0x424, w); else if (w < h) put(m, resource + 0x420, h);}
  const allocate = secondary => allocateRendererTextureSurface(resource, secondary, get(m, manager + 0x36c), ptr(m, manager + 0x488) + 0x404, {...runtime, scratchBase: frame - 16});
  if (!get(m, resource + 0x458) && !(flag && (get(m, ptr(m, manager + 0x488) + 0x410) & 0x20000000)) && !allocate(0)) {releaseRendererTextureResource(resource, {...runtime, scratchBase: frame - 4}); return 0;}
  if (!get(m, resource + 0x43c)) allocate(1);
  if (!m[frame + 36]) {const start = get(m,frame+28); [resource,list,0,start].forEach((v,i)=>put(m,frame-16+i*4,v));put(m,frame-20,0x520c49); if (!uploadRendererTextureLevels(manager, resource, list, 0, start, {...runtime, scratchBase: frame - 20, entryRegisters: {EBX: manager, EBP: list, ESI: resource, EDI: count}})) return 0;}
  put(m,frame-4,0x520c54); commitRendererTexture(resource, {...runtime, scratchBase: frame - 4,entryRegisters:{EBX:manager,EBP:list,ESI:resource,EDI:count}}); return 1;
}
