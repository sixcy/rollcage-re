//4ad420; retained9266. Inline position callback40f240/40f2a0/40ee80.
//Heap services remain explicit. No game callback answer or initialized output
//is accepted in place of these original store/dispatch algorithms.
import {assertNativeMemorySpan,nativeCodeAddress} from './native-memory-spans.mjs';

const uint=(value,label)=>{
  if(!Number.isInteger(value)||value< -0x80000000||value>0xffffffff)throw Error(`Native sound callback requires explicit x86 ${label}.`);
  return value>>>0;
};
function access(runtime){
  const m=runtime.memory,actual=p=>nativeCodeAddress(p,runtime);
  const admit=(address,length,label,comparison)=>{assertNativeMemorySpan(m,address,length);runtime.onSoundSourceRead?.({address,length,label,comparison});};
  const read=(p,label='callback-input')=>{admit(p,4,label,'read-only');return m.readUInt32LE(p);};
  const put=(p,v,label='callback-state')=>{admit(p,4,label,'mutable');m.writeUInt32LE(v>>>0,p);};
  const byte=p=>{admit(p,1,'callback-delete-flag','read-only');return m[p];};
  return {m,actual,read,put,byte};
}
function library(runtime,iat,args,top,returned){
  const {read,put,actual}=access(runtime);
  for(let i=args.length-1;i>=0;i--)put(top-(args.length-i)*4,args[i],'callback-library-argument');
  const S=top-args.length*4-4,target=read(actual(iat),'callback-library-import');
  put(S,actual(returned),'callback-library-return');
  const name=iat===0x56e220?'operatorNew':iat===0x56e210?'operatorDelete':'allocationFailure';
  if(typeof runtime.services?.libraryCall!=='function')throw Error(`Native sound callback requires library service ${name}.`);
  return runtime.services.libraryCall(name,args.map((_,i)=>read(S+4+i*4)),{
    ...runtime,scratchBase:S,nativeSoundCallbackCall:Object.freeze({iatAddress:actual(iat),target,returnAddress:actual(returned)})
  });
}

//40f240 reads the destination argument before saving ESI. The two object
//stores are ordered: an overlapping destination can change the captured read.
export function copyNativeSoundPositionCallbackOnStack(callback,runtime){
  const {actual,read,put}=access(runtime),S=uint(runtime.scratchBase,'entry ESP'),esi=uint(runtime.entryRegisters?.ESI,'incoming ESI');
  let destination=read(S+4,'callback-clone-destination');
  put(S-4,esi,'callback-saved-esi');
  if(!destination){
    const result=library({...runtime,entryRegisters:{...runtime.entryRegisters,ESI:callback}},0x56e220,[12],S-4,0x40f253);
    destination=uint(typeof result==='number'?result:result?.eax,'operatorNew EAX');
    if(!destination){
      library({...runtime,entryRegisters:{...runtime.entryRegisters,ESI:callback}},0x56e200,[],S-4,0x40f260);
      throw Error('Native sound callback allocation-failure service unexpectedly returned.');
    }
  }
  put(destination,actual(0x5d0294),'callback-clone-vtable');
  put(destination+4,read(callback+4,'callback-captured-wrapper'),'callback-clone-capture');
  //The allocated/inline object's third DWORD is deliberately untouched.
  return destination;
}

//40ee80's base destructor first changes the vtable, then optionally deletes.
function destroyBase(callback,runtime){
  const {actual,put,byte}=access(runtime),S=runtime.scratchBase,deleting=byte(S+4)&1;
  put(S-4,uint(runtime.entryRegisters?.ESI,'incoming ESI'),'callback-base-saved-esi');
  put(callback,actual(0x5d02b4),'callback-base-vtable');
  if(deleting)library({...runtime,entryRegisters:{...runtime.entryRegisters,ESI:callback}},0x56e210,[callback],S-4,0x40ee97);
  return callback;
}

