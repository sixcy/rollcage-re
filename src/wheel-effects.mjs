import {nativeGlobalAddress} from './native-global-address.mjs';
import {abs32,lookupSqrt,dotQ16,crossQ16,multiplyQ16,divideQ16,vectorLengthQ16,transformShortQ12} from './fixed-integer.mjs';
import {allocateRawEffectParticle,registerRawEffectSpatial} from './body-retirement-effects.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p),short=v=>(v<<16)>>16;
const vector=(m,p)=>[0,4,8].map(o=>get(m,p+o)),store=(m,p,v)=>v.forEach((x,i)=>put(m,p+i*4,x));
const rng=seed=>Math.imul(seed,0x41a7)&0x7fffffff;
const qwordCopy=(m,source,target)=>m.writeBigUInt64LE(m.readBigUInt64LE(source),target);
export function initializeWheelEffectTables(memory){Buffer.from('00008039','hex').copy(memory,0x5dc5f4);Buffer.from('00008040','hex').copy(memory,0x5dc97c);return memory;}

//484020. A signed-short vector length saturates at48 before the table root.
export function measureSkidSegment(vector16){
 const values=vector16.map(short);if(values.some(value=>Math.abs(value)>48))return 48;
 const squared=values.reduce((sum,value)=>(sum+Math.imul(value,value))|0,0);return squared>2304?48:lookupSqrt(squared);
}

//483e60. Compare projected position and old/current slip directions.
export function shouldAdvanceWheelSkid(wheel,{memory}){
 const body=ptr(memory,0x909300+memory[wheel+0x9c]*0x30c);
 for(let i=0;i<3;i++){const projected=((get(memory,body+0x34+i*4)+get(memory,wheel+0x1c+i*4)+get(memory,body+0x68+i*4))|0)>>16;if(abs32((projected-memory.readInt16LE(wheel+0xa0+i*2))|0)>160)return 1;}
 return dotQ16(vector(memory,wheel+0x40),vector(memory,wheel+0xac))<60000?1:0;
}

//483d10. Update quantized skid endpoint and packed5-bit cross components.
export function updateWheelSkidEndpoint(wheel,{memory,scratchBase}){
 const body=ptr(memory,0x909300+memory[wheel+0x9c]*0x30c),slip=vector(memory,wheel+0x40);
 const projected=vector(memory,body+0x34).map((value,i)=>(value+get(memory,wheel+0x1c+i*4)+get(memory,body+0x68+i*4)+(slip[i]<<2))|0);
 const direction=vector(memory,wheel+0x10),length=vectorLengthQ16(direction);let components=[0,0,0];
 if(length>=1024){const scale=divideQ16(65536,length);components=crossQ16(direction.map(value=>multiplyQ16(value,scale)),vector(memory,wheel+0x40)).map(value=>(value>>13)&65535);}
 word(memory,wheel+0xa4,(projected[2]>>16)-components[2]);
 for(let i=0;i<3;i++)put(memory,wheel+0xac+i*4,get(memory,wheel+0x40+i*4));
 word(memory,wheel+0xa0,(projected[0]>>16)-components[0]);word(memory,wheel+0xa2,(projected[1]>>16)-components[1]);
 const flags=((((components[2]&31)|32)<<5)|(components[1]&31))<<5|(components[0]&31)|(get(memory,wheel+0xa8)&0xffff8000);put(memory,wheel+0xa8,flags);
}

//483f10. Merge nearly collinear adjacent segments under the native length cap.
export function mergeWheelSkidSegment(wheel,previous,{memory}){
 if((previous|0)===-1)return 0;
 const delta=p=>[0,2,4].map(offset=>short(memory.readUInt16LE(p+12+offset)-memory.readUInt16LE(p+offset)));
 const first=delta(previous),firstLength=measureSkidSegment(first);if(firstLength>=48)return 0;
 const current=ptr(memory,wheel+0xb8),second=delta(current),secondLength=measureSkidSegment(second);
 const dot=first.reduce((sum,value,i)=>(sum+Math.imul(value,second[i]))|0,0),threshold=Math.imul(Math.imul(secondLength,firstLength),255)>>8;
 if(firstLength+secondLength>=48||dot<=threshold)return 0;
 qwordCopy(memory,current+12,previous+12);put(memory,previous+20,get(memory,current+20));word(memory,previous+26,1);put(memory,wheel+0xb8,previous);return 1;
}

