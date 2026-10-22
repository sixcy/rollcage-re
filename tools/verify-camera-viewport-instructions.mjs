import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateCameraViewportScale} from '../src/camera-viewport.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000));
const machine = new BoundedX86(program.instructions), memory = Buffer.alloc(baseline.length), reached = new Set();
const STACK = 0x9000, APP = 0x100000, HEAD = 0x110000, NAME = 0x120000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
let steps = 0, allocations = 0, frees = 0, aliases = 0;
const fixtures = Number(process.argv[2] ?? 240), turns = 12;
machine.onInstruction = address => reached.add(address);
machine.externalCalls.set(0x568162, () => {});
machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), source = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(source, source + size)).copy(m.bytes, dest); m.r.EAX = dest;});
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); memory.fill(0x36, STACK - 0x1000, STACK + 128);
  put(memory, APP + 0x7c, HEAD); put(memory, HEAD, HEAD); put(memory, HEAD + 4, HEAD); put(memory, HEAD + 8, HEAD); memory[HEAD + 12] = 1; memory[HEAD + 13] = 1;
  put(memory, 0x56e220, 0x5a000); put(memory, 0x56e210, 0x5a010); put(memory, 0x56e470, 0x5a010);
  const sourceLog = [], nativeLog = [];
  function allocator(m, log) {let cursor = 0x140000; return size => {const result = cursor; cursor += (size + 15) & ~15; m.fill(0xa5, result, cursor); log.push(['allocate', size, result]); return result;};}
  const sourceAllocate = allocator(memory, sourceLog), nativeAllocate = allocator(machine.bytes, nativeLog);
  const runtime = {memory, scratchBase: STACK, handlers: {allocate: sourceAllocate, free: p => sourceLog.push(['free', p])}};
  machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); // Explicit synthetic thread exception chain.
  machine.externalCalls.set(0x5a000, m => {m.r.EAX = nativeAllocate(m.bytes.readUInt32LE(m.r.ESP)); allocations++;});
  machine.externalCalls.set(0x5a010, m => {nativeLog.push(['free', m.bytes.readUInt32LE(m.r.ESP)]); frees++;});
  for (let turn = 0; turn < turns; turn++) {
    const key = ['0 Player', '0 Player', '2 Player', 'A viewport with a heap-backed name', '', '3 Player', '2 Player', '1 Player', '0 Player', 'A viewport with a heap-backed name', '01 Player', '0 Player'][turn];
    memory.fill(0, NAME, NAME + 256); machine.bytes.fill(0, NAME, NAME + 256); memory.write(key, NAME); machine.bytes.write(key, NAME);
    let name = turn === 4 && fixture % 2 === 0 ? 0 : NAME;
    if (fixture % 7 === 0 && turn === 10) {name = STACK - 100 + 0x38; memory.write('Aliased key', name); machine.bytes.write('Aliased key', name); aliases++;}
    const mode = turn % 3 === 0 ? 1 : turn % 3 === 1 ? 0 : -1;
    const value = [0, -0, 1, -1, 1e20, -1e20, 1e-40, 100, 0.05, 0.95][(turn + fixture) % 10];
    updateCameraViewportScale(APP, name, mode, value, runtime);
    machine.entry = 0x406c70; machine.r.ECX = APP; machine.r.ESP = STACK; machine.scalars.XMM2 = Math.fround(value);
    put(machine.bytes, STACK, -1); put(machine.bytes, STACK + 4, name); put(machine.bytes, STACK + 8, mode); steps += machine.run(100000); assert.equal(machine.fs0, 0, 'Thread exception chain restored');
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${fixture}/${turn} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
    assert.deepEqual(sourceLog, nativeLog, `${fixture}/${turn} ordered CRT services`);
    const frame = STACK - 100;
    for (const offset of [0x14, 0x18, 0x2c, 0x30, 0x34, 0x54]) assert.equal(memory.readInt32LE(frame + offset), machine.bytes.readInt32LE(frame + offset), `${fixture}/${turn} numeric local${offset.toString(16)}`);
  }
}
const report = {method: 'Complete406c70 named viewport scalar setter/smoother using actual405310 string assignment,404fa0 map allocation/insertion/rotations and original float constants. All mapped bytes>=10000h, defined numeric caller locals and ordered CRT allocation/free compare after12persistent calls per supplied map. Covers repeated keys,inline/heap strings,null/empty names,private-key alias,signed/subnormal/large finite float inputs and direct/blended modes. CRT allocation/free/memcpy and compiler cookie are explicit services; no game contracts or original process execution. Application singleton bootstrap is independently verified; full4180a0 positioning remains open.', fixtures, calls: fixtures * turns, aliases, allocations, frees, executedInstructions: reached.size, instructionSteps: steps, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/camera-viewport-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
