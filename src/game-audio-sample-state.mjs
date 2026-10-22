import {initializeGameAudioDescriptor} from './game-audio-descriptors.mjs';
import {queuedAudioStdFunctionCall} from './queued-audio-callback.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const entry=r=>{if(!Number.isInteger(r.scratchBase))throw Error('Audio sample state requires native entry ESP.');return r.scratchBase;};
const save=(r,pairs)=>{for(const[reg,offset]of pairs)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,r.scratchBase+offset,r.entryRegisters[reg]);};
const forward=(m,out,input,bytes)=>{for(let i=0;i<bytes;i+=4)put(m,out+i,get(m,input+i));};
function library(r,name,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-args.length*4-4;put(m,S,returned);if(typeof r.services?.libraryCall!=='function')throw Error(`Audio sample state requires CRT ${name}.`);return r.services.libraryCall(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function functor(r,object,method,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-args.length*4-4;put(m,S,returned);const words=args.map((_,i)=>ptr(m,S+4+i*4)),context={...r,scratchBase:S};if(ptr(m,object)===0x5d3d1c)return queuedAudioStdFunctionCall(object,method,words,context);if(typeof r.services?.stdFunctionCall!=='function')throw Error('Audio sample state requires the original C++ std::function interface.');return r.services.stdFunctionCall(object,method,words,context);}

//4ad190 copies494h bytes in original forward DWORD order. Aliases can
//change source words before the final individually loaded thirteen fields.
export function copyAudioSampleState(output,input,runtime){const m=runtime.memory;entry(runtime);save(runtime,[['EBX',-4],['ESI',-8],['EDI',-12]]);forward(m,output,input,0x460);for(let offset=0x460;offset<=0x490;offset+=4)put(m,output+offset,get(m,input+offset));return output;}
//4ad320, actual base-source vtable+28h.
export function setGameAudioSampleFlags(object,flags,runtime){const m=runtime.memory;entry(runtime);put(m,object+0x458,flags);put(m,object+0x954,m[object+0x45e]?flags:11);}

//4acf70. Two complete descriptor/pose records, the by-value std::function,
//state copy and single-precision distance coefficients belong to game code.
export function constructBaseAudioSample(object,descriptor,runtime){
  const m=runtime.memory,S=entry(runtime),frame=S-32,bp=object+0x498;put(m,S-4,-1);put(m,S-8,0x56a6a6);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);save(runtime,[['EBX',-24],['EBP',-28],['ESI',-32]]);put(m,frame+12,object);put(m,frame+28,0);put(m,object,0x5d3e14);
  put(m,frame-4,0x4acfa7);initializeGameAudioDescriptor(object+4,{...runtime,scratchBase:frame-4});
  for(const[offset,returned]of[[0x464,0x4acfb2],[0x474,0x4acfbd],[0x484,0x4acfc8]]){put(m,frame-4,returned);for(let i=0;i<16;i+=4)put(m,object+offset+i,i===4&&offset===0x484?0x3f800000:0);}put(m,object+0x494,0x3f800000);
  put(m,frame-4,0x4acfdf);initializeGameAudioDescriptor(bp,{...runtime,scratchBase:frame-4});
  for(const[offset,returned]of[[0x460,0x4acfea],[0x470,0x4acff5],[0x480,0x4ad000]]){put(m,frame-4,returned);for(let i=0;i<16;i+=4)put(m,bp+offset+i,i===4&&offset===0x480?0x3f800000:0);}put(m,bp+0x490,0x3f800000);
  const callback=ptr(m,S+24),copy=object+0x930;put(m,frame+16,copy);put(m,copy+16,0);m[frame+28]=2;if(callback)put(m,copy+16,functor({...runtime,entryRegisters:{...runtime.entryRegisters,EBX:object,EBP:bp,ESI:copy}},callback,0,[callback===S+8?copy:0],frame,0x4ad03e));else put(m,copy+16,callback);
  save({...runtime,scratchBase:frame},[['EDI',-4]]);const work=frame-4;descriptor=ptr(m,S+4)||descriptor;m[work+32]=3;
  for(const[offset,value]of[[0x948,0],[0x94c,4],[0x954,0],[0x958,0],[0x95c,0],[0x960,0],[0x964,0],[0x968,0],[0x96c,0],[0x970,0]])put(m,object+offset,value);m[object+0x950]=0;m[object+0x974]=0;forward(m,bp,descriptor,0x460);
  put(m,work-4,bp);put(m,work-8,0x4ad0cf);copyAudioSampleState(object+4,bp,{...runtime,scratchBase:work-8,entryRegisters:{EBX:object,EBP:bp,ESI:descriptor+0x460,EDI:bp+0x460}});
  const maximum=m.readFloatLE(object+0x448),difference=Math.fround(maximum-m.readFloatLE(object+0x444));m.writeFloatLE(Math.fround(maximum*maximum),object+0x95c);m.writeFloatLE(Math.fround(m.readFloatLE(0x5dc774)/difference),object+0x960);
  put(m,work-4,ptr(m,object+0x458));put(m,work-8,0x4ad10f);setGameAudioSampleFlags(object,ptr(m,work-4),{...runtime,scratchBase:work-8});put(m,work+32,-1);
  const original=ptr(m,S+24);if(original)functor({...runtime,entryRegisters:{...runtime.entryRegisters,EBX:object,EBP:bp,ESI:descriptor+0x460}},original,16,[original===S+8?0:1],frame,0x4ad132);return object;
}

//4ad7e0. The temporary by-value std::function is constructed at frame-18h
//and actually consumed by4acf70; the incoming one is destroyed afterwards.
export function constructXAudioSample(object,descriptor,runtime){
  const m=runtime.memory,S=entry(runtime),frame=S-24;put(m,S-4,-1);put(m,S-8,0x56a700);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);put(m,S-16,object);save(runtime,[['ESI',-20],['EDI',-24]]);
  const temporary=frame-24;put(m,temporary+44,0);put(m,temporary+32,temporary);put(m,temporary+16,0);m[temporary+44]=1;const callback=ptr(m,S+24);if(callback)put(m,temporary+16,functor({...runtime,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:temporary}},callback,0,[callback===S+8?temporary:0],temporary,0x4ad837));else put(m,temporary+16,callback);
  descriptor=ptr(m,S+4)||descriptor;put(m,temporary-4,descriptor);m[temporary+44]=0;put(m,temporary-8,0x4ad84a);constructBaseAudioSample(object,descriptor,{...runtime,scratchBase:temporary-8,sehWord:S-12,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:temporary}});
  for(const[offset,value]of[[0,0x5d3f60],[0x978,0x5d3f40],[0x97c,0],[0x980,0],[0x984,0x3f800000],[0x988,0],[0x9a0,0],[0x9a4,0]])put(m,object+offset,value);put(m,frame+20,-1);m.writeUInt16LE(0,object+0x99c);m.fill(0,object+0x98c,object+0x99c);const original=ptr(m,S+24);if(original)functor({...runtime,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:temporary}},original,16,[original===S+8?0:1],frame,0x4ad8cc);return object;
}

