const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const bitsBuffer = new DataView(new ArrayBuffer(4));
const floatBits = value => {bitsBuffer.setFloat32(0, value, true); return bitsBuffer.getInt32(0, true);};

//4c1830 and4c1eb0. Channel masks retain native x86 shift semantics, including
//noncontiguous masks and widths exceeding a byte.
export function defaultGameImageMasks(red, green, blue, alpha, bitDepth, type, {memory: m}) {
  const values = type === 1 ? [0, 1, 2, 3] : bitDepth === 16 ? [0x7c00, 0x3e0, 31, 0x8000] : bitDepth === 24 ? [0xff0000, 0xff00, 255, 0] : bitDepth === 32 ? [0xff0000, 0xff00, 255, 0xff000000] : [0, 0, 0, 0];
  for (const [index, address] of [red, green, blue, alpha].entries()) if (get(m, address) === -1) put(m, address, values[index]);
}
export function analyzeGameImageMasks(image, {memory: m, scratchBase, entryRegisters}) {
  if (entryRegisters?.ESI !== undefined) put(m, scratchBase - 4, entryRegisters.ESI);
  for (let channel = 0; channel < 4; channel++) {let value = ptr(m, image + 0x14 + channel * 4), shift = 0, missing = 8; put(m, image + 0x24 + channel * 4, 0); if (value) {while (!(value & 1)) {shift++; value >>>= 1; put(m, image + 0x24 + channel * 4, shift);} let count = 0; while (value & 1) {count++; value >>>= 1;} missing -= count;} put(m, image + 0x34 + channel * 4, missing);}
}
export function setGameImageMasks(image, red, green, blue, alpha, runtime) {
  const {memory: m, scratchBase} = runtime, type = get(m, image + 0x10); [red, green, blue, alpha].forEach((v, i) => put(m, scratchBase + 4 + i * 4, v));
  if (runtime.entryRegisters) for (const [register, offset] of [['EBX', -4], ['ESI', -8], ['EDI', -12]]) if (runtime.entryRegisters[register] !== undefined) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  if (type === 1 || type === 0) {put(m, scratchBase - 40, type === 1 ? 0x4c1fbb : 0x4c203e); put(m, scratchBase - 44, image); if (type === 1) put(m, scratchBase - 48, get(m, image + 0x44)); else if (runtime.entryRegisters?.EDI !== undefined) put(m, scratchBase - 48, runtime.entryRegisters.EDI);}
  if (type === 1 || type === 0) {for (let channel = 0; channel < 4; channel++) put(m, scratchBase - 36 + channel * 4, scratchBase + 4 + channel * 4); put(m, scratchBase - 20, get(m, image + 0x44)); put(m, scratchBase - 16, type); defaultGameImageMasks(scratchBase + 4, scratchBase + 8, scratchBase + 12, scratchBase + 16, get(m, image + 0x44), type, runtime);}
  const values = type === 0 || type === 1 ? [4, 8, 12, 16].map(offset => get(m, scratchBase + offset)) : [0, 0, 0, 0];
  if (type === 1) {values.forEach((v, i) => put(m, image + 0x14 + i * 4, v)); m[image + 0x4c] = 1; m[image + 0x48] = values.every((v, i) => v === i) && get(m, image + 0x44) === 128 ? 1 : 0; return;}
  m[image + 0x48] = values.every((v, i) => (v >>> 0) === [0xff0000, 0xff00, 255, 0xff000000][i]) ? 1 : 0; values.forEach((v, i) => put(m, image + 0x14 + i * 4, v)); m[image + 0x4c] = values[3] ? 1 : 0; put(m, scratchBase - 16, 0x4c2094); analyzeGameImageMasks(image, {...runtime, scratchBase: scratchBase - 16, entryRegisters: {ESI: image}});
}

//4c20a0/4c2100. Packed values are1/2/3/4 bytes according to bits>>3.
export function readGameImagePacked(image, pixel, {memory: m}) {switch (get(m, image + 0x44) >> 3) {case 1: return m[pixel]; case 2: return m.readUInt16LE(pixel); case 3: return m.readUIntLE(pixel, 3); case 4: return get(m, pixel); default: return 0;}}
export function writeGameImagePacked(image, pixel, value, {memory: m}) {switch (get(m, image + 0x44) >> 3) {case 1: m[pixel] = value & 255; break; case 2: word(m, pixel, value); break; case 3: word(m, pixel, value); m[pixel + 2] = value >>> 16 & 255; break; case 4: put(m, pixel, value);}}

