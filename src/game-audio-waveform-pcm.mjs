import {reportGameAssertion} from './game-assertion.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),f32=Math.fround;
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
function crt(r,name,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-args.length*4-4;put(m,S,returned);if(typeof r.services?.libraryCall!=='function')throw Error(`Waveform PCM requires CRT ${name}.`);return r.services.libraryCall(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function nativeTruncate(m,p,value){m.writeFloatLE(f32(value),p);const bits=get(m,p),exponent=(bits>>23&255)-127,sign=bits>>31;return((((bits|0xff800000)<<8)>>>((31-exponent)&31))^sign)-sign&~(exponent>>31);}

//4a80c0. Equal rates concatenate byte blocks. Unequal rates always allocate
//and concatenate, but the original resampling loop writes only16-bit samples.
//It selects nearest samples with distinct reverse/forward traversal domains.
export function copyGameWaveformPcm(format,blocks,inputBytes,outputBytes,rate,output,runtime){
 const m=runtime.memory,S=runtime.scratchBase;if(!Number.isInteger(S))throw Error('Waveform PCM requires native entry ESP.');put(m,S-4,format);save(runtime,S,[['EBX',-8],['ESI',-12],['EDI',-16]]);const F=S-16;
 rate=ptr(m,S+16);if(rate===ptr(m,format+4)){
  blocks=ptr(m,S+4);let destination=ptr(m,S+20),index=0;if((get(m,blocks+4)-get(m,blocks)>>2)!==0)do{let p=ptr(m,ptr(m,blocks)+index*4);crt(runtime,'memcpy',[destination,ptr(m,p),ptr(m,p+8)],F,0x4a80fe);p=ptr(m,ptr(m,blocks)+index*4);index++;destination=destination+get(m,p+8)|0;}while((index>>>0)<((get(m,blocks+4)-get(m,blocks)>>2)>>>0));return 1;
 }
 save(runtime,F,[['EBP',-4]]);const T=F-4,size=ptr(m,S+8),temporary=crt(runtime,'allocate',[size],T,0x4a812b)>>>0;
 if(!temporary){const args=[0x5d399c,26,0x5d3938,size>>>10];args.forEach((v,i)=>put(m,T-16+i*4,v));put(m,T-20,0x4a814b);if(reportGameAssertion(args[0],args[1],args[2],[args[3]],{...runtime,scratchBase:T-20,entryRegisters:{...runtime.entryRegisters,EBP:size,EBX:temporary,ECX:format}})){const error=Error('Native waveform PCM allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=0x4a8152;throw error;}}
 blocks=ptr(m,S+4);let destination=temporary,index=0;if((get(m,blocks+4)-get(m,blocks)>>2)!==0)do{let p=ptr(m,ptr(m,blocks)+index*4);crt(runtime,'memcpy',[destination,ptr(m,p),ptr(m,p+8)],T,0x4a817e);p=ptr(m,ptr(m,blocks)+index*4);index++;destination=destination+get(m,p+8)|0;}while((index>>>0)<((get(m,blocks+4)-get(m,blocks)>>2)>>>0));
 format=ptr(m,S-4);const sourceRate=ptr(m,format+4),bits=m.readUInt16LE(format+14),bytesPerSample=bits>>>3;put(m,S+4,sourceRate);if(!bytesPerSample)throw RangeError('Native waveform sample width divide by zero.');const targetRate=ptr(m,S+16),samples=Math.trunc(ptr(m,S+12)/bytesPerSample)>>>0;put(m,S+16,samples);const inputSamples=Math.trunc(ptr(m,S+8)/bytesPerSample)>>>0,ratio=f32(f32(sourceRate)/f32(targetRate));
 if(bits===16){
  if(sourceRate<targetRate){const last=f32((inputSamples-1)|0);for(let destinationIndex=(samples-1)|0,ordinal=0;destinationIndex>=0;destinationIndex--,ordinal++){const sample=nativeTruncate(m,S+4,f32(last-f32(f32(ordinal)*ratio))),out=ptr(m,S+20);m.writeUInt16LE(m.readUInt16LE(temporary+sample*2),out+destinationIndex*2);}}
  else for(let i=0;i<(samples|0);i++){const sample=nativeTruncate(m,S+4,f32(f32(i)*ratio)),out=ptr(m,S+20);m.writeUInt16LE(m.readUInt16LE(temporary+sample*2),out+i*2);}
 }
 if(temporary)crt(runtime,'free',[temporary],F,0x4a82e6);return 1;
}
