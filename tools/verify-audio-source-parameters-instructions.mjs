import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRelocatedAudioFixture} from './lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {updateAudioSourceFrequency, updateAudioSourceParameters} from '../src/audio-source-parameters.mjs';

const put = (m, p, v) => m.writeUInt32LE(v >>> 0, p), ptr = (m, p) => m.readUInt32LE(p);
const bits = value => {const b = Buffer.alloc(4); b.writeFloatLE(value); return b.readUInt32LE();};
const floatBits = [0, 0x80000000, 0x3f800000, 0xbf800000, 1, 0x80000001,
  0x7fc12345, 0x7f812345, 0x7f800000, 0xff800000, 0x7f7fffff, bits(0.0001), bits(3)];
const rates = [0, 1, 8000, 22050, 44100, 48000, 100000, 0xffffffff, 0x80000001, 0x1000001];
const imports = [[0x56e094, 'EnterCriticalSection', 1], [0x56e09c, 'GetCurrentThreadId', 0], [0x56e090, 'LeaveCriticalSection', 1]];

function services(memory, fixture) {
  const calls = [], context = r => [r.scratchBase, ptr(memory, r.scratchBase)];
  return {calls, platformCall(name, args, r) {
    calls.push([name, [...args], ...context(r)]);
    if (name === 'GetCurrentThreadId') return 77;
    assert.ok(name === 'EnterCriticalSection' || name === 'LeaveCriticalSection');
    //Explicit Win32-only outcome; game depth/owner stores remain real code.
    memory.subarray(args[0], args[0] + 24).fill(name === 'EnterCriticalSection' ? 0x52 : 0x73);
    return 0;
  }, xAudio2Call(voice, slot, args, r) {
    calls.push(['COM', voice, slot, [...args], ...context(r), r.interfaceTarget]);
    return [0, 0x81234567, 0x12345678][fixture % 3];
  }, convertFloatToInt64(value, r) {
    calls.push(['CRT568a60', value, ...context(r)]);
    return Number.isFinite(value) && value >= -(2 ** 63) && value < 2 ** 63 ? BigInt(Math.trunc(value)) : -(1n << 63n);
  }};
}

