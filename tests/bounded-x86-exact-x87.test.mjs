import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
const program=[
 {address:0x4000,op:'FILD',args:['dword ptr [0x10000]']},
 {address:0x4006,op:'FADD',args:['float ptr [0x10004]']},
 {address:0x400c,op:'FSTP',args:['double ptr [0x10008]']},
 {address:0x4012,op:'RET',args:[]}
];
function run(fpuPrecisionBits,fpuRounding='nearest-even'){
 const m=new BoundedX86(program,{fpuPrecisionBits});m.fpuRounding=fpuRounding;
 m.bytes.writeInt32LE(16777217,0x10000);m.bytes.writeFloatLE(0,0x10004);m.r.ESP=0x9000;m.bytes.writeInt32LE(-1,0x9000);m.run();return m.bytes.readDoubleLE(0x10008);
}
test('bounded interpreter explicitly opts into PC24 arithmetic; historical Number stack stays unchanged',()=>{
 assert.equal(run(undefined),16777217);assert.equal(run(53),16777217);assert.equal(run(64),16777217);assert.equal(run(24),16777216);
 assert.equal(run(24,'up'),16777218);assert.equal(run(24,'down'),16777216);
 assert.throws(()=>new BoundedX86(program,{fpuPrecisionBits:32}),/precision/);
});

test('exact x87 FILD load is not rounded by PC24 before a destination-width store',()=>{
 const p=[program[0],program[2],program[3]],m=new BoundedX86(p,{fpuPrecisionBits:24});
 m.bytes.writeInt32LE(16777217,0x10000);m.r.ESP=0x9000;m.bytes.writeInt32LE(-1,0x9000);m.run();assert.equal(m.bytes.readDoubleLE(0x10008),16777217);
});
