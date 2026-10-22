import {lookupSqrt,signedShort,abs32} from './fixed-integer.mjs';
import {formatLapTimeDigits,formatRawLapTimeDigits} from './lap-timing.mjs';
import {stepReplayControl} from './replay-codec.mjs';
import {pollInputPacket, decodeAnalogVehicleInput} from './vehicle-input-packets.mjs';

//42a870: digital controls become byte-valued steering/throttle/brake axes.
//recordAddress is909300+index*30c; inputAddress is the body's708 control block.
export function advanceDigitalVehicleControls(recordAddress,inputAddress,{memory}) {
 let mask=memory.readUInt16LE(recordAddress+0x25e),steering=memory[inputAddress+0x18],throttle=memory[inputAddress+0x19];
 if(memory[inputAddress+0x10]===8)mask=0;
 if(!(mask&1)){
  if(memory[inputAddress+8]&0x40){if(throttle<31)throttle++;}
  else throttle=Math.max(0,throttle-2);
  memory[inputAddress+0x19]=throttle&255;memory[inputAddress+1]=memory[0x570680+(throttle&255)];
 }else memory[inputAddress+0x19]=0;
 if(!(mask&2)){const brake=memory[inputAddress+8]&0x80?15:0;memory[inputAddress+0x1a]=brake;memory[inputAddress+2]=memory[0x5706c0+brake];}
 else memory[inputAddress+0x1a]=0;
 if(mask&4){memory[inputAddress+0x18]=16;return;}
 const controls=memory.readUInt32LE(inputAddress+8);let negative=false;
 if(controls&0x8000){negative=true;steering=steering>16?16:Math.max(0,steering-3);}
 if(controls&0x2000){if(steering<16)steering=16;else steering=Math.min(32,steering+3);}
 else if(!negative){if(steering>16)steering=Math.max(16,steering-4);else if(steering<16)steering=Math.min(16,steering+4);}
 memory[inputAddress+0x18]=steering&255;memory[inputAddress]=memory[0x5706d0+(steering&255)];
}

//42a9a0: byte axes feed the native Q16-ish steering and drive fields. Session
//state, not the game-mode byte, chooses prestart6b0 versus active drive650.
export function updateVehicleControlState(bodyAddress,{memory}) {
 memory[bodyAddress+0x64c]=memory[bodyAddress+0x708];memory[bodyAddress+0x64d]=memory[bodyAddress+0x709];
 let steering=memory[bodyAddress+0x64c]-128;
 if(steering>0)steering=steering<8?0:steering-8;else if(steering<0)steering=steering> -8?0:steering+8;
 memory.writeInt32LE(Math.imul(steering,320),bodyAddress+0x644);memory[bodyAddress+0x64e]=memory[bodyAddress+0x70a]<16?0:255;
 if(memory[bodyAddress+0x64d]<16)memory[bodyAddress+0x64d]=0;if(memory[bodyAddress+0x64d]>240)memory[bodyAddress+0x64d]=255;
 const session=memory.readUInt32LE(0x5ecb1c),drive=memory[bodyAddress+0x64d]<<8;
 if(memory.readInt32LE(session+0x57c)<4)memory.writeInt32LE(drive,bodyAddress+0x6b0);
 else{
  memory.writeInt32LE(drive,bodyAddress+0x650);
  if(memory[bodyAddress+0x710]&0x10)memory.writeInt32LE(Math.trunc(-65536/Math.max(5,memory.readInt16LE(bodyAddress+0x666))),bodyAddress+0x650);
 }
}

//42a6e0 routes packet, autonomous and replay inputs into the common708 block.
//Physical packet polling and analog decoding use recovered game algorithms;
//device sample/configuration producers remain caller-owned runtime state.
export function updateVehicleInputBlock(bodyAddress,vehicleIndex,{memory,scratchBase,handlers={}}) {
 const u32=p=>memory.readUInt32LE(p),s32=p=>memory.readInt32LE(p),d=(p,value)=>memory.writeInt32LE(value|0,p),input=bodyAddress+0x708;
 const poll=()=>{if(!Number.isInteger(scratchBase))throw Error('Vehicle packet input requires native entry stack.');if(handlers.pollInput471250)handlers.pollInput471250({memory,bodyAddress,vehicleIndex,pointerAddress:bodyAddress+0x724,statusAddress:scratchBase-12});else pollInputPacket(vehicleIndex,bodyAddress+0x724,scratchBase-12,{memory});return u32(bodyAddress+0x724);};
 const replay=()=>{if(handlers.replay42ab90)return handlers.replay42ab90({memory,bodyAddress});return stepReplayControl(bodyAddress,{memory});};
 const mode=memory[bodyAddress+0x718];let session;
 if(mode===9){const packet=poll();memory[bodyAddress+0x719]=memory[packet+1]!==0x41?1:0;d(bodyAddress+0x710,~((memory[packet+2]<<8)+memory[packet+3]));return 0;}
 if(mode===10){
  const packet=poll();memory[bodyAddress+0x719]=memory[packet+1]!==0x41?1:0;d(bodyAddress+0x710,(memory.readUInt16LE(packet+4)<<16)|(~((memory[packet+2]<<8)+memory[packet+3])&65535));
  if(handlers.decodeAnalog434360)handlers.decodeAnalog434360({memory,bodyAddress,vehicleIndex});else decodeAnalogVehicleInput(vehicleIndex,{memory});session=u32(0x5ecb1c);
  if(memory[session+0x58b]){const original=u32(bodyAddress+0x710);memory[input]=255-memory[input];d(bodyAddress+0x710,original&0xffff5fff);if(original&0x8000)d(bodyAddress+0x710,(original&0xffff5fff)|0x2000);if(original&0x2000)d(bodyAddress+0x710,u32(bodyAddress+0x710)|0x8000);}
 }else session=u32(0x5ecb1c);
 const controller=u32(bodyAddress+0x660),state=controller?s32(controller+0x1e880):null;
 if(state===5||state===6)replay();
 else{
  const packet=u32(bodyAddress+0x724);
  if((packet!==0&&memory[packet+1]!==0x23)||memory[bodyAddress+0x718]===8)advanceDigitalVehicleControls((0x909300+Math.imul(vehicleIndex,0x30c))>>>0,input,{memory});
  if(s32(session+0x57c)===2){memory[bodyAddress+0x722]=15;memory[bodyAddress+0x70a]=255;}
 }
 const liveController=u32(bodyAddress+0x660),liveState=liveController?s32(liveController+0x1e880):null;
 if(liveState===2||liveState===3||liveState===7)replay();
 d(bodyAddress+0x714,u32(bodyAddress+0x710)&~u32(bodyAddress+0x70c));return 0;
}