//40f2a0 always dispatches the base destructor with argument0, then tests the
//whole low byte of its own flag to decide whether to call operator delete.
function destroyPosition(callback,runtime){
  const {actual,read,put,byte}=access(runtime),S=runtime.scratchBase;
  put(S-4,uint(runtime.entryRegisters?.ESI,'incoming ESI'),'callback-destroy-saved-esi');
  put(S-8,0,'callback-base-argument');
  const target=read(read(callback,'callback-destroy-vtable')+0x14,'callback-base-method');
  put(S-12,actual(0x40f2aa),'callback-base-return');
  if(target!==actual(0x40ee80))throw Error(`Native sound callback base target0x${target.toString(16)} is not reconstructed.`);
  destroyBase(callback,{...runtime,scratchBase:S-12,entryRegisters:{...runtime.entryRegisters,ESI:callback}});
  if(byte(S+4))library({...runtime,entryRegisters:{...runtime.entryRegisters,ESI:callback}},0x56e210,[callback],S-4,0x40f2b8);
}

function dispatch(callback,method,argument,top,returned,runtime){
  const {actual,read,put}=access(runtime),target=read(read(callback,'callback-function-vtable')+method,'callback-function-method');
  put(top-4,argument,'callback-virtual-argument');put(top-8,actual(returned),'callback-virtual-return');
  const child={...runtime,scratchBase:top-8};
  if(method===0&&target===actual(0x40f240))return copyNativeSoundPositionCallbackOnStack(callback,child);
  if(method===0x10&&target===actual(0x40f2a0)){destroyPosition(callback,child);return;}
  throw Error(`Native sound callback virtual${method.toString(16)} target0x${target.toString(16)} is not reconstructed.`);
}

//The incoming std::function occupies24 by-value bytes atS+4. Its pointer at
//S+20 may refer to inlineS+4, a heap object, NULL or the destination itself.
export function replaceNativeSoundSampleCallbackOnStack(object,runtime){
  const {actual,read,put}=access(runtime),S=uint(runtime.scratchBase,'entry ESP'),incomingEsi=uint(runtime.entryRegisters?.ESI,'incoming ESI');
  const previous=uint(runtime.nativeTls?.sehWord,'FS:[0]'),F=S-16,storage=uint(object,'sample')+0x930;
  if(S<40||(S&3)||storage>0xffffffff)throw Error('Native sound callback requires bounded DWORD-aligned stack and sample storage.');
  put(S-4,0xffffffff,'callback-seh-state');put(S-8,actual(0x56a6d8),'callback-seh-handler');put(S-12,previous,'callback-seh-previous');
  runtime.nativeTls.sehWord=S-12;
  put(F,incomingEsi,'callback-saved-esi');put(S-4,0,'callback-seh-state');
  const child={...runtime,entryRegisters:{...runtime.entryRegisters,ESI:storage}};
  let incoming;
  if(storage!==S+4){
    const old=read(storage+16,'callback-old-function');
    if(old){dispatch(old,0x10,Number(old!==storage),F,0x4ad461,child);put(storage+16,0,'callback-old-function');}
    incoming=read(S+20,'callback-incoming-function');
    if(!incoming)put(storage+16,0,'callback-installed-function');
    else{put(storage+16,dispatch(incoming,0,incoming===S+4?storage:0,F,0x4ad486,child),'callback-installed-function');incoming=read(S+20,'callback-incoming-function');}
  }else incoming=read(S+20,'callback-incoming-function');
  put(S-4,0xffffffff,'callback-seh-state');
  if(incoming)dispatch(incoming,0x10,Number(incoming!==S+4),F,0x4ad4ab,child);
  //MOV ECX,[ESP+4] restores the LIVE saved word, not a cached initial value.
  runtime.nativeTls.sehWord=read(F+4,'callback-seh-restore');
  //POP ESI; ADD ESP,12; RET18 leave all carried stack bytes intact.
}
