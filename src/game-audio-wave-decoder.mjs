import * as decoderLifecycle from './game-audio-decoder-lifecycle.mjs';
import {reportGameAssertion} from './game-assertion.mjs';
import {resetGameAudioDecoderBlocks} from './game-audio-decoder-lifecycle.mjs';
import tables from './game-audio-wave-decoder-tables.json' with {type:'json'};
import {setupGameAudioStreamResampling} from './game-audio-resampling-setup.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p)=>m.readUInt16LE(p);
const save=(r,S,rows)=>{for(const[n,o]of rows)if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S+o,r.entryRegisters[n]);};
function call(r,kind,name,args,top,returned){const m=r.memory;args.forEach((v,i)=>put(m,top-4*args.length+i*4,v));const S=top-4*args.length-4;put(m,S,returned);if(typeof r.services?.[kind]!=='function')throw Error('Wave decoder requires '+kind+' '+name);return r.services[kind](name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
const os=(r,n,a,t,ret)=>call(r,'platformCall',n,a,t,ret);
export function initializeGameWaveDecoderTables(memory){for(const table of tables.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
function debuggerAt(r,S,ret,registers){put(r.memory,S,ret);return getApplicationDebugger({...r,scratchBase:S,nativeDebuggerFrame:'wrapper',entryRegisters:{...r.entryRegisters,...registers},handlers:{...r.handlers,allocate:r.handlers?.allocate??((n,child)=>child.services.libraryCall('operatorNew',[n],child)),free:r.handlers?.free??((p,child)=>child.services.libraryCall('operatorDelete',[p],child)),registerExit:r.handlers?.registerExit??((p,child)=>child.services.libraryCall('registerExit',[p],child))}});}
function remainingFromPosition(m,object,position){const lo=ptr(m,object+0x70),hi=get(m,object+0x74);put(m,object+0x78,lo-position);put(m,object+0x7c,hi-(position>>31)-(lo<(position>>>0)?1:0));}
//4b4eb0. The byte-count result lives in the second caller argument itself.
export function readGameWaveBytes(object,output,length,runtime){const{memory:m,scratchBase:S}=runtime,F=S-12;put(m,S+4,output);put(m,S+8,length);put(m,S-4,object);save(runtime,S,[['ESI',-8],['EDI',-12]]);let count=ptr(m,S+8);if(!ptr(m,object+0x7c)&&ptr(m,object+0x78)<count)count=ptr(m,object+0x78);put(m,S+8,0);let read=0;if(count){const accepted=os(runtime,'ReadFile',[ptr(m,object+0x64),ptr(m,S+4),count,S+8,0],F,0x4b4ee8);if(!accepted){debuggerAt(runtime,F-4,0x4b4ef1,{ESI:object,EDI:count,ECX:object});return false;}read=ptr(m,S+8);}if(read!==count)return false;put(m,object+0xf8,get(m,object+0xf8)+count);const old=ptr(m,object+0x78);put(m,object+0x78,old-count);put(m,object+0x7c,get(m,object+0x7c)-(old<count?1:0));return true;}
//4b4f30. File offsets are signed32 extended to the genuine64-bit API.
export function skipGameWaveBytes(object,length,runtime){const{memory:m,scratchBase:S}=runtime,F=S-16;put(m,S+4,length);save(runtime,S,[['ESI',-16]]);put(m,object+0xf8,get(m,object+0xf8)+get(m,S+4));const position=get(m,object+0xf8);os(runtime,'SetFilePointerEx',[ptr(m,object+0x64),position,position>>31,F+8,0],F,0x4b4f59);remainingFromPosition(m,object,get(m,object+0xf8));}
//4b4970. Each scratch-pointer reload occurs after the preceding live store.
export function rewindGameWaveDecoder(object,runtime){const{memory:m,scratchBase:S}=runtime,F=((S-4)&~7)-16;save(runtime,S,[['EBP',-4]]);save(runtime,F,[['ESI',0]]);if(!ptr(m,object+0xdc))return false;for(const o of[0,4,8])put(m,ptr(m,object+0xdc)+o,0);const position=get(m,object+0xe0);if(get(m,object+0xf8)!==position){os(runtime,'SetFilePointerEx',[ptr(m,object+0x64),position,position>>31,F+8,0],F,0x4b49c7);const reloaded=get(m,object+0xe0);put(m,object+0xf8,reloaded);remainingFromPosition(m,object,reloaded);}return true;}
//4b4a30: PCM returns a shifted signed byte count; ADPCM returns zero.
export function getGameWaveOutputSize(object,{memory:m}){return word(m,object+0xa8)===1?(get(m,object+0xe4)>>(word(m,object+0xb6)>>>4))<<(word(m,object+0x8e)>>>4):0;}

//4b40d0. Native RIFF/WAVE and FORM/AIFF chunk walker. Failed/short reads
//retain partially written scratch and the original surprising success paths.
export function parseGameWaveDecoder(object,runtime){const{memory:m,scratchBase:S}=runtime,F=((S-4)&~7)-0x60;save(runtime,S,[['EBP',-4]]);save(runtime,F,[['EBX',12],['ESI',4],['EDI',0]]);put(m,F+8,S-4);let flags=0,bp=S-4,di=runtime.entryRegisters?.EDI??0;
 const regs=()=>({...runtime.entryRegisters,EBX:flags,EBP:bp,ESI:object,EDI:di});
 const read=(out,n,ret)=>{put(m,F-4,n);put(m,F-8,out);put(m,F-12,ret);return readGameWaveBytes(object,out,n,{...runtime,scratchBase:F-12,entryRegisters:regs()});};
 const skip=(n,ret)=>{put(m,F-4,n);put(m,F-8,ret);return skipGameWaveBytes(object,n,{...runtime,scratchBase:F-8,entryRegisters:regs()});};
 const seek=(out,ret)=>{const pos=get(m,object+0xf8);os(runtime,'SetFilePointerEx',[ptr(m,object+0x64),pos,pos>>31,out,0],F,ret);remainingFromPosition(m,object,get(m,object+0xf8));};
 const swap=()=>{const x=ptr(m,F+0x14),v=((x>>>24)|(x>>>8&0xff00)|(x<<8&0xff0000)|(x<<24))|0;put(m,F+0x1c,v);put(m,F+0x14,v);return v>>>0;};
 const setup=ret=>{put(m,F-4,ret);setupGameAudioStreamResampling(object,{...runtime,scratchBase:F-4,entryRegisters:regs()});};
 put(m,object+0xf8,0);read(F+0x18,4,0x4b40f3);const signature=ptr(m,F+0x18);if(signature!==0x46464952&&signature!==0x4d524f46)return false;const aiff=signature===0x4d524f46;m[object+0xfc]=Number(aiff);if(aiff)m[F+0x13]=0;
 read(F+0x14,4,aiff?0x4b4137:0x4b4479);read(F+0x18,4,aiff?0x4b4145:0x4b4487);if(ptr(m,F+0x18)!==(aiff?0x46464941:0x45564157))return false;bp=ptr(m,0x56e198);
 for(let chunks=0;;chunks++){
  if(chunks>=(runtime.maxWaveChunks??100000))throw Error('Native wave chunk walk exceeds bounded reference domain');
  di=4;if(!ptr(m,object+0x7c)&&ptr(m,object+0x78)<di)di=ptr(m,object+0x78);put(m,F+0x1c,0);const priorId=get(m,F+0x18);let got=0;
  if(di){const accepted=os(runtime,'ReadFile',[ptr(m,object+0x64),F+0x18,di,F+0x1c,0],F,aiff?0x4b4194:0x4b44d4);if(!accepted){debuggerAt(runtime,F-4,0x4b446a,{...regs(),ECX:priorId});return true;}got=ptr(m,F+0x1c);}if(got!==di)return true;
  const id=ptr(m,F+0x18);put(m,object+0xf8,get(m,object+0xf8)+di);const old=ptr(m,object+0x78);put(m,object+0x78,old-di);put(m,object+0x7c,get(m,object+0x7c)-(old<di?1:0));
  if(aiff){
   if(id===0x444e5353){
    di=object+0xe4;read(di,4,0x4b43a9);const raw=ptr(m,di);put(m,object+0xf8,get(m,object+0xf8)+8);put(m,F+0x20,raw);const swapped=(raw>>>24)|(raw>>>8&0xff00)|(raw<<8&0xff0000)|(raw<<24);put(m,F+0x1c,swapped);put(m,di,swapped-8);seek(F+0x38,0x4b43fa);bp=get(m,object+0xf8);put(m,object+0xe0,bp);flags|=2;if(flags===3)return true;put(m,object+0xf8,get(m,di)+bp);bp=ptr(m,0x56e198);seek(F+0x40,0x4b4440);
   }else{
    read(F+0x14,4,id===0x4d4d4f43?0x4b422c:0x4b41e0);const n=swap();
    if(id===0x4d4d4f43){
     if(!m[F+0x13]&&n>=18){
      m[F+0x13]=1;read(F+0x4c,18,0x4b4285);skip((get(m,F+0x14)-18)|0,0x4b4294);di=object+0xa8;call(runtime,'libraryCall','memset',[di,0,52],F,0x4b42a4);m.writeUInt16LE(1,di);
      const channels=m.readUInt16BE(F+0x4c);put(m,F+0x1c,channels);di=di&0xffff0000|channels;const mantissa=m.readUInt16BE(F+0x56);put(m,F+0x1c,mantissa);const rate=(mantissa<<(m[F+0x55]&31))>>>14,bits=m.readUInt16BE(F+0x52);put(m,F+0x1c,bits);m.writeUInt16LE(bits,object+0xb6);const align=(di&65535)<<(bits>>>4)&65535;m.writeUInt16LE(align,object+0xb4);m.writeUInt16LE(di&65535,object+0xaa);put(m,object+0xac,rate);m.writeUInt16LE(di&65535,object+0x82);put(m,object+0x84,rate);put(m,object+0xb0,Math.imul(align,rate));setup(0x4b4359);flags|=1;
     }else{put(m,object+0xf8,get(m,object+0xf8)+n);seek(F+0x30,0x4b437c);flags|=1;}
    }else{put(m,object+0xf8,get(m,object+0xf8)+n);seek(F+0x28,0x4b4440);}
   }
  }else if(id===0x20746d66){
   read(F+0x14,4,0x4b45ed);di=ptr(m,F+0x14);
   if(di>14){bp=object+0xa8;call(runtime,'libraryCall','memset',[bp,0,52],F,0x4b460a);read(bp,di<52?di:52,di<52?0x4b461b:0x4b4625);if(di>=52){const extra=get(m,F+0x14)-52|0;if(extra>0)skip(extra,0x4b4638);}if(word(m,bp)===2){if(word(m,object+0xbc)>7)m.writeUInt16LE(7,object+0xbc);if(word(m,object+0xb6)!==4)return false;}const ch=word(m,object+0xaa);if(ch<1||ch>2)return false;bp=ptr(m,0x56e198);
   }else if(di===14){read(object+0xa8,14,0x4b4696);put(m,object+0xb6,0);}else{put(m,object+0xf8,get(m,object+0xf8)+di);seek(F+0x30,0x4b46bb);}
   const type=word(m,object+0xa8);if(type!==1&&type!==2)return false;m.writeUInt16LE(word(m,object+0xaa),object+0x82);put(m,object+0x84,get(m,object+0xac));setup(0x4b4708);flags|=1;
  }else if(id===0x61746164){
   di=object+0xe4;read(di,4,0x4b4594);const pos=get(m,object+0xf8);flags|=2;put(m,object+0xe0,pos);if(flags===3)return true;put(m,object+0xf8,get(m,di)+pos);seek(F+0x38,0x4b45c5);
  }else{
   read(F+0x14,4,id===0x74636166?0x4b4560:0x4b4520);const n=get(m,F+0x14);if(id===0x74636166){if(n===4)read(F+0x24,4,0x4b4576);else skip(n,0x4b4581);}else{put(m,object+0xf8,get(m,object+0xf8)+n);seek(F+0x40,0x4b453f);}
  }
  if(flags===3)return true;
 }
}

//4b3f00: in-place signed/unsigned8-bit expansion and AIFF endian conversion.
export function convertGameWaveSamples(buffer,sourceBits,targetBits,count,bigEndian,runtime){const{memory:m,scratchBase:S}=runtime;put(m,S+4,targetBits);put(m,S+8,count);put(m,S+12,bigEndian);save(runtime,S,[['EBX',-4],['EBP',-8],['ESI',-12],['EDI',-16]]);count=get(m,S+8);put(m,S+8,count-1);if(count<=0)return;
 if(bigEndian&255){if(sourceBits===8){if(targetBits===8){for(let i=0;i<count;i++)m[buffer+i]^=128;}else if(targetBits===16){for(let i=count-1;i>=0;i--)m.writeUInt16LE(m[buffer+i]*256,buffer+i*2);}}else if(sourceBits===16&&targetBits===16){for(let i=0;i<count;i++){const a=m[buffer+i*2],b=m[buffer+i*2+1];m[S+13]=a;m[S+12]=b;m.writeUInt16LE(word(m,S+12),buffer+i*2);}}}
 else if(sourceBits===8&&targetBits===16){for(let i=count-1;i>=0;i--)m.writeUInt16LE((m[buffer+i]-128)*256&65535,buffer+i*2);}
}
//4b4a60: Microsoft ADPCM block expansion, preserving the original signed
//delta adjustment, coefficient order,32-bit products and saturation.
export function decodeGameWaveAdpcmBlock(object,runtime){const{memory:m,scratchBase:S}=runtime,B=S-4,F=S-68;save(runtime,S,[['EBP',-4],['EBX',-60],['ESI',-64],['EDI',-68]]);put(m,B-0x10,object);const channels=word(m,object+0xaa);if(!channels)throw RangeError('Native ADPCM channel divide by zero');const scratch=()=>ptr(m,object+0xdc),raw=()=>ptr(m,scratch()+16),out=()=>ptr(m,scratch()+20);put(m,B-0x20,channels-1);const sampleCount=Math.min(get(m,object+0xf4)-get(m,scratch()+8)|0,get(m,object+0xec));put(m,B-12,sampleCount);put(m,B-8,-channels*2);const bytes=(Math.trunc(sampleCount/channels)+get(m,object+0xe8))|0;put(m,F-4,bytes);put(m,F-8,raw());put(m,B-4,bytes);put(m,F-12,0x4b4aba);readGameWaveBytes(object,raw(),bytes,{...runtime,scratchBase:F-12,entryRegisters:{...runtime.entryRegisters,EBP:B,EBX:object,ESI:channels,EDI:scratch()}});
 const input=raw(),output=out();put(m,B-0x30,m[input]);let delta0,delta1,header;if(word(m,object+0xaa)===1){delta0=m.readInt16LE(input+1);delta1=0;m.writeUInt16LE(word(m,input+3),output+2);m.writeUInt16LE(word(m,raw()+5),out());header=7;}
 else{delta0=m.readInt16LE(input+2);delta1=m.readInt16LE(input+4);put(m,B-0x2c,m[input+1]);m.writeUInt16LE(word(m,input+6),output+4);m.writeUInt16LE(word(m,raw()+8),out()+6);m.writeUInt16LE(word(m,raw()+10),out());m.writeUInt16LE(word(m,raw()+12),out()+2);header=14;}
 put(m,B-0x24,delta1);put(m,B-0x28,delta0);if(delta0&0x8000)put(m,B-0x28,delta0-65536);if(delta1&0x8000)put(m,B-0x24,delta1-65536);
 const payload=get(m,B-4)-header|0;put(m,B-0x1c,payload);put(m,B-0x14,raw()+header);const start=out()+word(m,object+0xaa)*4;put(m,B-4,start);put(m,B-0x18,start);if(payload<=0)throw RangeError('Native ADPCM nibble loop exceeds bounded valid-block domain');
 for(let i=0;i<payload;i++){const b=m[ptr(m,B-0x14)+i];put(m,start+i*4,b>>>4|(b&15)<<16);}
 for(let i=word(m,ptr(m,B-0x10)+0xaa)*2;i<get(m,B-12);i++){
  const at=ptr(m,B-4),nibble=m.readInt16LE(at),lane=i&get(m,B-0x20),delta=get(m,B+lane*4-0x28);put(m,B-0x1c,delta);const next=Math.imul(get(m,0x575a60+nibble*4),delta)>>8;put(m,B+lane*4-0x28,Math.max(next,16));const predictor=get(m,B+lane*4-0x30),negativeStride=get(m,B-8),older=m.readInt16LE(at+negativeStride*2),newer=m.readInt16LE(at+negativeStride);let value=((Math.imul(older,get(m,0x575a20+predictor*4))+Math.imul(newer,get(m,0x575a40+predictor*4)))|0)>>8;value=value+Math.imul(nibble-(nibble&8)*2,get(m,B-0x1c))|0;value=Math.max(-32768,Math.min(32767,value));m.writeInt16LE(value,at);put(m,B-4,at+2);
 }
 const owner=ptr(m,B-0x10);put(m,ptr(m,owner+0xdc),get(m,ptr(m,owner+0xdc))+1);put(m,ptr(m,owner+0xdc)+8,get(m,ptr(m,owner+0xdc)+8)+get(m,B-12));put(m,ptr(m,owner+0xdc)+12,get(m,B-12));
}

//4ad500: raw owner loop byte; value2 is deliberately not normalized to true.
export function getGameAudioLoopFlag(owner,{memory:m}){return m[owner+0x45c];}
function waveOwnerLoop(object,runtime,S,ret){const m=runtime.memory,owner=ptr(m,object+8),target=ptr(m,ptr(m,owner)+0x48);put(m,S,ret);if(target!==0x4ad500)throw Error('Unported wave owner loop target '+target.toString(16));return getGameAudioLoopFlag(owner,runtime);}
//4b4cb0: logical sample progress advances even when a PCM read fails or is
//short. Only successful full reads advance the underlying file counters.
export function readGameWaveFrames(object,output,byteCount,runtime){const{memory:m,scratchBase:S}=runtime,B=S-4,F=((S-4)&~7)-24;put(m,S+4,output);put(m,S+8,byteCount);save(runtime,S,[['EBP',-4]]);save(runtime,F,[['EBX',8],['ESI',4],['EDI',0]]);put(m,F+16,0);put(m,S+8,get(m,S+8)>>(word(m,object+0x8e)>>>4));let done=0,di=runtime.entryRegisters?.EDI??0;
 const regs=()=>({...runtime.entryRegisters,EBX:done,EBP:B,ESI:object,EDI:di}),scratch=()=>ptr(m,object+0xdc);
 while(done<get(m,S+8)){
  if(get(m,scratch()+8)>=get(m,object+0xf4)){if(m[object+0x92]!==1||waveOwnerLoop(object,runtime,F-4,0x4b4d08)!==1)break;put(m,F-4,0x4b4d17);rewindGameWaveDecoder(object,{...runtime,scratchBase:F-4,entryRegisters:regs()});}
  if(word(m,object+0xa8)===2){
   if(!get(m,scratch()+4)){put(m,F-4,0x4b4d37);decodeGameWaveAdpcmBlock(object,{...runtime,scratchBase:F-4,entryRegisters:regs()});}
   const cached=scratch(),used=get(m,cached+4);di=Math.min(get(m,S+8)-done|0,get(m,cached+12)-used|0);call(runtime,'libraryCall','memcpy',[ptr(m,S+4)+done*2,ptr(m,cached+20)+used*2,di*2],F,0x4b4d66);done=done+di|0;put(m,F+16,done);put(m,scratch()+4,get(m,scratch()+4)+di);const updated=scratch(),count=get(m,updated+4),limit=get(m,updated+12);if(count>=limit)put(m,updated+4,count-limit);
  }else{
   const current=get(m,scratch()+8),remaining=get(m,S+8)-done|0;di=(current+remaining|0)>get(m,object+0xf4)?get(m,object+0xf4)-current|0:remaining;const shift=word(m,object+0xb6)>>>4,destination=ptr(m,S+4)+(get(m,F+16)<<shift)|0;let count=di<<shift;if(!ptr(m,object+0x7c)&&ptr(m,object+0x78)<(count>>>0))count=ptr(m,object+0x78);put(m,F+20,0);let accepted=true,read=0;if(count){accepted=!!os(runtime,'ReadFile',[ptr(m,object+0x64),destination,count,F+20,0],F,0x4b4df1);if(!accepted)debuggerAt(runtime,F-4,0x4b4dfa,{...regs(),ECX:shift});else read=ptr(m,F+20);}if(accepted&&read===(count>>>0)){put(m,object+0xf8,get(m,object+0xf8)+count);const old=ptr(m,object+0x78);put(m,object+0x78,old-count);put(m,object+0x7c,get(m,object+0x7c)-(old<(count>>>0)?1:0));}done=get(m,F+16)+di|0;put(m,F+16,done);put(m,scratch()+8,get(m,scratch()+8)+di);
  }
 }
 let eax=get(m,scratch()+8);if(eax>=get(m,object+0xf4)){let loop=0;if(m[object+0x92]!==0){loop=waveOwnerLoop(object,runtime,F-4,0x4b4e58);eax=0x4ad500|loop;}if(!m[object+0x92]||!loop)m[object+0x69]=1;}
 const endian=m[object+0xfc];eax=eax&0xffffff00|endian;if(endian||(word(m,object+0xb6)!==word(m,object+0x8e)&&word(m,object+0xa8)===1)){const sourceBits=word(m,object+0xb6),targetBits=word(m,object+0x8e);put(m,F-4,eax);put(m,F-8,done);put(m,F-12,targetBits);put(m,F-16,0x4b4e9d);convertGameWaveSamples(ptr(m,S+4),sourceBits,targetBits,done,eax,{...runtime,scratchBase:F-16,entryRegisters:regs()});}
 return done;
}
//4b4a00 converts the internal logical sample count back to output bytes.
export function readGameWaveDecoderPcm(object,output,byteCount,runtime){const{memory:m,scratchBase:S}=runtime;put(m,S+4,output);put(m,S+8,byteCount);save(runtime,S,[['ESI',-4]]);let count=0;if(get(m,S+8)>0){put(m,S-8,get(m,S+8));put(m,S-12,ptr(m,S+4));put(m,S-16,0x4b4a17);count=readGameWaveFrames(object,ptr(m,S+4),get(m,S+8),{...runtime,scratchBase:S-16,entryRegisters:{...runtime.entryRegisters,ESI:object}});}return count<<(word(m,object+0x8e)>>>4);}

//4b4860, actual commonblock destruction followed by WAV scratch release.
export function resetGameWaveDecoder(object,runtime){const{memory:m,scratchBase:S}=runtime;save(runtime,S,[['ESI',-4]]);put(m,S-8,0x4b4868);resetGameAudioDecoderBlocks(object,{...runtime,scratchBase:S-8,entryRegisters:{...runtime.entryRegisters,ESI:object}});const allocation=ptr(m,object+0xdc);if(allocation){call(runtime,'libraryCall','free',[allocation],S-4,0x4b4879);put(m,object+0xdc,0);}m[object+0x68]=0;}

//4b4720: complete container initialization, real ADPCM sizing, scratch and
//common PCM population. Its population child is supplied by the canonical
//lifecycle module; unavailable game work is an explicit reached error.
export function initializeGameWaveDecoder(object,runtime){const{memory:m,scratchBase:S}=runtime,F=S-12;save(runtime,S,[['EDI',-4]]);put(m,S-8,0x4b4728);if(!parseGameWaveDecoder(object,{...runtime,scratchBase:S-8,entryRegisters:{...runtime.entryRegisters,EDI:object}}))return false;save(runtime,S,[['EBX',-8],['ESI',-12]]);let allocationSize;
 if(word(m,object+0xa8)===2){const samples=word(m,object+0xba),blockAlign=word(m,object+0xb4);save(runtime,S,[['EBP',-16]]);const expanded=samples*2,delta=blockAlign-samples;put(m,object+0xec,expanded);put(m,object+0xe8,delta);allocationSize=blockAlign+(expanded+14)*2;const bytes=get(m,object+0xe4);if(!blockAlign)throw RangeError('Native ADPCM block alignment divide by zero');let blocks=Math.trunc(bytes/blockAlign);put(m,object+0xf0,blocks);if(bytes%blockAlign){blocks=blocks+1|0;put(m,object+0xf0,blocks);}put(m,object+0xf4,(bytes-Math.imul(get(m,object+0xf0),delta))*2);
 }else{allocationSize=28;put(m,object+0xec,0);put(m,object+0xe8,0);put(m,object+0xf0,0);put(m,object+0xf4,get(m,object+0xe4)>>(word(m,object+0xb6)>>>4));}
 put(m,F-4,allocationSize);put(m,F-8,0x4b47d6);const allocation=runtime.services.libraryCall('allocate',[allocationSize],{...runtime,scratchBase:F-8})>>>0;
 if(!allocation){const values=[0x5d399c,26,0x5d3938,allocationSize>>>10];values.forEach((v,i)=>put(m,F-16+i*4,v));put(m,F-20,0x4b47f6);if(reportGameAssertion(values[0],values[1],values[2],[values[3]],{...runtime,scratchBase:F-20,entryRegisters:{...runtime.entryRegisters,EBX:allocationSize,ESI:allocation,EDI:object,ECX:allocationSize>>>10}})){const e=Error('Native WAV allocation breakpoint');e.name='NativeGameBreakpoint';e.address=0x4b47fd;throw e;}}
 put(m,object+0xdc,allocation);if(!allocation)return false;call(runtime,'libraryCall','memset',[allocation,0,allocationSize],F,0x4b4817);put(m,F-4,0x4b4821);const context={...runtime,entryRegisters:{...runtime.entryRegisters,EBX:allocationSize,ESI:allocation,EDI:object}};rewindGameWaveDecoder(object,{...context,scratchBase:F-4});put(m,ptr(m,object+0xdc)+16,ptr(m,object+0xdc)+24);put(m,ptr(m,object+0xdc)+20,ptr(m,object+0xdc)+24+word(m,object+0xb4));m.writeUInt16LE(1,object+0x68);m[object+0x6b]=0;put(m,F-4,0x4b4853);const populate=runtime.handlers?.populateGameAudioStream??decoderLifecycle.populateGameAudioStream;if(typeof populate!=='function')throw Error('Unported reached4aea00 populateGameAudioStream');populate(object,{...context,scratchBase:F-4});return true;
}
