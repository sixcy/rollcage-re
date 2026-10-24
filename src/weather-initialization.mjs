import {nativeGlobalAddress} from './native-global-address.mjs';
import {initializeWeatherVolume} from './weather-volumes.mjs';
import {readGameMicroseconds} from './game-network-protocol.mjs';
import {loadGameBitmap} from './game-bitmap-images.mjs';
import {constructGameTexture} from './game-texture-construction.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const allocate = (runtime, size) => {if (typeof runtime.services?.libraryCall !== 'function') throw Error('Weather initialization requires CRT allocation.'); return runtime.services.libraryCall('allocate', [size], runtime) >>> 0;};
const allocateZero = (runtime, size) => {const p = allocate(runtime, size); if (p) runtime.memory.fill(0, p, p + size); return p;};
const encodeMaterial = index => {let value = index << 2; value = value & ~0xff00 | ((value >>> 8 & 255) << 2 & 255) << 8; return value >>> 2;};

//401b70/401be0. Actual bitmap loading, ID policy and408680 texture construction.
export function loadWeatherTexture(snow, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 44, descriptor = scratchBase - 36;
  if (!loadGameBitmap(snow ? 0x56fe5c : 0x56fe4c, descriptor, 1, {...runtime, scratchBase: frame - 8})) return 63;
  let index = get(m, nativeGlobalAddress(m,0x91ce98)) + 1 | 0; if (index === 63) index = 64;
  (runtime.handlers?.createTexture408680 ?? constructGameTexture)(index, m.readInt16LE(descriptor + 2), m.readInt16LE(descriptor + 6), m[descriptor + 10], ptr(m, descriptor + 20), 0, 0, {...runtime, scratchBase: frame - 24}); return index;
}

//496580.2048 rain primitives,60 bytes each.
export function initializeRainRenderBuffer(runtime) {
  const {memory: m, scratchBase} = runtime;
  if (Number.isInteger(scratchBase) && runtime.entryRegisters?.ESI !== undefined) put(m, scratchBase - 4, runtime.entryRegisters.ESI);
  const first = allocateZero(runtime, 0x1e000); put(m, nativeGlobalAddress(m,0x80dee0), first); put(m, nativeGlobalAddress(m,0x80ddfc), first + 0x1e000);
  for (let p = first; p < first + 0x1e000; p += 60) {put(m, p + 4, 0x2f0000); put(m, p + 32, 0x181818); m[p + 3] = 12; m[p + 7] = 0xae;}
}