//483c80. Write one292-byte ring record, then reuse an eligible prior segment.
export function appendWheelSkidSegment(wheel,previous,{memory,scratchBase}){
 const record=ptr(memory,0x8495d0);word(memory,record+24,memory[wheel+0x9e]===0?1:0);word(memory,record+26,1);qwordCopy(memory,wheel+0xa0,record);put(memory,record+8,get(memory,wheel+0xa8));
 updateWheelSkidEndpoint(wheel,{memory,scratchBase:scratchBase-16});qwordCopy(memory,wheel+0xa0,record+12);put(memory,record+20,get(memory,wheel+0xa8));put(memory,wheel+0xb8,record);
 if(!mergeWheelSkidSegment(wheel,previous,{memory})){const next=(ptr(memory,0x8495d0)+0x124)>>>0;put(memory,0x8495d0,next>=ptr(memory,0x8495d8)?ptr(memory,0x8495d4):next);}
}

//483b90. The disabled setting still updates effectSpeed but preserves skid state.
export function updateWheelTractionEffects(wheel,strength,surface,{memory,scratchBase}){
 const previous=get(memory,wheel+0xb8);put(memory,wheel+0xc4,strength>0x40000&&(surface>>>0)<=2?strength:0);
 if(memory[ptr(memory,0x5ecefc)+0x2c]===0)return;
 const flags=get(memory,wheel+0xa8),active=!!(flags&0x8000),needed=strength>(active?0xe0000:0x1b0000)&&(surface>>>0)<=2&&abs32(get(memory,wheel+0x58))<0x160000;
 put(memory,wheel+0xb8,-1);
 if(needed){
  if(active&&!shouldAdvanceWheelSkid(wheel,{memory})){if(previous!==-1)word(memory,(previous>>>0)+26,0);appendWheelSkidSegment(wheel,previous,{memory,scratchBase:scratchBase-24});memory[wheel+0x9e]=1;return;}
  updateWheelSkidEndpoint(wheel,{memory,scratchBase:scratchBase-24});memory[wheel+0x9e]=0;return;
 }
 memory[wheel+0x9e]=0;put(memory,wheel+0xa8,flags&0xffff7fff);
}

//4365a0. Unsigned elapsed time and reduced-distance gate; records may alias input.
export function permitWheelEmission(position,effectRecord,{memory,scratchBase}){
 if(!effectRecord)return 1;
 const relative=vector(memory,position).map((value,i)=>((value-get(memory,effectRecord+16+i*4))|0)>>9);let clock;
 if(get(memory,effectRecord)!==1){clock=get(memory,0x90a548);if(((clock-get(memory,effectRecord+12))>>>0)<=ptr(memory,effectRecord+8)){
  if(vectorLengthQ16(relative)<=get(memory,effectRecord+4))return 0;clock=get(memory,0x90a548);
 }}else clock=get(memory,0x90a548);
 const xy=memory.readBigUInt64LE(position),z=get(memory,position+8);memory.writeBigUInt64LE(xy,effectRecord+16);put(memory,effectRecord,0);put(memory,effectRecord+12,clock);put(memory,effectRecord+24,z);return 1;
}

const brightnessFactor=memory=>Math.max(0,(256-(Math.imul((256-get(memory,0x5ed2b8))|0,get(memory,0x5ed2c0))>>8))|0);
//475bc0. Low32 color products, retaining the original alpha and bit mixing.
export function shadeWheelDebrisColor(color,{memory}){
 const scale=brightnessFactor(memory),r=Math.imul((color>>>16)&255,scale),g=Math.imul((color>>>8)&255,scale),b=Math.imul(color&255,scale);
 return((((r&0xffffff00)<<8)|g|(color&0xff0000ff))&0xffffff00)|(b>>>8);
}

