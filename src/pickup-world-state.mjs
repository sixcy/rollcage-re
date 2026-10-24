import {nativeGlobalAddress} from './native-global-address.mjs';
import {buildRenderRotationMatrix} from './wheel-render-state.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {registerRawBodySpatial} from './raw-body-construction.mjs';
import {emitRawRespawnParticle} from './raw-respawn-state.mjs';
import {awardWeightedPickup} from './pickup-award.mjs';
import {sendGameNotificationPacket} from './game-network-protocol.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const sound=(code,position,args,runtime)=>emitNativeEffect(code,position,args,{dispatch40ea40:request=>dispatchNativeSound(request,runtime.soundRuntime??runtime)});

//46e940: both lists swap-remove the last item, then clear its trailing slot.
export function removePickupPhysicalLists(body,{memory:m}){
 const remove=(base,countAddress)=>{const count=m.readUInt16LE(countAddress),last=base+count*4-4;let slot=base;while(get(m,slot)!==(body|0)){slot+=4;if(slot+4>m.length)throw RangeError('Native physical-body search reached unmapped storage.');}put(m,slot,get(m,last));put(m,last,0);word(m,countAddress,m.readUInt16LE(countAddress)-1);};
 remove(ptr(m,nativeGlobalAddress(m, 0x902bc0)),nativeGlobalAddress(m, 0x902bc4));const owner=ptr(m,body+0x130);if(owner)remove(ptr(m,owner),owner+4);
}

//43fa20/43fa80: four shared endpoint pairs, copied as live ordered WORDs.
export function createPickupTransition(from,to,ttl,{memory:m}){
 for(let i=0;i<4;i++){const slot=0x911ba0+i*24;if(m.readUInt16LE(slot))continue;word(m,slot,ttl);for(const o of[0,2,4])word(m,slot+8+o,m.readUInt16LE(from+o));for(const o of[0,2,4])word(m,slot+16+o,m.readUInt16LE(to+o));return i;}return -1;
}
export function updatePickupTransition(from,to,index,{memory:m}){
 if((index|0)<0)return;const slot=0x911ba0+Math.imul(index,24);if(from)for(const o of[0,2,4])word(m,slot+8+o,m.readUInt16LE(from+o));if(to)for(const o of[0,2,4])word(m,slot+16+o,m.readUInt16LE(to+o));
}

//47caf0: position the pickup, reinsert it spatially and emit16 actual particles.
export function finalizePickupRespawn(controller,runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-36,index=m.readInt16LE(controller+0x186),pickup=ptr(m,ptr(m,nativeGlobalAddress(m, 0x902020))+index*4),authored=ptr(m,0x9092a8)+index*12;
 for(const o of[0,2,4])put(m,pickup+0x34+o*2,m.readInt16LE(authored+o)<<16);
 put(m,pickup+0x11c,0);word(m,pickup+0x18c,m[authored+10]);word(m,pickup+0x18e,m.readUInt16LE(authored+8));registerRawBodySpatial(pickup,runtime);put(m,pickup+0x180,0x83000c);
 sound(8,pickup+0x34,[0,-1,12000,6,0,0,0],runtime);
 for(const o of[0,4,8])put(m,frame+0x18+o,get(m,pickup+0x34+o));
 for(let p=0x5ed230;p>0x5ed030;p-=32){
  let seed=Math.imul(get(m,0x5ec958),0x41a7)&0x7fffffff;put(m,0x5ec958,seed);seed>>>=16;
  put(m,frame+12,Math.imul(seed&15,m.readInt8(p+0x81)));put(m,frame+16,(-8-((seed>>4)&15))<<7);put(m,frame+20,Math.imul((seed>>8)&15,m.readInt8(p+1)));
  emitRawRespawnParticle(frame+24,frame+12,0,1,runtime);
 }
}

