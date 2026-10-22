import test from 'node:test';
import assert from 'node:assert/strict';
import {destroyGameAudioSpectrumState,resetGameAudioDecoderBlocks,releaseCachedGameAudioWaveform} from '../src/game-audio-decoder-lifecycle.mjs';
import {verifyGameAudioDecoderLifecycle} from '../tools/verify-game-audio-decoder-lifecycle-instructions.mjs';
import {verifyGameAudioPopulation} from '../tools/verify-game-audio-population-instructions.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),ptr=(m,p)=>m.readUInt32LE(p);
test('spectrum cleanup reloads later pointers after deletion',()=>{
 const memory=Buffer.alloc(0xa00000),object=0x100000,events=[];put(memory,object+28,0x200000);put(memory,object+36,0x200100);
 destroyGameAudioSpectrumState(object,{memory,scratchBase:0x9000,services:{libraryCall(name,args){events.push([name,...args]);if(args[0]===0x200000)put(memory,object+36,0x200200);}}});
 assert.deepEqual(events,[['operatorDeleteArray',0x200000],['operatorDeleteArray',0x200200]]);assert.equal(ptr(memory,object+36),0);
});
test('block reset rounds native vector byte count upward and reloads final vector',()=>{
 const memory=Buffer.alloc(0xa00000),object=0x100000,events=[];put(memory,0x715b08,1);put(memory,0x714afc,0x715b30);put(memory,0x714b18,1);put(memory,object+0xa4,0x110000);put(memory,0x110000,0x120000);put(memory,0x110004,0x120005);put(memory,0x120000,0x130000);put(memory,0x120004,0x130100);put(memory,0x130000,0x140000);put(memory,0x130100,0);put(memory,0x110100,0x150000);put(memory,0x110104,0x150020);
 resetGameAudioDecoderBlocks(object,{memory,scratchBase:0x9000,sehWord:0,services:{libraryCall(name,args){events.push([name,...args]);if(name==='operatorDelete')put(memory,object+0xa4,0x110100);}}});
 assert.deepEqual(events,[['free',0x140000],['operatorDelete',0x130000],['operatorDelete',0x130100]]);assert.equal(ptr(memory,0x110104),0x150000);assert.equal(ptr(memory,0x110004),0x120005);
});
test('cached waveform removal destroys only first duplicate before shifting suffix',()=>{
 const memory=Buffer.alloc(0xa00000),object=0x100000,events=[];put(memory,0x714b08,0x110000);put(memory,0x110830,0x120000);put(memory,0x120000,0x130000);put(memory,0x120004,0x13000c);put(memory,0x130000,object);put(memory,0x130004,object);put(memory,0x130008,0x140000);put(memory,object,0x5d407c);put(memory,0x5d407c,0x4afc00);put(memory,object+0x424,0x150000);
 releaseCachedGameAudioWaveform(object,{memory,scratchBase:0x9000,sehWord:0,services:{libraryCall(name,args){events.push([name,...args]);if(name==='memmove')Buffer.from(memory.subarray(args[1],args[1]+args[2])).copy(memory,args[0]);}}});
 assert.deepEqual(events,[['free',0x150000],['operatorDelete',object],['memmove',0x130000,0x130004,8]]);assert.equal(ptr(memory,0x120004),0x130008);assert.equal(ptr(memory,0x130000),object);assert.equal(ptr(memory,0x130004),0x140000);
});
test('native file-open and populated cleanup graphs retain full private frames',async()=>{
 assert((await verifyGameAudioDecoderLifecycle({fixtures:24,output:null})).matched);
 const report=await verifyGameAudioDecoderLifecycle({fixtures:32,cleanup:true,output:null});assert(report.matched);assert(report.actualGameCalls['4afc00']>0);assert(report.actualGameCalls['40ed50']>0);
});
test('concrete decoder ownership and PCM block population match retained instructions',async()=>{
 const release=await verifyGameAudioDecoderLifecycle({fixtures:36,releaseDecoders:true,withVorbis:true,output:null});assert(release.matched);assert(release.actualGameCalls['4b3a00']>0);assert(release.actualGameCalls['4ad5b0']>0);
 const population=await verifyGameAudioPopulation({fixtures:24,output:null});assert(population.matched);assert(population.actualGameCalls['40f060']>0);
});
