import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {soundManagerImports, createSoundManagerServices, installSoundManagerInstructionServices} from './verify-sound-manager-construction-instructions.mjs';
import {initializeXAudioManagerConstants, constructXAudioManager} from '../src/xaudio-manager-construction.mjs';
const p = await loadRetainedNativeProgram(), machine = new BoundedX86(p.instructions), memory = Buffer.alloc(0xa00000);
const put = (m, a, v) => m.writeInt32LE(v | 0, a), ptr = (m, a) => m.readUInt32LE(a), OBJECT = 0x100000, S = 0x9000, ENGINE = 0x600000, VOICE = 0x602000;
const fixtures = Number(process.argv[2] ?? 600), reached = new Set(), visits = {}, entries = new Map(p.instructions.map((i, n) => [i.address, [i, p.instructions[n + 1]?.address]]));
let steps = 0, comCalls = 0, successes = 0;
machine.onInstruction = address => {
  reached.add(address); if ([0x4b0eb0, 0x4a57a0, 0x4a94b0, 0x4ab960, 0x4a0e80, 0x4a1840, 0x4a91d0, 0x4a2a90, 0x402000].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
  const [instruction, next] = entries.get(address);
  if (instruction.op === 'CALL') {const target = machine.get(instruction.args[0]) >>> 0; if (machine.externalCalls.has(target)) put(machine.bytes, machine.r.ESP - 4, next);}
};
function world(m, fixture, databases) {
  const base = createSoundManagerServices(m, databases ? fixture : 0, {databases}), calls = base.calls; let voiceAttempts = 0;
  const platformCall = (name, args, r) => {
    if (!['IsProcessorFeaturePresent', 'CoCreateInstance', 'WideCharToMultiByte', 'X3DAudioInitialize'].includes(name)) return base.platformCall(name, args, r);
    calls.push([name, ...args.map(v => v >>> 0)]);
    if (name === 'IsProcessorFeaturePresent') return Number(fixture % 3 !== (args[0] === 6 ? 0 : 1));
    if (name === 'CoCreateInstance') {if (fixture % 7 === 0) return -1; put(m, args[4], ENGINE); return 0;}
    if (name === 'WideCharToMultiByte') {for (let i = 0; i < args[3]; i++) m[args[4] + i] = m.readUInt16LE(args[2] + i * 2) & 255; return args[3];}
    m.fill(0x71, args[2], args[2] + 20); return 0;
  };
  const xAudio2Call = (owner, method, args) => {
    calls.push(['XAudio2 COM', owner, method, ...args]);
    if (owner === ENGINE && method === 0x14) return fixture % 7 === 1 ? -2 : 0;
    if (owner === ENGINE && method === 0x28) {voiceAttempts++; put(m, args[1], VOICE); return fixture % 7 === 2 || (fixture % 7 === 3 && voiceAttempts === 1) ? -3 : 0;}
    if (owner === ENGINE && method === 0x10) {
      if (fixture % 7 === 4) return -4;
      m.write('Device '+fixture+'\0', args[2] + 0x200, 'utf16le'); m.writeUInt16LE(2 + fixture % 5, args[2] + 0x406); put(m, args[2] + 0x418, 3); return 0;
    }
    if (owner === VOICE && method === 0) {for (const [offset, value] of [[0, 0], [4, 2], [8, 48000]]) put(m, args[1] + offset, value); return 0;}
    if ((owner === ENGINE && [8, 0x30].includes(method)) || (owner === VOICE && method === 0x48)) return 0;
    throw Error(`Unexpected XAudio2 COM ${owner.toString(16)}/${method.toString(16)}`);
  };
  return {...base, platformCall, xAudio2Call};
}
const extraImports = [[0x56e16c, 'IsProcessorFeaturePresent', 1, true], [0x56e714, 'CoCreateInstance', 5, true], [0x56e194, 'WideCharToMultiByte', 8, true], [0x56e66c, 'X3DAudioInitialize', 3, false], [0x56e470, 'operatorDeleteArray', 1, false]];
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); p.initializeMemory(memory); memory.fill(0x36, S - 0x7000, S + 128); memory.fill(0x43, OBJECT, OBJECT + 0xd78); put(memory, S, -1);
  assert.deepEqual(initializeXAudioManagerConstants(Buffer.from(memory)), memory, 'Exact original GUID/format/vtable initializer matches retained bytes.');
  put(memory, 0x5ed314, 0x4a0780); put(memory, 0x714afc, 0x715b30); memory[0x715b54] = 1; put(memory, 0x714b18, fixture % 2); put(memory, 0x714b1c, 17);
  for (const a of [0x716b78, 0x716b7c, 0x716b80]) put(memory, a, 0);
  soundManagerImports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16)); extraImports.forEach(([slot], i) => put(memory, slot, 0x770000 + i * 16));
  put(memory, ENGINE, 0x601000); put(memory, VOICE, 0x603000);
  const methods = [[ENGINE, 8, 1], [ENGINE, 0x10, 3], [ENGINE, 0x14, 3], [ENGINE, 0x28, 7], [ENGINE, 0x30, 1], [VOICE, 0, 2], [VOICE, 0x48, 1]];
  methods.forEach(([owner, offset], i) => put(memory, ptr(memory, owner) + offset, 0x780000 + i * 16));
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  const databases = fixture % 2 === 1, source = world(memory, fixture, databases), native = world(machine.bytes, fixture, databases);
  installSoundManagerInstructionServices(machine, native);
  extraImports.forEach(([slot, name, count, stdcall], i) => {
    put(machine.bytes, slot, 0x770000 + i * 16);
    machine.externalCalls.set(0x770000 + i * 16, state => {const args = Array.from({length: count}, (_, j) => ptr(state.bytes, state.r.ESP + j * 4)); state.r.EAX = name === 'operatorDeleteArray' ? native.libraryCall(name, args) : native.platformCall(name, args); if (stdcall) state.r.ESP += count * 4;});
  });
  methods.forEach(([owner, method, count], i) => machine.externalCalls.set(0x780000 + i * 16, state => {state.r.EAX = native.xAudio2Call(owner, method, Array.from({length: count}, (_, j) => ptr(state.bytes, state.r.ESP + j * 4))); state.r.ESP += count * 4;}));
  const regs = {EBX: 0x121212, EBP: 0x131313, ESI: 0x141414, EDI: 0x151515};
  try {
    const result = constructXAudioManager(OBJECT, {memory, scratchBase: S, entryRegisters: regs, sehWord: 0x12345678, services: source});
    machine.entry = 0x4b0eb0; machine.r.ESP = S; machine.r.ECX = OBJECT; Object.assign(machine.r, regs); steps += machine.run(10000000);
    assert.equal(machine.fs0, 0x12345678); assert.equal(machine.r.EAX >>> 0, result >>> 0);
    const a = memory.subarray(0x10000), b = machine.bytes.subarray(0x10000);
    if (!a.equals(b)) {const d = b.findIndex((v, i) => v !== a[i]) + 0x10000; assert.fail(`byte0x${d.toString(16)} native${machine.bytes.subarray(d, d + 16).toString('hex')} source${memory.subarray(d, d + 16).toString('hex')}`);}
    assert.deepEqual(memory.subarray(S - 60 + 12, S - 60 + 16), machine.bytes.subarray(S - 60 + 12, S - 60 + 16), 'native COM out parameter');
    const logical = calls => calls.filter(([name]) => !['memmove', 'memcpy'].includes(name)); assert.deepEqual(logical(source.calls), logical(native.calls));
  } catch (error) {console.error({fixture, source: source.calls, native: native.calls}); throw error;}
  comCalls += source.calls.filter(([name]) => name === 'XAudio2 COM').length; successes += Number(ptr(memory, OBJECT + 0x918) !== 0);
}
const sourcePath = 'src/xaudio-manager-construction.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, comCalls, successes, source: {path: sourcePath, sha256: createHash('sha256').update(await readFile(sourcePath)).digest('hex')}, targetSha256: p.sha256, method: 'Actual4b0eb0 XAAudioManager with actualbase/core/three database loaders, debugger/category, wide name/cache/destruction. Genuine CRT/Win32/XAudio2 COM and X3DAudioInitialize boundaries only. Allmappedbytes>=10000h, EAX, restoredTLS, nativeCOMoutparameter and ordered non-copy services compare; copy effects remain checked by memory. Fixtures include SSE feature gates, COM/Initialize failure, masteringvoice48000→default fallback/failure, devicedetails failure, cleanup, devicechannels and loaded/missing/invalid/read-failed synthetic database files. Application debugger is an explicitly initialized singleton; arbitrary privateframe aliases, CRT exceptions, realaudio/thread execution and fullbootstrap not claimed.'};
report.constants = {path: 'src/xaudio-manager-constants.json', sha256: createHash('sha256').update(await readFile('src/xaudio-manager-constants.json')).digest('hex')};
const output = process.argv[3] ?? 'analysis/xaudio-manager-construction-native-device-name-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
