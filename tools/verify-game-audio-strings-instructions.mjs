import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {eraseGameString, assignGameStringSubstring, constructGameStringSubstring, moveGameString, sliceGameAudioString, sliceGameAudioPrefix, compareGameStringCString, gameAudioNameHasPrefix} from '../src/game-audio-strings.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p), S = 0x9000, INPUT = 0x100000, OUTPUT = 0x110000, NAME = 0x120000;
const entries = [0x405410, 0x405150, 0x4a2fc0, 0x4a3180, 0x4a2bb0, 0x40cfa0, 0x404e10, 0x40cfc0], fixtures = Number(process.argv[2] ?? 2400), reached = new Set(), visits = {};
const next = new Map(program.instructions.slice(0, -1).map((i, n) => [i.address, program.instructions[n + 1].address])), by = new Map(program.instructions.map(i => [i.address, i]));
machine.onInstruction = p => {reached.add(p); if (entries.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1; const i = by.get(p); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next.get(p));};
let steps = 0, allocations = 0, comparisons = 0, truePrefixes = 0, moves = 0;
function services(m, variant) {
  const calls = []; let cursor = 0x300000;
  return {calls, libraryCall(name, args) {
    calls.push([name, ...args.map(v => v >>> 0)]);
    if (name === 'operatorNew') {const result = cursor; cursor += (args[0] + 31) & ~15; assert(cursor < 0x400000); m.fill(0xcd, result, cursor); return result;}
    if (name === 'operatorDelete' || name === 'operatorDeleteArray') return 0;
    if (name === 'memcpy' || name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); return args[0];}
    throw Error(`Unexpected audio string CRT ${name}`);
  }, securityCookie(value) {assert.equal(value >>> 0, ptr(m, 0x5e8890));}};
}
function string(m, object, text, heap) {
  const bytes = Buffer.from(text, 'latin1'); put(m, object + 16, bytes.length); put(m, object + 20, heap ? Math.max(31, bytes.length | 15) : 15);
  const pointer = heap ? object + 0x8000 : object; if (heap) put(m, object, pointer); bytes.copy(m, pointer); m[pointer + bytes.length] = 0; put(m, object + 24, 0);
}
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 2048, S + 128); put(memory, S, -1); put(memory, 0x5e8890, 0x12345678);
  const variant = Math.floor(fixture / entries.length), entry = entries[fixture % entries.length];
  const texts = ['', 'SFX_ENGINE', 'SFX_ENGINE_TURBO', 'Abc\0Def', 'A'.repeat(33), 'SFX_LEADER_FLY_LONG_SAMPLE'];
  const text = texts[variant % texts.length], heap = variant % 3 === 0 || text.length > 15;
  string(memory, INPUT, text, heap); string(memory, OUTPUT, variant & 1 ? 'Old' : 'Old'.repeat(7), !(variant & 1));
  const names = ['', 'SFX_ENGINE', 'SFX_LEADER_FLY', 'SFX_ENGINE_TURBO_TOO_LONG', 'Abc', 'A'.repeat(33)]; memory.write(names[variant % names.length] + '\0', NAME, 'latin1');
  const self = variant % 5 === 0, object = self && [0x405150, 0x4a3180, 0x4a2bb0, 0x40cfa0].includes(entry) ? INPUT : entry === 0x4a3180 && variant % 17 === 1 ? 0 : OUTPUT;
  const offset = variant % (text.length + 1), maximum = [0, 1, 8, 255, 0xffffffff][variant % 5];
  for (const [slot, address] of [[0x56e220, 0x760000], [0x56e210, 0x760010], [0x56e470, 0x760020], [0x56e478, 0x760030]]) put(memory, slot, address);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  const source = services(memory, variant), native = services(machine.bytes, variant), registers = {EBX: 0x121212 + fixture, EBP: 0x131313 + fixture, ESI: 0x141414 + fixture, EDI: 0x151515 + fixture};
  for (const [address, name, count] of [[0x760000, 'operatorNew', 1], [0x760010, 'operatorDelete', 1], [0x760020, 'operatorDeleteArray', 1], [0x760030, 'memmove', 3], [0x568a48, 'memcpy', 3]]) machine.externalCalls.set(address, state => {
    state.r.EAX = native.libraryCall(name, Array.from({length: count}, (_, i) => ptr(state.bytes, state.r.ESP + i * 4)));
  });
  machine.externalCalls.set(0x568162, state => native.securityCookie(state.r.ECX));
  const runtime = {memory, scratchBase: S, services: source, entryRegisters: registers, sehWord: 0x12345678};
  let result, ecx, stack;
  switch (entry) {
    case 0x405410: ecx = INPUT; stack = [offset, maximum]; result = eraseGameString(INPUT, ...stack, runtime); break;
    case 0x405150: ecx = object; stack = [INPUT, offset, maximum]; result = assignGameStringSubstring(object, ...stack, runtime); break;
    case 0x4a2fc0: ecx = INPUT; stack = [object, offset, maximum]; result = constructGameStringSubstring(INPUT, ...stack, runtime); break;
    case 0x4a3180: ecx = object; stack = [INPUT]; moveGameString(object, INPUT, runtime); break;
    case 0x4a2bb0: ecx = INPUT; stack = [object, offset, maximum]; result = sliceGameAudioString(INPUT, ...stack, runtime); break;
    case 0x40cfa0: ecx = INPUT; stack = [object, maximum]; result = sliceGameAudioPrefix(INPUT, ...stack, runtime); break;
    case 0x404e10: ecx = INPUT; stack = [NAME]; result = compareGameStringCString(INPUT, NAME, runtime); comparisons++; break;
    case 0x40cfc0: ecx = INPUT; stack = [NAME, fixture]; result = gameAudioNameHasPrefix(INPUT, NAME, runtime); truePrefixes += result; comparisons++; break;
  }
  machine.entry = entry; machine.r.ESP = S; machine.r.ECX = ecx; Object.assign(machine.r, registers); stack.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v));
  try {
    steps += machine.run(2_000_000); assert.equal(machine.fs0, 0x12345678);
    if (result !== undefined) assert.equal(entry === 0x40cfc0 ? machine.r.EAX & 255 : machine.r.EAX | 0, result | 0, 'native return');
    const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000);
    if (!actual.equals(expected)) {const p = actual.findIndex((v, i) => v !== expected[i]); assert.fail(`byte0x${(p + 0x10000).toString(16)} native${actual[p]} source${expected[p]}`);}
    assert.deepEqual(machine.bytes.subarray(0, 32), memory.subarray(0, 32), 'low/null move outputs');
    assert.deepEqual(machine.bytes.subarray(S - 2048, S), memory.subarray(S - 2048, S), 'complete private string frames');
    assert.deepEqual(source.calls, native.calls, 'ordered CRT allocation/copy/release calls');
  } catch (error) {console.error({fixture, entry: entry.toString(16), variant, object, offset, maximum, text, source: source.calls, native: native.calls}); throw error;}
  allocations += source.calls.filter(([name]) => name === 'operatorNew').length; moves += source.calls.filter(([name]) => name === 'memmove').length;
}
const path = 'src/game-audio-strings.mjs';
const report = {matched: true, method: 'Actual405150 substring assignment/405410 erase,4a2fc0 constructor,4a3180 move,4a2bb0/40cfa0 audio slices,404e10→actual401c90 compare and40cfc0 prefix equality. Actual405860 growth and propagated child register/SEH frames execute directly. All mapped bytes>=10000h plus low/null move fields, complete2KiB private stack, returns (AL for40cfc0), restored TLS and ordered genuine CRT allocation/copy/releases compare. Caller argument padding above entryESP, original CRT internals and arbitrary private-frame aliases remain open. Synthetic inline/heap/empty strings, embedded NULs, offsets, unsigned npos, same-object assignment/move/slice and prefix-versus-whole-name differences. No original game process execution.', fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, allocations, comparisons, truePrefixes, moves, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256};
const output = process.argv[3] ?? 'analysis/game-audio-strings-private-frames-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
