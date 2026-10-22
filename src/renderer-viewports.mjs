import {assignViewportString} from './weather-viewport.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const stringData = (m, object) => ptr(m, object + 20) >= 16 ? ptr(m, object) : object;
const cLength = (m, p) => {let end = p; while (m[end]) end++; return end - p;};

//401c90: compare exactly length bytes, returning only-1/0/1. Zero length
//does not dereference either input. Embedded zero bytes are ordinary bytes.
export function compareRendererNameBytes(first, second, length, {memory: m}) {
  for (let index = 0; index < (length >>> 0); index++) if (m[first + index] !== m[second + index]) return m[first + index] < m[second + index] ? -1 : 1;
  return 0;
}

//517e30 and516ed0: named renderer root/viewport pointer vectors. These are
//distinct from the Application viewport map used by weather and406c70.
export function findRendererNamedObject(owner, key, children, runtime) {
  const {memory: m, scratchBase} = runtime, offset = children ? 0x40 : 0x2c;
  // Entry PUSH ECX owns this slot even when the vector is empty; each
  // visited candidate later replaces it at frame+10.
  put(m, scratchBase - 4, owner);
  let cursor = ptr(m, owner + offset); const end = ptr(m, owner + offset + 4);
  put(m, scratchBase + 4, key);
  while (cursor !== end) {
    const candidate = ptr(m, cursor); put(m, scratchBase - 4, candidate);
    const incoming = stringData(m, ptr(m, scratchBase + 4)), length = cLength(m, incoming), ownKey = candidate + 20;
    const ownLength = ptr(m, ownKey + 16), ownData = stringData(m, ownKey);
    const order = compareRendererNameBytes(ownData, incoming, Math.min(ownLength, length), runtime);
    if (order === 0 && ownLength === length) return candidate;
    cursor = (cursor + 4) >>> 0;
  }
  return 0;
}

//40ad40/40aeb0. Resolve original0 Player through actual renderer lists, then
//read8c/90. A missing root uses configured dimensions, doubled only when
//both the config option and live6e6c04 state request it.
export function readRendererViewportExtent(height, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 64;
  put(m, frame + 0x3c, get(m, 0x5e8890) ^ (scratchBase - 60));
  const constructKey = key => {
    put(m, key + 20, 15); put(m, key + 16, 0); m[key] = 0;
    assignViewportString(key, 0x5d0254, 8, {...runtime, scratchBase: frame - 12}); put(m, key + 24, 0);
  };
  const destroyKey = key => {
    const release = address => {if (typeof runtime.handlers?.free !== 'function') throw Error('Renderer viewport key requires CRT free.'); runtime.handlers.free(address, runtime);};
    if (ptr(m, key + 24)) {release(ptr(m, key + 24)); put(m, key + 24, 0);}
    if (ptr(m, key + 20) >= 16) release(ptr(m, key));
    put(m, key + 20, 15); put(m, key + 16, 0); m[key] = 0;
  };
  constructKey(frame + 4);
  const root = findRendererNamedObject(ptr(m, 0x6e6388), frame + 4, false, {...runtime, scratchBase: frame - 8}); destroyKey(frame + 4);
  if (!root) {
    const configuration = ptr(m, 0x5ecefc), scale = m[configuration + 0x41a] && get(m, 0x6e6c04) ? 2 : 1;
    return Math.imul(m.readUInt16LE(configuration + (height ? 0x42e : 0x42c)), scale);
  }
  constructKey(frame + 0x20);
  const viewport = findRendererNamedObject(root, frame + 0x20, true, {...runtime, scratchBase: frame - 8}); destroyKey(frame + 0x20);
  return get(m, viewport + (height ? 0x90 : 0x8c));
}
