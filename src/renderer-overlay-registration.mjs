import {assignViewportString, findViewportLowerBound} from './weather-viewport.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const map = 0x6f2d34, data = (m, p) => ptr(m, p + 20) > 15 ? ptr(m, p) : p;
const cLength = (m, p) => {let end = p; while (m[end]) end++; return end - p;};
const compare = (m, a, an, b, bn) => {for (let i = 0, n = Math.min(an, bn); i < n; i++) if (m[a + i] !== m[b + i]) return m[a + i] < m[b + i] ? -1 : 1; return an < bn ? -1 : an > bn ? 1 : 0;};
const compareKey = (m, key, other) => compare(m, data(m, key), ptr(m, key + 16), data(m, other), cLength(m, data(m, other)));
const release = (runtime, p) => {if (typeof runtime.handlers?.free !== 'function') throw Error('Renderer overlay map requires CRT delete.'); runtime.handlers.free(p, runtime);};

//Static initializer401a40, independently decoded from original Listing;
//51b8a0 owns the56-byte sentinel and atexit owns the retained destructor.
export function initializeRendererOverlayRegistry(runtime) {
  const m = runtime.memory; if (typeof runtime.handlers?.allocate !== 'function') throw Error('Renderer overlay bootstrap requires CRT allocation.'); const head = runtime.handlers.allocate(56, runtime) >>> 0; if (!head) throw Error('Native std::_Xbad_alloc: renderer overlay sentinel.'); for (const offset of [0, 4, 8]) put(m, head + offset, head); m.writeUInt16LE(0x101, head + 12); put(m, map, head);
  if (typeof runtime.services?.libraryCall !== 'function') throw Error('Renderer overlay bootstrap requires CRT atexit.'); return runtime.services.libraryCall('atexit', [0x56dc90], runtime) | 0;
}

//51bbd0/51b5b0/51b600, the actual56-byte-node red-black map specialization.
function insertNode(node, parent, left, runtime) {
  const m = runtime.memory;
  if (ptr(m, map + 4) >= 0x4924923) {releaseNode(node, runtime); release(runtime, node); throw RangeError('Native map/set length error.');}
  put(m, map + 4, get(m, map + 4) + 1); put(m, node + 4, parent); const head = ptr(m, map);
  if (parent === head) {put(m, head + 4, node); put(m, head, node); put(m, head + 8, node);}
  else if (left) {put(m, parent, node); if (parent === ptr(m, ptr(m, map))) put(m, ptr(m, map), node);}
  else {put(m, parent + 8, node); if (parent === ptr(m, ptr(m, map) + 8)) put(m, ptr(m, map) + 8, node);}
  const rotate = (root, right) => {
    const offset = right ? 0 : 8, opposite = right ? 8 : 0, other = ptr(m, root + offset); put(m, root + offset, get(m, other + opposite)); const middle = ptr(m, other + opposite); if (!m[middle + 13]) put(m, middle + 4, root); put(m, other + 4, get(m, root + 4));
    const sentinel = ptr(m, map); if (root === ptr(m, sentinel + 4)) put(m, sentinel + 4, other); else {const ancestor = ptr(m, root + 4); put(m, ancestor + (root === ptr(m, ancestor + opposite) ? opposite : offset), other);} put(m, other + opposite, root); put(m, root + 4, other);
  };
  let current = node;
  while (!m[ptr(m, current + 4) + 12]) {
    let p = ptr(m, current + 4), grand = ptr(m, p + 4);
    if (p === ptr(m, grand)) {const uncle = ptr(m, grand + 8); if (!m[uncle + 12]) {m[p + 12] = 1; m[uncle + 12] = 1; m[grand + 12] = 0; current = grand;} else {if (current === ptr(m, p + 8)) {rotate(p, false); current = p;} p = ptr(m, current + 4); grand = ptr(m, p + 4); m[p + 12] = 1; m[grand + 12] = 0; rotate(grand, true);}}
    else {const uncle = ptr(m, grand); if (!m[uncle + 12]) {m[p + 12] = 1; m[uncle + 12] = 1; m[grand + 12] = 0; current = grand;} else {if (current === ptr(m, p)) {rotate(p, true); current = p;} p = ptr(m, current + 4); grand = ptr(m, p + 4); m[p + 12] = 1; m[grand + 12] = 0; rotate(grand, false);}}
  }
  m[ptr(m, ptr(m, map) + 4) + 12] = 1;
}

