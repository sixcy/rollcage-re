import {resolveGameAudioPath} from './game-audio-file-paths.mjs';
import {getApplicationDebugger,registerApplicationDebuggerName} from './application-bootstrap.mjs';
import {getAudioDebuggerCategory} from './xaudio-manager-construction.mjs';
import {releaseGameWaveform} from './game-audio-sample-state.mjs';
import {resetGameWaveDecoder,readGameWaveDecoderPcm,getGameWaveOutputSize} from './game-audio-wave-decoder.mjs';
import {setupGameAudioStreamResampling} from './game-audio-resampling-setup.mjs';
import {reserveGameImagePointers} from './game-image-storage.mjs';
import {reportGameAssertion} from './game-assertion.mjs';
import {readGameMp3DecoderPcm} from './game-audio-mp3-decoder.mjs';

const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const entry=r=>{if(!Number.isInteger(r.scratchBase))throw Error('Audio decoder lifecycle requires native entry ESP.');return r.scratchBase;};
const save=(r,frame,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,frame+offset,r.entryRegisters[reg]);};
function call(r,kind,name,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-4*args.length-4;put(m,S,returned);if(typeof r.services?.[kind]!=='function')throw Error(`Audio decoder lifecycle requires ${kind} ${name}.`);return r.services[kind](name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
const os=(r,name,args,top,returned)=>call(r,'platformCall',name,args,top,returned);
const crt=(r,name,args,top,returned)=>call(r,'libraryCall',name,args,top,returned);
const adapted=r=>({...r,handlers:{...r.handlers,allocate:r.handlers?.allocate??((n)=>r.services.libraryCall('operatorNew',[n],r)),free:r.handlers?.free??((p)=>r.services.libraryCall('operatorDelete',[p],r)),registerExit:r.handlers?.registerExit??((p)=>r.services.libraryCall('registerExit',[p],r))}});

//4af2a0 opens a decoder's overlapped input file. The original empty-size
//branch closes the handle without replacing +64; its returned AL alone is0.
//A null path deliberately retains the caller's old local pathname bytes.
export function openGameAudioDecoderFile(decoder,path,runtime){
 const m=runtime.memory,S=entry(runtime),base=(S-4)&~7,frame=base-0x828;
 save(runtime,S,[['EBP',-4]]);put(m,base-4,-1);put(m,base-8,0x56a48e);if(runtime.sehWord!==undefined)put(m,base-12,runtime.sehWord);save(runtime,frame,[['EBX',8],['ESI',4],['EDI',0]]);
 path=ptr(m,S+4);const input=frame+0x18,output=frame+0x418;
 if(path){m.writeUInt16LE(0,input+1022);crt(runtime,'wcsncpy_s',[input,512,path,511],frame,0x4af2ed);}
 //The second argument is unused by4a4460 but remains a real native PUSH.
 const incomingECX=path?0:decoder;put(m,frame-4,incomingECX);put(m,frame-8,output);put(m,frame-12,0x4af302);const resolvedRegisters={};
 resolveGameAudioPath(input,output,{...runtime,scratchBase:frame-12,outputRegisters:resolvedRegisters,entryRegisters:{...runtime.entryRegisters,EBP:S-4,ESI:decoder}});
 const create=ret=>os(runtime,'CreateFileW',[output,0x80000000,1,0,3,0x8000080,0],frame,ret);
 let handle=create(0x4af324);put(m,decoder+0x64,handle);
 while((handle|0)===-1){
  const error=os(runtime,'GetLastError',[],frame,0x4af334);
  if(error!==0x21){
   if(get(m,decoder+0x64)!==-1)break;
   put(m,frame-4,0x4af3c9);getApplicationDebugger(adapted({...runtime,nativeDebuggerFrame:'direct',scratchBase:frame-4,entryRegisters:{...runtime.entryRegisters,ECX:resolvedRegisters.ECX}}));
   let result=ptr(m,0x714b18);
   if(!(result&1)){put(m,frame-4,0x5d3b98);put(m,frame+0x824,0);result=getAudioDebuggerCategory(adapted({...runtime,scratchBase:frame-8}));}
   return result&0xffffff00;
  }
  os(runtime,'Sleep',[100],frame,0x4af345);handle=create(0x4af361);put(m,decoder+0x64,handle);
 }
 if(!os(runtime,'GetFileSizeEx',[ptr(m,decoder+0x64),frame+0x10],frame,0x4af377))m.fill(0,frame+0x10,frame+0x18);
 const low=ptr(m,frame+0x10),high=ptr(m,frame+0x14);put(m,decoder+0x78,low);put(m,decoder+0x70,low);put(m,decoder+0x7c,high);put(m,decoder+0x74,high);
 const size=low|high;if(!size)return os(runtime,'CloseHandle',[ptr(m,decoder+0x64)],frame,0x4af3a5)&0xffffff00;
 return(size&0xffffff00)|1;
}

//4aed20 releases each pointed block and its separately allocated PCM, then
//reloads +a4 before resetting vector.end. Count uses unsigned ceil(bytes/4).
export function resetGameAudioDecoderBlocks(decoder,runtime){
 const m=runtime.memory,S=entry(runtime),base=(S-4)&~7,F=base-40;
 save(runtime,S,[['EBP',-4]]);put(m,base-4,-1);put(m,base-8,0x56a48e);if(runtime.sehWord!==undefined)put(m,base-12,runtime.sehWord);
 save(runtime,F,[['EBX',12],['ESI',4],['EDI',0]]);put(m,F+8,S-4);put(m,F+20,decoder);put(m,F-4,0x4aed4d);
 getApplicationDebugger(adapted({...runtime,nativeDebuggerFrame:'direct',scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,ECX:decoder}}));
 if(!(ptr(m,0x714b18)&1)){
  //4aed56..4aed7c is inline category registration, not a4a91d0 call.
  //Its PUSH name survives the wrapper and is consumed by4a1840.
  put(m,0x714b18,ptr(m,0x714b18)|1);put(m,F-4,0x5d3b98);put(m,F+36,0);put(m,F-8,0x4aed70);
  const context={...runtime,scratchBase:F-8,sehWord:base-12,nativeDebuggerRecords:true,entryRegisters:{...runtime.entryRegisters,EBX:decoder,EBP:S-4,ECX:decoder},handlers:{...runtime.handlers,allocate:runtime.handlers?.allocate??((n,child)=>child.services.libraryCall('operatorNew',[n],child)),free:runtime.handlers?.free??((p,child)=>child.services.libraryCall('operatorDelete',[p],child)),registerExit:runtime.handlers?.registerExit??((p,child)=>child.services.libraryCall('registerExit',[p],child))}};
  const logger=getApplicationDebugger({...context,nativeDebuggerFrame:'wrapper'});put(m,F-8,0x4aed77);
  put(m,0x714b1c,registerApplicationDebuggerName(logger,0x5d3b98,false,{...context,nativeDebuggerFrame:undefined,entryRegisters:{...context.entryRegisters,ECX:logger}}));put(m,F+36,-1);
 }
 let p=ptr(m,ptr(m,decoder+0xa4)),end=ptr(m,ptr(m,decoder+0xa4)+4),count=p>end?0:((end-p+3)>>>2);
 for(let i=0;i<count;i++,p+=4){const block=ptr(m,p);if(block){const pcm=ptr(m,block);if(pcm){crt(runtime,'free',[pcm],F,0x4aedb9);put(m,block,0);}crt(runtime,'operatorDelete',[block],F,0x4aedc9);}}
 const liveDecoder=ptr(m,F+20),vector=ptr(m,liveDecoder+0xa4);put(m,vector+4,ptr(m,vector));
}

//4b3090 frees seven FFT arrays in the original, non-field order. Every pointer
//load occurs after the previous deletion service may have mutated the object.
export function destroyGameAudioSpectrumState(object,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-8;save(runtime,S,[['ESI',-4],['EDI',-8]]);
 for(const[offset,returned]of[[28,0x4b30a4],[36,0x4b30b8],[32,0x4b30cc],[12,0x4b30e0],[24,0x4b30f4],[20,0x4b3108],[16,0x4b311c]]){const p=ptr(m,object+offset);if(p){crt(runtime,'operatorDeleteArray',[p],F,returned);put(m,object+offset,0);}}
}

//40ed50's actual deque teardown, called by the stream-buffer destructor.
//Use its original CRT callsites rather than an opaque container destructor.
function destroyStreamDeque(deque,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-12;save(runtime,S,[['EBX',-4],['ESI',-8],['EDI',-12]]);
 if(get(m,deque+16)){put(m,deque+12,0);put(m,deque+16,0);}
 for(let i=ptr(m,deque+8);i;){const block=ptr(m,ptr(m,deque+4)+--i*4);if(block)crt(runtime,'operatorDelete',[block],F,0x40ed8e);}
 const map=ptr(m,deque+4);if(map)crt(runtime,'operatorDelete',[map],F,0x40ed9f);put(m,deque+4,0);put(m,deque+8,0);
}

//4b3a00 concrete stream-buffer teardown;4b39c0 is its scalar deleting adapter.
export function destroyGameAudioStreamingBuffer(object,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-24;put(m,S-4,-1);put(m,S-8,0x56aaec);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);put(m,S-16,object);save(runtime,S,[['ESI',-20],['EDI',-24]]);put(m,object,0x5d4218);put(m,object+28,0x5d41f8);put(m,F+20,3);
 let p=ptr(m,object+32);if(p){crt(runtime,'free',[p],F,0x4b3a41);put(m,object+32,0);}p=ptr(m,object+0x84);if(p){crt(runtime,'operatorDelete',[p],F,0x4b3a5c);put(m,object+0x84,0);put(m,object+0x88,0);put(m,object+0x8c,0);}
 put(m,F-4,0x4b3a85);destroyStreamDeque(object+0x70,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,ESI:runtime.entryRegisters?.ESI,EDI:object}});
 crt(runtime,'operatorDelete',[ptr(m,object+0x70)],F,0x4b3a8e);put(m,object+0x70,0);os(runtime,'DeleteCriticalSection',[object+0x50],F,0x4b3aa2);put(m,object,0x5d424c);
}
export function releaseGameAudioStreamingBuffer(object,flags,runtime){const m=runtime.memory,S=entry(runtime);save(runtime,S,[['ESI',-4]]);put(m,S-8,0x4b39c8);destroyGameAudioStreamingBuffer(object,{...runtime,scratchBase:S-8,entryRegisters:{...runtime.entryRegisters,ESI:object}});if(m[S+4]&1)crt(runtime,'operatorDelete',[object],S-4,0x4b39d6);return object;}

