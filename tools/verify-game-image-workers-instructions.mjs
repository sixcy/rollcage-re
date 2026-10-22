import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {countGameImageAffinityCpus, readGameImageThreadQuota} from '../src/game-image-workers.mjs';

export async function verifyGameImageWorkers({fixtures = 1200, output = 'analysis/game-image-workers-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, POOL = 0x100000, HEAD = 0x110000, NODE = 0x120000; let steps = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address);
  const definitions = [[0x56e164, 'GetCurrentProcess', 0], [0x56e168, 'GetProcessAffinityMask', 3], [0x56e09c, 'GetCurrentThreadId', 0], [0x56e0b0, 'WaitForMultipleObjects', 4], [0x56e0ac, 'SetEvent', 1], [0x56e0b8, 'ReleaseMutex', 1], [0x56e0a0, 'WaitForSingleObject', 2], [0x56e0a4, 'ResetEvent', 1]], put = (m, p, v) => m.writeInt32LE(v | 0, p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 0x1000, S + 128); put(memory, 0x6eb038, POOL); put(memory, POOL + 4, fixture % 3); put(memory, POOL + 8, 0x101); put(memory, POOL + 0x10, 0x102); put(memory, POOL + 0x14, 0x103); put(memory, POOL + 0x18, HEAD); for (const offset of [0, 4, 8]) put(memory, HEAD + offset, HEAD); memory[HEAD + 13] = 1;
    if (fixture % 5) {put(memory, HEAD + 4, NODE); put(memory, NODE, HEAD); put(memory, NODE + 8, HEAD); put(memory, NODE + 16, fixture % 4 ? 77 : 78); put(memory, NODE + 20, fixture % 33 - 3);}
    const servicesFor = m => {const calls = []; return {calls, platformCall(name, args) {calls.push([name, ...args]); switch (name) {case 'GetCurrentProcess': return -1; case 'GetProcessAffinityMask': put(m, args[1], [0, 1, -1, 0x55555555, 0x80000000][fixture % 5]); put(m, args[2], -1); return 1; case 'GetCurrentThreadId': return 77; case 'WaitForMultipleObjects': return fixture % 3; case 'WaitForSingleObject': return fixture % 4 ? 0 : 0x102; default: return 1;}}};};
    machine.reset(); memory.copy(machine.bytes); const nativeServices = servicesFor(machine.bytes); definitions.forEach(([slot, name, count], index) => {const address = 0x590000 + index * 16; put(machine.bytes, slot, address); machine.externalCalls.set(address, m => {m.r.EAX = nativeServices.platformCall(name, Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4))); m.r.ESP += count * 4;});}); machine.bytes.copy(memory); const services = servicesFor(memory), runtime = {memory, scratchBase: S, services};
    const entry = fixture & 1 ? 0x4c4910 : 0x4c4a00, result = entry === 0x4c4910 ? readGameImageThreadQuota(runtime) : countGameImageAffinityCpus(runtime); machine.entry = entry; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); steps += machine.run(100000); assert.equal(machine.r.EAX | 0, result | 0, `fixture${fixture} return`);
    assert.deepEqual(services.calls, nativeServices.calls, `fixture${fixture} ordered services`); const native = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!native.equals(actual)) {const offset = native.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} diff0x${(offset + 0x10000).toString(16)}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameImageWorkers()));
