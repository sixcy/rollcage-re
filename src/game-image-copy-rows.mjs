import {defaultGameImageMasks, readGameImageFloat, writeGameImageFloat, readGameImageRgba, writeGameImageRgba} from './game-image-format.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p);

//4c27c0. Native format matching, including palette/nonstandard type shortcuts.
export function gameImageFormatsMatch(image, type, depth, masks, runtime) {
  const {memory: m, scratchBase} = runtime;
  if (type !== get(m, image + 16)) return false;
  if (type !== 0 && type !== 1) return true;
  if (depth === -1) depth = type === 0 ? 32 : 64;
  masks.forEach((v, i) => m.writeInt32LE(v | 0, scratchBase + 12 + i * 4));
  defaultGameImageMasks(scratchBase + 12, scratchBase + 16, scratchBase + 20, scratchBase + 24, depth, type, runtime);
  return depth === get(m, image + 0x44) && [0, 1, 2, 3].every(i => get(m, scratchBase + 12 + i * 4) === get(m, image + 0x14 + i * 4));
}

//4c75b0's unrotated, nonblended copy graph. This is the complete path reached
//by4c2850/4c2710 mipmap source copies. Rotation and alpha compositing remain
//explicit game boundaries; they are not used by that native constructor path.
export function copyGameImageRows(source, args, runtime) {
  const {memory: m, scratchBase} = runtime, [, y, width, , start, rows, , destX, destY, rotation, , , flags, target] = args, [x] = args;
  args.forEach((v, i) => m.writeInt32LE(v | 0, scratchBase + 4 + i * 4));
  if ((rotation & 0x7fffffff) || (flags & 0xffff)) throw Error('Image copy rotation/alpha-compositing4c75b0 remains explicit.');
  const sourceBytes = get(m, source + 0x44) >> 3, targetBytes = get(m, target + 0x44) >> 3, match = gameImageFormatsMatch(source, get(m, target + 16), get(m, target + 0x44), [0x14, 0x18, 0x1c, 0x20].map(o => get(m, target + o)), {...runtime, scratchBase: scratchBase - 0x1d0});
  for (let row = 0; row < rows; row++) {
    let input = ptr(m, source + 4) + Math.imul(Math.imul(get(m, source + 8), start + row) + x | 0, sourceBytes), output = ptr(m, target + 4) + Math.imul(Math.imul(get(m, target + 8), destY - y + start + row) + destX | 0, targetBytes);
    if (match) {if (typeof runtime.services?.libraryCall !== 'function') throw Error('Image copy requires CRT memcpy.'); runtime.services.libraryCall('memcpy', [output, input, Math.imul(width, sourceBytes) >>> 0], runtime);}
    else for (let column = 0; column < width; column++, input += sourceBytes, output += targetBytes) {
      if (get(m, source + 16) === 1) {readGameImageFloat(source, scratchBase - 0x120, input, {...runtime, scratchBase: scratchBase - 0x1d0}); writeGameImageFloat(target, output, scratchBase - 0x120, {...runtime, scratchBase: scratchBase - 0x1d0});}
      else {readGameImageRgba(source, scratchBase - 0x140, input, {...runtime, scratchBase: scratchBase - 0x1d0}); writeGameImageRgba(target, output, get(m, scratchBase - 0x140), {...runtime, scratchBase: scratchBase - 0x1d0});}
    }
  }
}