//4c1150. The original float-bit conversion has distinct behavior for negative,
//NaN and extreme exponents; using Math.trunc/clamp would lose it.
export function packGameImageFloat(output, input, runtime) {
  const {memory: m, scratchBase} = runtime;
  for (const [lane, channel] of [2, 1, 0, 3].entries()) {const scaled = Math.fround(m.readFloatLE(input + lane * 4) * m.readFloatLE(0x5dca48)); m.writeFloatLE(scaled, scratchBase + 4); m.writeFloatLE(scaled, scratchBase - 4); const bits = get(m, scratchBase + 4), sign = bits >> 31, exponent = (bits >> 23 & 255) - 127; let value = (((((bits | 0xff800000) << 8) >>> (31 - exponent & 31)) ^ sign) - sign & ~(exponent >> 31)) - (bits >>> 31) | 0; if (value < 0) value = 0; else if (value > 255) value = 255; m[output + channel] = value;}
  return output;
}

//4c9300 slow conversion, and4c17c0's original static exponent table fast path.
export function gameImageHalfBits(bits) {
  const sign = bits >>> 16 & 0x8000, originalExponent = bits >>> 23 & 255; let exponent = originalExponent - 112, mantissa = bits & 0x7fffff;
  if (exponent <= 0) {if (exponent < -10) return sign; mantissa |= 0x800000; const shift = 14 - exponent; return (((mantissa >> (shift & 31) & 1) - 1 + (1 << (shift - 1 & 31)) + mantissa) >> (shift & 31)) | sign;}
  if (exponent === 143) return sign | 0x7c00 | (mantissa ? (mantissa >> 13 || 1) : 0);
  mantissa += (mantissa >> 13 & 1) + 0xfff; if (mantissa & 0x800000) {mantissa = 0; exponent++;} return exponent > 30 ? sign | 0x7c00 : mantissa >> 13 | exponent << 10 | sign;
}
export function writeGameImageHalf(output, bits, {memory: m, scratchBase}) {
  put(m, scratchBase - 4, bits); const bias = m.readUInt16LE(0x5b8ee8 + (bits >>> 23) * 2); let result;
  if ((bits & 0x7fffffff) === 0) result = bits >>> 16;
  else if (bias) {const fraction = bits & 0x7fffff; result = ((fraction >> 13 & 1) + 0xfff + fraction >> 13) + bias;}
  else {result = gameImageHalfBits(bits); const exponent = (bits >>> 23 & 255) - 112; if (exponent > 0 && exponent !== 143) {let fraction = bits & 0x7fffff, adjusted = exponent; fraction += (fraction >> 13 & 1) + 0xfff; if (fraction & 0x800000) adjusted++; if (adjusted > 30) put(m, scratchBase - 16, 0x7f800000);}}
  word(m, output, result); return output;
}

//4c23b0/4c41d0. This is the native clamped difference and signed-byte metric,
//including its surprising early zero result for a dominating palette entry.
export function findGameImagePaletteIndex(image, rgba, {memory: m, scratchBase}) {
  const frame = scratchBase - 28; let palette = ptr(m, image), best = 1024, selected = 0;
  put(m, frame + 0x18, selected); put(m, frame + 0x14, best);
  for (let index = 0; index < 256; index++, palette += 4) {put(m, frame + 0x10, rgba); const color = ptr(m, palette); for (const channel of [2, 1, 0, 3]) m[frame + 0x10 + channel] = Math.max(0, m[frame + 0x10 + channel] - (color >>> channel * 8 & 255)); const distance = [3, 0, 1, 2].reduce((sum, channel) => sum + Math.abs(m.readInt8(frame + 0x10 + channel)), 0); if (distance < best) {best = distance; selected = index; put(m, frame + 0x14, best); put(m, frame + 0x18, selected); if (!best) break;}}
  return selected;
}

