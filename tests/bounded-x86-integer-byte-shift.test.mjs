import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function fixture(instructions) {
  const machine = new BoundedX86([...instructions.map((i, index) => ({address: 0x1000 + index, op: i[0], args: i.slice(1)})), {address: 0x1000 + instructions.length, op: 'RET', args: []}]);
  machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); return machine;
}

test('known integer copy and byte shift publish low DWORDs without changing source lanes or flags', () => {
  const machine = fixture([['MOVDQA', 'XMM0', 'XMM1'], ['PSRLDQ', 'XMM0', '0x4'], ['MOVD', 'dword ptr [0x18001]', 'XMM1'], ['MOVD', 'dword ptr [0x18005]', 'XMM0']]);
  machine.integerVectors.set('XMM1', [0x12345678, -2147483648, -1, 17]);
  machine.bytes.fill(0xa5, 0x18000, 0x1800a); const flags = {z: true, c: true, o: false, s: true, p: false, a: true}; Object.assign(machine, flags);
  machine.qwords.set('XMM0', 17n); machine.scalarBits.set('XMM0', 5); machine.scalars.XMM0 = 1; machine.doubleScalars.add('XMM0'); machine.run();
  assert.deepEqual(machine.integerVectors.get('XMM0'), [-2147483648, -1, 17, 0]); assert.deepEqual(machine.integerVectors.get('XMM1'), [0x12345678, -2147483648, -1, 17]);
  assert.equal(machine.bytes.readUInt32LE(0x18001), 0x12345678); assert.equal(machine.bytes.readInt32LE(0x18005), -2147483648); assert.equal(machine.bytes[0x18000], 0xa5); assert.equal(machine.bytes[0x18009], 0xa5);
  for (const [key, value] of Object.entries(flags)) assert.equal(machine[key], value);
  assert.equal(machine.scalars.XMM0, undefined); assert(!machine.qwords.has('XMM0')); assert(!machine.scalarBits.has('XMM0')); assert(!machine.doubleScalars.has('XMM0'));
});

test('byte shifts handle cross-lane positions, zero counts and counts at or beyond128 bits', () => {
  for (const count of [0, 1, 3, 4, 15, 16, 17, 255]) {
    const machine = fixture([['PSRLDQ', 'XMM0', '0x' + count.toString(16)]]), input = Buffer.from(Array.from({length: 16}, (_, i) => i + 1));
    machine.integerVectors.set('XMM0', [0, 4, 8, 12].map(offset => input.readInt32LE(offset))); machine.run();
    const actual = Buffer.alloc(16); machine.integerVectors.get('XMM0').forEach((v, i) => actual.writeInt32LE(v, i * 4));
    const expected = Buffer.alloc(16); if (count < 16) input.copy(expected, 0, count); assert.deepEqual(actual, expected);
  }
});

test('unaligned-opcode register copy retains all known bits and independent lane ownership', () => {
  const machine = fixture([['MOVDQU', 'XMM1', 'XMM0']]);
  machine.integerVectors.set('XMM0', [-1, -2147483648, 0x7fa12345, 7]); machine.qwords.set('XMM1', 99n); machine.scalars.XMM1 = 2; machine.doubleScalars.add('XMM1'); machine.run();
  assert.deepEqual(machine.integerVectors.get('XMM1'), [-1, -2147483648, 0x7fa12345, 7]);
  machine.integerVectors.get('XMM1')[0] = 0; assert.equal(machine.integerVectors.get('XMM0')[0], -1);
  assert(!machine.qwords.has('XMM1')); assert.equal(machine.scalars.XMM1, undefined); assert(!machine.doubleScalars.has('XMM1'));
  const unknown = fixture([['MOVDQU', 'XMM0', 'XMM1']]); unknown.scalars.XMM1 = 1; assert.throws(() => unknown.run(), /Unadmitted/);
});

test('new vector forms reject unknown lanes, wrong-width stores and non-immediate shifts', () => {
  for (const instruction of [['MOVDQA', 'XMM0', 'XMM1'], ['MOVD', 'dword ptr [0x18000]', 'XMM1'], ['MOVD', 'word ptr [0x18000]', 'XMM1'], ['PSRLDQ', 'XMM0', 'ECX'], ['PSRLDQ', 'XMM0', '0x100']]) {
    const machine = fixture([instruction]); machine.scalars.XMM1 = 1; machine.integerVectors.set('XMM0', [1, 2, 3, 4]); assert.throws(() => machine.run(), /Unadmitted/);
  }
});
