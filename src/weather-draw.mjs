import {nativeGlobalAddress} from './native-global-address.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const f32 = Math.fround, read = (m, p) => m.readFloatLE(p), write = (m, p, v) => m.writeFloatLE(v, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

function fist(value, mode = 'nearest-even') {
  let rounded;
  if (mode === 'nearest-even') {const floor = Math.floor(value), part = value - floor; rounded = part < 0.5 ? floor : part > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;}
  else if (mode === 'toward-zero') rounded = Math.trunc(value);
  else if (mode === 'up') rounded = Math.ceil(value);
  else if (mode === 'down') rounded = Math.floor(value);
  else throw Error('Weather drawing requires a declared x87 rounding mode.');
  return Number.isFinite(rounded) && rounded >= -2147483648 && rounded <= 2147483647 ? rounded | 0 : -2147483648;
}

//432320 /432470. The ratio is the live x87 value consumed by4323f0;
//the second variant reloads its rounded float depth before dividing.
export function transformWeatherDrawPoint(output, runtime, rejectNegative = false) {
  const {memory: m, scratchBase} = runtime, bp = scratchBase - 4;
  if (runtime.entryRegisters?.EBP !== undefined) put(m, bp, runtime.entryRegisters.EBP);
  put(m, bp - 4, output);
  if (rejectNegative && runtime.entryRegisters?.EBX !== undefined) put(m, bp - 12, runtime.entryRegisters.EBX);
  const x = m.readInt16LE(0x91d3e4), y = m.readInt16LE(0x91d3e6), z = m.readInt16LE(0x91d3e8);
  const component = (translation, matrix) => ((read(m, translation) + read(m, matrix) * x) + read(m, matrix + 4) * y) + read(m, matrix + 8) * z;
  if (rejectNegative) put(m, output, 16);
  const depth = component(nativeGlobalAddress(m,0x91cdb8), nativeGlobalAddress(m,0x91cde0));
  if (rejectNegative) {
    write(m, output + 4, depth);
    if (get(m, output + 4) < 0) {write(m, bp - 8, x); put(m, nativeGlobalAddress(m,0x91ce18), output); return null;}
  }
  const transformedX = component(nativeGlobalAddress(m,0x91cdb0), nativeGlobalAddress(m,0x91cdc0));
  //432320 computes both coordinates before either store;432470 stores X
  //before computing Y. Preserve that distinction when output aliases globals.
  if (rejectNegative) write(m, output + 16, transformedX);
  const transformedY = component(nativeGlobalAddress(m,0x91cdb4), nativeGlobalAddress(m,0x91cdd0));
  if (!rejectNegative) write(m, output + 16, transformedX);
  write(m, output + 20, transformedY);
  if (!rejectNegative) write(m, output + 4, depth);
  write(m, bp - 8, rejectNegative ? x : y);
  const visible = get(m, output + 4) >= get(m, nativeGlobalAddress(m,0x91cda4));
  if (rejectNegative) {if (visible) put(m, output, get(m, output) & ~16);}
  else put(m, output, visible ? 0 : 16);
  put(m, nativeGlobalAddress(m,0x91ce18), output);
  const pending = rejectNegative ? read(m, output + 4) : depth;
  return visible ? read(m, nativeGlobalAddress(m,0x91cda0)) / pending : pending;
}

//4323f0. Clip tests compare signed IEEE float words, rather than numeric
//coordinates. The final FSTP publishes the live ratio (or clipped depth).
export function finishWeatherDrawPoint(pending, {memory: m}) {
  const output = ptr(m, nativeGlobalAddress(m,0x91ce18));
  if (!(get(m, output) & 16)) {
    let flags = get(m, output);
    write(m, output + 8, read(m, output + 16) * pending + read(m, nativeGlobalAddress(m,0x91cdf0)));
    write(m, output + 12, read(m, output + 20) * pending + read(m, nativeGlobalAddress(m,0x91cdf4)));
    const x = get(m, output + 8), y = get(m, output + 12);
    if (x < get(m, nativeGlobalAddress(m,0x91ce00))) flags |= 1; else if (x >= get(m, nativeGlobalAddress(m,0x91ce04))) flags |= 2;
    if (y < get(m, nativeGlobalAddress(m,0x91ce08))) flags |= 4; else if (y >= get(m, nativeGlobalAddress(m,0x91ce0c))) flags |= 8;
    put(m, output, flags);
  }
  write(m, 0x6fb5dc, pending);
}

