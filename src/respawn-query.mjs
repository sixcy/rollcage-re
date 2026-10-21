// Respawn placement probe47d040 and obstruction test47d710. Complete body bytes
// remain caller-owned so copied and stale embedded fields retain their layout.
import {quaternionMatrix} from './fixed-math.mjs';
import {prepareBodyShapeCache} from './body-shape-cache.mjs';

const vector=(bytes,p)=>[0,4,8].map(offset=>bytes.readInt32LE(p+offset));
const put=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value|0,p+index*4));
const record=(pool,id)=>{if(!Number.isInteger(id)||id<0||id>=pool.records.length/72)throw Error('Respawn query requires an in-bounds shape record.');return pool.records.subarray(id*72,(id+1)*72);};
const countOf=body=>body.bytes.readInt8(0x10c);
const shapeId=(body,index)=>body.bytes.readUInt8(0x140+index);
const aggregate=(body,pool)=>record(pool,shapeId(body,countOf(body)));

// Cache arithmetic only reads these fields and writes cache time. Other bytes
// in the temporary object are preserved by the raw copy, not reconstructed.
export function respawnShapeCacheView(body) {
 const bytes=body.bytes,view={};
 for(const [name,p]of [['flags',0],['frameTimeQ16',0x118]])Object.defineProperty(view,name,{get:()=>bytes.readInt32LE(p)});
 for(const [name,p]of [['position',0x34],['linearVelocity',0x68],['angularVelocity',0xb8]])Object.defineProperty(view,name,{get:()=>vector(bytes,p)});
 Object.defineProperties(view,{
  rotation:{get:()=>Array.from({length:9},(_,index)=>bytes.readInt16LE(0xc4+index*2))},
  collisionCount10c:{get:()=>bytes.readUInt8(0x10c)},
  collisionIds:{value:new Proxy({}, {get:(_,key)=>Number.isInteger(Number(key))?shapeId(body,Number(key)):undefined})},
  collisionCache114:{get:()=>bytes.readInt32LE(0x114),set:value=>bytes.writeInt32LE(value|0,0x114)}
 });return view;
}

export function queryRespawnObstruction(probe,originalBody,pool,{mode,physicalGroup,terrainQuery,modelQuery,output,maxShapeQueries=256}) {
 if(typeof terrainQuery!=='function'||typeof modelQuery!=='function'||!output)throw Error('Respawn obstruction requires explicit geometry queries and retained output.');
 let index=mode?countOf(probe):0,remaining=mode?1:countOf(probe)-1,queries=0;
 if(remaining!==0)do{
  if(queries++>=maxShapeQueries)throw Error('Respawn obstruction shape-query workflow budget exceeded.');
  const sphere=record(pool,shapeId(probe,index));terrainQuery(sphere,probe,0,output);if(output.flags)return 1;
  modelQuery(sphere,probe,0,output);if(output.flags)return 1;
  index++;remaining=(remaining-1)|0;
 }while(remaining!==0);
 const excluded=type=>type===4||type===22||type===12||type===17;
 if(excluded(probe.bytes.readInt32LE(0)&511))return 0;
 const bodies=physicalGroup.bodies,count=physicalGroup.count??bodies.length,radius=aggregate(probe,pool).readInt32LE(0x40),position=vector(probe.bytes,0x34);
 for(let index=0;index<count;index++){
  const other=bodies[index];if(other===originalBody||excluded(other.bytes.readInt32LE(0)&511))continue;
  // Native logical shifts intentionally make negative differences large.
  const delta=position.map((value,axis)=>((value-other.bytes.readInt32LE(0x34+axis*4))|0)>>>8),[x,y,z]=delta;
  if(((x+y+z)>>>0)>0x20000)continue;
  const sum=(radius+aggregate(other,pool).readInt32LE(0x40))|0;
  if(((Math.imul(x,x)+Math.imul((y+z)|0,z))>>>0)<(Math.imul(sum,sum)>>>0))return 1;
 }
 return 0;
}

