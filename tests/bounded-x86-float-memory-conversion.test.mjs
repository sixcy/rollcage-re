import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

test('camera truncating float conversion consumes a32-bit memory operand and keeps integer-indefinite boundaries', () => {
  for (const [value, expected] of [[1.75, 1], [-1.75, -1], [-0, 0], [2147483520, 2147483520], [2147483648, -2147483648], [-2147483648, -2147483648], [NaN, -2147483648], [Infinity, -2147483648]]) {
    const m = new BoundedX86([{address: 0x10000, op: 'CVTTSS2SI', args: ['EAX', 'dword ptr [0x20000]']}, {address: 0x10008, op: 'RET', args: []}]);
    m.r.ESP = 0x9000; m.bytes.writeInt32LE(-1, 0x9000); m.bytes.writeFloatLE(value, 0x20000); m.run(); assert.equal(m.r.EAX, expected);
  }
});

test('memory float conversion retains rejection of narrow and double memory operands', () => {
  for (const operand of ['word ptr [0x20000]', 'qword ptr [0x20000]']) {
    const m = new BoundedX86([{address: 0x10000, op: 'CVTTSS2SI', args: ['EAX', operand]}]); assert.throws(() => m.run(), /Unadmitted truncating-float conversion/);
  }
});
