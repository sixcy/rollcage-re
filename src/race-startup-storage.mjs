import {nativeGlobalAddress} from './native-global-address.mjs';
import {scaleWormholeColor} from './wormhole-visuals.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

function cleared(size, runtime) {
  const service = runtime.allocate ?? runtime.handlers?.allocate;
  if (typeof service !== 'function') throw Error('Race storage requires CRT allocate service.');
  const result = service(size, runtime), address = typeof result === 'number' ? result : result?.eax;
  if (!Number.isInteger(address)) throw Error('Race storage allocation requires explicit EAX pointer.');
  if (address) runtime.memory.fill(0, address >>> 0, (address >>> 0) + size);
  return address >>> 0;
}

//42a600. Test each old marker before clearing its48-byte input block. The
//two latched DWORDs are set on80h only; other old latch values stay untouched.
export function initializeRaceInputLatches({memory: m}) {
  const first = m[0x91e6c1] === 0x80; put(m, 0x91e6f0, 0);
  m.fill(0, 0x91e6d0, 0x91e6f0); m.fill(0, 0x91e6c0, 0x91e6d0);
  if (first) put(m, 0x91e734, 1);
  put(m, 0x91e730, 0); const second = m[0x91e701] === 0x80;
  m.fill(0, 0x91e710, 0x91e730); m.fill(0, 0x91e700, 0x91e710);
  if (second) put(m, 0x91e6f4, 1); return 0;
}

//495320.256 records, each containing four132-byte renderer primitives.
//The native ECX loop counter is published only after reaching zero.
export function initializeRaceQuadStorage(runtime) {
  const {memory: m} = runtime, base = cleared(0x21000, runtime); put(m, nativeGlobalAddress(m, 0x80def0), base);
  for (let i = 0; i < 256; i++) for (let j = 0; j < 4; j++) {
    const p = base + i * 0x210 + j * 132; m[p + 3] = 12; m[p + 7] = 0x8e;
  }
  put(m, nativeGlobalAddress(m, 0x80def4), 0); put(m, nativeGlobalAddress(m, 0x80def8), 0);
}

//43f130.64 groups of four104-byte primitives; clear the eight WORD flags,
//not the surrounding renderer/owner records.
export function initializeRacePolygonStorage(runtime) {
  const {memory: m} = runtime, base = cleared(0x6800, runtime); put(m, 0x6fbadc, base);
  for (let i = 0; i < 8; i++) word(m, 0x911aee + i * 24, 0);
  put(m, 0x911adc, 0);
  for (let i = 0; i < 64; i++) {
    const p = base + i * 0x1a0;
    for (let j = 0; j < 4; j++) put(m, p + j * 104 + 4, 0);
    for (let j = 0; j < 4; j++) {m[p + j * 104 + 3] = 12; m[p + j * 104 + 7] = 0xaa;}
  }
}

//494060. Two trail banks per body. Capture the session root once, reload the
//body for each bank, and keep the live captured-session count at loop end.
export function initializeVehicleTrailStorage({memory: m}) {
  const session = ptr(m, 0x5ecb1c);
  for (let i = 0; i < m[session + 0x54d]; i++) for (let offset = 0; offset < 0xda8; offset += 0x6d4) {
    const body = ptr(m, 0x909300 + i * 0x30c);
    put(m, body + offset + 0x2f54, 0); put(m, body + offset + 0x2f4c, 0); put(m, body + offset + 0x2f50, 0);
    for (let row = 0; row < 2; row++) for (let j = 0; j < 6; j++) {
      const p = body + offset + 0x307b + row * 0x318 + j * 132;
      m[p - 0x88] = 12; m[p - 0x84] = 0x8e;
    }
  }
}

//42a670. Modes0..7 become controller mode10;8..255 remain their raw byte.
//The authored mode is read AFTER both128-bit clears, preserving aliases.
export function initializeVehicleExecutionModes({memory: m}) {
  const session = ptr(m, 0x5ecb1c);
  for (let i = 0; i < m[session + 0x54d]; i++) {
    const body = ptr(m, 0x909300 + i * 0x30c); m.fill(0, body + 0x708, body + 0x728); m[body + 0x720] = 16;
    const mode = m[session + i];
    if (mode < 8) m[body + 0x718] = 10;
    else {m[body + 0x718] = mode; put(m, body + 0x724, 0);}
  }
  return 0;
}