//443d90 produces664/668/66a AFTER physics/recovery in450e50. Those values feed
//the following frame's handling and autonomous callers, not the preceding one.
export function updateVehicleMotionState(recordAddress,{memory,scratchBase}) {
 const initialSession=memory.readUInt32LE(0x5ecb1c),initialState=memory.readInt32LE(initialSession+0x57c),body=memory.readUInt32LE(recordAddress),components=[0x68,0x6c,0x70].map(offset=>memory.readInt32LE(body+offset)>>8),squared=components.reduce((sum,value)=>(sum+Math.imul(value,value))|0,0),speed=lookupSqrt(squared)<<8;
 memory.writeInt32LE(abs32(squared),0x91d45c);memory.writeInt32LE(Math.clz32(abs32(squared)),0x91d460);
 memory.writeInt32LE(speed,body+0x664);const session=memory.readUInt32LE(0x5ecb1c);
 if(memory.readInt32LE(session+0x57c)<4)memory.writeInt16LE(0,body+0x668);
 else{
  const product=Math.imul(speed,108),scaled=((product+((product>>31)&15))|0)>>4,display=signedShort(scaled>>16);memory.writeInt16LE(display,body+0x668);if(display>memory.readInt16LE(body+0x66a))memory.writeInt16LE(display,body+0x66a);
 }
 if(initialState>=4&&memory[recordAddress+0x1c]<=memory[session+0x586]){
  const time=Math.trunc(((memory.readInt32LE(0x90a548)<<11)>>>0)/3);memory.writeInt32LE((time-memory.readInt32LE(recordAddress+0x4c))|0,recordAddress+0x2c);memory.writeInt32LE((time-memory.readInt32LE(recordAddress+0x50))|0,recordAddress+0x34);if(Number.isInteger(scratchBase))formatRawLapTimeDigits(recordAddress,0,{memory,scratchBase});else formatLapTimeDigits(memory.subarray(recordAddress,recordAddress+0x30c),0);
 }
 return speed;
}

//48d680 follows speed/timer publication in450e50. One category1 wheel contact
//adds drive force once per participant; throttle bit40 selects the lower gain.
//Stop after the first hit, preserving the native early return before later
//descriptor pointers are read. Category is the low byte of material+0xc.
export function updateVehicleSurfaceDrive(recordAddress,{memory}) {
 const body=memory.readUInt32LE(recordAddress),input=memory.readUInt32LE(body+0x710);
 for(let index=0;index<4;index++) {
  const material=memory.readUInt32LE(body+0x198+index*28);
  if(material&&memory[material+12]===1) {
   memory.writeInt32LE((memory.readInt32LE(body+0x6a8)+(input&0x40?0x3000:0x5000))|0,body+0x6a8);
   return;
  }
 }
}

//49bbc0: linked controls retain local mode/metadata bytes and clear unrelated
//control bits. Forward dword copies intentionally preserve overlapping aliases.
export function copyLinkedVehicleControls({memory}) {
 let index=0,copied=0,detached=0;
 while(index<memory[memory.readUInt32LE(0x5ecb1c)+0x54d]){
  const record=0x909300+index*0x30c,body=memory.readUInt32LE(record),source=memory.readUInt32LE(body+0x690);
  if(source){
   memory[body+0x698]=(memory[body+0x698]-1)&255;memory.writeInt32LE(memory.readInt32LE(body+0x710),body+0x694);const counter=memory.readInt8(body+0x698);
   if((counter<60&&memory.readInt32LE(body+0x714)!==0)||counter<=0){memory.writeUInt32LE(0,body+0x690);detached++;}
   else{
    //The native reload of record+00 occurs before collecting retained fields.
    const destination=memory.readUInt32LE(record),savedBytes=new Map([0x718,0x719,0x70b,0x720,0x721,0x722].map(offset=>[offset,memory[destination+offset]])),savedShort=memory.readUInt16LE(destination+0x71a),savedWord=memory.readInt32LE(destination+0x71c),savedPointer=memory.readUInt32LE(destination+0x724);
    for(let offset=0x708;offset<=0x720;offset+=4)memory.writeInt32LE(memory.readInt32LE(source+offset),destination+offset);
    for(const offset of [0x70c,0x710,0x714])memory.writeInt32LE(memory.readInt32LE(destination+offset)&0xf0f0,destination+offset);
    for(const [offset,value]of savedBytes)memory[destination+offset]=value;memory.writeUInt16LE(savedShort,destination+0x71a);memory.writeInt32LE(savedWord,destination+0x71c);memory.writeUInt32LE(savedPointer,destination+0x724);copied++;
   }
  }
  index++;
 }
 return{processed:index,copied,detached};
}
