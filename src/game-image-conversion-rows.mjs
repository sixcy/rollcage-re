import {readGameImageRgba, writeGameImageRgba, readGameImageFloat, writeGameImageFloat, packGameImageFloat} from './game-image-format.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), f = Math.fround;

//4bd770. The complete conversion worker, including the native luminance /
//brightness adjustment, forward aliases and the original unsupported modes.
//args contains all nine native DWORD stack parameters, including unused ones.
export function convertGameImageRows(source, args, runtime) {
  if (!Array.isArray(args) || args.length !== 9) throw Error('Image conversion rows require nine native parameters.');
  const {memory: m, scratchBase} = runtime, frame = (scratchBase - 4 & ~7) - 64, width = args[2] | 0, startRow = args[4] | 0, rowCount = args[5] | 0, targetType = args[7] | 0, target = args[8] >>> 0;
  const sourceStride = get(m, source + 0x44) >> 3, targetStride = get(m, target + 0x44) >> 3, sourceType = get(m, source + 0x10); put(m, frame + 0x18, sourceStride); put(m, frame + 0x14, targetStride);
  const child = {...runtime, scratchBase: frame - 12};
  const rgbaPixel = (from, to) => {readGameImageRgba(source, frame + 0x2c, from, child); writeGameImageRgba(target, to, get(m, frame + 0x2c), child);};
  const floatPixel = (from, to) => {readGameImageFloat(source, frame + 0x30, from, child); writeGameImageFloat(target, to, frame + 0x30, child);};
  if (targetType === 0) {
    if (sourceType === 0 || sourceType === 2) {
      put(m, frame + 0x1c, 0);
      for (let row = 0; row < rowCount; row++) {const index = Math.imul(startRow + row | 0, get(m, source + 8)); let from = Math.imul(index, sourceStride) + ptr(m, source + 4), to = Math.imul(index, targetStride) + ptr(m, target + 4); put(m, frame + 0x20, 0);
        for (let column = 0; column < width; column++) {rgbaPixel(from, to); from += sourceStride; to += targetStride; put(m, frame + 0x20, column + 1);} put(m, frame + 0x1c, row + 1);
      }
    } else if (sourceType === 1) {
      const center = m.readFloatLE(source + 0x50), range = m.readFloatLE(source + 0x54), reciprocal = f(m.readFloatLE(0x5dc774) / range), changed = center !== m.readFloatLE(0x5dc6ec) || range !== m.readFloatLE(0x5dc774); m.writeFloatLE(center, frame + 0x24); m.writeFloatLE(reciprocal, frame + 0x28); m[frame + 0x13] = changed ? 1 : 0; put(m, frame + 0x20, 0);
      for (let row = 0; row < rowCount; row++) {const index = Math.imul(startRow + row | 0, get(m, source + 8)); let from = Math.imul(index, sourceStride) + ptr(m, source + 4), to = Math.imul(index, targetStride) + ptr(m, target + 4); put(m, frame + 0x1c, 0); put(m, frame + 0x18, from);
        for (let column = 0; column < width; column++) {
          if (!changed) rgbaPixel(from, to);
          else {
            readGameImageFloat(source, frame + 0x30, from, child); const red = m.readFloatLE(frame + 0x30), green = m.readFloatLE(frame + 0x34), blue = m.readFloatLE(frame + 0x38), luminance = f(f(f(green * m.readFloatLE(0x5dc700)) + f(red * m.readFloatLE(0x5dc6b4))) + f(blue * m.readFloatLE(0x5dc690)));
            let adjusted = f(f(f(luminance - m.readFloatLE(frame + 0x24)) * m.readFloatLE(frame + 0x28)) + m.readFloatLE(0x5dc6ec)); if (adjusted < 0) adjusted = 0;
            if (luminance > m.readFloatLE(0x5d00f8)) {const ratio = f(adjusted / luminance); m.writeFloatLE(f(ratio * red), frame + 0x30); m.writeFloatLE(f(green * ratio), frame + 0x34); m.writeFloatLE(f(blue * ratio), frame + 0x38);} else for (const offset of [0x38, 0x34, 0x30]) m.writeFloatLE(adjusted, frame + offset);
            packGameImageFloat(frame - 4, frame + 0x30, child); writeGameImageRgba(target, to, get(m, frame - 4), child);
          }
          from += sourceStride; to += targetStride; put(m, frame + 0x1c, column + 1); put(m, frame + 0x18, from);
        }
        put(m, frame + 0x20, row + 1);
      }
    }
  } else if (targetType === 1) {
    if (sourceType === 0) {
      put(m, frame + 0x14, 0);
      for (let row = 0; row < rowCount; row++) {const index = Math.imul(startRow + row | 0, get(m, source + 8)); let from = Math.imul(index, sourceStride) + ptr(m, source + 4), to = Math.imul(index, targetStride) + ptr(m, target + 4); put(m, frame + 0x20, 0); put(m, frame + 0x1c, from); put(m, frame + 0x18, to);
        for (let column = 0; column < width; column++) {
          readGameImageRgba(source, frame + 0x2c, from, child); const green = m[frame + 0x2d]; m.writeFloatLE(f(m[frame + 0x2e] * m.readFloatLE(0x5dc618)), frame + 0x30); const blue = m[frame + 0x2c], alpha = m[frame + 0x2f]; m.writeFloatLE(f(green * m.readFloatLE(0x5dc618)), frame + 0x34); m.writeFloatLE(f(blue * m.readFloatLE(0x5dc618)), frame + 0x38); m.writeFloatLE(f(alpha * m.readFloatLE(0x5dc618)), frame + 0x3c); writeGameImageFloat(target, to, frame + 0x30, child);
          from += sourceStride; to += targetStride; put(m, frame + 0x20, column + 1); put(m, frame + 0x1c, from); put(m, frame + 0x18, to);
        }
        put(m, frame + 0x14, row + 1);
      }
    } else if (sourceType === 1) {
      put(m, frame + 0x1c, 0);
      for (let row = 0; row < rowCount; row++) {const index = Math.imul(startRow + row | 0, get(m, source + 8)); let from = Math.imul(index, sourceStride) + ptr(m, source + 4), to = Math.imul(index, targetStride) + ptr(m, target + 4); put(m, frame + 0x20, 0);
        for (let column = 0; column < width; column++) {floatPixel(from, to); from += sourceStride; to += targetStride; put(m, frame + 0x20, column + 1);} put(m, frame + 0x1c, row + 1);
      }
    }
  }
}
