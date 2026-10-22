import {obtainRendererIdentity} from './renderer-scene-nodes.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), copy16 = (m, output, input) => Buffer.from(m.subarray(input, input + 16)).copy(m, output);

//4a55a0. Expand along the first column, using the original four-float row
//stride even for smaller minors. Native callers use dimensions1..4.
export function determinantRendererMatrix(matrix, dimension, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 112, minor = frame + 48, f = Math.fround; dimension |= 0; put(m, scratchBase + 4, dimension); m.writeFloatLE(0, frame + 16);
  if (dimension <= 1) return m.readFloatLE(matrix);
  if (dimension > 4) throw RangeError('Renderer determinant exceeds recovered four-row workflow.');
  let result = 0;
  for (let excluded = 0; excluded < dimension; excluded++) {
    let row = 0; for (let input = 0; input < dimension; input++) if (input !== excluded) {for (let column = 1; column < dimension; column++) put(m, minor + row * 16 + (column - 1) * 4, get(m, matrix + input * 16 + column * 4)); row++;}
    const term = f(determinantRendererMatrix(minor, dimension - 1, {...runtime, scratchBase: frame - 8}) * m.readFloatLE(matrix + excluded * 16)); result = excluded & 1 ? f(result - term) : f(term + result); m.writeFloatLE(result, frame + 16);
  }
  return result;
}

//4a5430. Cofactors are generated from live source memory, so in-place output
//retains the native sequential overwrite behavior rather than an ideal inverse.
export function invertRendererMatrix(matrix, output, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 96, minor = frame + 8, f = Math.fround; put(m, scratchBase + 4, output);
  const determinant = determinantRendererMatrix(matrix, 4, {...runtime, scratchBase: frame - 8});
  if (determinant === m.readFloatLE(0x5dc598)) {const identity = obtainRendererIdentity(runtime); for (let block = 0; block < 4; block++) copy16(m, output + block * 16, identity + block * 16); return output;}
  const reciprocal = f(m.readFloatLE(0x5dc774) / determinant);
  for (let index = 0; index < 16; index++) {
    const excludedRow = index & 3, excludedColumn = index >> 2; let row = 0;
    for (let input = 0; input < 4; input++) if (input !== excludedRow) {let column = 0; for (let inputColumn = 0; inputColumn < 4; inputColumn++) if (inputColumn !== excludedColumn) put(m, minor + row * 16 + column++ * 4, get(m, matrix + input * 16 + inputColumn * 4)); row++;}
    const value = f(determinantRendererMatrix(minor, 3, {...runtime, scratchBase: frame - 8}) * reciprocal); m.writeFloatLE(value, output + index * 4); if ((excludedRow + excludedColumn) & 1) put(m, output + index * 4, get(m, output + index * 4) ^ get(m, 0x5dcf60));
  }
  return output;
}

//52db70/52dc50 through4021b0: transpose a captured sixteen-word matrix. The
//temporary constructor writes elements3..14,then0..2,then15 in native order.
function transposeInto(matrix, output, temporary, runtime) {
  const m = runtime.memory, values = Array.from({length: 16}, (_, i) => get(m, matrix + ((i & 3) * 4 + (i >> 2)) * 4));
  for (let i = 3; i < 15; i++) put(m, temporary + i * 4, values[i]); for (let i = 0; i < 3; i++) put(m, temporary + i * 4, values[i]); put(m, temporary + 60, values[15]);
  for (let block = 0; block < 4; block++) copy16(m, output + block * 16, temporary + block * 16); return output;
}
export function copyTransposedRendererMatrix(matrix, output, runtime) {const {memory: m, scratchBase} = runtime; put(m, scratchBase + 4, output); return transposeInto(matrix, output, scratchBase - 64, runtime);}
export function transposeRendererMatrix(matrix, runtime) {const frame = (runtime.scratchBase - 4 & ~7) - 72; return transposeInto(matrix, matrix, frame + 8, runtime);}
