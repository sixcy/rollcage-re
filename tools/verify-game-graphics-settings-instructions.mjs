import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeGameGraphicsSettings, getGameGraphicsSettings} from '../src/game-graphics-settings.mjs';
export async function verifyGameGraphicsSettings({fixtures = 480, output = 'analysis/game-graphics-settings-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, put = (m, p, v) => m.writeInt32LE(v | 0, p), definitions = [[0x56e08c, 'InitializeCriticalSectionAndSpinCount', 2], [0x56e094, 'EnterCriticalSection', 1], [0x56e090, 'LeaveCriticalSection', 1], [0x56e09c, 'GetCurrentThreadId', 0]];
  let steps = 0; const reached = new Set(); machine.onInstruction = p => reached.add(p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(fixture & 255, 0x6e6300, 0x6e6500); memory.fill(0x36, 0x1000, S + 64); put(memory, 0x6e63d0, fixture % 4); put(memory, 0x6e64a4, fixture % 5 === 4 ? 0x100000 : 0); put(memory, 0x6e6380, fixture % 3);
    const servicesFor = () => {const calls = []; return {calls, platformCall(name, args) {calls.push([name, ...args]); return name === 'GetCurrentThreadId' ? 77 : 1;}, libraryCall(name, args) {calls.push([name, ...args]); return 0;}};};
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const native = servicesFor(); definitions.forEach(([slot, name, count], i) => {const address = 0x591000 + i * 16; put(machine.bytes, slot, address); machine.externalCalls.set(address, m => {m.r.EAX = native.platformCall(name, Array.from({length: count}, (_, j) => m.bytes.readUInt32LE(m.r.ESP + j * 4))); m.r.ESP += count * 4;});}); machine.externalCalls.set(0x56832a, m => {m.r.EAX = native.libraryCall('registerExit', [m.bytes.readUInt32LE(m.r.ESP)]);}); machine.bytes.copy(memory);
    const source = servicesFor(), runtime = {memory, scratchBase: S, services: source}, entry = fixture & 1 ? 0x405010 : 0x402fa0, result = entry === 0x405010 ? getGameGraphicsSettings(runtime) : initializeGameGraphicsSettings(runtime);
    machine.entry = entry; machine.r.ESP = S; put(machine.bytes, S, -1); steps += machine.run(100000); assert.equal(machine.r.EAX >>> 0, result, `fixture${fixture} return`); assert.equal(machine.fs0, 0); assert.deepEqual(source.calls, native.calls, `fixture${fixture} services`);
    const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} diff0x${(offset + 0x10000).toString(16)} native${expected[offset]} source${actual[offset]}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameGraphicsSettings()));
