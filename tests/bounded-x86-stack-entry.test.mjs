import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

test('sentinel returns validate the actual entry stack across nested calls', () => {
  for (const stack of [0x8800, 0x9000, 0x9400]) {
    const machine = new BoundedX86([{address: 0x1000, op: 'CALL', args: ['0x1100']}, {address: 0x1005, op: 'RET', args: []}, {address: 0x1100, op: 'PUSH', args: ['EBX']}, {address: 0x1101, op: 'POP', args: ['EBX']}, {address: 0x1102, op: 'RET', args: []}]);
    machine.r.ESP = stack; machine.bytes.writeInt32LE(-1, stack); machine.run(); assert.equal(machine.r.ESP, stack);
  }
});

test('sentinel returns reject a shifted stack even when the shifted slot also contains a sentinel', () => {
  const machine = new BoundedX86([{address: 0x1000, op: 'ADD', args: ['ESP', '0x4']}, {address: 0x1003, op: 'RET', args: []}]);
  machine.r.ESP = 0x9400; machine.bytes.writeInt32LE(-1, 0x9404); assert.throws(() => machine.run(), /Unbalanced stack/);
});

test('admitted tail calls preserve the caller-selected entry stack balance', () => {
  const machine = new BoundedX86([{address: 0x1000, op: 'JMP', args: ['0x2000']}], {externalCalls: new Map([[0x2000, () => {}]])});
  machine.r.ESP = 0x9400; machine.bytes.writeInt32LE(-1, 0x9400); machine.run(); assert.equal(machine.r.ESP, 0x9400);
});
