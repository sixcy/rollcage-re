import {createAudioMixer} from './audio-mixers.mjs';
import {createQueuedAudioSource} from './queued-audio-source.mjs';
import {getAudioStopwatch,readAudioNanoseconds} from './audio-stopwatch.mjs';
import {constructManagedAudioThread} from './managed-audio-thread.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
function call(r,kind,name,args,top,ret){const m=r.memory;args.forEach((v,i)=>put(m,top-4*args.length+i*4,v));const S=top-4*args.length-4;put(m,S,ret);return r.services[kind](name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function method(r,manager,offset,target){const actual=ptr(r.memory,ptr(r.memory,manager)+offset);if(actual!==target)throw Error('Unported SoundManager virtual '+offset.toString(16)+' target '+actual.toString(16));}
//4a5d50 initializes four buses, the default queued source, the timestamp and
//ManagedPollThread. _beginthreadex remains a genuine CRT boundary: no host
//thread or asynchronous game callback is executed by this reference.
export function initializeSoundManagerPolling(manager,runtime){
 const {memory:m,scratchBase:S}=runtime,F=S-36;
 if(!Number.isInteger(S))throw Error('Sound polling requires native entry ESP.');
 put(m,S-4,-1);put(m,S-8,0x56a36c);if(Number.isInteger(runtime.sehWord))put(m,S-12,runtime.sehWord);
 for(const [name,offset]of [['ESI',-32],['EDI',-36]])if(Number.isInteger(runtime.entryRegisters?.[name]))put(m,S+offset,runtime.entryRegisters[name]);
 const regs=(ESI)=>({...runtime.entryRegisters,ESI,EDI:manager}),childSeh=S-12;
 for(let i=0;i<4;i++){
  put(m,F-4,0);put(m,F-8,i);put(m,F-16,0);put(m,F-36,0x4a5d86);method(runtime,manager,0x40,0x4b1dd0);
  createAudioMixer(manager,{...runtime,scratchBase:F-36,sehWord:childSeh,entryRegisters:regs(i)});
 }
 put(m,F-4,2);put(m,F-8,0);put(m,F-12,0x4a5d97);method(runtime,manager,0x24,0x4a7d70);
 createQueuedAudioSource(manager,0,2,{...runtime,scratchBase:F-12,sehWord:childSeh,entryRegisters:regs(4)});
 put(m,F-4,0x4a5d9c);const watch=getAudioStopwatch({...runtime,scratchBase:F-4,sehWord:childSeh,entryRegisters:regs(4)});
 put(m,F-4,F+12);put(m,F-8,0x4a5da8);const out=readAudioNanoseconds(watch,F+12,{...runtime,scratchBase:F-8,sehWord:childSeh,entryRegisters:regs(4)});
 const nanoseconds=m.readBigInt64LE(out);m.writeBigUInt64LE(1000n,F-8);m.writeBigInt64LE(nanoseconds,F-16);put(m,F-20,0x4a5db9);
 const quotient=BigInt.asUintN(64,nanoseconds/1000n);m.writeBigUInt64LE(1000n,F-8);m.writeBigUInt64LE(quotient,F-16);put(m,F-20,0x4a5dc7);
 if(quotient>>32n)put(m,F-24,runtime.entryRegisters?.EBX??0);
 const time=BigInt.asUintN(64,quotient*1000n);put(m,F-4,80);m.writeBigUInt64LE(time,manager+0x8b8);put(m,F-8,0x4a5ddb);
 // ECX is a real volatile allocator input, subsequently pushed as an unused
 // constructor word. A CRT adapter that clobbers it publishes that register.
 const volatileRegisters={EAX:Number(time&0xffffffffn)|0,EDX:Number(time>>32n)|0,ECX:1000};
 const thread=runtime.services.libraryCall('operatorNew',[80],{...runtime,scratchBase:F-8,volatileRegisters})>>>0;
 put(m,F+8,thread);put(m,S-4,0);
 if(thread){
  put(m,F-4,1);put(m,F-8,volatileRegisters.ECX);put(m,F-12,0x4a3320);
  const event=call({...runtime,volatileRegisters},'platformCall','CreateEventW',[0,0,0,0],F-12,0x4a5e06);
  put(m,F-16,event);put(m,F-20,thread);put(m,F-24,0x4a3790);put(m,F-28,0x5d3a88);put(m,F-32,0x4a5e19);
  constructManagedAudioThread(thread,0x5d3a88,0x4a3790,thread,event,0x4a3320,ptr(m,F-8),1,{...runtime,scratchBase:F-32,entryRegisters:regs(thread)});
  put(m,F-4,ptr(m,thread+0x30));put(m,thread,0x5d39f0);put(m,thread+0x4c,20);put(m,thread+0x44,0x4a94a0);put(m,thread+0x48,manager);put(m,F-8,0x4a5e39);
  runtime.services.platformCall('SetEvent',[ptr(m,F-4)],{...runtime,scratchBase:F-8});put(m,manager+0x824,thread);
 }else put(m,manager+0x824,0);
 m[manager+0x820]=1;
}
