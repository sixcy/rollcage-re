import {obtainViewportApplication} from './application-bootstrap.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const copy = (m, dest, source, size) => Buffer.from(m.subarray(source, source + size)).copy(m, dest);
const stringData = (m, object) => ptr(m, object + 20) > 15 ? ptr(m, object) : object;
const cLength = (m, data) => {let end = data; while (m[end]) end++; return end - data;};
function allocate(runtime, size) {if (typeof runtime.handlers?.allocate !== 'function') throw Error('Viewport map requires CRT allocation.'); const result = runtime.handlers.allocate(size, runtime) >>> 0; if (!result) throw Error('Viewport CRT allocation failed.'); return result;}
function release(runtime, data) {if (typeof runtime.handlers?.free !== 'function') throw Error('Viewport string requires CRT free.'); runtime.handlers.free(data, runtime);}

//405860. Preserve the original growth rule and live old capacity/length reads.
export function growViewportString(object, requested, retained, runtime) {
  const {memory: m} = runtime, rounded = requested | 15; let capacity = requested;
  if (rounded !== -1) {const old = ptr(m, object + 20), half = old >>> 1; capacity = rounded >>> 0; if (Math.trunc(capacity / 3) < half) capacity = old > (0xfffffffe - half >>> 0) ? 0xfffffffe : old + half;}
  const data = allocate(runtime, (capacity + 1) >>> 0); if (retained) copy(m, data, stringData(m, object), retained);
  if (ptr(m, object + 20) > 15) release(runtime, ptr(m, object));
  m[object] = 0; put(m, object, data); put(m, object + 20, capacity); put(m, object + 16, retained); m[(capacity > 15 ? data : object) + retained] = 0;
}

//405310 /405150 reached string assignments. The explicit source lengths keep
//embedded zero bytes; buffers and capacities remain native memory fields.
export function assignViewportString(object, source, length, runtime) {
  const {memory: m} = runtime, oldData = stringData(m, object), oldLength = ptr(m, object + 16);
  if (source && source >= oldData && source < oldData + oldLength) {
    const offset = source - oldData, count = Math.min(oldLength - offset, length >>> 0); copy(m, oldData, oldData + offset, count); put(m, object + 16, count); m[oldData + count] = 0; return;
  }
  if ((length >>> 0) === 0xffffffff) throw RangeError('Native string length error.');
  if (ptr(m, object + 20) < (length >>> 0)) growViewportString(object, length >>> 0, oldLength, runtime);
  const destination = stringData(m, object); if (length) copy(m, destination, source, length); put(m, object + 16, length); m[stringData(m, object) + length] = 0;
}

function compareCString(m, a, aLength, b, bLength) {
  for (let index = 0, count = Math.min(aLength, bLength); index < count; index++) if (m[a + index] !== m[b + index]) return m[a + index] < m[b + index] ? -1 : 1;
  return aLength < bLength ? -1 : aLength > bLength ? 1 : 0;
}

//405720 /404e10. std::map lower_bound and live string comparison.
export function findViewportLowerBound(map, key, {memory: m}) {
  let found = ptr(m, map), node = ptr(m, found + 4);
  while (!m[node + 13]) {
    const data = stringData(m, key), length = cLength(m, data), nodeKey = node + 16;
    if (compareCString(m, stringData(m, nodeKey), ptr(m, nodeKey + 16), data, length) < 0) node = ptr(m, node + 8);
    else {found = node; node = ptr(m, node);}
  }
  return found;
}

//406240 rotations and recoloring. Nil heads retain separate min/root/max links.
function insertMapNode(map, node, parent, left, {memory: m}) {
  if (ptr(m, map + 4) > 0x28f5c26) throw RangeError('Native map length error.');
  put(m, map + 4, get(m, map + 4) + 1); put(m, node + 4, parent);
  const head = ptr(m, map);
  if (parent === head) {put(m, head + 4, node); put(m, head, node); put(m, head + 8, node);}
  else if (left) {put(m, parent, node); if (parent === ptr(m, head)) put(m, head, node);}
  else {put(m, parent + 8, node); if (parent === ptr(m, head + 8)) put(m, head + 8, node);}
  const rotateLeft = root => {
    const other = ptr(m, root + 8); put(m, root + 8, get(m, other)); if (!m[ptr(m, other) + 13]) put(m, ptr(m, other) + 4, root);
    put(m, other + 4, get(m, root + 4));
    if (root === ptr(m, ptr(m, map) + 4)) put(m, ptr(m, map) + 4, other);
    else {const p = ptr(m, root + 4); put(m, p + (root === ptr(m, p) ? 0 : 8), other);}
    put(m, other, root); put(m, root + 4, other);
  };
  const rotateRight = root => {
    const other = ptr(m, root); put(m, root, get(m, other + 8)); if (!m[ptr(m, other + 8) + 13]) put(m, ptr(m, other + 8) + 4, root);
    put(m, other + 4, get(m, root + 4));
    if (root === ptr(m, ptr(m, map) + 4)) put(m, ptr(m, map) + 4, other);
    else {const p = ptr(m, root + 4); put(m, p + (root === ptr(m, p + 8) ? 8 : 0), other);}
    put(m, other + 8, root); put(m, root + 4, other);
  };
  let current = node;
  while (!m[ptr(m, current + 4) + 12]) {
    let p = ptr(m, current + 4), grand = ptr(m, p + 4);
    if (p === ptr(m, grand)) {
      const uncle = ptr(m, grand + 8);
      if (!m[uncle + 12]) {m[p + 12] = 1; m[uncle + 12] = 1; m[grand + 12] = 0; current = grand;}
      else {if (current === ptr(m, p + 8)) {rotateLeft(p); current = p;} p = ptr(m, current + 4); grand = ptr(m, p + 4); m[p + 12] = 1; m[grand + 12] = 0; rotateRight(grand);}
    } else {
      const uncle = ptr(m, grand);
      if (!m[uncle + 12]) {m[p + 12] = 1; m[uncle + 12] = 1; m[grand + 12] = 0; current = grand;}
      else {if (current === ptr(m, p)) {rotateRight(p); current = p;} p = ptr(m, current + 4); grand = ptr(m, p + 4); m[p + 12] = 1; m[grand + 12] = 0; rotateLeft(grand);}
    }
  }
  m[ptr(m, ptr(m, map) + 4) + 12] = 1;
}

