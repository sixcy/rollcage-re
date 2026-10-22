import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {computeWeatherVolumeBounds, seedWeatherVolumeParticles, buildWeatherParticipantPose, swapWeatherBodyPose, initializeWeatherVolume, updateWeatherVolume} from '../src/weather-volumes.mjs';

export async function verifyWeatherVolumes({fixtures = 600, output = 'analysis/weather-volumes-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000;
  const row = 0x100000, body = 0x200000, min = 0x79000, max = 0x79008, pack = 0x300000, sectorTable = 0x301000, sector = 0x302000;
  const put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  let steps = 0, volumeCalls = 0; const reached = new Set(), entryCounts = {}, entries = [0x496ff0, 0x496e80, 0x41bf40, 0x496830, 0x4963e0, 0x4969d0];
  machine.onInstruction = address => reached.add(address);
  const sourceVolume = (m, source, volume) => {m.writeUInt32LE(source, 0x58000); m.writeFloatLE(volume, 0x58004);};
  machine.externalCalls.set(0x57000, m => {sourceVolume(m.bytes, m.r.ECX >>> 0, m.bytes.readFloatLE(m.r.ESP)); m.r.ESP += 4; volumeCalls++;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, STACK - 0x1000, STACK + 64);
    const index = fixture % 6, variant = Math.floor(fixture / 6), entry = entries[index], context = {memory, scratchBase: STACK, handlers: {sourceVolume: (source, volume) => sourceVolume(memory, source, volume)}};
    put(0x5ecb1c, 0x60000); memory[0x60553] = fixture % 3; put(0x5ed2bc, 1 + fixture * 23487);
    put(0x90b98c, pack); put(pack, sectorTable); put(sectorTable, sector); memory[sector + 4] = variant % 4 === 0 ? 8 : 0;
    put(0x909300, body); put(0x909318, 0x210000); put(0x210000, body); put(0x5ec120, 0); put(row + 0x10, body);
    put(0x80ddf8, 3); put(0x80dde0, row); put(0x80dde4, row); put(0x80dde8, row); put(0x6e9f70, -1);
    put(0x909254, 0x40000); put(0x909278, 0x45000); put(0x9092c0, 0x50000); memory[0x50002] = 5;
    for (let i = 0; i < 256; i++) {word(0x40000 + i * 16, 0xff00); word(0x40002 + i * 16, 255); put(0x4000c + i * 16, 0x43000);}
    for (let axis = 0; axis < 3; axis++) {put(body + 0x34 + axis * 4, (axis * 7 + fixture % 9) * 65536); put(body + 0x68 + axis * 4, (axis + 1) * 12345);}
    for (const offset of [0xc4, 0xcc, 0xd4]) word(body + offset, 4096); memory[body + 0x64f] = fixture & 1;
    put(body + 0x11c, variant % 5 === 0 ? -1 : 0); put(0x90a548, variant % 11);
    put(row + 0x4024, fixture % 7 === 0 ? 0x55000 : fixture % 7 === 1 ? 0 : 127); put(0x55000, 0x56000); put(0x56000, 0x56100); put(0x56114, 0x57000); put(row + 0x4028, [6900, 13001, 8000][fixture % 3]);
    put(row + 0x4014, row + 0x4014 - 8); put(row + 0x4018, fixture & 1 ? 0x320000 : 0x80000); word(row + 0x401c, variant % 5 - 2); word(row + 0x402c, variant % 3); memory[row + 0x4020] = variant % 13 === 0 ? 1 : 0;
    for (let axis = 0; axis < 3; axis++) {word(min + axis * 2, axis * 3); word(max + axis * 2, axis === 1 ? 128 : 256);}
    computeWeatherVolumeBounds(row, row, row + 8, context);
    for (let axis = 0; axis < 3; axis++) {const shift = variant % 4 === 2 ? 2000 : 8; word(row + axis * 2, memory.readInt16LE(row + axis * 2) + shift); word(row + 8 + axis * 2, memory.readInt16LE(row + 8 + axis * 2) + shift);}
    for (let i = 0; i < 2048; i++) {const p = row + 0x14 + i * 8; word(p, memory.readInt16LE(row) + i * 7 % 2560 - 20); word(p + 2, memory.readInt16LE(row + 2) + i * 11 % 2000 - 20); word(p + 4, memory.readInt16LE(row + 4) + i * 13 % 2560 - 20); word(p + 6, i % 3 ? 1 : 0);}
    for (let pose = 0; pose < 3; pose++) {put(0x91ffc0 + pose * 0x184, 3 << 16); put(0x91ffc4 + pose * 0x184, 4 << 16); put(0x91ffc8 + pose * 0x184, 5 << 16); for (const offset of [0x90, 0x98, 0xa0]) word(0x91ffc0 + pose * 0x184 + offset, 4096);}
    memory[0x91ce90] = fixture % 5 === 1 ? 2 : 0;
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); machine.entry = entry; machine.r.ESP = STACK; machine.bytes.writeInt32LE(-1, STACK); machine.r.ECX = 0; machine.r.EDX = 0;
    if (entry === 0x496ff0 || entry === 0x496e80) {const fn = entry === 0x496ff0 ? computeWeatherVolumeBounds : seedWeatherVolumeParticles; fn(row, min, max, context); machine.r.ECX = min; machine.r.EDX = max; machine.bytes.writeUInt32LE(row, STACK + 4);}
    if (entry === 0x41bf40) {buildWeatherParticipantPose(0x909300, 0x80de00, context); machine.r.ECX = 0x909300; machine.r.EDX = 0x80de00;}
    if (entry === 0x496830) {const index = Math.floor(fixture / 6) % 3; swapWeatherBodyPose(row, index, 0, context); machine.r.ECX = row; machine.r.EDX = 0; machine.bytes.writeUInt32LE(index, STACK + 4);}
    if (entry === 0x4963e0) {initializeWeatherVolume(0, context); machine.r.ECX = 0;}
    if (entry === 0x4969d0) {updateWeatherVolume(row, context); machine.r.ECX = row;}
    steps += machine.run(2000000); entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}
  }
  const report = {fixtures, entryCounts, instructionSteps: steps, reachedInstructions: reached.size, volumeCalls, comparison: 'All mapped bytes >=0x10000; declared synthetic participant/sector/audio/spatial inputs; actual game children. Audio virtual volume is explicit platform service. No original process.', matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWeatherVolumes()));
