import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const i = (address, op, ...args) => ({address, op, args}), S = 0x9000, IMPORT = 0x760000;
function fixture(instructions, callback, admitted = true) {
  const cpu = new BoundedX86(instructions, {externalCalls: new Map([[IMPORT, callback]]), externalTailCallAbi: new Set(admitted ? [IMPORT] : [])});
  cpu.r.ESP = S; cpu.bytes.writeUInt32LE(0xffffffff, S); return cpu;
}

test('nested stdcall tail presents the first argument and consumes its bytes exactly once', () => {
  const instructions = [i(0x1000, 'PUSH', '0x12345678'), i(0x1001, 'CALL', '0x2000'), i(0x1002, 'MOV', 'EBX', 'ESP'), i(0x1003, 'RET'), i(0x2000, 'JMP', '0x760000')];
  let calls = 0;
  const cpu = fixture(instructions, state => {calls++; assert.equal(state.r.ESP, S - 4); assert.equal(state.bytes.readUInt32LE(state.r.ESP), 0x12345678); assert.equal(state.bytes.readUInt32LE(state.r.ESP - 4), 0x1002); state.r.ESP += 4; state.r.EAX = 77;});
  cpu.run(); assert.equal(calls, 1); assert.equal(cpu.r.EAX, 77); assert.equal(cpu.r.EBX, S);
  assert.equal(cpu.bytes.readUInt32LE(S - 4), 0x12345678); assert.equal(cpu.bytes.readUInt32LE(S - 8), 0x1002);
});

test('cdecl tail leaves its argument for caller cleanup', () => {
  const cpu = fixture([i(0x1000, 'PUSH', '0x33'), i(0x1001, 'CALL', '0x2000'), i(0x1002, 'ADD', 'ESP', '0x4'), i(0x1003, 'RET'), i(0x2000, 'JMP', '0x760000')], state => {assert.equal(state.bytes.readUInt32LE(state.r.ESP), 0x33);});
  cpu.run(); assert.equal(cpu.r.ESP, S);
});

test('admitted standalone stdcall tail reaches the synthetic caller with its actual stack cleanup', () => {
  const cpu = fixture([i(0x1000, 'JMP', '0x760000')], state => {assert.equal(state.r.ESP, S + 4); state.r.ESP += 4;});
  cpu.bytes.writeUInt32LE(42, S + 4); cpu.run(); assert.equal(cpu.r.ESP, S + 8); assert.equal(cpu.bytes.readUInt32LE(S), 0xffffffff); assert.equal(cpu.bytes.readUInt32LE(S + 4), 42);
});

test('tail return address is read live after the genuine service returns', () => {
  const cpu = fixture([i(0x1000, 'CALL', '0x2000'), i(0x1001, 'MOV', 'EAX', '0x1'), i(0x1002, 'RET'), i(0x1003, 'MOV', 'EAX', '0x2'), i(0x1004, 'RET'), i(0x2000, 'JMP', '0x760000')], state => {state.bytes.writeUInt32LE(0x1003, state.r.ESP - 4);});
  cpu.run(); assert.equal(cpu.r.EAX, 2);
});

test('legacy unadmitted tail callback keeps its return-slot ABI', () => {
  const cpu = fixture([i(0x1000, 'JMP', '0x760000')], state => {assert.equal(state.r.ESP, S);}, false);
  cpu.run(); assert.equal(cpu.r.ESP, S);
});
