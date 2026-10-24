import {nativeGlobalAddress} from './native-global-address.mjs';
import constants from './camera-projection-constants.json' with {type: 'json'};
import {readRendererViewportExtent} from './renderer-viewports.mjs';

const f32 = Math.fround, short = v => (v << 16) >> 16;
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const float = (m, p, v) => m.writeFloatLE(v, p);
const trunc32 = value => Number.isFinite(value) && value >= -2147483648 && value < 2147483648 ? Math.trunc(value) | 0 : -2147483648;

export function initializeCameraProjectionConstants(memory) {
  for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
}

//42f820. Signed-short camera distance, Q8 division451210, viewport scaling,
//and the original104 minimum for the two integer projection ratios.
export function updateCameraProjectionRatios(distance, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 8;
  // Actual451210 numeric locals, with its native entry at frame-4.
  put(m, frame - 8, 0x6800); put(m, frame - 12, short(distance) << 8);
  const fixed = Number((BigInt(short(distance) << 8) << 8n) / 0x6800n);
  put(m, nativeGlobalAddress(m,0x91ce94), fixed);
  const width = readRendererViewportExtent(false, {...runtime, scratchBase: frame - 4});
  const height = readRendererViewportExtent(true, {...runtime, scratchBase: frame - 4});
  const largest = width >= height ? width : height, half = width >= height ? 320 : 240;
  put(m, nativeGlobalAddress(m,0x91ce94), trunc32(f32(f32(f32(largest) / f32(half)) * f32(get(m, nativeGlobalAddress(m,0x91ce94))))));
  const clamped = short(distance) <= 104 ? 104 : short(distance);
  put(m, nativeGlobalAddress(m,0x91d324), Math.trunc(0x6800 / clamped));
  const result = Math.trunc((clamped << 8) / 104) | 0; put(m, nativeGlobalAddress(m,0x91d328), result); return result;
}

function mathService(operation, value, runtime) {
  if (typeof runtime.handlers?.projectionMath !== 'function') throw Error('Projection requires the CRT atan/sin/cos service.');
  return f32(runtime.handlers.projectionMath(operation, value, runtime));
}
function integerService(value, runtime) {
  if (typeof runtime.handlers?.projectionInteger !== 'function') throw Error('Projection requires the CRT float-to-int64 service.');
  const result = runtime.handlers.projectionInteger(value, runtime);
  if (typeof result !== 'bigint' || BigInt.asIntN(64, result) !== result) throw Error('Projection CRT integer service must return signed64 BigInt.');
  return Number(BigInt.asIntN(32, result));
}

//426e20. Four clipping planes in6fb440..6fb47f, clip flag6e6560 and
//packed integer extent91d594. atan/sin/cos and568a60 are genuine CRT services;
//their original implementation/FP exception state is outside this algorithm.
export function updateCameraClipPlanes(x, y, width, height, scale, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 52;
  [x, y, width, height, scale] = [x, y, width, height, scale].map(f32);
  float(m, scratchBase + 4, scale);
  const current = ptr(m, 0x6efb3c);
  float(m, frame + 0x2c, height); float(m, frame + 0x20, width); put(m, frame + 0x28, current ? 1 : 0);
  const config = ptr(m, 0x5ecefc), right = f32(x + width), bottom = f32(y + height), option = m[config + 0x41a];
  m[frame + 0x33] = option;
  const multiplier = option && get(m, 0x6e6c04) ? 2 : 1;
  let screenWidth = Math.imul(m.readUInt16LE(config + 0x42c), multiplier), screenHeight = Math.imul(m.readUInt16LE(config + 0x42e), multiplier);
  if (get(m, frame + 0x28) === 1) {screenWidth = get(m, current + 0x8c); screenHeight = get(m, current + 0x90);}
  put(m, frame + 0x18, 0); put(m, frame + 0x1c, 0);
  // JA is false on unordered COMISS; final JBE admits unordered as well.
  put(m, 0x6e6560, x < 0 || y < 0 || right > f32(screenWidth) || bottom > f32(screenHeight) ? 0x40 : 0);
  const largest = width > height ? width : height;
  const factor = f32(m.readFloatLE(0x5dc774) / f32(largest / m.readFloatLE(frame + 0x38)));
  float(m, frame + 0x28, factor);
  const doubled = f32(f32(factor * m.readFloatLE(0x5dc888)) * m.readFloatLE(frame + 0x38));
  float(m, frame + 0x24, doubled);
  const firstAngle = mathService('atan', f32(doubled / f32(factor * width)), runtime);
  float(m, frame + 0x38, firstAngle);
  float(m, frame + 0x10, mathService('sin', firstAngle, runtime));
  float(m, frame + 0xc, mathService('cos', m.readFloatLE(frame + 0x38), runtime));
  const firstSin = get(m, frame + 0x10), zero = get(m, frame + 0x18);
  put(m, 0x6fb454, firstSin ^ get(m, 0x5dcf60)); put(m, 0x6fb458, zero);
  const denominator = f32(m.readFloatLE(frame + 0x28) * m.readFloatLE(frame + 0x2c)), cosine = get(m, frame + 0xc);
  put(m, 0x6fb444, firstSin); put(m, 0x6fb448, zero);
  const secondInput = f32(m.readFloatLE(frame + 0x24) / denominator);
  put(m, 0x6fb44c, cosine); put(m, 0x6fb440, 0); put(m, 0x6fb45c, cosine); put(m, 0x6fb450, 0);
  const secondAngle = mathService('atan', secondInput, runtime); float(m, frame + 0x38, secondAngle);
  float(m, frame + 0x24, mathService('sin', secondAngle, runtime));
  float(m, frame + 0xc, mathService('cos', m.readFloatLE(frame + 0x38), runtime));
  const secondZero = get(m, frame + 0x18), secondSin = get(m, frame + 0x24), secondCosine = get(m, frame + 0xc);
  put(m, 0x6fb464, secondZero); put(m, 0x6fb468, secondSin); put(m, 0x6fb46c, secondCosine); put(m, 0x6fb460, 0);
  put(m, 0x6fb474, secondZero); put(m, 0x6fb478, secondSin ^ get(m, 0x5dcf60)); put(m, 0x6fb47c, secondCosine); put(m, 0x6fb470, 0);
  const h = integerService(m.readFloatLE(frame + 0x2c), runtime), w = integerService(m.readFloatLE(frame + 0x20), runtime);
  put(m, 0x91d594, (h << 16) + w); return w;
}

