import {assignViewportString} from './weather-viewport.mjs';
import {appendGameImagePointer} from './game-image-storage.mjs';
import {constructRendererTarget, constructRendererViewport, initializeRendererFrustumConstants} from './renderer-state-producers.mjs';
import constants from './renderer-scene-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const copy16 = (m, output, input) => Buffer.from(m.subarray(input, input + 16)).copy(m, output);
const stringData = (m, p) => ptr(m, p + 20) > 15 ? ptr(m, p) : p;
const vectorRuntime = r => ({...r, services: {...r.services, libraryCall: (name, args) => {const handler = name === 'operatorNew' ? r.handlers?.allocate : r.handlers?.free; if (typeof handler !== 'function') throw Error(`Renderer node requires CRT ${name}.`); return handler(args[0], r);}}});
export function initializeRendererSceneConstants(memory) {initializeRendererFrustumConstants(memory); for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//402160. The lazy shared identity is initialized only on the first flag edge.
export function obtainRendererIdentity({memory: m}) {
  if (!(get(m, 0x6e6364) & 1)) {put(m, 0x6e6364, get(m, 0x6e6364) | 1); for (let i = 0; i < 16; i++) put(m, 0x6e6390 + i * 4, i % 5 ? 0 : 0x3f800000);}
  return 0x6e6390;
}

//52e6a0. Only AL is Boolean; the rest of EAX retains the final absolute
//difference's float bits. The native argument slot is also its temporary.
export function compareRendererMatrices(matrix, other, runtime) {
  const {memory: m, scratchBase} = runtime, threshold = m.readFloatLE(0x5d01bc); let bits = 0;
  for (let i = 0; i < 16; i++) {m.writeFloatLE(Math.fround(m.readFloatLE(other + i * 4) - m.readFloatLE(matrix + i * 4)), scratchBase + 4); bits = ptr(m, scratchBase + 4) & 0x7fffffff; put(m, scratchBase + 4, bits); if (!(threshold > m.readFloatLE(scratchBase + 4))) return bits & ~255;}
  return (bits & ~255) | 1;
}

//4a5080. All sixteen outputs are calculated before the four block copies.
export function multiplyRendererMatrix(matrix, other, runtime) {
  const {memory: m, scratchBase} = runtime, temp = scratchBase - 64, f = Math.fround, read = p => m.readFloatLE(p);
  put(m, scratchBase + 4, other);
  for (let row = 0; row < 4; row++) {const values = [0, 4, 8, 12].map(offset => read(matrix + row * 16 + offset)); for (let column = 0; column < 4; column++) {let result = f(f(read(other + column * 4) * values[0]) + 0); for (let k = 1; k < 4; k++) result = f(result + f(read(other + k * 16 + column * 4) * values[k])); m.writeFloatLE(result, temp + row * 16 + column * 4);}}
  for (let block = 0; block < 4; block++) copy16(m, matrix + block * 16, temp + block * 16); return matrix;
}

//52e710 and genuine CRT sqrt adapter4a4d00. The later matrix row reads stay
//live after the output writes, including overlap between output and matrix.
export function transformRendererBounds(sphere, output, matrix, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 60, f = Math.fround, read = p => m.readFloatLE(p), product = (a, b) => f(a * b), sum = (a, b) => f(a + b);
  put(m, scratchBase + 4, output); put(m, scratchBase + 8, matrix);
  for (let i = 0; i < 4; i++) put(m, output + i * 4, 0); put(m, output + 12, get(m, 0x5d0148) ^ get(m, 0x5dcf60));
  const [x, y, z] = [0, 4, 8].map(o => read(sphere + o)), transformed = [0, 4, 8].map(c => sum(sum(sum(product(read(matrix + 16 + c), y), product(read(matrix + c), x)), product(read(matrix + 32 + c), z)), read(matrix + 48 + c)));
  transformed.forEach((value, i) => m.writeFloatLE(value, output + i * 4));
  for (const [row, local] of [[2, 40], [1, 24], [0, 8]]) {for (let i = 0; i < 3; i++) put(m, frame + local + i * 4, get(m, matrix + row * 16 + i * 4)); put(m, frame + local + 12, 0);}
  const squares = (local, order) => {const [a, b, c] = order.map(i => read(frame + local + i * 4)); return sum(sum(product(a, a), product(b, b)), product(c, c));};
  const lengths = [squares(8, [0, 1, 2]), squares(24, [1, 0, 2]), squares(40, [1, 0, 2])]; lengths.forEach((value, i) => m.writeFloatLE(value, frame + 8 + i * 4)); put(m, frame + 20, 0);
  let maximum = read(frame + 8); if (!(maximum > read(frame + 12))) maximum = read(frame + 12); if (!(maximum > read(frame + 16))) maximum = read(frame + 16);
  if (typeof runtime.services?.rendererMath !== 'function') throw Error('Renderer bounds require genuine CRT sqrt.'); const scale = f(runtime.services.rendererMath('sqrt', maximum, 64, runtime)); m.writeFloatLE(product(scale, read(sphere + 12)), output + 12); return output;
}

//52e330. Recompute the inherited matrix when forced/dirty, recurse over the
//captured child range, then update this node's sphere after child execution.
export function updateRendererNode(node, force, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 104; put(m, scratchBase + 4, force); m[frame + 21] = 0; m[frame + 22] = 0; const dirty = m[node + 0xbc]; m[frame + 23] = dirty;
  if (m[scratchBase + 4] || dirty) {
    const parent = ptr(m, node + 0xc0);
    if (!parent) for (let block = 0; block < 4; block++) copy16(m, node + 0x40 + block * 16, node + block * 16);
    else {const source = m[node + 0xbd] ? parent + 0x40 : node; for (let block = 0; block < 4; block++) copy16(m, frame + 40 + block * 16, source + block * 16); if (!m[node + 0xbd]) multiplyRendererMatrix(frame + 40, parent + 0x40, {...runtime, scratchBase: frame - 8}); for (let block = 0; block < 4; block++) copy16(m, node + 0x40 + block * 16, frame + 40 + block * 16);}
    m[scratchBase + 4] = 1; m[frame + 22] = 1; m[node + 0xbc] = 0;
  }
  let cursor = ptr(m, node + 0xc4); const end = ptr(m, node + 0xc8), count = cursor > end ? 0 : ((end - cursor + 3) >>> 2); if (count > 100000) throw Error('Renderer node exceeds bounded child workflow.');
  for (let i = 0; i < count; i++, cursor += 4) m[frame + 21] |= updateRendererNode(ptr(m, cursor), get(m, scratchBase + 4), {...runtime, scratchBase: frame - 8});
  if (m[frame + 22]) {const result = transformRendererBounds(node + 0x9c, frame + 24, node + 0x40, {...runtime, scratchBase: frame - 12}); for (const offset of [0, 4, 8, 12]) put(m, node + 0xac + offset, get(m, result + offset));}
  return m[frame + 21] | m[frame + 23];
}

//4b21e0 pointer-vector erase and52e4e0 removal of every matching child.
export function eraseRendererPointers(vector, result, first, last, runtime) {
  const {memory: m} = runtime;
  if (runtime.nativePointerErase) {
    const S = runtime.scratchBase;
    if (!Number.isInteger(S)) throw Error('Native pointer erase requires entry ESP.');
    [result, first, last].forEach((v, i) => put(m, S + 4 + i * 4, v));
    for (const [name, offset] of [['EBX', -4], ['EDI', -8]]) if (Number.isInteger(runtime.entryRegisters?.[name])) put(m, S + offset, runtime.entryRegisters[name]);
    if (first === ptr(m, vector) && last === ptr(m, vector + 4)) put(m, vector + 4, ptr(m, vector));
    else if (first !== last) {
      const bytes = ((get(m, vector + 4) - last) >> 2) * 4 >>> 0;
      if (Number.isInteger(runtime.entryRegisters?.ESI)) put(m, S - 12, runtime.entryRegisters.ESI);
      for (const [i, value] of [bytes, last, first].entries()) put(m, S - 16 - i * 4, value);
      put(m, S - 28, 0x4b2222);
      if (typeof runtime.services?.libraryCall !== 'function') throw Error('Native pointer erase requires CRT memmove.');
      runtime.services.libraryCall('memmove', [ptr(m, S - 24), ptr(m, S - 20), ptr(m, S - 16)], {...runtime, scratchBase: S - 28});
      const liveFirst = ptr(m, S + 8); put(m, vector + 4, first + bytes); result = ptr(m, S + 4); put(m, result, liveFirst); return result;
    }
    result = ptr(m, S + 4); put(m, result, first); return result;
  }
  if (first === ptr(m, vector) && last === ptr(m, vector + 4)) put(m, vector + 4, first);
  else if (first !== last) {const bytes = (get(m, vector + 4) - last >> 2) * 4; Buffer.from(m.subarray(last, last + bytes)).copy(m, first); put(m, vector + 4, first + bytes);}
  put(m, result, first); return result;
}
export function detachRendererChild(node, child, runtime) {
  if (!child) return; const {memory: m, scratchBase} = runtime, vector = node + 0xc4, end = ptr(m, node + 0xc8); put(m, scratchBase + 4, child); let cursor = ptr(m, vector);
  while (cursor !== end && get(m, cursor) !== (child | 0)) cursor += 4;
  if (cursor !== end) for (let input = cursor + 4; input < end; input += 4) if (get(m, input) !== (child | 0)) {put(m, cursor, get(m, input)); cursor += 4;}
  eraseRendererPointers(vector, scratchBase + 4, cursor, end, runtime);
}

//516240. Linked scene-node construction includes its real string, identity
//test, inherited matrix/bounds updates and owned parent pointer-vector append.
export function constructRendererNode(node, matrix, name, parent, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 32; put(m, scratchBase + 4, matrix); put(m, scratchBase + 8, name); put(m, scratchBase + 12, parent);
  for (let block = 0; block < 4; block++) copy16(m, node + 0x40 + block * 16, matrix + block * 16);
  put(m, node + 0x94, 15); put(m, node + 0x90, 0); m[node + 0x80] = 0; assignViewportString(node + 0x80, stringData(m, name), ptr(m, name + 16), runtime); put(m, node + 0x98, 0);
  for (const base of [0x9c, 0xac]) {for (const offset of [0, 4, 8, 12]) put(m, node + base + offset, 0); put(m, node + base + 12, get(m, 0x5d0148) ^ get(m, 0x5dcf60));}
  put(m, scratchBase + 4, get(m, 0x5d0148) ^ get(m, 0x5dcf60)); m.writeUInt16LE(1, node + 0xbc); for (const offset of [0xc0, 0xc4, 0xc8, 0xcc]) put(m, node + offset, 0);
  for (let block = 0; block < 4; block++) copy16(m, node + block * 16, matrix + block * 16);
  m[node + 0xbd] = compareRendererMatrices(node, obtainRendererIdentity(runtime), {...runtime, scratchBase: frame - 8}) & 255; m[node + 0xbc] = 1; updateRendererNode(node, 0, {...runtime, scratchBase: frame - 8});
  parent = ptr(m, scratchBase + 12); if (parent) {put(m, scratchBase + 4, node); if (ptr(m, node + 0xc0) === parent) return node; if (ptr(m, node + 0xc0)) detachRendererChild(ptr(m, node + 0xc0), node, {...runtime, scratchBase: frame - 8}); put(m, node + 0xc0, parent); m[node + 0xbc] = 1; appendGameImagePointer(parent + 0xc4, scratchBase + 4, vectorRuntime({...runtime, scratchBase: frame - 8})); node = ptr(m, scratchBase + 4);}
  updateRendererNode(node, 0, {...runtime, scratchBase: frame - 8}); return node;
}

//51bf70. Scene owns its root node inline at20h and four empty render queues.
export function constructRendererScene(scene, name, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 48, temporary = frame + 8; put(m, scratchBase + 4, name);
  put(m, scene + 20, 15); put(m, scene + 16, 0); m[scene] = 0; put(m, scene + 24, 0);
  put(m, temporary + 20, 15); put(m, temporary + 16, 0); m[temporary] = 0; assignViewportString(temporary, 0x5db76c, 15, runtime); put(m, temporary + 24, 0);
  constructRendererNode(scene + 0x20, obtainRendererIdentity(runtime), temporary, 0, {...runtime, scratchBase: frame - 16});
  if (ptr(m, temporary + 24)) {if (typeof runtime.handlers?.free !== 'function') throw Error('Renderer scene requires CRT delete[].'); runtime.handlers.free(ptr(m, temporary + 24), runtime); put(m, temporary + 24, 0);}
  if (ptr(m, temporary + 20) >= 16) {if (typeof runtime.handlers?.free !== 'function') throw Error('Renderer scene requires CRT delete.'); runtime.handlers.free(ptr(m, temporary), runtime);}
  for (let offset = 0xf0; offset < 0x120; offset += 4) put(m, scene + offset, 0);
  name = ptr(m, scratchBase + 4); if (scene !== name) {assignViewportString(scene, stringData(m, name), ptr(m, name + 16), runtime); put(m, scene + 24, 0);} m[scene + 0x1c] = 0; return scene;
}

//517720. Manager critical section, scene/target vectors and the stock target's
//viewport vector. Platform critical-section internals stay an actual OS service.
export function constructRendererManager(manager, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 132;
  const allocate = size => {if (typeof runtime.handlers?.allocate !== 'function') throw Error('Renderer manager requires CRT allocation.'); return runtime.handlers.allocate(size, runtime) >>> 0;};
  const name = (object, data, count) => {put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0; assignViewportString(object, data, count, runtime); put(m, object + 24, 0); return object;};
  const releaseName = (object, reset = false) => {const release = p => {if (typeof runtime.handlers?.free !== 'function') throw Error('Renderer manager requires CRT delete.'); runtime.handlers.free(p, runtime);}; if (ptr(m, object + 24)) {release(ptr(m, object + 24)); put(m, object + 24, 0);} if (ptr(m, object + 20) >= 16) release(ptr(m, object)); if (reset) {put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0;}};
  put(m, manager + 24, 0); put(m, manager + 28, 0);
  if (typeof runtime.services?.platformCall !== 'function') throw Error('Renderer manager requires InitializeCriticalSectionAndSpinCount.'); runtime.services.platformCall('InitializeCriticalSectionAndSpinCount', [manager, 0x1000], runtime);
  for (const offset of [32, 36, 40, 44, 48, 52]) put(m, manager + offset, 0);
  const appendRuntime = vectorRuntime({...runtime, scratchBase: frame - 8});
  let object = allocate(0x120); const hasScene = !!object; if (object) constructRendererScene(object, name(frame + 64, 0x56ff00, 10), {...runtime, scratchBase: frame - 8}); put(m, frame + 24, object); appendGameImagePointer(manager + 32, frame + 24, appendRuntime); if (hasScene) releaseName(frame + 64);
  object = allocate(0x4c); put(m, frame + 24, object); const hasTarget = !!object; if (object) {const targetName = name(frame + 36, 0x56ff0c, 17); object = constructRendererTarget(ptr(m, frame + 24), targetName, get(m, 0x5d0158), {...runtime, scratchBase: frame - 12}); put(m, frame + 24, object);} if (hasTarget) releaseName(frame + 36, true);
  put(m, frame + 28, get(m, frame + 24)); appendGameImagePointer(manager + 44, frame + 28, appendRuntime); object = allocate(0x25c); put(m, frame + 28, object); const hasViewport = !!object;
  if (object) {const sceneName = name(frame + 92, 0x56ff00, 10), viewportName = name(frame + 64, 0x5d0224, 14); object = constructRendererViewport(ptr(m, frame + 28), viewportName, sceneName, 1, {...runtime, scratchBase: frame - 16});}
  put(m, frame + 28, object); appendGameImagePointer(ptr(m, frame + 24) + 64, frame + 28, appendRuntime); if (hasViewport) {releaseName(frame + 64, true); releaseName(frame + 92);} return manager;
}