function depthBucket(value) {
  if (value > 256) {value = (value >> 1) + 128; if (value > 384) value = Math.min((value >> 1) + 192, 511);}
  return Math.max(value - 48, 1);
}

//497110.2048 packed particle records become60-byte rain primitives. The
//fully accepted exit deliberately retains the expanded clipping boundaries.
export function drawWeatherRain(index, runtime) {
  const {memory: m, scratchBase, roundingMode} = runtime, frame = scratchBase - 60;
  const radius = read(m, nativeGlobalAddress(m,0x91d33c)), row = ptr(m, nativeGlobalAddress(m,0x80dde0 + index * 4)), body = ptr(m, row + 16), buckets = ptr(m, 0x91d590);
  write(m, nativeGlobalAddress(m,0x91ce00), f32(read(m, nativeGlobalAddress(m,0x91ce00)) + radius)); write(m, nativeGlobalAddress(m,0x91ce04), f32(read(m, nativeGlobalAddress(m,0x91ce04)) - radius));
  put(m, frame + 40, buckets); put(m, frame + 28, 0); put(m, frame + 20, get(m, nativeGlobalAddress(m,0x80dee0)));
  write(m, nativeGlobalAddress(m,0x91ce08), f32(read(m, nativeGlobalAddress(m,0x91ce08)) + radius)); write(m, nativeGlobalAddress(m,0x91ce0c), f32(read(m, nativeGlobalAddress(m,0x91ce0c)) - radius));
  word(m, frame + 44, m.readUInt16LE(row + 0x4018) - m.readUInt16LE(body + 0x6a));
  word(m, frame + 46, m.readUInt16LE(row + 0x401a) - m.readUInt16LE(body + 0x6e));
  word(m, frame + 18, m.readUInt16LE(row + 0x401c) - m.readUInt16LE(body + 0x72)); put(m, frame + 24, 0);
  let output = ptr(m, frame + 20), accepted = 0, particle = row + index * 8 + 20;
  for (let i = 0; i < 2048; i++, particle += 8) {
    if (m.readInt16LE(particle + 6)) {
      put(m, 0x91d3e4, get(m, particle)); put(m, 0x91d3e8, get(m, particle + 4));
      const first = output + 8, second = output + 36;
      const firstRatio = transformWeatherDrawPoint(first, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EBP: particle}});
      const combined = get(m, particle) + get(m, frame + 44) | 0;
      word(m, frame + 56, m.readUInt16LE(particle + 4) + m.readUInt16LE(frame + 18));
      finishWeatherDrawPoint(firstRatio, runtime);
      put(m, 0x91d3e4, combined); put(m, 0x91d3e8, get(m, frame + 56));
      const secondRatio = transformWeatherDrawPoint(second, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EBP: particle}});
      write(m, frame + 32, read(m, output + 12)); put(m, frame + 36, fist(read(m, frame + 32), roundingMode));
      const distance = get(m, frame + 36) >> 5; finishWeatherDrawPoint(secondRatio, runtime);
      output = ptr(m, frame + 20);
      if (!(get(m, first) & get(m, second)) && distance > 0) {
        const bucket = (get(m, frame + 40) + 0x70 + depthBucket(distance) * 4) & 0x7fffffff;
        accepted++; put(m, frame + 28, accepted); put(m, output, get(m, bucket)); put(m, bucket, output); output += 60; put(m, frame + 20, output);
        if (accepted >= 2048) return;
      }
    }
    put(m, frame + 24, i + 1);
  }
  write(m, nativeGlobalAddress(m,0x91ce00), f32(read(m, nativeGlobalAddress(m,0x91ce00)) - radius)); write(m, nativeGlobalAddress(m,0x91ce04), f32(read(m, nativeGlobalAddress(m,0x91ce04)) + radius));
  write(m, nativeGlobalAddress(m,0x91ce08), f32(read(m, nativeGlobalAddress(m,0x91ce08)) - radius)); write(m, nativeGlobalAddress(m,0x91ce0c), f32(read(m, nativeGlobalAddress(m,0x91ce0c)) + radius));
}

