import test from 'node:test';
import assert from 'node:assert/strict';
import {stepReplayControl,updateReplayChecksum} from '../src/replay-codec.mjs';
import tables from '../src/finish-skill-tables.json' with {type:'json'};
const BODY=0x10000,CONTROLLER=0x20000;
function fixture(){
 const memory=Buffer.alloc(0x920000);Buffer.from(tables.hex,'hex').copy(memory,0x570680);memory.writeUInt32LE(CONTROLLER,BODY+0x660);memory.writeUInt32LE(CONTROLLER+8,CONTROLLER+0x4e28);memory.writeInt32LE(1,0x90a548);
 for(const offset of [0x4e30,0x14c24,0x19a50])memory.writeUInt32LE(100,CONTROLLER+offset+4);
 return memory;
}
test('recording chooses a one-byte single-button packet and retains the new input word',()=>{
 const memory=fixture();memory.writeInt32LE(2,CONTROLLER+0x1e880);memory.writeUInt16LE(0x10,CONTROLLER+0x4e2e);memory.writeUInt16LE(5,CONTROLLER+0x4e2c);memory.writeUInt16LE(0x20,BODY+0x710);
 stepReplayControl(BODY,{memory});assert.equal(memory[CONTROLLER+8],0x65);assert.equal(memory.readUInt16LE(CONTROLLER),1);assert.equal(memory.readUInt16LE(CONTROLLER+2),1);assert.equal(memory.readUInt16LE(CONTROLLER+0x4e2e),0x20);assert.equal(memory.readUInt16LE(CONTROLLER+0x4e2c),1);
});
test('axis changes use a signed short delta or a literal and can transition the controller on capacity',()=>{
 const memory=fixture();memory.writeInt32LE(2,CONTROLLER+0x1e880);memory[BODY+0x708]=7;memory[BODY+0x709]=200;memory.writeUInt32LE(0,CONTROLLER+0x4e34);
 stepReplayControl(BODY,{memory});assert.equal(memory[CONTROLLER+0x4e3c],0x87);assert.equal(memory.readUInt16LE(CONTROLLER+0x4e38),1);assert.equal(memory[CONTROLLER+0x14c30],0);assert.equal(memory[CONTROLLER+0x14c31],200);assert.equal(memory.readInt32LE(CONTROLLER+0x1e880),7);
});
test('recording finalization requires a second terminal call before checksum and state zero',()=>{
 const memory=fixture();memory.writeInt32LE(3,CONTROLLER+0x1e880);memory.writeUInt16LE(1,CONTROLLER+0x4e2c);
 stepReplayControl(BODY,{memory});assert.equal(memory.readInt32LE(CONTROLLER+0x1e880),7);stepReplayControl(BODY,{memory});assert.equal(memory.readInt32LE(CONTROLLER+0x1e880),0);assert.notEqual(memory.readUInt16LE(CONTROLLER+6),0);
});
test('playback decodes a full mask, clears the upper input word and continues axis updates after terminal detection',()=>{
 const memory=fixture();memory.writeInt32LE(5,CONTROLLER+0x1e880);memory.writeInt16LE(-1,CONTROLLER+0x1e87c);memory.set([0xe0,3,0x12,0x34],CONTROLLER+8);memory.writeUInt32LE(0xffffffff,BODY+0x710);memory.writeUInt16LE(1,CONTROLLER+0x4e38);memory[CONTROLLER+0x4e3c]=0xbf;
 stepReplayControl(BODY,{memory});assert.equal(memory.readUInt32LE(BODY+0x710),0x1234);assert.equal(memory.readInt32LE(CONTROLLER+0x1e880),6);assert.equal(memory[BODY+0x708],63);assert.equal(memory.readUInt16LE(CONTROLLER+0x4e2c),2);
 stepReplayControl(BODY,{memory});assert.equal(memory.readInt32LE(CONTROLLER+0x1e880),0);
});
test('checksum validation preserves a match and marks a mismatch withfecd',()=>{
 const memory=fixture();memory.writeUInt16LE(2,CONTROLLER);memory.set([1,2],CONTROLLER+8);updateReplayChecksum(CONTROLLER,{memory});const checksum=memory.readUInt16LE(CONTROLLER+6);
 updateReplayChecksum(CONTROLLER,{memory,validate:true});assert.equal(memory.readUInt16LE(CONTROLLER+6),checksum);memory[CONTROLLER+8]^=1;updateReplayChecksum(CONTROLLER,{memory,validate:true});assert.equal(memory.readUInt16LE(CONTROLLER+6),0xfecd);
});
test('paused and null-controller calls leave both body and replay memory unchanged',()=>{
 const memory=fixture();memory.writeInt32LE(1,0x9020a0);const before=Buffer.from(memory.subarray(BODY,CONTROLLER+0x1e884));stepReplayControl(BODY,{memory});assert.deepEqual(memory.subarray(BODY,CONTROLLER+0x1e884),before);
 memory.writeInt32LE(0,0x9020a0);memory.writeUInt32LE(0,BODY+0x660);stepReplayControl(BODY,{memory});
});

test('recorded changing controls and axis runs replay the original frame sequence',()=>{
 const memory=fixture(),frames=Array.from({length:48},(_,index)=>({mask:index<8?0x10:index<16?0x30:index<24?1:index<32?0x4010:index<40?0:0x1234,axes:[Math.floor(index/4)*3,index<20?10:200,(255-index)&255]}));
 memory.writeInt32LE(2,CONTROLLER+0x1e880);
 for(let index=0;index<frames.length;index++){
  const frame=frames[index];memory.writeInt32LE(index,0x90a548);memory.writeUInt16LE(frame.mask,BODY+0x710);frame.axes.forEach((value,axis)=>memory[BODY+0x708+axis]=value);stepReplayControl(BODY,{memory});
 }
 memory.writeInt32LE(3,CONTROLLER+0x1e880);stepReplayControl(BODY,{memory});stepReplayControl(BODY,{memory});
 const playback=0x50000;memory.copy(memory,playback,CONTROLLER,CONTROLLER+0x1e884);memory.writeUInt32LE(playback,BODY+0x660);memory.writeInt32LE(5,playback+0x1e880);memory.writeUInt32LE(playback+8,playback+0x4e28);memory.writeUInt16LE(0,playback+0x4e2c);memory.writeInt16LE(1000,playback+0x1e87c);
 for(const offset of [0x4e30,0x14c24,0x19a50]){memory.fill(0,playback+offset,playback+offset+3);memory.writeUInt16LE(0,playback+offset+10);}
 for(const frame of frames){stepReplayControl(BODY,{memory});assert.equal(memory.readUInt32LE(BODY+0x710),frame.mask);assert.deepEqual([0,1,2].map(axis=>memory[BODY+0x708+axis]),frame.axes);}
});