//4a7bb0 removes the first exact pointer match, destroys it before reloading
//the live cache vector, then memmoves the suffix.4afc80 supplies the manager.
export function removeGameAudioWaveform(manager,waveform,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-8;save(runtime,S,[['ESI',-4],['EDI',-8]]);const vector=ptr(m,manager+0x830),end=ptr(m,vector+4);let p=ptr(m,vector);
 if(p===end)return;waveform=ptr(m,S+4);while(p!==end&&ptr(m,p)!==waveform)p+=4;if(p===end)return;
 const object=ptr(m,p);if(object){const target=ptr(m,ptr(m,object));if(target!==0x4afc00)throw Error(`Unported waveform destructor0x${target.toString(16)}.`);put(m,F-4,1);put(m,F-8,0x4a7be2);releaseGameWaveform(object,1,{...runtime,scratchBase:F-8,entryRegisters:{...runtime.entryRegisters,ESI:p,EDI:manager}});}
 const current=ptr(m,manager+0x830);crt(runtime,'memmove',[p,p+4,(ptr(m,current+4)-p-4)&~3],F,0x4a7bfc);put(m,current+4,get(m,current+4)-4);
}
export function releaseCachedGameAudioWaveform(waveform,runtime){const m=runtime.memory,S=entry(runtime);put(m,S-4,waveform);put(m,S-8,0x4afc8c);removeGameAudioWaveform(ptr(m,0x714b08),waveform,{...runtime,scratchBase:S-8});}

