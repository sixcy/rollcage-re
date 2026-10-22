import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRawBodyAttachments,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
import {createRawAttachmentFixture} from '../tools/verify-body-attachments-connected-instructions.mjs';

test('raw empty attachment queue preserves all global scratch',()=>{
 const context=createRawAttachmentFixture(0);context.memory.writeInt32LE(0,0x6e6ba0);const before=Buffer.from(context.memory.subarray(ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_BASE+ATTACHMENT_SCRATCH_LENGTH));
 assert.equal(updateRawBodyAttachments(context).processedBodies,0);assert.deepEqual(context.memory.subarray(ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_BASE+ATTACHMENT_SCRATCH_LENGTH),before);
});
test('raw queue updates populated targets with actual spatial removal and reinsertion',()=>{
 const context=createRawAttachmentFixture(7),report=updateRawBodyAttachments(context);
 assert.equal(context.memory.readUInt32LE(0x6e6ba0),0);assert.equal(report.processedBodies,4);assert(report.type1Writes>0);assert(report.type2Writes>0);assert(report.type4Writes>0);assert(report.spatialMoves>0);
 const seen=new Set();let id=context.memory.readUInt16LE(0x6300a),previous=0;
 while(id){assert(!seen.has(id));seen.add(id);const target=0x50000+(id-1)*128;assert.equal(context.memory.readUInt32LE(target+12),0x63000);assert.equal(context.memory.readUInt16LE(target+6),previous);previous=id;id=context.memory.readUInt16LE(target+4);}
 assert.deepEqual([...seen].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
});
test('raw attachment target alias changes live queue count before the next body',()=>{
 const context=createRawAttachmentFixture(13);assert.equal(context.memory.readUInt32LE(0x6e6ba0),4);assert.equal(updateRawBodyAttachments(context).processedBodies,1);assert.equal(context.memory.readUInt32LE(0x6e6ba0),0);
});
test('raw model points come from live runtime model-relative offset and preserve type1 tail flag',()=>{
 const context=createRawAttachmentFixture(1),m=context.memory,body=0x10000,model=0x20000;
 m.writeUInt32LE(1,0x6e6ba0);m.writeUInt16LE(0x1000,body+0x16a);m.writeUInt16LE(0,body+0x16c);m.writeUInt16LE(0xc0,model+0x4c);
 [4096,0,0,0,4096,0,0,0,4096].forEach((value,i)=>m.writeInt16LE(value,body+0xc4+i*2));[10,20,30].forEach((value,i)=>m.writeInt32LE(value<<16,body+0x34+i*4));[1,2,3,777].forEach((value,i)=>m.writeInt16LE(value,model+0xc0+i*2));
 updateRawBodyAttachments(context);assert.deepEqual([0,2,4,6].map(offset=>m.readInt16LE(0x90b688+offset)),[11,22,33,1]);assert.equal(m.readInt16LE(0x91d3ea),777);
});
