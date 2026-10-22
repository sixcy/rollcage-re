import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameImageServices, bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {initializeWeather, initializeRainRenderBuffer, initializeSnowRenderBuffer, initializeWeatherScreen, initializeWeatherEnvironment} from '../src/weather-initialization.mjs';

export async function verifyWeatherInitialization({fixtures = 120, output = 'analysis/weather-initialization-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000; let steps = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address);
  const put = (m, p, v) => m.writeInt32LE(v | 0, p), entries = [[0x496290, initializeWeather], [0x496580, initializeRainRenderBuffer], [0x496640, initializeSnowRenderBuffer], [0x497ed0, initializeWeatherScreen], [0x498bc0, initializeWeatherEnvironment]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 0x3000, S + 128); const [entry, source] = entries[fixture % entries.length], variant = Math.floor(fixture / entries.length), kind = variant % 3;
    put(memory, 0x5ecb1c, 0x60000); memory[0x60553] = kind; memory[0x60552] = variant % 6; memory[0x60555] = variant & 1; put(memory, 0x5ecefc, 0x61000); memory[0x61026] = variant % 4; put(memory, 0x6e9f70, -1); put(memory, 0x80dedc, variant % 3); put(memory, 0x5ec954, variant * 16807 + 1);
    put(memory, 0x90b988, 0x120000); put(memory, 0x90b990, 0x130000); memory.writeUInt16LE(7, 0x13002e); for (let i = 0; i < 0x1000; i++) memory[0x120000 + i] = i * 7 + 3 & 255;
    for (let i = 0; i < 6; i++) {const body = 0x180000 + i * 0x4000, controller = 0x160000 + i * 0x100; put(memory, controller, body); put(memory, 0x909300 + i * 0x30c, body); put(memory, 0x909318 + i * 0x30c, controller); for (let axis = 0; axis < 3; axis++) put(memory, body + 0x34 + axis * 4, (i * 5 + axis) << 16);}
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const nativeImage = createGameImageServices(machine.bytes, {openFailure: true, widthFailure: true}); bindGameImageServices(machine, nativeImage); machine.bytes.copy(memory); const image = createGameImageServices(memory, {openFailure: true, widthFailure: true});
    const clock = m => {let calls = 0; return (name, args) => {if (name === 'QueryPerformanceFrequency') m.writeBigInt64LE(10000000n, args[0]); else m.writeBigInt64LE(100000000n + BigInt(calls++ * 1000), args[0]); return 1;};};
    const sourceClock = clock(memory), nativeClock = clock(machine.bytes), runtime = {memory, scratchBase: S, services: {...image, platformCall: (name, args) => name.startsWith('QueryPerformance') ? sourceClock(name, args) : image.platformCall(name, args)}};
    for (const [slot, name, address] of [[0x56e0fc, 'QueryPerformanceCounter', 0x590800], [0x56e114, 'QueryPerformanceFrequency', 0x590810]]) {put(memory, slot, address); put(machine.bytes, slot, address); machine.externalCalls.set(address, m => {m.r.EAX = nativeClock(name, [m.bytes.readUInt32LE(m.r.ESP)]); m.r.ESP += 4;});}
    machine.externalCalls.set(0x5689e0, m => {const value = m.bytes.readBigUInt64LE(m.r.ESP) / m.bytes.readBigUInt64LE(m.r.ESP + 8); m.r.EAX = Number(value & 0xffffffffn); m.r.EDX = Number(value >> 32n); m.r.ESP += 16;});
    machine.externalCalls.set(0x569380, m => {const value = BigInt.asIntN(64, m.bytes.readBigUInt64LE(m.r.ESP)) / BigInt.asIntN(64, m.bytes.readBigUInt64LE(m.r.ESP + 8)), unsigned = BigInt.asUintN(64, value); m.r.EAX = Number(unsigned & 0xffffffffn); m.r.EDX = Number(unsigned >> 32n); m.r.ESP += 16;});
    machine.externalCalls.set(0x568f10, m => {const value = BigInt.asUintN(64, m.bytes.readBigUInt64LE(m.r.ESP) * m.bytes.readBigUInt64LE(m.r.ESP + 8)); m.r.EAX = Number(value & 0xffffffffn); m.r.EDX = Number(value >> 32n); m.r.ESP += 16;});
    source(runtime); machine.entry = entry; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); steps += machine.run(8000000);
    const native = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!native.equals(actual)) {const offset = native.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${actual[offset]}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true, domain: 'Actual496290 storage/activation graph with realbitmap/GDI+ failed-image path; successful textures are independently compared by verify-weather-startup-connected-instructions. Sound disabled through actual native policy.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWeatherInitialization()));
