import {abs32, multiplyQ16, divideQ16} from './fixed-integer.mjs';
import {measureWormholeVector} from './wormhole-targeting.mjs';

const get = (m, p) => m.readInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function integer(value, mode) {
  let result;
  if (mode === 'nearest-even') {const lo = Math.floor(value), fraction = value - lo; result = fraction < .5 ? lo : fraction > .5 ? lo + 1 : lo % 2 === 0 ? lo : lo + 1;}
  else if (mode === 'toward-zero') result = Math.trunc(value);
  else if (mode === 'down') result = Math.floor(value);
  else if (mode === 'up') result = Math.ceil(value);
  else throw Error('Raw vector normalization requires an explicit x87 rounding mode.');
  return Number.isFinite(result) && result >= -2147483648 && result <= 2147483647 ? result : -2147483648;
}

//422c70. EAX is the reduction shift, not the length. Reduction mutates input;
//the globals are stored before input is reloaded, so overlapping inputs matter.
export function normalizeRawFloatVector(input, output, {memory: m, roundingMode}) {
  let bits = abs32(get(m, input)) | abs32(get(m, input + 8)) | abs32(get(m, input + 4));
  if (bits < 0) bits = -bits | 0;
  const leading = Math.clz32(bits), shift = Math.max(0, 18 - leading);
  put(m, 0x91d45c, bits); put(m, 0x91d460, 0); put(m, 0x91d460, leading);
  if (shift) for (const offset of [0, 4, 8]) put(m, input + offset, get(m, input + offset) >> shift);
  const lanes = [0, 4, 8].map(offset => Math.fround(get(m, input + offset) << 8)), squares = lanes.map(value => Math.fround(value * value));
  const length = Math.fround(Math.sqrt(Math.fround(Math.fround(squares[1] + squares[0]) + squares[2])));
  const inverse = Math.fround(m.readFloatLE(0x5dc774) / length), scale = m.readFloatLE(0x5dca88);
  for (let lane = 0; lane < 3; lane++) put(m, output + lane * 4, integer(Math.fround(Math.fround(lanes[lane] * scale) * inverse), roundingMode));
  return shift;
}

//41c9c0 publishes the reduction scratch before its fixed square root.
export function rawVectorLength(vector, {memory: m}) {
  return measureWormholeVector([0, 4, 8].map(offset => get(m, vector + offset)), {memory: m});
}

//492d10 is also called directly by4180a0 after its own length threshold.
//Unlike the length-computing wrapper, its supplied divisor and numeric stack
//locals are live. Output may overwrite the saved inverse before later lanes.
export function normalizeRawFixedVectorWithLength(vector, length, {memory: m, scratchBase, nativeEntryRegisters}) {
  if (Number.isInteger(nativeEntryRegisters?.ESI)) put(m, scratchBase - 12, nativeEntryRegisters.ESI);
  put(m, scratchBase - 16, 0x492d20); // Actual direct41c990 return address, readable through stack aliases.
  if (Number.isInteger(nativeEntryRegisters?.EBX)) put(m, scratchBase - 28, nativeEntryRegisters.EBX);
  put(m, scratchBase - 20, length); put(m, scratchBase - 24, 65536); // Actual41c990 arguments before a possible division fault.
  const inverse = divideQ16(65536, length | 0); put(m, scratchBase - 8, inverse);
  let result;
  for (const offset of [0, 4, 8]) {
    put(m, scratchBase - 4, get(m, vector + offset));
    result = multiplyQ16(get(m, scratchBase - 4), get(m, scratchBase - 8)); put(m, vector + offset, result);
  }
  return result;
}

//492cc0→492d10, including signed-abs overflow and ordered in-place stores.
export function normalizeRawFixedVector(vector, runtime) {
  const {memory: m} = runtime, first = get(m, vector);
  if (abs32(first) > 0x230000 || abs32(get(m, vector + 4)) > 0x230000 || abs32(get(m, vector + 8)) > 0x230000) {
    put(m, vector + 4, get(m, vector + 4) >> 3); put(m, vector + 8, get(m, vector + 8) >> 3); put(m, vector, first >> 3);
  }
  const inverse = divideQ16(65536, rawVectorLength(vector, runtime));
  for (const offset of [0, 4, 8]) put(m, vector + offset, multiplyQ16(get(m, vector + offset), inverse));
}

//432e70. Negative wrapped inputs index retained bytes before the positive
//root table; do not replace them with sqrt(abs(input)) or an array fallback.
export function lookupRawIntegerRoot(value, {memory: m}) {
  value |= 0; const absolute = abs32(value), leading = Math.clz32(absolute); put(m, 0x91d45c, value); put(m, 0x91d45c, absolute); put(m, 0x91d460, leading);
  if (leading === 32) return 0;
  const even = leading & ~1, shift = even - 24, normalized = shift < 0 ? value >> -shift : value << shift;
  return (m.readUInt16LE(0x5eb290 + (normalized - 64) * 2) << ((31 - even) >> 1)) >>> 12;
}