//4ad580/4ad5b0 are the actual sample-owner close-policy accessors reached by
//4b4890. Preserve all high EAX bits of the native AL result.
export function queryGameAudioSampleClosePolicy(object,includePending,runtime){const m=runtime.memory,state=ptr(m,object+0x948);return(state&0xffffff00)|((state===3||state===1||m[entry(runtime)+4]===1&&get(m,object+0x94c)===3)?1:0);}
export function clearGameAudioSamplePendingState(object,{memory:m}){put(m,object+0x94c,0);}

//4b5a90. MP3 codec allocation ownership is separate from vendor decode work.
export function resetGameMp3Decoder(object,runtime){const m=runtime.memory,S=entry(runtime),F=S-4;save(runtime,S,[['ESI',-4]]);put(m,F-4,0x4b5a98);resetGameAudioDecoderBlocks(object,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,ESI:object}});if(m[object+0x68]!==1)return;for(const[offset,ret]of[[0x2520,0x4b5aaf],[0xe0,0x4b5acd]]){const p=ptr(m,object+offset);if(p){crt(runtime,'free',[p],F,ret);put(m,object+offset,0);}}m[object+0x68]=0;}

//4b5280 owns the surrounding Ogg/Vorbis state and releases each vendor
//component at its original library entry. Unavailable codec services fail.
export function resetGameOggDecoder(object,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-4;save(runtime,S,[['ESI',-4]]);put(m,F-4,0x4b5288);resetGameAudioDecoderBlocks(object,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,ESI:object}});if(m[object+0x68]!==1)return;
 const pending=get(m,object+0xb8);m[object+0x68]=0;if(get(m,object+0xb4)<pending){const consumed=get(m,object+0x2c0),next=consumed+pending|0;if(!pending||next<=get(m,object+0x2bc))put(m,object+0x2c0,next);put(m,object+0xb8,0);put(m,object+0xb4,0);}
 save(runtime,F,[['EBX',-4],['EDI',-8]]);const T=F-8,block=object+0xe0;
 for(const[offset,ret]of[[0,0x4b52ed],[16,0x4b52fa],[20,0x4b5307]]){const p=ptr(m,block+offset);if(p)crt(runtime,'free',[p],T,ret);}crt(runtime,'memset',[block,0,0x168],T,0x4b5317);
 for(const[name,p,ret]of[['vorbis_block_clear',object+0x318,0x4b5325],['vorbis_dsp_clear',object+0x2a8,0x4b5330],['vorbis_comment_clear',object+0x298,0x4b533b],['vorbis_info_clear',object+0x278,0x4b5346]]){put(m,T-4,ret);if(typeof runtime.services?.codecCall!=='function')throw Error(`Audio OGG reset requires identified codec service ${name}.`);runtime.services.codecCall(name,[p],{...runtime,scratchBase:T-4});}
 const sync=object+0xc0,p=ptr(m,sync);if(p)crt(runtime,'free',[p],T,0x4b5357);m.fill(0,sync,sync+28);
}

