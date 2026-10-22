import {getApplicationDebugger} from './application-bootstrap.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
function os(r,name,args,top,ret){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const S=top-args.length*4-4;put(m,S,ret);return r.services.platformCall(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function debuggerAt(r,S,ret,registers){put(r.memory,S,ret);return getApplicationDebugger({...r,scratchBase:S,nativeDebuggerFrame:'wrapper',entryRegisters:{...r.entryRegisters,...registers},handlers:{...r.handlers,allocate:r.handlers?.allocate??(n=>r.services.libraryCall('operatorNew',[n],r)),free:r.handlers?.free??(p=>r.services.libraryCall('operatorDelete',[p],r)),registerExit:r.handlers?.registerExit??(p=>r.services.libraryCall('registerExit',[p],r))}});}

//4a42c0 preserves the previous pending operation on ERROR_IO_INCOMPLETE.
export function queueGameAudioFileWrite(record,input,count,runtime){const m=runtime.memory,S=runtime.scratchBase,F=S-8;save(runtime,S,[['ESI',-4],['EDI',-8]]);count=ptr(m,S+8);if(!count)return true;let ecx=ptr(m,record+8)?record+12:record;
 if(ptr(m,record+8)&&ptr(m,record+12)!==ptr(m,record+8)){ecx=record+12;if(!os(runtime,'GetOverlappedResult',[ptr(m,record),record+16,record+12,0],F,0x4a42ee)&&os(runtime,'GetLastError',[],F,0x4a42f8)===0x3e4)return false;}
 put(m,record+8,count);put(m,record+12,0);put(m,record+32,0);put(m,record+16,0);put(m,record+20,0);
 if(!os(runtime,'WriteFile',[ptr(m,record),ptr(m,S+4),count,0,record+16],F,0x4a4330)&&os(runtime,'GetLastError',[],F,0x4a433a)!==0x3e5){put(m,record+8,0);debuggerAt(runtime,F-4,0x4a434d,{ESI:record,EDI:count,ECX:ecx});return false;}return true;
}
//4a4360 writes output0 before looking at the live request (alias-visible).
export function completeGameAudioFileWrite(record,wait,output,runtime){const m=runtime.memory,S=runtime.scratchBase,F=S-12;save(runtime,S,[['EBX',-4],['ESI',-8],['EDI',-12]]);output=ptr(m,S+8);put(m,output,0);
 if(ptr(m,record+8)&&ptr(m,record+12)!==ptr(m,record+8)){
  if(!os(runtime,'GetOverlappedResult',[ptr(m,record),record+16,record+12,m[S+4]],F,0x4a4393)&&os(runtime,'GetLastError',[],F,0x4a439d)===0x3e4)return false;
  const done=ptr(m,record+12);if(ptr(m,record+8)===done){const old=ptr(m,record+24),next=old+done;put(m,record+24,next);put(m,record+28,get(m,record+28)+(next>0xffffffff?1:0));}
 }put(m,output,ptr(m,record+12));return true;
}
//4a4230 chooses synchronous or overlapped write from the live record byte.
export function writeGameAudioFile(record,input,count,runtime){const m=runtime.memory,S=runtime.scratchBase;put(m,S-4,record);save(runtime,S,[['ESI',-8]]);const F=S-8;
 if(m[record+4]){save(runtime,F,[['EDI',-4]]);const T=F-4,requested=ptr(m,S+8);put(m,T-4,requested);put(m,T-8,ptr(m,S+4));put(m,T-12,0x4a4249);const context={...runtime,entryRegisters:{...runtime.entryRegisters,ESI:record,EDI:requested}};if(!queueGameAudioFileWrite(record,ptr(m,S+4),requested,{...context,scratchBase:T-12}))return false;put(m,T-4,S+8);put(m,T-8,1);put(m,T-12,0x4a425b);completeGameAudioFileWrite(record,1,S+8,{...context,scratchBase:T-12});return ptr(m,S+8)===requested;}
 const handle=ptr(m,record),requested=ptr(m,S+8);put(m,F+4,0);if(requested&&!os(runtime,'WriteFile',[handle,ptr(m,S+4),requested,F+4,0],F,0x4a4294)){debuggerAt(runtime,F-4,0x4a429d,{ESI:requested,ECX:handle});return false;}return ptr(m,F+4)===requested;
}
