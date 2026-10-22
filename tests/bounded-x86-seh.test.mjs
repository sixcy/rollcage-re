import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
const code = rows => rows.map(([address, op, ...args]) => ({address, op, args}));
test('FS exception word is explicit, independent of flat memory and reset between fixtures', () => {
  const machine = new BoundedX86(code([[0x1000, 'RET']])); machine.bytes.writeUInt32LE(0x55667788, 0);
  assert.throws(() => machine.get('FS:[0x0]'), /explicit synthetic/); machine.fs0 = -1;
  assert.equal(machine.get('FS:[0x0]'), -1); machine.put('dword ptr FS:[0x0]', 0x87654321); assert.equal(machine.get('FS:[0x0]') >>> 0, 0x87654321); assert.equal(machine.bytes.readUInt32LE(0), 0x55667788);
  machine.reset(); assert.throws(() => machine.get('FS:[0x0]'), /explicit synthetic/);
});
test('nested native SEH link/unlink preserves both chains and the caller flags', () => {
  const machine = new BoundedX86(code([
    [0x1000, 'PUSH', '-0x1'], [0x1001, 'PUSH', '0x123456'], [0x1002, 'MOV', 'EAX', 'FS:[0x0]'], [0x1003, 'PUSH', 'EAX'], [0x1004, 'MOV', 'dword ptr FS:[0x0]', 'ESP'],
    [0x1005, 'CALL', '0x2000'], [0x1006, 'POP', 'ECX'], [0x1007, 'MOV', 'dword ptr FS:[0x0]', 'ECX'], [0x1008, 'POP', 'EAX'], [0x1009, 'POP', 'EAX'], [0x100a, 'RET'],
    [0x2000, 'PUSH', '-0x1'], [0x2001, 'PUSH', '0xabcdef'], [0x2002, 'MOV', 'EAX', 'FS:[0x0]'], [0x2003, 'PUSH', 'EAX'], [0x2004, 'MOV', 'dword ptr FS:[0x0]', 'ESP'],
    [0x2005, 'MOV', 'EDX', 'FS:[0x0]'], [0x2006, 'POP', 'ECX'], [0x2007, 'MOV', 'dword ptr FS:[0x0]', 'ECX'], [0x2008, 'POP', 'EAX'], [0x2009, 'POP', 'EAX'], [0x200a, 'RET']
  ]));
  machine.fs0 = 0xdeadbeef; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); machine.z = machine.c = machine.o = machine.a = true; machine.run();
  assert.equal(machine.r.ESP, 0x9000); assert.equal(machine.r.EDX, 0x8fe4); assert.equal(machine.bytes.readUInt32LE(0x8fe4), 0x8ff4); assert.equal(machine.fs0 >>> 0, 0xdeadbeef); assert.deepEqual([machine.z, machine.c, machine.o, machine.a], [true, true, true, true]);
});
test('unsupported TLS offsets, widths and segment-address forms fail explicitly', () => {
  const machine = new BoundedX86(code([[0x1000, 'RET']])); machine.fs0 = 123;
  for (const operand of ['FS:[0x4]', 'word ptr FS:[0x0]', 'byte ptr FS:[0x0]', 'FS:[EAX]']) {assert.throws(() => machine.get(operand), /synthetic/); assert.throws(() => machine.put(operand, 0), /synthetic/);}
  assert.throws(() => machine.get('GS:[0x0]'), /Unadmitted segmented/); assert.throws(() => machine.address('FS:[0x0]'), /Unadmitted segmented/);
});