//4b4890 dispatches the concrete reset first, reloads the sample owner around
//each virtual call, clears both64-bit counters, then closes the live handle.
export function closeGameAudioDecoder(object,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-4;save(runtime,S,[['ESI',-4]]);const target=ptr(m,ptr(m,object)+12),reset=target===0x4b4860?resetGameWaveDecoder:target===0x4b5280?resetGameOggDecoder:target===0x4b5a90?resetGameMp3Decoder:null;if(!reset)throw Error(`Unported decoder reset0x${target.toString(16)}.`);put(m,F-4,0x4b4898);reset(object,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,ESI:object}});
 let owner=ptr(m,object+8);if(owner){const query=ptr(m,ptr(m,owner)+0x38);if(query!==0x4ad580)throw Error(`Unported decoder owner close-policy0x${query.toString(16)}.`);put(m,F-4,1);put(m,F-8,0x4b48a8);if((queryGameAudioSampleClosePolicy(owner,1,{...runtime,scratchBase:F-8})&255)===1){owner=ptr(m,object+8);const clear=ptr(m,ptr(m,owner)+0x34);if(clear!==0x4ad5b0)throw Error(`Unported decoder owner pending-state0x${clear.toString(16)}.`);put(m,F-4,0x4b48b4);clearGameAudioSamplePendingState(owner,runtime);}}
 const handle=get(m,object+0x64);for(const offset of[0x78,0x7c,0x70,0x74])put(m,object+offset,0);if(handle!==-1){os(runtime,'CloseHandle',[handle],F,0x4b48df);put(m,object+0x64,-1);}
}

