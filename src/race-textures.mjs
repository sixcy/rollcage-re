import {nativeGlobalAddress} from './native-global-address.mjs';
import {loadGameBitmap} from './game-bitmap-images.mjs';
import {constructGameTexture} from './game-texture-construction.mjs';
import {convertVehicleAnimationColor} from './vehicle-animation-lights.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const crt = (runtime, name, args) => {if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Race textures require CRT ${name}.`); return runtime.services.libraryCall(name, args, runtime);};
const encodedMaterial = id => {let value = id << 2; value = value & ~0xff00 | ((value >>> 8 & 255) << 2 & 255) << 8; return value >>> 2;};
const nextId = id => (id = id + 1 | 0) === 63 ? 64 : id;

//40f310. Produce five32-point vertex rings and four32-quad colored strips,
//consumed by40f5d0's UV update and the renderer. Hue0 closes each strip.
export function initializeTimeEffectGeometry(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 52;
  m.fill(0, 0x6f53a0, 0x6f95a0); const id = get(m, 0x5ed024) === -1 ? 63 : get(m, 0x5ed024) & 65535; put(m, frame + 0x18, id);
  let output = 0x6f4ea0;
  for (let ring = 0; ring < 5; ring++) for (let input = 0x5ed0b0; input < 0x5ed2b0; input += 16, output += 8) {word(m, output, m.readInt16LE(input - 0x80) >> 6); word(m, output + 4, ring * 250 + 10); word(m, output + 2, -m.readInt16LE(input) >> 6);}
  put(m, frame + 0x2c, 0); put(m, frame + 0x30, id); output = 0x6f53a0;
  const color = (hue, intensity, first, returnAddress) => {
    const stack = frame - (first ? 20 : 36), argsStart = stack + 4;
    [1023, frame + 0x10, frame + 0x14, frame + 0x18].forEach((value, i) => put(m, argsStart + i * 4, value)); put(m, stack, returnAddress);
    convertVehicleAnimationColor(hue, 1023, 1023, frame + 0x10, frame + 0x14, frame + 0x18, {...runtime, scratchBase: stack});
    const blue = Math.imul(get(m, frame + 0x18), intensity) >>> 8, green = Math.imul(get(m, frame + 0x14), intensity) >>> 8, red = Math.imul(get(m, frame + 0x10), intensity) >>> 8;
    put(m, frame + 0x18, blue); put(m, frame + 0x14, green); put(m, frame + 0x10, red); return ((blue << 8 | green) << 8 | red) << 3;
  };
  for (let ring = 0; ring < 4; ring++) {
    const top = Math.min((4 - ring) * 112 >>> 0, 256), bottom = Math.min((3 - ring) * 112 >>> 0, 256); put(m, frame + 0x28, top); put(m, frame + 0x1c, bottom);
    let previousTop = color(0, top, true, 0x40f3f3); put(m, frame + 0x20, previousTop); let previousBottom = color(0, bottom, false, 0x40f452); put(m, frame + 0x24, previousBottom); put(m, frame + 0x28, 0);
    let hue = 0;
    for (let segment = 0; segment < 32; segment++, output += 132) {
      word(m, output + 0x42, encodedMaterial(get(m, frame + 0x30)) | 0x800); hue = segment === 31 ? 0 : hue + 11;
      const nextTop = color(hue, top, true, 0x40f4d7), nextBottom = color(hue, bottom, false, 0x40f52e);
      put(m, output + 4, previousTop); put(m, output + 36, nextTop); put(m, output + 68, previousBottom); put(m, output + 100, nextBottom); m[output + 3] = 12; m[output + 7] = 0x8e;
      previousTop = nextTop; previousBottom = nextBottom; put(m, frame + 0x20, previousTop); put(m, frame + 0x24, previousBottom); put(m, frame + 0x28, segment + 1);
    }
    put(m, frame + 0x2c, ring + 1);
  }
}

function allocationFailure(kib, runtime) {
  if (typeof runtime.handlers?.allocationFailure4a1fe0 !== 'function') throw Error('Race texture allocation failure reaches game reporter4a1fe0.');
  if (runtime.handlers.allocationFailure4a1fe0(0x5d399c, 26, 0x5d3938, kib, runtime)) throw Error('Native race texture allocation breakpoint.');
}