//436630. The fourth native stack argument is the gate's28-byte effect record.
export function emitWheelRearParticle(body,position,direction,color,intensity,effectRecord,{memory,scratchBase}){
 if((intensity>>>0)<3||!permitWheelEmission(position,effectRecord,{memory,scratchBase:scratchBase-48}))return 0;
 if((intensity|0)===-1)intensity=32;
 const opacity=Math.imul(brightnessFactor(memory),intensity)>>>8,p=allocateRawEffectParticle({memory});word(memory,p+0x96,32);word(memory,p+0xa2,0);put(memory,p,8);memory[p+0x95]=24;
 let velocity=vector(memory,body+0x68).map(value=>value>>8);
 if(get(memory,nativeGlobalAddress(memory,0x811180))!==0&&body!==ptr(memory,nativeGlobalAddress(memory,0x811184)))velocity=velocity.map(value=>multiplyQ16(value,get(memory,nativeGlobalAddress(memory,0x81118c))));
 const translated=vector(memory,position).map((value,i)=>(value+(velocity[i]<<8))|0);store(memory,p+0x88,translated);
 for(let i=0;i<3;i++){const product=Math.imul(velocity[i],3);word(memory,p+0x9c+i*2,((product+((product>>31)&3))>>2)+(get(memory,direction+i*4)>>9));}
 const seed=rng(get(memory,0x5ec958));put(memory,0x5ec958,seed);put(memory,p+0xb4,(seed>>>16)&3);put(memory,p+0x98,(Math.min(255,Math.imul(opacity,6)>>>0)<<24)|color);
 registerRawEffectSpatial(p,...translated,{memory});const frame=memory[0x919006],value=get(memory,0x919004);put(memory,p+0xa4,value);memory[p+0x94]=1;memory[0x919006]=frame+1<12?frame+1:0;return p;
}

//4334b0. The native input/output globals are observable renderer scratch.
export function transformWheelEffectOffset({memory}){
 const matrix=Array.from({length:9},(_,i)=>memory.readInt16LE(0x91d360+i*2)),input=[0,2,4].map(o=>memory.readInt16LE(0x91d3e4+o));store(memory,0x91d448,transformShortQ12(matrix,input));
}

//475c30. Surface debris shares the real free/active/spatial producer storage.
export function emitWheelSurfaceDebris(position,velocity,kind,{memory}){
 let first,second,lifetime,variant=0;
 if(kind===17){first=shadeWheelDebrisColor(0x1818,{memory});second=shadeWheelDebrisColor(0xae000000,{memory});lifetime=8;}
 else if(kind===18){first=shadeWheelDebrisColor(0x102410,{memory});second=shadeWheelDebrisColor(0xae141414,{memory});lifetime=9;}
 else if(kind===19){first=shadeWheelDebrisColor(0x7f4040,{memory});second=shadeWheelDebrisColor(0xae300000,{memory});lifetime=10;}
 else if(kind===20){first=shadeWheelDebrisColor(0x102030,{memory});second=shadeWheelDebrisColor(0xae081018,{memory});for(let i=0;i<3;i++)put(memory,velocity+i*4,get(memory,velocity+i*4)>>2);lifetime=10;}
 else{variant=1;[first,second,lifetime]=({21:[0x9fff9f,0xae1f3f1f,15],22:[0x4fffff,0xae20205f,13],23:[0xff004f,0xae5f0020,13],24:[0x9f,0xae000020,21],25:[0x409f,0xae000020,43]})[kind]??[0x4f5f5f,0xae5f2020,18];}
 const freeLast=get(memory,nativeGlobalAddress(memory, 0x902b8c));if(freeLast<0)return 0;
 const id=memory.readUInt16LE(ptr(memory,nativeGlobalAddress(memory, 0x902b7c))+freeLast*2);put(memory,nativeGlobalAddress(memory, 0x902b8c),freeLast-1);const active=get(memory,nativeGlobalAddress(memory, 0x902b88));word(memory,ptr(memory,nativeGlobalAddress(memory, 0x902b80))+active*2,id);put(memory,nativeGlobalAddress(memory, 0x902b88),active+1);
 const p=(ptr(memory,nativeGlobalAddress(memory, 0x902b84))+(id<<7))>>>0,values=vector(memory,position);put(memory,p+0x50,values[1]);put(memory,p+0x4c,values[0]);put(memory,p+0x54,values[2]);registerRawEffectSpatial(p,...values,{memory});word(memory,p+0x6a,1);
 for(let i=0;i<3;i++)word(memory,p+0x64+i*2,memory.readUInt16LE(p+0x4e+i*4));for(let i=0;i<3;i++)put(memory,p+0x58+i*4,get(memory,velocity+i*4));word(memory,p+8,lifetime);put(memory,p+0x30,first);put(memory,p+0x14,second);memory[p+0x6c]=variant;return p;
}

