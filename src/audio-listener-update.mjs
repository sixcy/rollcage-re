import {obtainRendererIdentity} from './renderer-scene-nodes.mjs';
import constants from './audio-listener-constants.json' with {type: 'json'};

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const f = Math.fround, mul = (a, b) => f(a * b), add = (a, b) => f(a + b), sub = (a, b) => f(a - b);
function save(runtime, name, address) {if (Number.isInteger(runtime.entryRegisters?.[name])) put(runtime.memory, address, runtime.entryRegisters[name]);}
function vector(m, p, values) {values.forEach((value, i) => m.writeFloatLE(value, p + i * 4));}
export function initializeAudioListenerConstants(memory) {
  for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
  return memory;
}
function squareRoot(value, runtime) {
  //Actual4a4d00 widens its float input for libm_sse2_sqrt_precise, then narrows.
  const {memory: m, scratchBase: S} = runtime;
  save(runtime, 'EBP', S - 4); put(m, ((S - 4) & ~7) - 4, 0x4a4d0f);
  if (typeof runtime.services?.rendererMath !== 'function') throw Error('Listener orientation requires genuine CRT sqrt.');
  return f(runtime.services.rendererMath('sqrt', f(value), 64, {...runtime, scratchBase: ((S - 4) & ~7) - 4}));
}

//4aa070/4aa0a0 copy four live DWORDs;4aa0d0 snapshots all16 bytes first.
export function setAudioListenerVector(listener, input, offset, runtime) {
  if (![0x20, 0x30, 0x40].includes(offset)) throw Error('Unknown listener vector field.');
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, input);
  if (offset === 0x40) Buffer.from(m.subarray(input, input + 16)).copy(m, listener + offset);
  else for (let i = 0; i < 4; i++) put(m, listener + offset + i * 4, get(m, input + i * 4));
}

//4a4e90. Build a normalized cross vector and repair the second input. A
//near-parallel pair rotates the second vector's components before crossing.
export function orthogonalizeAudioListenerVectors(first, output, second, runtime) {
  const {memory: m, scratchBase: S} = runtime, A = (S - 4) & ~7, F = A - 32, read = p => m.readFloatLE(p);
  put(m, S + 4, output); put(m, S + 8, second); save(runtime, 'EBP', S - 4);
  save(runtime, 'EBX', F + 8); save(runtime, 'ESI', F + 4); save(runtime, 'EDI', F);
  put(m, F - 4, second); put(m, F - 8, 0x4a4eab);
  for (let i = 0; i < 4; i++) put(m, F + 16 + i * 4, get(m, second + i * 4)); //4020c0
  const y = read(first + 4); let x2 = read(F + 16), y2 = read(F + 20), z2 = read(F + 24);
  m.writeFloatLE(add(add(mul(read(first), x2), mul(y, y2)), mul(read(first + 8), z2)), F + 12);
  put(m, F + 12, get(m, F + 12) & 0x7fffffff);
  if (read(F + 12) > read(0x5dc770)) [x2, y2, z2] = [read(second + 4), read(second + 8), read(second)];
  const x = read(first), z = read(first + 8);
  const right = [sub(mul(y, z2), mul(z, y2)), sub(mul(z, x2), mul(x, z2)), sub(mul(x, y2), mul(y, x2)), 0];
  put(m, F - 4, 0x4a4f4f); vector(m, F + 16, right); //4020e0
  put(m, output + 12, get(m, F + 28)); put(m, output + 4, get(m, F + 20)); put(m, output, get(m, F + 16)); put(m, output + 8, get(m, F + 24));
  const length = add(add(mul(right[1], right[1]), mul(right[0], right[0])), mul(right[2], right[2]));
  if (length > read(0x5dc5a8)) {
    put(m, F - 4, 0x4a4fa8);
    const scale = f(read(0x5dc774) / squareRoot(length, {...runtime, scratchBase: F - 4, entryRegisters: {...runtime.entryRegisters, EBP: S - 4}}));
    for (let i = 0; i < 3; i++) m.writeFloatLE(mul(scale, read(F + 16 + i * 4)), output + i * 4);
  }
  const fy = read(first + 4), fx = read(first), fz = read(first + 8);
  const repaired = [sub(mul(fz, read(output + 4)), mul(fy, read(output + 8))), sub(mul(fx, read(output + 8)), mul(fz, read(output))), sub(mul(fy, read(output)), mul(fx, read(output + 4))), 0];
  put(m, F - 4, 0x4a5027); vector(m, F + 16, repaired); //4020e0
  Buffer.from(m.subarray(F + 16, F + 32)).copy(m, second);
}

