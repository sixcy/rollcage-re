import {convertGameMp3Pcm} from './game-audio-compressed-pcm.mjs';
import {populateGameAudioStream} from './game-audio-decoder-lifecycle.mjs';
import {setupGameAudioStreamResampling} from './game-audio-resampling-setup.mjs';
import {getGameAudioLoopFlag} from './game-audio-wave-decoder.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
function call(r,kind,name,args,top,ret){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const S=top-args.length*4-4;put(m,S,ret);if(typeof r.services?.[kind]!=='function')throw Error(`MP3 game adapter requires ${kind} ${name}.`);return r.services[kind](name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
const os=(r,n,a,t,ret)=>call(r,'platformCall',n,a,t,ret),crt=(r,n,a,t,ret)=>call(r,'libraryCall',n,a,t,ret);
function codec(r,name,args,F,ret){put(r.memory,F-4,ret);if(typeof r.services?.codecCall!=='function')throw Error(`MP3 game adapter requires identified libmad ${name}.`);return r.services.codecCall(name,args,{...r,scratchBase:F-4});}
function debuggerAt(r,S,ret,registers){put(r.memory,S,ret);return getApplicationDebugger({...r,scratchBase:S,nativeDebuggerFrame:'wrapper',entryRegisters:{...r.entryRegisters,...registers},handlers:{...r.handlers,allocate:r.handlers?.allocate??(n=>r.services.libraryCall('operatorNew',[n],r)),free:r.handlers?.free??(p=>r.services.libraryCall('operatorDelete',[p],r)),registerExit:r.handlers?.registerExit??(p=>r.services.libraryCall('registerExit',[p],r))}});}

//4a3cc0 is a raw HANDLE/signed64-bit absolute seek. The decompiler's apparent
//extra argument is a stack-layout artifact; instructions pass the two words.
export function seekGameAudioCodecFile(handle,low,high,runtime){const m=runtime.memory,S=runtime.scratchBase,F=S-12;const accepted=os(runtime,'SetFilePointerEx',[handle,ptr(m,S+4),ptr(m,S+8),F,0],F,0x4a3cd8);return accepted?{eax:ptr(m,F),edx:ptr(m,F+4)}:{eax:ptr(m,S+4),edx:ptr(m,S+8)};}

//4b5a10. Vendor init owns libmad structs; the game owns flags, timer words,
//PCM cursor and subsequent actual4aea00 population policy.
export function initializeGameMp3Decoder(decoder,runtime){
 const m=runtime.memory,S=runtime.scratchBase,F=S-8;save(runtime,S,[['ESI',-4],['EDI',-8]]);m[decoder+0xa8]=0;m.writeUInt16LE(1,decoder+0x68);m[decoder+0x6b]=0;
 codec(runtime,'mad_stream_init',[decoder+0xb0],F,0x4b5a30);codec(runtime,'mad_frame_init',[decoder+0xf0],F,0x4b5a3b);codec(runtime,'mad_synth_init',[decoder+0x2524],F,0x4b5a46);
 for(const offset of[0x3524,0x352c,0x3528,0xac])put(m,decoder+offset,0);put(m,decoder+0x5930,ptr(m,0x5bc4e4));put(m,decoder+0x5934,ptr(m,0x5bc4e8));put(m,F-4,0x4b5a89);populateGameAudioStream(decoder,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,EDI:decoder}});return 1;
}

