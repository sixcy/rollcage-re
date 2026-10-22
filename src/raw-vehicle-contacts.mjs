//488910 and its488f00/4890a0/488bf0/488d20 wheel query bridge. It consumes
//the body's existing frame candidates; it does not append a second candidate set.
import {multiplyQ16} from './fixed-integer.mjs';
import {transformWheelEffectOffset} from './wheel-effects.mjs';
import {queryRawTerrain} from './raw-terrain-query.mjs';
import {queryRawPlacedModelSphere} from './raw-model-sphere-query.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
function cacheRotation(body,{memory}){
 for(let o=0;o<20;o+=4)put(memory,0x91d360+o,get(memory,body+0xc4+o));
 const scale=memory.readFloatLE(0x5dc5f4);for(let i=0;i<9;i++)memory.writeFloatLE(Math.fround(Math.fround(memory.readInt16LE(0x91d360+i*2))*scale),0x91cdc0+Math.floor(i/3)*16+(i%3)*4);
}
//488820 preserves its sequential reads if the output aliases an input vector.
export function writeRawWheelAngularProbe(first,second,output,{memory}){
 for(const[a,b,c,d,o]of[[4,8,8,4,0],[8,0,0,8,4],[0,4,4,0,8]]){
  const left=multiplyQ16(get(memory,first+a),get(memory,second+b)),right=multiplyQ16(get(memory,first+c),get(memory,second+d));put(memory,output+o,left-right);
 }
}
export function buildRawWheelProbe(body,descriptor,contact,query,runtime){
 const {memory,scratchBase}=runtime,frame=scratchBase-24;
 put(memory,0x91d3e4,get(memory,descriptor));put(memory,0x91d3e8,get(memory,descriptor+4));transformWheelEffectOffset({memory});
 word(memory,query+70,memory.readUInt16LE(descriptor+16)+100);
 for(let i=0;i<3;i++)put(memory,contact+24+i*4,get(memory,0x91d448+i*4)<<8);
 writeRawWheelAngularProbe(body+0xb8,contact+24,contact+12,runtime);
 for(let i=0;i<3;i++)put(memory,query+8+i*4,((get(memory,body+0x34+i*4)+get(memory,contact+24+i*4))|0)>>8);
 for(let i=0;i<3;i++)word(memory,frame+16+i*2,memory.readUInt16LE(descriptor+8+i*2)<<4);
 put(memory,0x91d3e4,get(memory,frame+16));put(memory,0x91d3e8,get(memory,frame+20));transformWheelEffectOffset({memory});
 put(memory,contact+12,get(memory,contact+12)+get(memory,body+0x68));put(memory,contact+20,get(memory,contact+20)+get(memory,body+0x70));put(memory,contact+16,get(memory,contact+16)+get(memory,body+0x6c));
 for(let i=0;i<3;i++)put(memory,contact+i*4,get(memory,0x91d448+i*4));
 for(let i=0;i<3;i++)put(memory,query+20+i*4,Math.imul(get(memory,contact+i*4),44)>>4);put(memory,query+64,0);
}
export function resolveRawWheelContact(body,descriptor,fraction,query,output,contact,runtime){
 const {memory,scratchBase}=runtime;
 if(!get(memory,output+28)){put(memory,descriptor+20,-1);put(memory,descriptor+24,0);put(memory,contact+72,-1);return -1;}
 for(let i=0;i<3;i++)put(memory,contact+60+i*4,get(memory,output+12+i*4));
 const point=fraction===0?query+8:output;for(let i=0;i<3;i++)put(memory,contact+48+i*4,get(memory,point+i*4)<<8);
 for(let i=0;i<3;i++)put(memory,contact+48+i*4,get(memory,contact+48+i*4)-get(memory,body+0x34+i*4));
 const distance=multiplyQ16(fraction,get(memory,body+0x320)<<8);put(memory,contact+72,distance);
 //488d20 computes the local contact, then transforms using cached rotation.
 const local=scratchBase-40;for(let i=0;i<3;i++)word(memory,local+i*2,memory.readUInt16LE(descriptor+i*2)+multiplyQ16(memory.readInt16LE(descriptor+8+i*2),distance));
 put(memory,0x91d3e4,get(memory,local));put(memory,0x91d3e8,get(memory,local+4));transformWheelEffectOffset({memory});
 for(let i=0;i<3;i++)put(memory,local+i*4,get(memory,0x91d448+i*4)<<8);
 writeRawWheelAngularProbe(body+0xb8,local,contact+36,runtime);for(let i=0;i<3;i++)put(memory,contact+36+i*4,get(memory,contact+36+i*4)+get(memory,body+0x68+i*4));
 const cell=get(memory,output+32);
 if(cell<0){put(memory,descriptor+24,0);put(memory,descriptor+20,cell);return distance;}
 const segment=ptr(memory,ptr(memory,ptr(memory,0x90b98c))+(cell&255)*4),row=cell>>16,column=(cell<<16)>>24,packet=ptr(memory,segment+0x50)+(Math.imul(row,get(memory,segment+8))+column)*8;
 put(memory,descriptor+24,(get(memory,packet+4)<<4)+get(memory,0x90b988));put(memory,descriptor+20,cell);return distance;
}
export function updateRawVehicleContacts(body,runtime){
 const {memory,scratchBase}=runtime,frame=scratchBase-124,originalY=Math.abs(memory.readInt16LE(body+0x182)),originalDirection=Math.abs(memory.readInt16LE(body+0x18a));let side=memory[body+0x64f],queries=0,hits=0;
 for(let attempt=0;attempt<2;attempt++){
  cacheRotation(body,runtime);
  for(let i=0;i<4;i++){const descriptor=body+0x180+i*28;word(memory,descriptor+10,side?-originalDirection:originalDirection);word(memory,descriptor+2,side?-originalY:originalY);buildRawWheelProbe(body,descriptor,body+0x1f0+i*76,0x7132e0+i*72,{...runtime,scratchBase:frame-56});}
  const fractions=[];for(let i=0;i<4;i++){const query=0x7132e0+i*72,output=0x713400+i*40;word(memory,query+68,0);fractions[i]=queryRawTerrain(body,query,output,0x1010000,runtime);put(memory,frame+100+i*4,fractions[i]);}
  const flags=Array.from({length:4},(_,i)=>get(memory,0x71341c+i*40));
  for(let i=0;i<4;i++){const output=0x713400+i*40,fraction=queryRawPlacedModelSphere(body,0x7132e0+i*72,output,65536,{...runtime,scratchBase:frame-76});if((fraction>>>0)<(fractions[i]>>>0)){fractions[i]=fraction;put(memory,frame+100+i*4,fraction);}else put(memory,output+28,flags[i]);}
  cacheRotation(body,runtime);let any=false;
  for(let i=0;i<4;i++){const wheel=body+0x324+i*200,value=resolveRawWheelContact(body,body+0x180+i*28,fractions[i],0x7132e0+i*72,0x713400+i*40,body+0x1f0+i*76,{...runtime,scratchBase:frame-20});queries++;if(value<0){memory[wheel]=0;put(memory,body+0x1f0+i*76+72,-1);}else{memory[wheel]|=1;any=true;hits++;}}
  if(any){memory[body+0x64f]=side;return {contact:true,attempts:attempt+1,side,queries,hits};}side=side===0?1:0;
 }
 return {contact:false,attempts:2,side:memory[body+0x64f],queries,hits};
}
