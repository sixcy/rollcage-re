// Bounded numerical primitive, deliberately separate from the live interpreter.
// Exact loads and exact intermediate ratios; PC applies only to arithmetic.
// Arithmetic supports zero/normal finite extended values, not exceptions,
// extended subnormals, NaNs, infinities, status flags, or transcendental ops.
const modes = ['nearest-even', 'down', 'up', 'toward-zero'];
const bitLength = n => n.toString(2).length;
const abs = n => n < 0n ? -n : n;
const negative = value => value.significand < 0n || (value.significand === 0n && value.negativeZero);

export function decodeX87ControlWord(controlWord) {
  if (!Number.isInteger(controlWord) || controlWord < 0 || controlWord > 0xffff) throw Error('x87 control word must be an unsigned word.');
  const precisionBits = [24, null, 53, 64][(controlWord >>> 8) & 3];
  if (precisionBits === null) throw Error('Reserved x87 precision-control setting.');
  return Object.freeze({controlWord, precisionBits, roundingMode: modes[(controlWord >>> 10) & 3]});
}

function context(value) {
  if (![24, 53, 64].includes(value?.precisionBits) || !modes.includes(value?.roundingMode)) throw Error('Explicit x87 precision and rounding context required.');
  return value;
}
function rounding(mode) {if (!modes.includes(mode)) throw Error('Explicit x87 rounding mode required.'); return mode;}
function make(significand, exponent, negativeZero = false) {
  if (significand === 0n) return Object.freeze({significand: 0n, exponent: 0, negativeZero: Boolean(negativeZero)});
  while ((significand & 1n) === 0n) {significand >>= 1n; exponent++;}
  const top = bitLength(abs(significand)) - 1 + exponent;
  if (top < -16382 || top > 16383) throw Error('Outside bounded normal finite x87 range.');
  return Object.freeze({significand, exponent, negativeZero: false});
}
function requireValue(value) {
  if (typeof value?.significand !== 'bigint' || !Number.isInteger(value?.exponent) || typeof value?.negativeZero !== 'boolean') throw Error('Expected an exact finite x87 value.');
  if (value.significand !== 0n && bitLength(abs(value.significand)) > 64) throw Error('x87 operand significand exceeds 64 bits.');
  const canonical = make(value.significand, value.exponent, value.negativeZero);
  if (canonical.significand !== value.significand || canonical.exponent !== value.exponent || canonical.negativeZero !== value.negativeZero) throw Error('Expected a canonical finite x87 value.');
  return value;
}

// FILD is exact even with PC=24. No precision context is accepted here.
export function x87FromInt64(integer) {
  if (typeof integer !== 'bigint' || integer < -(1n << 63n) || integer >= 1n << 63n) throw Error('FILD input must be a signed 64-bit BigInt.');
  return make(integer, 0);
}
// FLD m64 loads exactly into extended precision, without applying PC.
export function x87FromBinary64(number) {
  if (typeof number !== 'number' || !Number.isFinite(number)) throw Error('Only finite binary64 loads are admitted.');
  const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, number, true);
  const bits = bytes.getBigUint64(0, true), sign = bits >> 63n ? -1n : 1n;
  const exponent = Number((bits >> 52n) & 0x7ffn), fraction = bits & ((1n << 52n) - 1n);
  if (exponent === 0) return make(sign * fraction, -1074, Object.is(number, -0));
  return make(sign * ((1n << 52n) | fraction), exponent - 1023 - 52);
}

function ratioTop(numerator, denominator, exponent) {
  let top = bitLength(numerator) - bitLength(denominator);
  if (top >= 0 ? numerator < denominator << BigInt(top) : numerator << BigInt(-top) < denominator) top--;
  return top + exponent;
}
function roundedQuotient(numerator, denominator, sign, mode) {
  const quotient = numerator / denominator, remainder = numerator % denominator;
  let increment = false;
  if (mode === 'nearest-even') increment = remainder * 2n > denominator || (remainder * 2n === denominator && (quotient & 1n) === 1n);
  else if (mode === 'up') increment = !sign && remainder !== 0n;
  else if (mode === 'down') increment = sign && remainder !== 0n;
  return quotient + (increment ? 1n : 0n);
}
function quantize(numerator, denominator, exponent, targetExponent, sign, mode) {
  const shift = exponent - targetExponent;
  return roundedQuotient(shift >= 0 ? numerator << BigInt(shift) : numerator, shift < 0 ? denominator << BigInt(-shift) : denominator, sign, mode);
}
function roundRatio(numerator, denominator, exponent, sign, settings) {
  const {precisionBits, roundingMode} = context(settings);
  if (numerator === 0n) return make(0n, 0, sign);
  const top = ratioTop(numerator, denominator, exponent);
  // Reject exact underflow/overflow scenarios rather than silently approximating
  // the x87 exception and denormal-result rules.
  if (top < -16382 || top > 16383) throw Error('Outside bounded normal finite x87 arithmetic.');
  const target = top - (precisionBits - 1);
  const rounded = quantize(numerator, denominator, exponent, target, sign, roundingMode);
  return make(sign ? -rounded : rounded, target);
}