//4a52a0. Both vector parameters are native by-value16-byte records.
export function buildAudioListenerBasis(output, firstWords, secondWords, runtime) {
  if (firstWords.length !== 4 || secondWords.length !== 4) throw Error('Listener basis requires two four-DWORD vectors.');
  const {memory: m, scratchBase: S} = runtime, F = S - 36, read = p => m.readFloatLE(p);
  [...firstWords, ...secondWords].forEach((word, i) => put(m, S + 4 + i * 4, word)); save(runtime, 'ESI', F);
  put(m, F - 4, 0x4a52ab); const identity = obtainRendererIdentity(runtime);
  const firstY = get(m, F + 44); put(m, F + 24, firstY);
  for (let block = 0; block < 4; block++) Buffer.from(m.subarray(identity + block * 16, identity + block * 16 + 16)).copy(m, output + block * 16);
  m.fill(0, F + 4, F + 20); put(m, F + 28, get(m, F + 40)); put(m, F + 20, get(m, F + 48));
  const x = read(F + 28), y = read(F + 24), z = read(F + 20), length = add(add(mul(x, x), mul(y, y)), mul(z, z));
  if (length > read(0x5dc5a8)) {
    put(m, F - 4, 0x4a532b);
    const scale = f(read(0x5dc774) / squareRoot(length, {...runtime, scratchBase: F - 4}));
    for (const [local, argument] of [[28, 40], [24, 44], [20, 48]]) {const value = mul(read(F + local), scale); m.writeFloatLE(value, F + local); m.writeFloatLE(value, F + argument);}
  }
  put(m, F - 4, F + 56); put(m, F - 8, F + 4); put(m, F - 12, 0x4a538c);
  orthogonalizeAudioListenerVectors(F + 40, F + 4, F + 56, {...runtime, scratchBase: F - 12, entryRegisters: {...runtime.entryRegisters, ESI: output}});
  //Native4020e0 stores the sign-flipped cross into the first argument record.
  const negative = [0, 4, 8].map(offset => get(m, F + 4 + offset) ^ get(m, 0x5dcf60));
  put(m, F - 4, 0x4a53b8); negative.forEach((word, i) => put(m, F + 40 + i * 4, word)); put(m, F + 52, 0);
  for (const [local, target] of [[40, 0], [44, 4], [48, 8], [56, 16], [60, 20], [64, 24], [28, 32], [24, 36], [20, 40]]) put(m, output + target, get(m, F + local));
  return output;
}

//4a4d20. Retains native float32 arithmetic, largest-diagonal tie rules and
//live matrix reads after earlier quaternion writes (including overlap).
export function audioListenerMatrixToQuaternion(output, matrix, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 24, read = p => m.readFloatLE(p);
  put(m, S + 4, matrix); for (const [name, offset] of [['EBX', 12], ['EBP', 8], ['ESI', 4], ['EDI', 0]]) save(runtime, name, F + offset); put(m, F + 20, output);
  const a = read(matrix), b = read(matrix + 20), c = read(matrix + 40), trace = add(add(a, b), c);
  if (trace > read(0x5d0080)) {
    put(m, F - 4, 0x4a4d61);
    const root = squareRoot(add(trace, read(0x5dc774)), {...runtime, scratchBase: F - 4, entryRegisters: {...runtime.entryRegisters, EBP: matrix}}), half = read(0x5dc6ec), scale = f(half / root), w = mul(root, half);
    m.writeFloatLE(mul(sub(read(matrix + 24), read(matrix + 36)), scale), output);
    m.writeFloatLE(mul(sub(read(matrix + 32), read(matrix + 8)), scale), output + 4);
    const z = sub(read(matrix + 4), read(matrix + 16)); m.writeFloatLE(w, output + 12); m.writeFloatLE(mul(z, scale), output + 8);
  } else {
    let i = b > a ? 1 : 0; if (c > read(matrix + i * 20)) i = 2;
    const j = get(m, 0x5d3a7c + i * 4), k = get(m, 0x5d3a7c + j * 4);
    const length = add(sub(sub(read(matrix + i * 20), read(matrix + j * 20)), read(matrix + k * 20)), read(0x5dc774));
    put(m, F - 4, 0x4a4e14);
    const root = squareRoot(length, {...runtime, scratchBase: F - 4, entryRegisters: {...runtime.entryRegisters, EBP: matrix}}), half = read(0x5dc6ec), scale = f(half / root);
    m.writeFloatLE(mul(root, half), output + i * 4);
    m.writeFloatLE(mul(add(read(matrix + (i + j * 4) * 4), read(matrix + (j + i * 4) * 4)), scale), output + j * 4);
    m.writeFloatLE(mul(add(read(matrix + (i + k * 4) * 4), read(matrix + (k + i * 4) * 4)), scale), output + k * 4);
    m.writeFloatLE(mul(sub(read(matrix + (k + j * 4) * 4), read(matrix + (j + k * 4) * 4)), scale), output + 12);
  }
  return output;
}

