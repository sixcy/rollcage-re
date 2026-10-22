import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {queryWeatherViewport, readWeatherViewportExtent} from '../src/weather-viewport.mjs';

export async function verifyWeatherViewport({fixtures = 120, output = 'analysis/weather-viewport-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, APP = 0x100000, HEAD = 0x110000, NAME = 0x120000, OUT = 0x120400;
  let steps = 0, allocations = 0, frees = 0, casts = 0; const reached = new Set(); machine.onInstruction = address => reached.add(address);
  const put = (m, p, v) => m.writeInt32LE(v | 0, p);
  const allocate = m => {let cursor = 0x140000; return size => {const result = cursor; cursor += (size + 15) & ~15; m.fill(0xa5, result, cursor); allocations++; return result;};};
  machine.externalCalls.set(0x568162, () => {});
  machine.externalCalls.set(0x56932a, m => {m.r.EAX = APP; casts++;});
  machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), source = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(source, source + size)).copy(m.bytes, dest); m.r.EAX = dest;});
  machine.externalCalls.set(0x568a50, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), count = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(m.bytes[m.r.ESP + 4], dest, dest + count); m.r.EAX = dest;});
  machine.externalCalls.set(0x5a010, () => {frees++;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, STACK - 0x1000, STACK + 128);
    put(memory, 0x6efb38, APP); put(memory, APP + 0x7c, HEAD); put(memory, HEAD, HEAD); put(memory, HEAD + 4, HEAD); put(memory, HEAD + 8, HEAD); memory[HEAD + 12] = 1; memory[HEAD + 13] = 1;
    put(memory, 0x56e220, 0x5a000); put(memory, 0x56e210, 0x5a010); put(memory, 0x56e470, 0x5a010);
    const sourceAlloc = allocate(memory), nativeAlloc = allocate(machine.bytes), runtime = {memory, scratchBase: STACK, handlers: {allocate: sourceAlloc, free: () => {}, dynamicCast: () => APP}};
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); machine.externalCalls.set(0x5a000, m => {m.r.EAX = nativeAlloc(m.bytes.readUInt32LE(m.r.ESP));});
    const keys = ['0 Player', '2 Player', '1 Player', '3 Player', 'A viewport with a heap-backed name', '01 Player', '0 Player'];
    for (let turn = 0; turn < keys.length; turn++) {
      const key = keys[(turn + fixture) % keys.length]; memory.fill(0, NAME, NAME + 256); machine.bytes.fill(0, NAME, NAME + 256); memory.write(key, NAME); machine.bytes.write(key, NAME);
      const outputs = fixture % 3 === 0 ? [OUT, OUT, OUT + 4, OUT + 4] : [OUT, OUT + 4, OUT + 8, OUT + 12];
      queryWeatherViewport(NAME, ...outputs, runtime);
      machine.entry = 0x40ab70; machine.r.ECX = NAME; machine.r.EDX = outputs[0]; machine.r.ESP = STACK; machine.bytes.writeInt32LE(-1, STACK); outputs.slice(1).forEach((value, index) => machine.bytes.writeUInt32LE(value, STACK + 4 + index * 4));
      steps += machine.run(2000000);
      const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture}/${turn} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}
    }
    //The real getter wrappers use the original literal name in private memory.
    for (const height of [false, true]) {
      const value = readWeatherViewportExtent(height, runtime); machine.entry = height ? 0x40acc0 : 0x40ac40; machine.r.ESP = STACK; machine.bytes.writeInt32LE(-1, STACK); steps += machine.run(2000000); assert.equal(value, machine.r.EAX | 0);
      assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000));
    }
  }
  const report = {fixtures, operations: fixtures * 9, instructionSteps: steps, reachedInstructions: reached.size, allocations, frees, casts, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWeatherViewport()));