export function x87Add(left, right, settings) {
  requireValue(left); requireValue(right); context(settings);
  const exponent = Math.min(left.exponent, right.exponent);
  const total = (left.significand << BigInt(left.exponent - exponent)) + (right.significand << BigInt(right.exponent - exponent));
  const zeroSign = negative(left) === negative(right) ? negative(left) : settings.roundingMode === 'down';
  return roundRatio(abs(total), 1n, exponent, total === 0n ? zeroSign : total < 0n, settings);
}
export function x87Subtract(left, right, settings) {
  requireValue(right);
  return x87Add(left, make(-right.significand, right.exponent, !right.negativeZero), settings);
}
export function x87Multiply(left, right, settings) {
  requireValue(left); requireValue(right);
  return roundRatio(abs(left.significand * right.significand), 1n, left.exponent + right.exponent, negative(left) !== negative(right), settings);
}
export function x87Divide(left, right, settings) {
  requireValue(left); requireValue(right);
  if (right.significand === 0n) throw Error('x87 division-by-zero/invalid exceptions are outside this helper.');
  return roundRatio(abs(left.significand), abs(right.significand), left.exponent - right.exponent, negative(left) !== negative(right), settings);
}
function integerRoot(integer) {
  if (integer === 0n) return 0n;
  let root = 1n << BigInt(Math.ceil(bitLength(integer) / 2));
  for (;;) {const next = (root + integer / root) >> 1n; if (next >= root) return root; root = next;}
}
export function x87SquareRoot(value, settings) {
  requireValue(value); const {precisionBits, roundingMode} = context(settings);
  if (value.significand < 0n) throw Error('Negative x87 square-root exceptions are outside this helper.');
  if (value.significand === 0n) return make(0n, 0, value.negativeZero);
  const top = Math.floor((bitLength(value.significand) - 1 + value.exponent) / 2), target = top - (precisionBits - 1);
  const shift = value.exponent - 2 * target;
  const numerator = shift >= 0 ? value.significand << BigInt(shift) : value.significand;
  const denominator = shift < 0 ? 1n << BigInt(-shift) : 1n;
  let result = integerRoot(numerator / denominator);
  if (roundingMode === 'nearest-even') {
    const midpoint = denominator * (4n * result * result + 4n * result + 1n), comparison = 4n * numerator - midpoint;
    if (comparison > 0n || (comparison === 0n && (result & 1n) === 1n)) result++;
  } else if (roundingMode === 'up' && numerator !== denominator * result * result) result++;
  return make(result, target);
}

// Memory-store width is independent of PC. Underflow to binary32/binary64
// subnormals and signed zero is supported here; overflow/status flags are not.
function store(value, precision, minExponent, maxExponent, mode) {
  requireValue(value); rounding(mode);
  if (value.significand === 0n) return value.negativeZero ? -0 : 0;
  const top = bitLength(abs(value.significand)) - 1 + value.exponent;
  if (top > maxExponent) throw Error('IEEE memory-store overflow is outside this helper.');
  const target = Math.max(top - (precision - 1), minExponent - (precision - 1));
  const result = quantize(abs(value.significand), 1n, value.exponent, target, negative(value), mode);
  if (result === 0n) return negative(value) ? -0 : 0;
  if (bitLength(result) - 1 + target > maxExponent) throw Error('IEEE memory-store overflow is outside this helper.');
  return (negative(value) ? -1 : 1) * Number(result) * 2 ** target;
}
export const x87StoreBinary32 = (value, mode) => store(value, 24, -126, 127, mode);
export const x87StoreBinary64 = (value, mode) => store(value, 53, -1022, 1023, mode);
export function x87ToInt32(value, mode) {
  requireValue(value); rounding(mode);
  const magnitude = quantize(abs(value.significand), 1n, value.exponent, 0, negative(value), mode);
  const integer = negative(value) ? -magnitude : magnitude, invalid = integer < -2147483648n || integer > 2147483647n;
  return Object.freeze({value: invalid ? -2147483648 : Number(integer), invalid});
}
