import test from 'node:test';
import assert from 'node:assert/strict';
import {formatLapTimeDigits,updateLapAdvance} from '../src/lap-timing.mjs';

test('timer digits pack minutes, seconds, centiseconds and fractional digit into low-to-high nibbles',()=>{
 const record=Buffer.alloc(0x50,0xa5);record.writeInt32LE(12345*2048,0x2c);record.writeInt32LE(204,0x34);
 formatLapTimeDigits(record);
 assert.equal(record.readUInt32LE(0x3c),0x05a43a02);assert.equal(record.readUInt32LE(0x44),0x00a00a00);
 assert.equal(record.readUInt32LE(0x40),0xa5a5a5a5);assert.equal(record.readUInt32LE(0x48),0xa5a5a5a5);
});
test('missing timers use blank glyphb with separatora in every row',()=>{
 const record=Buffer.alloc(0x50,0xff);formatLapTimeDigits(record,1);
 for(let row=0;row<4;row++)assert.equal(record.readUInt32LE(0x3c+row*4),0xbbabbabb);
});
test('negative timer arithmetic retains signed quotient nibbles and wrapped fractional multiply',()=>{
 const record=Buffer.alloc(0x50);record.writeInt32LE(-2048,0x2c);formatLapTimeDigits(record);
 assert.equal(record.readUInt32LE(0x3c),0x2fa00a00);
});
test('unequal lap bytes do not modify storage or require a body and clock',()=>{
 const record=Buffer.alloc(0x50,0xa5);record[0x1e]=1;record[0x1c]=2;const prior=Buffer.from(record);
 updateLapAdvance(record);assert.deepEqual(record,prior);
});
test('initial zero lap captures time before returning without formatting or body writes',()=>{
 const record=Buffer.alloc(0x50,0xa5);record[0x1e]=record[0x1c]=record[0x20]=0;record.writeInt32LE(123456,0x2c);
 updateLapAdvance(record);assert.equal(record.readInt32LE(0x38),123456);assert.equal(record.readUInt32LE(0x3c),0xa5a5a5a5);
});
test('start checkpoint uses wrapped unsigned clock conversion and updates all timer rows',()=>{
 const record=Buffer.alloc(0x50,0xff),body={bytes:Buffer.alloc(0x800,0xa5)};record[0x1e]=record[0x1c]=3;record[0x20]=0;record.writeInt32LE(2048,0x2c);
 updateLapAdvance(record,{body,clock90a548:0x7fffffff});
 assert.equal(record.readUInt32LE(0x4c),Math.trunc(0xfffff800/3));assert.equal(body.bytes[0x66c],0xbf);
 assert.equal(record.readInt32LE(0x38),2048);assert.equal(record.readUInt32LE(0x48),0x01a00a00);
});
test('other checkpoints set4f while preserving the prior clock-derived field',()=>{
 const record=Buffer.alloc(0x50,0xa5),body={bytes:Buffer.alloc(0x800)};record[0x1e]=record[0x1c]=0;record[0x20]=1;
 updateLapAdvance(record,{body});assert.equal(body.bytes[0x66c],0x4f);assert.equal(record.readUInt32LE(0x4c),0xa5a5a5a5);
});
