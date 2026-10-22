import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {stopSoundManager} from '../src/sound-manager-shutdown.mjs';
import {destroyXAudioManager, releaseXAudioManager} from '../src/xaudio-manager-lifecycle.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), S = 0x1f000, MANAGER = 0x100000, POOL = 0x340000, ENGINE = 0x600000;
const fixtures = Number(process.argv[2] ?? 900), outer = process.argv.includes('--outer'), reached = new Set(), visits = {}, by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
const watched = [0x4a5e70, 0x4a34a0, 0x4a34c0, 0x4aa250, 0x4a7950, 0x4ad8f0, 0x4ad910, 0x4ad250, 0x4afc00, 0x4afc80, 0x4aa000, 0x4b2130, 0x4b2240, ...(outer ? [0x4b11f0, 0x4b11d0, 0x4a5ad0, 0x4a9570, 0x4aba30] : [])];
machine.onInstruction = address => {reached.add(address); if (watched.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; const [i, next] = by.get(address); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
const imports = [[0x56e210, 'operatorDelete', 1], [0x56e220, 'operatorNew', 1], [0x56e470, 'operatorDeleteArray', 1], [0x56e23c, 'free', 1], [0x56e478, 'memmove', 3], [0x56e094, 'EnterCriticalSection', 1, true], [0x56e09c, 'GetCurrentThreadId', 0, true], [0x56e090, 'LeaveCriticalSection', 1, true], [0x56e098, 'DeleteCriticalSection', 1, true], [0x56e0bc, 'CloseHandle', 1, true], [0x56e0a4, 'SetEvent', 1, true]];
let steps = 0, allocated = 0, deleted = 0, comCalls = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 4096, S + 128); put(memory, S, -1);
  put(memory, MANAGER, 0x5d4190); put(memory, 0x714b08, MANAGER); put(memory, 0x715b08, 3); put(memory, 0x714afc, 0x715b30); put(memory, 0x714b18, 1);
  const headers = new Map(), arrays = new Map();
  for (const [i, offset] of [0x82c, 0x830, 0x834, 0x838, 0x83c, 0x840, 0x844, 0x848, 0x84c].entries()) {
    const header = 0x110000 + i * 0x100, array = 0x120000 + i * 0x100;
    headers.set(offset, header); arrays.set(offset, array); put(memory, MANAGER + offset, header); put(memory, header, array); put(memory, header + 4, array); put(memory, header + 8, array + (offset === 0x840 ? fixture % 2 * 4 : 64));
  }
  const populate = (offset, values) => {values.forEach((v, i) => put(memory, arrays.get(offset) + i * 4, v)); put(memory, headers.get(offset) + 4, arrays.get(offset) + values.length * 4);};
  const samples = Array.from({length: fixture % 4}, (_, i) => 0x200000 + i * 0x1000), queued = Array.from({length: fixture % 3}, (_, i) => 0x240000 + i * 0x1000), listeners = Array.from({length: fixture % 5}, (_, i) => 0x260000 + i * 0x100), mixers = Array.from({length: (fixture + 2) % 5}, (_, i) => 0x280000 + i * 0x100), waves = Array.from({length: 4}, (_, i) => 0x2a0000 + i * 0x1000);
  function callback(storage, kind, i) {const input = fixture % 3 === 0 ? 0 : fixture % 3 === 1 ? storage : 0x2d0000 + i * 32; if (input) {put(memory, input, kind ? 0x5d3d1c : 0x5d0304); put(memory, input + 4, i);} put(memory, storage + 16, input);}
  samples.forEach((object, i) => {put(memory, object, 0x5d3f60); put(memory, object + 0x964, fixture % 2 ? waves[i] : 0); put(memory, object + 0x97c, fixture % 3 ? 0x602000 : 0); put(memory, object + 0x9a4, POOL); put(memory, object + 0x9a0, 0x300000 + i * 32); callback(object + 0x930, true, i);});
  queued.forEach((object, i) => {put(memory, object, 0x5d3d3c); put(memory, object + 44, samples.length ? samples[i % samples.length] : 0); put(memory, object + 36, 0x310000 + i * 32); put(memory, 0x310000 + i * 32, 0x311000 + i * 32);});
  listeners.forEach((object, i) => {put(memory, object, 0x5d3cc4); callback(object + 8, false, 10 + i);});
  mixers.forEach((object, i) => {put(memory, object, 0x5d3ba8); put(memory, object + 72, fixture % 2 ? 0x608000 : 0); callback(object + 16, Boolean(i % 2), 20 + i);});
  waves.forEach((object, i) => {put(memory, object, 0x5d407c); put(memory, object + 4, 1); put(memory, object + 0x424, fixture % 2 ? 0x320000 + i * 32 : 0);});
  populate(0x834, samples); populate(0x848, queued); populate(0x82c, listeners); populate(0x830, waves); populate(0x84c, mixers);
  for (const offset of [0x838, 0x83c, 0x844]) populate(offset, [0x12345678, 0]);
  put(memory, MANAGER + 0x8ac, fixture % 3); put(memory, MANAGER + 0x8b0, 99); memory[MANAGER + 0x820] = 1;
  put(memory, POOL, samples.length); put(memory, POOL + 8, ENGINE); put(memory, POOL + 12, 0x606000); put(memory, MANAGER + 0xd68, 0x330000); put(memory, MANAGER + 0xd6c, 0x330008); put(memory, 0x330000, POOL); put(memory, 0x330004, POOL);
  if (fixture % 3 === 1) {
    const thread = 0x2c0000; put(memory, MANAGER + 0x824, thread); put(memory, thread, fixture % 2 ? 0x5d39f0 : 0x5d39f8); memory.write('Worker\0', thread + 4); put(memory, thread + 24, 15); put(memory, thread + 32, fixture % 7 ? 101 : 0); put(memory, thread + 40, 201); put(memory, thread + 44, 202); put(memory, thread + 48, 203); memory[thread + 64] = 1;
  }
  for (const owner of [ENGINE, 0x602000, 0x606000, 0x608000]) put(memory, owner, owner + 0x1000);
  const methods = [[ENGINE, 8, 1], [0x602000, 0x50, 3], [0x602000, 0x58, 1], [0x602000, 0x48, 1], [0x606000, 0x48, 1], [0x608000, 0x48, 1], ...(outer ? [[ENGINE, 0x30, 1], [0x602000, 0x30, 1]] : [])];
  if (outer) {
    put(memory, MANAGER + 0x910, fixture % 3 ? ENGINE : 0); put(memory, MANAGER + 0x914, fixture % 2 ? 0x608000 : 0); put(memory, S + 4, fixture % 4);
    for (const [i, offset] of [4, 8, 12, 0x814].entries()) {const header = 0x380000 + i * 32; put(memory, MANAGER + offset, header); put(memory, header, 0x390000 + i * 32); put(memory, header + 4, 0x390004 + i * 32); put(memory, header + 8, 0x390010 + i * 32);}
  }
  methods.forEach(([owner, offset], i) => put(memory, ptr(memory, owner) + offset, 0x780000 + i * 16)); imports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16));
  const world = m => {const calls = []; let cursor = 0x400000; return {calls, libraryCall(name, args, r) {
    calls.push([name, ...args, r.scratchBase]);
    if (name === 'operatorNew') {const result = cursor; cursor += (args[0] + 31) & ~15; m.fill(0xcd, result, cursor); return result;}
    if (name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); return args[0];}
    if (name === '__RTDynamicCast') return args[0]; return 0;
  }, platformCall(name, args, r) {calls.push([name, ...args, r.scratchBase]); return name === 'GetCurrentThreadId' ? 73 : 1;}, xAudio2Call(owner, offset, args, r) {calls.push(['XAudio2 COM', owner, offset, ...args, r.scratchBase]); return 0;}};};
  const source = world(memory), native = world(machine.bytes); machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  imports.forEach(([, name, n, platform], i) => machine.externalCalls.set(0x760000 + i * 16, cpu => {cpu.r.EAX = native[platform ? 'platformCall' : 'libraryCall'](name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); if (platform) cpu.r.ESP += n * 4;}));
  machine.externalCalls.set(0x56932a, cpu => {cpu.r.EAX = native.libraryCall('__RTDynamicCast', Array.from({length: 5}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});});
  methods.forEach(([owner, offset, n], i) => machine.externalCalls.set(0x780000 + i * 16, cpu => {cpu.r.EAX = native.xAudio2Call(owner, offset, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); cpu.r.ESP += n * 4;}));
  const registers = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545};
  try {
    const runtime = {memory, scratchBase: S, entryRegisters: registers, sehWord: 0x12345678, services: source};
    const result = outer ? fixture % 2 ? releaseXAudioManager(MANAGER, fixture % 4, runtime) : destroyXAudioManager(MANAGER, runtime) : stopSoundManager(MANAGER, runtime);
    machine.entry = outer ? fixture % 2 ? 0x4b11d0 : 0x4b11f0 : 0x4a5e70; machine.r.ESP = S; machine.r.ECX = MANAGER; Object.assign(machine.r, registers); steps += machine.run(2_000_000);
    if (result !== undefined) assert.equal(machine.r.EAX >>> 0, result >>> 0);
    assert.equal(machine.fs0, 0x12345678); assert.deepEqual(source.calls, native.calls, 'ordered CRT/Win32/COM callee ESP');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 24).toString('hex')} source${memory.subarray(p, p + 24).toString('hex')}`);}
  } catch (error) {console.error({fixture, source: source.calls, native: native.calls}); throw error;}
  allocated += source.calls.filter(([name]) => name === 'operatorNew').length; deleted += source.calls.filter(([name]) => name === 'operatorDelete').length; comCalls += source.calls.filter(([name]) => name === 'XAudio2 COM').length;
}
const path = outer ? 'src/xaudio-manager-lifecycle.mjs' : 'src/sound-manager-shutdown.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, actualGameCalls: visits, allocated, deleted, comCalls, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: (outer ? 'Actual4b11f0/4b11d0 concrete manager destruction with full4a5e70 stop, masteringvoice/engine COM release, poolstorage free, base/core/database/event/critical teardown. ' : '') + 'Actual4a5e70 stop sequence with real managed-thread, queued wrapper, deferred callback/vector, sample/voicepool, waveform-cache, listener and inline mixer/COM/callable destruction. Full10MiB including every privateframe and TLS plus ordered genuine CRT/Win32/XAudio2 calls and calleeESP compare. Caller-owned initialized headers/objects, completed/null thread handles, inline/heap/empty known callbacks, shared source references, nullable voices and actual pool-record retirement are exercised. Decoder child destruction is covered separately; these stop fixtures use nonstreaming source objects. RTTI results are declared genuine MSVC service inputs; original process, host threads/device and unknown game virtuals are unclaimed. Deferred vector840h is intentionally left populated.'};
const output = process.argv.slice(3).find(arg => !arg.startsWith('--')) ?? (outer ? 'analysis/xaudio-manager-destruction-native-device-name-instruction-check.json' : 'analysis/sound-manager-shutdown-instruction-check.json');
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
