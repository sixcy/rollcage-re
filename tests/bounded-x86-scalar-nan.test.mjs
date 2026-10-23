import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

//Constructed instruction harness, independently specified IEEE result bits;
//not original-process evidence. Intel SDM vol1 table4-7 supplies NaN priority.
function scalar(op, left, right) {
  const machine = new BoundedX86([
    {address: 0x400000, op: 'MOVSS', args: ['XMM0', 'dword ptr [0x100000]']},
    {address: 0x400008, op: 'MOVSS', args: ['XMM1', 'dword ptr [0x100004]']},
    {address: 0x400010, op, args: ['XMM0', 'XMM1']},
    {address: 0x400014, op: 'MOVSS', args: ['dword ptr [0x100008]', 'XMM0']},
    {address: 0x40001c, op: 'RET', args: []},
  ]);
  machine.bytes.writeUInt32LE(left, 0x100000); machine.bytes.writeUInt32LE(right, 0x100004);
  machine.bytes.writeUInt32LE(0xffffffff, 0x9000); machine.r.ESP = 0x9000; machine.run(20);
  return machine.bytes.readUInt32LE(0x100008);
}

test('masked SSE arithmetic quiets signaling NaNs and preserves the first-source payload', () => {
  for (let repeat = 0; repeat < 12; repeat++) for (const op of ['MULSS', 'ADDSS', 'SUBSS', 'DIVSS']) {
    assert.equal(scalar(op, 0x7fc12345, 0x7fc54321), 0x7fc12345);
    assert.equal(scalar(op, 0x7f812345, 0xffc54321), 0x7fc12345);
    assert.equal(scalar(op, 0xffc12345, 0x7f854321), 0xffc12345);
    assert.equal(scalar(op, 0x3f800000, 0xff854321), 0xffc54321);
    assert.equal(scalar(op, 0xff812345, 0x3f800000), 0xffc12345);
  }
});

test('SQRTSS selects only its explicit source and invalid finite operations use FP indefinite', () => {
  assert.equal(scalar('SQRTSS', 0x7fc12345, 0x40800000), 0x40000000);
  assert.equal(scalar('SQRTSS', 0x7fc12345, 0xff854321), 0xffc54321);
  assert.equal(scalar('SQRTSS', 0, 0xbf800000), 0xffc00000);
  assert.equal(scalar('MULSS', 0, 0x7f800000), 0xffc00000);
  assert.equal(scalar('DIVSS', 0, 0), 0xffc00000);
  assert.equal(scalar('SUBSS', 0x7f800000, 0x7f800000), 0xffc00000);
  assert.equal(scalar('DIVSS', 0x3f800000, 0x40000000), 0x3f000000);
});
