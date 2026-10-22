import {allocateGameImageBytes, openGameResource, findGameResourceHandle, readGameResource, closeGameResource} from './game-resource-files.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p), short = (m, p) => m.readInt16LE(p);
const copy = (m, out, from, size) => Buffer.from(m.subarray(from, from + size)).copy(m, out);
const platform = (runtime, name, args) => {if (typeof runtime.services?.platformCall !== 'function') throw Error(`Bitmap image requires platform service ${name}.`); return runtime.services.platformCall(name, args, runtime);};
const crt = (runtime, name, args) => {if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Bitmap image requires CRT service ${name}.`); return runtime.services.libraryCall(name, args, runtime);};

//414d60. Original native filename conversion includes the terminating byte.
export function makeGameImageWideName(name, runtime) {
  const {memory: m} = runtime; if (!name) return 0; let end = name; while (m[end]) end++; const count = end - name + 1, size = count * 2;
  const wide = crt(runtime, 'operatorNew', [size > 0xffffffff ? 0xffffffff : size]) >>> 0; word(m, wide, 0); platform(runtime, 'MultiByteToWideChar', [0, 0, name, count, wide, count]); return wide;
}

//414bd0. Concrete GDI+ scalar deleting destructor reached by414dc0.
export function deleteGameImageWrapper(object, flags, runtime) {
  const {memory: m} = runtime; put(m, object, 0x5d0400); platform(runtime, 'GdipDisposeImage', [ptr(m, object + 4)]); if (flags & 1) platform(runtime, 'GdipFree', [object]); return object;
}

//414dc0. GDI+ decoding is a true platform boundary; descriptor construction,
//row orientation/stride/copying and temporary ownership are actual game code.
export function loadGamePlatformImage(name, descriptor, flags, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 64, wide = makeGameImageWideName(name, {...runtime, scratchBase: frame - 4});
  put(m, frame + 0x2c, wide); const image = platform(runtime, 'GdipAlloc', [16]) >>> 0; put(m, frame + 0x1c, image);
  if (!image) throw Error('Native GDI+ image allocation has no readable wrapper.');
  put(m, image, 0x5d03f4); put(m, frame + 0x18, 0); put(m, image + 8, platform(runtime, 'GdipCreateBitmapFromFile', [wide, frame + 0x18])); put(m, image + 4, get(m, frame + 0x18));
  put(m, frame + 0x18, 0); m.fill(0, descriptor, descriptor + 36);
  let status = platform(runtime, 'GdipGetImageWidth', [ptr(m, image + 4), frame + 0x18]); if (status) put(m, image + 8, status);
  if (!ptr(m, frame + 0x18)) {deleteGameImageWrapper(image, 1, runtime); crt(runtime, 'operatorDelete', [wide]); return 0;}
  put(m, descriptor + 0x20, flags); put(m, frame + 0x18, 0);
  status = platform(runtime, 'GdipGetImageWidth', [ptr(m, image + 4), frame + 0x18]); if (status) put(m, image + 8, status); word(m, descriptor + 2, m.readUInt16LE(frame + 0x18));
  put(m, frame + 0x18, 0); status = platform(runtime, 'GdipGetImageHeight', [ptr(m, image + 4), frame + 0x18]); if (status) put(m, image + 8, status);
  const pitch = short(m, descriptor + 2) << 2 << 16 >> 16, height = short(m, frame + 0x18), size = Math.imul(pitch, height); word(m, descriptor + 4, pitch); word(m, descriptor + 6, height); m[descriptor + 10] = 32;
  const pixels = allocateGameImageBytes(size, !!(flags & 1), runtime);
  if (pixels) {
    put(m, frame + 0x38, short(m, descriptor + 2)); put(m, descriptor + 0x14, pixels); put(m, frame + 0x30, 0); put(m, frame + 0x34, 0); put(m, frame + 0x3c, short(m, descriptor + 6));
    const data = crt(runtime, 'operatorNew', [24]) >>> 0; put(m, data + 16, get(m, descriptor + 0x14)); put(m, data + 8, short(m, descriptor + 4)); put(m, data, short(m, descriptor + 2)); put(m, data + 4, short(m, descriptor + 6)); put(m, data + 12, 0x26200a);
    status = platform(runtime, 'GdipBitmapLockBits', [ptr(m, image + 4), frame + 0x30, 1, 0x26200a, data]);
    if (!status) {
      const sourcePitch = get(m, data + 8), negative = sourcePitch < 0, absolutePitch = sourcePitch < 0 ? -sourcePitch | 0 : sourcePitch, outputPitch = short(m, descriptor + 4), last = short(m, descriptor + 6) - 1;
      m[frame + 0x17] = negative ? 1 : 0; put(m, frame + 0x24, absolutePitch); put(m, frame + 0x28, last);
      for (let row = 0, offset = 0; (row >>> 0) < ptr(m, data + 4); row++, offset += absolutePitch) {copy(m, ptr(m, descriptor + 0x14) + Math.imul(negative ? last - row : row, outputPitch), ptr(m, data + 16) + offset, outputPitch); put(m, frame + 0x18, offset + absolutePitch);}
      status = platform(runtime, 'GdipBitmapUnlockBits', [ptr(m, image + 4), data]); if (status) put(m, image + 8, status);
    } else put(m, image + 8, status);
    crt(runtime, 'operatorDelete', [data]);
  }
  deleteGameImageWrapper(image, 1, runtime); crt(runtime, 'operatorDelete', [ptr(m, frame + 0x2c)]); return short(m, descriptor + 2) > 0 ? 1 : 0;
}

//4895d0. Original BMP parser and its Redux image-decoder fallback. Neither
//header interpretation nor palette/vertical-row handling is delegated.
export function loadGameBitmap(name, descriptor, flags, runtime) {
  const {memory: m, scratchBase} = runtime, bp = (scratchBase - 12) & ~15, frame = bp - 0x17c;
  put(m, bp - 0x15c, name); put(m, bp - 0x168, descriptor); put(m, bp - 0x158, 0);
  put(m, descriptor + 16, 0); put(m, descriptor + 20, 0); m[descriptor + 11] = 0; put(m, descriptor + 28, 0);
  const handle = openGameResource(name, {...runtime, scratchBase: frame - 4}); put(m, bp - 0x154, handle);
  if (!handle) {
    copy(m, bp - 0x110, 0x5d358c, 16); word(m, bp - 0x100, m.readUInt16LE(0x5d359c)); let end = name; while (m[end]) end++; let out = bp - 0x110; while (m[out]) out++;
    let from = name; const length = end - name + 1; for (let index = 0; index < (length >>> 2); index++, from += 4, out += 4) put(m, out, get(m, from)); for (let index = 0; index < (length & 3); index++) m[out++] = m[from++];
    return loadGamePlatformImage(bp - 0x110, descriptor, flags, {...runtime, scratchBase: frame - 8});
  }
  const id = findGameResourceHandle(handle, runtime), fileHeader = bp - 0x120, info = bp - 0x150;
  if ((id & 65535) < 344) {const cache = 0x90c0a0 + (id << 16 >> 16) * 8, input = ptr(m, cache) + ptr(m, cache + 4); copy(m, fileHeader, input, 8); put(m, fileHeader + 8, get(m, input + 8)); word(m, fileHeader + 12, m.readUInt16LE(input + 12)); put(m, cache + 4, get(m, cache + 4) + 14);}
  else if (!platform(runtime, 'ReadFile', [handle, fileHeader, 14, bp - 0x160, 0])) {closeGameResource(handle, runtime); return 0;}
  if (!readGameResource(handle, info, 40, {...runtime, scratchBase: frame - 8})) {closeGameResource(handle, runtime); return 0;}
  let colors = get(m, info + 32); const bits = m.readUInt16LE(info + 14); if (!colors) colors = 1 << (bits & 31); word(m, descriptor + 8, colors);
  const paletteBytes = Math.fround(Math.fround(bits) * m.readFloatLE(0x5dc694)) <= m.readFloatLE(0x5dc774) ? short(m, descriptor + 8) << 2 : 0;
  word(m, descriptor + 2, m.readUInt16LE(info + 4)); m[descriptor + 10] = bits & 255; word(m, descriptor + 6, m.readUInt16LE(info + 8)); put(m, descriptor + 32, flags);
  const factor = Math.fround(Math.fround(bits) * m.readFloatLE(0x5dc694)), roundedWidth = Math.fround(Math.fround(Math.fround(get(m, info + 4)) * factor) + m.readFloatLE(0x5dc920));
  const rowWidth = (Math.trunc(roundedWidth) & 65535) & 0xfffc; word(m, descriptor + 4, rowWidth); const size = Math.imul(rowWidth << 16 >> 16, get(m, info + 8));
  const allocation = allocateGameImageBytes(size + paletteBytes + 40, !!(flags & 1), runtime);
  if (!allocation) {closeGameResource(handle, runtime); return 0;}
  put(m, descriptor + 12, allocation); for (let offset = 0; offset < 40; offset += 4) put(m, allocation + offset, get(m, info + offset)); let pixels = allocation + 40;
  if (paletteBytes) {put(m, descriptor + 16, pixels); put(m, bp - 0x15c, pixels); if (!readGameResource(handle, pixels, paletteBytes, {...runtime, scratchBase: frame - 8})) {closeGameResource(handle, runtime); return 0;} pixels += paletteBytes;}
  put(m, descriptor + 20, pixels); put(m, bp - 0x15c, pixels);
  if (!readGameResource(handle, pixels, size, {...runtime, scratchBase: frame - 8})) {if (!(flags & 1) && pixels) crt(runtime, 'free', [pixels]); closeGameResource(handle, runtime); return 0;}
  closeGameResource(handle, runtime);
  if (short(m, descriptor + 8) < 257) {
    const palette = allocateGameImageBytes((short(m, descriptor + 8) << 2) + 8, false, runtime);
    if (palette) {word(m, palette, 0x300); word(m, palette + 2, m.readUInt16LE(descriptor + 8)); for (let index = 0; index < short(m, descriptor + 8); index++) {m[palette + 4 + index * 4] = m[ptr(m, descriptor + 16) + index * 4 + 2]; m[palette + 5 + index * 4] = m[ptr(m, descriptor + 16) + index * 4 + 1]; m[palette + 6 + index * 4] = m[ptr(m, descriptor + 16) + index * 4]; m[palette + 7 + index * 4] = 0;} put(m, descriptor + 28, platform(runtime, 'CreatePalette', [palette])); crt(runtime, 'free', [palette]);}
  }
  if (short(m, descriptor + 6) > 0) {
    const pitch = short(m, descriptor + 4); put(m, bp - 0x154, short(m, descriptor + 6)); put(m, bp - 0x158, pitch);
    let top = ptr(m, bp - 0x15c), bottom = top + Math.imul(short(m, descriptor + 6) - 1, pitch);
    for (let remaining = short(m, descriptor + 6); remaining > 1; remaining -= 2, bottom -= pitch * 2) for (let count = pitch >>> 2; count; count--, top += 4, bottom += 4) {const value = get(m, top), other = get(m, bottom); put(m, bottom, value); put(m, top, other);}
  }
  put(m, descriptor + 24, 0); return 1;
}
