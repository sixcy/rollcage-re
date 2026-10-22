import {appendRendererFreeIndex, releaseRendererFreeIndices} from './renderer-resource-pools.mjs';
const get = (m,p) => m.readInt32LE(p), ptr = (m,p) => m.readUInt32LE(p), put = (m,p,v) => m.writeInt32LE(v|0,p);
const entry = runtime => {if(!Number.isInteger(runtime.scratchBase))throw Error('File-path ownership requires native entry ESP.');return runtime.scratchBase;};
const save = (runtime,pairs) => {for(const [reg,offset] of pairs)if(runtime.entryRegisters?.[reg]!==undefined)put(runtime.memory,runtime.scratchBase+offset,runtime.entryRegisters[reg]);};
function call(runtime,kind,name,args,top,returned){
  const m=runtime.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-args.length*4-4;put(m,S,returned);
  const service=runtime.services?.[kind];if(typeof service!=='function')throw Error(`File-path ownership requires ${kind} ${name}.`);
  return service(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...runtime,scratchBase:S});
}

//4a0b80. This is a pointer-retention cache with a critical section, not an
//observed asynchronous reader. The constructor's flag is a WORD, not DWORD.
export function constructGameAsyncFileManager(runtime){
  const {memory:m}=runtime,S=entry(runtime),frame=S-12;
  put(m,S-4,-1);put(m,S-8,0x56a045);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);
  put(m,0x715a68,0);put(m,0x715a6c,0);call(runtime,'platformCall','InitializeCriticalSectionAndSpinCount',[0x715a50,0x1000],frame,0x4a0bb9);
  m.writeUInt16LE(1,0x715a70);put(m,frame+8,0);for(const p of [0x715a74,0x715a78,0x715a7c,0x715a80,0x715a84])put(m,p,0);
  const sentinel=call(runtime,'libraryCall','operatorNew',[8],frame,0x4a0c04)>>>0;if(!sentinel)throw Error('Native file-path deque bad_alloc.');
  put(m,0x715a74,sentinel);put(m,sentinel,0);put(m,sentinel+4,0);put(m,ptr(m,0x715a74),0x715a74);return 0x715a50;
}

//4a08f0. Both guard bits and the inner singleton check stay live across the
//real critical-section/registerExit services, including reentrant publication.
export function getGameAsyncFileManager(runtime){
  const {memory:m}=runtime,S=entry(runtime),bp=S-4,frame=S-32;
  save(runtime,[['EBP',-4],['EBX',-24],['ESI',-28],['EDI',-32]]);put(m,bp-4,-1);put(m,bp-8,0x56a00e);if(runtime.sehWord!==undefined)put(m,bp-12,runtime.sehWord);put(m,bp-16,frame);
  let guard=get(m,0x715a20);
  if(!(guard&1)){put(m,0x715a3c,0);put(m,0x715a20,guard|1);put(m,0x715a40,0);call(runtime,'platformCall','InitializeCriticalSectionAndSpinCount',[0x715a24,0x1000],frame,0x4a0944);call(runtime,'libraryCall','registerExit',[0x56d970],frame,0x4a094e);}
  if(!ptr(m,0x714af4)){
    call(runtime,'platformCall','EnterCriticalSection',[0x715a24],frame,0x4a0969);const thread=call(runtime,'platformCall','GetCurrentThreadId',[],frame,0x4a096f);put(m,0x715a3c,get(m,0x715a3c)+1);put(m,bp-4,0);const present=ptr(m,0x714af4);put(m,0x715a40,thread);
    if(!present){guard=get(m,0x715a20);if(!(guard&2)){put(m,0x715a20,guard|2);m[bp-4]=1;put(m,frame-4,0x4a09a4);constructGameAsyncFileManager({...runtime,scratchBase:frame-4,sehWord:bp-12});call(runtime,'libraryCall','registerExit',[0x56d910],frame,0x4a09ae);}put(m,0x714af4,0x715a50);}
    const depth=get(m,0x715a3c)-1|0;put(m,0x715a3c,depth);const threadWord=get(m,0x715a40);put(m,0x715a40,depth?threadWord:0);call(runtime,'platformCall','LeaveCriticalSection',[0x715a24],frame,0x4a09de);
  }
  return ptr(m,0x714af4);
}