//409bd0. Tile a source bitmap into256x256 textures. Failure intentionally
//retains native leaked allocations; only the successful exit frees both.
export function constructTiledGameBitmap(pixels, palette, width, height, depth, pitch, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 68; [width, height, depth, pitch].forEach((v, i) => put(m, scratchBase + 4 + i * 4, v));
  const initial = nextId(get(m, nativeGlobalAddress(m, 0x91ce98))); put(m, frame + 0x2c, pixels); put(m, frame + 0x40, initial); put(m, frame + 0x20, initial); if (!pixels) return -1;
  const bytes = get(m, scratchBase + 12) >> 3, allocationBytes = bytes << 16; put(m, frame + 0x1c, bytes); put(m, frame + 0x30, allocationBytes);
  const tile = crt(runtime, 'allocate', [allocationBytes >>> 0]) >>> 0; put(m, frame + 0x14, tile); if (!tile) allocationFailure(allocationBytes >>> 10, runtime);
  const colors = crt(runtime, 'allocate', [1024]) >>> 0; put(m, frame + 0x18, colors); if (!colors) allocationFailure(1, runtime); if (!tile || !colors) return -1;
  if (palette) for (let i = 0; i < 256; i++) {m[colors + i * 4] = m[palette + i * 4]; m[colors + i * 4 + 1] = m[palette + i * 4 + 1]; m[colors + i * 4 + 2] = m[palette + i * 4 + 2]; m[colors + i * 4 + 3] = 0;}
  let remainingRows = get(m, scratchBase + 8), id = initial; put(m, frame + 0x28, remainingRows);
  while (remainingRows > 0) {
    let remainingColumns = get(m, scratchBase + 4); put(m, frame + 0x24, remainingColumns);
    while (remainingColumns > 0) {
      const rows = Math.min(remainingRows, 256), columns = Math.min(remainingColumns, 256), sourceY = Math.imul(get(m, scratchBase + 8) - remainingRows, get(m, scratchBase + 16));
      put(m, frame + 0x34, rows); put(m, frame + 0x3c, sourceY); put(m, frame + 0x38, columns);
      let input = Math.imul(get(m, scratchBase + 4) - remainingColumns, bytes) + sourceY + get(m, frame + 0x2c) | 0, output = tile;
      crt(runtime, 'memset', [tile, 0, allocationBytes >>> 0]);
      if (rows > 0) {const count = Math.imul(bytes, get(m, frame + 0x38)); put(m, frame + 0x38, bytes << 8); for (let y = 0; y < rows; y++) {crt(runtime, 'memcpy', [output, input >>> 0, count >>> 0]); input += get(m, scratchBase + 16); output += get(m, frame + 0x38);}}
      put(m, frame - 24, 0x409d9e);
      if (!constructGameTexture(id, 256, 256, get(m, scratchBase + 12), tile, ptr(m, frame + 0x18), 0, {...runtime, scratchBase: frame - 24, entryRegisters: {EBX: remainingColumns, EBP: id, ESI: tile, EDI: output}})) return -1;
      id = nextId(id); remainingColumns = remainingColumns - 256 | 0; put(m, frame + 0x20, id); put(m, frame + 0x24, remainingColumns);
    }
    remainingRows = remainingRows - 256 | 0; put(m, frame + 0x28, remainingRows);
  }
  crt(runtime, 'free', [tile]); crt(runtime, 'free', [ptr(m, frame + 0x18)]); return get(m, frame + 0x40);
}

//490040. The Icesheet bitmap is tiled by the actual409bd0 parent.
export function initializeRaceIceSheet(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36;
  if (loadGameBitmap(0x5d3604, frame, 1, {...runtime, scratchBase: frame - 8})) {
    const width = m.readInt16LE(frame + 2), height = m.readInt16LE(frame + 6); put(m, 0x6e6cb4, width); put(m, 0x6e6cb8, height);
    put(m, 0x5ed028, constructTiledGameBitmap(ptr(m, frame + 20), ptr(m, frame + 16), width, height, m[frame + 10], m.readInt16LE(frame + 4), {...runtime, scratchBase: frame - 20}));
  }
}

//4900a0. Race timewarp texture/geometry, procedural target and ice-sheet
//initialization. The first texture's return is deliberately ignored.
export function initializeRaceTextures(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 44, descriptor = frame + 8; put(m, 0x6e6cac, 0);
  if (loadGameBitmap(0x5d3614, descriptor, 1, {...runtime, scratchBase: frame - 8})) {
    const id = nextId(get(m, nativeGlobalAddress(m, 0x91ce98))); put(m, 0x5ed024, id);
    constructGameTexture(id, m.readInt16LE(descriptor + 2), m.readInt16LE(descriptor + 6), m[descriptor + 10], ptr(m, descriptor + 20), 0, 0, {...runtime, scratchBase: frame - 24, entryRegisters: {...runtime.entryRegisters, ESI: 64}});
  }
  put(m, frame - 4, 0x490103); initializeTimeEffectGeometry({...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, ESI: 64}});
  const id = nextId(get(m, nativeGlobalAddress(m, 0x91ce98))); put(m, 0x5ed02c, id); put(m, nativeGlobalAddress(m, 0x80e890), encodedMaterial(get(m, 0x5ed02c)));
  if (!constructGameTexture(get(m, 0x5ed02c), 256, 256, 8, 0, 0, 9, {...runtime, scratchBase: frame - 24, entryRegisters: {...runtime.entryRegisters, ESI: 64}})) {put(m, 0x5ed02c, -1); return 0;}
  initializeRaceIceSheet({...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, ESI: 64}}); return 1;
}
