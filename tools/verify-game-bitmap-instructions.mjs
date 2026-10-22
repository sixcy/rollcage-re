import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameImageServices, bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {loadGameBitmap, loadGamePlatformImage, makeGameImageWideName} from '../src/game-bitmap-images.mjs';

export async function verifyGameBitmap({fixtures = 240, output = 'analysis/game-bitmap-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, NAME = 0x100000, DESC = 0x110000; let steps = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, STACK - 0x2000, STACK + 128); memory.fill(0xa5, DESC, DESC + 40); memory.write('Example\\Image.bmp\0', NAME);
    const entry = [0x414d60, 0x414dc0, 0x4895d0][fixture % 3], variant = Math.floor(fixture / 3), width = 2 + variant % 7, height = 1 + variant % 5, bits = [8, 24, 32, 4][variant % 4], colors = bits <= 8 ? 1 << bits : 0, pitch = (width * bits / 8 + 3 | 0) & ~3, file = Buffer.alloc(54 + colors * 4 + pitch * height);
    file.write('BM'); file.writeUInt32LE(file.length, 2); file.writeUInt32LE(54 + colors * 4, 10); file.writeUInt32LE(40, 14); file.writeInt32LE(width, 18); file.writeInt32LE(height, 22); file.writeUInt16LE(1, 26); file.writeUInt16LE(bits, 28); file.writeUInt32LE(colors, 46); for (let i = 54; i < file.length; i++) file[i] = i * 13 + fixture & 255;
    const options = {file, width, height, negativeStride: !!(variant & 1), openFailure: variant % 6 === 0, lockFailure: variant % 11 === 0, widthFailure: variant % 17 === 0}, nativeServices = createGameImageServices(machine.bytes, options);
    machine.reset(); memory.copy(machine.bytes); bindGameImageServices(machine, nativeServices); machine.bytes.copy(memory); const services = createGameImageServices(memory, options), runtime = {memory, scratchBase: STACK, services}, flags = variant & 1;
    const result = entry === 0x414d60 ? makeGameImageWideName(NAME, runtime) : entry === 0x414dc0 ? loadGamePlatformImage(NAME, DESC, flags, runtime) : loadGameBitmap(NAME, DESC, flags, runtime);
    machine.entry = entry; machine.r.ECX = NAME; machine.r.EDX = DESC; machine.r.ESP = STACK; machine.bytes.writeInt32LE(-1, STACK); machine.bytes.writeInt32LE(flags, STACK + 4); steps += machine.run(5000000);
    assert.equal(machine.r.EAX | 0, result | 0, `fixture${fixture} return`);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}
    const filtered = calls => calls.filter(([name]) => !['memcpy', 'memset', 'strrchr', 'toupper'].includes(name)); assert.deepEqual(filtered(services.calls), filtered(nativeServices.calls), `fixture${fixture} ordered CRT/platform requests`);
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true, boundaries: 'CRT allocation/memory routines and Win32/GDI+ services; no game algorithm mocked'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameBitmap()));
