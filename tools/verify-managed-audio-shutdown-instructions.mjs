import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {pumpManagedAudioMessages, waitForManagedAudioThread, destroyManagedAudioThread, destroyManagedAudioPollThread, releaseManagedAudioThread} from '../src/managed-audio-shutdown.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x1f000, OBJECT = 0x100000;
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), fixtures = Number(process.argv[2] ?? 1800), reached = new Set(), visits = {};
const entries = [0x4a3690, 0x4a35a0, 0x4a34e0, 0x4a36f0, 0x4a34a0, 0x4a34c0];
const by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
machine.onInstruction = address => {reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; const [i, next] = by.get(address); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
const imports = [[0x56e0a4, 'SetEvent', 1], [0x56e0bc, 'CloseHandle', 1], [0x56e0a0, 'WaitForSingleObject', 2], [0x56e0ec, 'TerminateThread', 2], [0x56e5a0, 'PeekMessageW', 5], [0x56e50c, 'TranslateMessage', 1], [0x56e5b0, 'DispatchMessageW', 1], [0x56e0fc, 'QueryPerformanceCounter', 1], [0x56e210, 'operatorDelete', 1, true], [0x56e470, 'operatorDeleteArray', 1, true]];
let steps = 0, waits = 0, messages = 0, terminations = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const selector = fixture % 6, variant = Math.floor(fixture / 6), object = OBJECT, flags = [0, 1, 0x100, 0x101][variant % 4], timeout = [0, 200, 500, -1][variant % 4];
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 4096, S + 128); put(memory, S, -1);
  put(memory, object + 32, variant % 7 === 0 ? 0 : 101); put(memory, object + 40, 201); put(memory, object + 44, 202); put(memory, object + 48, 203); memory[object + 64] = Number(variant % 11 === 0);
  put(memory, object + 28, variant % 3 === 0 ? 0 : 0x120000); put(memory, object + 20, 4); put(memory, object + 24, variant % 2 ? 31 : 15);
  if (variant % 2) {put(memory, object + 4, 0x130000); memory.write('Thread\0', 0x130000);} else memory.write('Work\0', object + 4);
  put(memory, 0x714b04, 0x716dc0); put(memory, 0x716d98, 3); memory.writeBigUInt64LE(1000000n, 0x716de8); memory.writeBigUInt64LE(0n, 0x716df0);
  put(memory, 0x714afc, 0x715b30); put(memory, 0x715b08, 3); memory[0x715b54] = 1;
  imports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16));
  const world = m => {const calls = []; let ticks = 0, peek = 0, wait = 0; return {calls, libraryCall(name, args, r) {calls.push([name, ...args, r?.scratchBase]); if (name === 'operatorDeleteArray' && selector >= 4 && variant % 17 === 0) put(m, S + 4, flags ^ 1); return 0;}, platformCall(name, args, r) {
    calls.push([name, ...args, r?.scratchBase, name === 'QueryPerformanceCounter' ? undefined : r?.targetAddress]);
    if (name === 'QueryPerformanceCounter') {m.writeBigUInt64LE(BigInt(ticks++ * (variant % 5 === 0 ? 2000000 : 100000)), args[0]); return 1;}
    if (name === 'SetEvent') {if (variant % 13 === 0) {put(m, object + 44, 222); m[object + 64] = 1;} if (variant % 19 === 0) r.volatileRegisters.ECX = 0x12344321; return 1;}
    if (name === 'WaitForSingleObject') {wait++; if (variant % 3 === 0 && wait === 1) return 0; if (variant % 3 === 1 && wait === 2) {m[object + 64] = 1; return 0;} return variant % 4 === 0 ? 0xffffffff : 0x102;}
    if (name === 'PeekMessageW') {const present = peek++ % 3 < variant % 3; if (present) {m.fill(0x61 + peek, args[0], args[0] + 28); put(m, args[0] + 4, peek);} return Number(present);}
    if (name === 'DispatchMessageW') {if (variant % 7 === 1) put(m, 0x6e6d18, ptr(m, 0x6e6d18) + 2); return 0;}
    if (name === 'CloseHandle') {if (args[0] === 201 && variant % 5 === 0) {put(m, object + 44, 333); put(m, 0x56e0bc, 0x770000);} return 1;}
    if (['TranslateMessage', 'TerminateThread'].includes(name)) return 1;
    throw Error(name);
  }};};
  const source = world(memory), native = world(machine.bytes), registers = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545};
  const args = selector === 1 ? [timeout, 0x123456] : selector >= 4 ? [flags] : []; args.forEach((v, i) => put(memory, S + 4 + i * 4, v));
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  [...imports, [0, 'CloseHandle', 1]].forEach(([, name, n, library], i) => machine.externalCalls.set(i === imports.length ? 0x770000 : 0x760000 + i * 16, cpu => {
    const volatileRegisters = {ECX: cpu.r.ECX}, targetAddress = i === imports.length ? 0x770000 : 0x760000 + i * 16;
    cpu.r.EAX = native[library ? 'libraryCall' : 'platformCall'](name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4, targetAddress, volatileRegisters}); cpu.r.ECX = volatileRegisters.ECX; if (!library) cpu.r.ESP += n * 4;
  }));
  for (const [address, op] of [[0x5689e0, 'divide'], [0x568f10, 'multiply'], [0x569380, 'signedDivide']]) machine.externalCalls.set(address, cpu => {
    const left = cpu.bytes[op === 'signedDivide' ? 'readBigInt64LE' : 'readBigUInt64LE'](cpu.r.ESP), right = cpu.bytes[op === 'signedDivide' ? 'readBigInt64LE' : 'readBigUInt64LE'](cpu.r.ESP + 8);
    const result = BigInt.asUintN(64, op === 'multiply' ? left * right : left / right); cpu.r.EAX = Number(result & 0xffffffffn) | 0; cpu.r.EDX = Number(result >> 32n) | 0; cpu.r.ESP += 16;
  });
  const runtime = {memory, scratchBase: S, sehWord: 0x12345678, entryRegisters: registers, services: source};
  try {
    let result;
    if (selector === 0) pumpManagedAudioMessages(runtime);
    else if (selector === 1) waitForManagedAudioThread(object, ...args, runtime);
    else if (selector === 2) destroyManagedAudioThread(object, runtime);
    else if (selector === 3) destroyManagedAudioPollThread(object, runtime);
    else result = releaseManagedAudioThread(object, flags, selector === 5, runtime);
    machine.entry = entries[selector]; machine.r.ESP = S; machine.r.ECX = object; Object.assign(machine.r, registers); steps += machine.run(2_000_000);
    assert.equal(machine.fs0, 0x12345678); if (result !== undefined) assert.equal(machine.r.EAX >>> 0, result >>> 0);
    assert.deepEqual(source.calls, native.calls, 'ordered genuine platform/CRT calls with native callee ESP');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 24).toString('hex')} source${memory.subarray(p, p + 24).toString('hex')}`);}
  } catch (error) {console.error({fixture, selector, variant, timeout, flags, source: source.calls, native: native.calls}); throw error;}
  waits += source.calls.filter(([name]) => name === 'WaitForSingleObject').length; messages += source.calls.filter(([name]) => name === 'DispatchMessageW').length; terminations += source.calls.filter(([name]) => name === 'TerminateThread').length;
}
const path = 'src/managed-audio-shutdown.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, waits, messages, terminations, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4a3690 message pump,4a35a0 signed timeout wait,4a34e0/4a36f0 thread/poll destruction and4a34a0/4a34c0 deleting wrappers, through actual stopwatch reads and initialized application-debugger singleton. Full10MiB including native frames/SEH, returns and ordered genuine CRT/Win32 requests with calleeESP/captured platform IAT compare. Null handles, completion before/during wait, signaled/timeout/failed waits, message dispatch, forced termination, inline/heap strings and separately owned ANSI cache are exercised. SetEvent may clobberECX/change completion/event fields; CloseHandle may change next event and IAT; array deletion may change the outer deleting flag. Services are synthetic and do not start/terminate any host thread, dispatch real messages or execute original process. Exceptions and arbitrary volatile-register clobbers beyond the explicitSetEventECX fixture remain open.'};
const output = process.argv[3] ?? 'analysis/managed-audio-shutdown-live-callback-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
