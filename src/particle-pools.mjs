import {nativeGlobalAddress} from './native-global-address.mjs';
import constants from './particle-pool-constants.json' with {type: 'json'};
import sqrt from './sqrt-table.json' with {type: 'json'};
const ptr = (m, p) => m.readUInt32LE(p), get = (m, p) => m.readInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const cleared = (size, memory, allocate) => {const p = allocate(size) >>> 0; if (p) memory.fill(0, p, p + size); return p;};
export function initializeParticlePoolConstants(memory) {for (const item of constants.constants) Buffer.from(item.bytesHex, 'hex').copy(memory, item.address);}

//CRT568a60 contract for readable finite signed64 inputs. Exceptional CRT
//behavior requires an explicit convertFloatToInt64 service result.
export function truncateParticleCountFloat(value) {
  if (!Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63) throw Error('Particle count conversion requires explicit CRT result outside finite signed64 domain.');
  return BigInt(Math.trunc(value));
}

//4357c0: allocation uses original quality BEFORE4356a0 later clamps it.
export function initializeRawParticleStorage({memory, convertFloatToInt64 = truncateParticleCountFloat}) {
  const quality = memory.readFloatLE(ptr(memory, 0x5ecefc) + 0x68), product = Math.fround(quality * memory.readFloatLE(0x5dca60)), converted = convertFloatToInt64(product);
  if (typeof converted !== 'bigint' || converted < -(1n << 63n) || converted >= 1n << 63n) throw Error('Particle count CRT service must return signed64 BigInt.');
  const count = Number(BigInt.asIntN(32, converted)), old = ptr(memory, 0x70dcf4), start = (ptr(memory, nativeGlobalAddress(memory, 0x902eec)) + (old & 0xfffffffc)) >>> 0, bytes = count << 8;
  put(memory, 0x5eb504, count); put(memory, 0x9153d4, start); put(memory, 0x9153c4, start); put(memory, 0x70dcf4, old + ((bytes + 127) & 0xffffff80)); put(memory, 0x91900c, start + bytes);
  for (let index = 0; index < count; index++) {
    const p = start + index * 256; memory[p + 0x94] = 0; word(memory, p + 0x96, 0); memory[p + 0x13] = 12; memory[p + 0x17] = 0x9a; put(memory, p + 4, 0); put(memory, p, 9); word(memory, p + 8, 0); put(memory, p + 12, 0);
  }
  const pack = ptr(memory, 0x90b990), index = memory.readUInt16LE(pack + 0x2e), extra = get(memory, 0x90b984);
  for (const [address, value] of [[0x9153da, 0xc00], [0x919006, 0xc00], [0x9153e2, 0xc00], [0x9153e6, 0x600], [0x919002, 0xc00], [0x9153ea, 0], [0x9153d8, index + 0x2e], [0x919004, index + 0x2e], [0x9153e4, index + 0x22], [0x9153e0, index + 0x16], [0x919000, index + 0x16], [0x9153e8, index + 0x3f], [0x9153c8, index + 0x96], [0x9153ca, 0x100]]) word(memory, address, value);
  let source = ptr(memory, 0x90b988) + (index + 0x2e) * 16, target = ptr(memory, 0x90b988) + (extra << 4);
  for (let row = 0; row < 12; row++, source += 16, target += 16) {
    //MOVDQU captures each complete16-byte row before the forward store.
    Buffer.from(memory.subarray(source, source + 16)).copy(memory, target);
    word(memory, target + 6, (memory.readUInt16LE(target + 6) & 63) | 128); word(memory, source + 6, memory.readUInt16LE(source + 6) | 0x800);
  }
  word(memory, 0x919140, extra); put(memory, 0x90b984, extra + 12); word(memory, 0x919142, 0xc00);
}

//435970 and4375f0: ten1e2c-byte and threef14-byte paired render records.
function initializePairedRecords(size, rows, stride, start, pairs, second, global, {memory, allocate}) {
  const base = cleared(size, memory, allocate); put(memory, global, base);
  for (let row = 0; row < rows; row++) {const p = base + row * stride + start; put(memory, base + row * stride + 12, 0); for (let pair = 0; pair < pairs; pair++) {const item = p + pair * 120; memory[item - 4] = 12; memory[item] = 0x9a; memory[item + second - 4] = 12; memory[item + second] = 0x9a;}}
}
export function initializeRawLargeEffectRecords(context) {initializePairedRecords(0x12db8, 10, 0x1e2c, 0x33, 32, 0xf00, 0x919008, context);}
export function initializeRawSmallEffectRecords(context) {initializePairedRecords(0x2d3c, 3, 0xf14, 0x1b, 16, 0x780, 0x9153c0, context);}

//4359f0. Four fixed64-record banks; preserve all other bytes between fields.
export function initializeRawEffectRecordBanks({memory}) {
  for (let offset = 0; offset < 0x1e00; offset += 120) for (const base of [0x919160, 0x915400, 0x91af60, 0x917200]) {
    const p = base + offset; memory[p + 3] = 12;
    for (const field of [0x60, 0x44, 0x28, 0xc]) put(memory, p + field, 0x412028f6);
    for (const field of [0x5c, 0x40, 0x24, 8]) put(memory, p + field, 64);
    word(memory, p + 0x3e, 63); memory[p + 7] = 0x9a;
  }
  word(memory, nativeGlobalAddress(memory,0x91cd60), 0);
}

