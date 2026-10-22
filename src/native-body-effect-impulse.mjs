//47b020 optional original-stack path. The source addresses in CALL slots are
//observable by later4749e0 terrain queries sharing this stack allocation.
import {abs32,multiplyQ16,divideQ16} from './fixed-integer.mjs';
import {rawVectorLength} from './raw-vector-normalization.mjs';
import {applyNativeActiveVehicleEffect,requireEffectEntryRegisters} from './native-active-vehicle-effect.mjs';
import {assertNativeMemorySpan,nativeCodeAddress} from './native-memory-spans.mjs';
const get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const clamp=v=>Math.max(-0x1800,Math.min(0x1800,v));
function nearest(value){const lo=Math.floor(value),f=value-lo,r=f<.5?lo:f>.5?lo+1:lo%2?lo+1:lo;return Number.isFinite(r)&&r>=-2147483648&&r<=2147483647?r:-2147483648;}
//4343e0, including its three float/int locals and masked-invalid FISTP.
function normalize(direction,entry,runtime){
 const{memory:m}=runtime,Q=entry-12;
 if(runtime.roundingMode!=='nearest-even')throw Error('Native radial effect requires explicit nearest-even PC24 arithmetic.');
 const lanes=[];
 for(const[offset,local]of[[0,8],[4,4],[8,0]]){put(m,Q,get(m,direction+offset)<<8);const value=Math.fround(get(m,Q));m.writeFloatLE(value,Q+local);lanes.push(value);}
 const sq=lanes.map(v=>Math.fround(v*v)),length=Math.fround(Math.sqrt(Math.fround(Math.fround(sq[1]+sq[0])+sq[2]))),inverse=Math.fround(m.readFloatLE(0x5dc774)/length),scale=m.readFloatLE(0x5dca88);
 for(let lane=0;lane<3;lane++){const value=Math.fround(Math.fround(lanes[lane]*scale)*inverse);m.writeFloatLE(value,Q+8);put(m,Q+4,nearest(value));put(m,direction+lane*4,get(m,Q+4));}
}
function reduce(vector,entry,regs,m){
 put(m,entry-4,regs.esi);put(m,entry-8,regs.edi);
 let sum=(abs32(get(m,vector))+abs32(get(m,vector+8))+abs32(get(m,vector+4)))|0;if(sum<0)sum=-sum|0;
 const leading=Math.clz32(sum);put(m,0x91d45c,sum);put(m,0x91d460,leading);
 if(leading<9)for(const offset of[0,4,8])put(m,vector+offset,get(m,vector+offset)>>(9-leading));
 else if(abs32([0,4,8].reduce((sum,offset)=>(sum+Math.imul(get(m,vector+offset)>>18,get(m,vector+offset)>>18))|0,0))<1)put(m,vector+8,get(m,vector+8)-0x20000);
}
function length(vector,entry,regs,runtime){
 const{memory:m}=runtime,F=entry-24;
 for(const[name,offset]of[['ebx',12],['ebp',8],['esi',4],['edi',0]])put(m,F+offset,regs[name]);
 const squares=[];for(const offset of[0,4,8]){const value=get(m,vector+offset);put(m,F+16,value);put(m,F+20,value);squares.push(multiplyQ16(value,value));}
 const overflow=!!(squares.reduce((a,b)=>a|b,0)&0xe0000000);if(overflow)for(let i=0;i<3;i++)squares[i]>>>=2;
 put(m,F-4,nativeCodeAddress(0x41ca4b,runtime));
 for(const[offset,value]of[[-8,squares[1]],[-12,overflow?1:0],[-16,vector],[-20,squares[0]]])put(m,F+offset,value);
 return rawVectorLength(vector,runtime);
}
function fixedNormalize(vector,length,entry,regs,runtime){
 const{memory:m}=runtime;
 put(m,entry-12,regs.esi);put(m,entry-16,nativeCodeAddress(0x492d20,runtime));put(m,entry-28,regs.ebx);put(m,entry-20,length);put(m,entry-24,65536);
 put(m,entry-8,divideQ16(65536,length));
 for(const offset of[0,4,8]){put(m,entry-4,get(m,vector+offset));put(m,vector+offset,multiplyQ16(get(m,entry-4),get(m,entry-8)));}
}
export function applyNativeBodyEffectImpulse(body,runtime){
 const{memory:m,scratchBase:B}=runtime,incoming=requireEffectEntryRegisters(runtime),F=B-52;
 assertNativeMemorySpan(m,F-200,256);
 if(!m.readUInt32LE(B))throw Error('Native body effect requires its actual caller return.');
 if(runtime.nativeStack.onEnter){const entryRegisters=Object.freeze(Object.fromEntries(['ebx','ebp','esi','edi'].map(name=>[name,incoming[name]>>>0])));runtime.nativeStack.onEnter(Object.freeze({bodyAddress:body,bodyHeaderHex:m.subarray(body,body+0x180).toString('hex'),originQ16:Object.freeze([0,4,8].map(o=>get(m,0x91cd80+o))),strength:get(m,0x91cd8c),entryEsp:B,entryRegisters,returnAddress:m.readUInt32LE(B)}));}
 for(const[name,offset]of[['ebx',12],['ebp',8],['esi',4],['edi',0]])put(m,F+offset,incoming[name]);
 for(let lane=0;lane<3;lane++)put(m,F+0x1c+lane*4,get(m,body+0x34+lane*4)-get(m,0x91cd80+lane*4));
 const reduced=[0,4,8].map(o=>get(m,F+0x1c+o)>>18),squared=reduced.reduce((sum,v)=>(sum+Math.imul(v,v))|0,0);
 if(squared>65536)return;
 const divisor=Math.max(squared,256),dir=reduced.map(v=>Math.trunc((v<<16)/divisor)|0);put(m,F+0x14,dir[1]);put(m,F+0x18,dir[2]);
 if(dir.reduce((sum,v)=>(sum+abs32(v))|0,0)<32)return;
 const strength=get(m,0x91cd8c),impulse=dir.map(v=>clamp(Math.imul(strength>>2,v))),type=get(m,body)&0x1ff,regs={ebx:impulse[0],ebp:impulse[1],esi:body,edi:impulse[2]};
 if(type===3){
  const state=m.readUInt32LE(body+0x6bc);
  if(state!==0xffffffff&&m[state]){
   const D=F+0x28;impulse.forEach((v,i)=>put(m,D+i*4,v));put(m,F-4,nativeCodeAddress(0x47b149,runtime));normalize(D,F-4,runtime);
   for(const o of[0,4,8])put(m,D+o,get(m,D+o)>>4);
   put(m,F-4,0x70);put(m,F-8,nativeCodeAddress(0x47b161,runtime));
   return applyNativeActiveVehicleEffect(body,D,0x70,{...runtime,scratchBase:F-8,nativeStack:{entryRegisters:regs}});
  }
  const cooldown=Math.min(Math.imul(strength,8),255);
  if(cooldown>m[body+0x66f]){
   m[body+0x66f]=cooldown&255;for(const o of[0,4,8])put(m,body+0x680+o,get(m,F+0x1c+o));
   put(m,F-4,nativeCodeAddress(0x47b1b7,runtime));reduce(body+0x680,F-4,regs,m);
   put(m,F-4,nativeCodeAddress(0x47b1c2,runtime));const size=length(body+0x680,F-4,regs,runtime);
   if(size<64){const xy=m.readBigUInt64LE(body+0x674),z=get(m,body+0x67c);m.writeBigUInt64LE(xy,body+0x680);put(m,body+0x688,z);}
   else{put(m,F-4,nativeCodeAddress(0x47b1f2,runtime));fixedNormalize(body+0x680,size,F-4,regs,runtime);}
  }
  m.writeUInt16LE(16,body+0x6b8);m.writeUInt16LE(impulse.reduce((s,v)=>(s+abs32(v))|0,0)&65535,body+0x6ba);
 }else if(type===7||type===12)for(let i=0;i<3;i++)impulse[i]>>=1;
 for(const[offset,lane,shift]of[[0x80,0,7],[0x74,0,8],[0x78,1,8],[0x7c,2,8],[0x84,1,7],[0x88,2,7]])put(m,body+offset,get(m,body+offset)+(impulse[lane]<<shift));
 put(m,body+0x110,get(m,body+0x110)&0x7fffffff);
}
