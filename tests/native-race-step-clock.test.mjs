import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeRaceStepClock} from '../src/native-race-step-clock.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';

//Constructed original-image inputs and synthetic QPC outcomes. Independent
//retained-instruction comparisons live in the timer test and parent checker.
const globals = [[0x6e66f8, 4], [0x6e66b0, 8], [0x6e66e4, 4], [0x6eafe0, 4], [0x6e6c8c, 4],
  [0x7135a4, 16], [0x56e0fc, 4], [0x56e114, 4], [0x5dc6e0, 8], [0x56f6a0, 0x82]];
const images = new Map();
async function fixture({base = 0x400000, C = 0x9000, delivered = 100, streak = 0, flags = 0, origin = 0n, times = [3500000n], cw = 0x7f, mxcsr = 0x1f80} = {}) {
  if (!images.has(base)) images.set(base, loadRelocatedAudioFixture(base));
  const image = await images.get(base), actual = image.actual;
  const source = createCapturedMemory([{address: C - 512, bytes: Buffer.alloc(520, 0x69)},
    ...globals.map(([p, n]) => ({address: actual(p), bytes: Buffer.from(image.memory.subarray(actual(p), actual(p) + n))}))],
  {aliases: globals.map(([address, length]) => ({address, length, targetAddress: actual(address)}))});
  const m = source.memory, put = (p, value) => m.writeUInt32LE(value >>> 0, p), events = [], calls = [];
  put(C, actual(0x450df0)); put(0x6e66f8, delivered); put(0x6e66e4, streak); put(0x6eafe0, flags); put(0x6e6c8c, 1);
  m.writeBigUInt64LE(BigInt.asUintN(64, origin), 0x6e66b0); m.writeBigInt64LE(1000000n, 0x7135a4); m.writeBigInt64LE(0n, 0x7135ac);
  put(0x56e0fc, 0x1700000); put(0x56e114, 0x1700010);
  const numericalContext = decodePhysicsNumericalContext({x87ControlWord: cw, mxcsr});
  const runtime = {memory: m, moduleBaseAddress: base, scratchBase: C, numericalContext,
    entryRegisters: {EBX: 0x12345678, EBP: 0x87654321, ESI: 0xabcdef01, EDI: 0xfedcba98},
    observeNativeClock: event => events.push(event), services: {platformCall(name, [output], context) {
      calls.push({name, output, entryEsp: context.scratchBase});
      assert.equal(name, 'QueryPerformanceCounter'); assert.ok(times.length, 'Every reached service needs its own declared outcome.');
      m.writeBigInt64LE(times.shift(), output); return 1;
    }}};
  return {...source, m, runtime, C, actual, events, calls, put};
}

test('first delivery records the actual timer origin without reading the conversion factor', async () => {
  const f = await fixture({delivered: 0, streak: 9, origin: 42n, times: [1234567n]});
  f.m.writeDoubleLE(0, 0x5dc6e0); //First-delivery branch must never read it.
  const reserved = Buffer.from(f.span(f.C - 8, 8));
  assert.equal(runNativeRaceStepClock(f.runtime), 1);
  assert.equal(f.m.readBigInt64LE(0x6e66b0), 1234567n); assert.equal(f.m.readUInt32LE(0x6e66f8), 1); assert.equal(f.m.readUInt32LE(0x6e66e4), 0);
  assert.deepEqual(f.span(f.C - 8, 8), reserved); assert.equal(f.calls.length, 1);
  const returned = f.events.at(-1); assert.equal(returned.initialized, true); assert.equal(returned.targetClock, null);
  assert.deepEqual(returned.registers, {eax: 1, ebx: 0x12345678, ebp: 0x87654321, esi: 0xabcdef01, edi: 0xfedcba98, esp: f.C + 4, eip: 0x450df0});
});

test('offline still executes fresh time/conversions and preserves the original below105 scale result', async () => {
  const f = await fixture({streak: 9});
  const context = structuredClone(f.runtime.numericalContext), reserved = Buffer.from(f.span(f.C - 8, 8));
  assert.equal(runNativeRaceStepClock(f.runtime), 1); assert.equal(f.calls.length, 1);
  assert.equal(f.events.at(-1).targetClock, 104, 'The native factor is one final bit below3e-5.');
  assert.equal(f.m.readUInt32LE(0x6e66f8), 101); assert.equal(f.m.readUInt32LE(0x6e66e4), 0);
  assert.equal(f.events.at(-1).numericalState.mxcsr, 0x1fa0, 'Source-derived inexact status is carried explicitly.');
  assert.deepEqual(f.runtime.numericalContext, context); assert.deepEqual(f.span(f.C - 8, 8), reserved);
});

test('eligible backlog uses the actual converted lowDWORD, streak threshold and three-step cap', async () => {
  for (const [delivered, streak, time, count, nextStreak] of [
    [100, 0, 3500000n, 3, 10], [101, 8, 3450000n, 1, 9], [101, 9, 3450000n, 2, 10], [105, 9, 3500000n, 1, 0]
  ]) {
    const f = await fixture({delivered, streak, times: [time], flags: 0x83});
    assert.equal(runNativeRaceStepClock(f.runtime), count); assert.equal(f.m.readUInt32LE(0x6e66f8), delivered + count);
    assert.equal(f.m.readUInt32LE(0x6e66e4), nextStreak);
  }
});

