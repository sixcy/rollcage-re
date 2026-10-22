import {reportGameAssertion,initializeGameAssertionConstants} from './game-assertion.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer startup storage requires CRT ${name}.`);return r.services.libraryCall(name,args,r);};
const platform=(r,name,args)=>{if(typeof r.services?.platformCall!=='function')throw Error(`Renderer startup storage requires Win32 ${name}.`);return r.services.platformCall(name,args,r);};
export function initializeRendererStartupStorageConstants(memory){return initializeGameAssertionConstants(memory);}
//51de80. Preserve the three distinct memsets and each live capacity reload.
//The fourth stack argument is part of the ABI but unread by the algorithm.
export function initializeRendererDrawQueue(queue,capacity,records,kind,unused,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-20;[capacity,records,kind,unused].forEach((v,i)=>put(m,s+4+i*4,v));put(m,queue+0x1c,capacity);put(m,queue+0x14,kind);put(m,queue+0x18,records);m[queue+16]=0;
  const product=BigInt(records>>>0)*24n,recordBytes=product>0xffffffffn?0xffffffff:Number(product);put(m,queue+12,library(runtime,'operatorNewArray',[recordBytes])>>>0);
  const importedMalloc=ptr(m,0x56e258);
  const allocate=(bytes,second,firstPointer=0)=>{const p=library(runtime,'allocate',[bytes>>>0])>>>0;if(!p){const kib=bytes>>>10,result=reportGameAssertion(0x5d399c,26,0x5d3938,[kib],{...runtime,scratchBase:f-20,entryRegisters:{...runtime.entryRegisters,ESI:queue,EDI:kib,EBX:second?0:importedMalloc,EBP:firstPointer}});if(result){const error=Error('Native renderer draw-queue allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=second?0x51df2b:0x51def5;throw error;}}return p;};
  const first=allocate((get(m,queue+0x1c)*4+4)|0,false);put(m,queue+8,first);
  const second=allocate((get(m,queue+0x1c)*4+4)|0,true,first);put(m,queue+4,second);
  library({...runtime,scratchBase:f-16},'memset',[ptr(m,queue+8),0,(get(m,queue+0x1c)*4+4)>>>0]);
  library({...runtime,scratchBase:f-16},'memset',[ptr(m,queue+4),0,(get(m,queue+0x1c)*4+4)>>>0]);
  library({...runtime,scratchBase:f-16},'memset',[ptr(m,queue+4),0,(get(m,queue+0x1c)*4)>>>0]);
  const pointer=ptr(m,queue+8);put(m,queue+32,0);put(m,queue+36,0);put(m,pointer,0);
}
//530da0. A 414h-byte sentinel with only the three links and two tag bytes
//initialized; the rest belongs to the allocator's incoming storage.
export function createRendererWorkerTreeHead(runtime){
  const m=runtime.memory,p=library(runtime,'operatorNew',[0x414])>>>0;if(!p){library(runtime,'throwBadAlloc',[]);throw Error('CRT bad_alloc service returned unexpectedly.');}put(m,p,p);if(p+4>>>0)put(m,p+4,p);if(p+8>>>0)put(m,p+8,p);m.writeUInt16LE(0x101,p+12);return p;
}
//530380. Both mutexes and events are real platform services; the event
//manual-reset/initial-state flags are both one. Null handles are retained.
export function constructRendererWorkerLock(lock,runtime){
  const m=runtime.memory,f=runtime.scratchBase-8;for(const offset of[0x18,0x1c,0x20])put(m,lock+offset,0);put(m,lock,0x5d02fc);put(m,lock+4,0);
  put(m,lock+8,platform({...runtime,scratchBase:f-16},'CreateMutexA',[0,0,0]));put(m,lock+12,platform({...runtime,scratchBase:f-16},'CreateMutexA',[0,0,0]));
  put(m,lock+16,platform({...runtime,scratchBase:f-20},'CreateEventA',[0,1,1,0]));put(m,lock+20,platform({...runtime,scratchBase:f-20},'CreateEventA',[0,1,1,0]));put(m,lock,0x5dc4e0);return lock;
}
//530320. Used twice by the original compiler array constructor5688c0.
export function constructRendererWorkerBlock(block,runtime){
  const m=runtime.memory;for(let offset=0;offset<20;offset+=4)put(m,block+offset,0);constructRendererWorkerLock(block+20,{...runtime,scratchBase:runtime.scratchBase-8});for(let offset=0x38;offset<=0x4c;offset+=4)put(m,block+offset,0);return block;
}
//530480, including the normal completion path of5688c0's actual two-element
//530320 constructor loop. Gaps and inactive storage stay uninitialized.
export function constructRendererWorkerState(worker,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-20;put(m,f+4,worker);m[worker]=0;put(m,worker+4,-1);m[worker+8]=0;
  for(const offset of[12,16,0x28,0x2c,0x30,0x34,0x44,0x40,0x3c,0x38])put(m,worker+offset,0);put(m,worker+0x48,-1);for(let offset=0x4c;offset<=0x6c;offset+=4)put(m,worker+offset,0);m[worker+0x74]=0;put(m,worker+0x78,0);put(m,worker+0x7c,0);
  put(m,worker+0x78,createRendererWorkerTreeHead({...runtime,scratchBase:f-4}));
  for(let index=0;index<2;index++)constructRendererWorkerBlock(worker+0x80+index*0x50,{...runtime,scratchBase:f-80});
  return worker;
}
