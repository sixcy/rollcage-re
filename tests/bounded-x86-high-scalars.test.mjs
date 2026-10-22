import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function machineFor(ops){const machine=new BoundedX86([...ops,['RET',[]]].map(([op,args],i)=>({address:0x100+i,op,args})));machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);return machine;}
test('retained4820f0 XMM5/XMM6 constants participate in scalar normalization',()=>{
  const m=machineFor([
    ['MOVSS',['XMM6','dword ptr [0x10000]']],['MOVSS',['XMM5','dword ptr [0x10004]']],
    ['MOVSS',['XMM0','dword ptr [0x10008]']],['MULSS',['XMM0','XMM0']],
    ['ADDSS',['XMM0','dword ptr [0x1000c]']],['SQRTSS',['XMM0','XMM0']],
    ['MOVAPS',['XMM1','XMM6']],['DIVSS',['XMM1','XMM0']],['MULSS',['XMM1','XMM5']],
    ['MOVSS',['dword ptr [0x10010]','XMM1']],
  ]);[1,4096,3,7].forEach((v,i)=>m.bytes.writeFloatLE(v,0x10000+i*4));m.c=true;m.z=true;m.run();
  assert.equal(m.bytes.readFloatLE(0x10010),1024);assert.equal(m.scalars.XMM5,4096);assert.equal(m.scalars.XMM6,1);assert.equal(m.c,true);assert.equal(m.z,true);m.reset();assert.deepEqual(m.scalars,{});
});
test('high scalar support preserves rejection of unadmitted registers and vector forms',()=>{
  for(const[op,args]of[['MOVSS',['XMM8','dword ptr [0x10000]']],['MOVAPS',['XMM8','xmmword ptr [0x10000]']],['MULSS',['XMM6','XMM8']],['XORPS',['XMM8','XMM8']]])assert.throws(()=>machineFor([[op,args]]).run(),/Unadmitted/);
});

test('weather498030 converts XMM6 signed low integers and uses XMM7 scalar constants without admitting packed conversion state', () => {
  const m=machineFor([
    ['MOVD',['XMM6','EAX']],['CVTDQ2PS',['XMM6','XMM6']],
    ['MOVSS',['XMM7','dword ptr [0x10000]']],['MOVAPS',['XMM2','XMM6']],
    ['MULSS',['XMM2','XMM7']],['MOVSS',['dword ptr [0x10004]','XMM2']],
  ]);m.r.EAX=-16777219;m.bytes.writeFloatLE(0.25,0x10000);m.doubleScalars.add('XMM6');m.doubleScalars.add('XMM7');m.run();
  assert.equal(m.bytes.readFloatLE(0x10004),Math.fround(Math.fround(-16777219)*0.25));
  assert.equal(m.doubleScalars.has('XMM6'),false);assert.equal(m.doubleScalars.has('XMM7'),false);
  assert.throws(()=>machineFor([['CVTDQ2PS',['XMM7','XMM7']]]).run(),/Unadmitted/);
  const packed=machineFor([['CVTDQ2PS',['XMM7','XMM6']]]);packed.integerVectors.set('XMM6',[1,2,0,0]);assert.throws(()=>packed.run(),/Unadmitted/);
});
