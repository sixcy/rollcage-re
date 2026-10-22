import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

test('SETO follows unsigned multiply overflow and writes only the byte destination', () => {
  for (const value of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
    const machine = new BoundedX86([
      {address: 0x1000, op: 'MUL', args: ['ECX']},
      {address: 0x1001, op: 'SETO', args: ['BL']},
      {address: 0x1002, op: 'SETO', args: ['byte ptr [0x20001]']},
      {address: 0x1003, op: 'RET', args: []},
    ]);
    machine.r.EAX = value; machine.r.ECX = 2; machine.r.EBX = 0x12345678; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); machine.bytes.fill(0xa5, 0x20000, 0x20004);
    machine.run(); const overflow = value > 0x7fffffff ? 1 : 0;
    assert.equal(machine.r.EBX >>> 0, 0x12345600 | overflow); assert.deepEqual([...machine.bytes.subarray(0x20000, 0x20004)], [0xa5, overflow, 0xa5, 0xa5]);
  }
});

test('32-bit PUSHAD saves the original stack pointer and POPAD skips its slot', () => {
  const machine = new BoundedX86([
    {address: 0x1000, op: 'PUSHAD', args: []},
    {address: 0x1001, op: 'MOV', args: ['dword ptr [ESP+0xc]', '0x1234']},
    {address: 0x1002, op: 'MOV', args: ['EAX', '0x0']},
    {address: 0x1003, op: 'POPAD', args: []},
    {address: 0x1004, op: 'RET', args: []},
  ]);
  const registers = ['EAX', 'ECX', 'EDX', 'EBX', 'EBP', 'ESI', 'EDI']; registers.forEach((name, index) => {machine.r[name] = 0x11220000 + index;}); machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); machine.o = machine.c = true;
  machine.onInstruction = address => {if (address === 0x1001) assert.equal(machine.bytes.readUInt32LE(0x8fec), 0x9000);};
  machine.run(); registers.forEach((name, index) => assert.equal(machine.r[name], 0x11220000 + index)); assert.equal(machine.r.ESP, 0x9000); assert.equal(machine.o, true); assert.equal(machine.c, true);
});