// Geometry append/selection remain explicit hooks. Their inputs correspond to
// the actual cloned cache and parsed-node lookup; no candidate answer is guessed.
export function probeRespawnPlacementBytes(sourceBody,positionQ16,{pool,clone,quaternion=null,rotation,mode,output,terrainState,scratch={},timeOptions={},handlers}) {
 for(const name of ['lookup','appendTerrain','appendModels','testGeometry'])if(typeof handlers?.[name]!=='function')throw Error(`Respawn placement requires ${name}.`);
 const source=sourceBody.bytes;if(!Buffer.isBuffer(source)||source.length<0x180)throw Error('Respawn placement requires complete source body bytes.');const copySize=(source.readInt32LE(0)&511)===3?0x3e78:0x180;
 if(!Buffer.isBuffer(source)||source.length<copySize||!Buffer.isBuffer(clone?.bytes)||clone.bytes.length<copySize)throw Error('Respawn placement requires complete source and retained clone bytes.');
 if(quaternion!==null){
  if(!Buffer.isBuffer(quaternion)||quaternion.length<16||!Buffer.isBuffer(rotation)||rotation.length<18)throw Error('Respawn orientation requires quaternion and matrix storage.');
  const matrix=quaternionMatrix(Array.from({length:4},(_,index)=>quaternion.readInt32LE(index*4)));matrix.forEach((value,index)=>rotation.writeInt16LE(value, index*2));
 }
 source.copy(clone.bytes,0,0,copySize);
 if(quaternion!==null){rotation.copy(clone.bytes,0xc4,0,18);quaternion.copy(clone.bytes,0x58,0,16);}
 clone.bytes.writeInt32LE(0x7fffffff,0x120);const count=countOf(sourceBody);scratch.shapeCount=count;
 for(let index=0;index<=count;index++){
  const from=record(pool,shapeId(sourceBody,index)),allocated=pool.allocate();clone.bytes.writeUInt8(allocated.id,0x140+index);from.copy(allocated.record);
 }
 put(clone.bytes,0x34,positionQ16);
 prepareBodyShapeCache(respawnShapeCacheView(clone),clone.bytes.readInt32LE(0x118),pool.records,timeOptions);
 clone.bytes.writeInt32LE(0,0x110);clone.bytes.writeUInt32LE(0x70ed30,0x154);
 const sphere=aggregate(clone,pool);output.value=-1;put(sphere,8,vector(clone.bytes,0x34).map(value=>value>>8));put(sphere,0x14,[0,0,0]);if(mode===2)sphere.writeInt32LE(8000,0x40);
 clone.bytes.writeInt32LE(0,0x15c);
 // These native globals are embedded fields in the retained clone. The region
 // helper and later callbacks must observe the same storage after each call.
 for(const [name,p,width]of [['count',0x15c,2],['closestId',0x11c,4],['closestDistanceSquared',0x120,4]])Object.defineProperty(terrainState,name,{configurable:true,enumerable:true,get:()=>width===2?clone.bytes.readUInt16LE(p):clone.bytes.readInt32LE(p),set:value=>width===2?clone.bytes.writeUInt16LE(value&65535,p):clone.bytes.writeInt32LE(value|0,p)});
 const registration=handlers.lookup(vector(sphere,8).map(value=>value<<8),clone);scratch.registration=registration;let accepted=registration.outside?0:1;
 if(!registration.outside){
  const center=vector(sphere,8).map(value=>value>>8<<16>>16),radius=sphere.readInt32LE(0x40)>>8;
  for(const region of registration.regions)handlers.appendTerrain(clone,sphere,region,center,Math.imul(radius,radius),terrainState);
  clone.bytes.writeUInt16LE(terrainState.count&65535,0x15c);clone.bytes.writeUInt32LE((0x70ed30+(terrainState.count&65535)*16)>>>0,0x158);
  if((clone.bytes.readInt32LE(0)&511)!==4)handlers.appendModels(clone,sphere,0);
  output.value=clone.bytes.readInt32LE(0x11c);
 }
 if(handlers.testGeometry(clone,sourceBody,mode))accepted=0;
 for(let index=countOf(clone);index>=0;index--)pool.release(shapeId(clone,index));
 return accepted;
}