//496640. The high half of frame14 is intentionally inherited stack storage.
export function initializeSnowRenderBuffer(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36;
  for (const [register, offset] of [['EBX', -28], ['ESI', -32], ['EDI', -36]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  word(m, frame + 0x14, 0); word(m, frame + 0x18, 15); put(m, frame + 0x1c, 0xf0f0f00);
  const texture = loadWeatherTexture(true, {...runtime, scratchBase: frame - 4}); put(m, frame + 0x10, texture); const encoded = encodeMaterial(texture); word(m, frame + 0x1a, encoded);
  const first = allocateZero(runtime, 0x3c000); put(m, nativeGlobalAddress(m,0x80dee4), first + 0x3c000); put(m, nativeGlobalAddress(m,0x80ded8), first);
  const tail = m.readUInt16LE(frame + 0x1e), textureWord = get(m, frame + 0x18), staleWord = get(m, frame + 0x14), uv = m.readUInt16LE(frame + 0x1c);
  for (let p = first; p < first + 0x3c000; p += 120) {put(m, p + 4, 0x606060); m[p + 3] = 12; m[p + 7] = 0x9a; put(m, p + 0x20, staleWord); put(m, p + 0x3c, textureWord); word(m, p + 0x58, uv); word(m, p + 0x74, tail);}
}

//498bc0. QPC is the genuine platform boundary; all settings and seed policy
//remain native-width writes to the shared environment globals.
export function initializeWeatherEnvironment(runtime) {
  const {memory: m, scratchBase} = runtime; put(m, 0x6e6cd8, allocateZero(runtime, 0x1000)); const clock = readGameMicroseconds({...runtime, scratchBase: scratchBase - 8}); put(m, 0x5ed2bc, Number(BigInt.asUintN(64, clock) / 1000n & 0xffffffffn));
  const quality = m[ptr(m, 0x5ecefc) + 0x26]; let mode = get(m, nativeGlobalAddress(m,0x80dedc)); if (quality <= 2) {mode = 2 - quality; put(m, nativeGlobalAddress(m,0x80dedc), mode);}
  const session = ptr(m, 0x5ecb1c); if (m[session + 0x555]) {if (m[session + 0x553] === 1) put(m, 0x5ed2c0, 128); else if (m[session + 0x553] === 2) put(m, 0x5ed2c0, 192);}
  if (mode === 1) {put(m, 0x6e6ce8, 30); put(m, 0x5ed2b8, 128); put(m, 0x6e6cd0, 0);} else {put(m, 0x5ed2b8, 256); put(m, 0x6e6ce8, 0); put(m, 0x6e6cd0, 0);}
}

//497ed0. Material-table edits are live shared writes, then copied to32 rows.
export function initializeWeatherScreen(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20; let texture = loadWeatherTexture(false, {...runtime, scratchBase: frame - 4}); put(m, frame + 0x10, texture); texture = encodeMaterial(texture); put(m, frame + 0x10, texture);
  initializeWeatherEnvironment({...runtime, scratchBase: frame - 4}); const first = allocateZero(runtime, 0x1400), session = ptr(m, 0x5ecb1c); put(m, 0x7135b4, first); put(m, 0x6e6cdc, 0);
  if (!m[session + 0x553]) {const random = Math.imul(get(m, 0x5ec954), 16807) & 0x7fffffff; put(m, 0x5ec954, random); put(m, 0x6e6cdc, (Math.imul(random >>> 15, 0x7fff) & 0xf0000) < 0x20000 ? 1 : 0);}
  const pack = ptr(m, 0x90b990), materials = ptr(m, 0x90b988); let material = texture;
  for (let index = 0; index < 32; index++) {
    const kind = m[session + 0x553], base = m.readUInt16LE(pack + 0x2e);
    if (!kind) material = materials + (base + (index & 1 ? 0xa0 : 0xa1)) * 16;
    else if (kind === 1) {material = materials + (base + 0x5a) * 16; word(m, material, 0); word(m, material + 4, 63); put(m, material + 8, 0x3f3f3f00); word(m, material + 6, m.readUInt16LE(frame + 0x10));}
    else if (kind === 2) {material = materials + (base + 0x66) * 16; word(m, material + 6, m.readUInt16LE(material + 6) | 0x800);}
    const row = first + index * 160; put(m, row, 0); put(m, row + 0x98, 0); put(m, row + 0x24, get(m, material)); put(m, row + 0x40, get(m, material + 4)); word(m, row + 0x5c, m.readUInt16LE(material + 8)); word(m, row + 0x78, m.readUInt16LE(material + 10));
  }
}

//496290. Storage/activation producer for the update graph.
export function initializeWeather(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20, session = ptr(m, 0x5ecb1c); for (let i = 0; i < 6; i++) put(m, nativeGlobalAddress(m,0x80dde0 + i * 4), -1);
  if (m[session + 0x553]) {
    const mode = m[session + 0x552], count = (mode === 1 || mode === 2 ? 2 : mode === 3 ? 3 : mode === 4 ? 4 : 1) + 2; put(m, nativeGlobalAddress(m,0x80ddf8), count);
    for (let index = 0; index < count; index++) put(m, nativeGlobalAddress(m,0x80dde0 + index * 4), allocateZero(runtime, 0x4030));
    const kind = m[ptr(m, 0x5ecb1c) + 0x553]; if (kind === 1) initializeRainRenderBuffer({...runtime, scratchBase: frame - 4}); else if (kind === 2) initializeSnowRenderBuffer({...runtime, scratchBase: frame - 4});
    for (let index = 0; index < count; index++) {const row = ptr(m, nativeGlobalAddress(m,0x80dde0 + index * 4)), kind = m[ptr(m, 0x5ecb1c) + 0x553]; const voice = kind & 1 ? emitNativeEffect(39, 0, [0, -1, 0, 9, 0, 0, 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)}) : 127; put(m, row + 0x4024, voice); put(m, row + 0x4028, 0); initializeWeatherVolume(index, {...runtime, scratchBase: frame - 4});}
  }
  initializeWeatherScreen({...runtime, scratchBase: frame - 4});
}
