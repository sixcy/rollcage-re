import {readGameOggPageBytes,convertGameOggPcm} from './game-audio-compressed-pcm.mjs';
import {populateGameAudioStream} from './game-audio-decoder-lifecycle.mjs';
import {setupGameAudioStreamResampling} from './game-audio-resampling-setup.mjs';
import {getGameAudioLoopFlag} from './game-audio-wave-decoder.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
function library(r,name,args,stack,top,ret){const m=r.memory;stack.forEach((v,i)=>put(m,top-stack.length*4+i*4,v));const S=top-stack.length*4-4;put(m,S,ret);if(typeof r.services?.codecCall!=='function')throw Error(`OGG game adapter requires identified codec ${name}.`);return r.services.codecCall(name,args,{...r,scratchBase:S});}
function os(r,name,args,top,ret){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const S=top-args.length*4-4;put(m,S,ret);return r.services.platformCall(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
//4b4ff0 performs game header/refill/format/state ownership around the original
//statically linked Ogg/Vorbis interfaces. The second/third header return codes
//and failed shared-DSP initialization retain their native ignored-result policy.
export function initializeGameOggDecoder(decoder,runtime){
 const m=runtime.memory,S=runtime.scratchBase,base=(S-4)&~7,F=base-32;save(runtime,S,[['EBP',-4]]);save(runtime,F,[['EBX',12],['ESI',4],['EDI',0]]);put(m,F+8,S-4);put(m,F+20,decoder);let stream=decoder+0xe0,info=decoder+0x278,packet=decoder+0x258;const sync=decoder+0xc0;put(m,F+24,sync);m[decoder+0x68]=0;m[decoder+0xb0]=0;put(m,decoder+0xb8,0);put(m,decoder+0xb4,0);m.fill(0,sync,sync+28);
 const lib=(name,args,stack,ret)=>library(runtime,name,args,stack,F,ret);
 let buffer=lib('ogg_sync_buffer',[sync],[],0x4b504a);put(m,F-4,F+28);put(m,F-8,F+28);put(m,F-12,buffer);put(m,F-16,0x4b5058);if(!readGameOggPageBytes(decoder,buffer,F+28,F+28,{...runtime,scratchBase:F-16,entryRegisters:{...runtime.entryRegisters,EBX:sync,EBP:S-4,ESI:decoder}}))return 0;
 let filled=get(m,sync+8)+get(m,F+28)|0;if(filled>get(m,sync+4))return 0;put(m,sync+8,filled);if((lib('ogg_sync_pageout',[sync,decoder+0x248],[],0x4b5080)|0)<=0)return 0;const header=ptr(m,decoder+0x248),serial=ptr(m,header+14);if(lib('ogg_stream_init',[stream,serial],[],0x4b50ba)|0)return 0;
 lib('vorbis_info_init',[info],[],0x4b50cf);m.fill(0,decoder+0x298,decoder+0x2a8);if(lib('ogg_stream_pagein',[stream,decoder+0x248],[],0x4b50e7)|0)return 0;
 if((lib('ogg_packetout_internal',[stream,packet,1],[1],0x4b5102)|0)<=0)return 0;if((lib('vorbis_synthesis_headerin',[info,decoder+0x298,packet],[packet],0x4b511b)|0)<0)return 0;
 if(get(m,decoder+0x27c))m.writeUInt16LE(m.readUInt16LE(decoder+0x27c),decoder+0x82);const rate=get(m,decoder+0x280);if(rate)put(m,decoder+0x84,rate);put(m,F-4,0x4b5154);setupGameAudioStreamResampling(decoder,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,EBX:stream,EBP:info,ESI:decoder,EDI:packet}});
 let headers=0;
 while(true){
  if(headers<2){
   while(true){decoder=ptr(m,F+20);const result=lib('ogg_sync_pageout',[ptr(m,F+24),decoder+0x248],[],0x4b5173)|0;if(!result)break;if(result<0)continue;lib('ogg_stream_pagein',[stream,decoder+0x248],[],0x4b518a);
    while(headers<2){const accepted=lib('ogg_packetout_internal',[stream,packet,1],[1],0x4b519b)|0;if(accepted<0)return 0;if(!accepted)break;lib('vorbis_synthesis_headerin',[info,decoder+0x298,packet],[packet],0x4b51ba);headers++;}
    if(headers>=2)break;
   }
  }
  buffer=lib('ogg_sync_buffer',[ptr(m,F+24)],[],0x4b51ce);decoder=ptr(m,F+20);put(m,F-4,F+28);put(m,F-8,F+28);put(m,F-12,buffer);put(m,F-16,0x4b51de);if(!readGameOggPageBytes(decoder,buffer,F+28,F+28,{...runtime,scratchBase:F-16,entryRegisters:{...runtime.entryRegisters,EBX:stream,EBP:info,ESI:headers,EDI:packet}}))return 0;if(!get(m,F+28)&&headers<2)return 0;
  const currentSync=ptr(m,F+24);filled=get(m,currentSync+8)+get(m,F+28)|0;if(filled>get(m,currentSync+4))return 0;put(m,currentSync+8,filled);if(headers>=2)break;
 }
 decoder=ptr(m,F+20);put(m,decoder+0xa8,0);put(m,decoder+0xac,0);if(!(lib('vorbis_vds_shared_init',[decoder+0x2a8,info,0],[0],0x4b5238)|0))lib('vorbis_synthesis_restart',[decoder+0x2a8],[],0x4b524a);lib('vorbis_block_init',[decoder+0x2a8,decoder+0x318],[],0x4b525b);m.writeUInt16LE(1,decoder+0x68);m[decoder+0x6b]=0;put(m,F-4,0x4b526c);populateGameAudioStream(decoder,{...runtime,scratchBase:F-4,entryRegisters:{...runtime.entryRegisters,EBX:decoder,EBP:info,ESI:headers,EDI:packet}});return 1;
}

