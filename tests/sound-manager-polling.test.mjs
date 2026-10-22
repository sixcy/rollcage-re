import test from 'node:test';
import assert from 'node:assert/strict';
import {readAudioNanoseconds,getAudioStopwatch} from '../src/audio-stopwatch.mjs';
import {createAudioMixer} from '../src/audio-mixers.mjs';
import {constructManagedAudioThread} from '../src/managed-audio-thread.mjs';
import {copyQueuedAudioCallback,destroyQueuedAudioCallback} from '../src/queued-audio-callback.mjs';
import {initializeSoundManagerPolling} from '../src/sound-manager-polling.mjs';
import {createSoundManagerServices} from '../tools/verify-sound-manager-construction-instructions.mjs';
import {verifySoundManagerPolling} from '../tools/verify-sound-manager-polling-instructions.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),ptr=(m,p)=>m.readUInt32LE(p);
const regs={EBX:17,EBP:19,ESI:23,EDI:29};
test('audio stopwatch retains unsigned wrap and multiplication before division',()=>{
 const memory=Buffer.alloc(0x800000),watch=0x100000,S=0x9000,frequency=0xffffffffffffffffn,difference=0x100000005n;
 memory.writeBigUInt64LE(frequency,watch+40);memory.writeBigUInt64LE(0xffffffffffff0000n,watch+48);
 const runtime={memory,scratchBase:S,entryRegisters:regs,services:{platformCall(name,args){assert.equal(name,'QueryPerformanceCounter');memory.writeBigUInt64LE(BigInt.asUintN(64,0xffffffffffff0000n+difference),args[0]);return 1;}}};
 readAudioNanoseconds(watch,watch+40,runtime);
 const expected=BigInt.asUintN(64,difference*1000000000n)/frequency;
 assert.equal(memory.readBigUInt64LE(watch+40),expected);
});
test('audio stopwatch singleton reloads a publication made while entering its lock',()=>{
 const memory=Buffer.alloc(0x800000),other=0x100000,trace=[];put(memory,0x716d98,1);
 const result=getAudioStopwatch({memory,scratchBase:0x9000,entryRegisters:regs,sehWord:41,services:{platformCall(name){trace.push(name);if(name==='EnterCriticalSection')put(memory,0x714b04,other);return name==='GetCurrentThreadId'?77:0;},libraryCall(){throw Error('unexpected constructor');}}});
 assert.equal(result,other);assert.equal(ptr(memory,0x716db4),0);assert.equal(ptr(memory,0x716db8),0);assert.deepEqual(trace,['EnterCriticalSection','GetCurrentThreadId','LeaveCriticalSection']);
});
test('actual bus factories preserve persistent parent pointers and native vector growth',()=>{
 const memory=Buffer.alloc(0xa00000),manager=0x100000,S=0x9000;memory.write('audio\0',0x5d4a08,'utf16le');
 const services=createSoundManagerServices(memory,0),runtime={memory,scratchBase:S,entryRegisters:regs,sehWord:0,services};
 put(memory,manager+0x84c,0x110000);put(memory,0x5d3ba8,0x4a92e0);
 const objects=[];for(let i=0;i<4;i++){memory.fill(0,S+4,S+36);put(memory,S+28,i);put(memory,S+32,0);objects.push(createAudioMixer(manager,runtime));}
 const vector=ptr(memory,manager+0x84c),begin=ptr(memory,vector);assert.equal(ptr(memory,vector+4)-begin,16);
 assert.equal(ptr(memory,objects[0]+4),0);for(let i=1;i<4;i++)assert.equal(ptr(memory,objects[i]+4),objects[0]);
 assert.deepEqual(Array.from({length:4},(_,i)=>ptr(memory,begin+i*4)),objects);
 assert.equal(ptr(memory,manager+0x86c),0);assert.equal(ptr(memory,manager+0x870),0);
});
test('managed-thread constructor reloads a handle changed by priority service',()=>{
 const memory=Buffer.alloc(0x800000),object=0x100000,name=0x110000,trace=[];memory.write('Audio.Update\0',name);let event=100;
 const runtime={memory,scratchBase:0x9000,entryRegisters:regs,services:{libraryCall(name,args){if(name==='_beginthreadex'){put(memory,args[5],77);return 200;}if(name==='memcpy'){memory.copy(memory,args[0],args[1],args[1]+args[2]);return args[0];}throw Error(name);},platformCall(name,args){trace.push([name,...args]);if(name==='CreateEventW')return event++;if(name==='SetThreadPriority'){put(memory,object+32,201);return 1;}if(name==='ResumeThread')return 1;throw Error(name);}}};
 constructManagedAudioThread(object,name,0x4a3790,object,99,0x4a3320,17,1,runtime);
 assert.equal(ptr(memory,object+36),77);assert.equal(ptr(memory,object+48),99);assert.equal(ptr(memory,object+52),0x4a3790);assert.deepEqual(trace.at(-1),['ResumeThread',201]);
});
test('queued capture is read after an overlapping clone vtable write',()=>{
 const memory=Buffer.alloc(0x800000),object=0x100000;put(memory,object,0x5d3d1c);put(memory,object+4,1234);put(memory,object+8,5678);
 copyQueuedAudioCallback(object,object+4,{memory,scratchBase:0x9000,entryRegisters:regs});assert.equal(ptr(memory,object+8),0x5d3d1c);assert.equal(ptr(memory,object+12),0);
 put(memory,0x5d3d30,0x40ee80);const freed=[];destroyQueuedAudioCallback(object+4,1,{memory,scratchBase:0x9000,entryRegisters:regs,services:{libraryCall(name,args){freed.push([name,...args]);return 0;}}});assert.deepEqual(freed,[['operatorDelete',object+4]]);
});
test('polling refuses an unknown game-owned bus factory',()=>{
 const memory=Buffer.alloc(0x200000);put(memory,0x100000,0x110000);put(memory,0x110040,0x123456);
 assert.throws(()=>initializeSoundManagerPolling(0x100000,{memory,scratchBase:0x9000}),/Unported SoundManager virtual 40/);
});
test('complete polling startup matches native writes across allocation and thread failure',async()=>{
 const proof=await verifySoundManagerPolling({fixtures:4,output:null});
 assert.equal(proof.actualGameCalls['4b1dd0'],16);assert.equal(proof.actualGameCalls['4a7460'],4);assert.equal(proof.actualGameCalls['4a33c0'],3);assert.equal(proof.matched,true);
});