//42c590. Only rear wheels2/3 and the original five surface categories emit.
export function emitWheelSurfaceParticles(body,{memory,scratchBase}){
 if(get(memory,body+0x664)<0x20000)return 0;
 for(let i=0;i<5;i++)put(memory,0x91d360+i*4,get(memory,body+0xc4+i*4));
 const scale=memory.readFloatLE(0x5dc5f4);
 for(let i=0;i<9;i++)memory.writeFloatLE(Math.fround(Math.fround(memory.readInt16LE(0x91d360+i*2))*scale),nativeGlobalAddress(memory,0x91cdc0+Math.floor(i/3)*16+(i%3)*4));
 const threshold=memory.readFloatLE(0x5dc97c),local=scratchBase-32,position=scratchBase-12,velocity=scratchBase-24;let seed=get(memory,0x5ec958),emitted=0;
 for(let wheelIndex=2;wheelIndex<4;wheelIndex++){
  const wheel=body+0x324+wheelIndex*200;if(!(memory[wheel]&1))continue;const descriptor=ptr(memory,body+0x198+wheelIndex*28);if(!descriptor)continue;
  const kind=({5:18,6:17,8:19,14:19,9:20})[memory[descriptor+12]];if(kind===undefined)continue;
  seed=rng(seed);put(memory,0x5ec958,seed);let count=((seed>>>16)&3)+(get(memory,body+0x664)>>20);
  if(memory.readFloatLE(ptr(memory,0x5ecefc)+0x68)>=threshold)count*=kind===19?4:2;
  for(let remaining=count;remaining>0;remaining--){
   seed=rng(seed);word(memory,local,(wheelIndex===2?-8192:8192)+(((seed>>>16)-0x6000)>>1));word(memory,local+2,memory[body+0x64f]? -2560:2560);
   const second=rng(seed);word(memory,local+4,(((second>>>16)-0x6000)>>1)-8192);put(memory,0x91d3e4,get(memory,local));put(memory,0x91d3e8,get(memory,local+4));transformWheelEffectOffset({memory});
   for(let i=0;i<3;i++)put(memory,position+i*4,(get(memory,body+0x34+i*4)+(memory.readInt16LE(0x91d448+i*4)<<8))|0);
   const delta=[0,4,8].map(o=>((get(memory,wheel+0x60+o)>>3)-(get(memory,body+0x68+o)>>3))|0);
   seed=rng(second);put(memory,0x5ec958,seed);const speed=get(memory,body+0x664);delta[1]=(delta[1]-((speed>>(kind===18?5:6))+((seed>>>16)*4))- (speed>>5))|0;store(memory,velocity,delta);
   if(emitWheelSurfaceDebris(position,velocity,kind,{memory}))emitted++;seed=get(memory,0x5ec958);
  }
 }
 return emitted;
}