//4ae8e0. It frees the vector's backing allocation and container, but leaves
//pointed blocks to the preceding concrete reset. Nested streaming buffers
//and seven FFT arrays execute their actual destructors.
export function destroyGameAudioStream(object,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-28;put(m,S-4,-1);put(m,S-8,0x56a7b4);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);save(runtime,S,[['ESI',-24],['EDI',-28]]);put(m,F+12,object);put(m,object,0x5d4054);put(m,F+24,1);put(m,F-4,0x4ae913);
 getApplicationDebugger(adapted({...runtime,scratchBase:F-4,nativeDebuggerFrame:'wrapper',entryRegisters:{...runtime.entryRegisters,ECX:object}}));
 if(!(ptr(m,0x714b18)&1)){put(m,F-4,0x5d3b98);m[F+24]=2;getAudioDebuggerCategory(adapted({...runtime,scratchBase:F-8}));m[F+24]=1;}
 for(const[offset,ret]of[[0x98,0x4ae957],[0x18,0x4ae96e]]){const p=ptr(m,object+offset);if(p){crt(runtime,'free',[p],F,ret);put(m,object+offset,0);}}
 const stream=ptr(m,object+12);if(stream){const target=ptr(m,ptr(m,stream));if(target!==0x4b39c0)throw Error(`Unported decoder stream destructor0x${target.toString(16)}.`);put(m,F-4,1);put(m,F-8,0x4ae985);releaseGameAudioStreamingBuffer(stream,1,{...runtime,scratchBase:F-8,sehWord:S-12,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:ptr(m,0x56e23c)}});put(m,object+12,0);}
 const vector=ptr(m,object+0xa4);if(vector){const p=ptr(m,vector);if(p){crt(runtime,'operatorDelete',[p],F,0x4ae9a3);for(const o of[0,4,8])put(m,vector+o,0);}crt(runtime,'operatorDelete',[vector],F,0x4ae9c1);put(m,object+0xa4,0);}
 os(runtime,'DeleteCriticalSection',[object+0x44],F,0x4ae9d8);put(m,F-4,0x4ae9e0);destroyGameAudioSpectrumState(object+0x1c,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:vector}});
}

