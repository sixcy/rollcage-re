import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRelocatedAudioFixture} from './lib/relocated-audio-fixtures.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateAudioManager, updateAudioManagerSources} from '../src/audio-manager-update.mjs';

const put = (m, p, v) => m.writeUInt32LE(v >>> 0, p), ptr = (m, p) => m.readUInt32LE(p);
const imports = [[0x56e0fc, 'QueryPerformanceCounter', 1], [0x56e0ac, 'ResetEvent', 1], [0x56e0a4, 'SetEvent', 1],
  [0x56e094, 'EnterCriticalSection', 1], [0x56e09c, 'GetCurrentThreadId', 0], [0x56e090, 'LeaveCriticalSection', 1], [0x56e0cc, 'Sleep', 1], [0x56e478, 'memmove', 3, true], [0x56e210, 'operatorDelete', 1, true]];

function world(memory, fixture) {
  const calls = []; let reads = 0;
  return {calls, platformCall(name, args, r) {
    calls.push([name, ...args, r.scratchBase, ptr(memory, r.scratchBase)]);
    if (name === 'QueryPerformanceCounter') {memory.writeBigUInt64LE(1000000n + BigInt(fixture + 1) * 10000n + BigInt(++reads) * 1000n, args[0]); return 1;}
    if (name === 'GetCurrentThreadId') return 700 + fixture;
    if (name === 'EnterCriticalSection' || name === 'LeaveCriticalSection') memory.subarray(args[0], args[0] + 24).fill(name === 'EnterCriticalSection' ? 0x31 : 0x42);
    assert.ok(['ResetEvent', 'SetEvent', 'EnterCriticalSection', 'LeaveCriticalSection', 'Sleep'].includes(name)); return 1;
  }, libraryCall(name, args, r) {
    calls.push([name, ...args, r.scratchBase, ptr(memory, r.scratchBase)]);
    if (name === 'registerExit') return 0;
    if (name === 'operatorDelete') return 0;
    if (name === 'memmove') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory.subarray(args[0], args[0] + args[2])); return args[0];}
    throw Error(`Unadmitted manager CRT ${name}.`);
  }, xAudio2Call(voice, slot, args, r) {
    calls.push(['COM', voice, slot, ...args, r.scratchBase, ptr(memory, r.scratchBase)]);
    if (slot === 0x64) {memory.subarray(args[1], args[1] + 16).fill(0); put(memory, args[1] + 4, 1);}
    else assert.ok([0x30, 0x68, 0x70].includes(slot));
    return 0;
  }, convertFloatToInt64(value, r) {
    calls.push(['CRT568a60', value, r.scratchBase, ptr(memory, r.scratchBase)]); return BigInt(Math.trunc(value));
  }};
}

