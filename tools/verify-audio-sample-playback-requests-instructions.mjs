import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {soundManagerImports, createSoundManagerServices} from './verify-sound-manager-construction-instructions.mjs';
import {requestGameAudioSamplePlayback} from '../src/audio-sample-playback-requests.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const S = 0x1f000, OBJECT = 0x100000, MANAGER = 0x110000, ALTERNATE = 0x120000, ARRAY = 0x140000, F = ((S - 4) & ~7) - 0x38;
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), fixtures = Number(process.argv[2] ?? 1200), reached = new Set(), visits = {};
const by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
machine.onInstruction = p => {reached.add(p); if ([0x4ad9e0, 0x4a2b40, 0x405310, 0x405860, 0x4a2290, 0x4a1840, 0x40ebc0].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1; const [i, next] = by.get(p); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
const imports = [...soundManagerImports, [0x56e228, 'vsprintf_s', 4], [0x56e470, 'operatorDeleteArray', 1]];
let steps = 0, queued = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 0x6000, S + 128); put(memory, S, -1);
  memory.write(['', 'SFX_ENGINE', 'Longer playback request sample'][fixture % 3] + '\0', OBJECT + 4, 'latin1');
  put(memory, OBJECT + 0x97c, fixture % 5 ? 0x170000 : 0); put(memory, OBJECT + 0x94c, 0x12345678); memory[OBJECT + 0x950] = 0xcd;
  put(memory, 0x714b08, MANAGER); put(memory, 0x715b08, 3); put(memory, 0x714afc, 0x715b30); memory[0x715b54] = 1; put(memory, 0x714b18, fixture % 3 ? 1 : 0); put(memory, 0x714b1c, 123);
  for (const [index, manager] of [MANAGER, ALTERNATE].entries()) {const header = manager + 0x2000, array = ARRAY + index * 0x100; put(memory, manager + 0x83c, header); put(memory, header, array); put(memory, header + 4, array + (fixture % 2) * 4); put(memory, header + 8, array + (fixture % 2 + fixture % 3) * 4); put(memory, array, 0x180000); put(memory, manager + 0x88c, fixture % 4);}
  imports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16));
  const world = m => {
    const base = createSoundManagerServices(m, 0), calls = [], text = p => {let e = p; while (m[e]) e++; return m.toString('latin1', p, e);};
    return {calls, libraryCall(name, args, r) {
      calls.push([name, ...args, r.scratchBase]);
      if (name === 'vsprintf_s') {const value = fixture % 11 === 0 ? '' : text(args[2]).replace(/%s/g, () => text(ptr(m, args[3]))); assert(value.length < args[1]); m.write(value + '\0', args[0], 'latin1'); if (fixture % 19 === 0) put(m, F + 0x24, 0x190000); return value.length;}
      return base.libraryCall(name, args, r);
    }, platformCall(name, args, r) {calls.push([name, ...args, r.scratchBase]); if (name === 'GetCurrentThreadId' && fixture % 7 === 0) put(m, 0x714b08, ALTERNATE); return base.platformCall(name, args, r);}};
  };
  const registers = {EBX: 0x121212 + fixture, EBP: 0x232323 + fixture, ESI: 0x343434 + fixture, EDI: 0x454545 + fixture}, flag = [0, 1, 2, 0x101, -1][fixture % 5]; put(memory, S + 4, flag);
  const source = world(memory), native = world(machine.bytes); machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  imports.forEach(([, name, n, platform], i) => machine.externalCalls.set(0x760000 + i * 16, cpu => {cpu.r.EAX = native[platform ? 'platformCall' : 'libraryCall'](name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); if (platform) cpu.r.ESP += n * 4;}));
  for (const [address, name, n] of [[0x568a48, 'memcpy', 3], [0x56832a, 'registerExit', 1]]) machine.externalCalls.set(address, cpu => {cpu.r.EAX = native.libraryCall(name, Array.from({length: n}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});});
  machine.externalCalls.set(0x568980, cpu => {cpu.r.ESP -= cpu.r.EAX;}); machine.externalCalls.set(0x568162, () => {});
  try {
    requestGameAudioSamplePlayback(OBJECT, flag, {memory, scratchBase: S, sehWord: 0x12345678, entryRegisters: registers, services: source});
    machine.entry = 0x4ad9e0; machine.r.ESP = S; machine.r.ECX = OBJECT; Object.assign(machine.r, registers); steps += machine.run(1000000);
    assert.equal(machine.fs0, 0x12345678); assert.deepEqual(source.calls, native.calls, 'ordered CRT/Win32 requests and entry ESP');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`fixture${fixture} byte0x${p.toString(16)} source${memory.subarray(p, p + 24).toString('hex')} native${machine.bytes.subarray(p, p + 24).toString('hex')}`);}
  } catch (error) {console.error({fixture, source: source.calls, native: native.calls}); throw error;}
  queued += Number(fixture % 5 !== 0);
}
const path = 'src/audio-sample-playback-requests.mjs', report = {matched: true, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, queued, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4ad9e0 play-request queue producer with actual4a2b40/405310/405860 formatting/string lifetime, precise initialized-debugger4a2290/4a0e80 and actual cold-category registration4a1840, actual40ebc0 pointer-vector appends and recursive lock bookkeeping. Entire10MiB/private stack/TLS and ordered genuine CRT/Win32 requests/calleeESP compare. Null voice, empty/nonempty declared CRT formatting, growing/preallocated vectors, low-byte request flags, category cold/warm, extra-owned buffer and live manager replacement are exercised. Fixtures declare initialized debugger, valid allocations and non-clobbering CRT registers; arbitrary volatile clobbers, async consumption/voice Start, real device/process execution and library internals remain open.'};
const output = process.argv[3] ?? 'analysis/audio-sample-playback-requests-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
