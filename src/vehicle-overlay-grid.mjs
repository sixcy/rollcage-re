import {nativeGlobalAddress} from './native-global-address.mjs';
import {initializeBodyRetirementEffectTables} from './body-retirement-effects.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
const blockAt = (m, index) => nativeGlobalAddress(m, 0x82eda0) + Math.imul(index, 0x4208) >>> 0;
const speedAmount = (m, body) => Math.trunc(((get(m, body + 0x664) - 0x3a0000 | 0) << 8) / 0x190000);

export function initializeVehicleOverlayTables(memory) {return initializeBodyRetirementEffectTables(memory);}

//487790. Nine texture phases feed an8x16 grid of four packed UV dwords.
//Only the first two source dwords retain their material high words. The last
//two start as zero-extended WORDs; the geometry/primitive gaps stay unchanged.
export function updateVehicleOverlayGrid(index, {memory: m}) {
  const block = blockAt(m, index);
  if (m[0x90a548] & 1) {const next = get(m, block + 0x4200) + 1 | 0; put(m, block + 0x4200, next >= 9 ? 0 : next);}
  const material = ptr(m, 0x90b988) + ((m.readUInt16LE(ptr(m, 0x90b990) + 0x2e) + 0x86 + get(m, block + 0x4200)) << 4) >>> 0;
  const first = ptr(m, material), second = ptr(m, material + 4), third = m.readUInt16LE(material + 8), fourth = m.readUInt16LE(material + 10);
  const startX = first & 255, endX = second & 255, startY = first >>> 8 & 255;
  const stepX = (endX - startX) << 16, stepY = ((third >>> 8) - startY) << 16;
  let y = 0, nextY = stepY;
  for (let row = 0; row < 8; row++) {
    const upper = ((y >>> 19) + startY & 255) << 8, lower = ((nextY >>> 19) + startY & 255) << 8;
    let x = 0, nextX = stepX;
    for (let column = 0; column < 16; column++) {
      let left = (x >>> 19) + startX, right = (nextX >>> 19) + startX;
      if (left > endX) left = endX * 2 - left | 0;
      if (right > endX) right = endX * 2 - right | 0;
      const target = block + 0x20 + row * 0x84 + column * 0x420;
      put(m, target, (first & 0xffff0000) | upper | (left & 255)); put(m, target + 0x20, (second & 0xffff0000) | upper | (right & 255));
      put(m, target + 0x40, (third & 0xffff0000) | lower | (left & 255)); put(m, target + 0x60, (fourth & 0xffff0000) | lower | (right & 255));
      x = x + stepX | 0; nextX = nextX + stepX | 0;
    }
    y = y + stepY | 0; nextY = nextY + stepY | 0;
  }
}

//487540. Config+30 enables the stage; record+255 stores a six-slot rank.
//The sixth qualifying record is ranked but returns before its grid update.
export function updateVehicleOverlayGrids(runtime) {
  const {memory: m} = runtime;
  if (!m[ptr(m, 0x5ecefc) + 0x30]) return;
  const session = ptr(m, 0x5ecb1c);
  for (let index = 0; index < m[session + 0x54d]; index++) m[0x909555 + index * 0x30c] = 255;
  let selected = 0;
  for (let index = 0; index < m[session + 0x54d]; index++) {
    const record = 0x909300 + index * 0x30c, body = ptr(m, record), controller = ptr(m, body + 0x6bc);
    if (controller !== 0xffffffff && m[controller]) continue;
    const amount = speedAmount(m, body);
    if (amount >= 160 || (amount > 0 && amount > 1)) {m[record + 0x255] = selected++; if (selected >= 6) return;}
    updateVehicleOverlayGrid(index, runtime);
  }
}

//487410. Initialize six actual grids and their phase/cache dwords. The shared
//16x9 geometry is rewritten on EACH pass, as in the native constructor.
export function initializeVehicleOverlayGrids(runtime) {
  const {memory: m} = runtime;
  for (let index = 0; index < 6; index++) {
    const block = blockAt(m, index); put(m, block + 0x4200, 0); put(m, block + 0x4204, -1); updateVehicleOverlayGrid(index, runtime);
    for (let row = 0; row < 9; row++) {
      const radius = row * 8, height = 80 - Math.trunc((row * 6) ** 2 / 64);
      for (let column = 0; column < 16; column++) {
        const target = nativeGlobalAddress(m, 0x82e920) + row * 8 + column * 0x48;
        word(m, target + 4, height);
        word(m, target, Math.trunc(Math.imul(m.readInt16LE(0x5ed030 + column * 32), radius) / 14000));
        word(m, target + 2, Math.trunc(Math.imul(m.readInt16LE(0x5ed0b0 + column * 32), radius) / 27500));
      }
    }
  }
}

//487620. ECX indexes the live participant body; EDX is caller-owned color
//storage. Geometry heights are shared across participants. RNG is published
//only after the ordered16x9 height/color stores, including overlapping views.
export function updateVehicleOverlayAppearance(index, colorsAddress, {memory: m}) {
  const body = ptr(m, 0x909300 + Math.imul(index, 0x30c));
  if (!m[ptr(m, 0x5ecefc) + 0x30]) return;
  const amount = Math.max(0, Math.min(160, speedAmount(m, body))); let seed = get(m, 0x5ec958);
  for (let row = 0; row < 9; row++) {
    let height = 70 - Math.trunc((row * 6) ** 2 / 64);
    if (row === 8) height -= (amount * 4 >> 8) * 24;
    else if (row === 7) height -= (amount * 4 >> 8) * 4;
    if (row) {seed = Math.imul(seed, 0x41a7) & 0x7fffffff; height += (seed >>> 31) * row;}
    seed = Math.imul(seed, 0x41a7) & 0x7fffffff;
    const color = Math.min(255, Math.imul(255 - Math.floor(row * 192 / 9), (seed >>> 26) + amount) >> 8), square = Math.min(255, Math.imul(color, color) >> 8), packed = (square | 0xff8e0000) << 8 | color;
    for (let column = 0; column < 16; column++) {word(m, nativeGlobalAddress(m, 0x82e924) + row * 8 + column * 0x48, height); put(m, colorsAddress + row * 4 + column * 0x24, packed);}
  }
  put(m, 0x5ec958, seed);
}
