import {buildRenderRotationMatrix} from './wheel-render-state.mjs';
import {updateCameraAspectProjection} from './camera-projection.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const word = (m, p, v) => m.writeUInt16LE(v & 65535, p), f32 = Math.fround;

//432550. Q12 matrix composition with the live global transform. The native
//two128-bit stores also publish an unwritten padding WORD from private stack;
//read its actual slot, rather than synthesizing a zero or copying input padding.
export function composeRaceViewMatrix(matrix, {memory: m, scratchBase}) {
  const local = scratchBase - 76, frame = local - 16;
  put(m, local + 0x48, get(m, 0x5e8890) ^ local);
  for (const [source, destination] of [[12, 12], [6, 36], [0, 4], [14, 0], [8, 20], [2, 28], [16, 24], [10, 16], [4, 8]]) put(m, local + destination, m.readInt16LE(matrix + source));
  put(m, local + 32, matrix);
  const first = get(m, frame + 0x14);
  for (let row = 0; row < 3; row++) {
    const x = m.readInt16LE(0x91d4e0 + row * 6), y = m.readInt16LE(0x91d4e2 + row * 6), z = m.readInt16LE(0x91d4e4 + row * 6);
    word(m, frame + 0x38 + row * 6, (Math.imul(first, x) + Math.imul(y, get(m, frame + 0x34)) + Math.imul(z, get(m, frame + 0x1c)) | 0) >> 12);
    word(m, frame + 0x3a + row * 6, (Math.imul(get(m, frame + 0x2c), x) + Math.imul(y, get(m, frame + 0x24)) + Math.imul(z, get(m, frame + 0x10)) | 0) >> 12);
    word(m, frame + 0x3c + row * 6, (Math.imul(get(m, frame + 0x18), x) + Math.imul(y, get(m, frame + 0x20)) + Math.imul(z, get(m, frame + 0x28)) | 0) >> 12);
  }
  const output = ptr(m, frame + 0x30);
  Buffer.from(m.subarray(frame + 0x38, frame + 0x48)).copy(m, output);
  Buffer.from(m.subarray(frame + 0x48, frame + 0x58)).copy(m, output + 16);
  put(m, output + 20, get(m, 0x91d4f4)); put(m, output + 24, get(m, 0x91d4f8)); put(m, output + 28, get(m, 0x91d4fc));
  return output;
}

//42f6f0. Capture the three signed low halfwords before forward matrix copies.
export function buildRaceViewMatrix(output, source, translation, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24;
  const x = m.readInt16LE(translation), z = m.readInt16LE(translation + 8), y = m.readInt16LE(translation + 4);
  for (let i = 0; i < 5; i++) put(m, output + i * 4, get(m, source + i * 4));
  put(m, frame + 0x14, output); put(m, output + 28, 0); put(m, output + 24, 0); put(m, output + 20, 0);
  composeRaceViewMatrix(output, {...runtime, scratchBase: frame - 4});
  output = ptr(m, frame + 0x14);
  const dot = row => (Math.imul(m.readInt16LE(output + row * 6), x) + Math.imul(m.readInt16LE(output + row * 6 + 2), y) + Math.imul(m.readInt16LE(output + row * 6 + 4), z) | 0) >> 12;
  const first = dot(0), second = dot(1), third = dot(2);
  put(m, output + 20, first); put(m, output + 24, second); put(m, output + 28, third);
}

//431ec0. Forward WORD copies precede signed float publication from globals.
export function publishRaceViewRotation(matrix, {memory: m, scratchBase}) {
  for (let i = 0; i < 9; i++) word(m, 0x91d360 + i * 2, m.readUInt16LE(matrix + i * 2));
  const scale = m.readFloatLE(0x5dc5f4);
  for (let i = 0; i < 9; i++) {
    const value = m.readInt16LE(0x91d360 + i * 2); m.writeFloatLE(value, scratchBase - 4);
    m.writeFloatLE(f32(value * scale), 0x91cdc0 + Math.floor(i / 3) * 16 + (i % 3) * 4);
  }
}

//42f7c0. Rotation and translation publication into integer/float render views.
export function publishRaceViewMatrix(matrix, runtime) {
  const {memory: m, scratchBase} = runtime;
  publishRaceViewRotation(matrix, {...runtime, scratchBase: scratchBase - 12});
  const x = get(m, matrix + 20); put(m, 0x91d374, x); put(m, 0x91d378, get(m, matrix + 24)); put(m, 0x91d37c, get(m, matrix + 28));
  put(m, scratchBase - 4, x); const y = get(m, 0x91d378); m.writeFloatLE(x, 0x91cdb0);
  put(m, scratchBase - 4, y); const z = get(m, 0x91d37c); m.writeFloatLE(y, 0x91cdb4);
  put(m, scratchBase - 4, z); m.writeFloatLE(z, 0x91cdb8);
}

