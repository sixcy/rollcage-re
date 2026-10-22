import constants from './camera-curve-constants.json' with {type: 'json'};
import {multiplyQ16} from './fixed-integer.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
function divide(numerator, denominator) {
  if (!denominator) throw Error('Camera curve signed division by zero.');
  const result = Math.trunc(numerator / denominator);
  if (result < -2147483648 || result > 2147483647) throw Error('Camera curve signed division overflow.');
  return result | 0;
}

export function initializeCameraCurveConstants(memory) {
  for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
}

//Inline4180a0 producer419bb0..419bce. This is not a separate native procedure.
//The twelve-factorial limit is intentional, not a table of arbitrary length.
export function initializeCameraCurveFactorials({memory}) {
  let value = 1; put(memory, 0x6f9bc0, value);
  for (let index = 1; index < 13; index++) {value = Math.imul(value, index); put(memory, 0x6f9bc0 + index * 4, value);}
}

//41b830: bounded binary power with original live mask tables and Q16 rounding
//after every multiply/square. Numeric locals survive in the caller's stack.
export function evaluateCameraCurvePower(value, exponent, {memory: m, scratchBase}) {
  const frame = scratchBase - 20; put(m, frame + 12, value); put(m, frame + 16, 65536);
  let result = 65536;
  for (let lane = 0; lane < 5; lane++) {
    if (!(exponent & m.readUInt16LE(0x570490 + lane * 2))) break;
    if (exponent & m.readUInt16LE(0x57049c + lane * 2)) {result = multiplyQ16(get(m, frame + 16), get(m, frame + 12)); put(m, frame + 16, result);}
    put(m, frame + 12, multiplyQ16(get(m, frame + 12), get(m, frame + 12)));
  }
  return result;
}

//41b8b0: five-point, degree-four Bezier evaluation. Point coordinates are
//integer inputs; the result has Q16 weights and wraps signed32 on every sum.
//Divisor coefficients, t, output and input coordinates can share memory.
export function evaluateCameraCurve(points, output, t, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36;
  put(m, scratchBase + 4, output); put(m, scratchBase + 8, t);
  put(m, frame + 0x10, 4); put(m, frame + 0x14, points + 8);
  put(m, output, 0); put(m, output + 4, 0); put(m, output + 8, 0); put(m, frame + 0x1c, 16);
  let offset = 16;
  for (let index = 0; offset > -4; index++) {
    let coefficient = divide(get(m, 0x6f9bd0), get(m, 0x6f9bc0 + index * 4));
    put(m, frame + 0x18, 65536); coefficient = divide(coefficient, get(m, 0x6f9bc0 + offset)); put(m, frame + 0x20, coefficient);
    put(m, frame + 0x28, get(m, frame + 0x2c)); let power = 65536;
    for (let lane = 0; lane < 5; lane++) {
      if (!(index & m.readUInt16LE(0x570490 + lane * 2))) break;
      if (index & m.readUInt16LE(0x57049c + lane * 2)) {power = multiplyQ16(get(m, frame + 0x18), get(m, frame + 0x28)); put(m, frame + 0x18, power);}
      put(m, frame + 0x28, multiplyQ16(get(m, frame + 0x28), get(m, frame + 0x28)));
    }
    const weighted = Math.imul(power, get(m, frame + 0x20)); put(m, frame + 0x28, weighted);
    if (weighted) {
      const complement = evaluateCameraCurvePower((65536 - get(m, frame + 0x2c)) | 0, get(m, frame + 0x10), {...runtime, scratchBase: frame - 4}); put(m, frame + 0x20, complement);
      const weight = multiplyQ16(get(m, frame + 0x28), get(m, frame + 0x20));
      if (weight) {
        const point = ptr(m, frame + 0x14);
        put(m, output, get(m, output) + Math.imul(get(m, point - 8), weight));
        const y = get(m, point - 4), z = get(m, point);
        put(m, output + 4, get(m, output + 4) + Math.imul(y, weight)); put(m, output + 8, get(m, output + 8) + Math.imul(z, weight));
      }
    }
    offset = get(m, frame + 0x1c) - 4; put(m, frame + 0x10, get(m, frame + 0x10) - 1); put(m, frame + 0x14, get(m, frame + 0x14) + 12); put(m, frame + 0x1c, offset);
  }
}

//41b9f0: mutate the five authored short-coordinate template rows in place.
//Scale/vertical factors are captured once; mirror flags are read afterward.
export function scaleCameraCurveTemplate({memory: m}) {
  const mode = Math.min(m[ptr(m, 0x5ecb1c) + 0x579], 16), scale = m.readInt16LE(0x5704d4 + mode * 2), vertical = m.readInt16LE(0x5704a8 + mode * 2);
  for (let row = 0; row < 5; row++) for (const offset of [0, 2, 4]) {const p = 0x5eabf0 + row * 8 + offset; word(m, p, Math.imul(m.readInt16LE(p), scale) >> 8);}
  if (m.readUInt16LE(0x57046c + mode * 2)) for (let row = 0; row < 5; row++) {const p = 0x5eabf0 + row * 8; word(m, p, -m.readInt16LE(p));}
  for (let row = 0; row < 5; row++) {const p = 0x5eabf2 + row * 8; word(m, p, Math.imul(m.readInt16LE(p), vertical) >> 8);}
}