//Synthetic original-address inputs; native bytes execute only in BoundedX86.
//No original game process is launched, and no game child is an external call.
export async function verifyAudioSourceParameters({fixtures = 240, moduleBaseAddress = 0x400000,
  sparse = false, withParameters = false, output = 'analysis/audio-source-parameters-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram();
  const relocated = moduleBaseAddress === 0x400000 ? null : await loadRelocatedAudioFixture(moduleBaseAddress);
  const actual = value => moduleBaseAddress + value - 0x400000;
  const instructions = relocated?.instructions ?? program.instructions;
  const machine = new BoundedX86(instructions), reached = new Set(), visits = {}, S = 0x1f000;
  const source = 0x1400000, manager = 0x1402000, header = 0x1404000, array = 0x1404100,
    waveform = 0x1405000, voice = 0x1406000, voiceTable = 0x1406100, managerTable = 0x1406200, mixerTable = 0x1406300, sourceTable = 0x1406400;
  const next = new Map(instructions.slice(0, -1).map((row, i) => [row.address, instructions[i + 1].address]));
  let steps = 0, skippedVoice = 0, voiceCalls = 0;
  machine.onInstruction = address => {
    reached.add(address);
    if ([0x4a7c10, 0x4a79f0, 0x4a92e0, 0x4a9370, 0x4a9340, 0x4ae4a0, 0x4b12d0].some(p => actual(p) === address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
    if (relocated) assert.ok(!relocated.unresolvedRelocations.has(address));
    const row = instructions[machine.entries.get(address)];
    if (row.op === 'CALL' && machine.externalCalls.has(machine.get(row.args[0]) >>> 0)) put(machine.bytes, machine.r.ESP - 4, next.get(address));
  };
  for (let f = 0; f < fixtures; f++) {
    const initial = relocated ? Buffer.from(relocated.memory) : program.initializeMemory(Buffer.alloc(0x1800000));
    initial.fill(0x57, S - 0x400, S + 32);
    initial.fill(0x39, source, source + 0x7000);
    const incoming = {EBX: 0x121212 + f, EBP: 0x232323 + f, ESI: 0x343434 + f, EDI: 0x454545 + f};
    put(initial, S, 0xffffffff); put(initial, S + 4, source);
    const force = [0, 1, 2, 0x101, -255][Math.floor(f / 3) % 5]; put(initial, S + 8, force);
    put(initial, source + 0x968, 0); put(initial, source + 0x964, f % 7 ? waveform : 0);
    put(initial, waveform + 12, rates[Math.floor(f / 2) % rates.length]);
    put(initial, source + 0x97c, voice); put(initial, voice, voiceTable);
    put(initial, voiceTable + 0x68, 0x1600100); put(initial, voiceTable + 0x70, 0x1600110);
    put(initial, voiceTable + 0x30, 0x1600120);
    put(initial, manager, managerTable); put(initial, managerTable + 0x48, actual(0x4a79f0));
    put(initial, manager + 0x84c, header); put(initial, header, array); put(initial, header + 4, array + 8); put(initial, header + 8, array + 8);
    put(initial, manager + 0x86c, 0); put(initial, manager + 0x870, 0);
    put(initial, mixerTable, actual(0x4a92e0)); put(initial, mixerTable + 0x24, actual(0x4a9370)); put(initial, mixerTable + 0x18, actual(0x4a9340));
    for (let i = 0; i < 2; i++) {
      const mixer = 0x1404400 + i * 80; put(initial, array + i * 4, mixer); put(initial, mixer, mixerTable); put(initial, mixer + 8, i);
      initial.writeFloatLE([0.5, 1, 2, -0.25, 1.3333333730697632][Math.floor(f / 13) % 5], mixer + 0x3c);
      initial.writeFloatLE([1, 0.5, 2, -0.25, NaN][Math.floor(f / 7) % 5], mixer + 0x38);
    }
    put(initial, source + 0x438, f % 3); put(initial, source + 0x440, floatBits[f % floatBits.length]);
    const scale = withParameters ? 1 : [1, 0.5, 2, -1, 0, NaN][Math.floor(f / 17) % 6];
    const rate = initial.readUInt32LE(source + 0x964) ? Math.fround(ptr(initial, waveform + 12)) : initial.readFloatLE(actual(0x5dcaac));
    let frequency = Math.fround(initial.readFloatLE(source + 0x440) * Math.fround(scale));
    if (f % 3 !== 2) frequency = Math.fround(initial.readFloatLE(0x1404400 + (f % 3) * 80 + 0x3c) * frequency);
    initial.writeFloatLE(f % 4 ? 12345 : Math.fround(rate * frequency), source + 0x988);
    put(initial, source, sourceTable); put(initial, sourceTable + 0x50, actual(0x4ae4a0)); put(initial, source + 0x9a0, 0);
    initial[source + 0x45e] = f % 2 ? 0 : 2;
    put(initial, source + 0x494, floatBits[Math.floor(f / 2) % floatBits.length]); initial.writeFloatLE(0.75, source + 0x43c);
    initial.writeFloatLE(f % 4 ? 1234 : 0, source + 0x984); put(initial, actual(0x714b08), manager);
    for (const [i, [slot]] of imports.entries()) put(initial, actual(slot), 0x1600000 + i * 16);
    const rows = [
      {address: S - 0x400, bytes: Buffer.from(initial.subarray(S - 0x400, S + 32))},
      {address: source, bytes: Buffer.from(initial.subarray(source, source + 0x7000))},
      ...[[0x5dc5fc, 4], [0x5dca70, 12], [0x5dcaac, 16]].map(([p, length]) => ({address: actual(p), bytes: Buffer.from(initial.subarray(actual(p), actual(p) + length))})),
      ...(withParameters ? [[0x5dc774, 4], [0x714b08, 4]].map(([p, length]) => ({address: actual(p), bytes: Buffer.from(initial.subarray(actual(p), actual(p) + length))})) : []),
    ];
    const captured = sparse ? createCapturedMemory(rows) : null, memory = captured?.memory ?? Buffer.from(initial);
    const sourceServices = services(memory, f);
    machine.reset(); machine.bytes = Buffer.from(initial); machine.entry = actual(withParameters ? 0x4b12d0 : 0x4a7c10);
    Object.assign(machine.r, incoming, {ESP: S, ECX: manager}); machine.scalars.XMM2 = Math.fround(scale);
    const nativeServices = services(machine.bytes, f);
    for (const [i, [, name, count]] of imports.entries()) machine.externalCalls.set(0x1600000 + i * 16, cpu => {
      cpu.r.EAX = nativeServices.platformCall(name, Array.from({length: count}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4)), {scratchBase: cpu.r.ESP - 4});
      cpu.r.ESP += count * 4;
    });
    for (const [target, slot, count] of [[0x1600100, 0x68, 3], [0x1600110, 0x70, 2], [0x1600120, 0x30, 3]]) machine.externalCalls.set(target, cpu => {
      const args = Array.from({length: count}, (_, i) => ptr(cpu.bytes, cpu.r.ESP + i * 4));
      cpu.r.EAX = nativeServices.xAudio2Call(args[0], slot, args, {scratchBase: cpu.r.ESP - 4, interfaceTarget: target}); cpu.r.ESP += count * 4;
    });
    machine.externalCalls.set(actual(0x568a60), cpu => {
      const result = nativeServices.convertFloatToInt64(cpu.scalars.XMM0, {scratchBase: cpu.r.ESP - 4});
      cpu.r.EAX = Number(BigInt.asUintN(32, result)); cpu.r.EDX = Number(BigInt.asUintN(32, result >> 32n));
    });
    const runtime = {memory, scratchBase: S, moduleBaseAddress, xmm2: scale, entryRegisters: incoming, services: sourceServices};
    const result = withParameters ? updateAudioSourceParameters(manager, source, force, runtime) : updateAudioSourceFrequency(manager, source, force, runtime);
    try {steps += machine.run(100000);} catch (error) {throw Error(`Fixture ${f}: ${error.message}`, {cause: error});}
    assert.equal(result, machine.r.EAX >>> 0, `fixture ${f} EAX`); assert.equal(machine.r.ESP, S + 12);
    for (const [name, value] of Object.entries(incoming)) assert.equal(machine.r[name] >>> 0, value);
    assert.deepEqual(sourceServices.calls, nativeServices.calls, `fixture ${f} ordered external ABI`);
    const spans = captured ? rows.map(row => [row.address, captured.span(row.address, row.bytes.length)]) : [[0, memory]];
    for (const [p, a] of spans) {
      const b = machine.bytes.subarray(p, p + a.length);
      if (!a.equals(b)) {const i = a.findIndex((v, i) => v !== b[i]); assert.fail(`fixture ${f} byte 0x${(p + i).toString(16)}: source ${a.subarray(i, i + 16).toString('hex')} native ${b.subarray(i, i + 16).toString('hex')}`);}
    }
    const count = sourceServices.calls.filter(row => row[0] === 'COM').length;
    voiceCalls += count; skippedVoice += Number(count === 0);
  }
  const report = {matched: true, method: 'Constructed inputs; actual retained 4a7c10 -> 4a79f0/4a92e0/4a9370 game instructions, explicit Win32/COM/CRT outcomes; all mapped bytes or every declared sparse span, private stack, ordered external ABIs, complete EAX, preserved registers and stdcall return ESP.',
    targetSha256: program.sha256, fixtures, moduleBaseAddress, sparse, withParameters, reachedInstructions: reached.size, instructionSteps: steps, visits, voiceCalls, skippedVoice,
    limits: ['No original-process execution or background thread schedule proof.', 'Decoder-rate, spatial and reverb branches remain explicit reached dependencies.'],
    evidence: program.references.filter(row => /12361-|1500[123]-/.test(row.path))};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await verifyAudioSourceParameters({fixtures: Number(process.argv[2] ?? 240), output: process.argv[3] ?? 'analysis/audio-source-parameters-instruction-check.json'});
  console.log(JSON.stringify(report));
}