//40e720. Published wrapper state is consumed by the concrete Listener
//virtual setters. Unknown game vtables are explicit reached boundaries.
export function updateAudioListener(index, runtime) {
  const {memory: m, scratchBase: S} = runtime, A = (S - 4) & ~7, F = A - 96;
  save(runtime, 'EBP', S - 4); save(runtime, 'ESI', F); put(m, F + 92, get(m, 0x5e8890) ^ (F + 4));
  const finish = () => put(m, F, 0x40e873); //Cookie CALL after POP ESI.
  if (index < 0 || index >= ((get(m, 0x6f240c) - get(m, 0x6f2408)) >> 2)) {finish(); return;}
  const wrapper = ptr(m, ptr(m, 0x6f2408) + Math.imul(index, 4)); if (!wrapper) {finish(); return;}
  const set = (offset, returned) => {
    const listener = ptr(m, wrapper), table = ptr(m, listener), target = ptr(m, table + offset);
    const destination = new Map([[4, [0x4aa070, 0x20]], [12, [0x4aa0a0, 0x30]], [20, [0x4aa0d0, 0x40]]]).get(offset);
    put(m, F - 4, F + 8); put(m, F - 8, returned);
    if (target !== destination[0]) throw Error(`Unclassified listener setter 0x${target.toString(16)}.`);
    setAudioListenerVector(listener, F + 8, destination[1], {...runtime, scratchBase: F - 8});
  };
  for (const [flag, values, slot, returned] of [[4, 8, 4, 0x40e7a6], [20, 24, 12, 0x40e7ec]]) {
    const words = get(m, wrapper + flag) ? [0, 4, 8].map(offset => get(m, wrapper + values + offset)) : [0, 0, 0];
    words.forEach((word, i) => put(m, F + 8 + i * 4, word)); put(m, F + 20, 0); set(slot, returned);
  }
  if (get(m, wrapper + 36)) {
    const forward = [0, 4, 8].map(offset => get(m, wrapper + 52 + offset)), up = [0, 4, 8].map(offset => get(m, wrapper + 64 + offset));
    [...forward, 0].forEach((word, i) => put(m, F - 16 + i * 4, word)); [...up, 0].forEach((word, i) => put(m, F - 32 + i * 4, word)); put(m, F - 36, 0x40e84d);
    buildAudioListenerBasis(F + 24, [...up, 0], [...forward, 0], {...runtime, scratchBase: F - 36, entryRegisters: {...runtime.entryRegisters, EBP: S - 4, ESI: wrapper}});
    put(m, F - 4, F + 24); put(m, F - 8, 0x40e85b);
    audioListenerMatrixToQuaternion(F + 8, F + 24, {...runtime, scratchBase: F - 8, entryRegisters: {...runtime.entryRegisters, EBP: S - 4, ESI: wrapper}});
    set(20, 0x40e867);
  }
  finish();
}

//40f2f0. The captured index is read live from the actual owned callback.
export function invokeAudioListenerFunction(callback, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S - 4, 0x40f2f8);
  updateAudioListener(get(m, callback + 4), {...runtime, scratchBase: S - 4});
}
