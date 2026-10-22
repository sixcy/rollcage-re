import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createAudioListener, constructAudioListener, copyAudioListenerFunction, destroyAudioListenerFunction, releaseAudioListenerFunctionBase} from '../src/audio-listener-construction.mjs';
import {initializeRaceAudioListeners} from '../src/audio-listeners.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p), S = 0x9000, MANAGER = 0x100000, OUTPUT = 0x120000, CALLBACK = 0x140000;
const entries = [0x40f2c0, 0x40f2a0, 0x40eea0, 0x4a9ec0, 0x4a9b00, 0x485130], fixtures = Number(process.argv[2] ?? 1800), reached = new Set(), visits = {};
const returns = new Map([[0x4a9b27, 0x4a9b2d], [0x4a9b96, 0x4a9b9c], [0x4a9b9c, 0x4a9ba2], [0x4a9bdf, 0x4a9be5], [0x40f2cd, 0x40f2d3], [0x40f2b2, 0x40f2b8], [0x40eeb1, 0x40eeb7], [0x40f0a2, 0x40f0a8], [0x40f0ba, 0x40f0c0], [0x48457b, 0x484580], [0x4846d9, 0x4846df], [0x484717, 0x48471c], [0x40f0fc, 0x40f102], [0x40f125, 0x40f12b], [0x40f143, 0x40f149]]);
machine.onInstruction = p => {reached.add(p); if (returns.has(p)) put(machine.bytes, machine.r.ESP - 4, returns.get(p)); if ([...entries, 0x484560, 0x40ebc0, 0x40f060].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
let steps = 0, requests = 0, allocations = 0, frees = 0;
function services(m, variant) {
  const calls = []; let cursor = 0x300000;
  const libraryCall = (name, args) => {
    calls.push([name, ...args.map(v => v >>> 0)]);
    if (name === 'operatorNew') {if (args[0] === 0x58 && variant % 17 === 7) return 0; const result = cursor; cursor += (args[0] + 31) & ~15; assert(cursor < 0x400000); m.fill(0xcd, result, cursor); return result;}
    if (name === 'operatorDelete') return 0;
    if (name === 'memcpy' || name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); return args[0];}
    if (name === 'memset') {m.fill(args[1] & 255, args[0], args[0] + args[2]); return args[0];}
    throw Error(`Unexpected listener construction CRT ${name}`);
  };
  return {calls, libraryCall, platformCall(name, args) {calls.push([name, ...args]); if (name === 'GetCurrentThreadId') return 27 + variant; return 1;}};
}
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, S - 2048, S + 128); put(memory, S, -1);
  const variant = Math.floor(fixture / entries.length), entry = entries[fixture % entries.length];
  put(memory, MANAGER, 0x5d4190); put(memory, 0x714b08, MANAGER); put(memory, MANAGER + 0x82c, 0x130000);
  const length = variant % 3; put(memory, 0x130000, 0x131000); put(memory, 0x130004, 0x131000 + length * 4); put(memory, 0x130008, 0x131000 + (length + variant % 2) * 4);
  for (let i = 0; i < length; i++) put(memory, 0x131000 + i * 4, 0x150000 + i * 0x100);
  put(memory, MANAGER + 0x86c, variant % 2); put(memory, MANAGER + 0x870, 99);
  put(memory, 0x714b38, variant % 2); for (let i = 0; i < 4; i++) put(memory, 0x714b28 + i * 4, 0x3f000000 + i * 0x100000);
  put(memory, CALLBACK, 0x5d0304); put(memory, CALLBACK + 4, variant % 6);
  const inline = variant % 3 === 0, words = [0x5d0304, variant % 6, 0xaabbccdd, 0x11223344, variant % 11 === 4 ? 0 : inline ? S + 8 : CALLBACK, 0x55667788];
  put(memory, 0x5ecb1c, 0x170000); memory[0x170552] = variant % 7;
  for (let i = 0; i < 4; i++) {put(memory, 0x5ec120 + i * 4, i); put(memory, 0x909318 + i * 0x30c, 0x180000 + i * 4); put(memory, 0x180000 + i * 4, 0x200000 + i * 0x1000);}
  put(memory, 0x6f2408, 0x190000); put(memory, 0x6f240c, 0x190000); put(memory, 0x6f2410, 0x190000 + variant % 5 * 4);
  for (const [slot, address] of [[0x56e220, 0x760000], [0x56e210, 0x760010], [0x56e478, 0x760020], [0x56e094, 0x760030], [0x56e090, 0x760040], [0x56e09c, 0x760050]]) put(memory, slot, address);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  const source = services(memory, variant), native = services(machine.bytes, variant), registers = {EBX: fixture + 0x121212, EBP: fixture + 0x131313, ESI: fixture + 0x141414, EDI: fixture + 0x151515};
  for (const [address, name, count, platform] of [[0x760000, 'operatorNew', 1], [0x760010, 'operatorDelete', 1], [0x760020, 'memmove', 3], [0x760030, 'EnterCriticalSection', 1, true], [0x760040, 'LeaveCriticalSection', 1, true], [0x760050, 'GetCurrentThreadId', 0, true], [0x568a48, 'memcpy', 3], [0x568a50, 'memset', 3]]) machine.externalCalls.set(address, state => {
    const args = Array.from({length: count}, (_, i) => ptr(state.bytes, state.r.ESP + i * 4)); state.r.EAX = platform ? native.platformCall(name, args) : native.libraryCall(name, args); if (platform) state.r.ESP += count * 4;
  });
  const runtime = {memory, scratchBase: S, services: source, entryRegisters: registers, sehWord: 0x12345678};
  let result, ecx, stack, returnsEax = true;
  switch (entry) {
    case 0x40f2c0: ecx = CALLBACK; stack = [variant % 2 ? OUTPUT : 0]; result = copyAudioListenerFunction(CALLBACK, stack[0], runtime); break;
    case 0x40f2a0: ecx = CALLBACK; stack = [variant % 3]; destroyAudioListenerFunction(CALLBACK, stack[0], runtime); returnsEax = false; break;
    case 0x40eea0: ecx = CALLBACK; stack = [variant % 3]; result = releaseAudioListenerFunctionBase(CALLBACK, stack[0], runtime); break;
    case 0x4a9ec0: ecx = OUTPUT; stack = [variant % 3, ...words]; result = constructAudioListener(OUTPUT, stack[0], words, runtime); break;
    case 0x4a9b00: ecx = MANAGER; stack = [variant % 3, ...words]; result = createAudioListener(MANAGER, stack[0], words, runtime); break;
    case 0x485130: ecx = 0; stack = []; initializeRaceAudioListeners(runtime); returnsEax = false; break;
  }
  machine.entry = entry; machine.r.ESP = S; machine.r.ECX = ecx; Object.assign(machine.r, registers); stack.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v));
  try {
    steps += machine.run(2_000_000); assert.equal(machine.fs0, 0x12345678); if (returnsEax) assert.equal(machine.r.EAX >>> 0, result >>> 0);
    const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000);
    if (!actual.equals(expected)) {const p = actual.findIndex((v, i) => v !== expected[i]); assert.fail(`byte0x${(p + 0x10000).toString(16)} native${actual[p]} source${expected[p]}`);}
    const logical = calls => calls.filter(([name]) => !['memcpy', 'memmove'].includes(name)); assert.deepEqual(source.calls.filter(([name]) => !['memcpy', 'memmove'].includes(name)), logical(native.calls), 'Ordered real CRT/Win32 requests');
  } catch (error) {console.error({fixture, entry: entry.toString(16), variant, words, source: source.calls, native: native.calls}); throw error;}
  requests += source.calls.length; allocations += source.calls.filter(([name]) => name === 'operatorNew').length; frees += source.calls.filter(([name]) => name === 'operatorDelete').length;
}
const path = 'src/audio-listener-construction.mjs';
const report = {matched: true, method: 'Actual485130→484560→concrete SoundManager virtual4c=4a9b00→4a9ec0 Listener, actual captured-function copy40f2c0/destroy40f2a0/base40eea0, actual40ebc0/40edc0/40f060 vector ownership and402100/4020e0/4020c0 defaults. No game-call contracts; genuine CRT allocation/copies and Win32 critical-section/thread services only. All mapped bytes>=10000h, relevant EAX, restored TLS and ordered CRT/Win32 requests compare, including retired callable vtables and complete listener storage. Synthetic initialized-manager/vector inputs, primary selection, null listener allocation, callback inline/heap/null ownership, vector growth and existing/default global quaternion. Manager/bootstrap/XAudio2 device construction and callback invocation during updates remain separate producers/consumers. Arbitrary private-frame aliases and original-process execution are not established.', fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, requests, allocations, frees, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256};
const output = process.argv[3] ?? 'analysis/audio-listener-construction-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
