import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {releaseAudioVoicePoolRecord, destroyAudioVoicePoolRecord} from '../src/audio-voice-pool-retirement.mjs';
import {eraseRendererPointers} from '../src/renderer-scene-nodes.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), S = 0x1f000, OBJECT = 0x100000, MANAGER = 0x110000, ARRAY = 0x120000, RESULT = 0x130000, ENGINE = 0x600000, VOICE = 0x602000;
const fixtures = Number(process.argv[2] ?? 2400), entries = [0x4b2130, 0x4b2240, 0x4b21e0], reached = new Set(), visits = {}, by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
machine.onInstruction = address => {reached.add(address); if ([...entries, 0x4a0e80, 0x4a2290, 0x4a0e90].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; const [i, next] = by.get(address); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
const imports = [[0x56e210, 'operatorDelete', 1], [0x56e478, 'memmove', 3], [0x56e08c, 'InitializeCriticalSectionAndSpinCount', 2, true], [0x56e094, 'EnterCriticalSection', 1, true], [0x56e09c, 'GetCurrentThreadId', 0, true], [0x56e090, 'LeaveCriticalSection', 1, true]];
let steps = 0, deletes = 0, comCalls = 0, moves = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const selector = fixture % 3, variant = Math.floor(fixture / 3), object = variant % 7 === 0 && selector === 0 ? 0 : OBJECT, vector = MANAGER + 0xd68;
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 1024, S + 128); put(memory, S, -1);
  put(memory, OBJECT, [0, 1, 2, 0xffffffff][variant % 4]); put(memory, OBJECT + 8, variant % 3 ? ENGINE : 0); put(memory, OBJECT + 12, variant % 2 ? VOICE : 0);
  put(memory, ENGINE, 0x601000); put(memory, 0x601008, 0x780000); put(memory, VOICE, 0x603000); put(memory, 0x603048, 0x780010);
  put(memory, vector, ARRAY); put(memory, vector + 4, ARRAY + variant % 8 * 4); put(memory, vector + 8, ARRAY + 64);
  for (let i = 0; i < 8; i++) put(memory, ARRAY + i * 4, variant % 3 === 0 || i % 3 === 1 ? OBJECT : 0x140000 + i);
  put(memory, 0x715b08, variant % 4); put(memory, 0x714afc, variant % 5 ? 0x715b30 : 0); memory[0x715b54] = 1;
  const length = variant % 8, firstIndex = variant % (length + 1), lastIndex = firstIndex + variant % (length - firstIndex + 1), first = ARRAY + firstIndex * 4, last = ARRAY + lastIndex * 4, result = variant % 13 === 0 ? vector + 4 : RESULT;
  const args = selector === 0 ? [object] : selector === 1 ? [0x12345678] : [result, first, last]; args.forEach((v, i) => put(memory, S + 4 + i * 4, v));
  imports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16));
  const world = m => {const calls = []; return {calls, libraryCall(name, args, r) {
    calls.push([name, ...args, r.scratchBase]);
    if (name === 'operatorDelete') {if (variant % 11 === 0 && selector === 0) {put(m, vector, ARRAY + 4); put(m, vector + 4, ARRAY + 24);} return 0;}
    if (name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); if (selector === 2 && variant % 7 === 0) put(m, S + 8, 0x151000); return args[0];}
    if (name === 'registerExit') return 0; throw Error(name);
  }, platformCall(name, args, r) {calls.push([name, ...args, r.scratchBase]); if (name === 'GetCurrentThreadId') return 42; if (name === 'InitializeCriticalSectionAndSpinCount') {m.fill(0x72, args[0], args[0] + 24); return 1;} return 0;}, xAudio2Call(owner, method, args, r) {calls.push(['XAudio2 COM', owner, method, ...args, r.scratchBase]); if (owner === VOICE && variant % 13 === 0) put(m, OBJECT + 8, 0); return 0;}};};
  const source = world(memory), native = world(machine.bytes); machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  imports.forEach(([, name, n, platform], i) => machine.externalCalls.set(0x760000 + i * 16, cpu => {cpu.r.EAX = native[platform ? 'platformCall' : 'libraryCall'](name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); if (platform) cpu.r.ESP += n * 4;}));
  machine.externalCalls.set(0x56832a, cpu => {cpu.r.EAX = native.libraryCall('registerExit', [ptr(cpu.bytes, cpu.r.ESP)], {scratchBase: cpu.r.ESP - 4});});
  for (const [address, owner, method] of [[0x780000, ENGINE, 8], [0x780010, VOICE, 0x48]]) machine.externalCalls.set(address, cpu => {cpu.r.EAX = native.xAudio2Call(owner, method, [ptr(cpu.bytes, cpu.r.ESP)], {scratchBase: cpu.r.ESP - 4}); cpu.r.ESP += 4;});
  const registers = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545}, runtime = {memory, scratchBase: S, entryRegisters: registers, services: source};
  try {
    let returned;
    if (selector === 0) releaseAudioVoicePoolRecord(MANAGER, object, runtime);
    else if (selector === 1) returned = destroyAudioVoicePoolRecord(OBJECT, args[0], runtime);
    else returned = eraseRendererPointers(vector, ...args, {...runtime, nativePointerErase: true});
    machine.entry = entries[selector]; machine.r.ESP = S; machine.r.ECX = selector === 0 ? MANAGER : selector === 1 ? OBJECT : vector; Object.assign(machine.r, registers); steps += machine.run(1000000);
    assert.equal(machine.fs0, 0x12345678); if (returned !== undefined) assert.equal(machine.r.EAX >>> 0, returned >>> 0); assert.deepEqual(source.calls, native.calls, 'ordered CRT/Win32/COM callee ESP');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 24).toString('hex')} source${memory.subarray(p, p + 24).toString('hex')}`);}
  } catch (error) {console.error({fixture, selector, variant, object, args, source: source.calls, native: native.calls}); throw error;}
  deletes += source.calls.filter(([name]) => name === 'operatorDelete').length; comCalls += source.calls.filter(([name]) => name === 'XAudio2 COM').length; moves += source.calls.filter(([name]) => name === 'memmove').length;
}
const paths = ['src/audio-voice-pool-retirement.mjs', 'src/renderer-scene-nodes.mjs'], report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, deletes, comCalls, moves, sources: await Promise.all(paths.map(async path => ({path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}))), targetSha256: program.sha256,
  method: 'Actual4b2130 zero-refcount release,4b2240 voice/engine record destruction, actual4a0e80/4a2290 debugger initialization and4b21e0 native pointer erase. Every10MiB byte including native frames, EAX where defined, TLS and ordered genuine CRT/Win32/XAudio2 requests/calleeESP compare. Null/zero/wrapped refs, duplicate/missing/all-matching pointers, empty vectors, guarded debugger initialization, COM-side engine mutation, delete-side vector mutation and memmove-side live output mutation are exercised. Genuine COM/library internals, exceptions and original process/audio-device execution remain outside this proof.'};
const output = process.argv[3] ?? 'analysis/audio-voice-pool-retirement-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