//404fa0 /405e60 /4061a0 /406660. A missing viewport receives the original
//default fields, then the actual red-black insertion algorithm publishes it.
export function getOrCreateViewportRecord(map, key, runtime) {
  const {memory: m} = runtime, head = ptr(m, map), found = findViewportLowerBound(map, key, runtime);
  if (found !== head) {
    const data = stringData(m, found + 16), incoming = stringData(m, key);
    if (compareCString(m, incoming, ptr(m, key + 16), data, cLength(m, data)) >= 0) return found + 44;
  }
  const node = allocate(runtime, 100); put(m, node, get(m, map)); put(m, node + 4, get(m, map)); put(m, node + 8, get(m, map)); m.writeUInt16LE(0, node + 12);
  put(m, node + 36, 15); put(m, node + 32, 0); m[node + 16] = 0;
  assignViewportString(node + 16, stringData(m, key), ptr(m, key + 16), runtime);
  put(m, node + 40, 0); for (const offset of [0x40, 0x3c, 0x38, 0x34]) put(m, node + offset, -1); for (const offset of [0x54, 0x58, 0x5c]) put(m, node + offset, 0);
  let parent = head, cursor = ptr(m, head + 4), left = true;
  while (!m[cursor + 13]) {parent = cursor; const a = stringData(m, key), b = stringData(m, cursor + 16); left = compareCString(m, a, ptr(m, key + 16), b, cLength(m, b)) < 0; cursor = ptr(m, cursor + (left ? 0 : 8));}
  insertMapNode(map, node, parent, left, runtime); return node + 44;
}

//402d10. Actual application/debugger bootstrap precedes the original CRT RTTI
//service, rather than a guessed multiple-inheritance base offset.
export function getViewportApplication(runtime) {
  const application = obtainViewportApplication(runtime);
  if (typeof runtime.handlers?.dynamicCast !== 'function') throw Error('Viewport application requires CRT dynamicCast.');
  return runtime.handlers.dynamicCast(application, 0, 0x6e213c, 0x6e20a4, 0, runtime) >>> 0;
}

//40ab70 /407050. Native outputs are ordered writes and may alias each other.
export function queryWeatherViewport(name, xOut, yOut, widthOut, heightOut, runtime) {
  const {memory: m, scratchBase} = runtime;
  if (!m[name]) {
    const current = ptr(m, 0x6efb3c); let from = ptr(m, current + 40) >= 16 ? ptr(m, current + 20) : current + 20, dest = name;
    do {m[dest++] = m[from++];} while (m[dest - 1]);
    const y = get(m, current + 0x88); put(m, xOut, get(m, current + 0x84)); put(m, yOut, y); put(m, widthOut, get(m, current + 0x8c)); put(m, heightOut, get(m, current + 0x90)); return;
  }
  const application = getViewportApplication({...runtime, scratchBase: scratchBase - 44}), entry = scratchBase - 40, frame = entry - 72, key = frame + 0x1c;
  put(m, frame + 0x18, application); put(m, frame + 0x14, heightOut); put(m, key + 20, 15); put(m, key + 16, 0); m[key] = 0;
  assignViewportString(key, name, cLength(m, name), runtime); put(m, frame + 0x34, 0);
  const record = getOrCreateViewportRecord(application + 0x7c, key, runtime);
  if (ptr(m, frame + 0x34)) {release(runtime, ptr(m, frame + 0x34)); put(m, frame + 0x34, 0);}
  if (ptr(m, key + 20) >= 16) release(runtime, ptr(m, key)); put(m, key + 20, 15); put(m, key + 16, 0); m[key] = 0;
  put(m, xOut, get(m, record + 8)); put(m, yOut, get(m, record + 12)); put(m, widthOut, get(m, record + 16)); put(m, heightOut, get(m, record + 20));
}

//40ac40 /40acc0 construct the original mutable eight-byte player-view name.
export function readWeatherViewportExtent(height, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 0x124;
  put(m, frame + 0x11c, ptr(m, 0x5e8890) ^ frame); m[frame + 0x18] = m[0x5d025c]; blockName(m, frame + 0x10); m.fill(0, frame + 0x19, frame + 0x114);
  queryWeatherViewport(frame + 0x10, frame + 8, height ? frame + 4 : frame + 4, height ? frame + 12 : frame, height ? frame : frame + 12, {...runtime, scratchBase: frame - 16});
  return get(m, frame);
}
function blockName(memory, output) {copy(memory, output, 0x5d0254, 8);}
