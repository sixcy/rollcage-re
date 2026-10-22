import test from 'node:test';
import assert from 'node:assert/strict';
import {transformAttachmentPoint,updateBodyAttachments,updateRawBodyAttachments,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
import {transformAuthoredAttachmentPoint} from '../src/track-object-metadata.mjs';

const position=[19529,0,0],rotation=[-1127,0,-3938,0,4096,0,0,0,4096],point=[2016,-26177,-9198];
const offset=address=>address-ATTACHMENT_SCRATCH_BASE;
function scratchForCounterexample(){
 const scratch=Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH);
 for(let i=0;i<3;i++){scratch.writeFloatLE(position[i],offset(0x91cdb0)+i*4);scratch.writeInt16LE(point[i],offset(0x91d3e4)+i*2);}
 for(let i=0;i<9;i++)scratch.writeFloatLE(rotation[i]/4096,offset(0x91cdc0)+Math.floor(i/3)*16+i%3*4);
 return scratch;
}
function rawWorld(){
 const memory=Buffer.alloc(0xa00000),body=0x10000,model=0x20000,output=0x30000;
 memory.writeFloatLE(1/4096,0x5dc5f4);memory.writeUInt32LE(model,body+0x10);memory.writeUInt16LE(0x80,model+0x4c);
 rotation.forEach((v,i)=>memory.writeInt16LE(v,body+0xc4+i*2));position.forEach((v,i)=>memory.writeInt32LE(v<<16,body+0x34+i*4));point.forEach((v,i)=>memory.writeInt16LE(v,model+0x80+i*2));
 memory.writeUInt16LE(0x1000,body+0x16a);memory.writeUInt32LE(body,0x902040);memory.writeUInt32LE(1,0x6e6ba0);
 return{memory,body,pointAddress:model+0x80,output};
}

test('432080 opts into captured PC24 arithmetic while preserving historical PC53 by default',()=>{
 assert.deepEqual(transformAttachmentPoint(scratchForCounterexample(),'nearest-even'),[27817,-26177,-9198]);
 assert.deepEqual(transformAttachmentPoint(scratchForCounterexample(),'nearest-even',{x87PrecisionBits:24}),[27818,-26177,-9198]);
 assert.deepEqual(transformAttachmentPoint(scratchForCounterexample(),'nearest-even',{x87PrecisionBits:64}),[27817,-26177,-9198]);
 assert.throws(()=>transformAttachmentPoint(scratchForCounterexample(),'nearest-even',{x87PrecisionBits:32}),/precision/);
});

test('432080 preserves the native translation-first FADDP tree under PC24',()=>{
 const scratch=Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH);
 scratch.writeFloatLE(1,offset(0x91cdb0));scratch.writeFloatLE(2**24,offset(0x91cdc0));scratch.writeFloatLE(-(2**24),offset(0x91cdc4));
 scratch.writeInt16LE(1,offset(0x91d3e4));scratch.writeInt16LE(1,offset(0x91d3e6));
 assert.equal(transformAttachmentPoint(scratch,'nearest-even',{x87PrecisionBits:24})[0],0);
 assert.equal(transformAttachmentPoint(scratch,'nearest-even',{x87PrecisionBits:53})[0],1);
});

test('structured and raw attachment queues pass explicit PC24 to their real transform',()=>{
 for(const [x87PrecisionBits,expected]of[[53,27817],[24,27818]]){
  const points=Buffer.alloc(40);point.forEach((v,i)=>points.writeInt16LE(v,i*2));
  const target={position:position.map(v=>v<<16),rotation,rotationPaddingD6:0,attachmentHandles:[0x1000,0,0,0,0]};
  const type1Records=Buffer.alloc(8),scratch=Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH);
  updateBodyAttachments({entries:[target],count:1},{pointsFor:()=>points,type1Records,scratch,roundingMode:'nearest-even',x87PrecisionBits});
  assert.equal(type1Records.readInt16LE(),expected);
  const{memory}=rawWorld();updateRawBodyAttachments({memory,roundingMode:'nearest-even',x87PrecisionBits});
  assert.equal(memory.readInt16LE(0x90b688),expected);assert.equal(memory.readUInt32LE(0x6e6ba0),0);
 }
});

test('authored-object runtime passes observed precision into attachment construction',()=>{
 for(const [x87PrecisionBits,expected]of[[53,27817],[24,27818]]){
  const{memory,body,pointAddress,output}=rawWorld();
  transformAuthoredAttachmentPoint(body,pointAddress,output,{memory,scratchBase:0x9000,roundingMode:'nearest-even',x87PrecisionBits});
  assert.equal(memory.readInt16LE(output),expected);
 }
});
