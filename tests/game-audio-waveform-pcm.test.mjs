import test from 'node:test';
import assert from 'node:assert/strict';
import {copyGameWaveformPcm} from '../src/game-audio-waveform-pcm.mjs';
import {verifyGameAudioWaveformPcm} from '../tools/verify-game-audio-waveform-pcm-instructions.mjs';
import {verifyGameAudioFileWrite} from '../tools/verify-game-audio-file-write-instructions.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p);
test('unequal8bit waveform rates retire a temporary without writing output',()=>{
 const memory=Buffer.alloc(0xa00000),S=0x9000,format=0x100000,blocks=0x110000,output=0x140000,trace=[];put(memory,format+4,22050);memory.writeUInt16LE(8,format+14);put(memory,blocks,0x120000);put(memory,blocks+4,0x120004);put(memory,0x120000,0x130000);put(memory,0x130000,0x131000);put(memory,0x130008,4);memory.set([1,2,3,4],0x131000);memory.fill(0xa7,output,output+8);for(const[i,value]of[blocks,4,8,44100,output].entries())put(memory,S+4+i*4,value);
 copyGameWaveformPcm(format,blocks,4,8,44100,output,{memory,scratchBase:S,services:{libraryCall(name,args){trace.push([name,...args]);if(name==='allocate')return 0x150000;if(name==='memcpy')memory.copy(memory,args[0],args[1],args[1]+args[2]);}}});
 assert.deepEqual(memory.subarray(output,output+8),Buffer.alloc(8,0xa7));assert.deepEqual(trace.map(e=>e[0]),['allocate','memcpy','free']);
});
test('PCM kernels, backend storage/export and real write adapters match instructions',async()=>{
 assert((await verifyGameAudioWaveformPcm({fixtures:36,output:null})).matched);
 assert((await verifyGameAudioWaveformPcm({fixtures:33,withBackend:true,output:null})).matched);
 assert((await verifyGameAudioWaveformPcm({fixtures:24,withBackend:true,withExport:true,output:null})).matched);
 assert((await verifyGameAudioFileWrite({fixtures:60,output:null})).matched);
});
