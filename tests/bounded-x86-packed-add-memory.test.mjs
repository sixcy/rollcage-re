// Synthetic admission/width tests; the actual471787 is checked by its native caller proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function machine(op = 'PADDD', source = 'xmmword ptr [0x18000]') {
  const m = new BoundedX86([{address: 0x1000, op, args: ['XMM0', source]}, {address: 0x1001, op: 'RET', args: []}]);
  m.r.ESP = 0x9000; m.bytes.writeInt32LE(-1, 0x9000); return m;
}
test('aligned memory PADDD wraps four independent lanes without flags or memory changes', () => {
  const m = machine(); m.integerVectors.set('XMM0', [2147483647, -2147483648, -1, 7]);
  [1, -1, 1, -10].forEach((value, i) => m.bytes.writeInt32LE(value, 0x18000 + i * 4));
  const before = Buffer.from(m.bytes.subarray(0x17fff, 0x18011));
  const flags = {z: true, s: false, o: true, c: false, p: true, a: false}; Object.assign(m, flags);
  m.scalars.XMM0 = 12; m.doubleScalars.add('XMM0'); m.qwords.set('XMM0', 1n); m.scalarBits.set('XMM0', 123);
  m.run();
  assert.deepEqual(m.integerVectors.get('XMM0'), [-2147483648, 2147483647, 0, -3]);
  assert.deepEqual(m.bytes.subarray(0x17fff, 0x18011), before);
  for (const [name, value] of Object.entries(flags)) assert.equal(m[name], value);
  assert.equal(m.scalars.XMM0, undefined); assert.equal(m.doubleScalars.has('XMM0'), false); assert.equal(m.qwords.has('XMM0'), false); assert.equal(m.scalarBits.has('XMM0'), false);
});
test('PADDD requires proven full destination lanes and aligned memory', () => {
  const unknown = machine(); unknown.scalars.XMM0 = 1;
  assert.throws(() => unknown.run(), /Unadmitted packed integer operands/);
  const unaligned = machine('PADDD', 'xmmword ptr [0x18001]'); unaligned.integerVectors.set('XMM0', [0, 0, 0, 0]);
  assert.throws(() => unaligned.run(), /Unaligned PADDD/);
});
test('packed memory admission does not broaden shifts, shuffles or scalar-width operands', () => {
  for (const [op, source] of [['PSHUFD', 'xmmword ptr [0x18000]'], ['PSLLD', 'xmmword ptr [0x18000]'], ['PADDD', 'dword ptr [0x18000]'], ['PADDD', 'xmmword ptr [EBX]']]) {
    const m = machine(op, source); m.integerVectors.set('XMM0', [1, 2, 3, 4]);
    assert.throws(() => m.run(), /Unadmitted packed integer operands/);
  }
});