//432ee0: table-basedQ6 root; raw globals retain the original input/clz.
export function lookupRawEffectRoot(input, {memory}) {
  input |= 0; const leading = Math.clz32(input); put(memory, 0x91d45c, input); put(memory, 0x91d460, leading);
  if (!input) return 0;
  const even = leading & ~1, shift = even - 24, normalized = shift < 0 ? input >> -shift : input << shift, exponent = (19 - even) >> 1, value = sqrt.values[normalized - 64];
  return exponent < 0 ? value >>> -exponent : value << exponent;
}

//437540.128 fixed120-byte records and32 roots feeding terrain/effect code.
export function initializeRawTerrainEffectRecords({memory, allocate}) {
  put(memory, 0x6fb9a4, 0); const base = cleared(0x3c00, memory, allocate); put(memory, 0x6fb9a0, base); put(memory, 0x6fb950, base + 0x1e00);
  for (let index = 0; index < 128; index++) {put(memory, base + index * 120 + 4, 0x80808080); word(memory, base + index * 120 + 0x3e, 2);}
  for (let index = 0; index < 32; index++) {const product = lookupRawEffectRoot(index * 128, {memory}) << 14; word(memory, 0x6fb960 + index * 2, Math.trunc(product / 4096));}
}

//4758d0.512128-byte debris records come from the shared body arena, while
//free/active ushort-ID arrays are two separate1024-byte malloc allocations.
export function initializeRawBodyDebrisPool({memory, allocate}) {
  const old = ptr(memory, 0x70dcf4), start = (ptr(memory, nativeGlobalAddress(memory, 0x902eec)) + (old & 0xfffffffc)) >>> 0;
  put(memory, 0x70dcf4, old + 0x10000); put(memory, nativeGlobalAddress(memory, 0x902b84), start);
  for (let index = 0; index < 512; index++) {
    const p = start + index * 128; put(memory, p, 5); put(memory, p + 4, 0); word(memory, p + 8, 0); put(memory, p + 12, 0); word(memory, p + 0x6a, 0);
    for (const offset of [0x14, 0x50, 0x30]) put(memory, p + offset, 0x40404040);
    for (const offset of [0x24, 0x20, 0x40, 0x3c]) put(memory, p + offset, 0);
    memory[p + 0x13] = 12; memory[p + 0x17] = 0xae; put(memory, p + 0x6c, 0x40404040);
    for (const offset of [0x60, 0x5c, 0x7c, 0x78]) put(memory, p + offset, 0);
    memory[p + 0x4f] = 12; memory[p + 0x53] = 0xae;
  }
  const free = cleared(0x400, memory, allocate); put(memory, nativeGlobalAddress(memory, 0x902b7c), free);
  put(memory, nativeGlobalAddress(memory, 0x902b80), cleared(0x400, memory, allocate));
  for (let index = 0; index < 512; index++) word(memory, free + index * 2, index);
  put(memory, nativeGlobalAddress(memory, 0x902b8c), 511); put(memory, nativeGlobalAddress(memory, 0x902b88), 0);
}

function integerByRoundingMode(value, mode) {
  let result;
  if (mode === 'nearest-even') {const low = Math.floor(value), part = value - low; result = part < 0.5 ? low : part > 0.5 ? low + 1 : low % 2 === 0 ? low : low + 1;}
  else if (mode === 'toward-zero') result = Math.trunc(value); else if (mode === 'down') result = Math.floor(value); else if (mode === 'up') result = Math.ceil(value); else throw Error('Particle initialization requires explicit x87 roundingMode.');
  return Number.isFinite(result) && result >= -2147483648 && result <= 2147483647 ? result : -2147483648;
}

//4356a0 complete game-owned constructor; services areCRT malloc/memset and
//float→signed64 conversion. The final quality FISTP uses explicit x87 context.
export function initializeRawParticlePools(context) {
  const {memory, roundingMode} = context; put(memory, nativeGlobalAddress(memory,0x91cd90), 0); put(memory, 0x9153d0, 0);
  initializeRawParticleStorage(context); initializeRawLargeEffectRecords(context); initializeRawSmallEffectRecords(context); initializeRawEffectRecordBanks(context);
  let target = ptr(memory, 0x90b980) + 0xfc2;
  for (let value = 8; value < 136; value += 8, target += 4) {memory[target - 2] = value; memory[target - 1] = value; memory[target] = value; memory[target + 1] = 60;}
  initializeRawTerrainEffectRecords(context);
  const start = ptr(memory, 0x9153c4), count = get(memory, 0x5eb504); put(memory, 0x9153dc, 0); put(memory, 0x6e65c8, 0); put(memory, 0x6e65c0, 0); put(memory, 0x6e65b4, start);
  for (let index = 0; index < count; index++) {const p = start + index * 256; put(memory, p + 0xa8, index ? p - 256 : 0); put(memory, p + 0xac, p + 256);}
  put(memory, (start + (count << 8) - 0x54) >>> 0, 0);
  const config = ptr(memory, 0x5ecefc); let quality = memory.readFloatLE(config + 0x68);
  if (memory.readFloatLE(0x5dc774) > quality) {put(memory, config + 0x68, 0x3f800000); quality = 1;}
  if (quality > memory.readFloatLE(0x5dc9bc)) {put(memory, config + 0x68, 0x41200000); quality = 10;}
  put(memory, 0x5eb500, integerByRoundingMode(Math.fround(quality * memory.readFloatLE(0x5dc9f0)), roundingMode));
}
