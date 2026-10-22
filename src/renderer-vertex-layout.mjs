import {allocateZeroedGameBuffer} from './game-buffer-allocation.mjs';
import {initializeGameAssertionConstants} from './game-assertion.mjs';
import constants from './renderer-vertex-layout-constants.json' with {type:'json'};
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
export function initializeRendererVertexLayoutConstants(memory){initializeGameAssertionConstants(memory);for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
//52d370 is shared by the original base and derived vertex-buffer vtables.
export function setRendererVertexUsage(vertex,usage,runtime){word(runtime.memory,vertex+10,usage);}
//52d380. The logical layout deliberately omits mask20h, although the physical
//vertex pool's52c9c0 stride includes it. Missing attributes leave stale offsets.
export function configureRendererVertexLayout(vertex,flags,count,texCount,usage,storage,runtime){
  const m=runtime.memory,s=runtime.scratchBase;[flags,count,texCount,usage,storage].forEach((v,i)=>put(m,s+4+i*4,v));
  word(m,vertex+0x1c,flags);put(m,vertex+0x14,0);word(m,vertex+0x1e,count);word(m,vertex+0x18,texCount);
  const method=ptr(m,ptr(m,vertex)+0x14);if(method!==0x52d370)throw Error(`Unclosed vertex usage virtual target${method.toString(16)}.`);
  setRendererVertexUsage(vertex,usage,{...runtime,scratchBase:s-20});
  const bits=m.readUInt16LE(vertex+0x1c),align=()=>put(m,vertex+0x14,(get(m,vertex+0x14)+3)&~3);
  if(bits&1){word(m,vertex+4,get(m,vertex+0x14));put(m,vertex+0x14,get(m,vertex+0x14)+12);}align();
  for(const[mask,offset,size]of[[2,8,12],[4,12,4],[0x10,14,24]]){if(bits&mask){word(m,vertex+offset,get(m,vertex+0x14));put(m,vertex+0x14,get(m,vertex+0x14)+size);}align();}
  if((bits&8)&&(texCount|0)>0){word(m,vertex+16,get(m,vertex+0x14));put(m,vertex+0x14,get(m,vertex+0x14)+Math.imul(texCount,8));}align();
  const old=ptr(m,vertex+0x24);if(m.readUInt16LE(vertex+0x20)&&old){if(typeof runtime.services?.libraryCall!=='function')throw Error('Vertex layout requires CRT free.');runtime.services.libraryCall('free',[old],runtime);put(m,vertex+0x24,0);}
  const liveStorage=ptr(m,s+20);word(m,vertex+0x20,liveStorage===0?1:0);
  if(liveStorage)put(m,vertex+0x24,liveStorage);
  else if((count|0)>0){const bytes=Math.imul(m.readUInt16LE(vertex+0x1e),get(m,vertex+0x14))>>>0;put(m,vertex+0x24,allocateZeroedGameBuffer(bytes,{...runtime,scratchBase:s-16,entryRegisters:{...runtime.entryRegisters,EBX:count|0,ESI:vertex,EDI:texCount|0}}));}
  else put(m,vertex+0x24,0);
}
