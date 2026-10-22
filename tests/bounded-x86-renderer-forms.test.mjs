import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
const code = rows => rows.map(([address, op, ...args]) => ({address, op, args}));
const run = machine => {machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); machine.run();};
test('MOVUPS moves all128bits at unaligned addresses including payload and signed-zero bits', () => {
  const m = new BoundedX86(code([[0x1000, 'MOVUPS', 'XMM0', 'xmmword ptr [0x10001]'], [0x1001, 'MOVUPS', 'xmmword ptr [0x10006]', 'XMM0'], [0x1002, 'RET']]));
  const bytes = Buffer.from('0100c07f000000800000807fefcdab89', 'hex'); bytes.copy(m.bytes, 0x10001); run(m); assert.deepEqual(m.bytes.subarray(0x10006, 0x10016), bytes);
});
test('CVTSD2SS rounds double values and preserves known upper destination bits', () => {
  for (const value of [1 + 2 ** -24, 1 + 3 * 2 ** -24, -0, Infinity, -Infinity, 1e40]) {
    const m = new BoundedX86(code([[0x1000, 'CVTSD2SS', 'XMM1', 'XMM0'], [0x1001, 'MOVUPS', 'xmmword ptr [0x10000]', 'XMM1'], [0x1002, 'RET']]));
    m.scalars.XMM0 = value; m.doubleScalars.add('XMM0'); m.integerVectors.set('XMM1', [123, 0x76543210, -2, -1]); run(m);
    assert.ok(Object.is(m.bytes.readFloatLE(0x10000), Math.fround(value))); assert.deepEqual([4, 8, 12].map(o => m.bytes.readInt32LE(0x10000 + o)), [0x76543210, -2, -1]); assert.equal(m.doubleScalars.has('XMM1'), false);
  }
});
test('self CVTSD2SS retains known low64 upperword but refuses an invented full vector', () => {
  const m = new BoundedX86(code([[0x1000, 'CVTSD2SS', 'XMM0', 'XMM0'], [0x1001, 'MOVQ', 'qword ptr [0x10000]', 'XMM0'], [0x1002, 'RET']]));
  m.scalars.XMM0 = 123.456; m.doubleScalars.add('XMM0'); const original = Buffer.alloc(8); original.writeDoubleLE(123.456); run(m); assert.equal(m.bytes.readUInt32LE(0x10004), original.readUInt32LE(4)); assert.equal(m.bytes.readFloatLE(0x10000), Math.fround(123.456)); assert.equal(m.integerVectors.has('XMM0'), false);
  const invalid = new BoundedX86(code([[0x1000, 'MOVUPS', 'xmmword ptr [0x10000]', 'XMM0'], [0x1001, 'RET']])); invalid.scalars.XMM0 = 1; assert.throws(() => run(invalid), /Unadmitted unaligned vector move/);
});
test('CVTSD2SS rejects unknown or unmarked double input', () => {const m = new BoundedX86(code([[0x1000, 'CVTSD2SS', 'XMM0', 'XMM0'], [0x1001, 'RET']])); m.scalars.XMM0 = 1; assert.throws(() => run(m), /known double lane/);});
test('MOVAPS aligned memory transfers preserve every lane and invalidate stale scalar metadata', () => {
  const m = new BoundedX86(code([[0x1000, 'MOVAPS', 'XMM0', 'xmmword ptr [0x10000]'], [0x1001, 'MOVAPS', 'XMM6', 'XMM0'], [0x1002, 'MOVAPS', 'xmmword ptr [0x10020]', 'XMM6'], [0x1003, 'RET']]));
  const bytes = Buffer.from('0100c07f000000800000807fefcdab89', 'hex'); bytes.copy(m.bytes, 0x10000); m.scalars.XMM0 = 3; m.doubleScalars.add('XMM0'); m.qwords.set('XMM0', 7n); run(m); assert.deepEqual(m.bytes.subarray(0x10020, 0x10030), bytes); assert.equal(m.doubleScalars.has('XMM0'), false); assert.equal(m.qwords.has('XMM0'), false);
});
test('MOVAPS rejects unaligned access and unknown full-width store provenance', () => {
  for (const [a, b] of [['XMM0', 'xmmword ptr [0x10001]'], ['xmmword ptr [0x10001]', 'XMM0']]) {const m = new BoundedX86(code([[0x1000, 'MOVAPS', a, b], [0x1001, 'RET']])); m.integerVectors.set('XMM0', [1, 2, 3, 4]); assert.throws(() => run(m), /Unaligned MOVAPS/);}
  const m = new BoundedX86(code([[0x1000, 'MOVAPS', 'xmmword ptr [0x10000]', 'XMM0'], [0x1001, 'RET']])); m.scalars.XMM0 = 1; assert.throws(() => run(m), /all128 known bits/);
});
test('XORPS self-zero admits XMM6 with all four proven zero lanes', () => {const m = new BoundedX86(code([[0x1000, 'XORPS', 'XMM6', 'XMM6'], [0x1001, 'MOVAPS', 'xmmword ptr [0x10000]', 'XMM6'], [0x1002, 'RET']])); m.bytes.fill(0x69, 0x10000, 0x10010); run(m); assert.deepEqual(m.bytes.subarray(0x10000, 0x10010), Buffer.alloc(16));});
test('XORPS scalar register sign mask flips payload bits and preserves known low64 upperword', () => {const m = new BoundedX86(code([[0x1000, 'MOVSS', 'XMM3', 'dword ptr [0x10000]'], [0x1001, 'XORPS', 'XMM0', 'XMM3'], [0x1002, 'MOVQ', 'qword ptr [0x10008]', 'XMM0'], [0x1003, 'RET']])); m.bytes.writeUInt32LE(0x80000000, 0x10000); m.qwords.set('XMM0', 0x765432107fc00001n); m.scalarBits.set('XMM0', 0x7fc00001); run(m); assert.equal(m.bytes.readBigUInt64LE(0x10008), 0x76543210ffc00001n); assert.equal(m.integerVectors.has('XMM0'), false);});
test('XORPS rejects unproven register masks and does not invent consumed vector lanes', () => {for (const mask of [undefined, 0x8000000080000000n, 0x80000001n]) {const m = new BoundedX86(code([[0x1000, 'XORPS', 'XMM0', 'XMM3'], [0x1001, 'RET']])); m.scalars.XMM0 = 1; if (mask !== undefined) {m.qwords.set('XMM3', mask); m.scalarBits.set('XMM3', Number(mask & 0xffffffffn));} assert.throws(() => run(m), /sign mask provenance/);} const m = new BoundedX86(code([[0x1000, 'XORPS', 'XMM0', 'XMM3'], [0x1001, 'MOVAPS', 'xmmword ptr [0x10000]', 'XMM0'], [0x1002, 'RET']])); m.scalars.XMM0 = 1; m.qwords.set('XMM3', 0x80000000n); m.scalarBits.set('XMM3', 0x80000000); assert.throws(() => run(m), /all128 known bits/);});
