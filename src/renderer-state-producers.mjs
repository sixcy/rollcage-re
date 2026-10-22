import {assignViewportString} from './weather-viewport.mjs';
import {compareRendererNameBytes} from './renderer-viewports.mjs';
import {registerRendererViewport} from './renderer-overlay-registration.mjs';
import frustumConstants from './renderer-frustum-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const stringData = (m, object) => ptr(m, object + 20) >= 16 ? ptr(m, object) : object;
const length = (m, p) => {let end = p; while (m[end]) end++; return end - p;};
export function initializeRendererFrustumConstants(memory) {for (const table of frustumConstants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//50ec10: listener binding containers and their self-owned eight-byte sentinel.
export function constructRendererListeners(object, runtime) {
  const m = runtime.memory; for (let offset = 0; offset < 40; offset += 4) put(m, object + offset, 0);
  if (typeof runtime.handlers?.allocate !== 'function') throw Error('Renderer listener construction requires CRT allocation.');
  const sentinel = runtime.handlers.allocate(8, runtime) >>> 0; if (!sentinel) throw Error('Native std::_Xbad_alloc: renderer listener sentinel.');
  put(m, object + 20, sentinel); put(m, sentinel, 0); put(m, sentinel + 4, 0); put(m, ptr(m, object + 20), object + 20);
  for (const offset of [40, 44, 48]) put(m, object + offset, 0); return object;
}

//50dff0: six-plane inline frustum and its actual one-past-normal array cursor.
export function constructRendererFrustum(object, {memory: m}) {
  for (let offset = 0; offset < 0xc0; offset += 4) put(m, object + offset, 0);
  put(m, object + 0xc0, object + 0x60); put(m, object + 0xc4, 6); return object;
}

//50e370. Actual viewport startup state, named strings, listener storage and
//both inline frustums, with actual51a650 registration when UI owner is live.
export function constructRendererViewport(object, nameObject, sceneObject, registerFlag, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 44;
  put(m, scratchBase + 4, nameObject); put(m, scratchBase + 8, sceneObject); put(m, scratchBase + 12, registerFlag);
  for (const offset of [0, 4, 8, 12]) put(m, object + offset, 0);
  for (const base of [20, 48]) {put(m, object + base + 20, 15); put(m, object + base + 16, 0); m[object + base] = 0; put(m, object + base + 24, 0);}
  constructRendererListeners(object + 80, {...runtime, scratchBase: frame - 4});
  for (const offset of [0x90, 0x8c, 0x88, 0x84]) put(m, object + offset, -1); put(m, object + 0xb9, 0);
  for (const offset of [0, 4, 8]) put(m, object + 0xc0 + offset, 0);
  constructRendererFrustum(object + 0xcc, runtime); constructRendererFrustum(object + 0x194, runtime); m[object + 16] = 1;
  for (const [argument, destination] of [[scratchBase + 4, object + 20], [scratchBase + 8, object + 48]]) {const source = ptr(m, argument); if (destination !== source) {assignViewportString(destination, stringData(m, source), ptr(m, source + 16), runtime); put(m, destination + 24, 0);}}
  put(m, object + 0x4c, 0);
  for (const offset of [0x84, 0x88, 0x8c, 0x90]) put(m, object + offset, 0);
  for (const [offset, value] of [[0x94, 0x3d4ccccd], [0x98, 0x46000000]]) put(m, object + offset, value); m[object + 0x9c] = 1;
  for (const [offset, value] of [[0xa0, 0x42b40000], [0xa4, 0], [0xb4, 0], [0xa8, 0], [0xac, 0], [0xb0, 0]]) put(m, object + offset, value);
  m[object + 17] = 1; put(m, object + 0xb9, 0xff000000); m.writeUInt16LE(0, object + 0xbd);
  for (const offset of [0, 4, 8]) put(m, frame + 20 + offset, 0);
  for (const offset of [0, 4, 8]) put(m, object + 0xc0 + offset, get(m, frame + 20 + offset));
  registerFlag = m[scratchBase + 12]; m[object + 0xb8] = registerFlag;
  if (registerFlag === 1 && get(m, 0x714b44)) {if (runtime.handlers?.call51a650) runtime.handlers.call51a650({memory: m, ecx: object + 0xc0, args: [object], scratchBase: frame - 8}); else registerRendererViewport(object, {...runtime, scratchBase: frame - 8});}
  return object;
}

//516a10. Normal-return constructor; SEH linking belongs to the compiler's
//thread-local chain, not this object's game state. std::string uses the actual
//existing405310/405860 adapter, with genuine CRT allocation/free when reached.
export function constructRendererTarget(object, nameObject, tag, runtime) {
  const {memory: m, scratchBase} = runtime;
  put(m, scratchBase + 4, nameObject); put(m, scratchBase + 8, tag);
  for (const offset of [0, 4, 8, 12]) put(m, object + offset, 0);
  m[object + 16] = 1; put(m, object + 40, 15); put(m, object + 36, 0); m[object + 20] = 0;
  nameObject = ptr(m, scratchBase + 4);
  assignViewportString(object + 20, stringData(m, nameObject), ptr(m, nameObject + 16), {...runtime, scratchBase: scratchBase - 40});
  put(m, object + 44, 0); put(m, object + 48, get(m, scratchBase + 8)); put(m, object + 52, 0); m[object + 56] = 1;
  put(m, object + 57, 0xff000000); m.writeUInt16LE(0x101, object + 61);
  for (const offset of [64, 68, 72]) put(m, object + offset, 0);
  return object;
}

//517ce0: scene names start at object0, distinct from target/viewport names20.
export function findRendererScene(owner, key, runtime) {
  const m = runtime.memory, end = ptr(m, owner + 36); let cursor = ptr(m, owner + 32);
  while (cursor !== end) {
    const candidate = ptr(m, cursor), incoming = stringData(m, key), count = length(m, incoming), ownCount = ptr(m, candidate + 16), ownData = stringData(m, candidate);
    if (!compareRendererNameBytes(ownData, incoming, Math.min(count, ownCount), runtime) && count === ownCount) return candidate;
    cursor = cursor + 4 >>> 0;
  }
  return 0;
}

//50ee00. Three actual device queues; memset may alias each queue's metadata.
export function resetRendererBatches(device, {memory: m}) {
  for (let slot = 0; slot < 3; slot++) {
    const queue = ptr(m, device + 0xe4 + slot * 4);
    if (get(m, queue + 32) > 0) {
      const count = (get(m, queue + 28) << 2) >>> 0, output = ptr(m, queue + 4); m.fill(0, output, output + count);
      const marker = ptr(m, queue + 8); put(m, queue + 32, 0); put(m, queue + 36, 0); put(m, marker, 0);
    }
  }
}

//50e2e0. std::function targets are caller-owned callbacks. Their actual virtual
//invocation is explicit; list length and bindings are reloaded after each call.
export function dispatchRendererViewportEvent(viewport, event, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20;
  put(m, scratchBase + 4, event);
  const count = () => (get(m, viewport + 124) - get(m, viewport + 120) | 0) >> 2;
  let total = count(); if (!total) return 0;
  for (let index = 0;; index++) {
    let binding;
    if ((index >>> 0) < (count() >>> 0)) {binding = get(m, ptr(m, viewport + 120) + index * 4); put(m, scratchBase + 4, binding);}
    else {binding = -1; put(m, frame + 12, -1);}
    put(m, frame + 16, event);
    const callback = ptr(m, ptr(m, ptr(m, viewport + 80) + binding * 4) + 16);
    if (!callback) throw Error('Native std::_Xbad_function_call: empty renderer viewport listener.');
    if (typeof runtime.services?.rendererCallback !== 'function') throw Error('Renderer viewport listener requires explicit std::function callback service.');
    runtime.services.rendererCallback(callback, 8, [viewport, frame + 16], runtime);
    total = count(); if (((index + 1) >>> 0) >= (total >>> 0)) return total;
  }
}

//50e160. Per-operation float32 rounding and live plane/matrix reloads retain
//overlap between either frustum and the transform. Count is reloaded per plane.
export function transformRendererFrustum(output, source, matrix, runtime) {
  const {memory: m, scratchBase} = runtime, f = Math.fround;
  put(m, scratchBase + 4, source); put(m, scratchBase + 8, matrix);
  const count = get(m, source + 0xc4); put(m, output + 0xc4, count); put(m, output + 0xc0, output + (count << 4));
  if (get(m, output + 0xc4) <= 0) return (output + (count << 4)) | 0;
  matrix = ptr(m, scratchBase + 8);
  const read = p => m.readFloatLE(p), product = (a, b) => f(a * b), sum = (a, b) => f(a + b);
  const rotate = values => [0, 4, 8].map(column => sum(sum(product(read(matrix + 16 + column), values[1]), product(read(matrix + column), values[0])), product(read(matrix + 32 + column), values[2])));
  for (let plane = 0;; plane++) {
    const input = source + plane * 16, destination = output + plane * 16, normal = [0, 4, 8].map(o => read(input + o)), rotated = rotate(normal);
    put(m, destination + 12, 0); rotated.forEach((value, i) => m.writeFloatLE(value, destination + i * 4));
    const point = [0, 4, 8].map(o => read(input + 0x60 + o)), translated = rotate(point).map((value, i) => sum(value, read(matrix + 48 + i * 4)));
    m.writeFloatLE(translated[0], destination + 0x60); m.writeFloatLE(translated[1], destination + 0x64); put(m, destination + 0x6c, 0); m.writeFloatLE(translated[2], destination + 0x68);
    if (plane + 1 >= get(m, output + 0xc4)) return matrix | 0;
    if (plane >= 100000) throw Error('Renderer frustum exceeded the declared bounded plane workflow.');
  }
}

//50e660. Actual projection ratios and six camera-space planes. Genuine CRT
//tan/atan are binary64 interfaces; sin/cos are binary32 interfaces. Scratch
//vectors follow the actual4020e0/4020c0 sequence rather than invented matrices.
export function updateRendererViewportFrustum(viewport, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 68, f = Math.fround, read = p => m.readFloatLE(p), write = (p, v) => m.writeFloatLE(v, p);
  const math = (operation, value, precision) => {if (typeof runtime.services?.rendererMath !== 'function') throw Error(`Renderer viewport requires CRT ${operation}.`); const result = runtime.services.rendererMath(operation, value, precision, runtime); return precision === 32 ? f(result) : result;};
  let aspect = read(viewport + 0xb4), halfAngle = f(read(0x5d013c) * read(viewport + 0xa0)); write(frame + 16, aspect);
  if (aspect === 0) {aspect = f(f(get(m, viewport + 0x8c)) / f(get(m, viewport + 0x90))); write(frame + 16, aspect);}
  halfAngle = f(halfAngle * read(0x5dc6ec)); write(frame + 24, halfAngle);
  let tangent = f(math('tan', halfAngle, 64)); write(frame + 20, tangent);
  const aspectTangent = f(tangent * read(frame + 16)); write(frame + 28, aspectTangent);
  const horizontal = f(f(math('atan', aspectTangent, 64)) * read(0x5dc888)); write(frame + 16, horizontal);
  write(viewport + 0xb0, f(read(0x5dc774) / read(frame + 20))); write(viewport + 0xac, f(read(0x5dc774) / read(frame + 28)));
  for (let plane = 0; plane < 6; plane++) {for (const offset of [0, 4, 8, 12]) put(m, frame + 32 + offset, 0); Buffer.from(m.subarray(frame + 32, frame + 48)).copy(m, viewport + 0x12c + plane * 16);}
  write(frame + 16, f(read(frame + 16) * read(0x5dc6ec)));
  write(frame + 20, math('sin', read(frame + 16), 32)); write(frame + 28, math('cos', read(frame + 16), 32));
  const vector = (values, output, first = false) => {
    const temporary = first ? frame + 32 : frame + 48; values.forEach((bits, i) => put(m, temporary + i * 4, bits));
    if (first) for (const offset of [0, 4, 8, 12]) put(m, frame + 48 + offset, get(m, frame + 32 + offset));
    else {Buffer.from(m.subarray(frame + 48, frame + 64)).copy(m, frame + 32); for (const offset of [0, 4, 8, 12]) put(m, frame + 48 + offset, get(m, frame + 32 + offset));}
    Buffer.from(m.subarray(frame + 48, frame + 64)).copy(m, output);
  };
  vector([get(m, frame + 28), 0, get(m, frame + 20), 0], viewport + 0xcc, true);
  vector([get(m, frame + 28) ^ get(m, 0x5dcf60), 0, get(m, frame + 20), 0], viewport + 0xdc);
  write(frame + 20, math('sin', read(frame + 24), 32)); write(frame + 28, math('cos', read(frame + 24), 32));
  vector([0, get(m, frame + 28), get(m, frame + 20), 0], viewport + 0xec);
  vector([0, get(m, frame + 28) ^ get(m, 0x5dcf60), get(m, frame + 20), 0], viewport + 0xfc);
  //The last four4020e0 calls write only local30h, unlike the four copied
  //side-plane vectors above; local20h retains the lower-plane producer.
  for (const [output, bits] of [[0x10c, get(m, 0x5dc774)], [0x16c, get(m, viewport + 0x94)], [0x11c, get(m, 0x5dcb10)], [0x17c, get(m, viewport + 0x98)]]) {for (const [i, value] of [0, 0, bits, 0].entries()) put(m, frame + 48 + i * 4, value); Buffer.from(m.subarray(frame + 48, frame + 64)).copy(m, viewport + output);}
  const finalAngle = f(f(read(0x5d013c) * read(viewport + 0xa0)) * read(0x5dc6ec)); tangent = f(math('tan', finalAngle, 64)); write(viewport + 0xa8, tangent);
}

//50e950. Publish viewport rectangle/view matrix and transform real frustums;
//the renderer device virtuals remain explicit game-interface contracts.
export function prepareRendererViewport(viewport, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 76;
  const call = (method, args) => {if (typeof runtime.services?.rendererDevice !== 'function') throw Error('Renderer viewport requires an explicit renderer-device interface contract.'); return runtime.services.rendererDevice(ptr(m, 0x714ae8), method, args, runtime);};
  updateRendererViewportFrustum(viewport, {...runtime, scratchBase: frame - 4}); call(0x44, [viewport + 0x84]);
  const camera = ptr(m, ptr(m, viewport + 0x4c) + 0x3c);
  for (const offset of [0, 16, 32, 48]) Buffer.from(m.subarray(camera + 0x40 + offset, camera + 0x50 + offset)).copy(m, frame + 8 + offset);
  call(0x30, [frame + 8]); call(0x2c, [viewport]);
  put(m, viewport + 0x258, 5); put(m, viewport + 0x254, viewport + 0x1e4);
  return transformRendererFrustum(viewport + 0x194, viewport + 0xcc, frame + 8, {...runtime, scratchBase: frame - 12});
}
