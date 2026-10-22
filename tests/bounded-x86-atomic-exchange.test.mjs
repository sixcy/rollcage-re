import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

function fixture(op, args) {
  const machine = new BoundedX86([{address: 0x1000, op, args}, {address: 0x1004, op: 'RET', args: []}]);
  machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); machine.r.EDX = 0x10000; machine.r.ECX = 0x234567;
  return machine;
}
const flags = machine => [machine.z, machine.s, machine.o, machine.c, machine.p, machine.a];

test('locked32-bit compare-exchange stores replacement on success and updates all comparison flags', () => {
  const m = fixture('CMPXCHG.LOCK', ['dword ptr [EDX]', 'ECX']); m.r.EAX = -123; m.bytes.writeInt32LE(-123, 0x10000);
  m.run(); assert.equal(m.bytes.readInt32LE(0x10000), 0x234567); assert.equal(m.r.EAX, -123); assert.equal(m.r.ECX, 0x234567);
  assert.deepEqual(flags(m), [true, false, false, false, true, false]);
});

test('failed compare-exchange loads old memory into EAX and preserves subtraction borrow/overflow/parity/auxiliary flags', () => {
  for (const [accumulator, old, expected] of [[-2147483648, 2147483647, [false, false, true, false, false, true]], [0, 1, [false, true, false, true, true, true]], [2147483647, -1, [false, true, true, true, true, false]]]) {
    const m = fixture('CMPXCHG.LOCK', ['dword ptr [EDX]', 'ECX']); m.r.EAX = accumulator; m.bytes.writeInt32LE(old, 0x10000);
    m.run(); assert.equal(m.r.EAX, old); assert.equal(m.bytes.readInt32LE(0x10000), old); assert.equal(m.r.ECX, 0x234567); assert.deepEqual(flags(m), expected);
  }
});

test('compare-exchange snapshots an EAX-based memory address before failure changes EAX', () => {
  const m = fixture('CMPXCHG.LOCK', ['dword ptr [EAX]', 'ECX']); m.r.EAX = 0x10000; m.bytes.writeInt32LE(0x70, 0x10000);
  m.run(); assert.equal(m.r.EAX, 0x70); assert.equal(m.bytes.readInt32LE(0x10000), 0x70); assert.equal(m.bytes.readInt32LE(0x70), 0);
});

test('memory exchange snapshots an aliased address register and preserves all flags', () => {
  const m = fixture('XCHG', ['dword ptr [ECX]', 'ECX']); m.r.ECX = 0x10000; m.bytes.writeInt32LE(-7, 0x10000);
  [m.z, m.s, m.o, m.c, m.p, m.a] = [true, false, true, false, true, true];
  m.run(); assert.equal(m.r.ECX, -7); assert.equal(m.bytes.readInt32LE(0x10000), 0x10000); assert.deepEqual(flags(m), [true, false, true, false, true, true]);
});

test('atomic exchange support rejects other widths, register destinations, immediates and extra operands', () => {
  for (const op of ['CMPXCHG.LOCK', 'XCHG']) for (const args of [['word ptr [EDX]', 'CX'], ['ECX', 'EAX'], ['dword ptr [EDX]', '0x1'], ['dword ptr [EDX]', 'ECX', 'EAX']]) {
    const m = fixture(op, args); assert.throws(() => m.run(), /Unadmitted/);
  }
});