//4a0d20. Free oldest allocated wide paths until the unsigned limit is met.
//The threshold is loaded only after lock/thread services; iterator words are
//the actual40eec0 output, retaining the original deque sentinel indirection.
export function trimGameAsyncFilePaths(manager,maximum,runtime){
  const {memory:m}=runtime,S=entry(runtime),frame=S-20;put(m,S+4,maximum);save(runtime,[['EBP',-16],['EDI',-20]]);
  call(runtime,'platformCall','EnterCriticalSection',[manager],frame,0x4a0d2e);const thread=call(runtime,'platformCall','GetCurrentThreadId',[],frame,0x4a0d34);put(m,manager+24,get(m,manager+24)+1);maximum=ptr(m,S+4);put(m,manager+28,thread);
  if(ptr(m,manager+52)>maximum){save({...runtime,scratchBase:frame},[['EBX',-4],['ESI',-8]]);const loopFrame=frame-8,iterator=loopFrame+16;
    while(ptr(m,manager+52)>maximum){
      put(m,loopFrame-4,iterator);put(m,loopFrame-8,0x4a0d52);put(m,iterator,ptr(m,manager+36));put(m,iterator+4,0);put(m,iterator+8,ptr(m,manager+48));
      const holder=ptr(m,iterator),deque=holder?ptr(m,holder):0,offset=ptr(m,iterator+8),block=ptr(m,ptr(m,deque+4)+((offset>>>2&(ptr(m,deque+8)-1))*4)),path=ptr(m,block+(offset&3)*4);
      call(runtime,'libraryCall','operatorDeleteArray',[path],loopFrame,0x4a0d7a);const count=get(m,manager+52)-1|0;put(m,manager+52,count);if(count)put(m,manager+48,get(m,manager+48)+1);else put(m,manager+48,0);
    }
  }
  const depth=get(m,manager+24)-1|0;put(m,manager+24,depth);if(!depth)put(m,manager+28,0);call(runtime,'platformCall','LeaveCriticalSection',[manager],frame,0x4a0da8);
}

//4a0880. Trim to250 BEFORE appending: the resulting retained queue can have
//251 entries. The caller owns the allocated wide string until this transfer.
export function queueGameAsyncFilePath(manager,widePathAddress,runtime){
  const {memory:m}=runtime,S=entry(runtime),frame=S-4;put(m,S+4,widePathAddress);save(runtime,[['ESI',-4]]);
  if(!m[0x714af8]){m[0x714af8]=1;call(runtime,'libraryCall','registerExit',[0x4a0db0],frame,0x4a089d);}
  call(runtime,'platformCall','EnterCriticalSection',[manager],frame,0x4a08a7);const thread=call(runtime,'platformCall','GetCurrentThreadId',[],frame,0x4a08ad);put(m,manager+24,get(m,manager+24)+1);put(m,manager+28,thread);
  put(m,frame-4,250);put(m,frame-8,0x4a08bf);trimGameAsyncFilePaths(manager,250,{...runtime,scratchBase:frame-8,entryRegisters:{...runtime.entryRegisters,ESI:manager}});
  put(m,frame-4,S+4);put(m,frame-8,0x4a08cc);appendRendererFreeIndex(manager+36,0,{...runtime,scratchBase:frame-8,valueAddress:S+4,...(runtime.nativeDequeCopies?{nativeDequeEntryEsp:frame-8,entryRegisters:{...runtime.entryRegisters,ESI:manager}}:{})});
  const depth=get(m,manager+24)-1|0;put(m,manager+24,depth);if(!depth)put(m,manager+28,0);call(runtime,'platformCall','LeaveCriticalSection',[manager],frame,0x4a08df);
}

//4a0db0 has no Ghidra procedure identity; its exact five-instruction Listing
//pushes the zero limit before obtaining the singleton, then reuses that slot.
export function flushGameAsyncFilePaths(runtime){
  const {memory:m}=runtime,S=entry(runtime);put(m,S-4,0);put(m,S-8,0x4a0db7);const manager=getGameAsyncFileManager({...runtime,scratchBase:S-8});const maximum=ptr(m,S-4);put(m,S-8,0x4a0dbe);trimGameAsyncFilePaths(manager,maximum,{...runtime,scratchBase:S-8});
}

//56d910 original static destructor.405da0/402930/401c80 are retained empty
//library adapters (MOV EAX,ECX;RET / RET4 / RET), not guessed game no-ops.
export function destroyGameAsyncFileManager(runtime){
  const {memory:m}=runtime,S=entry(runtime),frame=S-4;put(m,frame-4,0);put(m,frame-8,0x56d91d);trimGameAsyncFilePaths(0x715a50,0,{...runtime,scratchBase:frame-8});put(m,frame-4,0x56d927);releaseRendererFreeIndices(0x715a74,{...runtime,scratchBase:frame-4});
  put(m,frame-4,0x56d930);put(m,frame-4,frame+3);put(m,frame-8,0x56d936);call(runtime,'libraryCall','operatorDelete',[ptr(m,0x715a74)],frame,0x56d942);put(m,0x715a74,0);put(m,frame-4,0x56d954);m.writeUInt16LE(0x100,0x715a70);call(runtime,'platformCall','DeleteCriticalSection',[0x715a50],frame,0x56d968);
}

//56d970, original guard critical-section exit callback.
export function destroyGameAsyncFileGuard(runtime){const S=entry(runtime);call(runtime,'platformCall','DeleteCriticalSection',[0x715a24],S,0x56d97b);}
