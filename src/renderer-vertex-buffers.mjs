import {appendGameImagePointer} from './game-image-storage.mjs';
import {configureRendererVertexLayout,initializeRendererVertexLayoutConstants} from './renderer-vertex-layout.mjs';
import {configureRendererVertexPool,attachRendererVertexPool} from './renderer-vertex-pools.mjs';
import {getRendererVertexDeclaration} from './renderer-vertex-declarations.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer vertex buffers require CRT ${name}.`);return r.services.libraryCall(name,args,r);};
const com=(r,object,method,args)=>{if(typeof r.services?.direct3DCall!=='function')throw Error('Renderer vertex buffers require Direct3D COM services.');return r.services.direct3DCall(object,method,args,r)|0;};
export function initializeRendererVertexBufferConstants(memory){return initializeRendererVertexLayoutConstants(memory);}
function vertexMethod(vertex,slot,target,r){const actual=ptr(r.memory,ptr(r.memory,vertex)+slot);if(actual!==target)throw Error(`Unclosed vertex virtual${slot.toString(16)} target${actual.toString(16)}.`);}
function cacheView(vertex,m){const pool=ptr(m,vertex+0x2c);put(m,vertex+0x4c,get(m,pool+4));put(m,vertex+0x54,get(m,pool+12));put(m,vertex+0x50,get(m,pool+8));put(m,vertex+0x58,get(m,vertex+0x34));}
function physicalStride(flags,textures){let stride=flags&1?12:0;for(const[mask,bytes]of[[0x20,16],[2,12],[4,4],[0x10,24]])if(flags&mask)stride=(stride+bytes+3)&~3;if((flags&8)&&(textures|0)>0)stride=(stride+Math.imul(textures,8)+3)&~3;return stride;}
//52c860. Device-buffer ownership and propagation to the captured manager's
//current view list. Nonzero HRESULT (including positive values) is failure.
export function ensureRendererVertexPool(pool,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-20;if(ptr(m,pool+4))return 1;
  const mode=get(m,pool+0x20);let usage=mode&2?0x208:8,kind=0;if(mode&1){usage&=~8;kind=2;}
  let manager=ptr(m,0x714ae8),device=ptr(m,manager+0x36c);
  if(com({...runtime,scratchBase:f-32},device,0x68,[device,ptr(m,pool+0x24),usage,0,kind,pool+4,0]))return 0;
  manager=ptr(m,0x714ae8);const declaration=getRendererVertexDeclaration(manager,get(m,pool+0x14),get(m,pool+0x18),{...runtime,scratchBase:f-12});
  manager=ptr(m,0x714ae8);const resource=ptr(m,pool+4);put(m,pool+8,declaration);put(m,f+16,resource);
  const begin=ptr(m,manager+0x584),end=ptr(m,manager+0x588),count=begin>end?0:((end-begin+3)>>>2);
  for(let i=0,p=begin;i<count;i++,p+=4){const vertex=ptr(m,p);if(ptr(m,vertex+0x2c)===pool){put(m,vertex+0x4c,get(m,f+16));put(m,vertex+0x50,declaration);}}
  return 1;
}
//52b6c0. Own the view before selecting/creating its shared physical pool.
//Existing pools are reused only for mode0 and exact full flags/stride.
export function createRendererVertexBuffer(manager,flags,count,textures,mode,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-36;[flags,count,textures,mode].forEach((v,i)=>put(m,s+4+i*4,v));
  const vertex=library(runtime,'operatorNew',[0x5c])>>>0;put(m,f+20,vertex);
  if(vertex){put(m,vertex,0x5dc364);for(const offset of[4,8,12,16,20,24,28,36,40])put(m,vertex+offset,0);put(m,vertex+32,1);
    configureRendererVertexLayout(vertex,11,0,1,0,0,{...runtime,scratchBase:f-24,entryRegisters:{...runtime.entryRegisters,ESI:vertex,EBP:manager}});
    put(m,vertex,0x5dc21c);for(const offset of[0x2c,0x30,0x34,0x38,0x3c,0x40,0x48,0x4c,0x50,0x54,0x58])put(m,vertex+offset,0);m[vertex+0x44]=0;
  }
  put(m,f+20,vertex);appendGameImagePointer(manager+0x584,f+20,{...runtime,scratchBase:f-8,entryRegisters:{...runtime.entryRegisters,ESI:vertex,EBP:manager}});
  const liveFlags=get(m,s+4);let pool=0;
  if(!get(m,s+16)){const stride=physicalStride(liveFlags,get(m,s+12)),bytes=Math.imul(stride,get(m,s+8)),end=ptr(m,manager+0x594);for(let p=ptr(m,manager+0x590);p!==end;p+=4){const candidate=ptr(m,p);if(get(m,candidate+0x28)>=bytes&&!get(m,candidate+0x20)&&get(m,candidate+0x14)===liveFlags&&get(m,candidate+12)===stride){pool=candidate;break;}}}
  if(pool){const liveVertex=ptr(m,f+20);attachRendererVertexPool(liveVertex,liveFlags,get(m,s+8),get(m,s+12),0,pool,{...runtime,scratchBase:f-24});cacheView(liveVertex,m);return liveVertex;}
  pool=library(runtime,'operatorNew',[0x30])>>>0;if(pool)for(let offset=0;offset<0x30;offset+=4)put(m,pool+offset,0);put(m,f+16,pool);
  appendGameImagePointer(manager+0x590,f+16,{...runtime,scratchBase:f,inlineAppend:true,growthScratchBase:f-8,entryRegisters:{...runtime.entryRegisters,ESI:pool,EDI:manager+0x590,EBX:liveFlags,EBP:manager}});
  const liveTextures=get(m,s+12);configureRendererVertexPool(pool,liveFlags,get(m,s+8),liveTextures,get(m,s+16),{...runtime,scratchBase:f-20});ensureRendererVertexPool(pool,{...runtime,scratchBase:f-4});
  const liveVertex=ptr(m,f+20),used=get(m,pool+0x1c);put(m,liveVertex+0x2c,pool);put(m,liveVertex+0x34,used);const base=ptr(m,pool+0x2c),storage=base?(base+Math.imul(get(m,pool+12),used))>>>0:0,liveCount=get(m,s+8),stride=get(m,pool+12);
  put(m,pool+0x1c,get(m,pool+0x1c)+liveCount);put(m,pool,get(m,pool)+1);put(m,pool+0x28,get(m,pool+0x28)-Math.imul(stride,liveCount));
  configureRendererVertexLayout(liveVertex,liveFlags,liveCount,liveTextures,get(m,s+16),storage,{...runtime,scratchBase:f-24});put(m,liveVertex+0x38,0);cacheView(liveVertex,m);return liveVertex;
}
//52c7c0. The original fallback repeats a failed lock without DISCARD,
//rereading the live device buffer/stride and arguments for the second call.
export function lockRendererVertexPool(pool,offset,count,mode,discard,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-16;[offset,count,mode,discard].forEach((v,i)=>put(m,s+4+i*4,v));put(m,f+12,0);put(m,pool+16,1+((mode&255)===1));let flags=(mode&255)===1&&(discard&255)===1?0x2000:0;
  for(let attempt=0;attempt<2;attempt++){const stride=get(m,pool+12),object=ptr(m,pool+4),result=com({...runtime,scratchBase:f-24},object,0x2c,[object,Math.imul(stride,get(m,s+4))>>>0,Math.imul(stride,get(m,s+8))>>>0,f+12,flags]);if(!result)return ptr(m,f+12);flags&=~0x2000;}
  put(m,pool+16,0);return 0;
}
//52ca80. A borrowed lock rebases only the view's CPU pointer; pool offsets
//stay physical and view offsets stay logical.
export function lockRendererVertexBuffer(vertex,offset,count,mode,discard,runtime){
  const m=runtime.memory,s=runtime.scratchBase;[offset,count,mode,discard].forEach((v,i)=>put(m,s+4+i*4,v));if(get(m,vertex+0x48))return 0;
  if(!count){vertexMethod(vertex,0x28,0x52d000,runtime);count=(m.readUInt16LE(vertex+0x1e)-offset)|0;}
  put(m,vertex+0x3c,offset);put(m,vertex+0x40,count);put(m,vertex+0x48,1+((get(m,s+12)&255)===1));
  if(m[vertex+0x44]===1){const pool=ptr(m,vertex+0x2c);if(ptr(m,pool+4)){const third=get(m,s+12),fourth=get(m,s+16);put(m,vertex+0x30,get(m,vertex+0x24));const output=lockRendererVertexPool(pool,get(m,vertex+0x34)+offset,count,third,fourth,{...runtime,scratchBase:s-28});put(m,vertex+0x24,output);if(!output){put(m,vertex+0x48,0);put(m,vertex+0x24,get(m,vertex+0x30));put(m,vertex+0x30,0);return 0;}put(m,vertex+0x24,output-Math.imul(get(m,vertex+0x14),offset));}}
  return ptr(m,vertex+0x24)!==0?1:0;
}
//52cb20. Mismatched logical/physical strides copy separate rows; count is
//reloaded after every CRT callback. Only update flag's low byte is tested.
export function unlockRendererVertexBuffer(vertex,update,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=((s-4)&~7)-24;put(m,s+4,update);if(!get(m,vertex+0x48))return;
  const unlock=pool=>{if(get(m,pool+16)){const object=ptr(m,pool+4);com({...runtime,scratchBase:f-8},object,0x30,[object]);put(m,pool+16,0);}};
  if(ptr(m,vertex+0x30)){unlock(ptr(m,vertex+0x2c));put(m,vertex+0x24,get(m,vertex+0x30));put(m,vertex+0x30,0);put(m,vertex+0x48,0);return;}
  if((get(m,s+4)&255)===1){const pool=ptr(m,vertex+0x2c);if(ptr(m,pool+4)){let output=lockRendererVertexPool(pool,get(m,vertex+0x34)+get(m,vertex+0x3c),get(m,vertex+0x40),1,0,{...runtime,scratchBase:f-20});
      if(output){const physical=get(m,ptr(m,vertex+0x2c)+12);vertexMethod(vertex,0x24,0x498ea0,runtime);const logical=get(m,vertex+0x14);vertexMethod(vertex,0x30,0x52d300,runtime);let input=(ptr(m,vertex+0x24)+Math.imul(get(m,vertex+0x14),get(m,vertex+0x3c)))>>>0;
        if(logical===physical){const bytes=Math.imul(get(m,vertex+0x14),get(m,vertex+0x40))>>>0;library({...runtime,scratchBase:f-16},'memcpy',[output,input,bytes]);}
        else{put(m,f+16,logical);put(m,f+12,0);put(m,f+20,get(m,ptr(m,vertex+0x2c)+12));while(get(m,f+12)<get(m,vertex+0x40)){library({...runtime,scratchBase:f-16},'memcpy',[output,input,ptr(m,f+16)]);input=(input+get(m,f+16))>>>0;output=(output+get(m,f+20))>>>0;put(m,f+12,get(m,f+12)+1);}}
        unlock(ptr(m,vertex+0x2c));}
      vertexMethod(vertex,0x10,0x52cfe0,runtime);if(!(m.readInt16LE(vertex+10)&2)){put(m,vertex+0x38,get(m,vertex+0x38)+1);if(get(m,vertex+0x38)>=10)getApplicationDebugger({...runtime,scratchBase:f-4,nativeDebuggerFrame:'direct',entryRegisters:{...runtime.entryRegisters,ECX:vertex},handlers:{...runtime.handlers,registerExit:(p,r)=>library(r,'registerExit',[p])}});}
    }}
  put(m,vertex+0x48,0);
}