//4b5ae0: actual buffering, error recovery, channel/rate discovery, timer,
//loop/EOF and conversion policy surrounding mad_frame_decode/mad_synth_frame.
export function readGameMp3DecoderPcm(decoder,output,requested,runtime){
 const m=runtime.memory,S=runtime.scratchBase,base=(S-4)&~7,F=base-24;save(runtime,S,[['EBP',-4]]);save(runtime,F,[['EBX',8],['ESI',4],['EDI',0]]);put(m,F+20,0);if(m[decoder+0xa8]===1)return 0;
 let ebx=(runtime.entryRegisters?.EBX??0)&0xffffff00,edi=runtime.entryRegisters?.EDI,ecx=decoder;m[F+15]=0;
 const finish=()=>{m[decoder+0x69]=m[decoder+0xa8];return get(m,F+20);};
 while(true){
  if(get(m,decoder+0xac)<m.readUInt16LE(decoder+0x352e)){put(m,F-4,S+8);put(m,F-8,S+4);put(m,F-12,F+20);put(m,F-16,0x4b5b33);convertGameMp3Pcm(decoder,F+20,S+4,S+8,{...runtime,scratchBase:F-16,entryRegisters:{...runtime.entryRegisters,EBX:ebx,EBP:S-4,ESI:decoder,EDI:edi}});ecx=decoder;}
  if(get(m,S+8)===0)return finish();
  if(!ptr(m,decoder+0xb0)||ptr(m,decoder+0xec)===1){
   const retained=ptr(m,decoder+0xc8);if(retained){ebx=get(m,decoder+0xb4)-retained|0;crt(runtime,'memcpy',[decoder+0x5938,retained,ebx],F,0x4b5b79);}else ebx=0;
   edi=0x8000-ebx|0;if(!ptr(m,decoder+0x7c)&&ptr(m,decoder+0x78)<(edi>>>0))edi=ptr(m,decoder+0x78);put(m,F+16,0);
   let accepted=true;if(edi)accepted=!!os(runtime,'ReadFile',[ptr(m,decoder+0x64),decoder+0x5938+ebx,edi,F+16,0],F,0x4b5bbb);
   if(!accepted)debuggerAt(runtime,F-4,0x4b5d05,{EBX:ebx,EBP:S-4,ESI:decoder,EDI:edi,ECX:ecx});
   if(!accepted||ptr(m,F+16)!==(edi>>>0)||!edi){
    const owner=ptr(m,decoder+8),loopTarget=ptr(m,ptr(m,owner)+0x48);if(loopTarget!==0x4ad500)throw Error(`Unported MP3 loop policy0x${loopTarget.toString(16)}.`);put(m,F-4,0x4b5d0f);if(getGameAudioLoopFlag(owner,runtime)===1){const handle=ptr(m,decoder+0x64);put(m,decoder+0x78,ptr(m,decoder+0x70));put(m,decoder+0x7c,ptr(m,decoder+0x74));put(m,F-4,0);put(m,F-8,0);put(m,F-12,0x4b5d2b);seekGameAudioCodecFile(handle,0,0,{...runtime,scratchBase:F-12});}else m[decoder+0xa8]=1;return finish();
   }
   const old=ptr(m,decoder+0x78);put(m,decoder+0x78,old-edi);put(m,decoder+0x7c,get(m,decoder+0x7c)-(old<(edi>>>0)?1:0));const buffer=decoder+0x5938;put(m,decoder+0xbc,1);put(m,decoder+0xb0,buffer);put(m,decoder+0xc4,buffer);put(m,decoder+0xb4,buffer+edi+ebx);put(m,decoder+0xc8,buffer);put(m,decoder+0xcc,buffer);put(m,decoder+0xd0,0x80000);put(m,decoder+0xec,0);ebx=(ebx&0xffffff00)|m[F+15];ecx=buffer;
  }
  const result=codec(runtime,'mad_frame_decode',[decoder+0xf0,decoder+0xb0],F,0x4b5c2c)|0;ecx=decoder+0xf0;
  if(result){const error=ptr(m,decoder+0xec);if(error&0xff00||error===1)continue;return finish();}
  const channels=(get(m,decoder+0xf4)!==0?1:0)+1;if(channels!==m.readUInt16LE(decoder+0x82)){ebx=(ebx&0xffffff00)|1;m.writeUInt16LE(channels,decoder+0x82);m[F+15]=1;}
  const rate=ptr(m,decoder+0x104);let changedRate=false;if(rate&&rate!==ptr(m,decoder+0x84)){ebx=(ebx&0xffffff00)|1;put(m,decoder+0x84,rate);m[F+15]=1;changedRate=true;}
  if(changedRate||(ebx&255)===1){put(m,F-4,0x4b5ca1);setupGameAudioStreamResampling(decoder,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,EBX:ebx,EBP:S-4,ESI:decoder,EDI:edi}});}
  put(m,decoder+0x5930,get(m,decoder+0x5930)+get(m,decoder+0x114));put(m,decoder+0x5934,get(m,decoder+0x5934)+get(m,decoder+0x118));const fraction=ptr(m,decoder+0x5934);if(fraction>=0x15074d00){put(m,decoder+0x5930,get(m,decoder+0x5930)+Math.trunc(fraction/0x15074d00));put(m,decoder+0x5934,fraction%0x15074d00);}
  codec(runtime,'mad_synth_frame',[decoder+0x2524,decoder+0xf0],F,0x4b5cec);put(m,decoder+0xac,0);if(ebx&255)return finish();
 }
}
