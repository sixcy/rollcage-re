import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {createGameImageAsyncFixtures} from './lib/game-image-async-fixtures.mjs';
import {bindNativeGameImageAsync, gameImageExternalReturnStores} from './lib/game-image-native-async.mjs';
import {createRaceTextureServices, prepareRaceTextureFixture} from './lib/race-texture-fixtures.mjs';
import {prepareWeatherDrawFixture} from './verify-weather-draw-instructions.mjs';
import {initializeGameImageLibrary} from '../src/game-image-startup.mjs';
import {initializeRainRenderBuffer, initializeSnowRenderBuffer} from '../src/weather-initialization.mjs';
import {drawWeatherRain, drawWeatherSnow} from '../src/weather-draw.mjs';

export async function verifyWeatherDrawConnected({fixtures = 8, traceAddress, output = 'analysis/weather-draw-connected-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions.filter(i => ![0x4bde50, 0x4c57c0, 0x4c8850].includes(i.address))), worker = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000;
  const put = (m, p, v) => m.writeInt32LE(v | 0, p); let steps = 0, workers = 0, uploads = 0; const reached = new Set();
  let traced; machine.onInstruction = p => {reached.add(p); const ret = gameImageExternalReturnStores.get(p); if (ret !== undefined) put(machine.bytes, machine.r.ESP - 4, ret); if (traceAddress !== undefined) {const value = machine.bytes.readUInt32LE(traceAddress); if (value !== traced) {console.error('trace', p.toString(16), value.toString(16), {...machine.r}); traced = value;}}}; worker.onInstruction = p => reached.add(p);
  const definitions = [[0x56e164, 'GetCurrentProcess', 0], [0x56e168, 'GetProcessAffinityMask', 3], [0x56e09c, 'GetCurrentThreadId', 0], [0x56e0b0, 'WaitForMultipleObjects', 4], [0x56e0ac, 'SetEvent', 1], [0x56e0b8, 'ReleaseMutex', 1], [0x56e0a0, 'WaitForSingleObject', 2], [0x56e0a4, 'ResetEvent', 1], [0x56e08c, 'InitializeCriticalSectionAndSpinCount', 2], [0x56e094, 'EnterCriticalSection', 1], [0x56e090, 'LeaveCriticalSection', 1], [0x56e0b4, 'CreateMutexA', 3], [0x56e0a8, 'CreateEventA', 4], [0x56e6f8, 'GdiplusStartup', 3]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, 0x1000, S + 128); prepareRaceTextureFixture(memory, {bits: fixture & 2 ? 16 : 32});
    const {index} = prepareWeatherDrawFixture(memory, fixture === 1 ? 17 : fixture, {row: 0x160000, body: 0x170000, buckets: 0x180000}), snow = fixture & 1;
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const native = createRaceTextureServices(machine.bytes); bindGameImageServices(machine, native);
    definitions.forEach(([slot, name, count], i) => {const address = 0x593000 + i * 16; put(machine.bytes, slot, address); machine.externalCalls.set(address, m => {m.r.EAX = native.platformCall(name, Array.from({length: count}, (_, j) => m.bytes.readUInt32LE(m.r.ESP + j * 4))); m.r.ESP += count * 4;});});
    machine.externalCalls.set(0x56832a, m => native.libraryCall('registerExit', [m.bytes.readUInt32LE(m.r.ESP)]));
    for (const [address, offset, count] of [[0x592000, 0x78, 2], [0x592010, 0x88, 6]]) machine.externalCalls.set(address, m => {m.r.EAX = native.rendererCall({thisAddress: m.r.ECX >>> 0, virtualAddress: address, offset, arguments: Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4))}, {scratchBase: m.r.ESP - 4}); m.r.ESP += count * 4;});
    machine.externalCalls.set(0x5695aa, m => {m.scalars.XMM0 = native.libraryCall('pow', [m.scalars.XMM0, m.scalars.XMM1]); m.doubleScalars.add('XMM0'); m.integerVectors.delete('XMM0'); m.scalarBits.delete('XMM0'); m.qwords.delete('XMM0');});
    machine.externalCalls.set(0x568f10, m => {const value = BigInt.asUintN(64, m.bytes.readBigUInt64LE(m.r.ESP) * m.bytes.readBigUInt64LE(m.r.ESP + 8)); m.r.EAX = Number(value & 0xffffffffn); m.r.EDX = Number(value >> 32n); m.r.ESP += 16;}); machine.bytes.copy(memory);
    const source = createRaceTextureServices(memory), sourceAsync = createGameImageAsyncFixtures(memory), nativeAsync = bindNativeGameImageAsync(machine, worker, {onSteps: n => {steps += n;}, onWorker: () => {workers++;}}), runtime = {memory, scratchBase: S, entryRegisters: {EBX: 0, EBP: 0, ESI: 0, EDI: 0}, services: {...source, ...sourceAsync}};
    const operations = [[0x4bbf40, initializeGameImageLibrary], [snow ? 0x496640 : 0x496580, snow ? initializeSnowRenderBuffer : initializeRainRenderBuffer], ...Array.from({length: 4}, () => [snow ? 0x497350 : 0x497110, r => (snow ? drawWeatherSnow : drawWeatherRain)(index, r)])];
    for (let op = 0; op < operations.length; op++) {
      const [entry, invoke] = operations[op], mode = ['nearest-even', 'toward-zero', 'down', 'up'][Math.max(op - 2, 0)];
      invoke({...runtime, roundingMode: mode}); machine.fpuRounding = mode; machine.entry = entry; machine.r.ESP = S; for (const r of ['EAX', 'EBX', 'EBP', 'ESI', 'EDI', 'EDX']) machine.r[r] = 0; machine.r.ECX = index; put(machine.bytes, S, -1); steps += machine.run(10000000);
      assert.equal(machine.x87.length, 0); assert.equal(machine.fs0, 0);
      const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000);
      if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${expected[offset]} source${actual[offset]}`);}
    }
    const nonmemory = calls => calls.filter(([name]) => !['memcpy', 'memmove', 'memset', 'strrchr', 'toupper'].includes(name)); assert.deepEqual(nonmemory(source.calls), nonmemory(native.calls)); assert.deepEqual(sourceAsync.calls, nativeAsync.calls); assert.deepEqual(source.rendererCalls, native.rendererCalls); uploads += source.rendererCalls.filter(row => row[0] === 'upload').length;
  }
  const report = {fixtures, operations: fixtures * 6, frames: fixtures * 4, uploads, workerCalls: workers, instructionSteps: steps, reachedInstructions: reached.size, matched: true, domain: 'Persistent actual4bbf40 image startup→496580 rain buffer or496640 snow buffer→401be0/4895d0/408680 texture graph→four actual497110/497350 draws. All mapped bytes>=10000h and ordered services, STL jobs and uploaded levels match. Explicit synthetic CRT/GDI+/renderer services and raw world/camera producers; no original process/GPU/80bit exception-state claim.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWeatherDrawConnected()));