//4319f0. The controller scan captures its length and local RNG seed, but reloads
//the RNG after the finalization child. New queue entries are consumed in order.
export function updatePickupRespawnControllers(runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-44,count=m[ptr(m,0x90b990)+0xf7];let seed=get(m,0x5ec954);
 for(let i=0;i<count;i++){
  const body=ptr(m,0x91d480+i*4),state=get(m,body+0x180);
  if(state===3){removeBodySpatial(body,runtime);put(m,body+0x180,0);removePickupPhysicalLists(body,runtime);}
  else if(state===2){
   if(m.readInt16LE(body+0x184)>0)word(m,body+0x184,m.readUInt16LE(body+0x184)-1);
   else{
    const authored=ptr(m,0x9092a8)+m.readInt16LE(body+0x186)*12,list=ptr(m,nativeGlobalAddress(m, 0x902bc0)),n=m.readUInt16LE(nativeGlobalAddress(m, 0x902bc4));put(m,list+n*4,body);put(m,list+n*4+4,0);word(m,nativeGlobalAddress(m, 0x902bc4),n+1);put(m,body+0x130,0);
    const scripts=ptr(m,0x9092b4),script=m[authored+6],spawn=m[authored+7],offset=m.readUInt16LE(scripts+script*2);put(m,body,get(m,body)|0x2000);put(m,body+0x134,scripts+offset);m[body+0x13f]=spawn;put(m,body+0x138,0);word(m,body+0x13c,0);m[body+0x13e]=0;
    const point=ptr(m,ptr(m,0x90b990)+0xa8)+spawn*8;put(m,body+0x34,m.readInt16LE(point)<<16);put(m,body+0x38,m.readInt16LE(point+2)<<16);const z=m.readInt16LE(point+4)<<16;put(m,body+0x38,get(m,body+0x38)+0xff700000);put(m,body+0x3c,z);registerRawBodySpatial(body,runtime);
    //474614 CALL4286e0 leaves its real return address at474600 entryESP-28.
    //The next48d7c0 projectile pass can consume its high word as trail input.
    if(Number.isInteger(scratchBase))put(m,frame-32,0x474619);
    put(m,body+0x180,1);word(m,body+0x184,0);
   }
  }else if(state===1){
   const timer=m.readInt16LE(body+0x184);if(timer<=0)continue;
   if(timer===10||timer<10&&m.readInt16LE(body+0x188)>=0){
    const authored=ptr(m,0x9092a8)+m.readInt16LE(body+0x186)*12;
    for(const o of[0,2,4])word(m,frame+0x20+o,m.readUInt16LE(body+0x36+o*2));for(const o of[0,2,4])word(m,frame+0x18+o,m.readUInt16LE(authored+o));
    if(timer===10)word(m,body+0x188,createPickupTransition(frame+0x20,frame+0x18,12,runtime));else updatePickupTransition(frame+0x20,frame+0x18,m.readInt16LE(body+0x188),runtime);
   }
   word(m,body+0x184,m.readUInt16LE(body+0x184)-1);if(!m.readUInt16LE(body+0x184)){finalizePickupRespawn(body,{...runtime,scratchBase:frame-4});seed=get(m,0x5ec954);}
  }else{
   const pending=m.readInt16LE(0x91d4b0);if(!pending)continue;seed=Math.imul(seed,0x41a7)&0x7fffffff;put(m,body+0x180,2);word(m,body+0x186,m.readInt8(0x91d498));put(m,0x5ec954,seed);word(m,body+0x184,(Math.imul(seed>>>15,0x7fff)>>>16)&31);
   const length=(pending-1)>>>0;if(length>m.length-0x91d499)throw RangeError('Native pending-pickup copy exceeds mapped storage.');for(let j=0;j<length;j++)m[0x91d498+j]=m[0x91d499+j];word(m,0x91d4b0,m.readUInt16LE(0x91d4b0)-1);
  }
 }
}

//47b680: collection uses X velocity>>17 for all THREE predicted distance axes.
export function updateWorldPickups(runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-76,initialCount=get(m,nativeGlobalAddress(m, 0x902024));
 //47b68c saves incoming EDI at this frame base. In48d7c0 that exact word
 //later supplies part of a ground projectile's partially initialized trail.
 if(Number.isInteger(runtime.entryRegisters?.EDI))put(m,frame,runtime.entryRegisters.EDI);
 if(initialCount<1)return;
 const clock=get(m,0x90a548);word(m,frame+0x20,(clock&127)<<5);word(m,frame+0x22,(clock&31)<<7);word(m,frame+0x24,(clock&63)<<6);buildRenderRotationMatrix(frame+0x20,frame+0x28,runtime);
 let limit=initialCount,row=ptr(m,nativeGlobalAddress(m, 0x902020));
 for(let i=0;i<limit;i++,row+=4){
  const pickup=ptr(m,row),flags=m.readInt16LE(pickup+0x182);if((flags&0x80)===0)continue;const state=flags&~0x80;
  if(state===2){if(m.readInt16LE(pickup+0x180)>0){word(m,pickup+0x180,m.readUInt16LE(pickup+0x180)-1);if(!m.readUInt16LE(pickup+0x180)){m[0x91d498+m.readInt16LE(0x91d4b0)]=i&255;word(m,0x91d4b0,m.readUInt16LE(0x91d4b0)+1);word(m,pickup+0x182,0x84);}}continue;}
  if(state!==1&&state!==3)continue;
  if(state===3&&m.readInt16LE(pickup+0x180)>0){word(m,pickup+0x180,m.readUInt16LE(pickup+0x180)-1);if(!m.readUInt16LE(pickup+0x180))word(m,pickup+0x182,0x81);}
  for(const o of[0,4,8,12])put(m,pickup+0xc4+o,get(m,frame+0x28+o));word(m,pickup+0xd4,m.readUInt16LE(frame+0x38));
  const participants=m[ptr(m,0x5ecb1c)+0x54d];
  for(let j=0;j<participants;j++){
   const record=0x909300+j*0x30c,body=ptr(m,record);if(m[body+0x68c]!==255&&m[body+0x68d]!==255)continue;
   const d=[0x36,0x3a,0x3e].map(o=>m.readInt16LE(pickup+o)-m.readInt16LE(body+o));if(d.some(v=>Math.abs(v)>256))continue;
   const squared=v=>v.reduce((sum,x)=>(sum+Math.imul(x,x))|0,0)>>>0;let hit=squared(d)<0x1440;
   if(!hit){const velocity=get(m,body+0x68)>>17;hit=squared(d.map(v=>(v+velocity)|0))<0x1440;}
   if(hit){
    //47b8af PUSH6 survives as47b920's otherwise-uninitialized packet+8
    //DWORD. Its high bits are serialized by a later network award.
    put(m,frame-16,6);
    sound(9,body+0x34,[0,-1,14000,6,0,0,m[body+0x6b4]===1?1:0],runtime);removeBodySpatial(pickup,runtime);put(m,pickup+0x180,0x820064);
    awardWeightedPickup(record,{memory:m,packetAddress:frame-24,handlers:{call4a0420:request=>sendGameNotificationPacket(request.ecx,request.edx,...request.args,{...runtime,scratchBase:frame-84})}});break;}
  }
  limit=get(m,nativeGlobalAddress(m, 0x902024));
 }
 updatePickupRespawnControllers(runtime);
}