//4b5380. Original packet/page/refill/DSP-output/cache/loop/EOF policy. Partial
//buffer and cached-output exits intentionally defer the common +69 update.
export function readGameOggDecoderPcm(decoder,output,capacity,runtime){
 const m=runtime.memory,S=runtime.scratchBase,base=(S-4)&~7,F=base-56;save(runtime,S,[['EBP',-4]]);save(runtime,F,[['EBX',8],['ESI',4],['EDI',0]]);put(m,F+12,decoder);put(m,F+16,0);const channels=get(m,decoder+0x27c),stride=Math.imul(channels,2);put(m,F+36,channels);put(m,F+32,stride);
 const lib=(name,args,stack,ret)=>library(runtime,name,args,stack,F,ret),returned=()=>get(m,F+16);
 const planes=()=>{const table=ptr(m,decoder+0xbc);if(get(m,F+36)>=1)put(m,F+40,ptr(m,table));if(get(m,F+36)>=2)put(m,F+44,ptr(m,table+4));};
 const convert=(count,ret,ebx,esi,edi)=>{const args=[F+40,count,F+16,ptr(m,S+4),get(m,S+8)];args.forEach((v,i)=>put(m,F-20+i*4,v));put(m,F-24,ret);convertGameOggPcm(decoder,...args,{...runtime,scratchBase:F-24,entryRegisters:{...runtime.entryRegisters,EBX:ebx,EBP:S-4,ESI:esi,EDI:edi}});};
 const packetHole=stream=>{const index=get(m,stream+36);if(index>=get(m,stream+32))return false;if(!(ptr(m,ptr(m,stream+16)+index*4)&0x400))return false;const old=ptr(m,stream+0x158);put(m,stream+0x158,old+1);put(m,stream+36,index+1);put(m,stream+0x15c,get(m,stream+0x15c)+(old===0xffffffff?1:0));return true;};
 const loopAt=(ret,seekRet)=>{const owner=ptr(m,decoder+8),target=ptr(m,ptr(m,owner)+0x48);if(target!==0x4ad500)throw Error(`Unported OGG loop policy0x${target.toString(16)}.`);put(m,F-4,ret);if(getGameAudioLoopFlag(owner,runtime)!==1){m[decoder+0xb0]=1;return false;}const low=ptr(m,decoder+0xa8),high=ptr(m,decoder+0xac),totalLow=ptr(m,decoder+0x70);put(m,decoder+0x78,totalLow-low);put(m,decoder+0x7c,get(m,decoder+0x74)-(high|0)-(totalLow<low?1:0));os(runtime,'SetFilePointerEx',[ptr(m,decoder+0x64),low,high,F+48,0],F,seekRet);return true;};
 let consumed=get(m,decoder+0xb4),cached=get(m,decoder+0xb8);
 if(consumed<cached){const table=ptr(m,decoder+0xbc);if(channels>=1)put(m,F+40,ptr(m,table)+consumed*4);if(channels>=2)put(m,F+44,ptr(m,table+4)+consumed*4);let frames=cached-consumed|0;if(Math.imul(frames,stride)>get(m,S+8)){if(!stride)throw RangeError('Native OGG cached frame-size divide by zero.');frames=Math.trunc(get(m,S+8)/stride)|0;}convert(frames,0x4b541a,stride,frames,decoder);const next=get(m,decoder+0xb4)+frames|0;put(m,decoder+0xb4,next);cached=get(m,decoder+0xb8);if(next!==cached)return returned();const pending=get(m,decoder+0x2c0)+cached|0;if(!cached||pending<=get(m,decoder+0x2bc))put(m,decoder+0x2c0,pending);}
 while(!m[decoder+0xb0]){
  let stream=decoder+0xe0;put(m,F+28,stream);
  //Packet/page loop5470. A zero pageout leaves this loop for a file refill.
  let refill=false;
  while(!m[decoder+0xb0]){
   let havePacket=get(m,stream+36)<get(m,stream+32);if(havePacket&&packetHole(stream))havePacket=false;
   if(!havePacket){const result=lib('ogg_sync_pageout',[decoder+0xc0,decoder+0x248],[],0x4b54a9)|0;if(!result){refill=true;break;}if(result<0)continue;lib('ogg_stream_pagein',[stream,decoder+0x248],[],0x4b54c4);}
   put(m,F+20,decoder+0x258);let packet=lib('ogg_packetout_internal',[stream,decoder+0x258,1],[1],0x4b54d9)|0;
   if(packet>0){
    put(m,F+24,decoder+0x318);const dsp=decoder+0x2a8;
    do{
     const block=ptr(m,F+24),packetAddress=ptr(m,F+20);if(!(lib('vorbis_synthesis',[block,packetAddress],[],0x4b550b)|0))lib('vorbis_synthesis_blockin',[dsp,block],[],0x4b551a);
     while(get(m,dsp+24)>=0&&get(m,dsp+24)<get(m,dsp+20)){
      const info=ptr(m,dsp+4),table=ptr(m,dsp+12);for(let i=0;i<get(m,info+4);i++)put(m,table+i*4,ptr(m,ptr(m,dsp+8)+i*4)+get(m,dsp+24)*4);put(m,decoder+0xbc,table);const frames=get(m,dsp+20)-get(m,dsp+24)|0;if(frames<=0)break;planes();
      const requested=get(m,S+8),full=Math.imul(frames,get(m,F+32))+get(m,F+16)|0;
      if(full>requested){if(!get(m,F+32))throw RangeError('Native OGG partial frame-size divide by zero.');const count=Math.trunc((requested-get(m,F+16)|0)/get(m,F+32))|0;put(m,decoder+0xb4,count);put(m,decoder+0xb8,frames);convert(count,0x4b573a,decoder,dsp,frames);
       stream=decoder+0xe0;if(get(m,stream+36)<get(m,stream+32)&&!packetHole(stream))return returned();const header=ptr(m,decoder+0x248);if(!(m[header+5]&4))return returned();loopAt(0x4b5784,0x4b57b6);return returned();
      }
      convert(frames,0x4b55b7,decoder+0xbc,dsp,frames);const next=get(m,dsp+24)+frames|0;if(next<=get(m,dsp+20))put(m,dsp+24,next);
     }
     packet=lib('ogg_packetout_internal',[ptr(m,F+28),ptr(m,F+20),1],[1],0x4b55dc)|0;
    }while(packet>0);
    decoder=ptr(m,F+12);stream=ptr(m,F+28);
   }
   const header=ptr(m,decoder+0x248);if(m[header+5]&4)loopAt(0x4b5609,0x4b563b);
  }
  if(m[decoder+0xb0])break;if(!refill)continue;
  const buffer=lib('ogg_sync_buffer',[decoder+0xc0],[],0x4b5669);decoder=ptr(m,F+12);let count=0x1000,bytes=0;if(!ptr(m,decoder+0x7c)&&ptr(m,decoder+0x78)<count)count=ptr(m,decoder+0x78);put(m,F+28,0);
  let accepted=true;if(count)accepted=!!os(runtime,'ReadFile',[ptr(m,decoder+0x64),buffer,count,F+28,0],F,0x4b56a0);
  if(!accepted){put(m,F-4,0x4b56a9);getApplicationDebugger({...runtime,scratchBase:F-4,nativeDebuggerFrame:'wrapper',entryRegisters:{...runtime.entryRegisters,EBX:0,EBP:S-4,ESI:count,EDI:decoder,ECX:buffer}});}
  else if(ptr(m,F+28)===count){const old=ptr(m,decoder+0x78);put(m,decoder+0x78,old-count);bytes=count;put(m,decoder+0x7c,get(m,decoder+0x7c)-(old<count?1:0));}
  const next=get(m,decoder+0xc8)+bytes|0;if(next<=get(m,decoder+0xc4))put(m,decoder+0xc8,next);decoder=ptr(m,F+12);if(!bytes)m[decoder+0xb0]=1;
 }
 m[decoder+0x69]=m[decoder+0xb0];return returned();
}
