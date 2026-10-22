import {appendGameImagePointer} from './game-image-storage.mjs';
import {compareRendererNameBytes} from './renderer-viewports.mjs';
import {assignViewportString} from './weather-viewport.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer target registration requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const move = (m, target, source, count) => {Buffer.from(m.subarray(source, source + count)).copy(m, target); return target;};
const stringData = (m, p) => ptr(m, p + 20) >= 16 ? ptr(m, p) : p;

//402e80/402ec0. These are native std::string constructors with the extra
//owner DWORD at+18, separate from the application map's key object.
export function constructRendererStockName(output, target, runtime) {
  const {memory: m, scratchBase: s} = runtime;
  put(m, s - 4, 0); put(m, output + 20, 15); put(m, output + 16, 0); m[output] = 0;
  assignViewportString(output, target ? 0x56ff0c : 0x56ff00, target ? 17 : 10, {...runtime, scratchBase: s - 20});
  put(m, output + 24, 0); return output;
}

//518060/518220/518260/518290. Native one-element vector insertion, with
//live aliased input and iterator slots across allocation and shifting.
export function insertRendererTargetPointer(vector, outputIterator, position, unused, input, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 24;
  [outputIterator, position, unused, input].forEach((v, i) => put(m, s + 4 + i * 4, v));
  const begin = ptr(m, vector), end = ptr(m, vector + 4); put(m, f + 0x14, (position - begin) >> 2); put(m, f + 0x10, end);
  if ((((get(m, vector + 8) - end) >> 2) >>> 0) < 1) {
    const size = (end - begin) >> 2;
    if ((0x3fffffff - size >>> 0) < 1) throw RangeError('Native renderer target vector length error.');
    const capacity = (get(m, vector + 8) - get(m, vector)) >> 2, half = capacity >>> 1;
    const count = Math.max(size + 1, (0x3fffffff - half >>> 0) < (capacity >>> 0) ? 0 : capacity + half);
    put(m, f + 0x10, count);
    const allocation = library(runtime, 'operatorNew', [count * 4]) >>> 0; if (!allocation) throw Error('Native renderer target vector bad_alloc.');
    const livePosition = ptr(m, f + 0x20), relative = (livePosition - get(m, vector)) >> 2, value = get(m, ptr(m, f + 0x28));
    put(m, allocation + relative * 4, value);
    let source = ptr(m, vector); move(m, allocation, source, livePosition - source & ~3);
    source = ptr(m, f + 0x20); move(m, allocation + (relative + 1) * 4, source, get(m, vector + 4) - source & ~3);
    const old = ptr(m, vector), length = ((get(m, vector + 4) - old) >> 2) + 1;
    if (old) library(runtime, 'operatorDelete', [old]);
    put(m, vector, allocation); put(m, vector + 8, allocation + get(m, f + 0x10) * 4); put(m, vector + 4, allocation + length * 4);
  } else {
    const remaining = (end - position) >> 2, value = get(m, input); put(m, f + 0x28, value);
    if ((remaining >>> 0) < 1) {
      move(m, position + 4, position, remaining * 4);
      const oldEnd = ptr(m, vector + 4), extra = 1 - ((get(m, vector + 4) - get(m, f + 0x20)) >> 2);
      for (let i = 0; i < extra; i++) put(m, oldEnd + i * 4, value);
      put(m, vector + 4, get(m, vector + 4) + 4);
      let cursor = ptr(m, f + 0x20), limit = ptr(m, vector + 4) - 4;
      while (cursor < limit) {put(m, cursor, get(m, f + 0x28)); cursor += 4;}
    } else {
      const last = end - 4, bytes = ((end - last) >> 2) * 4;
      put(m, vector + 4, move(m, end, last, bytes) + bytes);
      position = ptr(m, f + 0x20); const count = ((last - position) >> 2) * 4;
      move(m, get(m, f + 0x10) - count, position, count);
      position = ptr(m, f + 0x20); put(m, position, get(m, f + 0x28));
    }
  }
  const result = ptr(m, vector) + get(m, f + 0x14) * 4; put(m, ptr(m, f + 0x1c), result);
}

//517d70. A matching stock name INSERTS before the existing target; it does
//not replace or delete it. End is reloaded after every unsuccessful match.
export function registerRendererTarget(owner, target, key, unused, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 20;
  [target, key, unused].forEach((v, i) => put(m, s + 4 + i * 4, v)); put(m, f + 0x10, owner);
  if (key) {
    let cursor = ptr(m, owner + 0x2c); put(m, f + 0x1c, owner + 0x2c);
    while (cursor !== ptr(m, owner + 0x30)) {
      const own = ptr(m, cursor) + 20, data = stringData(m, key); let length = 0; while (m[data + length]) length++;
      const ownLength = ptr(m, own + 16), ownData = stringData(m, own);
      if (compareRendererNameBytes(ownData, data, Math.min(ownLength, length), runtime) === 0 && ownLength === length) {
        insertRendererTargetPointer(ptr(m, f + 0x1c), f + 0x10, cursor, 0, f + 0x18, {...runtime, scratchBase: f - 20}); return;
      }
      owner = ptr(m, f + 0x10); cursor += 4;
    }
  }
  appendGameImagePointer(owner + 0x2c, f + 0x18, {...runtime, scratchBase: f - 8});
}
