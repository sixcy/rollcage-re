import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {setGameImageMasks} from '../src/game-image-format.mjs';
import {resampleGameImageRows} from '../src/game-image-resample-rows.mjs';
export async function verifyGameImageResampleRows({fixtures = 720, output = 'analysis/game-image-resample-rows-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, SOURCE = 0x100000, TARGET = 0x110000, put = (m, p, v) => m.writeInt32LE(v | 0, p); let steps = 0; const reached = new Set(); machine.onInstruction = p => reached.add(p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, 0x1000, S + 128); const type = fixture % 2, depth = type ? fixture % 4 === 1 ? 128 : 64 : fixture % 4 === 0 ? 32 : 16, sw = [8, 7, 4, 9, 3][Math.floor(fixture / 4) % 5], sh = [8, 5, 6][Math.floor(fixture / 20) % 3], width = [4, 3, 2][Math.floor(fixture / 60) % 3], height = [4, 3][Math.floor(fixture / 180) % 2], filter = [0, 3, 4, 2][Math.floor(fixture / 3) % 4], limit = [0, 1, 2][Math.floor(fixture / 12) % 3];
    for (const [image, pixels, w, h] of [[SOURCE, 0x200000, sw, sh], [TARGET, 0x210000, width, height]]) {put(memory, image + 4, pixels); put(memory, image + 8, w); put(memory, image + 12, h); put(memory, image + 16, type); put(memory, image + 0x44, depth); setGameImageMasks(image, -1, -1, -1, -1, {memory, scratchBase: S});}
    for (let i = 0; i < sw * sh * (depth >> 3); i++) memory[0x200000 + i] = i * 73 + fixture & 255;
    if (type) for (let i = 0; i < sw * sh * 4; i++) {if (depth === 128) memory.writeFloatLE([0, 0.1, 0.25, 0.75, 1][(i + fixture) % 5], 0x200000 + i * 4); else memory.writeUInt16LE([0, 0x3400, 0x3800, 0x3c00][i % 4], 0x200000 + i * 2);}
    memory.fill(0xc9, 0x210000, 0x212000); const start = fixture % 3 === 1 ? 1 : 0, rows = fixture % 11 === 0 ? 0 : height - start, args = [0, 0, width, height, start, rows, SOURCE, TARGET, filter, limit];
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); resampleGameImageRows(SOURCE, args, {memory, scratchBase: S}); machine.entry = 0x4c4f40; machine.r.ECX = SOURCE; machine.r.ESP = S; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(2000000);
    const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} filter${filter} ${sw}x${sh}→${width}x${height}/${type}/${depth} diff0x${(offset + 0x10000).toString(16)} native${expected[offset]} source${actual[offset]}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameImageResampleRows()));
