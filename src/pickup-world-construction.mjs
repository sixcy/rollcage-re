import {nativeGlobalAddress} from './native-global-address.mjs';
import {createRawBody,initializeRawBody} from './raw-body-construction.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);

export function initializePickupWorldTables(memory){
 const configuration=Buffer.from('00000000000000000000000000000000000000000000000000000000801a0600000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000060000000600000001000000010000000000','hex');
 configuration.copy(memory,0x5ec9f8);configuration.copy(memory,0x5eaf38);memory.fill(255,0x5dd020,0x5dd030);return memory;
}

//47c6c0 builds eight120-byte renderer descriptors. The last seed load occurs
//before its final UV-byte/color stores, preserving controller/global aliases.
export function initializePickupRenderRecords(body,{memory:m}){
 const bank=ptr(m,0x90b988),auxiliary=ptr(m,0x90b990);
 for(let i=0;i<8;i++){
  const row=body+0x190+i*120;m[row+7]=0x98;m[row+3]=12;
  const texture=bank+((m.readUInt16LE(auxiliary+0x2e)+(i<2?0x40:0x63))<<4);
  put(m,row+0x20,get(m,texture));put(m,row+0x3c,get(m,texture+4));word(m,row+0x58,m.readUInt16LE(texture+8));word(m,row+0x74,m.readUInt16LE(texture+10));
  const first=m[row+0x3c],second=m[row+0x58];let lastSeed;
  if(i<6){m[row+0x58]=first;const high=m[row+0x3d];m[row+0x3c]=second;const other=m[row+0x59];m[row+0x59]=high;m[row+0x3d]=other;}
  else if(i===6){m[row+0x3c]=second;m[row+0x58]=first;const high=m[row+0x3d],other=m[row+0x59];m[row+0x3d]=other;m[row+0x59]=high;}
  else{m[row+0x3c]=second;const other=m[row+0x59];m[row+0x58]=first;const high=m[row+0x3d];m[row+0x3d]=other;lastSeed=Math.imul(get(m,0x5ec958),0x41a7);m[row+0x59]=high;}
  put(m,row+4,0x9a7f7f7f);
  if(i===7){lastSeed&=0x7fffffff;put(m,0x5ec958,lastSeed);word(m,body+0x552,(lastSeed>>>16)&255);}
 }
}

//431950: source model from the signed resource index at runtime pack metadata46.
export function initializePickupRespawnControllers(runtime){
 const{memory:m,scratchBase}=runtime,frame=scratchBase-20,auxiliary=ptr(m,0x90b990),pack=ptr(m,0x90b98c),count=m[auxiliary+0xf7],metadata=ptr(m,pack+0x58),model=ptr(m,ptr(m,pack+0x18)+m.readInt16LE(metadata+0x46)*4);
 for(let i=0;i<count;i++){
  const body=createRawBody(model,0x8e1a,0x18c,0,{...runtime,scratchBase:frame-12});put(m,0x91d480+i*4,body);initializeRawBody(body,0x5eaf38,{...runtime,scratchBase:frame-4});removeBodySpatial(body,runtime);put(m,body+0x180,0);
 }
 const queue=Buffer.from(m.subarray(0x5dd020,0x5dd030));queue.copy(m,0x91d498);word(m,0x91d4b0,0);queue.copy(m,0x91d4a8,0,8);
}

//47b580: mode/option gate, allocated pointer list and actual common constructors.
export function initializeWorldPickups(runtime){
 const{memory:m,scratchBase,handlers={}}=runtime,frame=scratchBase-28,pack=ptr(m,0x90b98c),session=ptr(m,0x5ecb1c),count=m[pack+0x36];
 if(!m[session+0xa86]&&m[session+0x551]!==3&&m[session+0x551]!==8){put(m,nativeGlobalAddress(m, 0x902024),0);return;}
 const metadata=ptr(m,pack+0x58),model=ptr(m,ptr(m,pack+0x18)+m.readInt16LE(metadata+12)*4);
 if(typeof handlers.allocate!=='function')throw Error('Pickup construction requires mapped CRT allocation.');const result=handlers.allocate(count*4,runtime),list=(typeof result==='number'?result:result.eax)>>>0;if(list)m.fill(0,list,list+count*4);put(m,nativeGlobalAddress(m, 0x902020),list);
 for(let i=0;i<count;i++){
  const body=createRawBody(model,0x8c0a,0x554,0,{...runtime,scratchBase:frame-12});put(m,list+i*4,body);initializeRawBody(body,0x5ec9f8,{...runtime,scratchBase:frame-4});removeBodySpatial(body,runtime);put(m,body+0x180,0x820001);put(m,body+0x11c,0);initializePickupRenderRecords(body,runtime);
 }
 put(m,nativeGlobalAddress(m, 0x902024),count);initializePickupRespawnControllers(runtime);
}
