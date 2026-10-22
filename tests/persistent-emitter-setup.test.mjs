import test from 'node:test';
import assert from 'node:assert/strict';
import {activateRawPersistentEmitter,updateRawPersistentEmitters} from '../src/attachment-effects.mjs';
import {createAttachmentEffectsFixture} from '../tools/verify-attachment-effects-instructions.mjs';

test('persistent emitter activation converts position high words and initializes all ten ring slots',()=>{
 const memory=Buffer.alloc(0xa00000),position=0x10000;
 for(let i=0;i<3;i++)memory.writeInt32LE([0x12345678,-65537,-2147483648][i],position+i*4);
 for(let cursor=0;cursor<10;cursor++) {
  assert.equal(memory.readUInt32LE(0x6fbb14),cursor);activateRawPersistentEmitter(position,{memory});const p=0x6ff140+cursor*20;
  assert.deepEqual([0,2,4].map(offset=>memory.readInt16LE(p+offset)),[0x1234,-2,-32768]);assert.equal(memory.readUInt16LE(p+6),4);assert.equal(memory.readUInt32LE(p+8),0x15404040);assert.equal(memory.readInt32LE(p+12),900);assert.equal(memory.readInt32LE(p+16),4);
 }
 assert.equal(memory.readUInt32LE(0x6fbb14),0);
});
test('overlapping activation source observes the earlier cadence store',()=>{
 const memory=Buffer.alloc(0xa00000),p=0x6ff140;memory.fill(0x69,p,p+24);activateRawPersistentEmitter(p+4,{memory});
 assert.equal(memory.readUInt16LE(p),4);assert.equal(memory.readUInt16LE(p+2),0x6969);assert.equal(memory.readUInt16LE(p+4),0x6969);
});
test('actual setup immediately feeds persistent emission without synthetic record initialization',()=>{
 const context=createAttachmentEffectsFixture(0),m=context.memory;
 for(let i=0;i<10;i++)m.writeInt32LE(0,0x6ff14c+i*20);m.fill(0,0x10000,0x1000c);activateRawPersistentEmitter(0x10000,context);
 assert.equal(updateRawPersistentEmitters(context),1);assert.equal(m.readInt32LE(0x6ff14c),899);assert.equal(m.readInt32LE(0x100000),34);assert.equal(m.readUInt32LE(0x100000+0x98),0xff808080);assert.equal(m.readUInt16LE(0x100000+0x96),68);
});
