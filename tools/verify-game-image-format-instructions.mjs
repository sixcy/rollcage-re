import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {analyzeGameImageMasks, setGameImageMasks, readGameImagePacked, writeGameImagePacked, packGameImageFloat, writeGameImageHalf, gameImageHalfBits, findGameImagePaletteIndex, readGameImageFloat, writeGameImageFloat, readGameImageRgba, writeGameImageRgba} from '../src/game-image-format.mjs';

export async function verifyGameImageFormat({fixtures = 2400, output = 'analysis/game-image-format-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, IMAGE = 0x100000, PIXEL = 0x110000, OUT = 0x120000, PALETTE = 0x130000; let steps = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address);
  const entries = [0x4c1eb0, 0x4c1f90, 0x4c20a0, 0x4c2100, 0x4c1150, 0x4c17c0, 0x4c9300, 0x4c23b0, 0x4c2440, 0x4c2570, 0x4c2160, 0x4c2270], put = (p, v) => memory.writeInt32LE(v | 0, p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 0x1000, S + 128); const entry = entries[fixture % entries.length], variant = Math.floor(fixture / entries.length), type = [0, 0, 1, 1, 2, 3, 8][variant % 7], depth = type === 1 ? variant & 1 ? 64 : 128 : [8, 16, 24, 32][variant % 4], runtime = {memory, scratchBase: S};
    put(IMAGE, PALETTE); put(IMAGE + 0x10, type); put(IMAGE + 0x44, depth); setGameImageMasks(IMAGE, -1, -1, -1, -1, runtime);
    for (let i = 0; i < 256; i++) put(PALETTE + i * 4, Math.imul(i * 17 + variant, 0x1011379));
    for (let i = 0; i < 16; i++) memory[PIXEL + i] = i * 19 + variant * 7 & 255;
    if (type === 2) memory[PIXEL] = variant % 256; // non8-bit palette fixture still keeps an in-range index.
    if (type === 2 && depth > 8) put(PIXEL, variant % 256);
    const rgba = Math.imul(variant + 1, 0x75134f1), floats = [0, -0, 0.5, 1, -1, 2, 65504, 1e-7, Infinity, -Infinity, NaN];
    for (let i = 0; i < 4; i++) memory.writeFloatLE(floats[(variant + i) % floats.length], OUT + i * 4);
    if (type === 1 && depth === 128) for (let i = 0; i < 4; i++) memory.writeFloatLE(floats[(variant + i) % floats.length], PIXEL + i * 4);
    machine.reset(); memory.copy(machine.bytes);
    const outputAddress = variant % 5 === 0 ? PIXEL : OUT, inputAddress = variant % 5 === 0 ? PIXEL : OUT;
    let result, compareReturn = false, ecx = IMAGE, stack = [], half = false;
    if (entry === 0x4c1eb0) analyzeGameImageMasks(IMAGE, runtime);
    else if (entry === 0x4c1f90) {stack = variant & 1 ? [-1, -1, -1, -1] : [0xf800, 0x7e0, 31, 0]; setGameImageMasks(IMAGE, ...stack, runtime);}
    else if (entry === 0x4c20a0) {result = readGameImagePacked(IMAGE, PIXEL, runtime); stack = [PIXEL]; compareReturn = true;}
    else if (entry === 0x4c2100) {writeGameImagePacked(IMAGE, PIXEL, rgba, runtime); stack = [PIXEL, rgba];}
    else if (entry === 0x4c1150) {ecx = PIXEL; result = packGameImageFloat(PIXEL, inputAddress, runtime); stack = [inputAddress]; compareReturn = true;}
    else if (entry === 0x4c17c0) {ecx = PIXEL; writeGameImageHalf(PIXEL, memory.readInt32LE(OUT), runtime); result = PIXEL; compareReturn = true;}
    else if (entry === 0x4c9300) {ecx = memory.readInt32LE(OUT); result = gameImageHalfBits(ecx); compareReturn = true; half = true;}
    else if (entry === 0x4c23b0) {result = findGameImagePaletteIndex(IMAGE, rgba, runtime); stack = [rgba]; compareReturn = true;}
    else if (entry === 0x4c2440) {result = readGameImageFloat(IMAGE, outputAddress, PIXEL, runtime); stack = [outputAddress, PIXEL]; compareReturn = true;}
    else if (entry === 0x4c2570) {writeGameImageFloat(IMAGE, PIXEL, inputAddress, runtime); stack = [PIXEL, inputAddress];}
    else if (entry === 0x4c2160) {result = readGameImageRgba(IMAGE, outputAddress, PIXEL, runtime); stack = [outputAddress, PIXEL]; compareReturn = true;}
    else {writeGameImageRgba(IMAGE, PIXEL, rgba, runtime); stack = [PIXEL, rgba];}
    machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); stack.forEach((v, i) => machine.bytes.writeInt32LE(v | 0, S + 4 + i * 4)); if (entry === 0x4c17c0) machine.scalars.XMM1 = machine.bytes.readFloatLE(OUT); steps += machine.run(1000000);
    if (compareReturn) assert.equal(half ? machine.r.EAX & 65535 : machine.r.EAX | 0, half ? result & 65535 : result | 0, `fixture${fixture} return`);
    const native = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!native.equals(actual)) {const offset = native.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} type${type}/${depth} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${actual[offset]}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameImageFormat()));
