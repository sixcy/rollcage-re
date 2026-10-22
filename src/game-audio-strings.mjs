import {growGameStringBuffer} from './game-string-buffer.mjs';
import {compareRendererNameBytes} from './renderer-viewports.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);
const data = (m, object) => ptr(m, object + 20) >= 16 ? ptr(m, object) : object;
function crt(runtime, name, args, top, returned) {
  const m = runtime.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const entry = top - args.length * 4 - 4; put(m, entry, returned);
  if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Audio strings require CRT ${name}.`);
  return runtime.services.libraryCall(name, args.map((_, i) => ptr(m, entry + 4 + i * 4)), {...runtime, scratchBase: entry});
}
function save(runtime, S, rows) {for (const [register, offset] of rows) if (Number.isInteger(runtime.entryRegisters?.[register])) put(runtime.memory, S + offset, runtime.entryRegisters[register]);}
function fatal(runtime, name, literal, S, returned) {crt(runtime, name, [literal], S, returned); throw Error(`Nonreturning CRT ${name} returned.`);}

//405410. In-place erase; start/count are unsigned and tail reads remain live.
export function eraseGameString(object, start, count, runtime) {
  const {memory: m, scratchBase: S} = runtime; start >>>= 0; count >>>= 0;
  save(runtime, S, [['ESI', -4], ['EDI', -8]]); const length = ptr(m, object + 16);
  if (length < start) fatal(runtime, '_Xout_of_range', 0x57027c, S - 8, 0x40542a);
  if ((length - start >>> 0) <= count) {const output = data(m, object); put(m, object + 16, start); m[output + start] = 0;}
  else if (count) {
    const output = data(m, object), remaining = length - count >>> 0, tail = remaining - start >>> 0;
    save(runtime, S, [['EBX', -12]]);
    if (tail) crt(runtime, 'memmove', [output + start, output + start + count, tail], S - 12, 0x40547f);
    const liveData = data(m, object); put(m, object + 16, remaining); m[liveData + remaining] = 0;
  }
  return object;
}

//405150. Assign a substring of another native string, including self-erasure.
//Actual405860 owns allocation growth, including its private SEH frame and
//ordered CRT calls. The input's live data is read after growth.
export function assignGameStringSubstring(object, input, offset, maximum, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 16; offset >>>= 0; maximum >>>= 0;
  save(runtime, S, [['EBX', -4], ['EBP', -8], ['ESI', -12], ['EDI', -16]]);
  put(m, S + 4, input); put(m, S + 8, offset); put(m, S + 12, maximum);
  const length = ptr(m, input + 16);
  if (length < offset) fatal(runtime, '_Xout_of_range', 0x57027c, F, 0x405170);
  const size = Math.min(length - offset >>> 0, maximum);
  if (object === input) {
    const end = size + offset >>> 0;
    if (ptr(m, object + 16) < end) fatal(runtime, '_Xout_of_range', 0x57027c, F, 0x405192);
    const output = data(m, object); put(m, object + 16, end); m[output + end] = 0;
    put(m, F - 4, offset); put(m, F - 8, 0); put(m, F - 12, 0x4051ab);
    return eraseGameString(object, 0, offset, {...runtime, scratchBase: F - 12, entryRegisters: {...runtime.entryRegisters, EBX: input, EBP: offset, ESI: object, EDI: size}});
  }
  if (size > 0xfffffffe) fatal(runtime, '_Xlength_error', 0x57026c, F, 0x4051c4);
  const oldCapacity = ptr(m, object + 20);
  if (oldCapacity < size) {
    const oldLength = ptr(m, object + 16); put(m, F - 4, oldLength); put(m, F - 8, size); put(m, F - 12, 0x4051d4);
    const child = {...runtime, scratchBase: F - 12, entryRegisters: {...runtime.entryRegisters, EBX: input, EBP: offset, ESI: object, EDI: size}};
    growGameStringBuffer(object, size, oldLength, child);
    if (!size) return object;
  } else if (!size) {const output = data(m, object); put(m, object + 16, 0); m[output] = 0; return object;}
  const source = data(m, input), output = data(m, object);
  if (size) crt(runtime, 'memcpy', [output, source + offset, size], F, 0x405221);
  const liveData = data(m, object); put(m, object + 16, size); m[liveData + size] = 0; return object;
}

//4a2fc0. Three-argument substring construction through actual405150.
export function constructGameStringSubstring(input, object, offset, maximum, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  put(m, S + 4, object); put(m, S + 8, offset); put(m, S + 12, maximum);
  put(m, S - 4, 0); save(runtime, S, [['ESI', -8]]);
  put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0;
  put(m, S - 12, maximum); put(m, S - 16, offset); put(m, S - 20, input); put(m, S - 24, 0x4a2fef);
  assignGameStringSubstring(object, input, offset, maximum, {...runtime, scratchBase: S - 24, entryRegisters: {...runtime.entryRegisters, ESI: object}}); return object;
}

//4a3180. Native move: small buffers copy bytes; large buffers transfer their
//pointer. Metadata is read live before resetting the source to empty SSO.
export function moveGameString(object, input, runtime) {
  const {memory: m, scratchBase: S} = runtime; save(runtime, S, [['ESI', -4], ['EDI', -8]]); put(m, S + 4, input);
  if (ptr(m, input + 20) < 16) {
    const bytes = ptr(m, input + 16) + 1 >>> 0;
    if (bytes) crt(runtime, 'memmove', [object, input, bytes], S - 8, 0x4a319d);
  } else {if (object) put(m, object, get(m, input)); put(m, input, 0);}
  put(m, object + 16, get(m, input + 16)); put(m, object + 20, get(m, input + 20));
  put(m, input + 20, 15); put(m, input + 16, 0); m[input] = 0;
}

//4a2bb0. Output has an additional owned pointer at+24, initialized to zero.
export function sliceGameAudioString(input, object, offset, maximum, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 56, temporary = F + 16;
  put(m, S + 4, object); put(m, S + 8, offset); put(m, S + 12, maximum);
  put(m, S - 4, -1); put(m, S - 8, 0x56a1b9); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, S, [['EBX', -48], ['ESI', -52], ['EDI', -56]]); put(m, F + 12, 0);
  put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0; put(m, object + 24, 0);
  put(m, S - 4, 0); const length = ptr(m, input + 16); put(m, F + 12, 1); offset >>>= 0; maximum >>>= 0;
  if (offset < length) {
    if ((offset + maximum >>> 0) > length) maximum = length - offset >>> 0;
    put(m, F - 4, maximum); put(m, F - 8, offset); put(m, F - 12, temporary); put(m, F - 16, 0x4a2c29);
    constructGameStringSubstring(input, temporary, offset, maximum, {...runtime, scratchBase: F - 16, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, EBX: input, ESI: object, EDI: length}});
    if (object !== temporary) {
      if (ptr(m, object + 20) >= 16) crt(runtime, 'operatorDelete', [ptr(m, object)], F, 0x4a2c3f);
      put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0;
      put(m, F - 4, temporary); put(m, F - 8, 0x4a2c5b); moveGameString(object, temporary, {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, EBX: temporary, ESI: object, EDI: ptr(m, 0x56e210)}});
    }
    if (ptr(m, temporary + 20) >= 16) crt(runtime, 'operatorDelete', [ptr(m, temporary)], F, 0x4a2c6b);
  }
  return object;
}

//40cfa0. Prefix slice, with original caller-owned argument cleanup.
export function sliceGameAudioPrefix(input, object, length, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  put(m, S + 4, object); put(m, S + 8, length); put(m, S - 4, 0);
  put(m, S - 8, length); put(m, S - 12, 0); put(m, S - 16, object); put(m, S - 20, 0x40cfb8);
  sliceGameAudioString(input, object, 0, length, {...runtime, scratchBase: S - 20}); return ptr(m, S + 4);
}

//404e10 uses existing actual401c90 byte comparison; prefix equality40cfc0
//therefore tests the first strlen(name) bytes, not complete-name equality.
export function compareGameStringCString(object, name, runtime) {
  const {memory: m, scratchBase: S} = runtime; let size = 0; while (m[name + size]) size++;
  put(m, S + 4, name); save(runtime, S, [['ESI', -4], ['EDI', -8]]);
  const length = ptr(m, object + 16), count = Math.min(length, size);
  put(m, S - 12, count); put(m, S - 16, 0x404e45); put(m, S - 20, size);
  const result = compareRendererNameBytes(data(m, object), name, count, runtime);
  return result || (length < size ? -1 : length > size ? 1 : 0);
}
export function gameAudioNameHasPrefix(input, name, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 60, temporary = F + 16, probe = S - 44;
  put(m, S + 4, name); put(m, S - 4, 0xffffffff); put(m, S - 8, 0x569c88); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  put(m, S - 16, ptr(m, 0x5e8890) ^ probe); save(runtime, S, [['EBX', -48], ['ESI', -52], ['EDI', -56]]); put(m, F, ptr(m, 0x5e8890) ^ (S - 56));
  let length = 0; while (m[name + length]) length++;
  put(m, F - 4, length); put(m, F - 8, temporary); put(m, F - 12, 0x40d016);
  const child = {...runtime, sehWord: S - 12, entryRegisters: {...runtime.entryRegisters, ESI: name, EDI: name + 1}};
  sliceGameAudioPrefix(input, temporary, length, {...child, scratchBase: F - 12});
  put(m, F - 4, name); put(m, S - 4, 0); put(m, F - 8, 0x40d026);
  const result = compareGameStringCString(temporary, name, {...child, scratchBase: F - 8}) === 0;
  if (ptr(m, F + 40)) {crt(runtime, 'operatorDeleteArray', [ptr(m, F + 40)], F, 0x40d03a); put(m, F + 40, 0);}
  if (ptr(m, temporary + 20) >= 16) crt(runtime, 'operatorDelete', [ptr(m, temporary)], F, 0x40d056);
  put(m, S - 48, 0x40d075); const cookie = ptr(m, S - 16) ^ probe;
  if (typeof runtime.services?.securityCookie === 'function') runtime.services.securityCookie(cookie >>> 0, {...runtime, scratchBase: S - 48});
  else if ((cookie >>> 0) !== ptr(m, 0x5e8890)) throw Error('Audio prefix security-cookie mismatch.');
  return result ? 1 : 0;
}
