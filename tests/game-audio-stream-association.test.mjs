import test from 'node:test';
import assert from 'node:assert/strict';
import {associateGameAudioStream} from '../src/game-audio-stream-association.mjs';
import {verifyGameAudioStreamAssociation} from '../tools/verify-game-audio-stream-association-instructions.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p);
test('stream association publishes decoder and flags while preserving existing channel',()=>{
 const memory=Buffer.alloc(0xa00000),sample=0x100000,decoder=0x110000,S=0x9000;put(memory,sample,0x5d3f60);put(memory,0x5d3f88,0x4ad320);put(memory,sample+0x458,0x201);put(memory,sample+0x97c,0x170000);put(memory,S+4,decoder);memory.writeUInt16LE(2,decoder+0x82);memory.writeUInt16LE(16,decoder+0x8e);put(memory,decoder+0x84,44100);
 associateGameAudioStream(sample,decoder,{memory,scratchBase:S});assert.equal(memory.readUInt32LE(sample+0x968),decoder);assert.equal(memory.readInt32LE(sample+0x954),11);assert.equal(memory.readUInt16LE(decoder+0x8c),4);assert.equal(memory.readUInt32LE(decoder+0x88),176400);assert.equal(memory.readUInt32LE(sample+0x97c),0x170000);
});
test('stream association executes real old decoder cleanup, mixer lookup and channel setup',async()=>{const report=await verifyGameAudioStreamAssociation({fixtures:36,output:null});assert(report.matched);assert(report.actualGameCalls['4b4060']>0);assert(report.actualGameCalls['4b1d30']>0);});
