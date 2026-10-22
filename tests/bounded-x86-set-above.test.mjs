import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

test('SETA uses unsigned strict comparison and preserves destination upper bytes and comparison flags', () => {
  for (const [left, right, expected] of [[5, 5, 0], [5, 6, 0], [6, 5, 1], [-1, 1, 1], [0, -1, 0], [-2147483648, 0x7fffffff, 1]]) {
    const machine = new BoundedX86([{address: 0x1000, op: 'CMP', args: ['EAX', 'EBX']}, {address: 0x1001, op: 'SETA', args: ['CL']}, {address: 0x1002, op: 'RET', args: []}]);
    machine.r.EAX = left; machine.r.EBX = right; machine.r.ECX = 0x123456ab; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000);
    machine.run(); assert.equal(machine.r.ECX, 0x12345600 | expected); assert.equal(machine.c, (left >>> 0) < (right >>> 0)); assert.equal(machine.z, left === right);
  }
});
