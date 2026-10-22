import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {soundManagerImports, createSoundManagerServices, installSoundManagerInstructionServices} from './verify-sound-manager-construction-instructions.mjs';
import {loadGameAudioSample, initializeRaceAudio} from '../src/game-audio-samples.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const S = 0x9000, NAME = 0x100000, MANAGER = 0x110000, SESSION = 0x140000, ALTERNATE = 0x141000;
const fixtures = Number(process.argv[2] ?? 1200), reached = new Set(), visits = {};
const sorted = program.instructions, next = new Map(sorted.slice(0, -1).map((i, n) => [i.address, sorted[n + 1].address])), by = new Map(sorted.map(i => [i.address, i]));
machine.entries.delete(0x4a7710); //Explicit game factory boundary until its complete graph is ported.
machine.onInstruction = address => {
  reached.add(address);
  if ([0x40dcd0, 0x485250, 0x485130, 0x4a9b00, 0x4a9ec0, 0x40d7d0, 0x405860, 0x4a08f0].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
  const i = by.get(address);
  if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next.get(address));
};
const imports = [[0x56e248, 'strstr', 2], [0x56e470, 'operatorDeleteArray', 1]];
function world(m, variant, parent) {
  const base = createSoundManagerServices(m, 0), calls = base.calls;
  const string = address => {let end = address; while (m[end]) end++; return m.toString('latin1', address, end);};
  return {calls, libraryCall(name, args, context) {
    if (name === 'wcscat_s' && !args[2]) {calls.push([name, ...args]); m.writeUInt16LE(0, args[0]); return 22;}
    if (name === 'strstr') {calls.push([name, ...args]); const index = string(args[0]).indexOf(string(args[1])); return index < 0 ? 0 : args[0] + index;}
    if (name === 'operatorNew' && (ptr(m, context.scratchBase) === 0x40def3 && variant % 13 === 0 || ptr(m, context.scratchBase) === 0x40d858 && variant % 17 === 0)) {calls.push([name, ...args]); return 0;}
    if (name === 'operatorDelete' && ptr(m, context.scratchBase) === 0x40df53 && variant % 7 === 0) put(m, 0x6f2418, ptr(m, 0x6f2418) + 4);
    return base.libraryCall(name, args);
  }, platformCall: base.platformCall,
  securityCookie(value) {assert.equal(value >>> 0, ptr(m, 0x5e8890));},
  factory(request) {
    assert.equal(request.virtualAddress, 0x4a7710);
    assert.equal(request.arguments[5], 0, 'empty function callback pointer');
    calls.push(['GAME sample factory', request.thisAddress, request.descriptor, m.subarray(request.descriptor, request.descriptor + 0x460).toString('hex')]);
    if (variant % 3 === 0) put(m, 0x5ecb1c, ALTERNATE);
    //The parent must read session after the factory, and sample cleanup after vector insertion.
    if (parent && variant % 5 === 0) m[ALTERNATE + 0x54d] = 3;
    if (parent && variant % 11 === 0) {put(m, 0x5ecb1c, 0x713284 - 0x54d); m[0x713284] = 2;}
    if (variant % 23 === 0) put(m, S - (parent ? 16 : 0) - 0x8b4 + 0x2c, 0x180000);
    return variant % 7 ? 0x190000 + variant * 4 : 0;
  }};
}
let steps = 0, factoryContracts = 0, listeners = 0, nullOwners = 0, nullWrappers = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const parent = fixture % 2 === 1, variant = fixture >> 1, entry = parent ? 0x485250 : 0x40dcd0;
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 0x6000, S + 128); put(memory, S, -1); put(memory, 0x5e8890, 0x12345678);
  const names = ['SFX_ENGINE', 'SFX_ENGINE_TURBO', 'SFX_LEADER_FLY', 'SFX_LEADER_FLY_LONG_SAMPLE', 'SMALL_EXPLO_DEBRIS', 'Plain', '', 'Long sample name with heap allocation'];
  memory.write(names[variant % names.length] + '\0', NAME, 'latin1');
  put(memory, MANAGER, 0x5d4190); put(memory, 0x5d41a4, 0x4a7710); put(memory, 0x5d41dc, 0x4a9b00); put(memory, 0x714b08, MANAGER);
  put(memory, MANAGER + 0x82c, 0x111000); put(memory, 0x111000, 0x112000); put(memory, 0x111004, 0x112000); put(memory, 0x111008, 0x112020);
  put(memory, 0x5ecb1c, SESSION); memory[SESSION + 0x54d] = variant % 7; memory[ALTERNATE + 0x54d] = (variant + 3) % 7;
  memory[SESSION + 0x552] = [0, 1, 2, 3, 4, 7][variant % 6];
  for (let i = 0; i < 4; i++) {put(memory, 0x5ec120 + i * 4, i); put(memory, 0x909318 + i * 0x30c, 0x120000 + i * 4); put(memory, 0x120000 + i * 4, 0x130000 + i * 0x1000);}
  put(memory, 0x6f2408, 0x150000); put(memory, 0x6f240c, 0x150000); put(memory, 0x6f2410, 0x150000 + (variant % 3) * 8);
  put(memory, 0x6f2414, 0x160000); put(memory, 0x6f2418, 0x160000 + (variant % 4) * 4); put(memory, 0x6f241c, 0x160000 + (variant % 4 + variant % 2) * 4);
  memory.fill(0x4b, 0x713190, 0x713300);
  soundManagerImports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16)); imports.forEach(([slot], i) => put(memory, slot, 0x770000 + i * 16));
  const source = world(memory, variant, parent), native = world(machine.bytes, variant, parent), regs = {EBX: 0x121212 + fixture, EBP: 0x232323 + fixture, ESI: 0x343434 + fixture, EDI: 0x454545 + fixture};
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes); installSoundManagerInstructionServices(machine, native);
  soundManagerImports.forEach(([, name, n, platform], i) => {
    if (!platform) machine.externalCalls.set(0x760000 + i * 16, cpu => {cpu.r.EAX = native.libraryCall(name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});});
  });
  imports.forEach(([, name, n], i) => machine.externalCalls.set(0x770000 + i * 16, cpu => {cpu.r.EAX = native.libraryCall(name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});}));
  machine.externalCalls.set(0x568162, cpu => native.securityCookie(cpu.r.ECX));
  machine.externalCalls.set(0x4a7710, cpu => {
    const args = Array.from({length: 7}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4));
    cpu.r.EAX = native.factory({thisAddress: cpu.r.ECX >>> 0, virtualAddress: 0x4a7710, descriptor: args[0], arguments: args}); cpu.r.ESP += 28;
  });
  const flag = [0, 1, -1, 0x100][Math.floor(variant / 8) % 4], runtime = {memory, scratchBase: S, entryRegisters: regs, sehWord: 0x12345678, services: source, handlers: {soundManagerSample: source.factory}};
  try {
    const name = variant % 19 === 0 ? 0 : NAME;
    const result = parent ? initializeRaceAudio(runtime) : loadGameAudioSample(name, flag, runtime);
    machine.entry = entry; machine.r.ESP = S; machine.r.ECX = name; machine.r.EDX = flag; Object.assign(machine.r, regs); steps += machine.run(5_000_000);
    assert.equal(machine.fs0, 0x12345678); if (!parent) assert.equal(machine.r.EAX | 0, result | 0, 'sample index');
    assert.deepEqual(source.calls, native.calls, 'ordered CRT/Win32 and explicit factory requests');
    const lower = parent ? S - 16 - 0x8b4 : S - 0x8b4;
    for (const [begin, end] of [[lower, S], [0x10000, memory.length]]) {
      const a = memory.subarray(begin, end), b = machine.bytes.subarray(begin, end);
      if (!a.equals(b)) {const i = a.findIndex((v, i) => v !== b[i]), p = begin + i; assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 24).toString('hex')} source${memory.subarray(p, p + 24).toString('hex')}`);}
    }
  } catch (error) {console.error({fixture, parent, variant, name: names[variant % names.length], sourceCalls: source.calls.map(c => c[0]), nativeCalls: native.calls.map(c => c[0])}); throw error;}
  factoryContracts += source.calls.filter(([name]) => name === 'GAME sample factory').length;
  listeners += parent ? [1, 2, 2, 3, 4, 1][variant % 6] : 0;
  nullOwners += Number(variant % 13 === 0); nullWrappers += Number(variant % 13 !== 0 && variant % 17 === 0);
}
const path = 'src/game-audio-samples.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, factoryContracts, listeners, nullOwners, nullWrappers, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual40dcd0 sample descriptor/path/name/range policy and485250 startup, through actual string/descriptor/FIFO/owner/vector/listener descendants. Only4a7710 remains an explicit GAME sample-factory contract. Compare ordered genuine CRT/Win32 calls and complete descriptor at that boundary, allmappedbytes>=10000h and complete parent sample/startup frames, EAX index and restoredTLS. Deeper unconsumed private frames, exceptions, original CRT internals and original-process runtime are outside this proof. Factory mutates session root before caller captures it, optionally aliases participant-count byte with horn stores and publishes extra cleanup ownership; cleanup may mutate vector length after the return index is captured. Null owner/wrapper paths, null/inline/heap and prefix/explosion names are exercised. Null wcscat_s is an explicit fixture convention returning22 and clearing destination; original CRT invalid-parameter handlers are not reconstructed.'};
const output = process.argv[3] ?? 'analysis/game-audio-samples-default-factory-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
