import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRelocatedAudioFixture} from './lib/relocated-audio-fixtures.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {createNativeControlAudioBindings} from './lib/native-control-audio.mjs';
import {createVehicleFeedbackFixture, feedbackAddresses as a} from './verify-vehicle-audio-connected-instructions.mjs';
import {updateVehicleAudio} from '../src/vehicle-audio.mjs';

const put = (m, p, v) => m.writeUInt32LE(v >>> 0, p);
const globals = [[0x5ecb1c, 4], [0x90b98c, 4], [0x90a548, 4], [0x713190, 0x150], [0x909300, 6 * 0x30c],
  [0x5eced0, 8], [0x811180, 16], [0x6e6bd4, 16], [0x5750a0, 0x260], [0x5e8890, 4]];
const literals = [[0x5dc5dc, 16], [0x5dc774, 4], [0x5dcb10, 4], [0x5dc8e0, 0xa0], [0x5d3f60, 0x80]];
const heaps = [[a.body, 0x4000], [a.other, 0x4000], [a.session, 0x800], [a.pack, 0x100], [0x41000, 0x100], [0x42000, 0x100], [a.material, 0x100], [a.channels, 0x400], [0x1400000, 0x5000], [0x1410000, 0x1000], [a.stack - 0x400, 0x440]];

