import {constructGamePixelImage, allocateGamePixelImage, releaseGameImageList} from './game-image-storage.mjs';
import {convertGamePixelImage} from './game-image-conversion.mjs';
import {readGameImageRgba, writeGameImageRgba} from './game-image-format.mjs';
import {buildGameImageMipmaps} from './game-image-mipmaps.mjs';
import {getGameGraphicsSettings} from './game-graphics-settings.mjs';
import {packDevicePalette32} from './device-color-packing.mjs';
import {obtainRendererTextureIndex} from './renderer-texture-ownership.mjs';
import {uploadRendererTexture} from './renderer-texture-upload.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const crt = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Texture construction requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const renderer = (r, offset, args) => {
  const thisAddress = ptr(r.memory, 0x714ae8), virtualAddress = ptr(r.memory, ptr(r.memory, thisAddress) + offset);
  if (typeof r.services?.rendererCall === 'function') return r.services.rendererCall({thisAddress, virtualAddress, offset, arguments: args}, r);
  if (offset === 0x78 && virtualAddress === 0x5208d0) {obtainRendererTextureIndex(thisAddress,args[0],r); return args[0];}
  if (offset === 0x88 && virtualAddress === 0x520940) return uploadRendererTexture(thisAddress,...args,r);
  throw Error(`Unrecovered game renderer virtual+${offset.toString(16)} target0x${virtualAddress.toString(16)}.`);
};
const powerOfTwo = value => {for (let bit = 0; bit < 32; bit++) {const bound = 1 << bit; if (value <= bound) return bound;} return 0;};

