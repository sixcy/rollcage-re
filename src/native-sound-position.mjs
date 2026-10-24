//40d6d0 shared stack, retained158,
//ev_68fba529256ab88118f853edaded1d3d80b34bbf2f1de7a54480c1878785a3f8.
import {assertNativeMemorySpan,nativeCodeAddress} from './native-memory-spans.mjs';
import {setGameAudioSamplePosition,setGameAudioSampleVelocity} from './audio-sample-controls.mjs';

const scalar=new DataView(new ArrayBuffer(4));
const bits=value=>{scalar.setFloat32(0,value,true);return scalar.getUint32(0,true);};
const number=value=>{scalar.setUint32(0,value,true);return scalar.getFloat32(0,true);};
const nan=value=>(value&0x7f800000)===0x7f800000&&(value&0x7fffff)!==0;
const quiet=value=>(value|0x400000)>>>0;
//Masked scalar SSE chooses a quieted destination NaN before its source NaN.
//An invalid finite/infinite operation produces the x86 indefinite quiet NaN.
const operation=(left,right,add=false)=>{
  if(nan(left))return quiet(left);if(nan(right))return quiet(right);
  const value=Math.fround(add?number(left)+number(right):number(left)*number(right));
  return Number.isNaN(value)?0xffc00000:bits(value);
};
const put=(m,p,v)=>m.writeUInt32LE(v>>>0,p);
const uint=(value,label)=>{if(!Number.isInteger(value)||value< -0x80000000||value>0xffffffff)throw Error(`Native sound position requires explicit x86 ${label}.`);return value>>>0;};

//Only masked nearest-even SSE with DAZ/FTZ disabled is implemented. x87 is
//unused. Unknown floating-point modes fail before any source state changes.
export function updateNativeSoundChannelPositionOnStack(channel,runtime){
  const {memory:m,scratchBase:S,entryRegisters:incoming,numericalContext}=runtime,sse=numericalContext?.sse;
  if(!sse||!Number.isInteger(sse.mxcsr)||sse.mxcsr<0||sse.mxcsr>0xffff||(sse.mxcsr&0xe040)!==0||((sse.mxcsr>>>7)&63)!==63
    ||sse.roundingMode!=='nearest-even'||sse.exceptionMask!==63||sse.flushToZero||sse.denormalsAreZero)throw Error('Native sound position requires captured masked nearest-even SSE without DAZ/FTZ.');
  channel=uint(channel,'channel');uint(S,'entry ESP');
  const ebp=uint(incoming?.EBP,'incoming EBP'),esi=uint(incoming?.ESI,'incoming ESI');
  if(S<40||(S&3))throw Error('Native sound position requires a bounded DWORD-aligned entry ESP.');
  const G=Math.floor((S-4)/8)*8-24,actual=p=>nativeCodeAddress(p,runtime);
  const admit=(address,length,label,comparison='read-only')=>{assertNativeMemorySpan(m,address,length);runtime.onSoundSourceRead?.({address,length,label,comparison});};
  const read=(address,label)=>{admit(address,4,label);return m.readUInt32LE(address);};
  const constant=p=>read(actual(p),'position-scalar-literal');
  const sourcePointer=()=>read(channel,'position-wrapper-source');
  const targetFor=(source,method)=>read(read(source,'position-source-vtable')+method,'position-source-method');
  const call=(source,method,target,returned)=>{
    put(m,G-8,actual(returned));
    if(target!==actual(method===8?0x4ad730:0x4ad700))throw Error(`Native sound position source virtual${method.toString(16)} target0x${target.toString(16)} is not reconstructed.`);
    admit(source+(method===8?0x8f8:0x908),16,method===8?'sample-position':'sample-velocity','mutable');
    const child={...runtime,scratchBase:G-8,entryRegisters:{...incoming,EBP:S-4,ESI:channel}};
    (method===8?setGameAudioSamplePosition:setGameAudioSampleVelocity)(source,G+8,child);
  };
  admit(S-4,4,'position-saved-ebp','mutable');put(m,S-4,ebp);
  admit(G,24,'position-frame','mutable');put(m,G,esi);
  let pointer=read(channel+4,'position-wrapper-position');
  if(pointer){
    //40d6e3/eb/f0 capture all three signed integers before any local stores.
    const x=m.readInt32LE(pointer),y=m.readInt32LE(pointer+4),z=m.readInt32LE(pointer+8),source=sourcePointer();
    admit(pointer,12,'position-input');
    let xBits=bits(x);put(m,G+20,0);put(m,G-4,G+8);
    const yBits=bits(y);xBits=operation(xBits,constant(0x5ecdb4));
    const scaledY=operation(yBits,constant(0x5dc5b8)),zBits=bits(z);
    put(m,G+8,xBits);
    //The Z scale is reloaded after the X local store, preserving real aliases.
    const scaledZ=operation(zBits,constant(0x5dc5b8));
    put(m,G+12,scaledY);put(m,G+16,scaledZ);
    call(source,8,targetFor(source,8),0x40d738);
  }
  pointer=read(channel+8,'position-wrapper-velocity');
  if(pointer){
    const x=m.readInt32LE(pointer),y=m.readInt32LE(pointer+4),z=m.readInt32LE(pointer+8);
    admit(pointer,12,'velocity-input');
    let xBits=operation(bits(x),constant(0x5ecdb0)),yBits=operation(bits(y),constant(0x5dc5d0));
    let zBits=operation(bits(z),constant(0x5dc5d0));
    const squared=operation(operation(operation(yBits,yBits),operation(xBits,xBits),true),operation(zBits,zBits),true);
    const threshold=number(constant(0x5dc5e8));
    //COMISS/JBE preserves velocity for equality and unordered comparisons.
    if(threshold>number(squared))xBits=yBits=zBits=0;
    const source=sourcePointer();put(m,G+8,xBits);put(m,G+12,yBits);put(m,G+16,zBits);put(m,G+20,0);
    const target=targetFor(source,12);put(m,G-4,G+8);call(source,12,target,0x40d7cb);
  }
  //POP ESI; MOV ESP,EBP; POP EBP; RET do not clear any carried stack bytes.
}
