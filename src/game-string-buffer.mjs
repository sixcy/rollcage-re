import {assignGameStringSubstring} from './game-audio-strings.mjs';
import {nativeCodeAddress} from './native-memory-spans.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const data = (m, p) => ptr(m, p + 20) >= 16 ? ptr(m, p) : p;
const image = (runtime, address) => nativeCodeAddress(address, runtime), putImage = (runtime, address, value) => put(runtime.memory, address, image(runtime, value));
function save(r, name, address) {if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, address, r.entryRegisters[name]);}
function crt(r, name, args, top, returned) {
  const m = r.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; putImage(r, S, returned);
  if (typeof r.services?.libraryCall !== 'function') throw Error(`Game string buffer requires CRT ${name}.`);
  return r.services.libraryCall(name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S});
}

//405860. Full native stack/SEH and CRT producers, including the allocation
//local reloaded after copy/delete. Existing viewport callers use the same
//growth arithmetic with a narrower private-frame contract.
export function growGameStringBuffer(object, requested, retained, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 44, bp = S - 4;
  put(m, S + 4, requested); put(m, S + 8, retained); save(runtime, 'EBP', S - 4);
  put(m, bp - 4, -1); putImage(runtime, bp - 8, 0x569b30); if (Number.isInteger(runtime.sehWord)) put(m, bp - 12, runtime.sehWord);
  for (const [name, offset] of [['EBX', 12], ['ESI', 8], ['EDI', 4]]) save(runtime, name, F + offset);
  put(m, F, get(m, 0x5e8890) ^ bp); put(m, bp - 16, F); put(m, bp - 24, object);
  requested = ptr(m, S + 4); let capacity = requested | 15;
  if ((capacity >>> 0) > 0xfffffffe) capacity = requested;
  else {
    const old = ptr(m, object + 20), half = old >>> 1;
    if (half > Math.floor((capacity >>> 0) / 3)) capacity = old > ((0xfffffffe - half) >>> 0) ? 0xfffffffe : old + half;
  }
  capacity >>>= 0; put(m, bp - 4, 0); put(m, bp - 20, 0);
  const bytes = (capacity + 1) >>> 0; let allocation = 0;
  if (bytes) {
    allocation = crt(runtime, 'operatorNew', [bytes], F, 0x4058e7) >>> 0; put(m, bp - 20, allocation);
    if (!allocation) {crt(runtime, '_Xbad_alloc', [], F, 0x4058f7); throw Error('Nonreturning CRT bad_alloc returned.');}
  }
  retained = ptr(m, S + 8);
  if (retained) crt(runtime, 'memcpy', [allocation, data(m, object), retained], F, 0x405970);
  if (ptr(m, object + 20) >= 16) crt(runtime, 'operatorDelete', [ptr(m, object)], F, 0x405981);
  allocation = ptr(m, bp - 20); m[object] = 0; put(m, object, allocation); put(m, object + 20, capacity); put(m, object + 16, retained);
  m[(capacity >= 16 ? allocation : object) + retained] = 0;
}

//405310. Input inside the current string dispatches to actual405150 with
//the original captured registers. Other paths use real405860 and CRT memcpy.
export function assignGameCString(object, input, length, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  put(m, S + 4, input); put(m, S + 8, length); save(runtime, 'EBX', S - 4); input = ptr(m, S + 4); save(runtime, 'ESI', S - 8);
  const begin = data(m, object), end = (begin + ptr(m, object + 16)) >>> 0;
  if (input && begin <= input && input < end) {
    const offset = (input - data(m, object)) >>> 0; length = ptr(m, S + 8);
    put(m, S - 12, length); put(m, S - 16, offset); put(m, S - 20, object); putImage(runtime, S - 24, ptr(m, object + 20) >= 16 ? 0x405358 : 0x40536e);
    return assignGameStringSubstring(object, object, offset, length, {...runtime, scratchBase: S - 24, entryRegisters: {...runtime.entryRegisters, EBX: offset, ESI: object}});
  }
  save(runtime, 'EDI', S - 12); length = ptr(m, S + 8);
  if (length > 0xfffffffe) {crt(runtime, '_Xlength_error', [image(runtime, 0x57026c)], S - 12, 0x405388); throw Error('Nonreturning CRT length_error returned.');}
  if (ptr(m, object + 20) < length) {
    const retained = ptr(m, object + 16); put(m, S - 16, retained); put(m, S - 20, length); putImage(runtime, S - 24, 0x40539a);
    growGameStringBuffer(object, length, retained, {...runtime, scratchBase: S - 24, entryRegisters: {...runtime.entryRegisters, EBX: input, ESI: object, EDI: length}});
    if (!length) return object;
  } else if (!length) {const output = data(m, object); put(m, object + 16, 0); m[output] = 0; return object;}
  if (length) crt(runtime, 'memcpy', [data(m, object), input, length], S - 12, 0x4053da);
  const output = data(m, object); put(m, object + 16, length); m[output + length] = 0; return object;
}
