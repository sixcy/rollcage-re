import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameImageServices, bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {constructGamePixelImage, initializeGameImageMetadata, clearGamePixelImage, initializeGameImageColorTransform, appendGameImagePointer, reserveGameImagePointers, allocateGamePixelImage, releaseGameImageMetadata, releaseGameImageList} from '../src/game-image-storage.mjs';
import {readGameImageRgba, writeGameImageRgba} from '../src/game-image-format.mjs';

export async function verifyGameImageStorage({fixtures = 600, output = 'analysis/game-image-storage-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, IMAGE = 0x100000, VECTOR = 0x110000, ARRAY = 0x120000; let steps = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address); const put = (m, p, v) => m.writeInt32LE(v | 0, p), entries = [0x4bc8b0, 0x4c4750, 0x4c1af0, 0x4bcb70, 0x40ebc0, 0x40f060, 0x4c18e0, 0x4bcbe0, 0x4bc2b0];
  machine.externalCalls.set(0x568f10, m => {const value = BigInt.asUintN(64, m.bytes.readBigUInt64LE(m.r.ESP) * m.bytes.readBigUInt64LE(m.r.ESP + 8)); m.r.EAX = Number(value & 0xffffffffn); m.r.EDX = Number(value >> 32n); m.r.ESP += 16;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36 + fixture % 17, S - 0x2000, S + 128); const entry = entries[fixture % entries.length], variant = Math.floor(fixture / entries.length); memory.fill(0xcd, IMAGE, IMAGE + 0x1b8); put(memory, IMAGE, 0); put(memory, IMAGE + 4, 0); memory[IMAGE + 0x174] = variant & 1;
    const size = variant % 6, capacity = variant % 2 ? size + 2 : size; put(memory, VECTOR, ARRAY); put(memory, VECTOR + 4, ARRAY + size * 4); put(memory, VECTOR + 8, ARRAY + capacity * 4); for (let i = 0; i < capacity; i++) put(memory, ARRAY + i * 4, i * 123 + variant);
    if (entry === 0x4bc2b0) for (let i = 0; i < size; i++) put(memory, ARRAY + i * 4, IMAGE);
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const nativeServices = createGameImageServices(machine.bytes); bindGameImageServices(machine, nativeServices); machine.bytes.copy(memory); const services = createGameImageServices(memory), runtime = {memory, scratchBase: S, services}; let result, compareReturn = false, ecx = IMAGE, stack = [], byteReturn = false;
    switch (entry) {
      case 0x4bc8b0: ecx = VECTOR; result = constructGamePixelImage(VECTOR, runtime); compareReturn = true; break;
      case 0x4c4750: result = initializeGameImageMetadata(IMAGE, runtime); compareReturn = true; break;
      case 0x4c1af0: clearGamePixelImage(IMAGE, runtime); break;
      case 0x4bcb70: initializeGameImageColorTransform(IMAGE, runtime); result = IMAGE; compareReturn = true; break;
      case 0x40ebc0: ecx = VECTOR; stack = [size ? ARRAY + (variant % size) * 4 : IMAGE]; appendGameImagePointer(VECTOR, stack[0], runtime); break;
      case 0x40f060: ecx = VECTOR; stack = [size + 4]; reserveGameImagePointers(VECTOR, stack[0], runtime); break;
      case 0x4c18e0: {const type = variant % 9; stack = [type, type === 1 ? 128 : type === 2 ? 8 : type === 0 && variant % 2 ? -1 : 16, 4 + variant % 5, 3 + variant % 7, -1, -1, -1, -1, variant & 1]; result = allocateGamePixelImage(IMAGE, ...stack, runtime); compareReturn = true; byteReturn = true; break;}
      case 0x4bcbe0: releaseGameImageMetadata(IMAGE, runtime); break;
      case 0x4bc2b0: ecx = VECTOR; releaseGameImageList(VECTOR, runtime); break;
    }
    machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); stack.forEach((v, i) => machine.bytes.writeInt32LE(v, S + 4 + i * 4)); steps += machine.run(1000000); if (compareReturn) assert.equal(byteReturn ? machine.r.EAX & 255 : machine.r.EAX | 0, result | 0, `fixture${fixture} return`);
    const native = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!native.equals(actual)) {const offset = native.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${actual[offset]}`);}
    const filtered = calls => calls.filter(([name]) => !['memcpy', 'memset', 'memmove', 'strrchr', 'toupper'].includes(name)); assert.deepEqual(filtered(services.calls), filtered(nativeServices.calls), `fixture${fixture} ordered services`);
  }
  const chains = 80;
  for (let fixture = 0; fixture < chains; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36 + fixture % 17, S - 0x2000, S + 128); machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const nativeServices = createGameImageServices(machine.bytes); bindGameImageServices(machine, nativeServices); machine.bytes.copy(memory); const services = createGameImageServices(memory), runtime = {memory, scratchBase: S, services, entryRegisters: {EAX: 0, EBX: 0, ESI: 0, EDI: 0, EBP: 0}};
    const compare = label => {const native = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!native.equals(actual)) {const offset = native.findIndex((v, i) => v !== actual[i]); assert.fail(`chain${fixture}/${label} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${actual[offset]} spans ${native.subarray(offset, offset + 24).toString('hex')} / ${actual.subarray(offset, offset + 24).toString('hex')}`);}};
    const run = (entry, ecx, stack = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); stack.forEach((v, i) => machine.bytes.writeInt32LE(v, S + 4 + i * 4)); steps += machine.run(1000000); compare(entry.toString(16));};
    const image = constructGamePixelImage(VECTOR, runtime); run(0x4bc8b0, VECTOR);
    const args = [0, 32, 4 + fixture % 5, 3 + fixture % 3, -1, -1, -1, -1, 1]; allocateGamePixelImage(image, ...args, runtime); run(0x4c18e0, image, args);
    const pixel = memory.readUInt32LE(image + 4), color = Math.imul(fixture + 1, 0x1234567); writeGameImageRgba(image, pixel, color, runtime); run(0x4c2270, image, [pixel, color]); readGameImageRgba(image, IMAGE, pixel, runtime); run(0x4c2160, image, [IMAGE, pixel]); releaseGameImageList(VECTOR, runtime); run(0x4bc2b0, VECTOR);
  }
  const report = {fixtures, chains, operations: fixtures + chains * 5, instructionSteps: steps, reachedInstructions: reached.size, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameImageStorage()));
