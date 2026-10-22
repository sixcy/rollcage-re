import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameImageServices, bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {constructGameImageWorkerMapHead, constructGameImageWorkerPool, initializeGameImageGammaTables, initializeGameImageLibrary} from '../src/game-image-startup.mjs';

export async function verifyGameImageStartup({fixtures = 160, output = 'analysis/game-image-startup-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, POOL = 0x180000;
  const put = (m, p, v) => m.writeInt32LE(v | 0, p), definitions = [[0x56e6f8, 'GdiplusStartup', 3], [0x56e0b4, 'CreateMutexA', 3], [0x56e0a8, 'CreateEventA', 4]];
  let steps = 0, powCalls = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, 0x1000, S + 128); memory.fill(0xc9, POOL, POOL + 64); memory[0x6e65f2] = fixture % 8 === 7 ? 1 : 0;
    const servicesFor = m => {const crt = createGameImageServices(m), calls = []; let handle = 0x100;
      return {...crt, calls, libraryCall(name, args) {calls.push([name, ...args]); if (name === 'pow') return Math.pow(...args); return crt.libraryCall(name, args);}, platformCall(name, args) {calls.push([name, ...args]); if (name === 'GdiplusStartup') {m.writeBigUInt64LE(0xabc123n, args[0]); return 0;} return handle++;}};
    };
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const native = servicesFor(machine.bytes); bindGameImageServices(machine, native);
    definitions.forEach(([slot, name, count], index) => {const address = 0x591000 + index * 16; put(machine.bytes, slot, address); machine.externalCalls.set(address, m => {m.r.EAX = native.platformCall(name, Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4))); m.r.ESP += count * 4;});});
    machine.externalCalls.set(0x5695aa, m => {m.scalars.XMM0 = native.libraryCall('pow', [m.scalars.XMM0, m.scalars.XMM1]); m.doubleScalars.add('XMM0'); m.integerVectors.delete('XMM0'); m.scalarBits.delete('XMM0'); m.qwords.delete('XMM0'); powCalls++;});
    machine.bytes.copy(memory); const source = servicesFor(memory), runtime = {memory, scratchBase: S, services: source}; let result, entry;
    switch (fixture % 4) {case 0: result = constructGameImageWorkerMapHead(runtime); entry = 0x40c0a0; break; case 1: result = constructGameImageWorkerPool(POOL, runtime); entry = 0x4bbfe0; break; case 2: initializeGameImageGammaTables(runtime); entry = 0x4c4a60; break; default: result = initializeGameImageLibrary(runtime); entry = 0x4bbf40;}
    machine.entry = entry; machine.r.ESP = S; machine.r.ECX = POOL; put(machine.bytes, S, -1); steps += machine.run(2000000); if (result !== undefined) assert.equal(entry === 0x4bbf40 ? machine.r.EAX & 255 : machine.r.EAX >>> 0, result >>> 0, `fixture${fixture} return`); assert.equal(machine.fs0, 0);
    assert.deepEqual(source.calls, native.calls, `fixture${fixture} ordered services`); const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} diff0x${(offset + 0x10000).toString(16)} native${expected[offset]} source${actual[offset]}`);}
  }
  const report = {fixtures, powCalls, instructionSteps: steps, reachedInstructions: reached.size, matched: true, boundary: 'GDI+/Win32 handles, CRT allocation and libm pow services; actual pool/tree construction and gamma producer.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameImageStartup()));
