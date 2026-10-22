import{canAcquireAudioStreamingBlock,acquireAudioStreamingBlock,submitAudioStreamingBlock,isAudioStreamingBufferDrained,getAudioStreamingDuration}from'./audio-streaming-buffer.mjs';
import{readGameWaveDecoderPcm}from'./game-audio-wave-decoder.mjs';
import{readGameMp3DecoderPcm}from'./game-audio-mp3-decoder.mjs';
import{resampleGameAudioStream}from'./game-audio-stream-pcm.mjs';
import{getGameAudioDecoderFormat}from'./game-audio-sample-factory.mjs';
import{isGameAudioSamplePending,isGameAudioSampleStopped}from'./audio-sample-controls.mjs';
import{getApplicationDebugger}from'./application-bootstrap.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),f32=Math.fround;
function save(r,S,rows){for(const[n,o]of rows)if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S+o,r.entryRegisters[n]);}
function call(r,name,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-(args.length-i)*4,args[i]);const S=top-args.length*4-4;put(m,S,returned);return r.services.platformCall(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function virtual(object,slot,args,top,returned,r,capturedTarget){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-(args.length-i)*4,args[i]);const S=top-args.length*4-4;put(m,S,returned);const target=capturedTarget??ptr(m,ptr(m,object)+slot),c={...r,scratchBase:S};
 if(target===0x4afb80)return 0;
 if(target===0x4029b0)return 1;
 if(target===0x4ad570)return isGameAudioSamplePending(object,c);
 if(target===0x4ad510)return isGameAudioSampleStopped(object,args[0],c);
 if(target===0x4b3ac0)return canAcquireAudioStreamingBlock(object,c);
 if(target===0x4b3ae0)return acquireAudioStreamingBlock(object,args[0],args[1],c);
 if(target===0x4b3bb0)return submitAudioStreamingBlock(object,args[0],c);
 if(target===0x4b3c50)return isAudioStreamingBufferDrained(object,c);
 if(target===0x4b3dd0)return getAudioStreamingDuration(object,args[0],c);
 if(target===0x4b4a00)return readGameWaveDecoderPcm(object,args[0],args[1],c);
 if(target===0x4b5ae0)return readGameMp3DecoderPcm(object,args[0],args[1],c);
 throw Error('Unported audio polling virtual0x'+target.toString(16));
}
//4aefc0: native entryESP, live decoder/stream/owner and optional spectrum ring.
export function pollGameAudioStream(decoder,runtime){
 const{memory:m,scratchBase:S}=runtime,F=((S-4)&~7)-64;
 save(runtime,S,[['EBP',-4]]);save(runtime,F,[['EBX',12],['ESI',4],['EDI',0]]);put(m,F+8,S-4);
 const lock=decoder+0x44;let ebx=lock,esi=runtime.entryRegisters?.ESI,ebp=S-4;
 const context=()=>({...runtime,entryRegisters:{...runtime.entryRegisters,EBX:ebx,ESI:esi,EBP:ebp,EDI:decoder}});
 put(m,F+52,lock);const acquired=call(runtime,'TryEnterCriticalSection',[lock],F,0x4aefdd);
 if(!acquired)return 1;
 const thread=call(runtime,'GetCurrentThreadId',[],F,0x4aefec);put(m,lock+24,get(m,lock+24)+1);put(m,lock+28,thread);
 const invoke=(object,slot,args,returned,captured)=>virtual(object,slot,args,F,returned,context(),captured);
 const format=returned=>{put(m,F-4,returned);return getGameAudioDecoderFormat(decoder,{...context(),scratchBase:F-4});};
 const debug=(returned,ecx)=>{put(m,F-4,returned);return getApplicationDebugger({...context(),scratchBase:F-4,nativeDebuggerFrame:'direct',entryRegisters:{...context().entryRegisters,ECX:ecx}});};
 const duration=(output,returned,converted)=>{const p=invoke(ptr(m,decoder+12),0x2c,[output],returned);put(m,F-4,converted);return Number(m.readBigInt64LE(p))/m.readDoubleLE(0x5dc9d8);};
 if(ptr(m,decoder+12)&&m[decoder+0x68]===1){
  if(!invoke(decoder,0x14,[],0x4af019)&&m[decoder+0x69]===0&&invoke(ptr(m,decoder+8),0x3c,[],0x4af02c)===1){
   const time=duration(F+40,0x4af03d,0x4af047);
   if(m.readDoubleLE(0x5dc7b8)>time){debug(0x4af062,ptr(m,F+40));invoke(ptr(m,decoder+12),0x2c,[F+40],0x4af06f);}
  }
  let repeat;
  do{
   ebx=(ebx??0)&~255;repeat=0;
   if(m[decoder+0x69]===0&&invoke(ptr(m,decoder+12),4,[],0x4af085)===1&&invoke(ptr(m,decoder+12),8,[F+24,F+28],0x4af0a1)){
    const resampling=ptr(m,decoder+0x98),target=ptr(m,ptr(m,decoder)+0x18);
    if(resampling){const read=invoke(decoder,0x18,[resampling,ptr(m,decoder+0x9c)],0x4af0c1,target);put(m,decoder+0xa0,read);put(m,F-4,ptr(m,F+28));put(m,F-8,ptr(m,F+24));put(m,F-12,0x4af0d6);ebx=resampleGameAudioStream(decoder,ptr(m,F-8),ptr(m,F-4),{...context(),scratchBase:F-12});}
    else ebx=invoke(decoder,0x18,[ptr(m,F+24),ptr(m,F+28)],0x4af0eb,target);
    put(m,F+36,ebx);
    if(ebx){const stopped=invoke(ptr(m,decoder+8),0x44,[1],0x4af101);repeat=stopped&&invoke(decoder,0x14,[],0x4af10e)?0:1;}
    m[F+23]=repeat;
    if(ebx&&ptr(m,decoder+0x18)){
     const fmt=format(0x4af137),channels=m.readUInt16LE(fmt+2);put(m,F+32,channels);
     const normalization=f32(m.readFloatLE(0x5dc774)/f32(channels*m.readFloatLE(0x5dcaa8)));m.writeFloatLE(normalization,F+40);
     const second=format(0x4af178),alignment=m.readUInt16LE(second+12);if(!alignment)throw RangeError('Native audio spectrum divides by zero alignment.');
     esi=ptr(m,F+24);const frames=Math.floor((ebx>>>0)/alignment),ring=ptr(m,decoder+0x18);ebp=frames;ebx=ring+ptr(m,decoder+0x14)*4;const end=ring+ptr(m,decoder+0x10)*4;
     while(ebp){let value=0;for(let channel=0;channel<ptr(m,F+32);channel++){value=f32(value+m.readInt16LE(esi));esi+=2;}m.writeFloatLE(f32(value*m.readFloatLE(F+40)),ebx);ebx+=4;if(ebx===end)ebx=ptr(m,decoder+0x18);ebp--;}
     const third=format(0x4af1e4);ebx=ptr(m,F+36);const size=m.readUInt16LE(third+12),capacity=get(m,decoder+0x10);if(!size||!capacity)throw RangeError('Native audio spectrum remainder divides by zero.');const count=(Math.floor((ebx>>>0)/size)+ptr(m,decoder+0x14))|0;put(m,decoder+0x14,count%capacity);
    }
    invoke(ptr(m,decoder+12),12,[ebx],0x4af205);ebx=(ebx&~255)|m[F+23];repeat=m[F+23];
   }
   if(m[decoder+0x69]===1)m[decoder+0x6b]=invoke(ptr(m,decoder+12),0x20,[],0x4af219)&255;
   if(m[decoder+0x69]===0){const time=duration(F+56,0x4af22f,0x4af239);repeat=Number(m.readDoubleLE(0x5dc7e0)>time&&(ebx&255)===1);}else repeat=0;
  }while(repeat===1);
  ebx=ptr(m,F+52);
 }
 const depth=get(m,ebx+24)-1|0;put(m,ebx+24,depth);if(!depth)put(m,ebx+28,0);call(runtime,'LeaveCriticalSection',[ebx],F,0x4af26f);return 1;
}
