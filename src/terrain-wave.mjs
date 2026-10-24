import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {nativeGlobalAddress} from './native-global-address.mjs';
import {multiplyQ16} from './fixed-integer.mjs';
import {addVehicleContactScore,subtractVehicleContactScore} from './vehicle-contact-state.mjs';
import {markVehicleWeaponReleased} from './race-time-effect.mjs';
import {setVehicleSoundVolume,stopVehicleSound} from './vehicle-sound-controls.mjs';
import {configureSoundPlayback,dispatchNativeSound} from './sound-dispatch.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {emitWheelRearParticle} from './wheel-effects.mjs';
import {createPickupTransition,updatePickupTransition} from './pickup-world-state.mjs';
import {sendWormholeLaunchPacket} from './game-network-protocol.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);

//447850: descending palette reservation with one cached bright color per old
//palette index. Original six low flag bits remain in the vertex's color word.
export function brightenTerrainWaveVertex(vertex,color,{memory:m}){
 const pack=ptr(m,0x90b98c),palette=ptr(m,pack+0x30),counter=m.readUInt16LE(0x90d974);
 if(counter<=m.readUInt16LE(pack+0x5c))return;
 const oldIndex=(color>>>6)&1023,map=ptr(m,0x90cb60)+oldIndex*2;put(m,0x5ed2b4,1);
 if(m.readUInt16LE(map)===65535){
  word(m,map,counter);const destination=palette+m.readUInt16LE(0x90d974)*4,original=get(m,palette+oldIndex*4);put(m,destination,original);
  const green=m[destination+1],red=m[destination+2];m[destination]=Math.min(255,(original&255)+80);m[destination+1]=Math.min(255,green+80);m[destination+2]=Math.min(255,red+200);word(m,0x90d974,m.readUInt16LE(0x90d974)-1);
 }
 word(m,vertex+6,(m.readUInt16LE(map)<<6)|(color&63));
}

//447740: toggling an existing row restores its saved WORDs and swap-removes
//the cache entry. Adding a row copies before brightening each live vertex.
export function toggleTerrainWaveRow(record,runtime){
 const{memory:m}=runtime,count=get(m,0x90d970);let slot=0x90ccb0,index=0;
 if(count>0){const row=m.readUInt16LE(record);for(;index<count;index++,slot+=0x88)if(row===m.readUInt16LE(slot)&&m[record+2]===m[slot+2])break;}
 if(index===count||count<=0){
  put(m,0x90d970,count+1);put(m,slot,get(m,record));const sector=ptr(m,ptr(m,0x909240)+m.readInt8(record+2)*4),row=m.readInt16LE(record),width=get(m,sector+8),vertices=ptr(m,sector+0x20)+Math.imul(width+1,row)*8;put(m,slot+4,vertices);
  for(let i=0;i<(width+1);i++){const vertex=vertices+i*8,color=m.readUInt16LE(vertex+6);word(m,slot+8+i*2,color);brightenTerrainWaveVertex(vertex,color,runtime);}return;
 }
 const sector=ptr(m,ptr(m,0x909240)+m.readInt8(record+2)*4),width=get(m,sector+8)+1;
 if(width>0){const vertices=ptr(m,slot+4);for(let i=0;i<width;i++)word(m,vertices+i*8+6,m.readUInt16LE(slot+8+i*2));}
 const lastCount=get(m,0x90d970)-1;put(m,0x90d970,lastCount);const last=0x90ccb0+Math.imul(lastCount,0x88);put(m,slot,get(m,last));put(m,slot+4,get(m,last+4));for(let i=0;i<64;i++)word(m,slot+8+i*2,m.readUInt16LE(last+8+i*2));
}

