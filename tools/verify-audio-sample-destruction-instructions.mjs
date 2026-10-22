import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {destroyBaseGameAudioSample, destroyXAudioSample, releaseXAudioSample} from '../src/audio-sample-destruction.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), S = 0x1f000, OBJECT = 0x100000, MANAGER = 0x110000, OTHER = 0x112000, POOL = 0x120000, WAVE = 0x130000, ENGINE = 0x600000;
const fixtures = Number(process.argv[2] ?? 1800), entries = [0x4ad250, 0x4ad910, 0x4ad8f0], reached = new Set(), visits = {}, by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
machine.onInstruction = address => {reached.add(address); if ([...entries, 0x4b2130, 0x4b2240, 0x4afc80, 0x4a7bb0, 0x4afc00].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; const [i, next] = by.get(address); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
const imports = [[0x56e210, 'operatorDelete', 1], [0x56e23c, 'free', 1], [0x56e478, 'memmove', 3], [0x56e08c, 'InitializeCriticalSectionAndSpinCount', 2, true], [0x56e094, 'EnterCriticalSection', 1, true], [0x56e09c, 'GetCurrentThreadId', 0, true], [0x56e090, 'LeaveCriticalSection', 1, true], [0x56e470, 'operatorDeleteArray', 1], [0x56e0bc, 'CloseHandle', 1, true], [0x56e098, 'DeleteCriticalSection', 1, true]];
let steps = 0, comCalls = 0, deletes = 0, freePcm = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const selector = fixture % 3, variant = Math.floor(fixture / 3), flags = variant % 4;
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 2048, S + 128); put(memory, S, -1);
  if (selector === 2) put(memory, S + 4, flags);
  put(memory, OBJECT + 0x97c, variant % 3 ? 0x602000 : 0); put(memory, OBJECT + 0x9a0, variant % 5 ? 0x140000 : 0); put(memory, OBJECT + 0x9a4, variant % 7 ? POOL : 0);
  put(memory, OBJECT + 0x948, 99); put(memory, POOL, 1 + Math.floor(variant / 3) % 3); put(memory, POOL + 8, variant % 2 ? ENGINE : 0); put(memory, POOL + 12, variant % 3 ? 0x606000 : 0);
  const storage = OBJECT + 0x930, callable = variant % 3 === 0 ? 0 : variant % 3 === 1 ? storage : 0x145000;
  if (callable) {put(memory, callable, variant % 2 ? 0x5d3d1c : 0x5d0304); put(memory, callable + 4, 13);} put(memory, storage + 16, callable);
  put(memory, OBJECT + 0x964, variant % 5 === 0 ? 0 : WAVE); put(memory, WAVE, 0x5d407c); put(memory, WAVE + 4, variant % 4); put(memory, WAVE + 0x424, variant % 2 ? 0x146000 : 0);
  for (const [i, manager] of [MANAGER, OTHER].entries()) {
    put(memory, manager + 0x830, 0x150000 + i * 0x100); put(memory, 0x150000 + i * 0x100, 0x151000 + i * 0x100); put(memory, 0x150004 + i * 0x100, 0x151000 + i * 0x100 + (variant % 4) * 4); put(memory, 0x150008 + i * 0x100, 0x151010 + i * 0x100);
    put(memory, manager + 0xd68, 0x152000 + i * 0x100); put(memory, manager + 0xd6c, 0x152010 + i * 0x100); put(memory, manager + 0xd70, 0x152020 + i * 0x100);
    for (let n = 0; n < 4; n++) {put(memory, 0x151000 + i * 0x100 + n * 4, variant % 7 === 0 ? WAVE + 0x1000 : WAVE); put(memory, 0x152000 + i * 0x100 + n * 4, n % 2 ? POOL : POOL + 0x1000);}
  }
  put(memory, 0x714b08, MANAGER); put(memory, 0x715b08, 3); put(memory, 0x714afc, 0x715b30); put(memory, 0x714b18, 1); put(memory, 0x714b1c, 99);
  const decoder = 0x180000, stream = 0x190000, type = Math.floor(variant / 2) % 3;
  if (variant % 2) {
    put(memory, OBJECT + 0x968, decoder); put(memory, decoder, [0x5d4280, 0x5d42a8, 0x5d42d0][type]); put(memory, decoder + 8, OBJECT); put(memory, decoder + 0x64, variant % 3 === 0 ? -1 : 201);
    memory[decoder + 0x68] = type === 2 ? Number(variant % 7 === 0) : 0;
    put(memory, decoder + 0xa4, 0x1a0000); put(memory, 0x1a0000, 0x1a1000); put(memory, 0x1a0004, 0x1a1000 + variant % 4 * 4); put(memory, 0x1a0008, 0x1a1020);
    for (let i = 0; i < 4; i++) {put(memory, 0x1a1000 + i * 4, 0x1a2000 + i * 0x100); put(memory, 0x1a2000 + i * 0x100, 0x1a3000 + i * 0x100);}
    for (const offset of [0x18, 0x98, 0xdc, 0xe0, 0x2520]) put(memory, decoder + offset, 0x1a8000 + offset);
    for (let i = 0; i < 7; i++) put(memory, decoder + 0x1c + [28, 36, 32, 12, 24, 20, 16][i], variant >> i & 1 ? 0 : 0x1b0000 + i * 16);
    if (variant % 3) {
      put(memory, decoder + 12, stream); put(memory, stream, 0x5d4218); put(memory, stream + 32, 0x1b1000); put(memory, stream + 0x84, 0x1b1100);
      put(memory, stream + 0x70, 0x1b2000); put(memory, stream + 0x74, 0x1b3000); put(memory, stream + 0x78, 4); put(memory, stream + 0x7c, 5); put(memory, stream + 0x80, 2);
      for (let i = 0; i < 4; i++) put(memory, 0x1b3000 + i * 4, 0x1b4000 + i * 32);
    }
  }
  for (const voice of [0x602000, 0x604000, 0x606000]) put(memory, voice, voice + 0x1000); put(memory, ENGINE, ENGINE + 0x1000);
  const methods = [[ENGINE, 8, 1], ...[0x602000, 0x604000].flatMap(owner => [[owner, 0x50, 3], [owner, 0x58, 1], [owner, 0x48, 1]]), [0x606000, 0x48, 1]];
  methods.forEach(([owner, offset], i) => put(memory, ptr(memory, owner) + offset, 0x780000 + i * 16)); imports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16));
  const world = m => {const calls = []; return {calls, libraryCall(name, args, r) {
    calls.push([name, ...args, r.scratchBase]);
    if (name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); return args[0];}
    if (name === 'operatorDelete' && selector === 2 && variant % 13 === 0) put(m, S + 4, flags ^ 1);
    return 0;
  }, platformCall(name, args, r) {calls.push([name, ...args, r.scratchBase]); return name === 'GetCurrentThreadId' ? 42 : 0;}, xAudio2Call(owner, offset, args, r) {
    calls.push(['XAudio2 COM', owner, offset, ...args, r.scratchBase]);
    if (offset === 0x50 && variant % 7 === 0) put(m, OBJECT + 0x97c, 0x604000);
    if (offset === 0x48 && variant % 11 === 0) put(m, 0x714b08, OTHER);
    if (offset === 8 && variant % 17 === 0) put(m, OBJECT + 0x940, 0);
    return 0;
  }};};
  const source = world(memory), native = world(machine.bytes); machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  imports.forEach(([, name, n, platform], i) => machine.externalCalls.set(0x760000 + i * 16, cpu => {cpu.r.EAX = native[platform ? 'platformCall' : 'libraryCall'](name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); if (platform) cpu.r.ESP += n * 4;}));
  methods.forEach(([owner, offset, n], i) => machine.externalCalls.set(0x780000 + i * 16, cpu => {cpu.r.EAX = native.xAudio2Call(owner, offset, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); cpu.r.ESP += n * 4;}));
  const registers = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545}, runtime = {memory, scratchBase: S, entryRegisters: registers, sehWord: 0x12345678, services: source};
  try {
    const result = selector === 0 ? destroyBaseGameAudioSample(OBJECT, runtime) : selector === 1 ? destroyXAudioSample(OBJECT, runtime) : releaseXAudioSample(OBJECT, flags, runtime);
    machine.entry = entries[selector]; machine.r.ESP = S; machine.r.ECX = OBJECT; Object.assign(machine.r, registers); steps += machine.run(1_000_000);
    assert.equal(machine.fs0, 0x12345678); if (selector === 2) assert.equal(machine.r.EAX >>> 0, result >>> 0); assert.deepEqual(source.calls, native.calls, 'ordered genuine CRT/COM callee ESP');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 24).toString('hex')} source${memory.subarray(p, p + 24).toString('hex')}`);}
  } catch (error) {console.error({fixture, selector, variant, source: source.calls, native: native.calls}); throw error;}
  comCalls += source.calls.filter(([name]) => name === 'XAudio2 COM').length; deletes += source.calls.filter(([name]) => name === 'operatorDelete').length; freePcm += source.calls.filter(([name]) => name === 'free').length;
}
const path = 'src/audio-sample-destruction.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, comCalls, deletes, freePcm, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4ad250 base destructor,4ad910 voice/source body and4ad8f0 deleting adapter with actual waveformcache removal,callback children, voicepool destruction/removal and three concrete decoder scalar adapters with actual WAV/MP3/uninitializedOGG reset, sample-owner policies, block/FFT/deque/stream cleanup. Full10MiB incl every native privateframe, scalar EAX, TLS and ordered genuine CRT/Win32/XAudio2 COM/calleeESP compare. Nullable/populated voices/pools/decoders, callback ownership, final/shared waveform refs, duplicate/missing cache entries, live COM-side voice/global/callback changes and CRT-side outer flag changes are exercised. No GAME mocks. Initialized OGG vendor teardown, original process/device/library internals and arbitrary unsupported virtuals remain open.'};
const output = process.argv[3] ?? 'analysis/audio-sample-destruction-with-decoders-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