//497350. Projected snow quads enter the same depth buckets. Packed integer
//screen clipping includes native carry/borrow between the two16-bit lanes.
export function drawWeatherSnow(index, runtime) {
  const {memory: m, scratchBase, roundingMode} = runtime, frame = scratchBase - 76, buckets = ptr(m, 0x91d590);
  let output = ptr(m, nativeGlobalAddress(m,0x80ded8)), particle = ptr(m, nativeGlobalAddress(m,0x80dde0 + index * 4)) + index * 8 + 20;
  const end = output + 0x3c000, maximum = read(m, 0x5dc9c8), scale = f32(f32(f32(get(m, nativeGlobalAddress(m,0x91ce94))) * read(m, 0x5dc614)) * read(m, 0x5dca7c));
  put(m, frame + 44, buckets); put(m, frame + 20, end); put(m, frame + 16, 2048);
  for (let i = 0; i < 2048; i++, particle += 8) {
    if (m.readInt16LE(particle + 6)) {
      put(m, 0x91d3e4, get(m, particle)); put(m, 0x91d3e8, get(m, particle + 4));
      const pending = transformWeatherDrawPoint(frame + 48, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EBP: 2048 - i, EBX: output}}, true);
      if (get(m, frame + 52) >= 0) {
        finishWeatherDrawPoint(pending, runtime);
        if (!(m[frame + 48] & 16)) {
          put(m, frame + 28, fist(read(m, frame + 52), roundingMode));
          let radius = f32(scale / read(m, frame + 52)); write(m, frame + 24, radius);
          const bucketIndex = depthBucket(get(m, frame + 28) >> 5); if (radius > maximum) {radius = maximum; write(m, frame + 24, radius);}
          if ((output >>> 0) < (end >>> 0)) {
            const extent = get(m, 0x91d594); put(m, frame + 40, fist(read(m, frame + 24), roundingMode));
            write(m, frame + 24, f32(read(m, frame + 56) - read(m, nativeGlobalAddress(m,0x91ce00)))); put(m, frame + 32, fist(read(m, frame + 24), roundingMode));
            write(m, frame + 24, f32(read(m, frame + 60) - read(m, nativeGlobalAddress(m,0x91ce08)))); put(m, frame + 36, fist(read(m, frame + 24), roundingMode));
            const center = get(m, frame + 36) << 16 | get(m, frame + 32), half = get(m, frame + 40) << 16 | get(m, frame + 40);
            const remaining = center - half - extent | 0;
            if (!((center + half) & 0x80008000) && remaining <= 0 && (remaining & 0x8000)) {
              const x = read(m, frame + 56), y = read(m, frame + 60);
              for (const offset of [92, 64, 36, 8]) put(m, output + offset, 64);
              write(m, output + 72, f32(x - radius)); write(m, output + 16, f32(x - radius));
              write(m, output + 100, f32(x + radius)); write(m, output + 44, f32(x + radius));
              write(m, output + 48, f32(y - radius)); write(m, output + 20, f32(y - radius));
              write(m, output + 104, f32(y + radius)); write(m, output + 76, f32(y + radius));
              for (const offset of [96, 68, 40, 12]) put(m, output + offset, get(m, frame + 52));
              const bucket = get(m, frame + 44) + 0x70 + bucketIndex * 4 & 0x7fffffff;
              put(m, output, get(m, bucket)); put(m, bucket, output); output += 120;
            }
          }
        }
      }
    }
    put(m, frame + 16, 2047 - i);
  }
}
