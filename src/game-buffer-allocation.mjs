import {reportGameAssertion} from './game-assertion.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p);
//4a32d0. 'allocate' is the established CRT malloc import56e258 service name;
//zero-fill and the allocation assertion are actual game-owned policy here.
export function allocateZeroedGameBuffer(bytes,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-12;bytes>>>=0;
  if(typeof runtime.services?.libraryCall!=='function')throw Error('Game buffer allocation requires CRT malloc/memset services.');
  for(const[register,offset]of[['ESI',-8],['EDI',-12]])if(runtime.entryRegisters?.[register]!==undefined)put(m,s+offset,runtime.entryRegisters[register]);
  put(m,f-4,bytes);put(m,f-8,0x4a32dc);const pointer=runtime.services.libraryCall('allocate',[bytes],runtime)>>>0;
  if(pointer){put(m,f-4,bytes);put(m,f-8,0);put(m,f-12,pointer);put(m,f-16,0x4a3311);runtime.services.libraryCall('memset',[pointer,0,bytes],runtime);}
  else{
    const values=[0x5d399c,26,0x5d3938,bytes>>>10];values.forEach((v,i)=>put(m,f-16+i*4,v));put(m,f-20,0x4a32fa);
    const r={...runtime,scratchBase:f-20,entryRegisters:{...runtime.entryRegisters,ESI:pointer,EDI:bytes>>>10}};
    const retry=runtime.handlers?.allocationFailure4a1fe0?runtime.handlers.allocationFailure4a1fe0(...values,r):reportGameAssertion(values[0],values[1],values[2],[values[3]],r);
    if(retry){const error=Error('Native game allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=0x4a3301;throw error;}
  }
  return pointer;
}