//431dc0. Publish original float/short projection globals, then build planes
//with the actual renderer getters and42f820 child, retaining numeric locals.
export function updateCameraProjection(distance, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20;
  const width = readRendererViewportExtent(false, {...runtime, scratchBase: frame - 4});
  const height = readRendererViewportExtent(true, {...runtime, scratchBase: frame - 4});
  const largest = width >= height ? width : height, dimension = width >= height ? 640 : 480;
  put(m, frame + 0xc, distance); float(m, nativeGlobalAddress(m,0x91ceac), f32(distance | 0));
  put(m, frame + 0xc, largest); float(m, frame + 0xc, f32(largest));
  const scaled = f32(f32(m.readFloatLE(frame + 0xc) / f32(dimension >> 1)) * m.readFloatLE(nativeGlobalAddress(m,0x91ceac)));
  put(m, frame + 0xc, largest); float(m, nativeGlobalAddress(m,0x91cda0), scaled); m.writeUInt16LE(trunc32(scaled) & 65535, 0x91d3c8);
  float(m, frame + 0xc, f32(largest));
  const viewScale = f32(f32(m.readFloatLE(frame + 0xc) * m.readFloatLE(0x5dc6c8)) / f32(dimension));
  float(m, nativeGlobalAddress(m,0x91d340), viewScale); float(m, nativeGlobalAddress(m,0x91d33c), f32(viewScale * m.readFloatLE(0x5dc888)));
  updateCameraProjectionRatios(distance, {...runtime, scratchBase: frame - 4});
  put(m, frame + 0xc, height); float(m, frame + 0x10, f32(height)); put(m, frame + 0xc, width);
  const scale = m.readFloatLE(nativeGlobalAddress(m,0x91cda0)); float(m, frame - 4, scale); float(m, frame + 0xc, f32(width));
  return updateCameraClipPlanes(0, 0, m.readFloatLE(frame + 0xc), m.readFloatLE(frame + 0x10), scale, {...runtime, scratchBase: frame - 8});
}

//42f8c0. Aspect correction applies to the signed low16 distance;91ceb0
//retains its original value,91d50a the adjusted short. Ends in a real tail
//call to42f820 at the original entry stack after431dc0 has returned.
export function updateCameraAspectProjection(distance, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 12;
  let adjusted = distance | 0;
  const width = readRendererViewportExtent(false, {...runtime, scratchBase: frame - 4}); float(m, frame + 8, f32(width));
  const height = readRendererViewportExtent(true, {...runtime, scratchBase: frame - 4});
  const aspect = f32(m.readFloatLE(frame + 8) / f32(height)), target = m.readFloatLE(0x5dc7a0);
  if (aspect > target) adjusted = trunc32(f32(f32(target / aspect) * f32(short(distance)))) & 65535;
  m.writeUInt16LE(adjusted & 65535, 0x91d50a); put(m, frame + 8, short(distance)); float(m, nativeGlobalAddress(m,0x91ceb0), f32(short(distance)));
  updateCameraProjection(short(adjusted), {...runtime, scratchBase: frame - 4});
  return updateCameraProjectionRatios(adjusted, runtime);
}