//Constructed nonnull-source fixtures. Game methods execute in both graphs;
//only the compiler cookie check is admitted as a compiler service.
export async function verifyNativeControlAudio({cases = 12, output = null} = {}) {
  let calls = 0, steps = 0; const methods = new Set(), sites = new Set();
  for (const base of [0x400000, 0x6e0000]) {
    const fixture = await loadRelocatedAudioFixture(base), actual = fixture.actual;
    //This seven-byte getter is read directly from the SHA-verified PE.
    assert.equal(fixture.memory.subarray(actual(0x4ae350), actual(0x4ae350) + 7).toString('hex'), '8b81a0090000c3');
    const instructions = fixture.instructions.filter(row => row.address < actual(0x4ae350) || row.address > actual(0x4ae356));
    instructions.push({address: actual(0x4ae350), op: 'MOV', args: ['EAX', 'dword ptr [ECX + 0x9a0]']}, {address: actual(0x4ae356), op: 'RET', args: []});
    const machine = new BoundedX86(instructions, {fpuPrecisionBits: 24});
    machine.externalCalls.set(actual(0x568162), m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(actual(0x5e8890))));
    for (let index = 0; index < cases; index++) {
      const old = createVehicleFeedbackFixture(index), memory = Buffer.from(fixture.memory), audio = old.audio;
      for (const [p, n] of heaps.slice(0, -3)) old.memory.copy(memory, p, p, p + n);
      for (const [p, n] of globals) old.memory.copy(memory, actual(p), p, p + n);
      memory.fill(0x51, a.stack - 0x400, a.stack + 64);
      put(memory, actual(0x5e8890), 0x17b842a0);
      memory[actual(0x909300) + old.index * 0x30c + 0x258] = 0;
      memory.writeInt16LE(0, a.session + 0x61c); memory[a.body + 0x66f] = 0;
      memory.writeInt32LE(-1, a.body + 0x11c); memory[a.body + 0x6b4] = index % 2;
      memory[a.body + 0x57c] = 1; memory[a.body + 0x4b4] = 1;
      memory[a.material + 12] = 1; memory[a.material + 44] = 1;
      //Explicit table inputs select high slip, low slip, or pending clear.
      const low = index % 3 === 1, clear = index % 3 === 2;
      put(memory, a.body + 0x5f8, (low || clear ? 2 : 12) * 65536); put(memory, a.body + 0x530, 0);
      put(memory, actual(0x5750d0) + 20 + 16, low ? 1 : 0);
      memory.writeInt16LE(1, actual(audio) + 38); memory[actual(audio) + 34] = 1;
      for (let role = 0; role < 5; role++) {
        const channel = a.channels + role * 16, object = 0x1400000 + role * 0xa00, waveform = 0x1410000, effect = 0x1410100 + role * 32;
        put(memory, actual(audio) + 4 + role * 4, channel); put(memory, channel, object); put(memory, object, actual(0x5d3f60));
        put(memory, object + 0x964, index % 4 === 3 ? 0 : waveform); put(memory, waveform + 12, index % 2 ? 22050 : 44100);
        put(memory, object + 0x948, 3); put(memory, object + 0x94c, 4);
        put(memory, object + 0x9a0, index % 4 === 0 ? 0 : effect);
      }
      //Null effects use the actual mode-zero early-return path.
      if (index % 4 === 0) memory[a.body + 0x6b4] = 0;
      const entryRegisters = {EBX: actual(0x909300) + old.index * 0x30c, EDI: old.index, ESI: a.session, EBP: old.index};
      put(memory, a.stack, 0xffffffff);
      const rows = [...heaps, ...globals.map(([p, n]) => [actual(p), n]), ...literals.map(([p, n]) => [actual(p), n])]
        .map(([address, length]) => ({address, bytes: Buffer.from(memory.subarray(address, address + length))}));
      const bound = createCapturedMemory(rows, {aliases: [...globals, ...literals].filter(([p]) => p !== 0x5d3f60).map(([p, length]) => ({address: p, targetAddress: actual(p), length}))});
      const runtime = {memory: bound.memory, moduleBaseAddress: base, scratchBase: a.stack, nativeAudioCalls: true, entryRegisters};
      const binding = createNativeControlAudioBindings(runtime); runtime.handlers = binding.handlers;
      const protectedBytes = Buffer.from(memory.subarray(a.stack + 4, a.stack + 32));
      updateVehicleAudio(a.body, old.index, runtime);
      machine.reset(); machine.bytes = Buffer.from(memory); machine.entry = actual(0x485300);
      Object.assign(machine.r, entryRegisters, {ECX: a.body, EDX: old.index, ESP: a.stack});
      const nativeEvents = [], pending = [];
      const targets = new Set([0x4ad5f0, 0x4ad6a0, 0x4ad5b0, 0x4ad580, 0x4ae4a0, 0x4ae350].map(actual));
      machine.onInstruction = address => {
        if (pending.length && address === pending.at(-1).returnAddress) {
          const event = pending.pop(); event.outputStack = event.offsets.map(offset => ({address: event.entryEsp + offset, value: machine.bytes.readUInt32LE(event.entryEsp + offset)}));
          delete event.offsets;
        }
        if (targets.has(address)) {
          const expected = binding.events[nativeEvents.length]; assert.ok(expected, `unexpected native target ${address.toString(16)}`);
          const entryEsp = machine.r.ESP >>> 0, event = {target: address, entryEsp, returnAddress: machine.bytes.readUInt32LE(entryEsp),
            entryRegisters: Object.fromEntries(['EBX', 'EBP', 'ESI', 'EDI'].map(name => [name, machine.r[name] >>> 0])),
            inputWords: expected.inputWords.map((_, i) => machine.bytes.readUInt32LE(entryEsp + 4 + i * 4)),
            offsets: expected.outputStack.map(row => row.address - expected.entryEsp)};
          nativeEvents.push(event); pending.push(event);
        }
      };
      steps += machine.run(100000); assert.equal(nativeEvents.length, binding.events.length);
      for (const [i, event] of binding.events.entries()) {
        const comparable = {target: event.target, entryEsp: event.entryEsp, returnAddress: event.returnAddress,
          entryRegisters: Object.fromEntries(['EBX', 'EBP', 'ESI', 'EDI'].map(name => [name, event.entryRegisters[name] >>> 0])), inputWords: event.inputWords, outputStack: event.outputStack};
        assert.deepEqual(nativeEvents[i], comparable, `base${base.toString(16)}/case${index}/site${event.site.toString(16)}`);
        methods.add(event.method); sites.add(event.site); calls++;
      }
      for (const [p, n] of [[a.body, 0x4000], [actual(0x713190), 0x150], [0x1400000, 0x5000], [0x1410000, 0x1000]])
        assert.deepEqual(bound.memory.subarray(p, p + n), machine.bytes.subarray(p, p + n), `output${p.toString(16)} case${index}`);
      assert.deepEqual(bound.memory.subarray(a.stack + 4, a.stack + 32), protectedBytes);
    }
  }
  const report = {matched: true, constructedCases: cases * 2, sourceCalls: calls, instructionSteps: steps, methods: [...methods], callSites: [...sites].map(p => `0x${p.toString(16)}`),
    limits: ['Constructed original-PE/retained-instruction comparisons, not original-process evidence.', 'Whole485300 private frame/CPU output is not compared; real child entry nonvolatile registers, arguments, return words and defined child stack writes are.', 'Creation/play, reverb installation and haptic native caller branches remain explicit dependencies.']};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyNativeControlAudio({output: process.argv[2] ?? null})));
