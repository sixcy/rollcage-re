import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {assignGameCString, growGameStringBuffer} from '../src/game-string-buffer.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const S = 0x1f000, OBJECT = 0x100000, INPUT = 0x110000, HEAP = 0x120000, fixtures = Number(process.argv[2] ?? 1800), reached = new Set(), visits = {};
const returns = new Map([[0x4058e1, 0x4058e7], [0x40596b, 0x405970], [0x40597b, 0x405981], [0x4053d5, 0x4053da], [0x405479, 0x40547f]]);
machine.onInstruction = address => {reached.add(address); if ([0x405310, 0x405860, 0x405150, 0x405410].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (returns.has(address)) put(machine.bytes, machine.r.ESP - 4, returns.get(address));};
let steps = 0, allocations = 0, mutations = 0, selfAssignments = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 512, S + 128); memory.fill(0x43, OBJECT, OBJECT + 32); put(memory, S, -1);
  const selector = fixture % 2, variant = fixture >> 1, length = variant % 31, capacity = length > 15 ? 31 : 15, oldData = capacity > 15 ? HEAP : OBJECT;
  if (oldData === HEAP) put(memory, OBJECT, HEAP); for (let i = 0; i < length; i++) memory[oldData + i] = 65 + i % 26; memory[oldData + length] = 0;
  put(memory, OBJECT + 16, length); put(memory, OBJECT + 20, capacity); memory.write('Some source bytes including embedded zeros\0', INPUT);
  const aliased = selector === 1 && length > 0 && variant % 3 === 0, input = aliased ? oldData + variant % length : INPUT;
  const requested = selector === 0 ? [0, 7, 16, 47, 70][variant % 5] : [0, 5, 18, 35][variant % 4];
  let args = selector === 0 ? [requested, Math.min(length, requested)] : [input, requested];
  args.forEach((v, i) => put(memory, S + 4 + i * 4, v));
  const mutation = variant % 7 === 0, growthS = selector === 0 ? S : S - 24;
  const services = m => {const calls = []; return {calls, libraryCall(name, args, context) {
    calls.push([name, ...args, context.scratchBase]);
    if (name === 'operatorNew') {m.fill(0xcd, 0x300000, 0x300000 + args[0]); if (mutation) put(m, growthS + 8, 0); return 0x300000;}
    if (name === 'memcpy' || name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); return args[0];}
    if (name === 'operatorDelete') {if (mutation) put(m, growthS - 24, 0x350000); return 0;}
    throw Error(`Unexpected native-string CRT ${name}`);
  }};};
  put(memory, 0x56e220, 0x760000); put(memory, 0x56e210, 0x760010); put(memory, 0x56e478, 0x760020);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes); const source = services(memory), native = services(machine.bytes), regs = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545};
  for (const [address, name, count] of [[0x760000, 'operatorNew', 1], [0x760010, 'operatorDelete', 1], [0x568a48, 'memcpy', 3], [0x760020, 'memmove', 3]]) machine.externalCalls.set(address, state => {state.r.EAX = native.libraryCall(name, Array.from({length: count}, (_, i) => ptr(state.bytes, state.r.ESP + i * 4)), {scratchBase: state.r.ESP - 4});});
  const runtime = {memory, scratchBase: S, entryRegisters: regs, sehWord: 0x12345678, services: source};
  try {
    const result = selector === 0 ? growGameStringBuffer(OBJECT, ...args, runtime) : assignGameCString(OBJECT, ...args, runtime);
    machine.entry = selector === 0 ? 0x405860 : 0x405310; machine.r.ESP = S; machine.r.ECX = OBJECT; Object.assign(machine.r, regs); steps += machine.run(100000);
    assert.equal(machine.fs0, 0x12345678); if (selector === 1) assert.equal(machine.r.EAX >>> 0, result >>> 0); assert.deepEqual(source.calls, native.calls);
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 16).toString('hex')} source${memory.subarray(p, p + 16).toString('hex')}`);}
  } catch (error) {console.error({fixture, selector, variant, length, requested, input, aliased, mutation, source: source.calls, native: native.calls}); throw error;}
  allocations += source.calls.filter(([name]) => name === 'operatorNew').length; mutations += Number(mutation && source.calls.some(([name]) => name === 'operatorNew')); selfAssignments += Number(aliased);
}
const sourcePath = 'src/game-string-buffer.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, allocations, mutations, selfAssignments, source: {path: sourcePath, sha256: createHash('sha256').update(await readFile(sourcePath)).digest('hex')}, targetSha256: program.sha256, method: 'Actual405310 and405860 native-frame producers with actual405150/405410 self-substring/erase. Entire10MiB memory including complete native stack, EAX for assignment, explicitTLS restoration and ordered genuineCRT/calleeESP compare. Inline/heap/zero/embedded-NUL inputs, aliased selfassignment, live retained argument mutation during allocation and allocation-local mutation during free. Exceptions/nonreturningbadalloc and arbitrary invalid pointers remain outside the fixtures; no originalprocess.'};
const output = process.argv[3] ?? 'analysis/game-string-buffer-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