//47f8c0. Two120-byte transition/display primitives. Preserve all gaps.
export function initializeRacePhasePresentation({memory: m}) {
  put(m, 0x712fc4, -1); put(m, 0x71303c, -1); m[0x712fc3] = 12;
  for (const p of [0x713020, 0x713004, 0x712fe8, 0x712fcc]) put(m, p, 0x41300000);
  for (const p of [0x71301c, 0x713000, 0x712fe4, 0x712fc8]) put(m, p, 64);
  m[0x712fc7] = 0x9a; m[0x71303b] = 12;
  for (const p of [0x713098, 0x71307c, 0x713060, 0x713044]) put(m, p, 0x41300000);
  for (const p of [0x713094, 0x713078, 0x71305c, 0x713040]) put(m, p, 64);
  m[0x71303f] = 0x9a; put(m, 0x712fbc, 99999); put(m, 0x7130b0, 3);
}

//43f870. Four independent16-pair strips and17 associated state rows each.
//Capture the auxiliary root once per strip; material banks remain live.
export function initializeRacePairedStripStorage(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24;
  const base = cleared(0x3c00, runtime); put(m, 0x6fbad8, base);
  const states = cleared(0x440, runtime); put(m, 0x6fbad4, states);
  put(m, frame + 16, 0x911ba4); put(m, frame + 20, 4);
  let primitive = base, state = states;
  do {
    const owner = ptr(m, frame + 16); put(m, owner, 0xff0000); put(m, owner - 4, 0);
    const auxiliary = ptr(m, 0x90b990);
    for (let i = 0; i < 16; i++) {
      m[primitive + 7] = 0x98; m[primitive + 3] = 12;
      let material = ptr(m, 0x90b988) + (m.readUInt16LE(auxiliary + 0x2e) + 0x14 + (i & 1)) * 16;
      put(m, primitive + 0x20, m.readInt32LE(material)); put(m, primitive + 0x3c, m.readInt32LE(material + 4));
      word(m, primitive + 0x58, m.readUInt16LE(material + 8)); const fourth = m.readUInt16LE(material + 10), firstX = m[primitive + 0x3c];
      word(m, primitive + 0x74, fourth); const secondX = m[primitive + 0x58]; m[primitive + 0x58] = firstX;
      const firstY = m[primitive + 0x3d]; m[primitive + 0x3c] = secondX; const secondY = m[primitive + 0x59]; m[primitive + 0x59] = firstY; m[primitive + 0x3d] = secondY;
      m[primitive + 0x7f] = 0x98; put(m, primitive + 4, 0x9a7f7f7f); m[primitive + 0x7b] = 12;
      material = ptr(m, 0x90b988) + (m.readUInt16LE(auxiliary + 0x2e) + 0x14 + (i & 1)) * 16;
      put(m, primitive + 0x98, m.readInt32LE(material)); put(m, primitive + 0xb4, m.readInt32LE(material + 4));
      word(m, primitive + 0xd0, m.readUInt16LE(material + 8)); const last = m.readUInt16LE(material + 10), oldX = m[primitive + 0xb4];
      word(m, primitive + 0xec, last); const newX = m[primitive + 0xd0]; m[primitive + 0xb4] = newX;
      const newY = m[primitive + 0xd1]; m[primitive + 0xd0] = oldX; const oldY = m[primitive + 0xb5]; m[primitive + 0xb5] = newY; m[primitive + 0xd1] = oldY;
      put(m, primitive + 0x7c, 0x9a7f7f7f); primitive += 240;
      put(m, state, 0); word(m, state + 4, 0); put(m, state + 8, 0); word(m, state + 12, 0); state += 16;
    }
    put(m, state, 0); word(m, state + 4, 0); put(m, state + 8, 0); word(m, state + 12, 0); state += 16;
    put(m, frame + 20, m.readInt32LE(frame + 20) - 1); put(m, frame + 16, owner + 24);
  } while (m.readInt32LE(frame + 20));
}