test('deliveryDWORD overflow genuinely re-enters origin initialization on the following call', async () => {
  const f = await fixture({delivered: 0xffffffff, times: [3500000n, 3700000n]});
  assert.equal(runNativeRaceStepClock(f.runtime), 1); assert.equal(f.m.readUInt32LE(0x6e66f8), 0);
  assert.equal(runNativeRaceStepClock(f.runtime), 1); assert.equal(f.m.readUInt32LE(0x6e66f8), 1);
  assert.equal(f.m.readBigInt64LE(0x6e66b0), 3700000n); assert.equal(f.events.at(-1).initialized, true); assert.equal(f.calls.length, 2);
});

test('origin borrow wraps unsigned64 before source conversion under relocated and legal PC64 contexts', async () => {
  for (const cw of [0x7f, 0x27f, 0x37f]) {
    const f = await fixture({base: 0x6e0000, C: 0x9004, origin: 1n, times: [0n], cw});
    assert.equal(runNativeRaceStepClock(f.runtime), 1);
    assert.equal(f.events.find(event => event.stage === 'unsigned64-to-double').elapsed, (1n << 64n) - 1n);
    assert.equal(f.events.at(-1).numericalState.x87ControlWord, cw); assert.equal(f.events.at(-1).registers.eip, f.actual(0x450df0));
    assert.equal(f.calls[0].output, Math.floor((f.C - 20) / 8) * 8 - 8);
  }
});

test('unsupported contexts, missing external outcomes and altered scale cannot select guessed ticks', async () => {
  const invalid = await fixture(); invalid.runtime.numericalContext.sse.mxcsr |= 0x2000;
  assert.throws(() => runNativeRaceStepClock(invalid.runtime), /masked nearest-even/); assert.equal(invalid.calls.length, 0);
  const absent = await fixture(); absent.runtime.services.platformCall = () => {throw Error('Unbound synthetic QPC.');};
  assert.throws(() => runNativeRaceStepClock(absent.runtime), /Unbound synthetic QPC/); assert.equal(absent.m.readUInt32LE(0x6e66f8), 100);
  const altered = await fixture(); altered.m.writeDoubleLE(0.00003, 0x5dc6e0);
  assert.throws(() => runNativeRaceStepClock(altered.runtime), /observed original5dc6e0/); assert.equal(altered.calls.length, 1); assert.equal(altered.m.readUInt32LE(0x6e66f8), 100);
  const register = await fixture(); delete register.runtime.entryRegisters.EDI;
  assert.throws(() => runNativeRaceStepClock(register.runtime), /incoming EDI/);
  const reserved = await fixture(); reserved.runtime.numericalContext.x87.controlWord = 0x17f;
  assert.throws(() => runNativeRaceStepClock(reserved.runtime), /explicit legal x87/);
});

test('explicit raw x87 status reaches the real unmasked except1 frame instead of disappearing between conversions', async () => {
  for (const base of [0x400000, 0x6e0000]) {
    const f = await fixture({base, cw: 0x5f}); f.runtime.numericalContext.x87.statusWord = 0;
    const original = structuredClone(f.runtime.numericalContext);
    assert.throws(() => runNativeRaceStepClock(f.runtime), error => {
      assert.match(error.message, /unbound MSVCR120 except1/);
      const b = error.nativeClockConversionBoundary, F = f.C - 52;
      assert.equal(b.entry, f.actual(0x5692fa)); assert.equal(b.returnAddress, f.actual(0x568c3b));
      assert.equal(b.entryEsp, F - 4); assert.equal(b.argumentAddress, F); assert.equal(b.status, 0x10); assert.equal(b.oldControlWord, 0x5f);
      assert.deepEqual(b.numericalState, {x87ControlWord: 0x133f, mxcsr: 0x1fa0, x87StatusWord: 0});
      assert.equal(f.m.readUInt32LE(F - 4), f.actual(0x568c3b));
      assert.deepEqual([f.m.readUInt32LE(F), f.m.readUInt32LE(F + 4), f.m.readUInt32LE(F + 24)], [0x10, 0, 0x5f]);
      assert.equal(f.m.readDoubleLE(F + 8), 104.99999999999999); assert.equal(f.m.readBigUInt64LE(F + 16), b.inputBits);
      return true;
    });
    assert.equal(f.calls.length, 1); assert.equal(f.m.readUInt32LE(0x6e66f8), 100);
    assert.deepEqual(f.runtime.numericalContext, original);
  }
  const absent = await fixture({cw: 0x5f});
  assert.throws(() => runNativeRaceStepClock(absent.runtime), error => {
    assert.match(error.message, /requires observed x87 status/); assert.equal(error.nativeClockConversionBoundary, undefined); return true;
  });
});

test('masked and initialization returns retain supplied status while absent status remains absent', async () => {
  for (const delivered of [0, 100]) {
    const f = await fixture({delivered}); f.runtime.numericalContext.x87.statusWord = 0x2000;
    assert.equal(runNativeRaceStepClock(f.runtime), 1); assert.equal(f.events.at(-1).numericalState.x87StatusWord, 0x2000);
  }
  const absent = await fixture(); runNativeRaceStepClock(absent.runtime);
  assert.equal(Object.hasOwn(absent.events.at(-1).numericalState, 'x87StatusWord'), false);
  for (const statusWord of [-1, 0x10000, NaN, '0']) {
    const invalid = await fixture(); invalid.runtime.numericalContext.x87.statusWord = statusWord;
    assert.throws(() => runNativeRaceStepClock(invalid.runtime), /raw x87 status word/); assert.equal(invalid.calls.length, 0);
  }
});
