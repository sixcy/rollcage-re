//Coherent byte-backed bridge between structured47d440 and raw progression /
//449760 references. This supplies views and bindings, not native constructors.
import {applyRespawn} from './respawn-apply.mjs';
import {updateRespawnProgress} from './respawn-progress.mjs';
import {updateLapAdvance} from './lap-timing.mjs';
import {finishRaceProgress} from './race-completion.mjs';

const indexFor=key=>typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)?Number(key):null;
export function packNativeTerrainReference(value){
 if(Number.isInteger(value))return value|0;
 if(!value||!Number.isInteger(value.sector)||value.sector<0||value.sector>255||!Number.isInteger(value.column)||value.column< -128||value.column>127||!Number.isInteger(value.row)||value.row< -32768||value.row>32767)throw Error('Native terrain reference requires an integer or sector byte, signed column byte and signed row word.');
 return(value.sector|((value.column&255)<<8)|((value.row&65535)<<16))|0;
}
export function createRespawnRuntime({memory,recordCount,bodyStorage,routeAddresses=new Map(),scratchBase,trackBasis,completionHandlers={},spatialRegistry,spatialHandlers={}}={}) {
 if(!Buffer.isBuffer(memory)||!Number.isInteger(recordCount)||recordCount<0||recordCount>65535||!Array.isArray(bodyStorage)||!(routeAddresses instanceof Map))throw Error('Respawn runtime requires explicit memory, record capacity, body storage and route-address mapping.');
 const range=(address,length,label)=>{if(!Number.isInteger(address)||!Number.isInteger(length)||address<0||length<0||address+length>memory.length)throw Error(`Respawn runtime ${label} exceeds supplied memory.`);};
 const read=(address,type)=>{range(address,type==='u8'?1:type==='u16'||type==='s16'?2:4,'read');return type==='u8'?memory.readUInt8(address):type==='u16'?memory.readUInt16LE(address):type==='s16'?memory.readInt16LE(address):type==='u32'?memory.readUInt32LE(address):memory.readInt32LE(address);};
 const write=(address,type,value)=>{range(address,type==='u8'?1:type==='u16'||type==='s16'?2:4,'write');if(!Number.isInteger(value))throw Error('Respawn runtime scalar write requires an integer.');if(type==='u8')memory.writeUInt8(value&255,address);else if(type==='u16')memory.writeUInt16LE(value&65535,address);else if(type==='s16')memory.writeInt16LE(value<<16>>16,address);else if(type==='u32')memory.writeUInt32LE(value>>>0,address);else memory.writeInt32LE(value|0,address);};
 const scalar=(object,name,address,type)=>Object.defineProperty(object,name,{enumerable:true,get:()=>read(typeof address==='function'?address():address,type),set:value=>write(typeof address==='function'?address():address,type,value)});
 const arrays=new Map();
 function arrayAt(address,length,type){
  const width=type==='u8'?1:type==='u16'||type==='s16'?2:4,key=`${address}:${length}:${type}`;if(arrays.has(key))return arrays.get(key);
  const array=new Proxy(Array(length).fill(0),{
   get:(target,key,receiver)=>{const index=indexFor(key);if(index!==null)return index<length?read(address+index*width,type):undefined;return Reflect.get(target,key,receiver);},
   set:(target,key,value,receiver)=>{const index=indexFor(key);if(index!==null){if(index>=length)throw Error('Respawn runtime array write exceeds its native span.');write(address+index*width,type,value);return true;}if(key==='length'&&value!==length)throw Error('Respawn runtime arrays have fixed native spans.');return Reflect.set(target,key,value,receiver);},
   deleteProperty:()=>{throw Error('Respawn runtime array elements alias native bytes and cannot be deleted.');}
  });arrays.set(key,array);return array;
 }
 const vector=(object,name,address,length,type)=>Object.defineProperty(object,name,{enumerable:true,get:()=>arrayAt(address,length,type),set:values=>{if(!Array.isArray(values)||values.length!==length)throw Error(`Respawn runtime ${name} requires exactly${length} elements.`);for(let index=0;index<length;index++)write(address+index*(type==='s16'?2:4),type,values[index]);}});
 const bodies=new Map(),controllers=new Map(),routes=new Map(),points=new Map(),buckets=new Map(),records=new Map(),packs=new Map(),sessions=new Map(),storage=new Map();
 range(0x909300,recordCount*0x30c,'record capacity');
 for(const {address,length} of bodyStorage){range(address,length,'body storage');if(length<0x723||storage.has(address))throw Error('Respawn runtime requires unique complete reached body storage.');storage.set(address,length);}
 const pointer=value=>{if(Number.isInteger(value)){range(value,0,'pointer');return value>>>0;}if(value&&Number.isInteger(value.address)){range(value.address,0,'object pointer');return value.address>>>0;}const mapped=routeAddresses.get(value);if(Number.isInteger(mapped)){range(mapped,0,'mapped route pointer');return mapped>>>0;}throw Error('Respawn runtime object has no supplied native address.');};
 function pointAt(address){
  if(points.has(address))return points.get(address);range(address,16,'route point');const point={address,bytes:memory.subarray(address,address+16)};vector(point,'position',address,3,'s16');points.set(address,point);return point;
 }
 function routeAt(address){
  if(address===0)return null;if(routes.has(address))return routes.get(address);range(address,12,'route');const route={address,bytes:memory.subarray(address,address+12),pointAt:index=>{if(!Number.isInteger(index))throw Error('Respawn route point index must be an integer.');return pointAt((read(address+8,'u32')+index*16)>>>0);}};
  scalar(route,'count',address,'u16');scalar(route,'reverseByte2',address+2,'u8');scalar(route,'byte05',address+5,'u8');Object.defineProperty(route,'points',{enumerable:true,get:()=>Array.from({length:route.count},(_,index)=>route.pointAt(index))});routes.set(address,route);return route;
 }
 function bucketAt(address){
  if(buckets.has(address))return buckets.get(address);range(address,12,'spatial bucket');const bucket={address};scalar(bucket,'headId',address+8,'u16');buckets.set(address,bucket);return bucket;
 }
 function controllerAt(address){
  if(address===0x12345678)return address;if(address===0)throw Error('Respawn runtime reached a null controller pointer.');if(controllers.has(address))return controllers.get(address);range(address,0x40,'controller');const controller={address,bytes:memory.subarray(address,address+0x40)};
  Object.defineProperty(controller,'body',{enumerable:true,get:()=>bodyAt(read(address,'u32')),set:value=>write(address,'u32',pointer(value))});
  for(const [name,offset]of [['active4',4],['index5',5],['flags39',0x39],['timer3a',0x3a]])scalar(controller,name,address+offset,'u8');controllers.set(address,controller);return controller;
 }
 function bodyAt(address){
  if(bodies.has(address))return bodies.get(address);const length=storage.get(address);if(length===undefined)throw Error(`Respawn runtime body0x${address.toString(16)} has no supplied storage extent.`);const body={address,bytes:memory.subarray(address,address+length)};
  for(const [name,offset,type]of [['flags',0,'s32'],['spatialNextId',4,'u16'],['spatialPreviousId',6,'u16'],['collisionFlags',0x110,'s32'],['collisionCache114',0x114,'s32'],['frameTimeQ16',0x118,'s32'],['collisionState128',0x128,'s32'],['field160',0x160,'u16'],['vehicleIndex65e',0x65e,'u16'],['speed668',0x668,'s16'],['field699',0x699,'u8'],['checkpoint6c0',0x6c0,'u16'],['checkpoint6c2',0x6c2,'u16'],['mode718',0x718,'u8']])scalar(body,name,address+offset,type);
  Object.defineProperty(body,'closestTerrain11c',{enumerable:true,get:()=>read(address+0x11c,'s32'),set:value=>write(address+0x11c,'s32',packNativeTerrainReference(value))});
  for(const [name,offset,length,type]of [['position',0x34,3,'s32'],['momentum',0x40,3,'s32'],['angularMomentum',0x4c,3,'s32'],['quaternion',0x58,4,'s32'],['linearVelocity',0x68,3,'s32'],['force',0x74,3,'s32'],['torque',0x80,3,'s32'],['angularVelocity',0xb8,3,'s32'],['rotation',0xc4,9,'s16']])vector(body,name,address+offset,length,type);
  Object.defineProperties(body,{
   controller164:{enumerable:true,get:()=>controllerAt(read(address+0x164,'u32')),set:value=>write(address+0x164,'u32',pointer(value))},
   spatialBucket:{enumerable:true,get:()=>bucketAt(read(address+0xc,'u32')&0xfffffffe),set:value=>write(address+0xc,'u32',pointer(value)|(read(address+0xc,'u32')&1))},
   spatialOutside:{enumerable:true,get:()=>!!(read(address+0xc,'u32')&1),set:value=>write(address+0xc,'u32',(read(address+0xc,'u32')&0xfffffffe)|(value?1:0))}
  });bodies.set(address,body);return body;
 }
 function recordAt(address){
  if(records.has(address))return records.get(address);range(address,0x30c,'vehicle record');const record={address,bytes:memory.subarray(address,address+0x30c)};
  Object.defineProperties(record,{
   body00:{enumerable:true,get:()=>bodyAt(read(address,'u32')),set:value=>write(address,'u32',pointer(value))},
   controller18:{enumerable:true,get:()=>controllerAt(read(address+0x18,'u32')),set:value=>write(address+0x18,'u32',value===0x12345678?value:pointer(value))},
   respawn54:{enumerable:true,get:()=>routeAt(read(address+0x54,'u32')),set:value=>write(address+0x54,'u32',value===null?0:pointer(value))}
  });for(const [name,offset,type]of [['lap1c',0x1c,'u8'],['progress24',0x24,'s32'],['respawn58',0x58,'s32'],['field248',0x248,'u8']])scalar(record,name,address+offset,type);records.set(address,record);return record;
 }
 function packAt(address){
  if(packs.has(address))return packs.get(address);range(address,0x94,'runtime pack');const pack={address};scalar(pack,'checkpointCount44',address+0x44,'u8');scalar(pack,'countByte46',address+0x46,'u8');
  Object.defineProperties(pack,{
   checkpointIds90:{enumerable:true,get:()=>{const start=read(address+0x90,'u32'),length=pack.checkpointCount44*4;range(start,length,'checkpoint ID table');return memory.subarray(start,start+length);}},
   checkpoints70:{enumerable:true,get:()=>{const start=read(address+0x70,'u32');range(start,0,'checkpoint table');return memory.subarray(start);}},
   groups:{enumerable:true,get:()=>{const start=read(address+0x60,'u32');return Array.from({length:pack.countByte46},(_,index)=>routeAt(start+index*12));}}
  });packs.set(address,pack);return pack;
 }
 function sessionAt(address){
  if(sessions.has(address))return sessions.get(address);range(address,0x587,'session');const session={address};for(const [name,offset]of [['mode551',0x551],['vehicleCount54d',0x54d],['mode579',0x579],['lapLimit586',0x586]])scalar(session,name,address+offset,'u8');Object.defineProperty(session,'counters08',{enumerable:true,get:()=>arrayAt(address+8,65536,'u8')});sessions.set(address,session);return session;
 }
 const recordArray=new Proxy(Array(recordCount).fill(null),{get:(target,key,receiver)=>{const index=indexFor(key);return index!==null?index<recordCount?recordAt(0x909300+index*0x30c):undefined:Reflect.get(target,key,receiver);},set:()=>{throw Error('Respawn runtime record pointers are fixed native storage.');}});
 const runtime={memory,records:recordArray};Object.defineProperties(runtime,{session:{enumerable:true,get:()=>sessionAt(read(0x5ecb1c,'u32'))},pack:{enumerable:true,get:()=>packAt(read(0x90b98c,'u32'))},clock90a548:{enumerable:true,get:()=>read(0x90a548,'s32'),set:value=>write(0x90a548,'s32',value)}});
 const wheelStates=new Map();
 function vehicleStateFor(body){
  const address=pointer(body);if(wheelStates.has(address))return wheelStates.get(address);const state={wheels:Array.from({length:4},(_,index)=>{const wheel={};scalar(wheel,'flags',address+0x324+index*200,'u8');scalar(wheel,'spin',address+0x37c+index*200,'s32');return wheel;})};scalar(state,'field650',address+0x650,'s32');wheelStates.set(address,state);return state;
 }
 const stats={applications:0,progressCalls:0,lapCalls:0,finishCalls:0};
 const finish=record=>{stats.finishCalls++;return finishRaceProgress(record.address,{memory,scratchBase,handlers:completionHandlers});};
 const advanceLap=record=>{stats.lapCalls++;return updateLapAdvance(record.bytes,{body:record.body00,clock90a548:runtime.clock90a548});};
 const updateProgress=record=>{stats.progressCalls++;return updateRespawnProgress(record,runtime,{trackBasis,advanceLap,finishProgress:finish});};
 function apply(bodyAddress,{position,quaternion,rotation,progressionPointer,progressionValue,closestTerrain11c}){
  const body=bodyAt(bodyAddress),route=routeAt(pointer(progressionPointer));stats.applications++;
  return applyRespawn(body,{position,quaternion,rotation,progressionPointer:route,progressionValue,closestTerrain11c,vehicleState:vehicleStateFor(body),runtime,spatialRegistry,handlers:{...spatialHandlers,updateProgress44a2e0:updateProgress,advanceLap44a560:advanceLap,finishProgress449760:finish}});
 }
 return {memory,runtime,stats,bodyAt,recordAt,controllerAt,routeAt,pointAt,bucketAt,vehicleStateFor,apply};
}
