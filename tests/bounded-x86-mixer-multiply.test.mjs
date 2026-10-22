import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function make(args) {
  const m = new BoundedX86([{address:0x10000,op:'FMUL',args},{address:0x10001,op:'RET',args:[]}]);
  m.r.ESP=0x9000; m.bytes.writeInt32LE(-1,0x9000); return m;
}
test('mixer FMUL reads float memory and preserves deeper x87 values and integer flags',()=>{
  const m=make(['float ptr [0x20000]']); m.bytes.writeFloatLE(1+2**-23,0x20000); m.x87=[17,1+2**-24]; m.flags={CF:true,ZF:false,OF:true,SF:false,PF:true}; const flags={...m.flags}; m.run();
  assert.deepEqual(m.x87,[17,(1+2**-24)*(1+2**-23)]); assert.deepEqual(m.flags,flags);
});
test('FMUL retains supported double-memory and stack-register forms',()=>{
  const m=make(['double ptr [0x20000]']); m.bytes.writeDoubleLE(7/3,0x20000); m.x87=[2]; m.run(); assert.equal(m.x87[0],14/3);
  const r=make(['ST1']); r.x87=[3,2]; r.run(); assert.deepEqual(r.x87,[3,6]);
});
test('FMUL rejects invalid stack depths, memory widths and operand counts',()=>{
  for(const values of [[],Array(9).fill(1)]){const m=make(['float ptr [0x20000]']);m.x87=values;assert.throws(()=>m.run(),/Unadmitted x87 multiply/);}
  for(const args of [['dword ptr [0x20000]'],['ST2'],['float ptr [0x20000]','ST0']]){const m=make(args);m.x87=[2];assert.throws(()=>m.run(),/Unadmitted x87 multiply/);}
});
