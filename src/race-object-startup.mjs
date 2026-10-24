import {nativeGlobalAddress} from './native-global-address.mjs';
import {registerRawBodyShapes} from './raw-body-construction.mjs';
import {initializeRaceObjectType20} from './race-object-update.mjs';
import tables from './race-object-startup-tables.json' with {type:'json'};
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
export function initializeRaceObjectStartupTables(memory){for(const t of tables)Buffer.from(t.bytesHex,'hex').copy(memory,Number(t.address));return memory;}
function save(runtime,name,address){if(runtime.entryRegisters?.[name]!==undefined)put(runtime.memory,address,runtime.entryRegisters[name]);}
function appendPhysical(body,m){const index=m.readUInt16LE(nativeGlobalAddress(m, 0x902bc4)),array=ptr(m,nativeGlobalAddress(m, 0x902bc0));put(m,array+index*4,body);put(m,array+index*4+4,0);word(m,nativeGlobalAddress(m, 0x902bc4),m.readUInt16LE(nativeGlobalAddress(m, 0x902bc4))+1);}
function appendObjectEffect(body,m){const index=get(m,nativeGlobalAddress(m,0x82e900));put(m,nativeGlobalAddress(m,0x82e880)+Math.imul(index,8),body);put(m,nativeGlobalAddress(m,0x82e884)+Math.imul(index,8),0);put(m,nativeGlobalAddress(m,0x82e900),get(m,nativeGlobalAddress(m,0x82e900))+1);}
function activateRoute(body,m){const table=ptr(m,0x9092b4),index=m.readUInt16LE(body+0x138),last=m.readInt16LE(body+0x13a),offset=m.readUInt16LE(table+index*2);put(m,body,get(m,body)|0x2000);put(m,body+0x134,table+offset);put(m,body+0x138,0);word(m,body+0x13c,0);m[body+0x13e]=0;m[body+0x13f]=last&255;}
function shapes(body,count,descriptor,returnAddress,runtime){const{memory:m,scratchBase:S}=runtime;put(m,S-8,body);put(m,S-12,descriptor);put(m,S-16,returnAddress);registerRawBodyShapes(body,count,descriptor,{...runtime,scratchBase:S-16});}
//40ff90. Type20 is already physically listed here without shape allocation;
//other types allocate their real original descriptors before route publication.
export function initializeAnimatedRaceObject(body,runtime){const{memory:m,scratchBase:S}=runtime;save(runtime,'ESI',S-4);const kind=get(m,body)&511;put(m,body+0x184,1);
  if(kind===20){appendPhysical(body,m);put(m,body+0x130,0);}
  else if(kind===35)shapes(body,1,0x5ea4c0,0x40ffea,runtime);
  else{shapes(body,1,0x5ea4e0,0x40ffbe,runtime);appendObjectEffect(body,m);}
  activateRoute(body,m);
}
//46e8c0. Four shapes followed by route state, then the effect list append.
export function initializeFourShapeRaceObject(body,runtime){const{memory:m,scratchBase:S}=runtime;save(runtime,'ESI',S-4);shapes(body,4,0x5ec960,0x46e8d3,runtime);activateRoute(body,m);appendObjectEffect(body,m);}
//429eb0. The authored route index is captured before physical-list writes;
//the zero-index path intentionally leaves every body field unchanged.
export function initializeOptionalRouteRaceObject(body,runtime){const{memory:m,scratchBase:S}=runtime;save(runtime,'ESI',S-4);const index=m.readUInt16LE(body+0x138);if(!index)return;
  appendPhysical(body,m);const last=m.readInt16LE(body+0x13a);put(m,body+0x130,0);const table=ptr(m,0x9092b4),route=table+m.readUInt16LE(table+index*2);m[body+0x13f]=last&255;put(m,body+0x134,route);put(m,body,get(m,body)|0x2000);put(m,body+0x138,0);word(m,body+0x13c,0);m[body+0x13e]=0;
}
//429d60. Count and object-list base are captured, while each object pointer and
//the original byte/target dispatch tables are read at their native loop points.
export function initializeRaceObjectList(runtime){const{memory:m,scratchBase:S}=runtime;save(runtime,'EBX',S-4);let list=ptr(m,0x91e77c);save(runtime,'ESI',S-8);let remaining=ptr(m,0x91e778);if(!remaining)return;save(runtime,'EDI',S-12);
  do{const body=ptr(m,list),selector=((get(m,body)&511)-20)>>>0;let target=0x429dc8;if(selector<=15)target=ptr(m,0x429ddc+m[0x429df0+selector]*4);
    const child={...runtime,scratchBase:S-16,entryRegisters:{...runtime.entryRegisters,EBX:list,ESI:remaining,EDI:body}};
    if(target===0x429d9b){put(m,S-16,0x429da2);initializeRaceObjectType20(body,child);put(m,S-16,0x429da9);initializeAnimatedRaceObject(body,child);}
    else if(target===0x429d92){put(m,S-16,0x429d99);initializeAnimatedRaceObject(body,child);}
    else if(target===0x429dab){put(m,S-16,0x429db2);initializeFourShapeRaceObject(body,child);}
    else if(target===0x429db4){put(m,body+0x180,0);put(m,body+0x184,0);}
    else if(target===0x429dc8){put(m,S-16,0x429dcf);initializeOptionalRouteRaceObject(body,child);}
    else throw Error('Unsupported mutable native object-startup jump target0x'+target.toString(16));
    list=list+4>>>0;remaining=remaining-1>>>0;
  }while(remaining);
}
