import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {initializeAudioListenerConstants, setAudioListenerVector, orthogonalizeAudioListenerVectors, buildAudioListenerBasis, audioListenerMatrixToQuaternion, updateAudioListener, invokeAudioListenerFunction} from '../src/audio-listener-update.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p), S = 0x1f000, OBJECT = 0x100000, INPUT = 0x110000, OTHER = 0x120000, WRAPPER = 0x130000;
const entries = [0x4aa070, 0x4aa0a0, 0x4aa0d0, 0x4a4e90, 0x4a52a0, 0x4a4d20, 0x40e720, 0x40f2f0], fixtures = Number(process.argv[2] ?? 2400), reached = new Set(), visits = {};
const watched = [...entries, 0x4a4d00, 0x402160], registers = {EBX: 0x232323, EBP: 0x343434, ESI: 0x454545, EDI: 0x565656};
let steps = 0, mathCalls = 0, overlaps = 0;
machine.onInstruction = address => {
  reached.add(address); if (watched.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
  if (address === 0x4a4d0a) put(machine.bytes, machine.r.ESP - 4, 0x4a4d0f);
  if (address === 0x40e86e) put(machine.bytes, machine.r.ESP - 4, 0x40e873);
};
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 1024, S + 128); put(memory, S, -1);
  assert.deepEqual(initializeAudioListenerConstants(Buffer.from(memory)), memory, 'Original scalar/index initializer independently matches retained bytes.');
  const selector = fixture % entries.length, variant = Math.floor(fixture / entries.length), entry = entries[selector], sourceTrace = [], nativeTrace = [];
  for (let i = 0; i < 32; i++) {memory.writeFloatLE(((variant * 13 + i * 7) % 47 - 23) / 8, INPUT + i * 4); memory.writeFloatLE(((variant * 5 + i * 3) % 29 - 14) / 4, OTHER + i * 4);}
  for (let i = 0; i < 4; i++) memory.writeFloatLE(variant % 7 === 0 ? 0 : i < 3 ? (variant + i * 3) % 9 - 4 : 0, INPUT + i * 4);
  if (variant % 7 === 1) Buffer.from(memory.subarray(INPUT, INPUT + 16)).copy(memory, OTHER);
  if (variant % 17 === 0) for (const p of [INPUT, OTHER]) for (let i = 0; i < 3; i++) memory.writeFloatLE(i === variant % 3 ? 1 : 0, p + i * 4);
  if (selector === 5) {
    memory.fill(0, INPUT, INPUT + 64);
    const diagonals = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1], [0, 0, 0], [-2, -2, -2], [memory.readFloatLE(0x5d0080) / 2, 0, 0], [memory.readFloatLE(0x5d0080) * 2, 0, 0]][variant % 8];
    diagonals.forEach((value, i) => memory.writeFloatLE(value, INPUT + i * 20));
    for (const offset of [4, 8, 16, 24, 32, 36]) memory.writeFloatLE(((variant + offset) % 9 - 4) / 8, INPUT + offset);
  }
  put(memory, 0x6e6364, variant % 2); for (let i = 0; i < 16; i++) memory.writeFloatLE(i % 5 ? 0 : 1, 0x6e6390 + i * 4);
  put(memory, OBJECT, 0x5d3cc4); put(memory, 0x5d3cc8, 0x4aa070); put(memory, 0x5d3cd0, 0x4aa0a0); put(memory, 0x5d3cd8, 0x4aa0d0);
  put(memory, 0x6f2408, 0x140000); put(memory, 0x6f240c, 0x14000c); put(memory, 0x140000, WRAPPER); put(memory, 0x140004, 0); put(memory, 0x140008, WRAPPER);
  put(memory, WRAPPER, OBJECT); put(memory, WRAPPER + 4, variant % 2); put(memory, WRAPPER + 20, variant % 3); put(memory, WRAPPER + 36, variant % 4);
  for (let i = 0; i < 3; i++) {put(memory, WRAPPER + 8 + i * 4, ptr(memory, INPUT + i * 4)); put(memory, WRAPPER + 24 + i * 4, ptr(memory, OTHER + i * 4)); put(memory, WRAPPER + 52 + i * 4, ptr(memory, INPUT + i * 4)); put(memory, WRAPPER + 64 + i * 4, ptr(memory, OTHER + i * 4));}
  const index = [0, 1, 2, -1, 3][variant % 5]; put(memory, OTHER + 4, index);
  const runtime = {memory, scratchBase: S, entryRegisters: registers, services: {rendererMath(operation, value, precision) {sourceTrace.push([operation, value, precision]); return Math[operation](value);}}};
  let args = [], result, ecx = OBJECT, edx = 0;
  if (selector < 3) {
    const offset = [0x20, 0x30, 0x40][selector], input = variant % 3 ? INPUT : OBJECT + offset - 4;
    if (input !== INPUT) {overlaps++; for (let i = 0; i < 5; i++) put(memory, input + i * 4, variant + i + 1);}
    args = [input];
  } else if (selector === 3) {ecx = INPUT; args = [variant % 3 ? OBJECT : INPUT + 4, OTHER]; overlaps += Number(args[0] !== OBJECT);}
  else if (selector === 4) args = [0, 4, 8, 12].map(offset => ptr(memory, INPUT + offset)).concat([0, 4, 8, 12].map(offset => ptr(memory, OTHER + offset)));
  else if (selector === 5) {ecx = variant % 3 ? OBJECT : INPUT + (variant % 4) * 4; args = [INPUT]; overlaps += Number(ecx !== OBJECT);}
  else if (selector === 6) edx = index;
  else {ecx = OTHER; args = [0x141414];}
  args.forEach((value, i) => put(memory, S + 4 + i * 4, value));
  machine.reset(); memory.copy(machine.bytes); machine.entry = entry; machine.r.ESP = S; machine.r.ECX = ecx; machine.r.EDX = edx; Object.assign(machine.r, registers);
  machine.externalCalls.set(0x5695b6, state => {const value = state.scalars.XMM0; nativeTrace.push(['sqrt', value, 64]); state.scalars.XMM0 = Math.sqrt(value); state.doubleScalars.add('XMM0'); state.integerVectors.delete('XMM0'); state.qwords.delete('XMM0'); state.scalarBits.delete('XMM0'); state.zeroVectors.delete('XMM0');});
  machine.externalCalls.set(0x568162, state => assert.equal(state.r.ECX >>> 0, ptr(state.bytes, 0x5e8890)));
  try {
    if (selector < 3) setAudioListenerVector(OBJECT, args[0], [0x20, 0x30, 0x40][selector], runtime);
    else if (selector === 3) orthogonalizeAudioListenerVectors(ecx, ...args, runtime);
    else if (selector === 4) result = buildAudioListenerBasis(ecx, args.slice(0, 4), args.slice(4), runtime);
    else if (selector === 5) result = audioListenerMatrixToQuaternion(ecx, args[0], runtime);
    else if (selector === 6) updateAudioListener(edx, runtime);
    else invokeAudioListenerFunction(ecx, runtime);
    steps += machine.run(100000); if (result !== undefined) assert.equal(machine.r.EAX >>> 0, result >>> 0); assert.deepEqual(nativeTrace, sourceTrace);
    const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000);
    if (!actual.equals(expected)) {const p = actual.findIndex((value, i) => value !== expected[i]) + 0x10000; assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 16).toString('hex')} source${memory.subarray(p, p + 16).toString('hex')}`);}
  } catch (error) {console.error({fixture, entry: entry.toString(16), variant, ecx: ecx.toString(16), args, sourceTrace, nativeTrace}); throw error;}
  mathCalls += sourceTrace.length;
}
const path = 'src/audio-listener-update.mjs', constantsPath = 'src/audio-listener-constants.json', report = {matched: true, method: 'Actual40f2f0 captured-index invocation to40e720 and concrete Listener position/velocity/quaternion setters,4a52a0 basis,4a4e90 orthogonalization,4a4d20 matrix-to-quaternion,402160 shared lazy identity and4a4d00 precise-sqrt wrapper. Genuine CRT double sqrt and security-cookie validation are external. Original scalar/index initializer independently matches retained bytes. Entire mapped memory>=10000h includes native stack; relevant EAX, cookie and ordered sqrt inputs compare. Finite fixtures cover zero/parallel axes, lazy identity, trace values on both sides of the original epsilon, all largest-diagonal branches, invalid/missing wrapper indices, live-DWORD versus SIMD setter overlap and matrix/output overlap. No original-process execution or sound-device/bootstrap closure.', fixtures, reachedInstructions: reached.size, instructionSteps: steps, visits, mathCalls, overlaps, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, constants: {path: constantsPath, sha256: createHash('sha256').update(await readFile(constantsPath)).digest('hex')}, targetSha256: program.sha256};
const output = process.argv[3] ?? 'analysis/audio-listener-update-canonical-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
