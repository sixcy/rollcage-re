// Serialized model collision records consumed by FUN_00429360 / 00424040.
// Names describe observed uses; unassigned fields remain raw.
import {unpackCollisionNormal} from './collision-grid.mjs';
export function parseModelCollision(data,model) {
 const range=(p,n,label)=>{if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>data.length)throw Error(`Model collision ${label} exceeds resource bounds.`);};
 range(model.offset,0x50,'header');
 const count=data[model.offset+0x27];
 if(!count||model.type!=='MODC')return {modelIndex:model.index,available:false,shapes:[],faces:[],faceRecords:[],edges:[],vertices:[]};
 const shapeBase=model.offset+data.readUInt16LE(model.offset+0x34),faceRecordBase=model.offset+data.readUInt16LE(model.offset+0x38),edgeBase=model.offset+data.readUInt16LE(model.offset+0x3a);
 range(shapeBase,count*20,'shape table');
 const collisionModelOffset=model.offset+data.readUInt16LE(model.offset+0x1c);
 range(collisionModelOffset,0x50,'face-model header');
 const faceBase=collisionModelOffset+data.readUInt32LE(collisionModelOffset+0xc),faceEnd=collisionModelOffset+data.readUInt32LE(collisionModelOffset+0x10);
 const faceCount=(faceEnd-faceBase)/8;
 if(!Number.isSafeInteger(faceCount)||faceCount<0)throw Error('Model collision face block has an invalid extent.');
 range(faceBase,faceCount*8,'face array');
 const faces=Array.from({length:faceCount},(_,index)=>{
  const p=faceBase+index*8,indices=[...data.subarray(p,p+4)],packedNormal=data.readUInt32LE(p+4);
  if(indices.some((value,i)=>!value&&i!==3))throw Error(`Model collision face ${index} has an invalid vertex.`);
  return {index,offset:p,indices,triangle:indices[3]===0,packedNormal,normalQ8:unpackCollisionNormal(packedNormal)};
 });
 const shapes=Array.from({length:count},(_,index)=>{
  const p=shapeBase+index*20,control=data.readUInt32LE(p+16),faceCount=(control>>>16)&31;
  return {index,offset:p,center:[0,2,4].map(delta=>data.readInt16LE(p+delta)),slot:data.readUInt32LE(p+12)&15,control,
   faceStart:control&255,faceCount,kind:faceCount===0?'disabled':faceCount===1?'point':faceCount===2?'edge':'polyhedron',raw:Buffer.from(data.subarray(p,p+20))};
 });
 const faceRecords=new Map(),edges=new Map();
 const edge=index=>{
  if(edges.has(index))return;
  const p=edgeBase+index*8;range(p,8,'edge record');
  const indices=[data[p+4],data[p+5]];
  if(indices.some(value=>!value))throw Error(`Model collision edge ${index} has an invalid vertex.`);
  const packedNormal=data.readUInt32LE(p);
  edges.set(index,{index,offset:p,indices,packedNormal,normalQ8:unpackCollisionNormal(packedNormal),raw:Buffer.from(data.subarray(p,p+8))});
 };
 for(const shape of shapes) {
  if(shape.faceCount<2){shape.records=[];continue;}
  const count=shape.faceCount===2?1:shape.faceCount;shape.records=[];
  for(let i=0;i<count;i++) {
   const index=shape.faceStart+i,p=faceRecordBase+index*9;range(p,9,'face/edge lookup');shape.records.push(index);
   if(shape.faceCount===2){edge(data[p]);faceRecords.set(index,{index,offset:p,edgeIndex:data[p],raw:Buffer.from(data.subarray(p,p+9))});continue;}
   const faceIndex=data[p+8],face=faces[faceIndex];if(!face)throw Error(`Model collision record ${index} references missing face ${faceIndex}.`);
   const edgeIndices=[...data.subarray(p,p+(face.triangle?3:4))];edgeIndices.forEach(edge);
   faceRecords.set(index,{index,offset:p,faceIndex,edgeIndices,raw:Buffer.from(data.subarray(p,p+9))});
  }
 }
 const vertexCount=Math.max(model.vertexCount,...faces.flatMap(face=>face.indices),...([...edges.values()].flatMap(edge=>edge.indices)));
 range(model.verticesOffset,vertexCount*8,'referenced vertex array');
 const vertices=Array.from({length:vertexCount},(_,index)=>[0,2,4,6].map(delta=>data.readInt16LE(model.verticesOffset+index*8+delta)));
 return {modelIndex:model.index,available:true,shapeBase,faceRecordBase,edgeBase,collisionModelOffset,faceBase,shapes,faces,faceRecords:[...faceRecords.values()].sort((a,b)=>a.index-b.index),edges:[...edges.values()].sort((a,b)=>a.index-b.index),vertices};
}
// Loader 0x44c2b0 initializes the +0x194 configuration pointer, +0x199 yaw
// byte and +0x19a class from an ordinary BTP placement. These are distinct from
// render materials and the full quaternion used for the visible model.
export function readPlacementCollision(data,placement,collision) {
 if(placement.type!==0)throw Error('Placement collision settings require an ordinary model placement.');
 const raw=placement.raw;
 if(!Buffer.isBuffer(raw)||raw.length<56)throw Error('Placement collision record is truncated.');
 if(data.length<0x8c)throw Error('Placement collision header is truncated.');
 const configurationStart=raw.readUInt16LE(20),configurationBase=data.readUInt32LE(0x88)+configurationStart*4;
 if(configurationBase<0||configurationBase+collision.shapes.length*4>data.length)throw Error('Placement collision configuration exceeds resource bounds.');
 const configurations=collision.shapes.map((shape,index)=>{
  const offset=configurationBase+index*4,raw=Buffer.from(data.subarray(offset,offset+4));
  return {index,offset,type:raw[3]&15,flags:data.readUInt32LE(offset),raw};
 });
 return {placementIndex:placement.index,modelIndex:placement.modelIndex,position:placement.position.slice(),yaw:(raw.readInt16LE(16)>>4)&255,
  class:raw[31],configurationStart,configurationBase,configurations};
}
