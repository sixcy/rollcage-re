import {copyGameWaveformPcm} from './game-audio-waveform-pcm.mjs';
import {openGameAudioFile} from './game-audio-file-paths.mjs';
import {queueGameAudioFileWrite,writeGameAudioFile} from './game-audio-file-write.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
import {reportGameAssertion} from './game-assertion.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),f32=Math.fround;
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
function call(r,kind,name,args,top,ret){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const S=top-args.length*4-4;put(m,S,ret);return r.services[kind](name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
const crt=(r,n,a,t,ret)=>call(r,'libraryCall',n,a,t,ret),os=(r,n,a,t,ret)=>call(r,'platformCall',n,a,t,ret);
function debuggerAt(r,S,ret,registers){put(r.memory,S,ret);return getApplicationDebugger({...r,scratchBase:S,nativeDebuggerFrame:'wrapper',entryRegisters:{...r.entryRegisters,...registers},handlers:{...r.handlers,allocate:r.handlers?.allocate??(n=>r.services.libraryCall('operatorNew',[n],r)),free:r.handlers?.free??(p=>r.services.libraryCall('operatorDelete',[p],r)),registerExit:r.handlers?.registerExit??(p=>r.services.libraryCall('registerExit',[p],r))}});}
//Original bit-level float ceiling at4b1bef..4b1c51, retaining both temporary
//float/bit stores and the native32-bit wrap rather than JS Math.ceil.
function ceilBytes(m,slot,floatSlot,value){m.writeFloatLE(value,slot);const bits=get(m,slot),exponent=(bits>>23&255)-127,sign=bits>>31;put(m,slot,(bits|0xff800000)<<8);m.writeFloatLE(value,floatSlot);const shifted=ptr(m,slot)>>>((31-exponent)&31);put(m,slot,shifted);let result=((((shifted^sign)-sign)&~(exponent>>31))-(bits>>>31))|0;put(m,slot,result);if(f32(result)!==value){result=result+1|0;put(m,slot,result);}return result;}

//4b19a0 implements the game backend's waveform storage/export policy. The
//backend ECX is unused; actual waveform/blocks/output-path are stack inputs.
export function populateGameAudioWaveform(waveform,blocks,outputPath,runtime){
 const m=runtime.memory,S=runtime.scratchBase,F=S-64;if(!Number.isInteger(S))throw Error('Waveform data requires native entry ESP.');put(m,S-4,-1);put(m,S-8,0x56a958);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);save(runtime,S,[['ESI',-60],['EDI',-64]]);blocks=ptr(m,S+8);let total=0;put(m,F+48,0);const count=(get(m,blocks+4)-get(m,blocks))>>2;if(count){const begin=ptr(m,blocks);for(let i=0;(i>>>0)<(count>>>0);i++)total=total+get(m,ptr(m,begin+i*4)+8)|0;put(m,F+48,total);}
 outputPath=ptr(m,S+12);
 if(outputPath){
  const record=F+8;put(m,record,-1);put(m,record+8,0);put(m,record+12,0);put(m,F-4,outputPath);put(m,F+60,0);m[record+4]=0;put(m,record+32,0);m.fill(0,record+16,record+32);put(m,F-8,0);put(m,F-12,record);put(m,F-16,0x4b1a3b);const common={...runtime,entryRegisters:{...runtime.entryRegisters,ESI:count,EDI:blocks}};openGameAudioFile(outputPath,2,record,0,{...common,scratchBase:F-16});
  if(get(m,record)!==-1){
   waveform=ptr(m,S+4);const format=waveform+8;
   if(m[record+4]){put(m,F-4,18);put(m,F-8,format);put(m,F-12,0x4b1a69);const accepted=queueGameAudioFileWrite(record,format,18,{...runtime,scratchBase:F-12,entryRegisters:{...runtime.entryRegisters,ESI:ptr(m,0x56e0e4),EDI:blocks}});if(accepted&&ptr(m,record+8)&&ptr(m,record+12)!==ptr(m,record+8)){const ok=os(runtime,'GetOverlappedResult',[ptr(m,record),record+16,record+12,1],F,0x4b1a91);if(ok||os(runtime,'GetLastError',[],F,0x4b1a97)!==0x3e4){const done=ptr(m,record+12);if(ptr(m,record+8)===done){const sum=ptr(m,record+24)+done;put(m,record+24,sum);put(m,record+28,get(m,record+28)+(sum>0xffffffff?1:0));}}}}
   else{put(m,F+72,0);if(!os(runtime,'WriteFile',[ptr(m,record),format,18,F+72,0],F,0x4b1acf))debuggerAt(runtime,F-4,0x4b1ad8,{ESI:ptr(m,0x56e0e4),EDI:blocks,ECX:F+72});}
   let i=0;if((get(m,blocks+4)-get(m,blocks)>>2)!==0)do{const block=ptr(m,ptr(m,blocks)+i*4);put(m,F-4,ptr(m,block+8));put(m,F-8,ptr(m,block));put(m,F-12,0x4b1b01);writeGameAudioFile(record,ptr(m,block),ptr(m,block+8),{...runtime,scratchBase:F-12,entryRegisters:{...runtime.entryRegisters,ESI:i,EDI:blocks}});i++;}while((i>>>0)<((get(m,blocks+4)-get(m,blocks)>>2)>>>0));
  }
  put(m,F+60,-1);if(ptr(m,record+8)&&ptr(m,record+12)!==ptr(m,record+8)){if(!os(runtime,'GetOverlappedResult',[ptr(m,record),record+16,record+12,0],F,0x4b1b42)&&os(runtime,'GetLastError',[],F,0x4b1b48)===0x3e4)os(runtime,'CancelIo',[ptr(m,record)],F,0x4b1b59);}os(runtime,'CloseHandle',[ptr(m,record)],F,0x4b1b63);return 1;
 }
 waveform=ptr(m,S+4);put(m,S+8,total);const sourceRate=ptr(m,waveform+12),rate=Math.max(1000,Math.min(200000,sourceRate));put(m,S+4,rate);
 if(rate!==sourceRate){const ratio=f32(f32(rate)/f32(sourceRate)),scaled=f32(ratio*f32(total));ceilBytes(m,S+8,S+12,scaled);}
 const old=ptr(m,waveform+0x424);if(old){crt(runtime,'free',[old],F,0x4b1c66);put(m,waveform+0x424,0);}m.fill(0,waveform+0x41c,waveform+0x43c);put(m,waveform+0x43c,0);const bytes=ptr(m,S+8),pcm=crt(runtime,'allocate',[bytes],F,0x4b1c9a)>>>0;put(m,S+12,pcm);
 if(!pcm){const args=[0x5d399c,26,0x5d3938,bytes>>>10];args.forEach((v,i)=>put(m,F-16+i*4,v));put(m,F-20,0x4b1cc0);if(reportGameAssertion(args[0],args[1],args[2],[args[3]],{...runtime,scratchBase:F-20,sehWord:S-12,entryRegisters:{...runtime.entryRegisters,ESI:waveform,EDI:blocks,ECX:bytes>>>10}})){const error=Error('Native waveform allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=0x4b1cc7;throw error;}}
 const livePcm=ptr(m,S+12),liveBytes=ptr(m,S+8);put(m,waveform+0x424,livePcm);put(m,waveform+0x41c,64);put(m,waveform+0x420,liveBytes);put(m,waveform+0x43c,waveform);
 if(liveBytes){const args=[blocks,ptr(m,F+48),liveBytes,ptr(m,S+4),livePcm];args.forEach((v,i)=>put(m,F-20+i*4,v));put(m,F-24,0x4b1d03);copyGameWaveformPcm(waveform+8,...args,{...runtime,scratchBase:F-24,sehWord:S-12,entryRegisters:{...runtime.entryRegisters,ESI:waveform,EDI:blocks}});}
 const finalRate=ptr(m,S+4);put(m,waveform+12,finalRate);put(m,waveform+16,Math.imul(m.readUInt16LE(waveform+20),finalRate));return 1;
}
