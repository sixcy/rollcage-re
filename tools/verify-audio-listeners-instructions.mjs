import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {reserveAudioListenerVector, initializeAudioListeners, initializeRaceAudioListeners} from '../src/audio-listeners.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p);
const fixtures = Number(process.argv[2] ?? 1800), reached = new Set(), visits = {}, S = 0x9000;
const returns = new Map([[0x48457b, 0x484580], [0x4846d9, 0x4846df], [0x48470a, 0x48470d], [0x484717, 0x48471c], [0x40f0fc, 0x40f102], [0x40f125, 0x40f12b], [0x40f143, 0x40f149]]);
let steps = 0, totalCalls = 0, managerCalls = 0, nullListeners = 0, growths = 0;
machine.onInstruction = p => {reached.add(p); if (returns.has(p)) put(machine.bytes, machine.r.ESP - 4, returns.get(p)); if ([0x485130, 0x484560, 0x40f0e0].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
function services(m, variant) {
  const calls = []; let cursor = 0x300000;
  return {calls, libraryCall(name, args, runtime) {
    calls.push([name, ...args.map(v => v >>> 0), runtime.scratchBase]);
    if (name === 'operatorNew') {
      if (args[0] === 0x50 && variant % 13 === 5) return 0;
      const result = cursor; cursor += (args[0] + 31) & ~15; m.fill(0xcd, result, cursor); return result;
    }
    if (name === 'operatorDelete') {if (variant % 17 === 3) put(m, 0x6f240c, ptr(m, 0x6f2408) + 4); return 0;}
    if (name === 'memset') {m.fill(args[1] & 255, args[0], args[0] + args[2]); return args[0];}
    if (name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); if (variant % 19 === 2) put(m, 0x6f240c, ptr(m, 0x6f2408) + 4); return args[0];}
    throw Error(`Unexpected audio-listener service ${name}`);
  }, soundManagerCall(request, runtime) {
    calls.push(['game-manager', request, runtime.scratchBase]);
    if (variant % 11 === 1 && request.arguments[2] === 0) {
      const start = ptr(m, 0x6f2408), end = ptr(m, 0x6f240c), capacity = ptr(m, 0x6f2410);
      Buffer.from(m.subarray(start, capacity)).copy(m, 0x190000);
      put(m, 0x6f2408, 0x190000); put(m, 0x6f240c, 0x190000 + end - start); put(m, 0x6f2410, 0x190000 + capacity - start);
    }
    if (variant % 23 === 4) put(m, runtime.scratchBase + 108, 3);
    return 0x400000 + request.arguments[2] * 0x100;
  }};
}
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 1024, S + 128); put(memory, S, -1);
  const variant = Math.floor(fixture / 3), entry = [0x40f0e0, 0x484560, 0x485130][fixture % 3];
  put(memory, 0x5ecb1c, 0x100000); memory[0x100552] = variant % 7;
  for (let i = 0; i < 4; i++) {
    put(memory, 0x5ec120 + i * 4, variant % 5 === 0 ? 3 - i : i);
    put(memory, 0x909318 + i * 0x30c, 0x110000 + i * 4); put(memory, 0x110000 + i * 4, 0x200000 + i * 0x1000);
  }
  const size = variant % 5, capacity = size + variant % 3;
  put(memory, 0x6f2408, 0x180000); put(memory, 0x6f240c, 0x180000 + size * 4); put(memory, 0x6f2410, 0x180000 + capacity * 4);
  for (let i = 0; i < size; i++) put(memory, 0x180000 + i * 4, (i + variant) % 3 ? 0x280000 + i * 0x100 : 0);
  put(memory, 0x714b08, 0x120000); put(memory, 0x120000, 0x121000); put(memory, 0x12104c, 0x760030);
  for (const [slot, address] of [[0x56e220, 0x760000], [0x56e210, 0x760010], [0x56e478, 0x760020]]) put(memory, slot, address);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  const source = services(memory, variant), native = services(machine.bytes, variant), registers = {EBX: fixture + 0x121212, EBP: fixture + 0x131313, ESI: fixture + 0x141414, EDI: fixture + 0x151515};
  for (const [address, name, count] of [[0x760000, 'operatorNew', 1], [0x760010, 'operatorDelete', 1], [0x760020, 'memmove', 3], [0x568a50, 'memset', 3]]) machine.externalCalls.set(address, state => {
    state.r.EAX = native.libraryCall(name, Array.from({length: count}, (_, i) => ptr(state.bytes, state.r.ESP + i * 4)), {scratchBase: state.r.ESP - 4});
  });
  machine.externalCalls.set(0x760030, state => {
    const request = {thisAddress: state.r.ECX >>> 0, virtualAddress: 0x760030, offset: 0x4c, arguments: Array.from({length: 7}, (_, i) => ptr(state.bytes, state.r.ESP + i * 4))};
    state.r.EAX = native.soundManagerCall(request, {scratchBase: state.r.ESP - 4}); state.r.ESP += 28;
  });
  const args = Array.from({length: 11}, (_, i) => 0x220000 + i * 16); args[10] = [-1, 0, 1, 2, 3, 4, 6][variant % 7];
  const requested = variant % 8, runtime = {memory, scratchBase: S, entryRegisters: registers, services: source, handlers: {soundManagerCall: source.soundManagerCall}};
  if (entry === 0x40f0e0) reserveAudioListenerVector(requested, runtime);
  else if (entry === 0x484560) initializeAudioListeners(0x212000, 0x213000, args, runtime);
  else initializeRaceAudioListeners(runtime);
  machine.entry = entry; machine.r.ESP = S; machine.r.ECX = 0x212000; machine.r.EDX = 0x213000; Object.assign(machine.r, registers);
  if (entry === 0x40f0e0) put(machine.bytes, S + 4, requested); else if (entry === 0x484560) args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v));
  try {
    steps += machine.run(1_000_000); assert.equal(machine.fs0, 0x12345678);
    const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000);
    if (!actual.equals(expected)) {const p = actual.findIndex((v, i) => v !== expected[i]); assert.fail(`byte0x${(p + 0x10000).toString(16)} native${actual[p]} source${expected[p]}`);}
    assert.deepEqual(machine.bytes.subarray(0, 64), memory.subarray(0, 64), 'Null vector reserve outputs');
    assert.deepEqual(source.calls, native.calls, 'Ordered original CRT services and full by-value game callback arguments');
  } catch (error) {console.error({fixture, entry: entry.toString(16), variant, size, capacity, args, source: source.calls, native: native.calls}); throw error;}
  totalCalls += source.calls.length; managerCalls += source.calls.filter(row => row[0] === 'game-manager').length;
  nullListeners += source.calls.filter(row => row[0] === 'operatorNew' && row[1] === 0x50 && variant % 13 === 5).length;
  growths += source.calls.filter(row => row[0] === 'operatorNew' && row[1] !== 0x50).length;
}
const path = 'src/audio-listeners.mjs', report = {matched: true, method: 'Actual485130 participant selection → actual484560 listener vector/object construction → actual40f0e0 reserve. Return-free caller policies, all mapped bytes>=10000h plus null reserve output, restored TLS and ordered original CRT requests/exact callee ESP compare. Full seven-DWORD by-value callback input is compared, retaining native unwritten functor fields and actual PUSH/CALL producers. Synthetic split modes, reversed participant IDs, vector growth/reuse, null listener allocation, callback vector replacement/live count mutation and CRT global mutations. SoundManager virtual4c is explicitly a state-mutating GAME contract; concrete sound backend, bank/device lifetime and whole audio startup remain open. Private stack aliases outside published callback inputs and original-process execution are not established.', fixtures, totalCalls, managerCalls, nullListeners, growths, instructionSteps: steps, reachedInstructions: reached.size, visits, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, evidence: program.references.filter(r => /9081-|9085-|9098-|9104-/.test(r.path)), targetSha256: program.sha256};
const output = process.argv[3] ?? 'analysis/audio-listeners-with-factory-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify({...report, evidence: undefined}));
