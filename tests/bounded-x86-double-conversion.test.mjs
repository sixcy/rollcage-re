import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

function machineFor(operations) {
  const machine = new BoundedX86([...operations.map(([op, ...args], index) => ({address: 0x1000 + index, op, args})), {address: 0x1000 + operations.length, op: 'RET', args: []}]);
  machine.r.ESP = 0x9000; machine.bytes.writeUInt32LE(0xffffffff, 0x9000);
  return machine;
}

test('double conversion preserves both signed integer lanes and rounds both floats', () => {
  const machine = machineFor([['CVTDQ2PD', 'XMM0', 'XMM0'], ['ADDSD', 'XMM0', 'qword ptr [0x20000]'], ['CVTPD2PS', 'XMM0', 'XMM0'], ['MOVDQU', 'xmmword ptr [0x30000]', 'XMM0']]);
  machine.integerVectors.set('XMM0', [-2147483648, 2147483647, 13, 17]);
  machine.qwords.set('XMM0', 123n); machine.zeroVectors.add('XMM0');
  machine.bytes.writeDoubleLE(4294967296, 0x20000); machine.run();
  assert.equal(machine.bytes.readFloatLE(0x30000), 2147483648);
  assert.equal(machine.bytes.readFloatLE(0x30004), Math.fround(2147483647));
  assert.equal(machine.bytes.readBigUInt64LE(0x30008), 0n);
  assert.equal(machine.qwords.has('XMM0'), false); assert.equal(machine.zeroVectors.has('XMM0'), false);
});

test('double add preserves upper lane and applies float32 rounding after addition', () => {
  const machine = machineFor([['CVTDQ2PD', 'XMM0', 'XMM0'], ['ADDSD', 'XMM0', 'qword ptr [0x20000]'], ['MOVDQU', 'xmmword ptr [0x30000]', 'XMM0'], ['CVTPD2PS', 'XMM0', 'XMM0'], ['MOVDQU', 'xmmword ptr [0x30010]', 'XMM0']]);
  machine.integerVectors.set('XMM0', [16777217, -32768, 0, 0]); machine.bytes.writeDoubleLE(0.5, 0x20000); machine.run();
  assert.equal(machine.bytes.readDoubleLE(0x30000), 16777217.5);
  assert.equal(machine.bytes.readDoubleLE(0x30008), -32768);
  assert.equal(machine.bytes.readFloatLE(0x30010), Math.fround(16777217.5));
  assert.equal(machine.bytes.readFloatLE(0x30014), -32768);
});

test('scalar writes invalidate packed provenance before a double-lane consumer', () => {
  const machine = machineFor([['CVTDQ2PD', 'XMM0', 'XMM0'], ['MOVSS', 'XMM0', 'dword ptr [0x20000]'], ['CVTPD2PS', 'XMM0', 'XMM0']]);
  machine.integerVectors.set('XMM0', [1, 2, 0, 0]);
  assert.throws(() => machine.run(), /both known double lanes/);
  const second = machineFor([['ADDSD', 'XMM0', 'qword ptr [0x20000]']]); second.scalars.XMM0 = 1;
  assert.throws(() => second.run(), /known consumed double lanes/);
});

test('truncating float conversion keeps native integer-indefinite on invalid input', () => {
  for (const [input, expected] of [[1.9, 1], [-1.9, -1], [2147483647, -2147483648], [-2147483648, -2147483648], [Infinity, -2147483648], [NaN, -2147483648]]) {
    const machine = machineFor([['CVTTSS2SI', 'EAX', 'XMM0']]); machine.scalars.XMM0 = input; machine.run();
    assert.equal(machine.r.EAX, expected);
  }
});