export function readGameImageFloat(image, output, pixel, runtime) {
  const {memory: m, scratchBase} = runtime;
  if (get(m, image + 0x10) !== 1) {const aligned = scratchBase - 4 & ~7, temporary = aligned - 4; readGameImageRgba(image, temporary, pixel, {...runtime, scratchBase: aligned - 28}); const firstGreen = m[temporary + 1]; m.writeFloatLE(Math.fround(m[temporary + 2] * m.readFloatLE(0x5dc618)), output); const firstBlue = m[temporary]; m.writeFloatLE(Math.fround(firstGreen * m.readFloatLE(0x5dc618)), output + 4); const alpha = m[temporary + 3]; m.writeFloatLE(Math.fround(firstBlue * m.readFloatLE(0x5dc618)), output + 8); m.writeFloatLE(Math.fround(alpha * m.readFloatLE(0x5dc618)), output + 12); return output;}
  if (m[image + 0x48]) {for (let lane = 0; lane < 4; lane++) put(m, output + lane * 4, get(m, pixel + lane * 4));}
  else if (get(m, image + 0x44) === 64) {for (let lane = 0; lane < 4; lane++) put(m, output + lane * 4, get(m, 0x578ee8 + m.readUInt16LE(pixel + get(m, image + 0x14 + lane * 4) * 2) * 4));}
  else for (let lane = 0; lane < 4; lane++) put(m, output + lane * 4, get(m, pixel + get(m, image + 0x14 + lane * 4) * 4));
  return output;
}
export function writeGameImageFloat(image, pixel, input, runtime) {
  const {memory: m, scratchBase} = runtime, aligned = scratchBase - 4 & ~7, frame = aligned - 24; put(m, frame + 0x14, image);
  if (get(m, image + 0x10) !== 1) {const temporary = frame - 4; put(m, temporary, image); packGameImageFloat(temporary, input, {...runtime, scratchBase: frame - 12}); writeGameImageRgba(image, pixel, get(m, temporary), {...runtime, scratchBase: frame - 12}); return;}
  if (m[image + 0x48]) {Buffer.from(m.subarray(input, input + 16)).copy(m, pixel); return;}
  if (get(m, image + 0x44) === 64) {for (let lane = 0; lane < 4; lane++) {const target = pixel + get(m, image + 0x14 + lane * 4) * 2; writeGameImageHalf(frame + 0x12, get(m, input + lane * 4), {...runtime, scratchBase: frame - 4}); word(m, target, m.readUInt16LE(frame + 0x12));} return;}
  for (let lane = 0; lane < 4; lane++) put(m, pixel + get(m, image + 0x14 + lane * 4) * 4, get(m, input + lane * 4));
}

//4c2160/4c2270. All compressed-block, palette, byte and float branches remain
//the original game policy; unsupported block writes deliberately do nothing.
export function readGameImageRgba(image, output, pixel, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28, type = get(m, image + 0x10);
  if (type === 1) {readGameImageFloat(image, frame + 8, pixel, {...runtime, scratchBase: frame - 12}); packGameImageFloat(output, frame + 8, {...runtime, scratchBase: frame - 8}); return output;}
  if (type >= 3 && type <= 7) {put(m, output, 0); return output;}
  if (m[image + 0x48]) {put(m, output, get(m, pixel)); return output;}
  const value = readGameImagePacked(image, pixel, runtime); if (type === 2) {put(m, output, get(m, ptr(m, image) + (value >>> 0) * 4)); return output;}
  put(m, scratchBase + 8, 0); for (const [lane, channel] of [2, 1, 0].entries()) m[scratchBase + 8 + channel] = ((value >>> (get(m, image + 0x24 + lane * 4) & 31) & 255) << (get(m, image + 0x34 + lane * 4) & 31)) & 255;
  const alphaShift = ptr(m, image + 0x40); m[scratchBase + 11] = alphaShift >= 8 ? 255 : ((value >>> (get(m, image + 0x30) & 31) & 255) << (alphaShift & 31)) & 255; put(m, output, get(m, scratchBase + 8)); return output;
}
export function writeGameImageRgba(image, pixel, rgba, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28, type = get(m, image + 0x10);
  if (type === 1) {for (let lane = 0; lane < 4; lane++) m.writeFloatLE(Math.fround((rgba >>> [16, 8, 0, 24][lane] & 255) * m.readFloatLE(0x5dc618)), frame + 8 + lane * 4); writeGameImageFloat(image, pixel, frame + 8, {...runtime, scratchBase: frame - 12}); return;}
  if (type >= 3 && type <= 7) return; if (m[image + 0x48]) {put(m, pixel, rgba); return;}
  if (type === 2) {const index = findGameImagePaletteIndex(image, rgba, {...runtime, scratchBase: frame - 8}); writeGameImagePacked(image, pixel, index, runtime); return;}
  let value = 0; for (let lane = 0; lane < 4; lane++) value |= ((rgba >>> [16, 8, 0, 24][lane] & 255) >>> (get(m, image + 0x34 + lane * 4) & 31)) << (get(m, image + 0x24 + lane * 4) & 31);
  //4c2393/4c2394 PUSH value,pixel and4c2398 CALL4c2100. Later4c1af0
  //cleanup copies these real private words into its cleared image descriptor.
  if (Number.isInteger(scratchBase)) {put(m, frame - 4, value); put(m, frame - 8, pixel); put(m, frame - 12, 0x4c239d);}
  writeGameImagePacked(image, pixel, value, {...runtime, scratchBase: Number.isInteger(scratchBase) ? frame - 12 : scratchBase});
}
