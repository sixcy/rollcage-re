import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

function execute(a, b, carry, destination = 'EAX') {
  const source = destination === 'AL' ? 'BL' : destination === 'AX' ? 'BX' : 'EBX';
  const m = new BoundedX86([{address: 0x1000, op: 'ADC', args: [destination, source]}, {address: 0x1001, op: 'RET', args: []}]);
  m.r.EAX = a; m.r.EBX = b; m.c = carry; m.r.ESP = 0x9000; m.bytes.writeUInt32LE(0xffffffff, 0x9000); m.run(); return m;
}

test('ADC highword carry propagates through zero with unsigned carry and auxiliary carry', () => {
  const m = execute(-1, 0, true); assert.equal(m.r.EAX, 0); assert.equal(m.c, true); assert.equal(m.z, true); assert.equal(m.o, false); assert.equal(m.a, true); assert.equal(m.p, true);
});

test('ADC distinguishes signed overflow from unsigned carry with incoming carry', () => {
  const positive = execute(0x7fffffff, 0, true); assert.equal(positive.r.EAX, -2147483648); assert.equal(positive.o, true); assert.equal(positive.c, false); assert.equal(positive.s, true);
  const negative = execute(-2147483648, -1, true); assert.equal(negative.r.EAX, -2147483648); assert.equal(negative.o, false); assert.equal(negative.c, true);
  const overflow = execute(-2147483648, -1, false); assert.equal(overflow.r.EAX, 0x7fffffff); assert.equal(overflow.o, true); assert.equal(overflow.c, true);
});

test('ADC byte and word flags use operand width and preserve upper register bytes', () => {
  const byte = execute(0x123400ff, 0, true, 'AL'); assert.equal(byte.r.EAX, 0x12340000); assert.equal(byte.c, true); assert.equal(byte.z, true); assert.equal(byte.o, false);
  const word = execute(0x12347fff, 0, true, 'AX'); assert.equal(word.r.EAX, 0x12348000); assert.equal(word.o, true); assert.equal(word.c, false); assert.equal(word.s, true);
});
