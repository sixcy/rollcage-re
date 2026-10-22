import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameWaveDecoder,readGameWaveFrames,decodeGameWaveAdpcmBlock,convertGameWaveSamples,initializeGameWaveDecoderTables} from '../src/game-audio-wave-decoder.mjs';
import {roundGameAudioFrameCount} from '../src/game-audio-resampling-setup.mjs';
import {createWaveFixture} from '../tools/verify-game-audio-wave-decoder-instructions.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),ptr=(m,p)=>m.readUInt32LE(p);
function fileRuntime(memory,file){let cursor=0;return{memory,scratchBase:0x9000,entryRegisters:{EBX:17,EBP:19,ESI:23,EDI:29},sehWord:0,services:{platformCall(name,a){if(name==='ReadFile'){const n=Math.min(a[2],file.length-cursor);if(n)file.copy(memory,a[1],cursor,cursor+n);cursor+=n;put(memory,a[3],n);return 1;}if(name==='SetFilePointerEx'){cursor=Number(BigInt.asIntN(64,BigInt(a[1])|BigInt(a[2])<<32n));memory.writeBigInt64LE(BigInt(cursor),a[3]);return 1;}throw Error(name);},libraryCall(name,a){assert.equal(name,'memset');memory.fill(a[1]&255,a[0],a[0]+a[2]);return a[0];}}};}
test('WAVE data before format preserves the data start while scanning later chunks',()=>{
 const memory=Buffer.alloc(0x800000),object=0x100000,file=createWaveFixture(1);put(memory,object+0x64,101);put(memory,object+0x70,file.length);put(memory,object+0x78,file.length);
 assert.equal(parseGameWaveDecoder(object,fileRuntime(memory,file)),true);assert.equal(ptr(memory,object+0xe0),20);assert.equal(ptr(memory,object+0xe4),33);assert.equal(memory.readUInt16LE(object+0xa8),1);assert.equal(memory.readUInt16LE(object+0xb6),8);assert.equal(ptr(memory,object+0xac),22050);
});
test('FORM/AIFF retains big-endian metadata and skips SSND offset/block words',()=>{
 const memory=Buffer.alloc(0x800000),object=0x100000,file=createWaveFixture(4);put(memory,object+0x64,101);put(memory,object+0x70,file.length);put(memory,object+0x78,file.length);
 assert.equal(parseGameWaveDecoder(object,fileRuntime(memory,file)),true);assert.equal(memory[object+0xfc],1);assert.equal(ptr(memory,object+0xe4),36);assert.equal(memory.readUInt16LE(object+0xb6),16);assert.equal(ptr(memory,object+0xac),44100);
});
test('short PCM reads advance logical samples but preserve underlying file counters',()=>{
 const memory=Buffer.alloc(0x800000),object=0x100000,scratch=0x110000,out=0x120000;put(memory,object+0xdc,scratch);put(memory,object+0xf4,4);put(memory,object+0x78,4);memory.writeUInt16LE(1,object+0xa8);memory.writeUInt16LE(8,object+0xb6);memory.writeUInt16LE(8,object+0x8e);
 const result=readGameWaveFrames(object,out,4,{memory,scratchBase:0x9000,services:{platformCall(name,a){assert.equal(name,'ReadFile');memory[a[1]]=42;put(memory,a[3],1);return 1;}}});assert.equal(result,4);assert.equal(ptr(memory,scratch+8),4);assert.equal(ptr(memory,object+0x78),4);assert.equal(ptr(memory,object+0xf8),0);assert.equal(memory[object+0x69],1);assert.equal(memory[out],42);
});
test('loop flag2 prevents both rewind and the final EOF marker',()=>{
 const memory=Buffer.alloc(0x800000),object=0x100000,scratch=0x110000,owner=0x120000;put(memory,object+0xdc,scratch);put(memory,object+0xf4,2);put(memory,scratch+8,2);put(memory,object+8,owner);put(memory,owner,0x5d3f60);put(memory,0x5d3fa8,0x4ad500);memory[owner+0x45c]=2;memory[object+0x92]=1;memory.writeUInt16LE(8,object+0x8e);memory.writeUInt16LE(8,object+0xb6);
 assert.equal(readGameWaveFrames(object,0x130000,4,{memory,scratchBase:0x9000}),0);assert.equal(memory[object+0x69],0);assert.equal(ptr(memory,scratch+8),2);
});
test('native negative ADPCM delta adjustment saturates with original coefficients',()=>{
 const memory=initializeGameWaveDecoderTables(Buffer.alloc(0x800000)),object=0x100000,scratch=0x110000,input=0x120000,out=0x130000,file=Buffer.from([0,255,255,208,7,232,3,128]);put(memory,object+0xdc,scratch);put(memory,scratch+16,input);put(memory,scratch+20,out);put(memory,object+0xf4,4);put(memory,object+0xec,4);put(memory,object+0xe8,4);put(memory,object+0x78,8);memory.writeUInt16LE(1,object+0xaa);decodeGameWaveAdpcmBlock(object,fileRuntime(memory,file));assert.deepEqual(Array.from({length:4},(_,i)=>memory.readInt16LE(out+i*2)),[1000,2000,32767,32767]);assert.equal(ptr(memory,scratch),1);assert.equal(ptr(memory,scratch+8),4);
});
test('8-bit PCM expands backwards while AIFF keeps signed byte interpretation',()=>{
 const memory=Buffer.alloc(0x200000),out=0x100000,runtime={memory,scratchBase:0x9000};Buffer.from([0,127,128,255]).copy(memory,out);convertGameWaveSamples(out,8,16,4,0,runtime);assert.deepEqual(Array.from({length:4},(_,i)=>memory.readInt16LE(out+i*2)),[-32768,-256,0,32512]);Buffer.from([0,127,128,255]).copy(memory,out);convertGameWaveSamples(out,8,16,4,1,runtime);assert.deepEqual(Array.from({length:4},(_,i)=>memory.readInt16LE(out+i*2)),[0,32512,-32768,-256]);
});
test('sample-count rounding uses native float32 half-away behavior',()=>{
 const runtime={memory:Buffer.alloc(0x10000),scratchBase:0x9000};assert.deepEqual([0.49,0.5,1.5,-0.5,-1.5].map(x=>roundGameAudioFrameCount(x,runtime)),[0,1,2,-1,-2]);
});
