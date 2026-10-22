import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function cpu(operations) {
  const machine = new BoundedX86([...operations, ['RET']].map(([op, ...args], i) => ({address: 0x1000 + i, op, args})));
  machine.r.ESP = 0x9000; machine.bytes.writeUInt32LE(0xffffffff, 0x9000); return machine;
}
test('DIVSD divides known registers at double precision and preserves integer flags', () => {
  const m = cpu([['MOVSD', 'XMM0', 'qword ptr [0x20000]'], ['MOVSD', 'XMM1', 'qword ptr [0x20008]'], ['DIVSD', 'XMM0', 'XMM1'], ['MOVSD', 'qword ptr [0x20010]', 'XMM0']]);
  m.bytes.writeDoubleLE(1, 0x20000); m.bytes.writeDoubleLE(3, 0x20008); m.z = m.c = m.o = true; m.p = m.a = m.s = false; m.run();
  assert.equal(m.bytes.readDoubleLE(0x20010), 1 / 3); assert.notEqual(m.bytes.readDoubleLE(0x20010), Math.fround(1 / 3));
  assert.deepEqual([m.z, m.c, m.o, m.p, m.a, m.s], [true, true, true, false, false, false]);
});
test('DIVSD memory operand preserves the packed upper double lane', () => {
  const m = cpu([['CVTDQ2PD', 'XMM0', 'XMM0'], ['DIVSD', 'XMM0', 'qword ptr [0x20000]'], ['MOVDQU', 'xmmword ptr [0x30000]', 'XMM0']]);
  m.integerVectors.set('XMM0', [7, -32768, 99, 101]); m.bytes.writeDoubleLE(3, 0x20000); m.run();
  assert.equal(m.bytes.readDoubleLE(0x30000), 7 / 3); assert.equal(m.bytes.readDoubleLE(0x30008), -32768);
});
test('DIVSD follows signed zero and nonfinite numeric results without float32 narrowing', () => {
  for (const [left, right, expected] of [[1, -0, -Infinity], [-0, 7, -0], [0, 0, NaN], [Infinity, Infinity, NaN], [Number.MIN_VALUE, 1, Number.MIN_VALUE]]) {
    const m = cpu([['DIVSD', 'XMM0', 'XMM1']]); m.scalars.XMM0 = left; m.scalars.XMM1 = right; m.doubleScalars.add('XMM0'); m.doubleScalars.add('XMM1'); m.run();
    assert(Object.is(m.scalars.XMM0, expected));
  }
});
test('DIVSD rejects unproven double lanes and unretained operand forms', () => {
  for (const args of [['XMM0', 'XMM1'], ['XMM0', 'dword ptr [0x20000]'], ['qword ptr [0x20000]', 'XMM0'], ['XMM0', 'XMM7'], ['XMM0', 'XMM1', 'XMM2']]) {
    const m = cpu([['DIVSD', ...args]]); m.scalars.XMM0 = 1; m.scalars.XMM1 = 2;
    if (args.length !== 2 || args[1] !== 'XMM1') {m.doubleScalars.add('XMM0'); m.doubleScalars.add('XMM1');}
    assert.throws(() => m.run(), /Unadmitted scalar-double division/);
  }
});