//42ec40. Build the original identity rotation through the retained angle table,
//then apply doubled axes and optional horizontal reflection.
export function initializeRaceViewTransform(runtime) {
  const {memory: m} = runtime; put(m, 0x6fb528, 0); word(m, 0x6fb52c, 0);
  buildRenderRotationMatrix(0x6fb528, 0x91d4e0, runtime);
  word(m, 0x91d4e0, get(m, 0x91ceb4) ? -8192 : 8192); word(m, 0x91d4e8, 8192); word(m, 0x91d4f0, 8192);
}

//42eca0. Native race viewport dimensions, initial projection, view matrices,
//clipping rectangles and resolution ratios. Preserve live roots and raw widths.
export function initializeRaceView(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 68, local = scratchBase - 56;
  put(m, scratchBase - 4, get(m, 0x5e8890) ^ local);
  Buffer.from(m.subarray(0x5dcc10, 0x5dcc20)).copy(m, frame + 16);
  word(m, frame + 48, 4096); put(m, 0x91d590, 0x91d5a0);
  Buffer.from(m.subarray(0x5dcc00, 0x5dcc10)).copy(m, frame + 32);
  let config = ptr(m, 0x5ecefc), scale = m[config + 0x41a] && get(m, 0x6e6c04) ? 2 : 1;
  word(m, 0x91d502, m.readInt16LE(config + 0x42c) * scale); word(m, 0x91d504, m.readInt16LE(config + 0x42e) * scale);
  updateCameraAspectProjection(104, {...runtime, scratchBase: frame - 4});
  const width = m.readUInt16LE(0x91d502), height = m.readUInt16LE(0x91d504), session = ptr(m, 0x5ecb1c);
  put(m, 0x91d5fc, 0); put(m, 0x91de6c, 0);
  for (const p of [0x91d600, 0x91de70]) word(m, p, width);
  for (const p of [0x91d602, 0x91de72]) word(m, p, height);
  const x = Math.trunc((m.readInt16LE(session + 0xa8c) >> 2) * 60 / 100), y = m.readInt16LE(session + 0xa8e) >> 2;
  for (const p of [0x91d604, 0x91de74]) word(m, p, x); for (const p of [0x91d606, 0x91de76]) word(m, p, y);
  for (const p of [0x91d608, 0x91de78]) word(m, p, width); for (const p of [0x91d60a, 0x91de7a]) word(m, p, height);
  let input = ptr(m, 0x91d590); const old = input;
  for (let i = 0; i < 23; i++) put(m, 0x6fb6e0 + i * 4, get(m, input + i * 4));
  put(m, 0x91d590, old === 0x91d5a0 ? 0x91de10 : 0x91d5a0);
  for (let i = 0; i < 3; i++) put(m, 0x91d560 + i * 4, (-get(m, frame + 16 + i * 4) | 0) >> 16);
  for (let i = 0; i < 5; i++) put(m, 0x91d540 + i * 4, get(m, frame + 32 + i * 4));
  initializeRaceViewTransform({...runtime, scratchBase: frame - 4}); word(m, 0x91d4e0, get(m, 0x91ceb4) ? -8192 : 8192);
  put(m, frame - 4, 0x91d560); buildRaceViewMatrix(0x91d570, 0x91d540, 0x91d560, {...runtime, scratchBase: frame - 8});
  publishRaceViewMatrix(0x91d570, {...runtime, scratchBase: frame - 4});
  config = ptr(m, 0x5ecefc); scale = m[config + 0x41a] && get(m, 0x6e6c04) ? 2 : 1;
  const configuredWidth = m.readUInt16LE(config + 0x42c);
  put(m, 0x91d32c, Math.trunc(configuredWidth * scale * 256 / 320)); put(m, 0x91d330, Math.trunc(configuredWidth * 256 / 320));
  put(m, 0x91d334, Math.trunc(configuredWidth * scale * 256 / 640)); put(m, 0x91d338, Math.trunc(configuredWidth * 256 / 640));
}

//42f2f0. Build the initial view before the three high-bit free-link chains.
export function initializeRaceViewStorage(runtime) {
  initializeRaceView({...runtime, scratchBase: runtime.scratchBase - 4});
  const {memory: m} = runtime;
  for (const [last, count] of [[0x91de0c, 511], [0x91e67c, 511], [0x91d4bc, 1]]) {
    let p = last; for (let i = 0; i < count; i++, p -= 4) put(m, p, (p - 4) | 0x80000000); put(m, p, -1);
  }
}
