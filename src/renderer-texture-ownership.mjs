import {constructRendererTextureResource, resizeRendererResourcePool} from './renderer-resource-pools.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer texture ownership requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//5210d0/521030: assignment leaves vtables and native padding untouched.
//The 400h-byte image area is a forward REP MOVSD, including overlap.
export function assignRendererTextureResource(output, input, {memory: m}) {
  put(m, output + 4, get(m, input ? input + 4 : 0)); put(m, output + 8, get(m, input + 8)); m[output + 12] = m[input + 12];
  for (const offset of [16, 20, 24]) put(m, output + offset, get(m, input + offset));
  for (let offset = 28; offset < 0x41c; offset += 4) put(m, output + offset, get(m, input + offset));
  m[output + 0x41c] = m[input + 0x41c];
  for (let offset = 0x420; offset <= 0x458; offset += 4) put(m, output + offset, get(m, input + offset));
  m[output + 0x45c] = m[input + 0x45c]; m[output + 0x45d] = m[input + 0x45d]; return output;
}

//51f0f0/51f150/514120. Preserve an aliased input index across reallocation.
function appendAllocatedIndex(vector, input, runtime) {
  const m = runtime.memory, begin = ptr(m, vector), end = ptr(m, vector + 4), aliased = input < end && begin <= input, index = input - begin >> 2;
  if (end === ptr(m, vector + 8)) {
    const size = end - begin >> 2, capacity = get(m, vector + 8) - begin >> 2, half = capacity >>> 1;
    if (size === 0x3fffffff) throw RangeError('Native vector length error.');
    const count = Math.max(size + 1, 0x3fffffff - half < (capacity >>> 0) ? 0 : capacity + half);
    const output = library(runtime, 'operatorNew', [count * 4]) >>> 0; if (!output) throw Error('Native vector bad_alloc.');
    for (let p = begin, q = output; p < end; p += 4, q += 4) put(m, q, get(m, p));
    const liveBegin = ptr(m, vector), length = get(m, vector + 4) - liveBegin >> 2;
    if (liveBegin) library(runtime, 'operatorDelete', [liveBegin]);
    put(m, vector + 8, output + count * 4); put(m, vector, output); put(m, vector + 4, output + length * 4);
  }
  const output = ptr(m, vector + 4); if (output) put(m, output, get(m, aliased ? ptr(m, vector) + index * 4 : input)); put(m, vector + 4, get(m, vector + 4) + 4);
}

//520ee0: consume the circular free-index queue, retain the ID in the live
//allocated vector, and assign a freshly constructed native temporary.
export function acquireRendererTextureIndex(pool, output, runtime) {
  const {memory: m, scratchBase} = runtime;
  if (!Number.isInteger(scratchBase)) throw Error('Renderer texture acquisition requires the native entry ESP.');
  const frame = ((scratchBase - 4) & ~7) - 0x478;
  if (!get(m, pool + 0x24)) {const count = ptr(m, pool + 4); resizeRendererResourcePool(pool, count + Math.max(count >>> 1, 32) >>> 0, 'texture', {...runtime, scratchBase: frame - 8});}
  //40eec0 publishes the real iterator into the parent's local storage.
  put(m, frame + 12, ptr(m, pool + 20)); put(m, frame + 16, 0); put(m, frame + 20, ptr(m, pool + 32));
  const holder = ptr(m, frame + 12), deque = holder ? ptr(m, holder) : 0, offset = ptr(m, frame + 20), block = ptr(m, ptr(m, deque + 4) + ((offset >>> 2 & ptr(m, deque + 8) - 1) * 4));
  put(m, output, get(m, block + (offset & 3) * 4));
  put(m, pool + 36, get(m, pool + 36) - 1); put(m, pool + 32, get(m, pool + 36) ? get(m, pool + 32) + 1 : 0);
  appendAllocatedIndex(pool + 40, output, {...runtime, scratchBase: frame - 8});
  const index = ptr(m, output), temporary = frame + 24; constructRendererTextureResource(temporary, {...runtime, scratchBase: frame - 4});
  assignRendererTextureResource(ptr(m, ptr(m, pool) + index * 4), temporary, {...runtime, scratchBase: frame - 8}); return output;
}

//5208d0: grow the matching integer-ID pool only when texture storage grows.
export function obtainRendererTextureIndex(manager, output, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 16, oldCount = ptr(m, manager + 0x490), temporary = frame + 12;
  acquireRendererTextureIndex(manager + 0x48c, temporary, {...runtime, scratchBase: frame - 8});
  if (oldCount !== ptr(m, manager + 0x490)) {
    let index = ptr(m, manager + 0x894); resizeRendererResourcePool(manager + 0x890, ptr(m, manager + 0x490), 'integer', {...runtime, scratchBase: frame - 8});
    for (; index < ptr(m, manager + 0x894); index++) put(m, ptr(m, ptr(m, manager + 0x890) + index * 4), index);
  }
  put(m, output, get(m, temporary));
}
