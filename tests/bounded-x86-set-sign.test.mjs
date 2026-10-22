import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

test('SETS observes SF independently of overflow and preserves the remaining register and memory bytes', () => {
  for (const value of [0, 1, -1, 0x7fffffff, -2147483648]) {
    const instructions = [
      {address: 0x1000, op: 'CMP', args: ['EAX', '0x1']},
      {address: 0x1001, op: 'SETS', args: ['DL']},
      {address: 0x1002, op: 'SETS', args: ['byte ptr [0x20001]']},
      {address: 0x1003, op: 'RET', args: []},
    ];
    const machine = new BoundedX86(instructions);
    machine.r.EAX = value >>> 0; machine.r.EDX = 0x12345678; machine.bytes.fill(0xa5, 0x20000, 0x20004); machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000);
    machine.run(); const sign = (value - 1 | 0) < 0 ? 1 : 0;
    assert.equal(machine.r.EDX >>> 0, 0x12345600 | sign); assert.deepEqual([...machine.bytes.subarray(0x20000, 0x20004)], [0xa5, sign, 0xa5, 0xa5]);
    assert.equal(machine.s, sign === 1);
  }
});
