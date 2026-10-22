const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
function save(r,S,n){if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S-4,r.entryRegisters[n]);}
function crt(r,name,args,top,ret){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const entry=top-args.length*4-4;put(m,entry,ret);return r.services.libraryCall(name,args.map((_,i)=>ptr(m,entry+4+i*4)),{...r,scratchBase:entry});}
//4ab790: the queued-source capturedpointer copy; twelve-byte storage has
//only vtable/capture written. The third DWORD deliberately remains stale.
export function copyQueuedAudioCallback(input,output,runtime){const{memory:m,scratchBase:S}=runtime;put(m,S+4,output);save(runtime,S,'ESI');if(!output){output=crt(runtime,'operatorNew',[12],S-4,0x4ab7a3)>>>0;if(!output){crt(runtime,'_Xbad_alloc',[],S-4,0x4ab7b0);throw Error('Nonreturning queued callback bad_alloc returned');}}put(m,output,0x5d3d1c);put(m,output+4,get(m,input+4));return output;}
//40ee80: exact SoundSource& function-base destruction specialization.
export function releaseQueuedAudioCallbackBase(input,flags,runtime){const{memory:m,scratchBase:S}=runtime;put(m,S+4,flags);const destroy=!!(m[S+4]&1);save(runtime,S,'ESI');put(m,input,0x5d02b4);if(destroy)crt(runtime,'operatorDelete',[input],S-4,0x40ee97);return input;}
//40f2a0 dispatches through this typedbase target before optionalouterdelete.
export function destroyQueuedAudioCallback(input,deallocate,runtime){const{memory:m,scratchBase:S}=runtime;put(m,S+4,deallocate);save(runtime,S,'ESI');const target=ptr(m,ptr(m,input)+0x14);if(target!==0x40ee80)throw Error('Unknown queued audio callbackbase0x'+target.toString(16));put(m,S-8,0);put(m,S-12,0x40f2aa);releaseQueuedAudioCallbackBase(input,0,{...runtime,scratchBase:S-12,entryRegisters:{...runtime.entryRegisters,ESI:input}});if(m[S+4])crt(runtime,'operatorDelete',[input],S-4,0x40f2b8);}
//Actual adapters for the producer's two reached std::function operations.
export function queuedAudioStdFunctionCall(input,offset,args,runtime){const{memory:m}=runtime,target=ptr(m,ptr(m,input)+offset);if(offset===0&&target===0x4ab790)return copyQueuedAudioCallback(input,args[0],runtime);if(offset===0x10&&target===0x40f2a0)return destroyQueuedAudioCallback(input,args[0],runtime);throw Error('Unported queued-audio callbackoperation0x'+target.toString(16));}
