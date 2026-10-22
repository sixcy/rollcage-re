import {getApplicationDebugger} from './application-bootstrap.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),f32=Math.fround;
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
function os(r,name,args,top,ret){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const S=top-args.length*4-4;put(m,S,ret);return r.services.platformCall(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function truncate(m,p,value){m.writeFloatLE(value,p);const bits=get(m,p),exponent=(bits>>23&255)-127,sign=bits>>31;return((((bits|0xff800000)<<8)>>>((31-exponent)&31))^sign)-sign&~(exponent>>31);}

//4b57e0: game-owned Vorbis planar float→interleaved signed16 conversion.
//Frame accounting uses the original source channel count; writes use +82.
export function convertGameOggPcm(decoder,planes,samples,writtenAddress,output,capacity,runtime){
 const m=runtime.memory,S=runtime.scratchBase,F=S-28;save(runtime,S,[['EBP',-20],['ESI',-24],['EDI',-28]]);const stride=Math.imul(get(m,decoder+0x27c),2),channels=m.readUInt16LE(decoder+0x82),last=channels-1;put(m,F+12,stride);put(m,F+20,last);samples=get(m,S+8);if(samples<=0)return;save(runtime,F,[['EBX',-4]]);const T=F-4;planes=ptr(m,S+4);const maximum=m.readFloatLE(0x5dcaa4),minimum=m.readFloatLE(0x5dcb78);let destination=0,available=0;
 do{
  writtenAddress=ptr(m,S+12);const written=get(m,writtenAddress);capacity=get(m,S+20);if(written<capacity){destination=ptr(m,S+16)+written|0;available=capacity-written|0;}const bytes=Math.min(available,Math.imul(samples,stride))|0;put(m,T+28,bytes);put(m,writtenAddress,written+bytes);if(!stride)throw RangeError('Native OGG PCM frame-size divide by zero.');let frames=Math.trunc(bytes/stride)|0;samples=samples-frames|0;put(m,S+4,frames);put(m,S+8,samples);
  if(frames>0)do{for(let channel=0;channel<=last;channel++){const p=ptr(m,planes+channel*4);let value=f32(m.readFloatLE(p)*maximum);put(m,planes+channel*4,p+4);if(minimum>value)value=minimum;else if(value>maximum)value=maximum;const converted=truncate(m,T+20,value);m.writeUInt16LE(converted&65535,destination);destination=destination+2|0;}frames--;put(m,S+4,frames);}while(frames>0);
  if(samples>0&&bytes===0)throw RangeError('Native OGG PCM conversion makes no progress for this output capacity.');available=get(m,T+28);
 }while(samples>0);
}

//4b5d50: original fixed28→signed16 conversion and caller pointer/count
//updates. The original channel loop reloads the same sample for each channel.
export function convertGameMp3Pcm(decoder,writtenAddress,outputAddress,remainingAddress,runtime){
 const m=runtime.memory,S=runtime.scratchBase;put(m,S-4,decoder);save(runtime,S,[['EBX',-8],['ESI',-12]]);const last=m.readUInt16LE(decoder+0x82)-1;if(get(m,decoder+0xac)>=m.readUInt16LE(decoder+0x352e))return;save(runtime,S,[['EDI',-16]]);put(m,S-4,0x7fff);save(runtime,S,[['EBP',-20]]);
 while(get(m,decoder+0xac)<m.readUInt16LE(decoder+0x352e)){
  remainingAddress=ptr(m,S+12);const requested=get(m,remainingAddress);if(requested<=0)break;const current=get(m,decoder+0xac),end=Math.min(m.readUInt16LE(decoder+0x352e),(requested>>2)+current|0);outputAddress=ptr(m,S+8);let output=ptr(m,outputAddress),frames=0;
  while(get(m,decoder+0xac)<end){for(let channel=last;channel>=0;channel--){let value=get(m,decoder+0x3530+get(m,decoder+0xac)*4)>>13;if(value<-32768)value=-32768;else if(value>32767)value=get(m,S-4);m.writeUInt16LE(value&65535,output);output=output+2|0;}put(m,decoder+0xac,get(m,decoder+0xac)+1);frames++;}
  const bytes=Math.imul(m.readUInt16LE(decoder+0x82),frames)*2|0;remainingAddress=ptr(m,S+12);if(get(m,remainingAddress)>0){put(m,remainingAddress,get(m,remainingAddress)-bytes);outputAddress=ptr(m,S+8);put(m,outputAddress,output);}writtenAddress=ptr(m,S+4);put(m,writtenAddress,get(m,writtenAddress)+bytes);if(!frames&&get(m,remainingAddress)>0)throw RangeError('Native MP3 PCM conversion makes no progress for this byte request.');
 }
}

//4b5920: one exact4096-byte-capped refill. Original third argument slot is
//reused as ReadFile's byte-count output after saving its incoming pointer.
export function readGameOggPageBytes(decoder,output,unused,writtenAddress,runtime){
 const m=runtime.memory,S=runtime.scratchBase,F=S-16;put(m,S-4,decoder);save(runtime,S,[['EBX',-8],['ESI',-12],['EDI',-16]]);writtenAddress=ptr(m,S+12);put(m,writtenAddress,0);let count=0x1000;if(!ptr(m,decoder+0x7c)&&ptr(m,decoder+0x78)<count)count=ptr(m,decoder+0x78);put(m,S+12,0);
 if(count&&!os(runtime,'ReadFile',[ptr(m,decoder+0x64),ptr(m,S+4),count,S+12,0],F,0x4b5963)){put(m,F-4,0x4b596c);getApplicationDebugger({...runtime,scratchBase:F-4,nativeDebuggerFrame:'wrapper',entryRegisters:{...runtime.entryRegisters,EBX:writtenAddress,ESI:decoder,EDI:count,ECX:decoder}});return false;}
 if(ptr(m,S+12)!==count)return false;const old=ptr(m,decoder+0x78);put(m,decoder+0x78,old-count);put(m,writtenAddress,count);put(m,decoder+0x7c,get(m,decoder+0x7c)-(old<count?1:0));return true;
}
