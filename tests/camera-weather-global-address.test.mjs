import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameMemory} from '../tools/lib/native-frame-memory.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {nativeGlobalAddress} from '../src/native-global-address.mjs';
import {transformWeatherDrawPoint, finishWeatherDrawPoint} from '../src/weather-draw.mjs';

//Constructed pointer/global collision, compared with SHA-verified PE-relocated
//432320/432470/4323f0 instructions. This is not original-process evidence.
const start = 0x91cd60, length = 0x600, output = 0x91cdb0, stack = 0x1200100;

for (const base of [0x6e0000, 0x320000]) {
  test(`weather projection preserves raw output91cdb0 while fixed globals relocate at base${base.toString(16)}`, async () => {
    const fixture = await loadRelocatedAudioFixture(base), actual = fixture.actual;
    for (const rejectNegative of [false, true]) {
      const domains = [[start, length], [0x91d3e4, 6], [0x6fb5dc, 4]];
      const rows = domains.map(([address, bytes]) => ({address: actual(address), bytes: Buffer.alloc(bytes)}));
      rows.push({address: output, bytes: Buffer.alloc(24, 0x69)}, {address: stack - 64, bytes: Buffer.alloc(128, 0x37)});
      const captured = createNativeFrameMemory(rows, {aliases: domains.map(([address, length]) => ({address, targetAddress: actual(address), length}))});
      const m = captured.memory, global = p => nativeGlobalAddress(m, p);
      const write = (p, v) => m.writeFloatLE(v, global(p));
      for (const [p, v] of [[0x91cda0, 330], [0x91cda4, 1], [0x91cdb0, 10], [0x91cdb4, 20], [0x91cdb8, 30],
        [0x91cdc0, 1], [0x91cdd4, 1], [0x91cde8, 1], [0x91ce04, 1000], [0x91ce0c, 1000]]) write(p, v);
      [1, 2, 3].forEach((v, i) => m.writeInt16LE(v, 0x91d3e4 + i * 2));
      const originalGlobals = Buffer.from(captured.span(actual(start), length));
      const machine = new BoundedX86(fixture.instructions); machine.bytes = Buffer.from(fixture.memory);
      for (const [address, bytes] of [...domains.map(([p, n]) => [actual(p), n]), [output, 24], [stack - 64, 128]]) captured.span(address, bytes).copy(machine.bytes, address);
      machine.entry = actual(rejectNegative ? 0x432470 : 0x432320);
      Object.assign(machine.r, {ESP: stack, ECX: output, EBP: 0x13572468, EBX: 0x24681357});
      machine.bytes.writeUInt32LE(0xffffffff, stack); machine.run();
      const pending = transformWeatherDrawPoint(output, {memory: m, scratchBase: stack, entryRegisters: {EBP: 0x13572468, EBX: 0x24681357}}, rejectNegative);
      assert.equal(pending, 10); assert.equal(machine.x87[0], pending);
      assert.deepEqual(captured.span(output, 24), machine.bytes.subarray(output, output + 24));
      assert.equal(m.readUInt32LE(global(0x91ce18)), output, 'Published pointer is the actual output address.');
      assert.equal(m.readFloatLE(global(0x91cdb0)), 10, 'Raw output writes do not overwrite the relocated translation.');
      finishWeatherDrawPoint(pending, {memory: m});
      machine.entry = actual(0x4323f0); machine.r.ESP = stack; machine.bytes.writeUInt32LE(0xffffffff, stack); machine.run();
      for (const [address, bytes] of [...domains.map(([p, n]) => [actual(p), n]), [output, 24]]) assert.deepEqual(captured.span(address, bytes), machine.bytes.subarray(address, address + bytes));
      assert.deepEqual([0, 4, 8, 12, 16, 20].map(p => p ? m.readFloatLE(output + p) : m.readInt32LE(output)), [0, 33, 110, 220, 11, 22]);
      assert.equal(machine.x87.length, 0);
      originalGlobals.writeUInt32LE(output, 0x91ce18 - start);
      assert.deepEqual(captured.span(actual(start), length), originalGlobals, 'Only the fixed output-pointer global changes.');
      assert.ok(rows.at(-2).bytes.every(value => value === 0x69), 'Original captured bytes remain immutable.');
    }
  });
}

test('a raw preferred-address span supplies no unobserved camera global route', () => {
  const {memory} = createNativeFrameMemory([
    {address: output, bytes: Buffer.alloc(24)},
    {address: 0x91d3e4, bytes: Buffer.alloc(6)},
    {address: 0xfc0, bytes: Buffer.alloc(128)}
  ]);
  assert.throws(() => transformWeatherDrawPoint(output, {memory, scratchBase: 0x1000}), /Unobserved native global/);
  assert.throws(() => nativeGlobalAddress(memory, 0x91cdb0), /Unobserved native global/);
  assert.throws(() => nativeGlobalAddress(memory, 0x91d360), /outside/);
});
