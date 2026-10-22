//Staged4428e0 parent. Not a canonical default or a claim of callee closure.
import {queryWeatherViewport} from '../../../src/weather-viewport.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const s16 = value => value << 16 >> 16;
const requireChild = (r, name, request) => {if (typeof r.handlers?.[name] !== 'function') throw Error(`Staged HUD parent requires unported game child ${name}.`); return r.handlers[name](request);};

function selector(index) {
  switch (index) {
    case 0: case 1: return 0x7f;
    case 2: case 3: return 0x71;
    case 4: case 5: case 6: case 7: return 0x7c;
    case 8: case 45: case 46: case 47: return 0x7e;
    case 9: case 10: return 0x7b;
    case 11: return 0x79; case 12: return 0x7a;
    case 48: return 0x81; case 49: case 51: return 0x70; case 50: return 0x82; case 52: return 0x83;
    case 53: case 54: case 55: case 56: case 57: case 58: return 0x97;
    case 59: return 0xa3; case 65: return 0x5b; case 66: return 0x60;
    default: return 0x7d;
  }
}

export function initializeRaceHudLayout(runtime) {
  const {memory: m, scratchBase: S} = runtime, ebp = S - 4, frame = S - 0x144, name = ebp - 0x110, f = Math.fround;
  put(m, ebp - 4, ptr(m, 0x5e8890) ^ ebp);
  const viewport = (width, height) => {
    //Original mutable0 Player literal is rebuilt before each real40ab70 call.
    Buffer.from(m.subarray(0x5d0254, 0x5d025c)).copy(m, name); m[name + 8] = m[0x5d025c]; m.fill(0, name + 9, name + 260);
    queryWeatherViewport(name, ebp - 0x124, ebp - 0x134, width, height, {...runtime, scratchBase: frame - 16});
  };
  viewport(ebp - 0x118, ebp - 0x120); viewport(ebp - 0x120, ebp - 0x114);
  let divisor = get(m, 0x5eb5fc); if (m[ptr(m, 0x5ecb1c) + 0x552]) divisor = 0x226; put(m, 0x5eb5fc, divisor);
  for (let i = 0; i < 67; i++) {word(m, 0x9119b4 + i * 2, selector(i)); m[0x911a3a + i] = 1;}
  const quotient = () => {const denominator = get(m, 0x5eb5fc), numerator = m.readUInt16LE(ptr(m, 0x5ecefc) + 0x42c) << 8; if (!denominator) throw RangeError('Native HUD IDIV by zero.'); const value = Math.trunc(numerator / denominator); if (value < -2147483648 || value > 2147483647) throw RangeError('Native HUD IDIV overflow.'); return value | 0;};
  const scaled = n => Math.imul(quotient(), n) >>> 8, set = (address, value) => {word(m, address, value); return value & 65535;}, u = p => m.readUInt16LE(p);
  const width = get(m, ebp - 0x118), height = get(m, ebp - 0x114);
  const left = set(0x9118a8, scaled(13)), top = set(0x9118aa, height - scaled(38)), right = set(0x9118ac, scaled(40));
  word(m, 0x9118b4, right); word(m, 0x9118b0, left); word(m, 0x9118b2, top); const bottom = set(0x9118ae, height - scaled(38)); word(m, 0x9118b6, bottom);
  word(m, 0x91196c, left - scaled(25)); word(m, 0x91196e, top - scaled(3));
  let firstX = set(0x9118cc, scaled(8)); word(m, 0x9118d0, firstX); let firstY = set(0x9118ce, scaled(8));
  put(m, ebp - 0x124, firstX); put(m, ebp - 0x134, firstY);
  let row0Y = scaled(10) + firstY; put(m, ebp - 0x128, row0Y); word(m, 0x9118d2, row0Y);
  let x = scaled(25) + firstX; word(m, 0x9118b8, x); let y = firstY - scaled(4); word(m, 0x9118ba, y); y &= 65535; word(m, 0x9118be, y);
  x += scaled(8); word(m, 0x9118bc, x); x += scaled(9); word(m, 0x911970, x); word(m, 0x911972, y + scaled(3)); word(m, 0x9118c2, y); x += scaled(13); word(m, 0x9118c0, x); word(m, 0x9118c6, y); word(m, 0x9118c4, x + scaled(8));
  let secondX = set(0x9118d4, width - scaled(78)); put(m, ebp - 0x12c, secondX); word(m, 0x9118d8, secondX);
  let secondY = set(0x9118d6, scaled(8)); put(m, ebp - 0x11c, secondY); let row2Y = scaled(10) + secondY; put(m, ebp - 0x130, row2Y); word(m, 0x9118da, row2Y);
  x = set(0x9118c8, secondX + scaled(34)); y = set(0x9118ca, secondY + scaled(22)); word(m, 0x911978, x + scaled(14)); word(m, 0x91197a, y + scaled(9));
  x = set(0x911a7e, width - scaled(60)); y = set(0x911a80, height - scaled(32)); word(m, 0x911974, x - scaled(22)); word(m, 0x911976, y - scaled(9));
  x = set(0x91195c, x - scaled(14)); y = set(0x91195e, y - scaled(4)); word(m, 0x911962, y); word(m, 0x911960, x + scaled(14)); word(m, 0x911966, y); word(m, 0x911964, x + scaled(28)); word(m, 0x911968, x + scaled(42)); word(m, 0x91196a, y + scaled(14));
  let halfWidth = width >>> 1, halfHeight = height >>> 1; word(m, 0x9119ae, halfHeight); word(m, 0x9119ac, halfWidth - scaled(32));
  const fourthX = halfWidth - scaled(32); word(m, 0x9119b0, fourthX); put(m, ebp - 0x120, fourthX); let fourthY = halfHeight - scaled(68); word(m, 0x9119b2, fourthY); put(m, ebp - 0x114, fourthY);
  if (m[ptr(m, 0x5ecb1c) + 0x552] === 2) {
    word(m, 0x9118d0, firstX); row0Y = scaled(30) + firstY; word(m, 0x9118d2, row0Y); put(m, ebp - 0x128, row0Y);
    secondX = firstX; word(m, 0x9118d4, secondX); word(m, 0x9118d8, secondX); secondY = (row0Y - scaled(10)) & 65535; word(m, 0x9118d6, secondY); put(m, ebp - 0x11c, secondY); row2Y = secondY - scaled(10); word(m, 0x9118da, row2Y); put(m, ebp - 0x130, row2Y);
    x = set(0x9118c8, width - scaled(50)); y = set(0x9118ca, scaled(8)); word(m, 0x911978, x + scaled(14)); word(m, 0x91197a, y + scaled(9));
  }
  for (let row = 0; row < 4; row++) {
    let cursorX, cursorY;
    if (row === 0) {cursorX = scaled(30) + s16(u(0x9118d0)); cursorY = s16(row0Y);}
    else if (row === 1) {cursorX = scaled(30) + s16(secondX); cursorY = s16(secondY);}
    else if (row === 2) {cursorX = scaled(30) + s16(u(0x9118d8)); cursorY = s16(row2Y);}
    else {cursorX = scaled(14) + s16(fourthX); cursorY = (scaled(25) + s16(fourthY)) | 0;}
    for (let digit = 0; digit < 8; digit++) {if (digit) cursorX += scaled([1, 2, 4, 5].includes(digit - 1) ? 5 : 7); cursorX -= 2; word(m, 0x9118dc + row * 32 + digit * 4 + 2, cursorY); word(m, 0x9118dc + row * 32 + digit * 4, cursorX);}
  }
  for (let i = 0; i < 6; i++) {m[0x911a6f + i] = 0; m[0x911a75 + i] = 0;}
  let session = ptr(m, 0x5ecb1c); if (!m[session + 0xa86] && ![3, 8].includes(m[session + 0x551])) {put(m, 0x911a3a, 0); m[0x911a6b] = 0;}
  switch (m[session + 0x551]) {
    case 1: put(m, 0x911a40, 0); m[0x911a6e] = 0; word(m, 0x911a3e, 0); m[0x911a6c] = 0; break;
    case 4: m[0x911a43] = 0; put(m, 0x911a3e, 0); m[0x911a6c] = 0; break;
    case 3: case 8:
      put(m, 0x911a42, 0); m[0x911a6e] = 0; m[0x911a6c] = 0; m[0x911a46] = 0; m.fill(0, 0x911a47, 0x911a67); m[0x911a3f] = 0; word(m, 0x9118c0, scaled(8) + get(m, 0x9118b8)); word(m, 0x9118c2, u(0x9118ba)); m[0x911a41] = 0; break;
  }
  put(m, 0x91d524, 0x91d520 | 0x80000000); put(m, 0x91d520, -1); put(m, 0x91d52c, 0x91d528 | 0x80000000); put(m, 0x91d528, -1); put(m, 0x91d518, 0x91d520);
  const firstMaterial = ptr(m, 0x90b988) + (m.readInt16LE(0x9119b4) + m.readUInt16LE(ptr(m, 0x90b990) + 0x2e)) * 16, packed = m.readUInt16LE(firstMaterial + 2);
  word(m, 0x9118a0, (packed & 63) << 4); word(m, 0x9118a2, packed >> 6); put(m, 0x9118a4, 0x10010); word(m, 0x911880, 0);
  let output = 0x90d9a0;
  for (let i = 0; i < 67; i++) {
    const id = m.readInt16LE(0x9119b4 + i * 2), material = ptr(m, 0x90b988) + (m.readUInt16LE(ptr(m, 0x90b990) + 0x2e) + id) * 16;
    let materialWidth = m[material + 10] - m[material] + 1, materialHeight = m[material + 11] - m[material + 1] + 1;
    if (id === 0x7c || id === 0x7d) materialWidth = 11; else if (id === 0x83) materialWidth = Math.trunc(materialWidth / 4);
    for (let buffer = 0; buffer < 2; buffer++, output += 120) {
      put(m, output + 32, get(m, material)); put(m, output + 60, get(m, material + 4));
      const px = f(m.readInt16LE(0x9118a8 + i * 4)), py = f(m.readInt16LE(0x9118aa + i * 4)); m.writeFloatLE(px, output + 72); m.writeFloatLE(px, output + 16); m.writeFloatLE(py, output + 48); m.writeFloatLE(py, output + 20);
      const special = id === 0x70 || id === 0x71 || id === 0x7f, dx = special ? Math.imul(materialWidth, 200) >>> 9 : materialWidth >> 1, dy = special ? Math.imul(materialHeight, 200) >>> 9 : materialHeight >> 1;
      m.writeFloatLE(f(f(Math.imul(quotient(), dx) >>> 8) + px), output + 44); m.writeFloatLE(f(f(Math.imul(quotient(), dx) >>> 8) + px), output + 100); m.writeFloatLE(f(f(Math.imul(quotient(), dy) >>> 8) + py), output + 76);
      const firstU = m[output + 32], firstV = m[output + 33], lastU = materialWidth - 1 + firstU & 255, lastV = materialHeight - 1 + firstV & 255;
      m[output + 88] = firstU; m[output + 61] = firstV; m[output + 116] = lastU; m[output + 117] = lastV; m[output + 89] = lastV; m[output + 60] = lastU; m.writeFloatLE(f(f(Math.imul(quotient(), dy) >>> 8) + py), output + 104);
      if (i === 49) {m[output + 32] = lastU; m[output + 88] = lastU; m[output + 60] = firstU; m[output + 116] = firstU;}
      for (const offset of [96, 68, 40, 12]) put(m, output + offset, 0x412028f6); for (const offset of [92, 64, 36, 8]) put(m, output + offset, 0x40); m[output + 3] = 12; m[output + 7] = 0x9a;
    }
  }
  session = ptr(m, 0x5ecb1c);
  if (m[session + 0x552]) {
    const material = ptr(m, 0x90b988) + (m.readUInt16LE(ptr(m, 0x90b990) + 0x2e) + 0x85) * 16;
    for (const [record, head, participant] of [[0x911a8c, 0x911a84, 0x1c], [0x911aa8, 0x911aa0, 0x1d]]) {
      m[record + 3] = 4; m[record + 7] = 0x66; put(m, record + 12, get(m, material)); m[record + 12] = m[session + participant] * 6 + m[material] & 255; m[record + 13] = m[material + 1] + (m[session + 0x552] === 2 ? 0 : 6) & 255;
      put(m, record, get(m, head)); put(m, record + 16, 0x60006); put(m, head, record);
    }
  }
  for (const [out, input] of [[0x90dbcc, 0x90db94], [0x90dbe8, 0x90dbb0], [0x90dcbc, 0x90dc84], [0x90dcd8, 0x90dca0]]) put(m, out, get(m, input));
  for (let i = 0; i < 6; i++) {word(m, 0x911ac0 + i * 4, 0); m[0x911ac2 + i * 4] = 0;}
  const registers = requireChild(runtime, 'call445e30', {memory: m, ecx: 0, edx: 0, args: [0], scratchBase: frame - 8}) ?? {};
  requireChild(runtime, 'call48b750', {memory: m, ecx: registers.ecx, edx: registers.edx, args: [], scratchBase: frame - 4});
  if (m[ptr(m, 0x5ecb1c) + 0x552]) {const color = get(m, 0x911a90) & 0xff000000; put(m, 0x911a90, color); put(m, 0x911aac, color);}
}
