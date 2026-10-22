import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {spawnWeatherScreenParticle, updateWeatherScreenParticles} from '../src/weather-screen.mjs';
import {getOrCreateViewportRecord} from '../src/weather-viewport.mjs';

export async function verifyWeatherScreen({fixtures = 600, output = 'analysis/weather-screen-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, APP = 0x100000, HEAD = 0x110000, NAME = 0x120000, SCREEN = 0x200000, BODY = 0x210000;
  const put = (m, p, v) => m.writeInt32LE(v | 0, p); let steps = 0, births = 0, queries = 0, clockCalls = 0; const reached = new Set(); machine.onInstruction = address => {reached.add(address); if (address === 0x4979c0) births++; if (address === 0x40ab70) queries++; if (address === 0x489cd0) clockCalls++;};
  machine.externalCalls.set(0x568162, () => {}); machine.externalCalls.set(0x56932a, m => {m.r.EAX = APP;});
  machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), source = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(source, source + size)).copy(m.bytes, dest); m.r.EAX = dest;});
  machine.externalCalls.set(0x568a50, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), count = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(m.bytes[m.r.ESP + 4], dest, dest + count); m.r.EAX = dest;});
  for (const [address, operation] of [[0x569380, 'divide'], [0x568f10, 'multiply'], [0x5689e0, 'unsigned']]) machine.externalCalls.set(address, m => {const a = m.bytes.readBigUInt64LE(m.r.ESP), b = m.bytes.readBigUInt64LE(m.r.ESP + 8), value = operation === 'multiply' ? a * b : operation === 'unsigned' ? a / b : BigInt.asIntN(64, a) / BigInt.asIntN(64, b), result = BigInt.asUintN(64, value); m.r.EAX = Number(result & 0xffffffffn); m.r.EDX = Number(result >> 32n); m.r.ESP += 16;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, STACK - 0x2000, STACK + 128); const variant = fixture >>> 1, kind = variant % 3, entry = fixture & 1 ? 0x498030 : 0x4979c0;
    put(memory, 0x6efb38, APP); put(memory, APP + 0x7c, HEAD); put(memory, HEAD, HEAD); put(memory, HEAD + 4, HEAD); put(memory, HEAD + 8, HEAD); memory[HEAD + 12] = 1; memory[HEAD + 13] = 1;
    memory.write('0 Player\0', NAME); put(memory, NAME + 16, 8); put(memory, NAME + 20, 15);
    const viewport = getOrCreateViewportRecord(APP + 0x7c, NAME, {memory, handlers: {allocate: () => 0x140000}}); for (const [offset, value] of [[8, 0], [12, 0], [16, 640 + variant % 5 * 32], [20, 480]]) put(memory, viewport + offset, value);
    put(memory, 0x5ecb1c, 0x60000); memory[0x60553] = kind; memory[0x60552] = variant % 23 === 0 ? 1 : 0; memory.writeUInt16LE(480, 0x60a80);
    put(memory, 0x7135b4, SCREEN); put(memory, 0x909300, BODY); memory.writeInt16LE([0, 99, 100, 250, 251, 600][variant % 6], BODY + 0x668); put(memory, 0x6e9f70, -1); memory[0x91ce90] = variant % 11 === 0 ? 2 : 0;
    put(memory, 0x90a548, variant % 17 === 0 ? 0 : variant * 3 + 1); put(memory, 0x6e6cd4, variant % 17 === 0 ? 20 : variant % 19 === 0 ? variant * 3 : 0); put(memory, 0x5ed2bc, variant % 13 === 0 ? 1 : variant * 14723 + 17);
    put(memory, 0x6e6cdc, variant & 1); put(memory, 0x6e6cf4, variant % 5 === 0 ? 0 : 1); put(memory, 0x6e6ce0, variant % 7 === 0 ? -100 : 0);
    put(memory, 0x56e0fc, 0x5a100); put(memory, 0x56e114, 0x5a110); put(memory, 0x6e6c8c, variant & 1); memory.writeBigInt64LE(10000000n, 0x7135a4); memory.writeBigInt64LE(123456789n, 0x7135ac);
    for (let index = 0; index < 32; index++) {const row = SCREEN + index * 160; put(memory, row, index % 3 ? 1 : 0); memory.writeFloatLE(100 + index, row + 0x7c); memory.writeFloatLE(150 + index, row + 0x80); memory.writeFloatLE(20 + index, row + 0x84); put(memory, row + 0x88, index * 50 - 20); put(memory, row + 0x8c, index % 4); put(memory, row + 0x90, (variant + index) % 12); put(memory, row + 0x94, index); put(memory, row + 0x98, (index + variant) % 5 - 1);}
    const clocks = m => {let call = 0; return (name, args) => {if (name === 'QueryPerformanceFrequency') {m.writeBigInt64LE(10000000n, args[0]); return 1;} m.writeBigInt64LE(123456789n + BigInt(variant * 10000 + call++ * 1000), args[0]); return 1;};};
    const platform = clocks(memory), runtime = {memory, scratchBase: STACK, handlers: {dynamicCast: () => APP}, services: {platformCall: platform}};
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const nativePlatform = clocks(machine.bytes);
    machine.externalCalls.set(0x5a100, m => {m.r.EAX = nativePlatform('QueryPerformanceCounter', [m.bytes.readUInt32LE(m.r.ESP)]); m.r.ESP += 4;});
    machine.externalCalls.set(0x5a110, m => {m.r.EAX = nativePlatform('QueryPerformanceFrequency', [m.bytes.readUInt32LE(m.r.ESP)]); m.r.ESP += 4;});
    const input = entry === 0x4979c0 ? variant % 32 : variant & 1;
    if (entry === 0x4979c0) spawnWeatherScreenParticle(input, runtime); else updateWeatherScreenParticles(input, runtime);
    machine.entry = entry; machine.r.ECX = input; machine.r.ESP = STACK; machine.bytes.writeInt32LE(-1, STACK); steps += machine.run(4000000);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture} kind${kind} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, births, queries, clockCalls, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWeatherScreen()));
