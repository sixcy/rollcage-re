import {createRawBody,initializeRawBody,registerRawBodySpatial} from './raw-body-construction.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {quaternionMatrix} from './fixed-math.mjs';
import {lookupDestructionAngle} from './placed-object-destruction.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
function save(runtime,base,registers){for(const[name,offset]of registers)if(runtime.entryRegisters?.[name]!==undefined)put(runtime.memory,base+offset,runtime.entryRegisters[name]);}
//492ae0 directly fills three independent axis components, preserving the
//last nonzero axis's half-angle for W; it does not compose Euler rotations.
export function initializeAuthoredObjectQuaternion(x,y,z,output,runtime){const{memory:m}=runtime;let angle=0;put(m,output+4,0);put(m,output+8,0);put(m,output+12,0);
  if(x){angle=x>>1;put(m,output+4,lookupDestructionAngle(angle,true,runtime));}
  if(y){angle=Math.imul(y,0x6488)>>9;put(m,output+8,lookupDestructionAngle(angle,true,runtime));}
  if(z){angle=Math.imul(z,0x6488)>>9;put(m,output+12,lookupDestructionAngle(angle,true,runtime));}
  put(m,output,lookupDestructionAngle(angle,false,runtime));
}
function construct(authored,kind,variant,runtime){const{memory:m,scratchBase:S}=runtime,animated=variant===0,empty=variant===3,L=S-(animated?16:empty?8:12);
  save(runtime,S,animated?[['EBX',-4],['EBP',-8],['ESI',-12],['EDI',-16]]:empty?[['ESI',-4],['EDI',-8]]:[['EBX',-4],['ESI',-8],['EDI',-12]]);
  const pack=empty?0:ptr(m,0x90b990),models=empty?0:ptr(m,pack+24),model=empty?0:ptr(m,models+m[authored+3]*4),size=animated?0x18c:empty?0x188:0x180;
  const flags=animated?(kind===20?0x8e14:kind|0xe00):variant===1?0xe1d:empty?0x8020:0x8c18;
  put(m,L-4,0);put(m,L-8,size);put(m,L-12,[0x40fee5,0x46e835,0x429e25,0x44ac37][variant]);
  const body=createRawBody(model,flags,size,0,{...runtime,scratchBase:L-12});
  if(!empty)put(m,body+0x148,animated?(kind===31?0x40fdb0:kind===35?0x40fe30:0x40fcb0):variant===1?0x46e4e0:0);
  const config=variant===1?0x5ec4f8:variant===2?0x5eae48:0x5ea3e8,initEntry=L-(animated||empty?4:12);put(m,initEntry,[0x40ff1d,0x46e84d,0x429e3d,0x44ac48][variant]);initializeRawBody(body,config,{...runtime,scratchBase:initEntry});
  if(!empty){const q=body+0x58,qEntry=L-(animated?12:20);put(m,qEntry+8,q);put(m,qEntry+4,m.readInt16LE(authored+18));put(m,qEntry,[0x40ff33,0x46e863,0x429e53][variant]);initializeAuthoredObjectQuaternion(m.readInt16LE(authored+14),m.readInt16LE(authored+16),m.readInt16LE(authored+18),q,{...runtime,scratchBase:qEntry});put(m,L-4,[0x40ff43,0x46e873,0x429e63][variant]);quaternionMatrix([0,4,8,12].map(o=>get(m,q+o))).forEach((v,i)=>word(m,body+0xc4+i*2,v));}
  put(m,L-4,[0x40ff4a,0x46e87a,0x429e6a,0x44ac4f][variant]);removeBodySpatial(body,runtime);
  for(const o of[0,2,4])put(m,body+0x34+o*2,m.readInt16LE(authored+8+o)<<16);
  put(m,L-4,[0x40ff6f,0x46e89f,0x429e8f,0x44ac74][variant]);registerRawBodySpatial(body,runtime);
  if(!empty){word(m,body+0x138,m[authored+0x26]);word(m,body+0x13a,m[authored+0x27]);}return body;
}
export function constructAnimatedRaceObject(authored,kind,runtime){return construct(authored,kind,0,runtime);}
export function constructFourShapeRaceObject(authored,runtime){return construct(authored,29,1,runtime);}
export function constructOptionalRouteRaceObject(authored,runtime){return construct(authored,24,2,runtime);}
export function constructEmptyRaceObject(authored,runtime){return construct(authored,32,3,runtime);}
//429c90. Destination is captured before construction; count is incremented
//from the live global after construction, before that captured slot is written.
export function appendAuthoredRaceObject(authored,runtime){const{memory:m,scratchBase:S}=runtime,index=get(m,0x91e778),list=ptr(m,0x91e77c),destination=list+Math.imul(index,4)>>>0;save(runtime,S,[['ESI',-4]]);
  const selected=(m[authored+0x1f]-3)>>>0,target=selected<=8?ptr(m,0x429d30+selected*4):0x429d20,child={...runtime,scratchBase:S-8,entryRegisters:{...runtime.entryRegisters,ESI:destination}};let result;
  if(target===0x429cb2){put(m,S-8,0x429cbc);result=constructAnimatedRaceObject(authored,25,child);}
  else if(target===0x429cc6){put(m,S-8,0x429ccb);result=constructFourShapeRaceObject(authored,child);}
  else if(target===0x429cd5){put(m,S-8,0x429cdf);result=constructAnimatedRaceObject(authored,31,child);}
  else if(target===0x429ce9){put(m,S-8,0x429cf3);result=constructAnimatedRaceObject(authored,20,child);}
  else if(target===0x429cfd){put(m,S-8,0x429d02);result=constructEmptyRaceObject(authored,child);}
  else if(target===0x429d0c){put(m,S-8,0x429d16);result=constructAnimatedRaceObject(authored,35,child);}
  else if(target===0x429d20){put(m,S-8,0x429d25);result=constructOptionalRouteRaceObject(authored,child);}
  else throw Error('Unsupported mutable authored-object jump target0x'+target.toString(16));
  put(m,0x91e778,get(m,0x91e778)+1);put(m,destination,result);return result;
}
