import {configureRendererVertexLayout} from './renderer-vertex-layout.mjs';
import {reportGameAssertion} from './game-assertion.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
//52c9c0. Unlike52d380, physical stride includes mask20h's16-byte field.
//Mode0 reserves at least256KiB using a signed size comparison.
export function configureRendererVertexPool(pool,flags,count,texCount,mode,runtime){
  const m=runtime.memory,s=runtime.scratchBase;[flags,count,texCount,mode].forEach((v,i)=>put(m,s+4+i*4,v));
  put(m,pool+0x14,flags);put(m,pool+0x18,texCount);put(m,pool+0x20,mode);
  let stride=flags&1?12:0;
  for(const[mask,bytes]of[[0x20,16],[2,12],[4,4],[0x10,24]])if(flags&mask)stride=(stride+bytes+3)&~3;
  if((flags&8)&&(texCount|0)>0)stride=(stride+Math.imul(texCount,8)+3)&~3;
  put(m,pool+12,stride);let bytes=Math.imul(stride,get(m,s+8));if(!(mode|0))bytes=Math.max(bytes,0x40000);put(m,pool+0x24,bytes);put(m,pool+0x28,bytes);put(m,pool+0x1c,0);
  if(typeof runtime.services?.libraryCall!=='function')throw Error('Vertex pool requires CRT malloc.');
  const memory=runtime.services.libraryCall('allocate',[bytes>>>0],runtime)>>>0;
  if(!memory){const kib=bytes>>>10,result=reportGameAssertion(0x5d399c,26,0x5d3938,[kib],{...runtime,scratchBase:s-32,entryRegisters:{...runtime.entryRegisters,ESI:kib,EBX:0,EDI:pool}});if(result){const error=Error('Native vertex-pool allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=0x52ca70;throw error;}}
  put(m,pool+0x2c,memory);return 1;
}
//52cc70. Views use physical stride for their backing offset but retain their
//own actual logical descriptor. Existing GPU cache fields remain untouched.
export function attachRendererVertexPool(vertex,flags,count,texCount,usage,pool,runtime){
  const m=runtime.memory,s=runtime.scratchBase;[flags,count,texCount,usage,pool].forEach((v,i)=>put(m,s+4+i*4,v));put(m,vertex+0x2c,pool);
  const used=get(m,pool+0x1c);put(m,vertex+0x34,used);const base=ptr(m,pool+0x2c),storage=base?(base+Math.imul(get(m,pool+12),used))>>>0:0,liveCount=get(m,s+8),stride=get(m,pool+12);
  put(m,pool+0x1c,get(m,pool+0x1c)+liveCount);put(m,pool,get(m,pool)+1);put(m,pool+0x28,get(m,pool+0x28)-Math.imul(stride,liveCount));
  configureRendererVertexLayout(vertex,get(m,s+4),liveCount,get(m,s+12),get(m,s+16),storage,{...runtime,scratchBase:s-32,entryRegisters:{...runtime.entryRegisters,ESI:storage,EDI:vertex}});
  put(m,vertex+0x38,0);return 1;
}
