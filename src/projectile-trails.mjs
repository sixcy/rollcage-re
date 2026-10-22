import {transformWheelEffectOffset} from './wheel-effects.mjs';
import {allocateRawEffectParticle,registerRawEffectSpatial} from './body-retirement-effects.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);

//46aba0. Native WORD/DWORD overlaps in scratch are retained: the transform's
//unused upper input words remain raw caller storage, not invented zeroes.
export function updateProjectileTrail(body,mode,runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-60;if(get(m,body+0x188)===1&&m.readInt8(body+0x18e)>2)return;
 const ring=((m.readInt16LE(body+0x18c)+m.readInt8(body+0x18e)-(mode===0?1:0))|0)%32;let destination=body+(ring+14)*32;
 for(let i=0;i<5;i++)put(m,0x91d360+i*4,get(m,body+0xc4+i*4));const factor=m.readFloatLE(0x5dc5f4);
 for(let i=0;i<9;i++){const value=Math.fround(m.readInt16LE(0x91d360+i*2));m.writeFloatLE(value,frame+0x20);m.writeFloatLE(Math.fround(value*factor),0x91cdc0+Math.floor(i/3)*16+(i%3)*4);}
 let x=m.readUInt16LE(body+0x36);put(m,frame+0x10,m.readUInt16LE(body+0x3a));put(m,frame+0x1c,m.readUInt16LE(body+0x3e));put(m,frame+0x14,0);word(m,frame+0x18,get(m,body+0x184)===0?-40:-20);
 const transform=(from,to)=>{put(m,0x91d3e4,get(m,frame+from));put(m,0x91d3e8,get(m,frame+from+4));transformWheelEffectOffset(runtime);for(let i=0;i<3;i++)word(m,frame+to+i*2,m.readUInt16LE(0x91d448+i*4));};
 transform(0x14,0x14);word(m,frame+0x2c,0);word(m,frame+0x30,0);put(m,frame+0x36,0);
 const kind=get(m,body+0x184);let extent=kind===2?12:48;if(mode===2)extent=Math.max(1,(extent-(get(m,body+0x180)<<(kind===1?2:kind===2?1:3)))|0);word(m,frame+0x34,extent);word(m,frame+0x2e,-extent);transform(0x2c,0x2c);transform(0x34,0x34);
 x=(x+get(m,frame+0x14))|0;let y=(get(m,frame+0x10)+get(m,frame+0x16))|0,z=(get(m,frame+0x1c)+get(m,frame+0x18))|0;put(m,frame+0x1c,z);
 const leftY=get(m,frame+0x2e),leftZ=get(m,frame+0x30);word(m,destination,get(m,frame+0x2c)+x);word(m,destination+2,leftY+y);word(m,destination+4,leftZ+z);destination+=8;
 word(m,destination,x+get(m,frame+0x34));word(m,destination+2,y+get(m,frame+0x36));const rightZ=get(m,frame+0x38);word(m,destination+4,z+rightZ);destination+=8;
 word(m,destination,x-get(m,frame+0x2c));word(m,destination+2,y-leftY);word(m,destination+4,z-leftZ);word(m,destination+8,x-get(m,frame+0x34));word(m,destination+10,y-get(m,frame+0x36));word(m,destination+12,z-rightZ);
 if(mode!==0){if(m.readInt8(body+0x18e)<32)m[body+0x18e]++;else{word(m,body+0x18c,m.readUInt16LE(body+0x18c)+1);if(m.readUInt16LE(body+0x18c)===32)word(m,body+0x18c,0);}}
 if(mode===2){
  const delta=[0x1a8,0x1ac,0x1b0].map((o,i)=>((get(m,body+o)>>12)+m.readUInt16LE(body+0x6a+i*4))&65535);let row=body+(m.readInt16LE(body+0x18c)+14)*32;const count=m.readInt8(body+0x18e)-1;
  for(let i=0;i<count;i++,row+=32)for(let corner=0;corner<4;corner++)for(let axis=0;axis<3;axis++){const p=row+corner*8+axis*2;word(m,p,m.readUInt16LE(p)-delta[axis]);}
 }
}

//46b000: signed count and one subtract32 on the head+offset expression.
export function lowerProjectileTrail(body,{memory:m,scratchBase,entryRegisters}){
 //46b002 saves caller EBX; the next full-stage pickup matrix overwrites only
 //its low WORD, leaving this high WORD for a homing trail's tail-call input.
 if(Number.isInteger(scratchBase)&&Number.isInteger(entryRegisters?.EBX))put(m,scratchBase-4,entryRegisters.EBX);
 const kind=get(m,body+0x184);for(let i=0;i<m.readInt8(body+0x18e);i++){let index=m.readInt16LE(body+0x18c)+i;if(index>=32)index-=32;const row=body+(index+14)*32+2;for(let corner=0;corner<4;corner++)if(kind!==2&&get(m,body+0x188)!==1)word(m,row+corner*8,m.readUInt16LE(row+corner*8)-2);}
}

//436870: actual raw particle allocation/reuse and spatial insertion.
export function emitProjectileLaunchRing(position,runtime){
 const{memory:m,scratchBase,entryRegisters}=runtime;
 const particle=allocateRawEffectParticle({memory:m});word(m,particle+0x96,30);word(m,particle+0xa2,0);put(m,particle,8);m[particle+0x95]=48;
 for(const o of[0,4,8])put(m,particle+0x88+o,get(m,position+o));put(m,particle+0x9c,0);word(m,particle+0xa0,0);put(m,particle+0x98,0xb4ffe0e0);registerRawEffectSpatial(particle,get(m,particle+0x88),get(m,particle+0x8c),get(m,particle+0x90),{memory:m});
 //4286ea's PUSH EBX survives into a subsequent caller's partially initialized
 //trail input. A raw connected caller can supply the actual preserved value.
 if(Number.isInteger(scratchBase)&&Number.isInteger(entryRegisters?.EBX))put(m,scratchBase-60,entryRegisters.EBX);
 const frame=m[0x919006]+1;put(m,particle+0xa4,get(m,0x919004));m[particle+0x94]=1;m[0x919006]=frame<12?frame:0;return particle;
}

//4354e0 clears nearby authored kind4/active1 launch-event bytes in reverse order.
export function clearVehicleLaunchEvents(record,{memory:m}){
 const auxiliary=ptr(m,0x90b990),events=ptr(m,auxiliary+0xf8),count=m[auxiliary+0xf6];if(m[ptr(m,record)+0x718]!==10)return;
 for(let i=count-1;i>=0;i--){const event=events+i*8;if(m[event+4]!==4||m[event+5]!==1)continue;const groups=ptr(m,ptr(m,0x90b98c)+0x60),group=groups+m.readUInt16LE(event)*12,point=ptr(m,group+8)+m.readUInt16LE(event+2)*16,body=ptr(m,record),d=[0,2,4].map((o,j)=>(((get(m,body+0x34+j*4)-(m.readInt16LE(point+o)<<16))|0)>>16)<<16>>16),squared=d.reduce((sum,v)=>(sum+Math.imul(v,v))|0,0);if(squared<1000000)m[event+5]=0;}
}

//484ce0 treats volume as unsigned16 while pitch is signed16.
export function startProjectileLoopSound(code,pitch,volume,position,velocity,runtime){
 return emitNativeEffect(code&255,position,[velocity,pitch<<16>>16,volume&65535,9,0,0,0],{dispatch40ea40:runtime.handlers?.dispatch40ea40??(request=>dispatchNativeSound(request,runtime.soundRuntime??runtime))});
}
