import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

function machine(operations) {
  const instructions = [...operations, ['RET']].map(([op, ...args], index) => ({address: 0x10000 + index, op, args}));
  const result = new BoundedX86(instructions); result.r.ESP = 0x9000; result.bytes.writeInt32LE(-1, 0x9000); return result;
}

test('projection low-float interleave and sign mask preserve raw MOVQ lane bits', () => {
  const m = machine([['MOVQ', 'XMM0', 'qword ptr [0x20000]'], ['MOVSS', 'XMM1', 'XMM0'], ['MOVSS', 'XMM2', 'dword ptr [0x20008]'], ['UNPCKLPS', 'XMM1', 'XMM2'], ['MOVAPS', 'XMM3', 'XMM1'], ['XORPS', 'XMM3', 'xmmword ptr [0x20100]'], ['MOVQ', 'qword ptr [0x20200]', 'XMM1'], ['MOVQ', 'qword ptr [0x20208]', 'XMM3']]);
  m.bytes.writeUInt32LE(0x3f800000, 0x20000); m.bytes.writeUInt32LE(0x40000000, 0x20004); m.bytes.writeUInt32LE(0x80000000, 0x20008); m.bytes.writeUInt32LE(0x80000000, 0x20100);
  m.run(); assert.equal(m.bytes.readBigUInt64LE(0x20200), 0x800000003f800000n); assert.equal(m.bytes.readBigUInt64LE(0x20208), 0x80000000bf800000n);
});

test('projection MOVSS bit copies preserve signaling NaN payloads without arithmetic', () => {
  const m = machine([['MOVQ', 'XMM0', 'qword ptr [0x20000]'], ['MOVSS', 'XMM1', 'XMM0'], ['MOVSS', 'dword ptr [0x20200]', 'XMM1']]);
  m.bytes.writeUInt32LE(0x7fa12345, 0x20000); m.run(); assert.equal(m.bytes.readUInt32LE(0x20200), 0x7fa12345);
});

test('projection scalar stores consume a genuine service return after earlier bit copies', () => {
  const m = machine([['MOVSS', 'XMM0', 'dword ptr [0x20000]'], ['CALL', '0x30000'], ['MOVSS', 'dword ptr [0x20200]', 'XMM0']]);
  m.bytes.writeFloatLE(1, 0x20000); m.externalCalls.set(0x30000, state => {state.scalars.XMM0 = 3;}); m.run(); assert.equal(m.bytes.readFloatLE(0x20200), 3);
});

test('low64 interleave rejects unknown source lanes and does not invent upper128 data', () => {
  const unknown = machine([['UNPCKLPS', 'XMM0', 'XMM1']]); assert.throws(() => unknown.run(), /Uninitialized low float lane/);
  const upper = machine([['XORPS', 'XMM0', 'XMM0'], ['UNPCKLPS', 'XMM0', 'XMM0'], ['MOVDQU', 'xmmword ptr [0x20200]', 'XMM0']]); assert.throws(() => upper.run(), /Unadmitted unaligned vector move/);
});

test('projection scalar arithmetic consumes raw low-float lanes and high-register compares', () => {
  const m = machine([['MOVQ', 'XMM6', 'qword ptr [0x20000]'], ['MOVSS', 'XMM7', 'XMM6'], ['MULSS', 'XMM6', 'XMM7'], ['MOVSS', 'dword ptr [0x20200]', 'XMM6'], ['COMISS', 'XMM6', 'XMM7']]);
  m.bytes.writeFloatLE(3, 0x20000); m.run(); assert.equal(m.bytes.readFloatLE(0x20200), 9); assert.equal(m.c, false); assert.equal(m.z, false);
});

test('projection XOR rejects arbitrary masks', () => {
  const m = machine([['XORPS', 'XMM0', 'XMM0'], ['XORPS', 'XMM0', 'xmmword ptr [0x20100]']]); m.bytes.writeUInt32LE(1, 0x20100); assert.throws(() => m.run(), /Unadmitted vector XOR mask/);
});

test('retained broadcast sign mask flips both known low64 float signs', () => {
  const m = machine([['MOVQ', 'XMM0', 'qword ptr [0x20000]'], ['XORPS', 'XMM0', 'xmmword ptr [0x20100]'], ['MOVQ', 'qword ptr [0x20200]', 'XMM0']]);
  m.bytes.writeBigUInt64LE(0x3f80000080000000n, 0x20000); for (const offset of [0, 4, 8, 12]) m.bytes.writeUInt32LE(0x80000000, 0x20100 + offset);
  m.run(); assert.equal(m.bytes.readBigUInt64LE(0x20200), 0xbf80000000000000n);
});

test('JNP takes ordered scalar comparisons and leaves unordered comparisons on the fallthrough', () => {
  for (const input of [1, NaN]) {
    const m = machine([['MOVSS', 'XMM0', 'dword ptr [0x20000]'], ['COMISS', 'XMM0', 'XMM0'], ['JNP', '0x10005'], ['MOV', 'EAX', '0x7'], ['RET'], ['MOV', 'EAX', '0x9']]);
    m.bytes.writeFloatLE(input, 0x20000); m.run(); assert.equal(m.r.EAX, Number.isNaN(input) ? 7 : 9);
  }
});
