import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueRaceText, initializeNetworkStartupText} from '../src/race-startup-text.mjs';
import {verifyRaceStartupText} from '../tools/verify-race-startup-text-instructions.mjs';
function fixture() {
  const memory=Buffer.alloc(0xa00000),font=0x160000,message=0x200000;
  memory.writeUInt32LE(font,0x82dfa0);memory.writeInt16LE(256,font+4);memory.writeInt32LE(5,font+16);memory.writeInt32LE(1,font+20);memory.fill(255,font+0x101c,font+0x111c);memory[font+0x101c+65]=0;memory.writeUInt16LE(7,font+32);memory.writeInt32LE(256,0x91d338);memory.writeUInt32LE(0x60000,0x5ecb1c);
  return{memory,font,message,scratchBase:0x9000};
}
test('text queues preserve timer widths, signed glyph scale and separate queue bookkeeping',()=>{
  const r=fixture(),m=r.memory;m.write('A A\0',r.message);m.writeInt16LE(-256,r.font+4);
  assert.equal(enqueueRaceText(r.message,0x12345678,23,-19,0x110,0x12345,1,r),0);
  const p=0x9028e4;assert.equal(m.readInt32LE(p),0x12345678);assert.equal(m[p+8],3);assert.equal(m.readInt16LE(p+10),-7);assert.equal(m.readInt16LE(p+4),30);assert.equal(m.readInt16LE(p+6),-19);assert.equal(m.readUInt16LE(p+12),0x2345);assert.equal(m.readUInt16LE(0x902b68),0x2345);assert.equal(m.readInt32LE(0x902b64),1);
});
test('empty text copies one zero byte and occupies a slot;64byte copy leaves following storage untouched',()=>{
  const r=fixture(),m=r.memory,p=0x82dfa4;m[p+16]=99;enqueueRaceText(r.message,0,0,0,0,0,0,r);assert.equal(m[p+8],1);assert.equal(m[p+16],0);
  m.write('A'.repeat(80)+'\0',r.message);m[p+80+16+64]=0xab;enqueueRaceText(r.message,0,0,0,0,0,0,r);assert.equal(m[p+80+8],64);assert.equal(m[p+80+16+64],0xab);
});
test('full mode1 queue still publishes participant mode and countdown',()=>{
  const r=fixture(),m=r.memory;m[0x6054d]=4;for(let i=0;i<28;i++)m[0x82dfa4+i*80+8]=1;
  initializeNetworkStartupText(1,r);assert.deepEqual([...m.subarray(0x60000,0x60004)],[8,8,8,8]);assert.equal(m.readUInt16LE(0x6058e),1800);assert.equal(enqueueRaceText(r.message,1,0,0,0,0,0,r),-1);
});
test('overlapping source sees the preceding live font-scale write and forward propagation',()=>{
  const r=fixture(),m=r.memory,p=0x82dfa4;m.write('AAAA\0',p+15);
  enqueueRaceText(p+15,0,0,0,0,0,0,r);assert.equal(m[p+8],64);assert.equal(m[p+16+63],1);
});
test('startup text native graph matches complete mapped memory across queue and viewport variants',async()=>{
  const report=await verifyRaceStartupText({fixtures:180,output:null});assert.equal(report.matched,true);assert.ok(report.viewportQueries>100);assert.ok(report.parents>20);
});
