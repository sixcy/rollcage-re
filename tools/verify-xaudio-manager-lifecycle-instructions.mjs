import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {soundManagerImports, createSoundManagerServices} from './verify-sound-manager-construction-instructions.mjs';
import {createGameAudioFilePathServices} from './verify-game-audio-file-paths-instructions.mjs';
import {initializeXAudioManager, releaseXAudioManager} from '../src/xaudio-manager-lifecycle.mjs';
import {initializeXAudioManagerConstants} from '../src/xaudio-manager-construction.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, ENGINE = 0x600000, VOICE = 0x602000;
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), fixtures = Number(process.argv[2] ?? 420), reached = new Set(), visits = {}, by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
const watched = [0x4a5710, 0x4b0eb0, 0x4a5d50, 0x4b1dd0, 0x4a7d70, 0x4a7460, 0x4a33c0, 0x4b11d0, 0x4b11f0, 0x4a5e70, 0x4a5ad0, 0x4ad8f0, 0x4aa250];
machine.onInstruction = address => {reached.add(address); if (watched.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; const [i, next] = by.get(address); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
const extras = [[0x56e16c, 'IsProcessorFeaturePresent', 1, true], [0x56e714, 'CoCreateInstance', 5, true], [0x56e194, 'WideCharToMultiByte', 8, true], [0x56e66c, 'X3DAudioInitialize', 3], [0x56e470, 'operatorDeleteArray', 1], [0x56e2c8, '_wcsicmp', 2], [0x56e2bc, '_wcslwr_s', 2], [0x56e23c, 'free', 1], [0x56e084, 'FindFirstFileW', 2, true], [0x56e110, 'FindClose', 1, true], [0x56e114, 'QueryPerformanceFrequency', 1, true], [0x56e0fc, 'QueryPerformanceCounter', 1, true], [0x56e2c0, '_beginthreadex', 6], [0x56e128, 'SetThreadPriority', 2, true], [0x56e124, 'ResumeThread', 1, true], [0x56e0a4, 'SetEvent', 1, true], [0x56e0a0, 'WaitForSingleObject', 2, true], [0x56e098, 'DeleteCriticalSection', 1, true]];
const imports = [...soundManagerImports, ...extras], methods = [[ENGINE, 8, 1], [ENGINE, 0x10, 3], [ENGINE, 0x14, 3], [ENGINE, 0x28, 7], [ENGINE, 0x30, 1], [VOICE, 0, 2], [VOICE, 0x48, 1]];
let steps = 0, successful = 0, failed = 0, shutdowns = 0;
function world(m, fixture) {
  const base = createSoundManagerServices(m, 0), paths = createGameAudioFilePathServices(m, {fixture}), calls = base.calls;
  const wide = p => {let e = p; while (m.readUInt16LE(e)) e += 2; return m.toString('utf16le', p, e);}; let voiceAttempts = 0, qpc = 0;
  return {calls, libraryCall(name, args, r) {
    if (name === '_wcsicmp') {calls.push([name, ...args]); const a = wide(args[0]).toLowerCase(), b = wide(args[1]).toLowerCase(); return a === b ? 0 : a < b ? -1 : 1;}
    if (name === '_wcslwr_s') {calls.push([name, ...args]); m.write(wide(args[0]).toLowerCase() + '\0', args[0], 'utf16le'); return 0;}
    if (name === 'free') {calls.push([name, ...args]); return 0;}
    if (name === '__RTDynamicCast') {calls.push([name, ...args]); return args[0];}
    if (name === '_beginthreadex') {calls.push([name, ...args]); put(m, args[5], 0x4567 + fixture); return fixture % 11 === 1 ? 0 : 0x680000;}
    return base.libraryCall(name, args, r);
  }, platformCall(name, args, r) {
    if (['FindFirstFileW', 'FindClose'].includes(name)) {const n = paths.trace.length, result = paths.platformCall(name, args, r); calls.push(...paths.trace.slice(n)); return result;}
    if (!['IsProcessorFeaturePresent', 'CoCreateInstance', 'WideCharToMultiByte', 'X3DAudioInitialize', 'QueryPerformanceFrequency', 'QueryPerformanceCounter', 'SetThreadPriority', 'ResumeThread', 'SetEvent', 'WaitForSingleObject', 'DeleteCriticalSection'].includes(name)) return base.platformCall(name, args, r);
    calls.push([name, ...args.map(v => v >>> 0)]);
    if (name === 'CoCreateInstance') {if (fixture % 7 === 0) return -1; put(m, args[4], ENGINE); return 0;}
    if (name === 'WideCharToMultiByte') {for (let i = 0; i < args[3]; i++) m[args[4] + i] = m.readUInt16LE(args[2] + i * 2) & 255; return args[3];}
    if (name === 'X3DAudioInitialize') {m.fill(0x71, args[2], args[2] + 20); return 0;}
    if (name === 'QueryPerformanceFrequency') {m.writeBigUInt64LE(1000000n, args[0]); return 1;}
    if (name === 'QueryPerformanceCounter') {m.writeBigUInt64LE(BigInt(100000 + fixture * 7919 + qpc++ * 1234567), args[0]); return 1;}
    if (name === 'WaitForSingleObject') return 0;
    return 1;
  }, xAudio2Call(owner, method, args) {
    calls.push(['XAudio2 COM', owner, method, ...args]);
    if (owner === ENGINE && method === 0x14) return fixture % 7 === 1 ? -2 : 0;
    if (owner === ENGINE && method === 0x28) {voiceAttempts++; put(m, args[1], VOICE); return fixture % 7 === 2 || fixture % 7 === 3 && voiceAttempts === 1 ? -3 : 0;}
    if (owner === ENGINE && method === 0x10) {if (fixture % 7 === 4) return -4; m.write('Device\0', args[2] + 0x200, 'utf16le'); m.writeUInt16LE(2 + fixture % 4, args[2] + 0x406); put(m, args[2] + 0x418, 3); return 0;}
    if (owner === VOICE && method === 0) {put(m, args[1], 0); put(m, args[1] + 4, 2); put(m, args[1] + 8, 48000); return 0;}
    if (owner === ENGINE && [8, 0x30].includes(method) || owner === VOICE && method === 0x48) return 0;
    throw Error(`Unexpected lifecycle COM ${owner.toString(16)}/${method.toString(16)}`);
  }};
}
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); assert.deepEqual(initializeXAudioManagerConstants(Buffer.from(memory)), memory);
  memory.fill(0x57, S - 0x7000, S + 128); put(memory, S, -1); put(memory, 0x5ed314, 0x4a0780); put(memory, 0x715b08, 3); put(memory, 0x714afc, 0x715b30); put(memory, 0x714b18, 1); put(memory, 0x714b1c, 99);
  imports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16)); put(memory, ENGINE, 0x601000); put(memory, VOICE, 0x603000); methods.forEach(([owner, offset], i) => put(memory, ptr(memory, owner) + offset, 0x780000 + i * 16));
  const source = world(memory, fixture), native = world(machine.bytes, fixture); machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  imports.forEach(([, name, n, platform], i) => machine.externalCalls.set(0x760000 + i * 16, cpu => {cpu.r.EAX = native[platform || name === 'X3DAudioInitialize' ? 'platformCall' : 'libraryCall'](name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); if (platform) cpu.r.ESP += n * 4;}));
  for (const [address, name, n] of [[0x568a50, 'memset', 3], [0x568a48, 'memcpy', 3], [0x56832a, 'registerExit', 1], [0x56932a, '__RTDynamicCast', 5]]) machine.externalCalls.set(address, cpu => {cpu.r.EAX = native.libraryCall(name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});});
  machine.externalCalls.set(0x568980, cpu => {cpu.r.ESP -= cpu.r.EAX;}); machine.externalCalls.set(0x568162, () => {});
  for (const [address, kind] of [[0x5689e0, 'unsignedDivide'], [0x569380, 'signedDivide'], [0x568f10, 'multiply']]) machine.externalCalls.set(address, cpu => {const a = cpu.bytes[kind === 'signedDivide' ? 'readBigInt64LE' : 'readBigUInt64LE'](cpu.r.ESP), b = cpu.bytes[kind === 'signedDivide' ? 'readBigInt64LE' : 'readBigUInt64LE'](cpu.r.ESP + 8), result = BigInt.asUintN(64, kind === 'multiply' ? a * b : a / b); cpu.r.EAX = Number(result & 0xffffffffn) | 0; cpu.r.EDX = Number(result >> 32n) | 0; cpu.r.ESP += 16;});
  methods.forEach(([owner, offset, n], i) => machine.externalCalls.set(0x780000 + i * 16, cpu => {cpu.r.EAX = native.xAudio2Call(owner, offset, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4))); cpu.r.ESP += n * 4;}));
  const registers = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545}, runtime = {memory, scratchBase: S, entryRegisters: registers, sehWord: 0x12345678, nativePointerVector: true, nativeDequeCopies: true, services: source};
  try {
    initializeXAudioManager(runtime); machine.entry = 0x4a5710; machine.r.ESP = S; Object.assign(machine.r, registers); steps += machine.run(10_000_000);
    const compare = ranges => {assert.equal(machine.fs0, 0x12345678); assert.deepEqual(source.calls, native.calls, 'ordered lifecycle services'); for (const [begin, end] of ranges) {const a = memory.subarray(begin, end), b = machine.bytes.subarray(begin, end); if (!a.equals(b)) {const i = a.findIndex((v, i) => v !== b[i]), p = begin + i; assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 24).toString('hex')} source${memory.subarray(p, p + 24).toString('hex')}`);}}};
    compare([[0x10000, memory.length], [S - 20, S]]);
    const manager = ptr(memory, 0x714b08);
    if (manager) {
      successful++; memory.fill(0x57, S - 0x7000, S + 128); machine.bytes.fill(0x57, S - 0x7000, S + 128); put(memory, S, -1); put(machine.bytes, S, -1); put(memory, S + 4, 1); put(machine.bytes, S + 4, 1);
      const result = releaseXAudioManager(manager, 1, runtime); machine.entry = 0x4b11d0; machine.r.ESP = S; machine.r.ECX = manager; Object.assign(machine.r, registers); steps += machine.run(10_000_000);
      assert.equal(machine.r.EAX >>> 0, result >>> 0); compare([[0x10000, memory.length], [S - 0x7000, S + 8]]); shutdowns++;
    } else failed++;
  } catch (error) {console.error({fixture, sourceLast: source.calls.slice(-12), nativeLast: native.calls.slice(-12)}); throw error;}
}
const path = 'src/xaudio-manager-lifecycle.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, actualGameCalls: visits, successful, failed, shutdowns, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4a5710 factory→4b0eb0/base/database/device→real4a5d50 polling/mixers/queuedsource/empty-format sample/thread; COM/init/voice/details failures execute real4b11d0/4b11f0 destruction. Every successful manager is then actually released through stop/source/cache/listener/mixer/voice/base cleanup. Allmapped>=10000h, outer20-byte factory frame and ordered genuine CRT/Win32/XAudio2 calls/TLS compare; successful shutdown also compares complete28KiB private stack after declared caller scratch normalization. Initialized debugger/category, missing database files, valid outer allocation and synthetic device/thread handles define this domain; constructor descendants retain their separate private-frame proofs. Genuine _beginthreadex never executes asynchronous4a6600 game update. No original process/audio-device execution, hidden game contracts, arbitrary allocator failure or library-internal claim.'};
const output = process.argv[3] ?? 'analysis/xaudio-manager-lifecycle-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
