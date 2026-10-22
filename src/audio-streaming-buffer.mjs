import{appendGameImagePointer}from'./game-image-storage.mjs';
import{appendRendererFreeIndex}from'./renderer-resource-pools.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),u64=n=>BigInt.asUintN(64,n),lo=n=>Number(u64(n)&0xffffffffn),hi=n=>Number(u64(n)>>32n);
function save(r,S,rows){for(const[n,o]of rows)if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S+o,r.entryRegisters[n]);}
function call(r,kind,name,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-(args.length-i)*4,args[i]);const S=top-args.length*4-4;put(m,S,returned);return r.services[kind](name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function com(owner,slot,args,top,returned,r){return call({...r,services:{...r.services,com:(_,a,c)=>r.services.xAudio2Call(owner,slot,a,c)}},'com',slot,args,top,returned);}
function getter(object,slot,top,returned,r){const m=r.memory,target=ptr(m,ptr(m,object)+slot);put(m,top-4,returned);if(target===0x4b3ed0)return object+8;if(target===0x4b3ee0)return ptr(m,object+4);if(target===0x4b3ac0)return canAcquireAudioStreamingBlock(object,r);throw Error('Unported streaming getter0x'+target.toString(16));}
export function getAudioStreamingFormatAddress(object){return object+8;}
export function getAudioStreamingOwner(object,{memory:m}){return ptr(m,object+4);}
//4b3ac0, only AL is consumed by original callers.
export function canAcquireAudioStreamingBlock(object,{memory:m}){return m[object+0x24]===0?Number(ptr(m,object+0x80)!==0):0;}
//4b3ae0: pop free deque, retain in active vector, publish both output pointers.
export function acquireAudioStreamingBlock(object,output,sizeOutput,runtime){const{memory:m,scratchBase:S}=runtime;save(runtime,S,[['ESI',-16]]);let F=S-16;if(!getter(object,4,F,0x4b3aed,runtime))return 0;
 save(runtime,S,[['EBX',-20],['EBP',-24],['EDI',-28]]);F=S-28;const lock=object+0x50;
 call(runtime,'platformCall','EnterCriticalSection',[lock],F,0x4b3b02);const thread=call(runtime,'platformCall','GetCurrentThreadId',[],F,0x4b3b08);put(m,lock+24,get(m,lock+24)+1);put(m,lock+28,thread);
 put(m,F-4,F+16);put(m,F-8,0x4b3b1b);const deque=object+0x70,index=ptr(m,deque+12),sentinel=ptr(m,deque);put(m,F+20,0);put(m,F+16,sentinel);put(m,F+24,index);
 const owner=sentinel?ptr(m,sentinel):0,map=ptr(m,owner+4),slot=(index>>>2)&(ptr(m,owner+8)-1),block=ptr(m,ptr(m,map+slot*4)+(index&3)*4);put(m,object+0x28,block);
 const count=get(m,object+0x80)-1|0;put(m,object+0x80,count);put(m,object+0x7c,count?get(m,object+0x7c)+1:0);
 put(m,F-4,object+0x28);put(m,F-8,0x4b3b64);appendGameImagePointer(object+0x84,object+0x28,{...runtime,scratchBase:F-8,nativePointerVector:true,entryRegisters:{...runtime.entryRegisters,ESI:object,EBP:object+0x28,EDI:lock}});
 const depth=get(m,lock+24)-1|0;put(m,lock+24,depth);if(!depth)put(m,lock+28,0);call(runtime,'platformCall','LeaveCriticalSection',[lock],F,0x4b3b77);
 put(m,ptr(m,S+8),ptr(m,object+0x34));put(m,ptr(m,S+4),ptr(m,object+0x28));m[object+0x24]=1;return 1;
}
//4b3ca0: remove every matching active pointer and return it to the free deque.
export function recycleAudioStreamingBlock(object,block,runtime){const{memory:m,scratchBase:S}=runtime,F=S-20;put(m,S-4,runtime.entryRegisters?.ECX??object);save(runtime,S,[['EBX',-8],['EBP',-12],['ESI',-16],['EDI',-20]]);put(m,F+16,object);const lock=object+0x50;
 call(runtime,'platformCall','EnterCriticalSection',[lock],F,0x4b3cb5);const thread=call(runtime,'platformCall','GetCurrentThreadId',[],F,0x4b3cbb);put(m,lock+24,get(m,lock+24)+1);put(m,lock+28,thread);
 const end=ptr(m,object+0x88);let out=ptr(m,object+0x84),nativeEbx=lock,nativeEdi=runtime.entryRegisters?.EDI;
 if(out!==end){nativeEbx=ptr(m,S+4);while(out!==end&&ptr(m,out)!==nativeEbx)out+=4;if(out!==end){let input=out+4;const count=input>end?0:((end-input+3)>>>0)>>>2;nativeEdi=0;for(let i=0;i<count;i++,input+=4){nativeEdi=ptr(m,input);if(nativeEdi!==nativeEbx){put(m,out,nativeEdi);out+=4;}}}}
 if(out===ptr(m,object+0x84)&&end===ptr(m,object+0x88))put(m,object+0x88,ptr(m,object+0x84));
 else if(out!==end){nativeEdi=((get(m,object+0x88)-end)>>2)*4;call(runtime,'libraryCall','memmove',[out,end,nativeEdi>>>0],F,0x4b3d50);put(m,object+0x88,nativeEdi+out);}
 put(m,F-4,S+4);put(m,F-8,0x4b3d69);appendRendererFreeIndex(object+0x70,ptr(m,S+4),{...runtime,nativeDequeEntryEsp:F-8,valueAddress:S+4,entryRegisters:{...runtime.entryRegisters,EBX:nativeEbx,EBP:object,ESI:out,EDI:nativeEdi}});
 const depth=get(m,object+0x68)-1|0;put(m,object+0x68,depth);if(!depth)put(m,lock+28,0);put(m,S+4,lock);return runtime.services.platformCall('LeaveCriticalSection',[lock],{...runtime,scratchBase:S});
}
//4b3bb0: submit a real buffer, or recycle an empty read.
export function submitAudioStreamingBlock(object,bytes,runtime){const{memory:m,scratchBase:S}=runtime,F=S-40;save(runtime,S,[['EDI',-40]]);if(m[object+0x24]!==1)return 0;bytes=ptr(m,S+4);
 if(bytes){const old=ptr(m,object+0x48);put(m,object+0x48,old+bytes);const block=ptr(m,object+0x28);put(m,object+0x4c,ptr(m,object+0x4c)+Number(old+bytes>0xffffffff));save(runtime,S,[['ESI',-44]]);const owner=ptr(m,object+4),buffer=F+4;m.fill(0,buffer,buffer+36);put(m,buffer+8,block);put(m,buffer+4,bytes);put(m,buffer+32,block);const voice=ptr(m,owner+0x97c);com(voice,0x54,[voice,buffer,0],F-4,0x4b3c0c,runtime);m[owner+0x99c]=0;
 }else{put(m,F-4,ptr(m,object+0x28));put(m,F-8,0x4b3c32);recycleAudioStreamingBlock(object,ptr(m,F-4),{...runtime,scratchBase:F-8,entryRegisters:{...runtime.entryRegisters,EDI:object,ECX:object}});}
 put(m,object+0x28,0);m[object+0x24]=0;return 1;
}
//4b3c50: actual voice SamplesPlayed versus submitted byte-count/alignment.
export function isAudioStreamingBufferDrained(object,runtime){const{memory:m,scratchBase:S}=runtime,F=S-20;save(runtime,S,[['ESI',-20]]);const owner=getter(object,0x18,F,0x4b3c5b,runtime),voice=ptr(m,owner+0x97c);com(voice,0x64,[voice,F+4],F,0x4b3c6c,runtime);const format=getter(object,0x10,F,0x4b3c73,runtime),alignment=m.readUInt16LE(format+12);if(!alignment)throw RangeError('Native streaming drain divides by zero.');put(m,F-4,0);put(m,F-8,alignment);put(m,F-12,ptr(m,object+0x4c));put(m,F-16,ptr(m,object+0x48));put(m,F-20,0x4b3c85);const frames=m.readBigUInt64LE(object+0x48)/BigInt(alignment);return Number(m.readBigUInt64LE(F+12)>=frames);}
//4b3dd0: active block count times truncated per-block nanoseconds.
export function getAudioStreamingDuration(object,output,runtime){const{memory:m,scratchBase:S}=runtime,F=((S-4)&~7)-16;save(runtime,S,[['EBP',-4]]);save(runtime,F,[['ESI',4],['EDI',0]]);const bytes=ptr(m,object+0x34),count=(get(m,object+0x88)-get(m,object+0x84))>>2;m.writeDoubleLE(bytes,F+8);const format=getter(object,0x10,F,0x4b3e0c,runtime),rate=ptr(m,format+8),value=m.readDoubleLE(F+8)/rate*m.readDoubleLE(0x5dc9d8);put(m,F-4,0x4b3e3a);if(!Number.isFinite(value)||Math.abs(value)>=2**63)throw RangeError('Audio duration compiler conversion outside proven finite int64 domain.');const duration=BigInt(Math.trunc(value)),right=BigInt(count);put(m,F-4,hi(right));put(m,F-8,lo(right));put(m,F-12,hi(duration));put(m,F-16,lo(duration));put(m,F-20,0x4b3e4a);if(hi(duration)||hi(right))put(m,F-24,runtime.entryRegisters?.EBX??0);const result=u64(duration*right);output=ptr(m,S+4);put(m,output,lo(result));put(m,output+4,hi(result));return output;}
