import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameImageServices, bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {initializeRawGameArchive, decodeRawGameResource, readRawArchiveResource, setGameArchiveMode, findGameResourceName, openGameResource, readGameResource, closeGameResource, allocateGameImageBytes} from '../src/game-resource-files.mjs';

export async function verifyGameResources({fixtures = 600, output = 'analysis/game-resource-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, NAME = 0x100000, INDEX = 0x110000, IN = 0x200000, OUT = 0x210000; let steps = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address);
  const put = (p, v) => memory.writeInt32LE(v | 0, p), entries = [0x401000, 0x401380, 0x401160, 0x4010e0, 0x447ae0, 0x447ca0, 0x447d60, 0x447d20, 0x4891e0, 0x489210];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 0x2000, S + 128); memory.write('Data.img\0', NAME); const variant = Math.floor(fixture / entries.length), entry = entries[fixture % entries.length];
    const patterns = [[0x7a, [65, 255, 0, 0, 1]], [0x1e, [65, 0xf9, 0xff, 0, 0, 1]], [0x1e, [65, 0xf8, 0xff, 0, 9, 0, 0, 0, 1]]], [control, tail] = patterns[variant % 3], decodedLength = [6, 4, 10][variant % 3], compressed = Buffer.alloc(20 + tail.length); compressed.write('GT20'); compressed.writeUInt32LE(decodedLength, 4); compressed.writeUInt32LE(control, 16); compressed.set(tail, 20); compressed.copy(memory, IN);
    const file = Buffer.alloc(0x200); for (let i = 0; i < file.length; i++) file[i] = i * 31 + fixture & 255; compressed.copy(file, 0x40);
    put(0x717388, INDEX); put(0x717380, variant & 1 ? 0 : 0x90); put(0x6e4900, 0x1234); memory.writeInt16LE(variant & 1, 0x5e8008); memory.write('Data.img\0', 0x717360);
    for (let i = 0; i < 3; i++) {const p = INDEX + i * 16; put(p, i ? 0x40 : 0xc0); put(p + 4, i ? compressed.length : 16); put(p + 8, i ? decodedLength : 16); memory.writeInt16LE(i ? 32 : 0, p + 12); memory.writeInt16LE(i === 1 ? 2 : 0, p + 14);}
    if (entry === 0x447ae0 || entry === 0x447ca0) {const pointer = memory.readUInt32LE(0x5eb600); let length = 1; while (memory[pointer + length - 1]) length++; memory.copy(memory, NAME, pointer, pointer + length); if (variant & 1) for (let p = NAME; memory[p]; p++) if (memory[p] >= 65 && memory[p] <= 90) memory[p] += 32; if (entry === 0x447ca0) {const id = memory.readUInt16LE(0x5eb604); if (id >= 344) throw Error('Fixture original resource id outside cache.'); memory.copy(memory, INDEX + id * 16, INDEX, INDEX + 16);}}
    put(0x6e6708, 1); put(0x90c0a0, OUT); put(0x90c0a4, variant % 8); memory.fill(0x5a, OUT, OUT + 256);
    machine.reset(); memory.copy(machine.bytes); const nativeServices = createGameImageServices(machine.bytes, {file}); bindGameImageServices(machine, nativeServices); machine.bytes.copy(memory); const services = createGameImageServices(memory, {file}), runtime = {memory, scratchBase: S, services};
    let result, compareReturn = true, ecx = 0, edx = 0, stack = [];
    switch (entry) {
      case 0x401000: initializeRawGameArchive(NAME, 3, runtime); stack = [NAME, 3]; compareReturn = false; break;
      case 0x401380: result = decodeRawGameResource(IN, OUT, runtime); stack = [IN, OUT]; break;
      case 0x401160: result = readRawArchiveResource(variant & 1 ? 1 : 0, variant % 3 ? 0 : OUT, runtime); stack = [variant & 1 ? 1 : 0, variant % 3 ? 0 : OUT]; break;
      case 0x4010e0: setGameArchiveMode(variant % 3, runtime); stack = [variant % 3]; compareReturn = false; break;
      case 0x447ae0: result = findGameResourceName(NAME, runtime); ecx = NAME; break;
      case 0x447ca0: result = openGameResource(NAME, runtime); ecx = NAME; break;
      case 0x447d60: ecx = variant & 1 ? OUT : 0x1234; edx = variant % 3 ? IN : 0; stack = [variant % 3 ? 17 : 0]; result = readGameResource(ecx, edx, stack[0], runtime); break;
      case 0x447d20: ecx = variant % 3 ? OUT : 0x1234; closeGameResource(ecx, runtime); compareReturn = false; break;
      default: ecx = variant % 23 * 4 + 1; result = allocateGameImageBytes(ecx, entry === 0x489210, runtime);
    }
    machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); stack.forEach((v, i) => machine.bytes.writeInt32LE(v, S + 4 + i * 4)); steps += machine.run(1000000);
    if (compareReturn) assert.equal(machine.r.EAX | 0, result | 0, `fixture${fixture} return`);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}
    const filtered = calls => calls.filter(([name]) => !['memcpy', 'memset', 'strrchr', 'toupper'].includes(name)); assert.deepEqual(filtered(services.calls), filtered(nativeServices.calls), `fixture${fixture} ordered services`);
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true, boundaries: 'CRT allocation/file APIs and Win32 disk I/O only; actual GT20 and cache code'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameResources()));
