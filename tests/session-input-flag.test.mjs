import test from 'node:test';
import assert from 'node:assert/strict';
import {setSessionInputFlag} from '../src/session-input-flag.mjs';
test('odd mode changes only bit1 and preserves input words',()=>{
 const memory=Buffer.alloc(0x920000,0xa5);memory.writeInt32LE(8,0x91ce90);setSessionInputFlag(-1,{memory});assert.equal(memory.readInt32LE(0x91ce90),10);assert.equal(memory.readUInt16LE(0x849482),0xa5a5);
});
test('even mode clears exactly four words and bit1 while preserving their neighbors',()=>{
 const memory=Buffer.alloc(0x920000,0xa5);memory.writeInt32LE(10,0x91ce90);setSessionInputFlag(2,{memory});assert.equal(memory.readInt32LE(0x91ce90),8);
 for(const p of [0x849482,0x8494d6,0x84952a,0x84957e]){assert.equal(memory.readUInt16LE(p),0);assert.equal(memory[p-1],0xa5);assert.equal(memory[p+2],0xa5);}
});
test('state14 suppresses an even-mode update entirely',()=>{
 const memory=Buffer.alloc(0x920000,0xa5);memory.writeInt32LE(14,0x91ff80);const previous=memory.readInt32LE(0x91ce90);setSessionInputFlag(0,{memory});assert.equal(memory.readInt32LE(0x91ce90),previous);assert.equal(memory.readUInt16LE(0x849482),0xa5a5);
});