//408680 plus its separate Listing epilogue408c23. Established renderer
//targets use actual pool/upload algorithms by default; scoped probes may
//override the virtual interface. Device operations remain explicit services.
export function constructGameTexture(index, width, height, depth, pixels, palette, flags, runtime) {
  const {memory: m, scratchBase} = runtime, bp = scratchBase - 4, frame = scratchBase - 0x878, list = bp - 0x858;
  [height, depth, pixels, palette, flags].forEach((v, i) => put(m, scratchBase + 4 + i * 4, v)); put(m, bp - 0x83c, width); put(m, bp - 0x85c, index); put(m, bp - 0x860, index); put(m, bp - 0x82c, height);
  //The provider excludes408c84 from both procedure bodies; its retained
  //Listing decode is MOV EAX,1 followed by the shared epilogue408c89.
  if (!width || !height) return 1;
  let texture = get(m, 0x6e1620 + index * 4); m[bp - 0x81d] = 0;
  if (texture === -1) {const out = bp - 0x834, address = renderer({...runtime, scratchBase: frame - 12}, 0x78, [out, 0]) >>> 0; texture = get(m, address); put(m, 0x6e1620 + index * 4, texture);}
  if (flags & 2) {palette = 0; put(m, scratchBase + 16, 0);}
  const descriptor = ptr(m, ptr(m, 0x714ae8) + 0x444), bytes = get(m, descriptor + 32), paddedWidth = powerOfTwo(width), paddedHeight = powerOfTwo(height);
  put(m, bp - 0x828, descriptor); put(m, bp - 0x848, bytes); put(m, bp - 0x824, paddedWidth); put(m, bp - 0x830, paddedHeight);
  [0, 4, 8].forEach(o => put(m, list + o, 0)); const image = constructGamePixelImage(list, {...runtime, scratchBase: frame - 4});
  const deviceMasks = () => [12, 16, 20, 24].map(o => get(m, descriptor + o));
  const allocationRegisters = {EBX: width, EBP: bp, ESI: texture, EDI: image};
  if (!pixels) allocateGamePixelImage(image, 0, get(m, descriptor + 28), paddedWidth, paddedHeight, ...deviceMasks(), 1, {...runtime, scratchBase: frame - 40, entryRegisters: allocationRegisters});
  else if (!palette || depth !== 8) {
    allocateGamePixelImage(image, 0, 32, paddedWidth, paddedHeight, 0xff0000, 0xff00, 255, -16777216, 1, {...runtime, scratchBase: frame - 40, entryRegisters: allocationRegisters});
    put(m, bp - 0x840, get(m, image + 4)); if (height > 0) {put(m, bp - 0x848, height); put(m, bp - 0x84c, width * 4); put(m, bp - 0x834, paddedWidth * 4);
      for (let y = 0; y < height; y++) {let input = ptr(m, scratchBase + 12), output = ptr(m, bp - 0x840); if (width > 0) {put(m, bp - 0x844, width); for (let x = 0; x < width; x++) {put(m, bp - 0x844, get(m, bp - 0x844) - 1); const word = get(m, input); input += 4; put(m, output, word); output += 4;}}
        put(m, bp - 0x840, get(m, bp - 0x840) + get(m, bp - 0x834)); put(m, scratchBase + 12, get(m, scratchBase + 12) + get(m, bp - 0x84c)); put(m, bp - 0x848, get(m, bp - 0x848) - 1);
      }
    }
    convertGamePixelImage(image, 2, 0, get(m, descriptor + 28), ...deviceMasks(), {...runtime, scratchBase: frame - 32, sehWord: bp - 12, entryRegisters: {EBX: width, EBP: bp, ESI: texture, EDI: image}});
  } else {
    allocateGamePixelImage(image, 0, get(m, descriptor + 28), paddedWidth, paddedHeight, ...deviceMasks(), 1, {...runtime, scratchBase: frame - 40, entryRegisters: allocationRegisters});
    const rgba = bp - 0x41c, packed = bp - 0x81c; m.fill(0, rgba, rgba + 1024);
    for (let i = 0; i < 256; i++) {m[rgba + i * 4] = m[palette + i * 4 + 2]; m[rgba + i * 4 + 1] = m[palette + i * 4 + 1]; m[rgba + i * 4 + 2] = m[palette + i * 4];}
    packDevicePalette32(rgba, 256, packed, flags, {...runtime, scratchBase: frame - 12});
    if (height > 0) {put(m, bp - 0x828, 0); put(m, bp - 0x840, 0); put(m, bp - 0x834, paddedWidth * 2); put(m, bp - 0x844, height); put(m, bp - 0x84c, paddedWidth * 4);
      for (let y = 0; y < height; y++) {const input = ptr(m, scratchBase + 12); if (bytes === 2) for (let x = 0; x < width; x++) m.writeUInt16LE(m.readUInt16LE(packed + m[input + x] * 4), ptr(m, image + 4) + get(m, bp - 0x828) + x * 2); else if (bytes === 4) for (let x = 0; x < width; x++) put(m, ptr(m, image + 4) + get(m, bp - 0x840) + x * 4, get(m, packed + m[input + x] * 4));
        put(m, scratchBase + 12, input + width); put(m, bp - 0x840, get(m, bp - 0x840) + get(m, bp - 0x84c)); put(m, bp - 0x828, get(m, bp - 0x828) + get(m, bp - 0x834)); put(m, bp - 0x844, get(m, bp - 0x844) - 1);
      }
    }
  }
  if (width < paddedWidth) for (let y = 0; y < height; y++) {put(m, bp - 0x828, y); for (let x = width; x < paddedWidth; x++) {const b = get(m, image + 0x44) >> 3, row = Math.imul(get(m, image + 8), y); readGameImageRgba(image, bp - 0x834, ptr(m, image + 4) + Math.imul(row + get(m, bp - 0x83c) - 1, b), {...runtime, scratchBase: frame - 12}); writeGameImageRgba(image, ptr(m, image + 4) + Math.imul(row + x, b), get(m, bp - 0x834), {...runtime, scratchBase: frame - 12});}}
  if (height < paddedHeight) for (let x = 0; x < paddedWidth; x++) {put(m, bp - 0x83c, x); for (let y = height; y < paddedHeight; y++) {const b = get(m, image + 0x44) >> 3, w = get(m, image + 8); readGameImageRgba(image, bp - 0x834, ptr(m, image + 4) + Math.imul(Math.imul(height - 1, w) + x, b), {...runtime, scratchBase: frame - 12}); writeGameImageRgba(image, ptr(m, image + 4) + Math.imul(Math.imul(w, y) + get(m, bp - 0x83c), b), get(m, bp - 0x834), {...runtime, scratchBase: frame - 12});}}
  const settingsRegisters = {EBX: height < paddedHeight ? paddedHeight : width, EBP: bp, ESI: texture, EDI: image};
  const settings = getGameGraphicsSettings({...runtime, scratchBase: frame - 4, entryRegisters: settingsRegisters}); if (m[settings + 0x62] === 1) buildGameImageMipmaps(list, 4, 1, {...runtime, scratchBase: frame - 12, entryRegisters: settingsRegisters, sehWord: bp - 12});
  //408bce: the renderer adapter receives these actual preserved registers;
  //its PUSH EDI can later be published by image-list cleanup.
  m[bp - 0x835] = 0; const uploaded = renderer({...runtime, scratchBase: frame - 28, entryRegisters: settingsRegisters}, 0x88, [texture, list, 0, 0, flags >>> 3 & 1, bp - 0x835]) & 255, result = uploaded === 1 ? 1 : 0; m[bp - 0x81d] = result;
  releaseGameImageList(list, {...runtime, scratchBase: frame - 4}); releaseGameImageList(list, {...runtime, scratchBase: frame - 4}); if (ptr(m, list)) crt(runtime, 'operatorDelete', [ptr(m, list)]);
  let bit = 0; while (bit < 10 && !((paddedWidth >> bit) & 1)) bit++; put(m, 0x6f3a00 + index * 4, get(m, 0x6e64d0 + bit * 4)); bit = 0; while (bit < 10 && !((paddedHeight >> bit) & 1)) bit++; put(m, 0x6f4680 + index * 4, get(m, 0x6e64d0 + bit * 4)); put(m, 0x91ce98, Math.max(get(m, 0x91ce98), index)); return result;
}