//412bb0. Four material quadrants per source tile use ordered byte averages,
//not an interpolator that might reread aliased bytes in a different order.
export function initializeRaceRadialStorage(runtime) {
  const {memory: m} = runtime, quads = cleared(0x1e00, runtime); put(m, 0x6f970c, quads);
  const rings = cleared(0xc00, runtime), auxiliary = ptr(m, 0x90b990);
  put(m, 0x6f9704, quads + 0x1e00); put(m, 0x6f96f8, rings); put(m, 0x6f2d3c, rings + 0xc00);
  const materialIndex = m.readUInt16LE(auxiliary + 0x2e); put(m, 0x6f96e0, quads); put(m, 0x6f9700, rings);
  for (let i = 0; i < 64; i++) {const p = quads + i * 120; word(m, p + 3, 0xff0c); word(m, p + 6, 0x98ff); m[p + 5] = 255;}
  const materialBase = ptr(m, 0x90b988) + materialIndex * 16 + 11;
  for (let i = 0; i < 16; i++) {
    const p = quads + 0x149 + i * 480, material = materialBase + i * 16;
    const average = (target, a, b) => {m[p + target] = (m[material + a] + m[material + b]) >> 1;};
    const copyWord = (target, source) => word(m, p + target, m.readUInt16LE(material + source));
    put(m, p - 0x129, m.readInt32LE(material - 11));
    for (const [o, a, b] of [[-0x10d, -11, -7], [-0x10c, -10, -6], [-0xf1, -11, -3], [-0xf0, -10, -2], [-0xd5, -11, -1], [-0xd4, -10, 0]]) average(o, a, b);
    copyWord(-0x10b, -5); average(-0x39, -11, -7); average(-0x38, -10, -6); put(m, p - 0x1d, m.readInt32LE(material - 7));
    for (const [o, a, b] of [[-1, -11, -1], [0, -10, 0], [0x1b, -7, -1], [0x1c, -6, 0]]) average(o, a, b);
    copyWord(-0x37, -9);
    for (const [o, a, b] of [[-0xb1, -3, -11], [-0xb0, -2, -10], [-0x95, -11, -1], [-0x94, -10, 0]]) average(o, a, b);
    copyWord(-0x79, -3); average(-0x5d, -3, -1); average(-0x5c, -2, 0); copyWord(-0x93, -5); copyWord(-0xaf, -9);
    for (const [o, a, b] of [[0x3f, -11, -1], [0x40, -10, 0], [0x5b, -7, -1], [0x5c, -6, 0], [0x77, -3, -1], [0x78, -2, 0]]) average(o, a, b);
    copyWord(0x93, -1); copyWord(0x5d, -5); copyWord(0x41, -9);
  }
  const liveAuxiliary = ptr(m, 0x90b990);
  for (let i = 0; i < 32; i++) {const p = rings + i * 96; word(m, p + 3, 0xff0c); word(m, p + 6, 0x94ff); m[p + 5] = 255;}
  const coordinates = ptr(m, 0x920b30); word(m, 0x6f96e4, 65535); m[0x6f96e6] = 255;
  for (let i = 0; i < 32; i++) for (const offset of [0, 4, 2, 6]) word(m, coordinates + i * 8 + offset, m.readUInt16LE(coordinates + i * 8 + offset) * 2);
  const material = ptr(m, 0x90b988) + (m.readUInt16LE(liveAuxiliary + 0x2e) + 0xa2) * 16;
  let first = 0, second = 8;
  for (let i = 0; i < 32; i++) {
    const p = rings + 32 + i * 96; word(m, p + 30, m.readUInt16LE(material + 6)); word(m, p, 0x8080);
    const firstY = (Math.imul(m.readInt16LE(0x5ed0b0 + first * 2), 254) >> 15) - 128;
    const firstX = (Math.imul(m.readInt16LE(0x5ed030 + first * 2), 254) >> 15) - 128;
    m[p + 29] = firstY & 255; m[p + 28] = firstX & 255;
    const secondY = (Math.imul(m.readInt16LE(0x5ed0b0 + second * 2), 254) >> 15) - 128;
    const secondX = (Math.imul(m.readInt16LE(0x5ed030 + second * 2), 254) >> 15) - 128;
    first = second; second = (second + 8) & 255; m[p + 57] = secondY & 255; m[p + 56] = secondX & 255;
  }
}

