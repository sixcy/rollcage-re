import {assignViewportString, growViewportString} from './weather-viewport.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const data = (m, p) => ptr(m, p + 20) >= 16 ? ptr(m, p) : p;
const cLength = (m, p) => {let n = 0; while (m[p + n]) n++; return n;};
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer startup string requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const storageRuntime = r => ({...r, handlers: {...r.handlers, allocate: size => library(r, 'operatorNew', [size]), free: p => library(r, 'operatorDelete', [p])}});
const copy = (m, output, input, length) => Buffer.from(m.subarray(input, input + length)).copy(m, output);

//401f10/401f70. The extra owner DWORD+18h is independent of SSO storage.
export function constructRendererString(object, input, runtime) {
  const {memory: m, scratchBase: s} = runtime; put(m, s + 4, input); const source = input || 0x56fe6b;
  put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0;
  assignViewportString(object, source, cLength(m, source), storageRuntime({...runtime, scratchBase: s - 16})); put(m, object + 24, 0); return object;
}
export function destroyRendererString(object, runtime) {
  const m = runtime.memory, owner = ptr(m, object + 24);
  if (owner) {library(runtime, 'operatorDeleteArray', [owner]); put(m, object + 24, 0);}
  if (ptr(m, object + 20) >= 16) library(runtime, 'operatorDelete', [ptr(m, object)]);
  put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0;
}

//4054b0. Reserve, optional conversion back into inline storage, or clear.
export function ensureRendererString(object, requested, shrink, runtime) {
  const m = runtime.memory; requested >>>= 0;
  if (requested > 0xfffffffe) throw RangeError('Native string length error.');
  const capacity = ptr(m, object + 20);
  if (capacity < requested) growViewportString(object, requested, ptr(m, object + 16), storageRuntime(runtime));
  else if ((shrink & 255) !== 0 && requested < 16) {
    const length = Math.min(ptr(m, object + 16), requested);
    if (capacity >= 16) {const allocation = ptr(m, object); if (length) copy(m, object, allocation, length); library(runtime, 'operatorDelete', [allocation]);}
    put(m, object + 16, length); put(m, object + 20, 15); m[object + length] = 0;
  } else if (!requested) {put(m, object + 16, 0); m[capacity >= 16 ? ptr(m, object) : object] = 0;}
  return requested !== 0 ? 1 : 0;
}

//4a31e0. Retain source-object identity through destination reallocation.
export function appendRendererStringSlice(object, inputObject, offset, requested, runtime) {
  const {memory: m, scratchBase: s} = runtime; [inputObject, offset, requested].forEach((v, i) => put(m, s + 4 + i * 4, v));
  const inputLength = ptr(m, inputObject + 16); offset >>>= 0;
  if (inputLength < offset) throw RangeError('Native string substring offset error.');
  const count = Math.min(inputLength - offset, requested >>> 0), oldLength = ptr(m, object + 16);
  if ((0xffffffff - oldLength >>> 0) <= count) throw RangeError('Native string length error.');
  if (!count) return object;
  const total = oldLength + count; if (ensureRendererString(object, total, 0, runtime)) {
    const input = data(m, inputObject), output = data(m, object), liveOffset = ptr(m, s + 8);
    copy(m, output + ptr(m, object + 16), input + liveOffset, count); put(m, object + 16, total); m[data(m, object) + total] = 0;
  }
  return object;
}

//4a30a0. Self-range append dispatches to the actual substring algorithm.
export function appendRendererString(object, input, count, runtime) {
  const {memory: m, scratchBase: s} = runtime; put(m, s + 4, input); put(m, s + 8, count);
  const start = data(m, object), length = ptr(m, object + 16);
  if (input && input >= start && input < start + length) return appendRendererStringSlice(object, object, input - start, count, {...runtime, scratchBase: s - 24});
  count >>>= 0; if ((0xffffffff - length >>> 0) <= count) throw RangeError('Native string length error.');
  if (!count) return object;
  const total = length + count;
  if (ensureRendererString(object, total, 0, runtime)) {copy(m, data(m, object) + ptr(m, object + 16), input, count); put(m, object + 16, total); m[data(m, object) + total] = 0;}
  return object;
}

//4a2b40. Genuine CRT stack probing/varargs formatting precedes actual SSO
//assignment. The caller's raw varargs occupy entry ESP+12 onwards.
export function formatRendererString(output, format, args, runtime) {
  const {memory: m, scratchBase: s} = runtime, buffer = s - 0x1000;
  [output, format, ...args].forEach((v, i) => put(m, s + 4 + i * 4, v));
  library(runtime, '_vsnprintf', [buffer, 0x1000, ptr(m, s + 8), s + 12]);
  assignViewportString(ptr(m, s + 4), buffer, cLength(m, buffer), storageRuntime({...runtime, scratchBase: buffer - 12})); return ptr(m, s + 4);
}

