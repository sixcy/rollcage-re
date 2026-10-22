import {readGameImageFloat, writeGameImageFloat, readGameImageRgba, writeGameImageRgba} from './game-image-format.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), f = Math.fround;
const div = (a, b) => {if (!b || a === -2147483648 && b === -1) throw RangeError('Native image IDIV fault.'); return Math.trunc(a / b) | 0;};

//4c4f40. Nearest-neighbor, integer box and fractional-area filters. All
//pixel access uses the original format helpers and the caller's shared memory.
export function resampleGameImageRows(unusedThis, args, runtime) {
  const {memory: m, scratchBase} = runtime, frame = (scratchBase - 4 & ~7) - 0xa8;
  const [, , width, height, start, rows, source, target, filter, limit] = args;
  args.forEach((v, i) => m.writeInt32LE(v | 0, scratchBase + 4 + i * 4));
  const sw = get(m, source + 8), sh = get(m, source + 12), sourceBytes = get(m, source + 0x44) >> 3, targetBytes = get(m, target + 0x44) >> 3;
  const readFloat = (p, out = frame + 0x98) => {readGameImageFloat(source, out, p, {...runtime, scratchBase: frame - 12}); return [0, 1, 2, 3].map(i => m.readFloatLE(out + i * 4));};
  const writeFloat = (p, values, out = frame + 0x88) => {values.forEach((v, i) => m.writeFloatLE(v, out + i * 4)); writeGameImageFloat(target, p, out, {...runtime, scratchBase: frame - 12});};
  if (filter === 0) {
    const dx = div(sw << 16, width), dy = div(sh << 16, height); let sy = start > 0 ? Math.imul(dy, start) : 0;
    for (let y = start; y < (start + rows | 0); y++, sy = sy + dy | 0) for (let x = 0, sx = 0; x < width; x++, sx = sx + dx | 0) {
      const input = ptr(m, source + 4) + Math.imul(Math.imul(sw, sy >> 16) + (sx >> 16) | 0, sourceBytes), output = ptr(m, target + 4) + Math.imul(Math.imul(get(m, target + 8), y) + x | 0, targetBytes);
      if (get(m, source + 16) === 1) writeFloat(output, readFloat(input, frame + 0x88));
      else {readGameImageRgba(source, frame + 0x38, input, {...runtime, scratchBase: frame - 12}); writeGameImageRgba(target, output, get(m, frame + 0x38), {...runtime, scratchBase: frame - 12});}
    }
    return;
  }
  if (filter !== 3 && filter !== 4) return;
  if (filter === 4 || sw >= get(m, target + 8) && sh >= get(m, target + 12) && sw % get(m, target + 8) === 0 && sh % get(m, target + 12) === 0) {
    const rx = div(sw, get(m, target + 8)), ry = div(sh, get(m, target + 12)); let countX = rx, countY = ry, stepX = 1, stepY = 1;
    if (limit) {if (countY > limit) do {countY >>= 1; stepY = stepY * 2 | 0;} while (countY > limit); if (countX > limit) do {countX >>= 1; stepX = stepX * 2 | 0;} while (countX > limit);}
    const weight = f(m.readFloatLE(0x5dc774) / f(Math.imul(countX, countY))); let output = ptr(m, target + 4) + Math.imul(Math.imul(get(m, target + 8), start), sourceBytes);
    for (let y = 0; y < rows; y++) {
      let input = ptr(m, source + 4) + Math.imul(Math.imul(Math.imul(start + y, sw), sourceBytes), ry);
      for (let x = 0; x < width; x++) {
        const sum = [0, 0, 0, 0];
        for (let iy = 0; iy < ry; iy += stepY) {
          for (let ix = 0; ix < rx; ix += stepX) {const values = readFloat(input); input += Math.imul(sourceBytes, stepX); for (let i = 0; i < 4; i++) sum[i] = f(i === 0 ? sum[i] + values[i] : values[i] + sum[i]);}
          input += Math.imul(sw - rx + Math.imul(stepY - 1, sw), sourceBytes);
        }
        writeFloat(output, sum.map(v => f(v * weight))); output += sourceBytes; input += Math.imul(rx - Math.imul(sw, ry), sourceBytes);
      }
    }
    return;
  }
  const dx = div(sw << 16, width), dy = div(sh << 16, height), area = f(f(m.readFloatLE(0x5dc774) / f(f(sw) / f(width))) / f(f(sh) / f(height))), unit = m.readFloatLE(0x5dc5c8);
  let top = start > 0 ? Math.imul(dy, start) : 0, output = ptr(m, target + 4) + Math.imul(Math.imul(width, start), targetBytes);
  for (let y = 0; y < rows; y++, top = top + dy | 0) for (let x = 0, left = 0; x < width; x++, left = left + dx | 0) {
    const bottom = top + dy | 0, right = left + dx | 0, sum = [0, 0, 0, 0];
    for (let sy = top; sy < bottom;) {const nextY = sy + 0x10000 & 0xffff0000, rowWeight = f(f(f(Math.min(nextY, bottom) - sy) * unit) * area);
      for (let sx = left; sx < right;) {const nextX = sx + 0x10000 & 0xffff0000, columnWeight = f(f(Math.min(nextX, right) - sx) * unit), values = readFloat(ptr(m, source + 4) + Math.imul(Math.imul(sw, sy >> 16) + (sx >> 16) | 0, targetBytes));
        for (let i = 0; i < 4; i++) sum[i] = f(sum[i] + f(f(values[i] * columnWeight) * rowWeight)); sx = nextX;
      } sy = nextY;
    }
    writeFloat(output, sum, frame + 0x58); output += targetBytes;
  }
}
