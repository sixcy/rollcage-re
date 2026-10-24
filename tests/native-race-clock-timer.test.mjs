import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {readGameMicroseconds} from '../src/game-network-protocol.mjs';

const QPC = 0x1700000, QPF = QPC + 16, incoming = {EBX: 0x12345678, EBP: 0x87654321, ESI: 0xabcdef01, EDI: 0xfedcba98};
const fields = [[0x6e6c8c, 4], [0x56e0fc, 4], [0x56e114, 4], [0x7135a4, 16]];
const cases = [
  {initialized: 1, frequency: 10000000n, origin: 1000n, counter: 333335000n},
  {initialized: -1, frequency: -8589934595n, origin: -9000000000000n, counter: 4000000000000n},
  {initialized: 1, frequency: 1000n, origin: (1n << 63n) - 5n, counter: -(1n << 63n) + 5n},
  {initialized: 0, frequency: 5000n, origin: -2n, counter: 333338333n, success: 1, newFrequency: 10000000n, newOrigin: 5000n},
  {initialized: 0, frequency: 10000000n, origin: 1000n, counter: -2000n, success: 0}
];

test('race-clock489cd0 all caller/CRT private stack stores match retained instructions at preferred and relocated bases', async () => {
  const stopped = Error('Timer returned to source441cb0.');
  for (const base of [0x400000, 0x6e0000]) {
    const image = await loadRelocatedAudioFixture(base), actual = image.actual;
    for (const C of [0x9000, 0x9004]) for (const spec of cases) {
      const T = C - 16, sourceCalls = [], nativeCalls = [], memory = Buffer.from(image.memory);
      for (let p = C - 512; p < C + 16; p++) memory[p] = (p * 37 + 19) & 255;
      memory.writeUInt32LE(actual(0x441cb0), T); memory.writeInt32LE(spec.initialized, actual(0x6e6c8c));
      memory.writeUInt32LE(QPC, actual(0x56e0fc)); memory.writeUInt32LE(QPF, actual(0x56e114));
      memory.writeBigInt64LE(spec.frequency, actual(0x7135a4)); memory.writeBigInt64LE(spec.origin, actual(0x7135ac));
      const spans = [[C - 512, 528], ...fields.map(([p, n]) => [actual(p), n])];
      const source = createCapturedMemory(spans.map(([address, n]) => ({address, bytes: Buffer.from(memory.subarray(address, address + n))})),
        {aliases: fields.map(([address, length]) => ({address, targetAddress: actual(address), length}))});
      const outcome = (m, name, output) => {
        if (name === 'QueryPerformanceFrequency') {if (spec.success) m.writeBigInt64LE(spec.newFrequency, output); return spec.success;}
        m.writeBigInt64LE(output === actual(0x7135ac) ? spec.newOrigin : spec.counter, output); return 1;
      };
      const value = readGameMicroseconds({memory: source.memory, moduleBaseAddress: base, scratchBase: T, entryRegisters: incoming,
        nativeRaceClockCall: {clockEntryEsp: C, entryEsp: T, returnAddress: 0x441cb0},
        services: {platformCall(name, [output], context) {
          const entry = context.scratchBase, metadata = context.nativeRaceClockCall;
          assert.equal(source.memory.readUInt32LE(entry), metadata.serviceReturnAddress);
          assert.equal(source.memory.readUInt32LE(entry + 4), output); assert.ok(Object.isFrozen(metadata));
          sourceCalls.push({name, output, entry, preimage: source.span(output, 8).toString('hex')});
          return outcome(source.memory, name, output);
        }}});
      const instructions = [...image.instructions, {address: actual(0x441cb0), op: 'NOP', args: []}];
      const machine = new BoundedX86(instructions); machine.bytes = memory; machine.entry = actual(0x489cd0);
      Object.assign(machine.r, Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key, value | 0])), {ESP: T}); let instruction;
      machine.onInstruction = address => {instruction = address; if (address === actual(0x441cb0)) throw stopped;};
      for (const [target, name] of [[QPC, 'QueryPerformanceCounter'], [QPF, 'QueryPerformanceFrequency']]) {
        machine.externalCalls.set(target, m => {
          const output = m.bytes.readUInt32LE(m.r.ESP), entry = m.r.ESP - 4;
          const ret = name === 'QueryPerformanceFrequency' ? 0x489d01 : instruction === actual(0x489d0a) ? 0x489d0c : 0x489d13;
          m.bytes.writeUInt32LE(actual(ret), entry);
          nativeCalls.push({name, output, entry, preimage: m.bytes.subarray(output, output + 8).toString('hex')});
          m.r.EAX = outcome(m.bytes, name, output); m.r.ESP += 4;
        });
      }
      assert.throws(() => machine.run(100000), /Timer returned to source441cb0/);
      const native = BigInt.asIntN(64, BigInt(machine.r.EAX >>> 0) | BigInt(machine.r.EDX >>> 0) << 32n);
      assert.equal(value, native, `time base${base.toString(16)} C${C.toString(16)} ${JSON.stringify({...spec, frequency: String(spec.frequency), origin: String(spec.origin), counter: String(spec.counter), newFrequency: String(spec.newFrequency), newOrigin: String(spec.newOrigin)})}`);
      assert.deepEqual(sourceCalls, nativeCalls);
      for (const [address, length] of spans) assert.deepEqual(source.span(address, length), machine.bytes.subarray(address, address + length), `span${address.toString(16)}`);
      for (const name of Object.keys(incoming)) assert.equal(machine.r[name] >>> 0, incoming[name]);
    }
  }
});

test('race-clock timer caller is explicit and cannot weaken weather or missing-register contracts', () => {
  const memory = Buffer.alloc(0xa00000), C = 0x9000, T = C - 16;
  memory.writeUInt32LE(0x441cb0, T);
  const runtime = {memory, moduleBaseAddress: 0x400000, scratchBase: T, entryRegisters: incoming,
    nativeRaceClockCall: {clockEntryEsp: C, entryEsp: T, returnAddress: 0x441cb0}};
  assert.throws(() => readGameMicroseconds({...runtime, nativeWeatherCounterCall: {}}), /source-published/);
  assert.throws(() => readGameMicroseconds({...runtime, entryRegisters: {EBX: 0}}), /actual incoming EBP/);
  assert.throws(() => readGameMicroseconds({...runtime, nativeRaceClockCall: {...runtime.nativeRaceClockCall, clockEntryEsp: String(C)}}), /source-published/);
  assert.throws(() => readGameMicroseconds({...runtime, nativeRaceClockCall: {...runtime.nativeRaceClockCall, returnAddress: 0x498458}}), /source-published/);
  assert.throws(() => readGameMicroseconds(runtime), /observed QueryPerformanceFrequency IAT/);
  assert.equal(memory.readUInt32LE(0x6e6c8c), 1, 'Native initialization flag is stored before the reached platform boundary.');
  memory.writeUInt32LE(0, 0x6e6c8c);
  memory.writeUInt32LE(QPF, 0x56e114); memory.writeUInt32LE(QPC, 0x56e0fc);
  assert.throws(() => readGameMicroseconds({...runtime, services: {platformCall() {}}}), /actual QueryPerformanceFrequency EAX/);
});
