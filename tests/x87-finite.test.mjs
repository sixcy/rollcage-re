import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeX87ControlWord, x87FromInt64, x87FromBinary64, x87Add, x87Subtract,
  x87Multiply, x87Divide, x87SquareRoot, x87StoreBinary32, x87StoreBinary64, x87ToInt32
} from '../src/x87-finite.mjs';
import {buildX87PrecisionFixture} from '../tools/prepare-x87-precision-fixture.mjs';

const p24 = decodeX87ControlWord(0x007f), p53 = decodeX87ControlWord(0x027f), p64 = decodeX87ControlWord(0x037f);
const mode = 'nearest-even', number = value => x87StoreBinary64(value, mode), integer = x87FromInt64;

test('x87 control-word precision and rounding are separate explicit settings', () => {
  assert.equal(p24.precisionBits, 24); assert.equal(p53.precisionBits, 53); assert.equal(p64.precisionBits, 64);
  assert.equal(decodeX87ControlWord(0x0a7f).roundingMode, 'up');
  assert.throws(() => decodeX87ControlWord(0x017f), /Reserved/);
  assert.throws(() => decodeX87ControlWord(-1), /unsigned word/);
  assert.throws(() => x87Add(integer(1n), integer(2n)), /Explicit/);
});

test('FILD and FLD loads preserve exact values independently of PC; arithmetic rounds at PC', () => {
  const value = integer(16777217n), zero = integer(0n);
  assert.equal(number(value), 16777217);
  assert.equal(number(x87Add(value, zero, p24)), 16777216);
  assert.equal(number(x87Add(value, zero, p53)), 16777217);
  assert.equal(number(x87FromBinary64(1 + 2 ** -40)), 1 + 2 ** -40);
  assert.equal(number(x87Add(integer(16777219n), zero, p24)), 16777220);
  assert.throws(() => x87FromInt64(1n << 63n), /signed 64-bit/);
  assert.throws(() => x87FromBinary64(Infinity), /finite/);
});

test('exact rational division avoids binary64 to binary32 double rounding', () => {
  const numerator = (1n << 54n) + (1n << 30n) + 1n, denominator = integer(1n << 54n);
  const single = x87Divide(integer(numerator), denominator, p24);
  assert.equal(number(single), 1 + 2 ** -23);
  assert.equal(Math.fround(Number(numerator) / 2 ** 54), 1);
  assert.equal(number(x87Divide(integer(numerator), denominator, p53)), 1 + 2 ** -24);
  assert.equal(x87StoreBinary32(x87Divide(integer(numerator), denominator, p64), mode), 1 + 2 ** -23);
});

test('24-bit x87 arithmetic retains extended exponent range beyond binary32', () => {
  const wide = x87Multiply(x87FromBinary64(2 ** 100), x87FromBinary64(2 ** 100), p24);
  assert.equal(number(wide), 2 ** 200);
  assert.equal(Math.fround(2 ** 200), Infinity);
  const beyondDouble = x87Multiply(x87FromBinary64(2 ** 1000), x87FromBinary64(2 ** 1000), p24);
  assert.equal(beyondDouble.exponent, 2000);
  assert.throws(() => number(beyondDouble), /overflow/);
  assert.equal(number(x87Divide(beyondDouble, x87FromBinary64(2 ** 1000), p24)), 2 ** 1000);
});

test('directed arithmetic and integer stores honor signs and nearest-even ties', () => {
  const up = decodeX87ControlWord(0x087f), down = decodeX87ControlWord(0x047f), zero = decodeX87ControlWord(0x0c7f);
  const a = integer(-16777217n), b = integer(0n);
  assert.equal(number(x87Add(a, b, up)), -16777216);
  assert.equal(number(x87Add(a, b, down)), -16777218);
  assert.equal(number(x87Add(a, b, zero)), -16777216);
  for (const [input, expected] of [[2.5, 2], [3.5, 4], [-2.5, -2], [-3.5, -4]]) assert.deepEqual(x87ToInt32(x87FromBinary64(input), mode), {value: expected, invalid: false});
  assert.deepEqual(x87ToInt32(integer(2147483648n), mode), {value: -2147483648, invalid: true});
  assert.deepEqual(x87ToInt32(integer(-2147483648n), mode), {value: -2147483648, invalid: false});
});

