import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function machine(rows) {
  const code = rows.map(([op, ...args], i) => ({address: 0x1000 + i, op, args})); code.push({address: 0x1000 + code.length, op: 'RET', args: []});
  const m = new BoundedX86(code); m.r.ESP = 0x9000; m.bytes.writeInt32LE(-1, 0x9000); return m;
}
test('procedural scalar float conversion and double arithmetic preserve rounding boundaries', () => {
  const m = machine([['MOVSS','XMM0','dword ptr [0x18000]'],['MOVSS','XMM1','XMM0'],['SUBSS','XMM0','dword ptr [0x18004]'],['CVTSS2SD','XMM0','XMM0'],['MULSD','XMM0','qword ptr [0x18008]'],['ADDSD','XMM0','qword ptr [0x18010]'],['MOVSD','XMM2','qword ptr [0x18018]'],['SUBSD','XMM0','XMM2'],['MOVSD','qword ptr [0x18100]','XMM0']]);
  m.bytes.writeFloatLE(1.3,0x18000);m.bytes.writeFloatLE(.1,0x18004);m.bytes.writeDoubleLE(10.3,0x18008);m.bytes.writeDoubleLE(64,0x18010);m.bytes.writeDoubleLE(.25,0x18018);m.run();
  assert.equal(m.bytes.readDoubleLE(0x18100),Math.fround(Math.fround(1.3)-Math.fround(.1))*10.3+64-.25);assert.equal(m.scalars.XMM1,Math.fround(1.3));
});
test('x87 double scale and store consume the one declared library result', () => {
  const m=machine([['FMUL','double ptr [0x18000]'],['FSTP','double ptr [0x18100]']]);m.x87.push(12.5);m.bytes.writeDoubleLE(.05,0x18000);m.run();assert.equal(m.bytes.readDoubleLE(0x18100),.625);assert.equal(m.x87.length,0);
});
test('word push/pop uses two bytes and preserves the untouched upper register half', () => {
  const m=machine([['PUSH','AX'],['MOV','AX','0x0'],['POP','AX']]);m.r.EAX=0x12345678;m.bytes.fill(0x53,0x8ffc,0x9000);m.run();assert.equal(m.r.EAX,0x12345678);assert.equal(m.bytes.readUInt16LE(0x8ffe),0x5678);assert.equal(m.bytes.readUInt16LE(0x8ffc),0x5353);
});
