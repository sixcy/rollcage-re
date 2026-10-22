import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameAudioSampleFactoryServices} from './verify-game-audio-sample-factory-instructions.mjs';
import {createWaveFixture} from './verify-game-audio-wave-decoder-instructions.mjs';
import {prepareGameAudioSamplePlayback} from '../src/audio-sample-stream-reopen.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), S = 0x1f000, OBJECT = 0x100000, DECODER = 0x110000, MANAGER = 0x120000, VOICE = 0x180000, TABLE = 0x181000;
const fixtures = Number(process.argv[2] ?? 1200), reached = new Set(), visits = {}, by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
const warmCategory = process.argv.includes('--warm');
const streaming = !process.argv.includes('--no-streaming');
machine.onInstruction = p => {reached.add(p); if ([0x4addc0, 0x40cf70, 0x4a7fc0, 0x4b48f0, 0x4af2a0, 0x4b4720, 0x4aefc0, 0x4ad580, 0x4ad5b0, 0x4a91d0, 0x4a1840, 0x4b4a00, 0x4b3ae0, 0x4b3bb0, 0x4af880].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1; const [i, next] = by.get(p); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
const imports = [[0x56e47c, 'wcsncpy_s', 4], [0x56e21c, 'strncpy_s', 4], [0x56e218, 'wcscat_s', 3], [0x56e2b8, 'wcscpy_s', 3], [0x56e2b4, 'wcsstr', 2], [0x56e2c4, 'wcsncmp', 3], [0x56e2bc, '_wcslwr_s', 2], [0x56e2b0, 'vswprintf_s', 4], [0x56e2c8, '_wcsicmp', 2], [0x56e220, 'operatorNew', 1], [0x56e258, 'allocate', 1], [0x56e210, 'operatorDelete', 1], [0x56e23c, 'free', 1], [0x56e474, 'operatorNewArray', 1], [0x56e470, 'operatorDeleteArray', 1], [0x56e478, 'memmove', 3], [0x56e084, 'FindFirstFileW', 2, true], [0x56e110, 'FindClose', 1, true], [0x56e07c, 'CreateFileW', 7, true], [0x56e0e4, 'GetLastError', 0, true], [0x56e0cc, 'Sleep', 1, true], [0x56e078, 'GetFileSizeEx', 2, true], [0x56e100, 'ReadFile', 5, true], [0x56e198, 'SetFilePointerEx', 5, true], [0x56e1ac, 'GetOverlappedResult', 4, true], [0x56e1b0, 'CancelIo', 1, true], [0x56e0bc, 'CloseHandle', 1, true], [0x56e08c, 'InitializeCriticalSectionAndSpinCount', 2, true], [0x56e094, 'EnterCriticalSection', 1, true], [0x56e09c, 'GetCurrentThreadId', 0, true], [0x56e090, 'LeaveCriticalSection', 1, true], [0x56e17c, 'TryEnterCriticalSection', 1, true]];
let steps = 0, comCalls = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 0x8000, S + 128); put(memory, S, -1);
  put(memory, OBJECT, 0x5d3f60); put(memory, OBJECT + 0x948, [0, 1, 2, 3, 4, 0x12345678][fixture % 6]); put(memory, OBJECT + 0x94c, [0, 1, 2, 3, 4][Math.floor(fixture / 6) % 5]); put(memory, OBJECT + 0x968, fixture % 7 ? DECODER : 0); put(memory, OBJECT + 0x97c, VOICE); memory.write('Demo.WAV\0', OBJECT + 0x34, 'utf16le');
  put(memory, DECODER, 0x5d4280); put(memory, DECODER + 8, OBJECT); put(memory, DECODER + 0xa4, 0x130000); put(memory, 0x130000, 0x131000); put(memory, 0x130004, 0x131004); put(memory, 0x130008, 0x131004); put(memory, 0x131000, 0x132000); put(memory, 0x132000, 0x133000); put(memory, DECODER + 0xdc, 0x134000); put(memory, DECODER + 0x64, fixture % 2 ? -1 : 101); memory.writeUInt16LE(1, DECODER + 0x80); memory.writeUInt16LE(2, DECODER + 0x82); put(memory, DECODER + 0x84, 44100); memory.writeUInt16LE(16, DECODER + 0x8e); memory.writeUInt16LE(18, DECODER + 0x90);
  if (streaming && Math.floor(fixture / 30) % 2 === 0) {
    const buffer = 0x140000, deque = buffer + 0x70, sentinel = 0x150000, map = 0x151000;
    put(memory, DECODER + 12, buffer); memory[DECODER + 0x92] = 1;
    put(memory, buffer, 0x5d4218); put(memory, buffer + 4, OBJECT); memory.writeUInt16LE(1, buffer + 8); memory.writeUInt16LE(2, buffer + 10); put(memory, buffer + 12, 44100); put(memory, buffer + 16, 176400); memory.writeUInt16LE(4, buffer + 20); memory.writeUInt16LE(16, buffer + 22); memory.writeUInt16LE(18, buffer + 24);
    put(memory, buffer + 0x20, 0x200000); put(memory, buffer + 0x30, 16); put(memory, buffer + 0x34, 64); put(memory, deque, sentinel); put(memory, sentinel, deque); put(memory, deque + 4, map); put(memory, deque + 8, 8); put(memory, deque + 16, 16);
    for (let block = 0; block < 8; block++) {const holder = 0x152000 + block * 16; put(memory, map + block * 4, holder); for (let i = 0; i < 4; i++) put(memory, holder + i * 4, 0x200000 + (block * 4 + i) * 0x100);}
    put(memory, buffer + 0x84, 0x160000); put(memory, buffer + 0x88, 0x160000); put(memory, buffer + 0x8c, 0x160080);
  }
  put(memory, 0x714b08, MANAGER); memory.write('C:\\assets\\sounds\0', MANAGER + 0x412, 'utf16le'); put(memory, 0x715b08, 3); put(memory, 0x714afc, 0x715b30); memory[0x715b54] = 1; put(memory, 0x714b18, warmCategory || fixture % 3 ? 1 : 0); put(memory, 0x714b1c, 123); put(memory, 0x5ed314, 0x4a0780);
  for (const voice of [VOICE, VOICE + 0x100]) put(memory, voice, TABLE);
  for (const [index, slot] of [0x58, 0x64, 0x54].entries()) put(memory, TABLE + slot, 0x780000 + index * 16);
  imports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16));
  const file = createWaveFixture(fixture);
  const world = m => {
    const base = createGameAudioSampleFactoryServices(m, {fixture}), calls = []; let cursor = 0, heap = 0x300000;
    return {calls, libraryCall(name, args, r) {
      calls.push([name, ...args, r.scratchBase]);
      if (['operatorNew', 'operatorNewArray', 'allocate'].includes(name)) {const p = heap; heap = heap + args[0] + 31 & ~15; assert(heap < 0x600000); m.fill(0xcd, p, heap); return p;}
      if (name === 'vsprintf_s') {let end = args[2], index = 0; while (m[end]) end++; const text = m.toString('latin1', args[2], end).replace(/%[du]/g, specifier => {const value = ptr(m, args[3] + index++ * 4); return String(specifier === '%d' ? value | 0 : value);}); assert(text.length < args[1]); m.write(text + '\0', args[0], 'latin1'); return text.length;}
      return base.libraryCall(name, args, r);
    }, platformCall(name, args, r) {
      calls.push([name, ...args, r.scratchBase]);
      if (name === 'ReadFile') {const n = Math.min(args[2], Math.max(0, file.length - cursor)); if (n) file.copy(m, args[1], cursor, cursor + n); cursor += n; put(m, args[3], n); return 1;}
      if (name === 'GetFileSizeEx') {m.writeBigUInt64LE(BigInt(file.length), args[1]); return 1;}
      if (name === 'SetFilePointerEx') {cursor = Number(BigInt.asIntN(64, BigInt(args[1]) | BigInt(args[2]) << 32n)); if (args[3]) m.writeBigInt64LE(BigInt(cursor), args[3]); return 1;}
      if (name === 'TryEnterCriticalSection') return 1;
      const result = base.platformCall(name, args, r); if (name === 'CreateFileW' && (result | 0) !== -1) cursor = 0; return result;
    }, xAudio2Call(owner, slot, args, r) {
      calls.push(['XAudio2 COM', owner, slot, ...args, r.scratchBase]);
      if (slot === 0x58 && fixture % 17 === 2) put(m, OBJECT + 0x97c, VOICE + 0x100);
      if (slot === 0x64) {put(m, args[1], args[1] === OBJECT + 0x98c ? Number(fixture % 13 === 3) : 0); put(m, args[1] + 4, 0); m.writeBigUInt64LE(0n, args[1] + 8);}
      return 0;
    }};
  };
  const source = world(memory), native = world(machine.bytes), registers = {EBX: 0x121212 + fixture, EBP: 0x232323 + fixture, ESI: 0x343434 + fixture, EDI: 0x454545 + fixture}; machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  imports.forEach(([, name, n, os], i) => machine.externalCalls.set(0x760000 + i * 16, cpu => {cpu.r.EAX = native[os ? 'platformCall' : 'libraryCall'](name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); if (os) cpu.r.ESP += n * 4;}));
  for (const [index, [slot, n]] of [[0x58, 1], [0x64, 2], [0x54, 3]].entries()) machine.externalCalls.set(0x780000 + index * 16, cpu => {const args = Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)); cpu.r.EAX = native.xAudio2Call(args[0], slot, args, {scratchBase: cpu.r.ESP - 4}); cpu.r.ESP += n * 4;});
  for (const [address, name, n] of [[0x568a48, 'memcpy', 3], [0x568a50, 'memset', 3], [0x56832a, 'registerExit', 1]]) machine.externalCalls.set(address, cpu => {cpu.r.EAX = native.libraryCall(name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});});
  machine.externalCalls.set(0x568980, cpu => {cpu.r.ESP -= cpu.r.EAX;});
  put(memory, 0x56e228, 0x790000); put(machine.bytes, 0x56e228, 0x790000);
  machine.externalCalls.set(0x790000, cpu => {cpu.r.EAX = native.libraryCall('vsprintf_s', Array.from({length: 4}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});});
  machine.externalTailCallAbi.add(0x760000 + imports.findIndex(([, name]) => name === 'LeaveCriticalSection') * 16);
  for (const address of [0x568c5f, 0x568dff, 0x5689e0, 0x568f10]) machine.entries.delete(address);
  machine.externalCalls.set(0x568c5f, cpu => {const result = BigInt.asUintN(64, BigInt(Math.trunc(cpu.scalars.XMM0))); cpu.r.EAX = Number(result & 0xffffffffn) | 0; cpu.r.EDX = Number(result >> 32n) | 0;});
  machine.externalCalls.set(0x5689e0, cpu => {const result = cpu.bytes.readBigUInt64LE(cpu.r.ESP) / cpu.bytes.readBigUInt64LE(cpu.r.ESP + 8); cpu.r.EAX = Number(result & 0xffffffffn) | 0; cpu.r.EDX = Number(result >> 32n) | 0; cpu.r.ESP += 16;});
  machine.externalCalls.set(0x568f10, cpu => {const result = BigInt.asUintN(64, cpu.bytes.readBigUInt64LE(cpu.r.ESP) * cpu.bytes.readBigUInt64LE(cpu.r.ESP + 8)); cpu.r.EAX = Number(result & 0xffffffffn) | 0; cpu.r.EDX = Number(result >> 32n) | 0; cpu.r.ESP += 16;});
  machine.externalCalls.set(0x568dff, cpu => {cpu.scalars.XMM0 = Number(BigInt.asIntN(64, BigInt(cpu.r.ECX >>> 0) | BigInt(cpu.r.EDX >>> 0) << 32n)); cpu.doubleScalars.add('XMM0'); cpu.scalarBits.delete('XMM0'); cpu.qwords.delete('XMM0'); cpu.integerVectors.delete('XMM0'); cpu.zeroVectors.delete('XMM0');});
  try {
    const result = prepareGameAudioSamplePlayback(OBJECT, {memory, scratchBase: S, sehWord: 0x12345678, entryRegisters: registers, services: source});
    machine.entry = 0x4addc0; machine.r.ESP = S; machine.r.ECX = OBJECT; Object.assign(machine.r, registers); steps += machine.run(3000000);
    assert.equal(machine.r.EAX & 255, result); assert.equal(machine.fs0, 0x12345678); assert.deepEqual(source.calls, native.calls, 'ordered genuine services/calleeESP');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`fixture${fixture} byte0x${p.toString(16)} source${memory.subarray(p, p + 24).toString('hex')} native${machine.bytes.subarray(p, p + 24).toString('hex')}`);}
  } catch (error) {console.error({fixture, source: source.calls.slice(-12), native: native.calls.slice(-12)}); throw error;}
  comCalls += source.calls.filter(([name]) => name === 'XAudio2 COM').length;
}
const path = 'src/audio-sample-stream-reopen.mjs', report = {matched: true, fixtures, warmCategory, streaming, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, comCalls, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4addc0 voice flush/GetState and early-buffer rejection, actual40cf70/4a7fc0 path construction, actual4b48f0 WAV/AIFF reset/reopen/parser/PCM population,4029b0 readiness and4aefc0 poll, actual source activity/pending-clear and debugger/category/record producers. All10MiB including private stacks/TLS, AL and ordered genuine CRT/Win32/XAudio2/calleeESP compare. Synthetic caller-owned WAV decoder/session state, file/error variants, cold or initialized category and live voice replacement define this domain. The streaming option adds populated sixteen-block buffers, real decoder reads/resampling/deque recycling/COM submission in alternate fixture batches; the false option keeps null-stream guards. Spectrum-ring and other codec inputs retain their separate proofs. Genuine compiler numeric helpers are admitted CRT boundaries. No game callbacks or original device/process execution.'};
const output = process.argv[3] ?? 'analysis/audio-sample-stream-reopen-populated-connected-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