//497790. Apply the selected environmental tint to1024 palette entries,
//existing effect colors and both viewport backgrounds. Counts/pointers are
//loaded at their original phase; overlapping banks are tinted repeatedly.
export function applyRaceLightingTint({memory: m}) {
  const session = ptr(m, 0x5ecb1c), auxiliary = ptr(m, 0x90b990), mode = m[session + 0x553], palette = ptr(m, auxiliary + 0x4c);
  if (!mode) return;
  const scales = mode === 1 ? [128, 128, 144] : [192, 96, 192];
  const tint = p => {for (let i = 0; i < 3; i++) m[p + i] = Math.imul(m[p + i], scales[i]) >> 8;};
  const rows = (p, count, stride) => {if (!count) return; do {tint(p); p = (p + stride) >>> 0; count = (count - 1) | 0;} while (count);};
  rows(palette, 1024, 4); rows(ptr(m, 0x6f96e0) + 4, 64, 120);
  let count = m.readInt32LE(0x920b24); if (count) rows(ptr(m, 0x6f96f4) + 4, count, 120);
  count = m.readInt32LE(0x920b20); if (count) rows(ptr(m, 0x6f96f0) + 4, count, 120);
  rows(ptr(m, 0x6f96f8) + 4, 32, 96); tint(auxiliary + 0x30);
  for (let i = 0; i < 3; i++) {const color = m[auxiliary + 0x30 + i] * 2 & 255; m[0x91d5b9 + i] = color; m[0x91de29 + i] = color;}
  tint(0x6f96e4);
  const red = m[auxiliary + 0x30] * 2 & 255, green = m[auxiliary + 0x31] * 2 & 255, blue = m[auxiliary + 0x32] * 2 & 255;
  put(m, nativeGlobalAddress(m, 0x91ce1c), red << 16 | green << 8 | blue);
}

//483a00.150 or300 paired primitive records, selected by the exact quality
//byte2. Material fields remain live after each native output write.
export function initializeRaceContactPrimitiveStorage(runtime) {
  const {memory: m, scratchBase} = runtime;
  const material = ptr(m, 0x90b988) + (m.readUInt16LE(ptr(m, 0x90b990) + 0x2e) + 0x8f) * 16;
  scaleWormholeColor(0x8ea0a0a0, 0, 0x713188, scratchBase - 1, runtime);
  scaleWormholeColor(0x8ea0a0a0, 255, 0x71318c, scratchBase - 1, runtime);
  const count = m[ptr(m, 0x5ecefc) + 0x2c] === 2 ? 300 : 150, size = count * 0x124;
  put(m, 0x5ecb24, count); const base = cleared(size, runtime);
  put(m, 0x8495d4, base); put(m, 0x8495d0, base); put(m, 0x8495d8, base + size);
  for (let i = 0; i < count; i++) {
    const p = base + i * 0x124 + 0x5c;
    put(m, p - 0x54, m.readInt32LE(p - 0x54) & 0xffff7fff);
    put(m, p - 32, m.readInt32LE(material)); put(m, p, m.readInt32LE(material + 4)); word(m, p + 32, m.readUInt16LE(material + 8));
    const fourth = m.readUInt16LE(material + 10); word(m, p + 2, m.readUInt16LE(p + 2) | 128);
    put(m, p - 60, 0xa0a0a0a0); word(m, p + 64, fourth);
    for (const offset of [-28, 4, 36]) put(m, p + offset, 0xa0a0a0a0);
    m[p - 61] = 12; m[p - 57] = 0x8c;
    put(m, p + 100, m.readInt32LE(material)); put(m, p + 132, m.readInt32LE(material + 4)); word(m, p + 164, m.readUInt16LE(material + 8)); word(m, p + 196, m.readUInt16LE(material + 10));
    for (const offset of [72, 104, 136, 168]) put(m, p + offset, 0xa0a0a0a0);
    word(m, p + 0x86, m.readUInt16LE(p + 0x86) | 128); m[p + 71] = 12; m[p + 75] = 0x8c;
  }
}