//447920: endpoint adjacency search. It compares BOTH consecutive XYZ vertices
//within100 units, using the selected bucket even when lookup marked outside.
export function findTerrainWaveNeighbor(sectorIndex,direction,runtime){
 const{memory:m}=runtime,sector=ptr(m,ptr(m,0x909240)+sectorIndex*4),end=direction===-1?0:get(m,sector+12),column=m.readInt8(ptr(m,0x90cb98)+1),vertex=ptr(m,sector+0x20)+(Math.imul(get(m,sector+8)+1,end)+column)*8;
 const{bucket}=lookupRawSpatialBucket(...[0,2,4].map(o=>m.readInt16LE(vertex+o)<<16),runtime);let row=ptr(m,0x9092c0)+(m.readUInt16LE(bucket+6)&0x3fff)*6,remaining=(m.readUInt16LE(row+2)>>>9)+1;
 for(;remaining>0;remaining--,row+=6){
  const candidate=m.readUInt16LE(row+2)&127;if(candidate===sectorIndex)continue;const other=ptr(m,ptr(m,0x909240)+candidate*4),otherEnd=end===0?get(m,other+12):0,first=m.readUInt16LE(row),start=first&1023,last=m.readUInt16LE(row+4);
  if(otherEnd<start||otherEnd>start+((last>>>8)&15))continue;let point=ptr(m,other+0x20)+(Math.imul(get(m,other+8)+1,otherEnd)+(first>>>10))*8;
  for(let i=0;i<(last>>>12);i++,point+=8)if([0,2,4,8,10,12].every(o=>Math.abs(m.readInt16LE(point+o)-m.readInt16LE(vertex+o))<=100))return candidate;
 }
 return -1;
}

//41f670: opposite human/autonomous teams receive contact-score feedback only
//inside the wrapped progress interval301..2499 and neighboring sector IDs.
export function updateTerrainWaveContactScores(record,direction,runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-24,progress=((m[record+0x1c]<<16)+get(m,record+0x24))|0,body=ptr(m,record),mode=m[body+0x718],sector=m[body+0x11c],owner=m.readUInt16LE(body+0x65e);
 for(let i=0;i<m[ptr(m,0x5ecb1c)+0x54d];i++){
  if(i===owner)continue;const other=ptr(m,0x909300+i*0x30c);if(mode===8?m[other+0x718]===8:m[other+0x718]!==8)continue;
  let delta=((m[0x909300+i*0x30c+0x1c]<<16)-progress+get(m,0x909300+i*0x30c+0x24))|0;
  if(delta>0x8000)delta=(delta-65536-((delta-0x8001)&0xffff0000))|0;
  if(delta< -32768)delta=(delta+65536+((-32769-delta)&0xffff0000))|0;
  if(direction===1)delta=-delta|0;if(((delta-301)>>>0)>0x896||Math.abs(sector-m[other+0x11c])>=2)continue;
  if(mode===8)subtractVehicleContactScore(body,other,100,{...runtime,scratchBase:frame-16});else addVehicleContactScore(other,body,100,runtime);
 }
}

//446d90. The receive path takes an explicit direction DWORD; the local path
//derives and stores it before invoking the actual packet producer4710f0.
export function activateTerrainWave(record,localMode,unused,packet,transportContext,runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-48,flags=get(m,0x6eafe0);
 if((flags&0x81)===0x81&&get(m,0x90cb80)!==0)return 0;
 put(m,0x90cb80,1);put(m,0x90cb88,0);put(m,0x90cb84,record);m.fill(255,ptr(m,0x90cb60),ptr(m,0x90cb60)+2048);word(m,0x90d976,65535);word(m,0x90d974,975);put(m,0x90cb9c,0);word(m,0x90d978,65535);put(m,0x90d98c,0);put(m,0x90cb8c,4);put(m,0x90cb90,4);
 const progress=ptr(m,record)+0x11c;put(m,0x90cb98,progress);const body=ptr(m,record),pack=ptr(m,0x90b98c),sector=ptr(m,ptr(m,pack)+m[progress]*4),width=get(m,sector+8),row=m.readInt16LE(progress+2),column=m.readInt8(progress+1),vertex=ptr(m,sector+0x20)+(Math.imul(width+1,row)+column)*8;
 const other=vertex+(row===0?width*8+8:-8-width*8),delta=[0,2,4].map(o=>(row===0?m.readInt16LE(other+o)-m.readInt16LE(vertex+o):m.readInt16LE(vertex+o)-m.readInt16LE(other+o))<<16),forward=[0xc8,0xce,0xd4].map(o=>m.readInt16LE(body+o)<<4);
 const dot=delta.reduce((sum,value,i)=>(sum+multiplyQ16(value,forward[i]))|0,0);let direction=dot>0?1:-1;if(get(m,ptr(m,record)+0x710)&0x4000)direction=-direction;put(m,frame+0x18,direction);
 const input=localMode?frame+0x18:packet;put(m,0x90cb94,get(m,input));put(m,0x90d970,0);updateTerrainWaveContactScores(record,get(m,input),{...runtime,scratchBase:frame-4});
 const emit=code=>{const live=ptr(m,record);return emitNativeEffect(code,live+0x34,[0,code===20?-1:1300,code===20?14000:15000,code===20?6:9,0,0,m[live+0x6b4]===1?1:0],{dispatch40ea40:r=>dispatchNativeSound(r,runtime.soundRuntime??runtime)});};emit(20);put(m,0x6e6704,emit(21));
 if(localMode){const participant=m.readUInt16LE(ptr(m,record)+0x65e),nested={...runtime,scratchBase:frame-16};if(runtime.handlers?.sendWormholeLaunchPacket)runtime.handlers.sendWormholeLaunchPacket({memory:m,participant,transportContext,tag:3,packet:frame+0x18,length:4,scratchBase:frame-16});else sendWormholeLaunchPacket(participant,transportContext,3,frame+0x18,4,nested);}
 return 1;
}