//4afb90 actual XAWaveform, including the partly initialized pathname record.
export function constructGameWaveform(object,runtime){const m=runtime.memory,S=entry(runtime),frame=S-4;save(runtime,[['ESI',-4]]);put(m,object,0x5d4088);put(m,object+4,1);m.writeUInt16LE(0,object+0x418);library(runtime,'wcsncpy_s',[object+0x1a,512,0x56feb0,511],frame,0x4afbc2);m.fill(0,object+8,object+24);m.writeUInt16LE(0,object+24);put(m,object,0x5d407c);m.fill(0,object+0x41c,object+0x440);return object;}

//4afc00. Complete concrete waveform release; PCM malloc ownership is distinct
//from the operator-new waveform record, and the final vtable is the base one.
export function releaseGameWaveform(object,flags,runtime){const m=runtime.memory,S=entry(runtime),frame=S-20;put(m,S-4,-1);put(m,S-8,0x56a858);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);put(m,S-16,object);save(runtime,[['ESI',-20]]);put(m,object,0x5d407c);put(m,frame+16,0);const pcm=ptr(m,object+0x424);if(pcm){library(runtime,'free',[pcm],frame,0x4afc3c);put(m,object+0x424,0);}put(m,object,0x5d4088);if(flags&1)library(runtime,'operatorDelete',[object],frame,0x4afc5d);return object;}
export {functor as invokeGameAudioSampleFunctor};
