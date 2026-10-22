import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {soundManagerImports, createSoundManagerServices, installSoundManagerInstructionServices} from './verify-sound-manager-construction-instructions.mjs';
import {replaceAudioSampleCallback, retireGameAudioSource, destroyQueuedAudioSource, releaseGameAudioListener} from '../src/audio-source-retirement.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), S = 0x1f000, SOURCE = 0x100000, MANAGER = 0x110000, QUEUED = 0x120000, LISTENER = 0x130000;
const entries = [0x4ad420, 0x4a7950, 0x4aa250, 0x4aa000], fixtures = Number(process.argv[2] ?? 1600), reached = new Set(), visits = {};
const by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
machine.onInstruction = address => {reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; const [i, next] = by.get(address); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);};
let steps = 0, casts = 0, clones = 0, deletes = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const selector = fixture % 4, variant = Math.floor(fixture / 4), entry = entries[selector], flags = variant % 4;
  const sourceObject = selector === 0 && variant % 13 === 0 ? S + 4 - 0x930 : SOURCE;
  const cast = variant % 5 === 0 ? 0 : SOURCE + (variant % 7 === 0 ? 16 : 0);
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 2048, S + 128); put(memory, S, -1);
  put(memory, SOURCE, 0x5d3f60); put(memory, 0x5d3fbc, 0x4ad420);
  put(memory, MANAGER, 0x5d4190); put(memory, 0x5d41b0, 0x4a7950); put(memory, 0x714b08, MANAGER);
  put(memory, MANAGER + 0x840, 0x140000); put(memory, 0x140000, 0x141000); put(memory, 0x140004, 0x141000 + variant % 4 * 4); put(memory, 0x140008, 0x141000 + (variant % 4 + variant % 2) * 4);
  for (let i = 0; i < 4; i++) put(memory, 0x141000 + i * 4, variant % 3 === 0 ? cast : 0x150000 + i * 4);
  function functor(p, listener) {put(memory, p, listener ? 0x5d0304 : 0x5d3d1c); put(memory, p + 4, 0x160000 + variant);}
  const storage = selector === 3 ? LISTENER + 8 : sourceObject + 0x930, owned = variant % 3 === 0 ? 0 : variant % 3 === 1 ? storage : 0x170000;
  if (owned) functor(owned, selector === 3); put(memory, storage + 16, owned);
  if (selector === 0) {functor(S + 4, false); const incoming = variant % 4 === 0 ? 0 : variant % 4 === 1 ? S + 4 : 0x180000; if (incoming && incoming !== S + 4) functor(incoming, false); put(memory, S + 20, incoming);}
  if (selector === 1) put(memory, S + 4, SOURCE);
  if (selector === 2) {put(memory, QUEUED + 44, variant % 11 === 0 ? 0 : SOURCE); put(memory, QUEUED + 36, variant % 3 === 0 ? 0 : 0x190000); put(memory, 0x190000, variant % 7 === 0 ? 0 : 0x191000); put(memory, 0x190004, 0x191004); put(memory, 0x190008, 0x191008);}
  if (selector === 3) put(memory, S + 4, flags);
  soundManagerImports.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16)); put(memory, 0x56e098, 0x770000);
  const world = m => {const base = createSoundManagerServices(m, 0), calls = base.calls; return {...base, libraryCall(name, args, context) {
    if (name === '__RTDynamicCast') {calls.push([name, ...args]); return args[0] ? cast : 0;}
    return base.libraryCall(name, args, context);
  }, platformCall(name, args, context) {if (name === 'DeleteCriticalSection') {calls.push([name, ...args]); return 0;} return base.platformCall(name, args, context);}};};
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes); const source = world(memory), native = world(machine.bytes); installSoundManagerInstructionServices(machine, native);
  machine.externalCalls.set(0x56932a, cpu => {cpu.r.EAX = native.libraryCall('__RTDynamicCast', Array.from({length: 5}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)));});
  machine.externalCalls.set(0x770000, cpu => {cpu.r.EAX = native.platformCall('DeleteCriticalSection', [ptr(cpu.bytes, cpu.r.ESP)]); cpu.r.ESP += 4;});
  const registers = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545}, runtime = {memory, scratchBase: S, entryRegisters: registers, sehWord: 0x12345678, services: source};
  try {
    let result;
    if (selector === 0) replaceAudioSampleCallback(sourceObject, runtime);
    else if (selector === 1) result = retireGameAudioSource(MANAGER, SOURCE, runtime);
    else if (selector === 2) destroyQueuedAudioSource(QUEUED, runtime);
    else result = releaseGameAudioListener(LISTENER, flags, runtime);
    machine.entry = entry; machine.r.ESP = S; machine.r.ECX = [sourceObject, MANAGER, QUEUED, LISTENER][selector]; Object.assign(machine.r, registers); steps += machine.run(1000000);
    assert.equal(machine.fs0, 0x12345678); if (result !== undefined) assert.equal(machine.r.EAX >>> 0, result >>> 0); assert.deepEqual(source.calls, native.calls, 'ordered CRT/Win32');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 24).toString('hex')} source${memory.subarray(p, p + 24).toString('hex')}`);}
  } catch (error) {console.error({fixture, selector, variant, sourceObject, cast, source: source.calls, native: native.calls}); throw error;}
  casts += source.calls.filter(([name]) => name === '__RTDynamicCast').length; clones += source.calls.filter(([name, bytes]) => name === 'operatorNew' && bytes === 12).length; deletes += source.calls.filter(([name]) => name === 'operatorDelete').length;
}
const path = 'src/audio-source-retirement.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, casts, clones, deletes, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4ad420 callback replacement,4a7950 deferred-source registration,4aa250 queued-wrapper destruction and4aa000 listener release, using actual known queued/listener callable children and actual pointer-vector growth. Full10MiB including every native privateframe/SEH, returns and ordered genuine CRT/Win32 compare. __RTDynamicCast is an explicit MSVC runtime boundary with declared nullable/adjusted cast results; no fake game helpers. Incoming callable storage may alias sample storage; inline/heap/empty callbacks, duplicate deferred entries, null queue members, growth and listener deletion flags are exercised. Unknown game callback virtuals throw; pending XASoundSource/voice destruction is separate. No original-process runtime or library RTTI implementation claim.'};
const output = process.argv[3] ?? 'analysis/audio-source-retirement-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
