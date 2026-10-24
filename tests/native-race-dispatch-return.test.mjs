import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {resumeNativeRaceDispatchReturn} from '../src/native-race-dispatch-return.mjs';
import {verifyNativeRaceDispatchReturnInstructions} from '../tools/verify-native-race-dispatch-return-instructions.mjs';

function fixture({result = 1, iteration = 0, total = 1, base = 0x730000} = {}) {
  const P = 0x9004, storage = createCapturedMemory([{address: P - 16, bytes: Buffer.alloc(64, 0x69)}]), m = storage.memory;
  for (const [offset, value] of [[4, 0x909300], [8, 0x6e66b0], [12, 0x80f220], [16, 0x902040], [20, 0x91cdb0], [24, base + 0x40cd5]]) m.writeUInt32LE(value, P + offset);
  return {...storage, P, base, runtime: {memory: m, moduleBaseAddress: base, scratchBase: P, entryRegisters: {EAX: result, ESI: iteration, EDI: total}}};
}

test('successful final child restores live outer words without rebasing address-shaped values', () => {
  const f = fixture(), before = Buffer.from(f.span(f.P - 16, 64)), result = resumeNativeRaceDispatchReturn(f.runtime);
  assert.equal(result.kind, 'returned'); assert.equal(result.nextIteration, 1); assert.equal(result.childExecuted, false);
  assert.deepEqual(result.registers, {eax: 1, esi: 0x6e66b0, edi: 0x909300, ebx: 0x902040, ebp: 0x80f220, ecx: 0x91cdb0, eip: f.base + 0x40cd5, esp: f.P + 28});
  assert.equal(Object.hasOwn(result.registers, 'edx'), false, 'Unknown incoming volatile is not invented.');
  assert.deepEqual(f.span(f.P - 16, 64), before); assert.equal(result.continuation, null);
});

test('failed child exits without increment and leaves TEST auxiliary carry explicitly unknown', () => {
  const f = fixture({result: 0, iteration: 0xffffffff, total: 3}), result = resumeNativeRaceDispatchReturn(f.runtime);
  assert.equal(result.kind, 'returned'); assert.equal(result.childResult, 0); assert.equal(result.nextIteration, null);
  assert.equal(result.registers.eax, 0); assert.equal(result.arithmeticFlags.auxiliary, null); assert.equal(result.flags.knownMask, 0x8c5);
  assert.equal(result.arithmeticFlags.zero, true); assert.equal(result.arithmeticFlags.carry, false);
});

test('sibling publishes genuine CALL frame and iteration while deferring all unavailable outer-pop storage', () => {
  const P = 0x6e6804, f = createCapturedMemory([{address: P - 4, bytes: Buffer.alloc(8, 0x69)}]);
  const result = resumeNativeRaceDispatchReturn({memory: f.memory, moduleBaseAddress: 0x730000, scratchBase: P,
    entryRegisters: {EAX: 1, ESI: 0, EDI: 2, EBP: 0x6e66b0, ECX: 0x91cdb0}});
  assert.equal(result.kind, 'sibling'); assert.deepEqual(result.continuation, {entryAddress: 0x780e50, entryEsp: P - 4, returnAddress: 0x780e38, iteration: 1, totalIterations: 2});
  assert.deepEqual([f.memory.readUInt32LE(P - 4), f.memory.readUInt32LE(P)], [0x780e38, 2]);
  assert.equal(result.registers.edx, 1); assert.equal(result.registers.ebp, 0x6e66b0); assert.equal(result.registers.ecx, 0x91cdb0);
  assert.equal(result.childExecuted, false);
});

test('unsigned iteration wrap follows original INC/CMP rather than a signed loop or checked increment', () => {
  const f = fixture({iteration: 0xffffffff, total: 1}), result = resumeNativeRaceDispatchReturn(f.runtime);
  assert.equal(result.kind, 'sibling'); assert.equal(result.nextIteration, 0); assert.equal(result.registers.edx, 0);
  const negative = fixture({iteration: 0x7fffffff, total: 0x80000001});
  assert.equal(resumeNativeRaceDispatchReturn(negative.runtime).kind, 'sibling');
});

test('missing required CPU state and mismatched explicit boundary metadata fail instead of selecting a child', () => {
  for (const mutate of [r => {delete r.entryRegisters.EAX;}, r => {r.entryRegisters.ESI = -1;}, r => {r.entryRegisters.ESP = r.scratchBase - 4;},
    r => {r.entryRegisters.EIP = 0x450e50;}, r => {r.scratchBase++;}, r => {r.eflags = NaN;}]) {
    const f = fixture(); mutate(f.runtime); assert.throws(() => resumeNativeRaceDispatchReturn(f.runtime));
  }
});

test('return suffix, raw pops, unsigned siblings and defined flags match504 retained-instruction paths', async () => {
  const report = await verifyNativeRaceDispatchReturnInstructions(); assert.equal(report.matched, true); assert.equal(report.fixtures, 504);
  assert.ok(report.siblings > 0 && report.returned > 0 && report.failureCases > 0);
});