test('exact square-root rounding and arithmetic match ordinary binary64 within admitted domain', () => {
  assert.equal(number(x87SquareRoot(integer(2n), p24)), Math.fround(Math.sqrt(2)));
  assert.equal(number(x87SquareRoot(integer(2n), p53)), Math.sqrt(2));
  assert.equal(number(x87SquareRoot(integer(81n), p24)), 9);
  for (let i = 1; i < 200; i++) {
    const a = i * 13.25, b = (i + 1) * -7.125;
    assert.equal(number(x87Add(x87FromBinary64(a), x87FromBinary64(b), p53)), a + b);
    assert.equal(number(x87Subtract(x87FromBinary64(a), x87FromBinary64(b), p53)), a - b);
    assert.equal(number(x87Multiply(x87FromBinary64(a), x87FromBinary64(b), p53)), a * b);
    assert.equal(number(x87Divide(x87FromBinary64(a), x87FromBinary64(b), p53)), a / b);
    assert.equal(number(x87SquareRoot(x87FromBinary64(a), p53)), Math.sqrt(a));
  }
});

test('memory stores round independently of PC, including binary32 subnormals and signed zeros', () => {
  assert.equal(x87StoreBinary32(integer(16777217n), mode), 16777216);
  assert.equal(number(integer(16777217n)), 16777217);
  const tiny = x87FromBinary64(2 ** -150);
  assert.equal(x87StoreBinary32(tiny, mode), 0);
  assert.equal(x87StoreBinary32(tiny, 'up'), 2 ** -149);
  assert.equal(x87StoreBinary32(x87FromBinary64(3 * 2 ** -150), mode), 2 ** -148);
  assert(Object.is(x87StoreBinary32(x87FromBinary64(-(2 ** -150)), mode), -0));
  assert(Object.is(number(x87FromBinary64(-0)), -0));
  assert(Object.is(number(x87Subtract(integer(1n), integer(1n), decodeX87ControlWord(0x047f))), -0));
  assert.equal(number(x87FromBinary64(Number.MIN_VALUE)), Number.MIN_VALUE);
});

test('unsupported exceptional and noncanonical inputs fail explicitly', () => {
  assert.throws(() => x87Divide(integer(1n), integer(0n), p24), /division-by-zero/);
  assert.throws(() => x87SquareRoot(integer(-1n), p24), /Negative/);
  assert.throws(() => x87Add({significand: 2n, exponent: 0, negativeZero: false}, integer(1n), p24), /canonical/);
  let huge = x87FromBinary64(2 ** 1000);
  for (let i = 0; i < 4; i++) huge = x87Multiply(huge, huge, p64);
  assert.throws(() => x87Multiply(huge, huge, p64), /bounded normal/);
  let tiny = x87FromBinary64(2 ** -1000);
  for (let i = 0; i < 4; i++) tiny = x87Multiply(tiny, tiny, p64);
  assert.throws(() => x87Multiply(tiny, tiny, p64), /bounded normal/);
});

test('Q12 attachment-row arithmetic can change the final integer under observed PC24', () => {
  const point = [2016n, -26177n, -9198n], coefficients = [-1127 / 4096, 0, -3938 / 4096];
  const evaluate = settings => {
    let value = integer(19529n);
    for (let index = 0; index < 3; index++) value = x87Add(value, x87Multiply(x87FromBinary64(coefficients[index]), integer(point[index]), settings), settings);
    return value;
  };
  assert.equal(number(evaluate(p53)), 27817.4990234375);
  assert.equal(number(evaluate(p24)), 27817.5);
  assert.equal(x87ToInt32(evaluate(p53), mode).value, 27817);
  assert.equal(x87ToInt32(evaluate(p24), mode).value, 27818);
});

test('hardware fixture encodes independent PC24/PC53 passes without executing them', () => {
  const {bytes, breakpointRva, expected} = buildX87PrecisionFixture();
  assert.equal(bytes[0x200 + breakpointRva - 0x1000], 0x90);
  assert.equal(bytes.readUInt16LE(0x500), 0x007f);
  assert.equal(bytes.readUInt16LE(0x502), 0x027f);
  assert.equal(bytes.readBigInt64LE(0x518), (1n << 54n) + (1n << 30n) + 1n);
  assert.equal(expected[0].midpointDivision, 1 + 2 ** -23);
  assert.equal(expected[1].midpointDivision, 1 + 2 ** -24);
  assert.deepEqual(bytes.subarray(0x482, 0x48e), Buffer.from('ExitProcess\0'));
});
