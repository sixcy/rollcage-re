import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {destroyAudioDatabaseManager, destroyCoreSoundManager, destroyBaseSoundManager} from '../src/sound-manager-destruction.mjs';
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p), S = 0x1f000, OBJECT = 0x100000, ALT = 0x150000;
const fixtures = Number(process.argv[2] ?? 2400), entries = [0x4aba30, 0x4a9570, 0x4a5ad0], reached = new Set(), visits = {};
const by = new Map(program.instructions.map((i, n) => [i.address, [i, program.instructions[n + 1]?.address]]));
machine.onInstruction = address => {
  reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
  const [i, next] = by.get(address); if (i.op === 'CALL' && machine.externalCalls.has(machine.get(i.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next);
};
const imports = [[0x56e210, 'operatorDelete', 0x760000], [0x56e0bc, 'CloseHandle', 0x760010], [0x56e098, 'DeleteCriticalSection', 0x760020]];
let steps = 0, deleted = 0, platformCalls = 0, mutations = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const selector = fixture % 3, variant = Math.floor(fixture / 3), entry = entries[selector];
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 512, S + 128); put(memory, S, -1);
  const fields = selector === 0 ? [0, 4, 8] : [4, 8, 12, 0x814, 0x82c, 0x830, 0x834, 0x840, 0x838, 0x83c, 0x848, 0x844, 0x84c];
  for (let i = 0; i < fields.length; i++) {
    const header = 0x110000 + i * 0x100, storage = 0x130000 + i * 0x100;
    put(memory, OBJECT + fields[i], (variant + i) % 5 === 0 ? 0 : header);
    put(memory, header, (variant + i) % 3 === 0 ? 0 : storage); put(memory, header + 4, storage + 12); put(memory, header + 8, storage + 24);
  }
  put(memory, ALT, 0x151000); put(memory, ALT + 4, 0x151008); put(memory, ALT + 8, 0x151020);
  for (const [offset, value] of [[0x8d4, 10], [0x8d0, 20], [0x8c8, 30], [0x8c4, 40]]) put(memory, OBJECT + offset, variant % 7 === 0 ? 0 : value);
  imports.forEach(([slot, , target]) => put(memory, slot, target));
  const world = m => {const calls = []; let n = 0; return {calls, libraryCall(name, args, context) {
    calls.push([name, ...args, context.scratchBase, context.targetAddress]);
    if (n++ === 0 && variant % 2 === 0) {
      put(m, OBJECT + (selector === 0 ? 4 : selector === 1 ? 8 : 0x830), ALT);
      //The first header still belongs to its capture, despite this replacement.
      put(m, OBJECT + (selector === 0 ? 0 : selector === 1 ? 0x814 : 0x82c), ALT);
      put(m, 0x56e210, 0x760030);
    }
    return 0;
  }, platformCall(name, args, context) {
    calls.push([name, ...args, context.scratchBase, context.targetAddress]);
    if (name === 'CloseHandle' && variant % 3 === 0) {put(m, OBJECT + 0x8d0, 55); put(m, 0x56e0bc, 0x760040);}
    return 1;
  }};};
  const source = world(memory), native = world(machine.bytes), registers = {EBX: 0x121212 + fixture, EBP: 0x232323 + fixture, ESI: 0x343434 + fixture, EDI: 0x454545 + fixture};
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  for (const [, name, target] of [...imports, [0, 'operatorDelete', 0x760030], [0, 'CloseHandle', 0x760040]]) machine.externalCalls.set(target, cpu => {
    cpu.r.EAX = native[name === 'operatorDelete' ? 'libraryCall' : 'platformCall'](name, [ptr(cpu.bytes, cpu.r.ESP)], {scratchBase: cpu.r.ESP - 4, targetAddress: target});
    if (name !== 'operatorDelete') cpu.r.ESP += 4;
  });
  try {
    [destroyAudioDatabaseManager, destroyCoreSoundManager, destroyBaseSoundManager][selector](OBJECT, {memory, scratchBase: S, entryRegisters: registers, services: source});
    machine.entry = entry; machine.r.ESP = S; machine.r.ECX = OBJECT; Object.assign(machine.r, registers); steps += machine.run(100000);
    assert.deepEqual(source.calls, native.calls, 'ordered services, live/captured IAT and callee ESP');
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 16).toString('hex')} source${memory.subarray(p, p + 16).toString('hex')}`);}
  } catch (error) {console.error({fixture, selector, variant, source: source.calls, native: native.calls}); throw error;}
  deleted += source.calls.filter(([name]) => name === 'operatorDelete').length; platformCalls += source.calls.filter(([name]) => name !== 'operatorDelete').length;
  mutations += Number(variant % 2 === 0 && source.calls.some(([name]) => name === 'operatorDelete'));
}
const path = 'src/sound-manager-destruction.mjs', report = {matched: true, fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, deleted, platformCalls, mutations, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4aba30 database destruction,4a9570 core tailcall and4a5ad0 PCBase teardown without game contracts. Whole10MiB including every native privateframe and ordered genuineCRT/Win32 requests with calleeESP and exact captured/live IAT target compare. Nullable vector headers/storage, stale null-storage header fields, allocator-side owner/header and later field replacement, changed IAT during deletion and later event changes duringCloseHandle are exercised. Original CRT/Win32 internals and original process/device/thread execution remain outside this proof.'};
const output = process.argv[3] ?? 'analysis/sound-manager-destruction-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