const wideData = (m, p) => ptr(m, p + 20) >= 8 ? ptr(m, p) : p;
const wideLength = (m, p) => {let n = 0; while (m.readUInt16LE(p + n * 2)) n++; return n;};
const platform = (r, name, args) => {if (typeof r.services?.platformCall !== 'function') throw Error(`Renderer startup string requires platform ${name}.`); return r.services.platformCall(name, args, r);};

//40bb70/40b8a0. Wide SSO capacity counts 16-bit code units, not bytes.
export function ensureRendererWideString(object, requested, runtime) {
  const m = runtime.memory; requested >>>= 0;
  if (requested > 0x7ffffffe) throw RangeError('Native wide string length error.');
  if (ptr(m, object + 20) < requested) {
    let capacity = requested | 7;
    if ((capacity >>> 0) > 0x7ffffffe) capacity = requested;
    else {
      const old = ptr(m, object + 20), half = old >>> 1;
      if (half > Math.floor((capacity >>> 0) / 3)) capacity = old > (0x7ffffffe - half >>> 0) ? 0x7ffffffe : old + half;
    }
    const retained = ptr(m, object + 16), allocation = library(runtime, 'operatorNew', [(capacity + 1) * 2]) >>> 0; if (!allocation) throw Error('Native wide string bad_alloc.');
    if (retained) copy(m, allocation, wideData(m, object), retained * 2);
    if (ptr(m, object + 20) >= 8) library(runtime, 'operatorDelete', [ptr(m, object)]);
    put(m, object, allocation); put(m, object + 20, capacity); put(m, object + 16, retained); m.writeUInt16LE(0, wideData(m, object) + retained * 2);
  } else if (!requested) {put(m, object + 16, 0); m.writeUInt16LE(0, wideData(m, object));}
  return requested ? 1 : 0;
}

//40b600/40b710, including the self-substring truncate/erase children.
export function assignRendererWideStringSlice(object, sourceObject, offset, requested, runtime) {
  const m = runtime.memory, old = ptr(m, sourceObject + 16); offset >>>= 0;
  if (old < offset) throw RangeError('Native wide substring offset error.');
  const count = Math.min(old - offset, requested >>> 0);
  if (object === sourceObject) {
    const source = wideData(m, object); put(m, object + 16, offset + count); m.writeUInt16LE(0, source + (offset + count) * 2);
    if (offset) copy(m, source, source + offset * 2, count * 2); put(m, object + 16, count); m.writeUInt16LE(0, wideData(m, object) + count * 2);
  } else if (ensureRendererWideString(object, count, runtime)) {copy(m, wideData(m, object), wideData(m, sourceObject) + offset * 2, count * 2); put(m, object + 16, count); m.writeUInt16LE(0, wideData(m, object) + count * 2);}
  return object;
}
export function assignRendererWideString(object, input, count, runtime) {
  const m = runtime.memory, current = wideData(m, object), end = current + ptr(m, object + 16) * 2;
  if (input && input >= current && input < end) return assignRendererWideStringSlice(object, object, (input - current) >> 1, count, runtime);
  count >>>= 0; if (ensureRendererWideString(object, count, runtime)) {copy(m, wideData(m, object), input, count * 2); put(m, object + 16, count); m.writeUInt16LE(0, wideData(m, object) + count * 2);} return object;
}

//4066c0. Conversion always allocates the temporary for a nonnull input,
//including an empty string. The ACP conversion result controls the length.
export function constructRendererWideString(object, input, runtime) {
  const {memory: m, scratchBase: s} = runtime; put(m, s + 4, input); put(m, object + 20, 7); put(m, object + 16, 0); m.writeUInt16LE(0, object); put(m, object + 24, 0);
  if (input) {
    const count = cLength(m, input) + 1, temporary = library(runtime, 'operatorNewArray', [count > 0x7fffffff ? 0xffffffff : count * 2]) >>> 0; m.writeUInt16LE(0, temporary);
    platform(runtime, 'MultiByteToWideChar', [0, 0, input, count, temporary, count]); assignRendererWideString(object, temporary, wideLength(m, temporary), {...runtime, scratchBase: s - 52}); library(runtime, 'operatorDeleteArray', [temporary]);
  }
  return object;
}

//4a29e0. This conversion buffer is owned separately by narrow-string+18h.
export function cacheRendererWideString(object, runtime) {
  const m = runtime.memory, old = ptr(m, object + 24); if (old) {library(runtime, 'operatorDeleteArray', [old]); put(m, object + 24, 0);}
  const input = data(m, object); if (!input) {put(m, object + 24, 0); return 0;}
  const count = cLength(m, input) + 1, temporary = library(runtime, 'operatorNewArray', [count > 0x7fffffff ? 0xffffffff : count * 2]) >>> 0; m.writeUInt16LE(0, temporary);
  platform(runtime, 'MultiByteToWideChar', [0, 0, input, count, temporary, count]); put(m, object + 24, temporary); return temporary;
}
