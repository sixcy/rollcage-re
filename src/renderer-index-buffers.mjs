import {appendGameImagePointer} from './game-image-storage.mjs';
import {reportGameAssertion,initializeGameAssertionConstants} from './game-assertion.mjs';
import constants from './renderer-index-buffer-constants.json' with {type:'json'};
export function initializeRendererIndexBufferConstants(memory){initializeGameAssertionConstants(memory);for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer index buffers require CRT ${name}.`);return r.services.libraryCall(name,args,r);};
const com=(r,object,method,args)=>{if(typeof r.services?.direct3DCall!=='function')throw Error('Renderer index buffers require Direct3D COM services.');return r.services.direct3DCall(object,method,args,r)|0;};
//52cde0. Pool/usage derives from+24h, not the constructor's separate+10h.
export function ensureRendererIndexBuffer(buffer,runtime){
  const m=runtime.memory;if(ptr(m,buffer+0x14))return 1;const flags=get(m,buffer+0x24);let usage=flags&2?0x208:8,pool=0;if(flags&1){usage&=~8;pool=2;}
  const manager=ptr(m,0x714ae8),device=ptr(m,manager+0x36c);
  return com(runtime,device,0x6c,[device,Math.imul(get(m,buffer+12),2),usage,0x65,pool,buffer+0x14,0])===0?1:0;
}
//52c650. CPU storage is malloc'd without zeroing; ownership is appended
//before the hardware buffer is requested, whose HRESULT the parent ignores.
export function createRendererIndexBuffer(manager,flags,count,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-28;put(m,s+4,flags);put(m,s+8,count);put(m,f+12,manager);
  const capturedCount=count|0;let bytes=Math.imul(capturedCount,2)>>>0;
  const buffer=library(runtime,'operatorNew',[48])>>>0;
  if(buffer){
    const pixels=library(runtime,'allocate',[bytes])>>>0;
    if(!pixels){bytes>>>=10;const result=reportGameAssertion(0x5d399c,26,0x5d3938,[bytes],{...runtime,scratchBase:f-24,entryRegisters:{...runtime.entryRegisters,ESI:buffer,EDI:bytes,EBP:capturedCount,EBX:pixels}});if(result){const error=Error('Native index-buffer allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=0x52c6c2;throw error;}}
    put(m,buffer+4,pixels);put(m,buffer+8,pixels);put(m,buffer+12,capturedCount);put(m,buffer+16,get(m,s+4));put(m,buffer,0x5dc1ec);
    for(const o of[0x14,0x18,0x1c,0x20,0x24,0x2c])put(m,buffer+o,0);m[buffer+0x28]=0;
  }
  put(m,s+8,buffer);appendGameImagePointer(ptr(m,f+12)+0x59c,s+8,{...runtime,scratchBase:f-8,entryRegisters:{...runtime.entryRegisters,ESI:buffer,EDI:bytes,EBP:capturedCount}});
  ensureRendererIndexBuffer(ptr(m,s+8),{...runtime,scratchBase:f-4});return ptr(m,s+8);
}
//52ccd0. Only offset/count are read; two further DWORD arguments are unused.
//The Direct3D offset is deliberately not multiplied by2, unlike copy lengths.
export function lockRendererIndexBuffer(buffer,offset,count,unused0,unused1,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-12;[offset,count,unused0,unused1].forEach((v,i)=>put(m,s+4+i*4,v));
  let length=count|0;if(!length)length=get(m,buffer+12)-offset|0;put(m,buffer+0x1c,offset);put(m,buffer+0x20,length);
  if(m[buffer+0x28]===1){const object=ptr(m,buffer+0x14);if(object){put(m,buffer+0x18,get(m,buffer+4));put(m,s+8,0);
    if(com({...runtime,scratchBase:f-24},object,0x2c,[object,offset,Math.imul(length,2),s+8,0])!==0)return 0;
    put(m,buffer+4,get(m,s+8)-Math.imul(get(m,buffer+0x1c),2));
  }}
  return 1;
}
//52cd40. Update-end is tested by its low byte. Borrowed storage restores the
//CPU pointer after unlocking; ordinary CPU writes are copied to a fresh lock.
export function unlockRendererIndexBuffer(buffer,updateEnd,unused,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-4;put(m,s+4,updateEnd);put(m,s+8,unused);const update=m[s+4]===1;
  if(update){const start=get(m,buffer+4),needed=get(m,buffer+0x20)+get(m,buffer+0x1c)|0;if(((get(m,buffer+8)-start|0)>>1)<needed)put(m,buffer+8,start+Math.imul(needed,2));}
  if(ptr(m,buffer+0x18)){const object=ptr(m,buffer+0x14);com({...runtime,scratchBase:f-8},object,0x30,[object]);put(m,buffer+4,get(m,buffer+0x18));put(m,buffer+0x18,0);return;}
  if(update){const object=ptr(m,buffer+0x14);if(object){put(m,s+4,0);
    const result=com({...runtime,scratchBase:f-24},object,0x2c,[object,get(m,buffer+0x1c),Math.imul(get(m,buffer+0x20),2),s+4,0]);
    if(result===0){const count=Math.imul(get(m,buffer+0x20),2)>>>0,input=ptr(m,buffer+4)+Math.imul(get(m,buffer+0x1c),2),output=ptr(m,s+4);library(runtime,'memcpy',[output,input,count]);const live=ptr(m,buffer+0x14);com({...runtime,scratchBase:f-8},live,0x30,[live]);}
  }}
}