//4b4060/4b4f80/4b59a0 original concrete scalar deleting adapters.
export function releaseGameAudioDecoder(object,flags,runtime){
 const m=runtime.memory,S=entry(runtime),F=S-20,vtable=ptr(m,object);if(![0x5d4280,0x5d42a8,0x5d42d0].includes(vtable))throw Error(`Unported decoder destructor vtable0x${vtable.toString(16)}.`);
 const address=vtable===0x5d4280?0x4b4060:vtable===0x5d42a8?0x4b4f80:0x4b59a0;put(m,S-4,-1);put(m,S-8,0x56ab08);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);put(m,S-16,object);save(runtime,S,[['ESI',-20]]);put(m,F+16,0);put(m,F-4,address+0x30);
 const context={...runtime,sehWord:S-12,entryRegisters:{...runtime.entryRegisters,ESI:object}};closeGameAudioDecoder(object,{...context,scratchBase:F-4});put(m,F+16,-1);put(m,F-4,address+0x3f);destroyGameAudioStream(object,{...context,scratchBase:F-4});if(m[S+4]&1)crt(runtime,'operatorDelete',[object],F,address+0x4d);return object;
}

//4aea00. Complete original block owner/append policy; known WAV decoding and
//stream setup execute actual game children. Unported codec read targets stay
//explicit reached contracts rather than a synthetic empty PCM producer.
export function populateGameAudioStream(decoder,runtime){
 const m=runtime.memory,S=entry(runtime),base=(S-4)&~7,F=base-48;save(runtime,S,[['EBP',-4]]);put(m,base-4,-1);put(m,base-8,0x56a7da);if(runtime.sehWord!==undefined)put(m,base-12,runtime.sehWord);save(runtime,F,[['EBX',12],['ESI',4],['EDI',0]]);put(m,F+8,S-4);put(m,F+24,decoder);put(m,F-4,0x4aea2d);
 getApplicationDebugger(adapted({...runtime,nativeDebuggerFrame:'direct',scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,ECX:decoder}}));
 if(!(ptr(m,0x714b18)&1)){put(m,F-4,0x5d3b98);put(m,F+44,0);getAudioDebuggerCategory(adapted({...runtime,scratchBase:F-8}));put(m,F+44,-1);}
 if(m[decoder+0x92]!==0){put(m,F-4,0x4aed03);setupGameAudioStreamResampling(decoder,{...runtime,scratchBase:F-4,sehWord:base-12,entryRegisters:{...runtime.entryRegisters,EBP:S-4,ESI:decoder}});return 1;}
 let p=ptr(m,ptr(m,decoder+0xa4)),end=ptr(m,ptr(m,decoder+0xa4)+4),count=p>end?0:((end-p+3)>>>2),di=runtime.entryRegisters?.EDI;
 for(let i=0;i<count;i++,p+=4){const block=ptr(m,p);di=block;if(block){const pcm=ptr(m,block);if(pcm){crt(runtime,'free',[pcm],F,0x4aeaa6);put(m,block,0);}crt(runtime,'operatorDelete',[block],F,0x4aeab6);}}
 decoder=ptr(m,F+24);let vector=ptr(m,decoder+0xa4);put(m,vector+4,ptr(m,vector));let target=ptr(m,ptr(m,decoder)+32);put(m,F-4,0x4aead8);
 let chunk;if(target===0x4b4a30)chunk=getGameWaveOutputSize(decoder,runtime);else if(target===0x402940)chunk=0;else if(runtime.handlers?.decoderOutputSize)chunk=runtime.handlers.decoderOutputSize(decoder,{...runtime,scratchBase:F-4});else throw Error(`Unported decoder output-size0x${target.toString(16)}.`);chunk|=0;put(m,F+24,chunk);
 const alignment=((m.readUInt16LE(decoder+0x8e)>>>3)*m.readInt16LE(decoder+0x82))&65535;m.writeUInt16LE(alignment,decoder+0x8c);put(m,decoder+0x88,Math.imul(alignment,get(m,decoder+0x84)));let format=decoder+0x80;if(m[decoder+0x92]===1&&ptr(m,decoder+12)){const stream=ptr(m,decoder+12),callee=ptr(m,ptr(m,stream)+16);if(callee!==0x4b3ed0)throw Error(`Unported stream format0x${callee.toString(16)}.`);put(m,F-4,0x4aeb1d);format=stream+8;}
 if(!chunk){const blockAlign=m.readUInt16LE(format+12);if(!blockAlign)throw RangeError('Native audio block alignment divide by zero.');chunk=Math.imul(Math.trunc(0x100000/blockAlign),blockAlign);put(m,F+24,chunk);}
 while(!m[decoder+0x69]){
  const block=crt(runtime,'operatorNew',[12],F,0x4aeb58)>>>0;put(m,F+28,block);put(m,F+44,1);
  if(block){put(m,block+4,chunk);put(m,block+8,0);const pcm=crt(runtime,'allocate',[chunk],F,0x4aeb7e)>>>0;di=pcm;if(!pcm){const args=[0x5d399c,26,0x5d3938,chunk>>>10];for(let i=0;i<4;i++)put(m,F-16+i*4,args[i]);put(m,F-20,0x4aeb9e);if(reportGameAssertion(args[0],args[1],args[2],[args[3]],{...runtime,scratchBase:F-20,sehWord:base-12,entryRegisters:{...runtime.entryRegisters,EBX:chunk,EBP:decoder,ESI:block,EDI:pcm,ECX:chunk>>>10}})){const error=Error('Native audio block allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=0x4aeba5;throw error;}}put(m,block,pcm);}
  put(m,F+44,-1);put(m,F-4,ptr(m,block+4));target=ptr(m,ptr(m,decoder)+24);put(m,F-8,ptr(m,block));put(m,F+20,block);put(m,F-12,0x4aebc5);const context={...runtime,scratchBase:F-12,sehWord:base-12,entryRegisters:{...runtime.entryRegisters,EBX:chunk,EBP:decoder,ESI:block,EDI:di}};
  let read;if(target===0x4b4a00)read=readGameWaveDecoderPcm(decoder,ptr(m,block),ptr(m,block+4),context);else if(target===0x4b5ae0)read=readGameMp3DecoderPcm(decoder,ptr(m,block),ptr(m,block+4),context);else if(runtime.handlers?.readDecoderPcm)read=runtime.handlers.readDecoderPcm(decoder,ptr(m,block),ptr(m,block+4),context);else throw Error(`Unported decoder PCM read0x${target.toString(16)}.`);put(m,block+8,read);
  if((read|0)>0){
   vector=ptr(m,decoder+0xa4);const begin=ptr(m,vector),end=ptr(m,vector+4),relative=F+20<end&&begin<=F+20,relativeIndex=(F+20-begin)>>2;
   if(end===ptr(m,vector+8)){
    const size=(end-begin)>>2,capacity=(get(m,vector+8)-begin)>>2;if((0x3fffffff-size>>>0)<1){crt(runtime,'_Xlength_error',[0x570294],F,0x4aecfc);throw Error('Native audio block vector length error returned.');}put(m,F+28,size+1);const half=capacity>>>1,grown=(0x3fffffff-half>>>0)<(capacity>>>0)?0:capacity+half,newCapacity=Math.max(grown>>>0,(size+1)>>>0);put(m,F-4,newCapacity);put(m,F-8,relative?0x4aec46:0x4aecb3);
    reserveGameImagePointers(vector,newCapacity,{...runtime,scratchBase:F-8,nativePointerVector:true,entryRegisters:{...runtime.entryRegisters,EBX:begin,EBP:decoder,ESI:relative?relativeIndex:block,EDI:vector}});
   }
   const destination=ptr(m,vector+4);if(destination)put(m,destination,relative?ptr(m,ptr(m,vector)+relativeIndex*4):block);put(m,vector+4,get(m,vector+4)+4);
  }else{const pcm=ptr(m,block);if(pcm){crt(runtime,'free',[pcm],F,0x4aeccf);put(m,block,0);}crt(runtime,'operatorDelete',[block],F,0x4aecdf);}
  if(!m[decoder+0x69])chunk=get(m,F+24);
 }
 return 1;
}
