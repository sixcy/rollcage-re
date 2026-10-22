import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

function machine(operations) {
  const instructions = operations.map(([op, ...args], index) => ({address: 0x1000 + index, op, args}));
  instructions.push({address: 0x1000 + instructions.length, op: 'RET', args: []});
  const result = new BoundedX86(instructions); result.r.ESP = 0x9000; result.bytes.writeUInt32LE(0xffffffff, 0x9000); return result;
}

test('MOVDQU preserves all descriptor bits at unaligned addresses including NaN payloads', () => {
  const m = machine([['MOVDQU', 'XMM0', 'xmmword ptr [0x18001]'], ['MOVDQU', 'xmmword ptr [0x18103]', 'XMM0']]);
  const bytes = Buffer.from('3412c07f000000800000803f78563412', 'hex'); bytes.copy(m.bytes, 0x18001); m.bytes.fill(0x69, 0x18102, 0x18114); m.run();
  assert.deepEqual(m.bytes.subarray(0x18103, 0x18113), bytes); assert.equal(m.bytes[0x18102], 0x69); assert.equal(m.bytes[0x18113], 0x69);
});

test('implicit EAX STOSD repeats exact dwords, advances cursor and preserves flags', () => {
  const m = machine([['STOSD.REP', 'ES:EDI']]); m.r.EAX = -123; m.r.EDI = 0x18000; m.r.ECX = 3; m.c = true; m.z = true; m.bytes.fill(0x69, 0x17fff, 0x1800d); m.run();
  assert.deepEqual([0, 4, 8].map(offset => m.bytes.readInt32LE(0x18000 + offset)), [-123, -123, -123]);
  assert.equal(m.r.EDI, 0x1800c); assert.equal(m.r.ECX, 0); assert.equal(m.c, true); assert.equal(m.z, true); assert.equal(m.bytes[0x17fff], 0x69); assert.equal(m.bytes[0x1800c], 0x69);
});

test('single STOSD preserves count and loop flags used by procedural texture rows', () => {
  const m = machine([['STOSD', 'ES:EDI']]); m.r.EAX = -123; m.r.EDI = 0x18000; m.r.ECX = 0x8020; m.c = true; m.z = true;
  m.run(); assert.equal(m.bytes.readInt32LE(0x18000), -123); assert.equal(m.r.EDI, 0x18004); assert.equal(m.r.ECX, 0x8020); assert.equal(m.c, true); assert.equal(m.z, true);
});

test('zero-count STOSD does not dereference its destination and excess count rejects execution', () => {
  const zero = machine([['STOSD.REP', 'ES:EDI']]); zero.r.EDI = -1; zero.run(); assert.equal(zero.r.EDI, -1);
  const huge = machine([['STOSD.REP', 'ES:EDI']]); huge.r.ECX = 131073; assert.throws(() => huge.run(), /String-store workflow budget/);
});

test('MOVSB.REP propagates overlapping bytes forward and consumes the native count', () => {
  const m = machine([['MOVSB.REP', 'ES:EDI', 'ESI']]); m.r.ESI=0x18000; m.r.EDI=0x18001; m.r.ECX=5; Buffer.from([1,2,3,4,5,6]).copy(m.bytes,0x18000); m.run();
  assert.deepEqual([...m.bytes.subarray(0x18000,0x18006)],[1,1,1,1,1,1]);assert.equal(m.r.ESI,0x18005);assert.equal(m.r.EDI,0x18006);assert.equal(m.r.ECX,0);
});

test('packed integer pointer initialization shuffles, adds and shifts four wrapping lanes',()=>{
 const m=machine([['MOVD','XMM0','EAX'],['MOVDQA','XMM1','xmmword ptr [0x18000]'],['PSHUFD','XMM0','XMM0','0x0'],['PADDD','XMM0','XMM1'],['MOVD','XMM2','EDX'],['PSLLD','XMM0','XMM2'],['MOVDQU','xmmword ptr [0x18103]','XMM0']]);
 m.r.EAX=0x7ffffff0;m.r.EDX=20;m.c=true;[0,1,2,3].forEach((value,index)=>m.bytes.writeInt32LE(value,0x18000+index*4));m.run();
 assert.deepEqual([0,4,8,12].map(offset=>m.bytes.readInt32LE(0x18103+offset)),[0,1,2,3].map(value=>(0x7ffffff0+value)<<20));assert.equal(m.c,true);
});

test('packed variable shifts zero lanes at32 and aligned loads reject unaligned memory',()=>{
 const m=machine([['MOVD','XMM0','EAX'],['MOVD','XMM2','EDX'],['PSLLD','XMM0','XMM2'],['MOVDQU','xmmword ptr [0x18000]','XMM0']]);m.r.EAX=-1;m.r.EDX=32;m.run();assert.deepEqual(m.bytes.subarray(0x18000,0x18010),Buffer.alloc(16));
 const bad=machine([['MOVDQA','XMM0','xmmword ptr [0x18001]']]);assert.throws(()=>bad.run(),/Unaligned MOVDQA load/);
});

test('MOVLPD color clamp stores only proven zero low64 bits at an unaligned destination', () => {
  const m = machine([['XORPS', 'XMM0', 'XMM0'], ['MOVLPD', 'qword ptr [0x18003]', 'XMM0']]); m.bytes.fill(0x69, 0x18002, 0x1800c); m.c = true; m.run();
  assert.deepEqual(m.bytes.subarray(0x18003, 0x1800b), Buffer.alloc(8)); assert.equal(m.bytes[0x18002], 0x69); assert.equal(m.bytes[0x1800b], 0x69); assert.equal(m.c, true);
  const unknown = machine([['MOVLPD', 'qword ptr [0x18003]', 'XMM0']]); assert.throws(() => unknown.run(), /requires proven XORPS-zero/);
  const invalidated = machine([['XORPS', 'XMM0', 'XMM0'], ['MOVD', 'XMM0', 'EAX'], ['MOVLPD', 'qword ptr [0x18003]', 'XMM0']]); assert.throws(() => invalidated.run(), /requires proven XORPS-zero/);
});
