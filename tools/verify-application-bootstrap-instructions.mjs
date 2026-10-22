import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {obtainViewportApplication, constructViewportApplication, getApplicationDebugger, constructApplicationDebugger, registerApplicationDebuggerName, appendApplicationDebuggerRecord} from '../src/application-bootstrap.mjs';

export async function verifyApplicationBootstrap({fixtures = 600, output = 'analysis/application-bootstrap-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000;
  const entries = [0x402d10, 0x403430, 0x4a2290, 0x4a0e90, 0x4a1840, 0x4a1a20, 0x4a23a0], counts = {}, reached = new Set(); let steps = 0, allocations = 0, calls = 0;
  machine.onInstruction = address => reached.add(address);
  const put = (m, p, v) => m.writeInt32LE(v | 0, p);
  const allocateFor = m => {let cursor = 0x200000; return size => {const result = cursor; cursor += size + 15 & ~15; m.fill(0xa5, result, cursor); allocations++; return result;};};
  const platformFor = m => (name, args) => {calls++; if (name === 'InitializeCriticalSectionAndSpinCount') [0, -1, 0, 0, 0, args[1]].forEach((value, index) => put(m, args[0] + index * 4, value)); return name === 'GetCurrentThreadId' ? 42 : 1;};
  machine.externalCalls.set(0x568162, () => {}); machine.externalCalls.set(0x56832a, m => {m.r.EAX = 0;}); machine.externalCalls.set(0x56932a, m => {m.r.EAX = m.bytes.readUInt32LE(m.r.ESP);});
  machine.externalCalls.set(0x5a010, () => {});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, STACK - 0x1000, STACK + 128);
    const entry = entries[fixture % entries.length], variant = Math.floor(fixture / entries.length), sourceAllocate = allocateFor(memory), sourcePlatform = platformFor(memory), runtime = {memory, scratchBase: STACK, handlers: {allocate: sourceAllocate, free: () => {}, registerExit: () => 0}, services: {platformCall: sourcePlatform}};
    put(memory, 0x56e220, 0x5a000); put(memory, 0x56e210, 0x5a010); put(memory, 0x56e08c, 0x5a020); put(memory, 0x56e094, 0x5a030); put(memory, 0x56e090, 0x5a040); put(memory, 0x56e09c, 0x5a050);
    //Dedicated direct vector fixtures include in-vector source aliases, both
    //spare capacity and growth. Caller-owned inputs stay raw and persistent.
    const vector = 0x150000, record = 0x160000;
    if (entry === 0x4a1840 || entry === 0x4a1a20) {constructApplicationDebugger(runtime); memory[0x715b54] = variant % 7 === 0 ? 0 : 1; put(memory, 0x716b9c, variant * 3); put(memory, 0x716ba0, variant * 5);}
    if (entry === 0x4a23a0) {
      const length = variant % 9, capacity = length + (variant % 2); put(memory, vector, 0x170000); put(memory, vector + 4, 0x170000 + length * 16); put(memory, vector + 8, 0x170000 + capacity * 16);
      for (let i = 0; i < Math.max(length, 1) * 4; i++) put(memory, 0x170000 + i * 4, 0x12340000 + i);
      for (let i = 0; i < 4; i++) put(memory, record + i * 4, variant * 7 + i);
    }
    if (entry === 0x402d10 && variant % 3 === 1) {put(memory, 0x6efb38, 0x120000);}
    if (entry === 0x402d10 && variant % 3 === 2) {put(memory, 0x715060, 1);}
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const nativeAllocate = allocateFor(machine.bytes), nativePlatform = platformFor(machine.bytes);
    machine.externalCalls.set(0x5a000, m => {m.r.EAX = nativeAllocate(m.bytes.readUInt32LE(m.r.ESP));});
    for (const [address, name, count] of [[0x5a020, 'InitializeCriticalSectionAndSpinCount', 2], [0x5a030, 'EnterCriticalSection', 1], [0x5a040, 'LeaveCriticalSection', 1], [0x5a050, 'GetCurrentThreadId', 0]]) machine.externalCalls.set(address, m => {m.r.EAX = nativePlatform(name, Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4))); m.r.ESP += count * 4;});
    let expected, ecx = 0, args = [];
    if (entry === 0x402d10) expected = obtainViewportApplication(runtime);
    if (entry === 0x403430) expected = constructViewportApplication(runtime);
    if (entry === 0x4a2290) expected = getApplicationDebugger(runtime);
    if (entry === 0x4a0e90) expected = constructApplicationDebugger(runtime);
    if (entry === 0x4a1840 || entry === 0x4a1a20) {ecx = 0x715b30; args = [0x570068]; expected = registerApplicationDebuggerName(ecx, args[0], entry === 0x4a1a20, runtime);}
    if (entry === 0x4a23a0) {ecx = vector; args = [variant % 3 === 0 && variant % 9 ? 0x170000 : record]; appendApplicationDebuggerRecord(vector, args[0], runtime);}
    machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = STACK; machine.bytes.writeInt32LE(-1, STACK); args.forEach((value, index) => machine.bytes.writeUInt32LE(value, STACK + 4 + index * 4)); steps += machine.run(2000000);
    if (expected !== undefined) assert.equal(machine.r.EAX >>> 0, expected >>> 0, `return${fixture}/${entry.toString(16)}`);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);} counts[entry.toString(16)] = (counts[entry.toString(16)] ?? 0) + 1;
  }
  const report = {fixtures, counts, instructionSteps: steps, reachedInstructions: reached.size, allocations, platformCalls: calls, matched: true}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyApplicationBootstrap()));
