import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function machineFor(ops){const m=new BoundedX86([...ops,['RET',[]]].map(([op,args],i)=>({address:0x100+i,op,args})));m.r.ESP=0x9000;m.bytes.writeInt32LE(-1,0x9000);return m;}
test('MOVQ stores exactly the low64 known bits after an aligned integer vector load',()=>{
 const m=machineFor([['MOVDQA',['XMM0','xmmword ptr [0x10000]']],['MOVQ',['qword ptr [0x10020]','XMM0']]]);Buffer.from('efcdab89876543fedec0ad0b78563412','hex').copy(m.bytes,0x10000);m.bytes.fill(0xa5,0x10020,0x10030);m.c=true;m.z=true;m.run();assert.equal(m.bytes.subarray(0x10020,0x10030).toString('hex'),'efcdab89876543fea5a5a5a5a5a5a5a5');assert.equal(m.c,true);assert.equal(m.z,true);
});
test('MOVQ still rejects a source without retained low64 provenance',()=>{assert.throws(()=>machineFor([['MOVQ',['qword ptr [0x10000]','XMM0']]]).run(),/Uninitialized MOVQ source/);});