//51bf00, used when an insertion discovers an existing equivalent key.
function releaseNode(node, runtime) {const m = runtime.memory; if (ptr(m, node + 44)) {release(runtime, ptr(m, node + 44)); for (const offset of [44, 48, 52]) put(m, node + offset, 0);} if (ptr(m, node + 40)) {release(runtime, ptr(m, node + 40)); put(m, node + 40, 0);} if (ptr(m, node + 36) >= 16) release(runtime, ptr(m, node + 16)); put(m, node + 36, 15); put(m, node + 32, 0); m[node + 16] = 0;}

//51b390 returns an iterator through its first output parameter.
export function findRendererOverlay(key, runtime) {const m = runtime.memory, found = findViewportLowerBound(map, key, runtime); return found !== ptr(m, map) && compareKey(m, key, found + 16) >= 0 ? found : ptr(m, map);}

//51b080 and reached51b8d0/51bb90/51b990/51bd90. Lower-bound hint and
//fallback converge on the same exact unique-key insertion position.
export function obtainRendererOverlayVector(key, runtime) {
  const m = runtime.memory, found = findRendererOverlay(key, runtime); if (found !== ptr(m, map)) return found + 44;
  if (typeof runtime.handlers?.allocate !== 'function') throw Error('Renderer overlay map requires CRT allocation.'); const node = runtime.handlers.allocate(56, runtime) >>> 0; if (!node) throw Error('Native std::_Xbad_alloc: renderer overlay node.');
  for (const offset of [0, 4, 8]) put(m, node + offset, get(m, map)); m.writeUInt16LE(0, node + 12); put(m, node + 36, 15); put(m, node + 32, 0); m[node + 16] = 0; assignViewportString(node + 16, data(m, key), ptr(m, key + 16), runtime); for (const offset of [40, 44, 48, 52]) put(m, node + offset, 0);
  let parent = ptr(m, map), cursor = ptr(m, parent + 4), left = true;
  while (!m[cursor + 13]) {parent = cursor; const relation = compareKey(m, node + 16, cursor + 16); if (!relation) {releaseNode(node, runtime); release(runtime, node); return cursor + 44;} left = relation < 0; cursor = ptr(m, cursor + (left ? 0 : 8));}
  insertNode(node, parent, left, runtime); return node + 44;
}

//51b3f0: vector move assignment, preserving source/destination alias order.
export function moveRendererOverlayVector(output, source, runtime) {
  const m = runtime.memory; if (output !== source) {if (ptr(m, output)) {release(runtime, ptr(m, output)); for (const offset of [0, 4, 8]) put(m, output + offset, 0);} for (const offset of [0, 4, 8]) put(m, output + offset, get(m, source + offset)); for (const offset of [0, 4, 8]) put(m, source + offset, 0);} return output;
}

//51a650. Registering an existing viewport name keeps its overlay vector;
//only a missing key receives the empty vector created by this constructor.
export function registerRendererViewport(viewport, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28, key = viewport + 20; put(m, scratchBase + 4, viewport); const found = findRendererOverlay(key, runtime); put(m, scratchBase + 4, found);
  if (found === ptr(m, map)) {for (const offset of [4, 8, 12]) put(m, frame + offset, 0); const vector = obtainRendererOverlayVector(key, runtime); moveRendererOverlayVector(vector, frame + 4, runtime); if (ptr(m, frame + 4)) release(runtime, ptr(m, frame + 4));}
}
