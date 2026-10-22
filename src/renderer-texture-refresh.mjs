import {copyRendererTexturePixels,commitRendererTexture} from './renderer-texture-upload.mjs';
import {releaseGameImageList,appendGameImagePointer} from './game-image-storage.mjs';
import {constructGamePixelImageCopy} from './game-image-copy.mjs';
import {buildGameImageMipmaps} from './game-image-mipmaps.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
//50f2e0, manager virtual90. Only the all-ones sentinel is special.
export function getRendererTextureResource(manager,index,runtime){return (index|0)===-1?0:ptr(runtime.memory,ptr(runtime.memory,manager+0x48c)+Math.imul(index,4));}
//4bc0e0. Construct an owning list from a real deep-copy of one source image,
//then build all native mip levels down to1 using the longer dimension.
export function constructRendererSingleImageList(output,image,unused,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-20;put(m,s+4,image);put(m,s+8,unused);
  put(m,output,0);put(m,output+4,0);put(m,output+8,0);
  releaseGameImageList(output,{...runtime,scratchBase:f-4,entryRegisters:{...runtime.entryRegisters,ESI:output}});
  const copy=constructGamePixelImageCopy(ptr(m,s+4),{...runtime,scratchBase:f-4,entryRegisters:{...runtime.entryRegisters,ESI:output}});put(m,s+4,copy);
  put(m,f-4,s+4);put(m,f-8,0x4bc137);appendGameImagePointer(output,s+4,{...runtime,scratchBase:f-8,entryRegisters:{...runtime.entryRegisters,ESI:output}});
  put(m,f-4,0);put(m,f-8,1);put(m,f-12,0x4bc142);buildGameImageMipmaps(output,1,0,{...runtime,scratchBase:f-12,entryRegisters:{...runtime.entryRegisters,ESI:output}});
  return output;
}
//51f470, the original texture-resource virtual10. It ignores the HRESULT of
//GetSurfaceLevel but tests the produced pointer, and always commits afterward
//when the primary texture was nonzero at entry.
export function refreshRendererTexture(resource,list,runtime){
  const m=runtime.memory,s=runtime.scratchBase,bp=s-4,f=(bp&~7)-16,primary=ptr(m,resource+0x438);put(m,s+4,list);
  if(runtime.entryRegisters?.EBP!==undefined)put(m,bp,runtime.entryRegisters.EBP);
  if(runtime.entryRegisters?.ESI!==undefined)put(m,f,runtime.entryRegisters.ESI);
  const call=(object,method,args,ret)=>{args.forEach((v,i)=>put(m,f-args.length*4+i*4,v));const entry=f-args.length*4-4;put(m,entry,ret);if(typeof runtime.services?.direct3DCall!=='function')throw Error('Renderer texture refresh requires Direct3D COM services.');return runtime.services.direct3DCall(object,method,args,{...runtime,scratchBase:entry})|0;};
  if(!primary)return;
  put(m,f+4,0);call(primary,0x48,[primary,0,f+4],0x51f49b);
  let surface=ptr(m,f+4);
  if(surface){
    const result=call(surface,0x34,[surface,f+8,0,0],0x51f4b2);
    if(result===0){
      const manager=ptr(m,0x714ae8),locked=f+8;put(m,f-4,locked);const liveList=ptr(m,s+4);
      const format=get(m,resource+0x444);put(m,f-8,format);const category=get(m,resource+0x454);put(m,f-12,category);const image=ptr(m,ptr(m,liveList));put(m,f-16,image);put(m,f-20,0x51f4de);
      copyRendererTexturePixels(manager,image,category,format,locked,{...runtime,scratchBase:f-20,entryRegisters:{...runtime.entryRegisters,ESI:resource,EBP:bp}});
      surface=ptr(m,f+4);call(surface,0x38,[surface],0x51f4e8);
    }
    surface=ptr(m,f+4);if(surface){call(surface,8,[surface],0x51f4f6);put(m,f+4,0);}
  }
  commitRendererTexture(resource,{...runtime,scratchBase:f-4,entryRegisters:{...runtime.entryRegisters,ESI:resource,EBP:bp}});
}