//447050. The row stream has native fixed arenas and no inferred array clamp.
export function updateTerrainWave(runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-68,parity=get(m,0x90a548)&1,initial=get(m,0x90cb80);put(m,scratchBase-4,get(m,0x5e8890)^((scratchBase-52)>>>0));
 //44706b saves caller EBP, later consumed by a homing trail in48d7c0.
 if(Number.isInteger(runtime.entryRegisters?.EBP))put(m,frame+8,runtime.entryRegisters.EBP);
 if(initial<1||initial>4)return;
 if(initial===1){put(m,0x90cb88,get(m,0x90cb88)+1);const length=get(m,0x90cb8c)+1;put(m,0x90cb8c,length);if(length===14){put(m,0x90cb88,0);put(m,0x90cb80,2);}}
 else if(initial===2){
  let age=(get(m,0x90cb88)+1)|0;put(m,0x90cb88,age);const channel=get(m,0x6e6704);
  if(channel!==127){const volume=age>150?(-12136-(age<<8))|0:15000;setVehicleSoundVolume(channel,volume,volume,runtime.soundRuntime??runtime);const body=ptr(m,ptr(m,0x90cb84));configureSoundPlayback(get(m,0x6e6704),m[body+0x6b4]===1?1:0,0,runtime.soundRuntime??runtime);age=get(m,0x90cb88);}
  if(age===175){markVehicleWeaponReleased(ptr(m,ptr(m,0x90cb84)),3,runtime);age=get(m,0x90cb88);}if(age>200){put(m,0x90cb88,0);put(m,0x90cb80,3);}
 }else if(initial===3){put(m,0x90cb88,get(m,0x90cb88)+1);const removed=(get(m,0x90cb90)+1)|0;put(m,0x90cb90,removed);if(removed===get(m,0x90cb8c)){put(m,0x90cb88,0);put(m,0x90cb80,4);for(const p of[0x90d976,0x90d978]){const slot=m.readInt16LE(p);if(slot>=0)word(m,0x911ba0+slot*24,0);}}}
 else{const body=ptr(m,ptr(m,0x90cb84));m[body+((m.readInt8(body+0x68c)&~32)===0x43?0x68c:0x68d)]=255;const channel=get(m,0x6e6704);put(m,0x90cb80,0);if(channel!==127){stopVehicleSound(channel,runtime.soundRuntime??runtime);put(m,0x6e6704,127);}}
 const direction=get(m,0x90cb94),previousCount=m.readUInt16LE(0x90cb9e-parity*2),current=0x90cba0+parity*80,previous=0x90cbf0-parity*80,progress=ptr(m,0x90cb98);let sector=m[progress],row=m.readInt16LE(progress+2),count=0,step=0;
 if(get(m,0x90cb8c)>0){let sectorTable=ptr(m,0x909240);while(step<get(m,0x90cb8c)){
  if(step>=get(m,0x90cb90)){m[current+count*4+2]=sector;word(m,current+count*4,row);m[current+count*4+3]=1;count++;sectorTable=ptr(m,0x909240);}
  row=(row+direction)|0;const selected=ptr(m,sectorTable+sector*4);
  if(row<0){sector=findTerrainWaveNeighbor(sector,-1,runtime);if(sector===-1)break;row=get(m,ptr(m,sectorTable+sector*4)+12);}
  else if(row>get(m,selected+12)){sector=findTerrainWaveNeighbor(sector,1,runtime);if(sector===-1)break;row=0;}
  else step++;
 }}word(m,0x90cb9c+parity*2,count);
 let changes=0;for(let i=0;i<count;i++){
  const record=current+i*4;let found=false;for(let j=0;j<previousCount;j++)if(get(m,previous+j*4)===get(m,record)){found=true;break;}
  if(!found){put(m,0x90cc40+changes*4,get(m,record));toggleTerrainWaveRow(record,runtime);changes++;}
 }
 for(let i=0;i<previousCount;i++){
  const record=previous+i*4;let found=false;for(let j=0;j<count;j++)if(get(m,current+j*4)===get(m,record)){found=true;break;}
  if(!found){const changed=0x90cc40+changes*4;put(m,changed,get(m,record));m[changed+3]=3;toggleTerrainWaveRow(changed,runtime);changes++;}
 }
 let groups=0;for(let i=0;i<changes;i++){
  const record=0x90cc40+i*4,changeRow=m.readInt16LE(record),changeSector=m.readInt8(record+2);let group=0;
  for(;group<groups;group++){const p=0x90cc90+group*4,start=m.readInt16LE(p);if(changeSector===m[p+3]&&(changeRow===start-1||changeRow===start+m[p+2])){if(changeRow<start)word(m,p,m.readUInt16LE(p)-1);m[p+2]++;break;}}
  if(group===groups){const p=0x90cc90+groups*4;m[p+3]=m[record+2];word(m,p,m.readUInt16LE(record));m[p+2]=1;groups++;}
 }
 if(groups){let queued=get(m,nativeGlobalAddress(m,0x80f210));for(let i=0;i<groups;i++){const p=0x90cc90+i*4,start=m.readInt16LE(p),length=m[p+2],encoded=((((start&2047)|(((start+length)<<11)&0x3ff800)|0x800000)<<7)|(m[p+3]&127))|0;if((queued>>>0)<64&&(!queued||get(m,nativeGlobalAddress(m,0x80f41c+queued*4))!==encoded)){put(m,nativeGlobalAddress(m,0x80f420+queued*4),encoded);queued++;}}put(m,nativeGlobalAddress(m,0x80f210),queued);}
 const body=ptr(m,ptr(m,0x90cb84));for(let i=0;i<3;i++)word(m,0x90d984+i*2,(m.readInt16LE(body+[0xc8,0xce,0xd4][i])>>6)+m.readUInt16LE(body+[0x36,0x3a,0x3e][i]));
 let first=current,last=count?current+(count-1)*4:frame+0x10;if(!count){word(m,last,m.readUInt16LE(progress+2));m[last+2]=m[progress];first=last;}
 const pack=ptr(m,0x90b98c),selected=ptr(m,ptr(m,pack)+m.readInt8(last+2)*4),width=get(m,selected+8)+1;let offset=get(m,0x90d98c);if(m[0x90a548]&1)offset=(offset+1)|0;if(offset>=width)offset=0;put(m,0x90d98c,offset);const base=ptr(m,selected+0x20)+Math.imul(m.readInt16LE(last),width)*8;put(m,0x90d97c,base+offset*8);put(m,0x90d980,base+(width-offset)*8);
 for(let i=0;i<2;i++){const p=0x90d976+i*2,end=ptr(m,0x90d97c+i*4),handle=m.readUInt16LE(p);if(handle===65535)word(m,p,createPickupTransition(0x90d984,end,0x3fff,runtime));else updatePickupTransition(0x90d984,end,m.readInt16LE(p),runtime);}
 put(m,frame+0x28,0);put(m,frame+0x2c,0);put(m,frame+0x30,0);const emitPack=ptr(m,0x90b98c),emitSector=ptr(m,ptr(m,emitPack)+m.readInt8(first+2)*4),emitWidth=get(m,emitSector+8)+1,vertices=ptr(m,emitSector+0x20)+Math.imul(m.readInt16LE(first),emitWidth)*8;
 let seed=get(m,0x5ec958);for(let i=0;i<emitWidth;i++){
  seed=Math.imul(seed,0x41a7)&0x7fffffff;put(m,0x5ec958,seed);const random=seed>>>16;if(random&7)continue;const v=vertices+i*8;put(m,frame+0x34,(m.readInt16LE(v)+(random&255)-128)<<16);const owner=ptr(m,ptr(m,0x90cb84));put(m,frame+0x38,(m.readInt16LE(v+2)-32)<<16);put(m,frame+0x3c,(m.readInt16LE(v+4)+((random>>8)&255)-128)<<16);emitWheelRearParticle(owner,frame+0x34,frame+0x28,0xa06060,-1,0,{...runtime,scratchBase:frame-20});seed=get(m,0x5ec958);
 }
}
