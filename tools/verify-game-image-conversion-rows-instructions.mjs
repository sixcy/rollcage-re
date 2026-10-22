import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {setGameImageMasks} from '../src/game-image-format.mjs';
import {convertGameImageRows} from '../src/game-image-conversion-rows.mjs';

export async function verifyGameImageConversionRows({fixtures = 960, output = 'analysis/game-image-conversion-rows-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, SOURCE = 0x100000, TARGET = 0x110000, INPUT = 0x200000, OUTPUT = 0x300000; let steps = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address); const put = (p, v) => memory.writeInt32LE(v | 0, p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 0x2000, S + 128); const sourceType = fixture % 4, targetType = Math.floor(fixture / 4) % 3, variant = Math.floor(fixture / 12), width = 3 + variant % 4, sourceDepth = sourceType === 1 ? variant & 1 ? 64 : 128 : sourceType === 2 ? 8 : [16, 24, 32][variant % 3], targetDepth = targetType === 1 ? variant & 1 ? 128 : 64 : [32, 16, 24][variant % 3], targetPixels = variant % 11 === 0 ? INPUT : OUTPUT;
    for (const [image, type, depth, pixels, palette] of [[SOURCE, sourceType, sourceDepth, INPUT, 0x130000], [TARGET, targetType, targetDepth, targetPixels, 0x140000]]) {put(image, palette); put(image + 4, pixels); put(image + 8, width); put(image + 12, 4); put(image + 16, type); put(image + 0x44, depth); setGameImageMasks(image, -1, -1, -1, -1, {memory, scratchBase: S});}
    memory.writeFloatLE(variant % 3 ? 0.5 : 0.2, SOURCE + 0x50); memory.writeFloatLE(variant % 3 ? 1 : 0.7, SOURCE + 0x54); for (let i = 0; i < 256; i++) {put(0x130000 + i * 4, Math.imul(i + fixture, 0x2f31457)); put(0x140000 + i * 4, Math.imul(i + fixture, 0x7111137));}
    for (let i = 0; i < 2048; i++) memory[INPUT + i] = i * 19 + fixture * 7 & 255;
    if (sourceType === 1) {for (let i = 0; i < 64; i++) if (sourceDepth === 128) memory.writeFloatLE([0, 0.2, 0.5, 1, -0.1, 1.5][(i + variant) % 6], INPUT + i * 4); else memory.writeUInt16LE([0, 0x3800, 0x3c00, 0x3e00, 0xb800][(i + variant) % 5], INPUT + i * 2);}
    const args = [17, 29, width - (variant % 5 === 0 ? width + 1 : 1), 47, variant % 2, variant % 4, 2, targetType, TARGET]; machine.reset(); memory.copy(machine.bytes); convertGameImageRows(SOURCE, args, {memory, scratchBase: S}); machine.entry = 0x4bd770; machine.r.ECX = SOURCE; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); args.forEach((v, i) => machine.bytes.writeInt32LE(v, S + 4 + i * 4)); steps += machine.run(2000000);
    const native = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!native.equals(actual)) {const offset = native.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} ${sourceType}/${sourceDepth}→${targetType}/${targetDepth} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${actual[offset]}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameImageConversionRows()));