export async function verifyAudioManagerUpdate({fixtures = 48, moduleBaseAddress = 0x400000, sparse = false, populated = false, retired = false,
  consumerOnly = false, output = 'analysis/audio-manager-update-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), relocated = moduleBaseAddress === 0x400000 ? null : await loadRelocatedAudioFixture(moduleBaseAddress);
  const actual = value => moduleBaseAddress + value - 0x400000, instructions = relocated?.instructions ?? program.instructions;
  const machine = new BoundedX86(instructions), reached = new Set(), visits = {}, next = new Map(instructions.slice(0, -1).map((row, i) => [row.address, instructions[i + 1].address]));
  const S = 0x1f000, manager = 0x1400000, watch = 0x1405000;
  let steps = 0;
  machine.onInstruction = address => {
    reached.add(address); if ([0x4a6600, 0x4a6a6d, 0x4a6b60, 0x4a90f0, 0x4a9380, 0x4b12d0, 0x4a7c10, 0x4adc40, 0x4a79f0, 0x4ad8f0].some(p => actual(p) === address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
    if (relocated) assert.ok(!relocated.unresolvedRelocations.has(address), `Unproved instruction relocation ${address.toString(16)}`);
    const row = instructions[machine.entries.get(address)]; if (row.op === 'CALL' && machine.externalCalls.has(machine.get(row.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next.get(address));
  };
  for (const address of [0x5689e0, 0x569380, 0x568f10, 0x568dff, 0x56832a, 0x568a60]) machine.entries.delete(actual(address));
  for (let f = 0; f < fixtures; f++) {
    const initial = relocated ? Buffer.from(relocated.memory) : program.initializeMemory(Buffer.alloc(0x1800000));
    initial.fill(0x57, S - 0x1000, S + 32); initial.fill(0, manager, manager + 0x10000); put(initial, S, 0xffffffff);
    const incoming = {EBX: 0x121212 + f, EBP: 0x232323 + f, ESI: 0x343434 + f, EDI: 0x454545 + f};
    put(initial, actual(0x716d98), 3); put(initial, actual(0x714b04), watch); initial.writeBigUInt64LE(10000000n, watch + 40); initial.writeBigUInt64LE(1000000n, watch + 48);
    put(initial, actual(0x716df8), f % 2); put(initial, actual(0x716e08), f % 2);
    put(initial, actual(0x716e0c), 0x1406000); put(initial, actual(0x716e10), 0x1406008); put(initial, actual(0x716e14), 0x1406100);
    put(initial, actual(0x715b08), 3); put(initial, actual(0x714afc), actual(0x715b30)); put(initial, actual(0x714b10), 1);
    put(initial, actual(0x714b08), manager);
    initial[manager + 0x820] = consumerOnly ? 1 : f % 3 ? 1 : 0; initial[manager + 0x821] = f % 2;
    for (const [i, offset] of [0x834, 0x838, 0x83c, 0x840, 0x844, 0x848, 0x84c].entries()) {
      const header = 0x1402000 + i * 16, storage = 0x1404000 + i * 64; put(initial, manager + offset, header);
      put(initial, header, storage); put(initial, header + 4, storage); put(initial, header + 8, storage + 64);
    }
    put(initial, manager + 0x8d0, 11); put(initial, manager + 0x8d4, 12); put(initial, manager + 0x8cc, f);
    initial.writeBigUInt64LE(f % 2 ? 0x7fffffffffffffffn : 0n, manager + 0x8e0);
    for (const offset of [0x854, 0x874, 0x894]) {put(initial, manager + offset + 24, f % 3); put(initial, manager + offset + 28, 900);}
    const mixerHeader = ptr(initial, manager + 0x84c), mixers = consumerOnly ? 0 : f % 4;
    put(initial, mixerHeader + 4, ptr(initial, mixerHeader) + mixers * 4);
    for (let i = 0; i < mixers; i++) {
      const object = 0x1403000 + i * 80; put(initial, ptr(initial, mixerHeader) + i * 4, object); put(initial, object, actual(0x5d3ba8)); put(initial, object + 4, i ? object - 80 : 0);
      initial.writeFloatLE(0.8, object + 0x28); initial.writeFloatLE(0.9, object + 0x2c); initial.writeFloatLE(f % 2 ? 0.01 : -0.01, object + 0x30); initial.writeFloatLE(1.1, object + 0x34);
      put(initial, object + 8, i);
    }
    const sourceCount = populated ? 1 + f % 3 : 0;
    if (populated) {
      initial[manager + 0x820] = 1; initial[manager + 0x821] = 0; put(initial, actual(0x716e08), 1); put(initial, manager + 0x850, 4); put(initial, manager, actual(0x5d4190));
      const header = ptr(initial, manager + 0x838), storage = ptr(initial, header); put(initial, header + 4, storage + sourceCount * 4);
      put(initial, 0x140a00c, 44100); put(initial, 0x140c030, 0x1601030); put(initial, 0x140c064, 0x1601000); put(initial, 0x140c068, 0x1601010); put(initial, 0x140c070, 0x1601020);
      for (let i = 0; i < sourceCount; i++) {
        const source = 0x1407000 + i * 0xa00, voice = 0x140b000 + i * 16; put(initial, storage + i * 4, source); put(initial, source, actual(0x5d3f60)); put(initial, source + 0x97c, voice); put(initial, voice, 0x140c000);
        put(initial, source + 0x964, 0x140a000); put(initial, source + 0x948, 3); put(initial, source + 0x94c, 4); put(initial, source + 0x954, i);
        initial.writeFloatLE(0.5, source + 0x494); initial.writeFloatLE(0.75, source + 0x43c); initial.writeFloatLE(1.2, source + 0x440); put(initial, source + 0x438, 0);
      }
    }
    if (retired) {
      initial[manager + 0x820] = 1; const source = 0x140d000; put(initial, source, actual(0x5d3f60));
      for (const [offset, items] of [[0x834, [source, 0x11111111, source, 0x22222222, source]], [0x83c, [source, source]], [0x838, [source, source]], [0x840, [source]]]) {
        const header = ptr(initial, manager + offset), storage = ptr(initial, header); put(initial, header + 4, storage + items.length * 4); items.forEach((v, i) => put(initial, storage + i * 4, v));
      }
    }
    for (const [i, [slot]] of imports.entries()) put(initial, actual(slot), 0x1600000 + i * 16);
    const globals = [[0x714afc, 0x2324], [0x5dc774, 4], [0x5dc9d8, 8], [0x5d3ba8, 0x2c], ...imports.map(([slot]) => [slot, 4])];
    const rows = [{address: S - 0x1000, bytes: Buffer.from(initial.subarray(S - 0x1000, S + 32))}, {address: manager, bytes: Buffer.from(initial.subarray(manager, manager + 0x10000))},
      ...globals.map(([p, length]) => ({address: actual(p), bytes: Buffer.from(initial.subarray(actual(p), actual(p) + length))}))];
    const bound = sparse ? createCapturedMemory(rows, {aliases: [{address: 0x714afc, targetAddress: actual(0x714afc), length: 0x2324}]}) : null;
    const memory = bound?.memory ?? Buffer.from(initial), source = world(memory, f);
    machine.reset(); machine.bytes = Buffer.from(initial); machine.entry = actual(consumerOnly ? 0x4a6b60 : 0x4a6600); machine.fs0 = 0x12345678;
    Object.assign(machine.r, incoming, {ESP: S, ECX: manager}); const native = world(machine.bytes, f);
    for (const [i, [, name, count, library]] of imports.entries()) machine.externalCalls.set(0x1600000 + i * 16, cpu => {cpu.r.EAX = native[library ? 'libraryCall' : 'platformCall'](name, Array.from({length: count}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4}); if (!library) cpu.r.ESP += count * 4;});
    machine.externalCalls.set(actual(0x56832a), cpu => {cpu.r.EAX = native.libraryCall('registerExit', [ptr(cpu.bytes, cpu.r.ESP)], {scratchBase: cpu.r.ESP - 4});});
    for (const [address, kind] of [[0x5689e0, 'unsigned'], [0x569380, 'signed'], [0x568f10, 'multiply']]) machine.externalCalls.set(actual(address), cpu => {
      const left = kind === 'signed' ? cpu.bytes.readBigInt64LE(cpu.r.ESP) : cpu.bytes.readBigUInt64LE(cpu.r.ESP), right = kind === 'signed' ? cpu.bytes.readBigInt64LE(cpu.r.ESP + 8) : cpu.bytes.readBigUInt64LE(cpu.r.ESP + 8);
      const result = BigInt.asUintN(64, kind === 'multiply' ? left * right : left / right); cpu.r.EAX = Number(result & 0xffffffffn) | 0; cpu.r.EDX = Number(result >> 32n) | 0; cpu.r.ESP += 16;
    });
    machine.externalCalls.set(actual(0x568dff), cpu => {cpu.scalars.XMM0 = Number(BigInt.asIntN(64, BigInt(cpu.r.ECX >>> 0) | BigInt(cpu.r.EDX >>> 0) << 32n)); cpu.doubleScalars.add('XMM0'); cpu.scalarBits.delete('XMM0');});
    machine.externalCalls.set(actual(0x568a60), cpu => {const result = native.convertFloatToInt64(cpu.floatFromBits(cpu.lowFloatBits('XMM0')), {scratchBase: cpu.r.ESP - 4}); cpu.r.EAX = Number(BigInt.asIntN(32, result)); cpu.r.EDX = Number(BigInt.asIntN(32, result >> 32n));});
    for (const [target, slot, count] of [[0x1601000, 0x64, 2], [0x1601010, 0x68, 3], [0x1601020, 0x70, 2], [0x1601030, 0x30, 3]]) machine.externalCalls.set(target, cpu => {
      const args = Array.from({length: count}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)); cpu.r.EAX = native.xAudio2Call(args[0], slot, args, {scratchBase: cpu.r.ESP - 4}); cpu.r.ESP += count * 4;
    });
    const r = {memory, scratchBase: S, moduleBaseAddress, entryRegisters: incoming, sehWord: 0x12345678, services: source};
    const result = consumerOnly ? updateAudioManagerSources(manager, r) : updateAudioManager(manager, r);
    try {steps += machine.run(1000000);} catch (error) {throw Error(`fixture ${f}: ${error.message}`, {cause: error});}
    if (consumerOnly) assert.equal(result >>> 0, machine.r.EAX >>> 0); else assert.equal(result, machine.r.EAX & 255);
    assert.equal(machine.fs0, 0x12345678); assert.equal(machine.r.ESP, S); for (const [name, value] of Object.entries(incoming)) assert.equal(machine.r[name] >>> 0, value);
    assert.deepEqual(source.calls, native.calls, `fixture ${f} ordered external ABI`);
    for (const [p, a] of bound ? rows.map(row => [row.address, bound.span(row.address, row.bytes.length)]) : [[0, memory]]) {
      const b = machine.bytes.subarray(p, p + a.length); if (!a.equals(b)) {const i = a.findIndex((v, i) => v !== b[i]); assert.fail(`fixture ${f} byte0x${(p + i).toString(16)} source ${a.subarray(i, i + 24).toString('hex')} native ${b.subarray(i, i + 24).toString('hex')}`);}
    }
  }
  const report = {matched: true, targetSha256: program.sha256, fixtures, moduleBaseAddress, sparse, consumerOnly, populated, retired, reachedInstructions: reached.size, instructionSteps: steps, visits,
    domain: 'Constructed warm-clock and caller-owned vectors; real outer locks/events/time, selected empty or populated nonspatial steady-source arbitration, real<=32sort/source-state/source-parameter/mixer children, optional duplicate retirement through real destructor. Full mapped memory or all declared sparse spans, private stack, ordered genuine OS/CRT ABI, return AL/EAX and preserved registers/TLS. No original process or worker schedule replay.',
    limits: ['Spatial/listener attenuation and debugger stop/resume/category paths remain explicit reached errors; actual flags are not changed to avoid them.', 'Queued-next virtual44, >32sort, cold relocated clock and several relocated source/stream/destruction children remain explicit gaps.'],
    evidence: program.references.filter(row => /12234-|12285-|12289-/.test(row.path)),
    sourceSha256: createHash('sha256').update(await readFile('src/audio-manager-update.mjs')).digest('hex')};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'}); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyAudioManagerUpdate({fixtures: Number(process.argv[2] ?? 48), output: process.argv[3] ?? 'analysis/audio-manager-update-instruction-check.json'})));
