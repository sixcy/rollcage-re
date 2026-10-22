import test from 'node:test';
import assert from 'node:assert/strict';
import {emitRawAttachmentParticle,updateRawAttachmentEffects,updateRawPersistentEmitters,updateRawType2Attachment} from '../src/attachment-effects.mjs';
import {createAttachmentEffectsFixture} from '../tools/verify-attachment-effects-instructions.mjs';
const body=0x10000,target=0x72000,pool=0x100000;
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);

test('optional queued attachment deduplication removes repeated bodies while retaining queue slots',()=>{
 for(const deduplicate of[false,true]) {
  const context=createAttachmentEffectsFixture(0),m=context.memory;put(m,0x6e6b1c,4);m[0x70552]=+deduplicate;
  for(let i=0;i<4;i++)put(m,0x902f00+i*4,body);word(m,body+0x16a,0x4000);word(m,body+0x16c,0);
  const report=updateRawAttachmentEffects(context);assert.equal(report.bodies,deduplicate?1:4);assert.equal(report.particles,deduplicate?1:4);assert.equal(m.readUInt32LE(0x6e6b1c),0);assert.equal(m.readUInt32LE(0x902f0c),body);assert.equal(m.readUInt32LE(0x6e6b20),deduplicate?0:0x12345678);
 }
});
test('type3 attachment cadence wraps signed16 before threshold and emits on its third tick',()=>{
 const context=createAttachmentEffectsFixture(0),m=context.memory;word(m,body+0x16a,0x3000);word(m,body+0x16c,0);m[target+11]=0;
 put(m,0x6e6b1c,1);word(m,target+6,32767);assert.equal(updateRawAttachmentEffects(context).particles,0);assert.equal(m.readInt16LE(target+6),-32768);
 put(m,0x6e6b1c,1);word(m,target+6,2);assert.equal(updateRawAttachmentEffects(context).particles,1);assert.equal(m.readInt16LE(target+6),0);assert.equal(m.readInt32LE(pool),27);assert.equal(m.readUInt16LE(pool+0x96),40);assert.equal(m.readUInt16LE(pool+0x9e),0);
});
test('type2 scalar propagation uses the last type1 handle before termination',()=>{
 const context=createAttachmentEffectsFixture(1),m=context.memory,type2=pool+0x6000;m[type2+0x94]=1;
 [0x1001,0x2000,0x1002,0,0x1003].forEach((value,i)=>word(m,body+0x16a+i*2,value));put(m,0x80f56c+64,100);put(m,0x80f56c+128,200);put(m,0x80f56c+192,300);
 updateRawType2Attachment(body,0x2000,context);assert.equal(m.readInt32LE(type2+0x90),400);
});
test('raw particle creator preserves low16 vertical velocity, saturates color and selects alternate mesh',()=>{
 const context=createAttachmentEffectsFixture(1),m=context.memory;m[target+8]=127;m[target+9]=128;m[target+10]=255;
 const particle=emitRawAttachmentParticle(target,28,0x12345678,17,0x10,context);
 assert.equal(m.readUInt16LE(particle+0x9e),0x5678);assert.equal(m.readUInt32LE(particle+0x98),0xfffffffe);assert.equal(m.readUInt32LE(particle+0xa4),0x55555555);assert.equal(m[particle+0x94],1);
});
test('persistent emitter decrements first, updates its fade, emits type34 and preserves exhausted records',()=>{
 const context=createAttachmentEffectsFixture(0),m=context.memory,record=0x6ff140;
 for(let i=0;i<10;i++)put(m,record+i*20+12,0);put(m,record+12,450);word(m,record+6,0);put(m,record+16,0);m[record+11]=0;
 assert.equal(updateRawPersistentEmitters(context),1);assert.equal(m.readInt32LE(record+12),449);assert.equal(m[record+8],63);assert.equal(m.readInt32LE(pool),34);assert.equal(m.readUInt32LE(pool+0x98),0xff7e7e7e);assert.equal(m.readUInt16LE(pool+0x96),68);
 put(m,record+12,0);const before=Buffer.from(m.subarray(record,record+20));assert.equal(updateRawPersistentEmitters(context),0);assert.deepEqual(m.subarray(record,record+20),before);
});
