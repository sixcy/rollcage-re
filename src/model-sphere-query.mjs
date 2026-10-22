// Native model-shape contact query 0x424040. The caller has already applied
// placement yaw. Output and query.surfaceRef retain the native stale fields.
import {add32,subtract32,multiplyQ16,signedShort} from './fixed-integer.mjs';
import {multiplyQ8} from './sphere-collision.mjs';
import {modelPolygonOutside} from './model-query.mjs';
import {queryPointSphereContact,queryEdgeSphereContact} from './static-sphere-primitives.mjs';
const dot32=(a,b)=>a.reduce((sum,value,i)=>add32(sum,Math.imul(value,b[i])),0);
function fraction(distance,denominator) {
 if(!denominator)throw Error('Model sphere fraction division by zero.');
 const value=(BigInt(distance<<8)<<8n)/BigInt(denominator|0);
 if(value< -2147483648n||value>2147483647n)throw Error('Model sphere fraction division overflows x86 quotient.');
 return Number(value);
}
export function queryModelShapeSphere(collision,shape,query,output,{positionQ16=[0,0,0],maxFractionQ16=65536,roundingMode,nativeState}={}) {
 output.flags=0;
 const count=shape.faceCount&31,radius=query.radiusQ8??query.radius??0;
 if(!count)return maxFractionQ16;
 const relative=query.originQ8.map((value,i)=>subtract32(value,positionQ16[i]>>8)),world=positionQ16.map(value=>value>>16),lookup=new Map(collision.faceRecords.map(record=>[record.index,record]));
 const records=shape.records.map(index=>lookup.get(index)),plane=record=>{
  const face=collision.faces[record.faceIndex],anchor=collision.vertices[face.indices[0]-1];
  return {face,distance:subtract32(dot32(relative.map((value,i)=>subtract32(value,anchor[i]<<8)),face.normalQ8)>>8,radius)};
 };
 if(count>2)for(const record of records) {
  const {face,distance}=plane(record);if(distance<0)continue;
  const approach=dot32(query.deltaQ8,face.normalQ8)>>8;
  if(approach>=0)return maxFractionQ16;
  if(add32(distance,maxFractionQ16===65536?approach:multiplyQ16(approach,maxFractionQ16))>0)return maxFractionQ16;
 }
 const outsideEdges=[];let fallback=-1,bestDistance=-2147483647,bestPoint,bestNormal;
 if(count===2){const id=records[0].raw[0];outsideEdges.push(id,id);}
 else if(count===1)fallback=-99;
 else for(const record of records) {
  const {face,distance}=plane(record);let time=0,point;
  if(distance<0)point=query.originQ8.map((value,i)=>add32(value,Math.imul(-distance|0,face.normalQ8[i])>>8));
  else {
   time=fraction(distance,-(dot32(query.deltaQ8,face.normalQ8)>>8)|0);
   if(time>maxFractionQ16)return maxFractionQ16;
   point=query.originQ8.map((value,i)=>add32(value,multiplyQ8(query.deltaQ8[i],time>>8)));
  }
  const order=face.triangle?[face.indices[0],face.indices[2],face.indices[1]]:[face.indices[0],face.indices[2],face.indices[3],face.indices[1]],vertices=order.map(index=>collision.vertices[index-1].slice(0,3).map((value,i)=>signedShort(value+world[i])));
  nativeState?.modelVertices(vertices);
  const outside=modelPolygonOutside(vertices,face.normalQ8,point,nativeState),ids=record.raw;
  if(outside>0x200){const pairs={2:[1,2],4:[3,0],5:[1,3],6:[2,3]},pair=pairs[outside&15]??[0,1];outsideEdges.push(ids[pair[0]],ids[pair[1]]);}
  else if(outside>=0)outsideEdges.push(ids[outside]);
  if(time>0&&outside===-1){output.point=point;output.normal=face.normalQ8.slice();output.scalar=distance;output.flags=1;query.surfaceRef=-100-(shape.slot&15);return time;}
  if(distance>bestDistance){bestDistance=distance;bestPoint=point;bestNormal=face.normalQ8.slice();}
  if(outsideEdges.length>=15)return maxFractionQ16;
 }
 // Zero-radius behavior is retained here for instruction checks; the existing
 // dedicated ray API remains the convenient immutable wrapper.
 if(radius===0){if(outsideEdges.length||fallback!==0)return 0;}
 else if(outsideEdges.length>1) {
  let duplicate;
  for(let i=0;i<outsideEdges.length&&duplicate===undefined;i++)for(let j=i+1;j<outsideEdges.length;j++)if(outsideEdges[i]===outsideEdges[j]){duplicate=outsideEdges[i];break;}
  if(duplicate!==undefined){
   const edge=collision.edges.find(value=>value.index===duplicate);if(!edge)throw Error(`Model shape references missing edge ${duplicate}.`);
   const vertices=edge.indices.map(index=>collision.vertices[index-1].slice(0,3).map((value,i)=>signedShort(value+world[i])));nativeState?.modelVertices(vertices);
   const time=queryEdgeSphereContact(query,vertices[0],vertices[1],edge.normalQ8,output,maxFractionQ16,{roundingMode,nativeState});
   if(output.flags&0x80003){query.surfaceRef=-100-(shape.slot&15);return time;}
   if(!(output.flags&0x100000)){output.flags=0;return maxFractionQ16;}
   fallback=edge.indices[output.scalar<0?0:1];
  }
 }
 if(fallback!==-1){
  const center=fallback===-99?(shape.center??[0,2,4].map(offset=>shape.raw.readInt16LE(offset))):collision.vertices[fallback-1],point=center.slice(0,3).map((value,i)=>add32(value,world[i])<<8),time=queryPointSphereContact(query,point,output,maxFractionQ16,{roundingMode,nativeState});
  if(output.flags)query.surfaceRef=-100-maxFractionQ16;
  return output.flags?time:maxFractionQ16;
 }
 output.point=bestPoint;output.normal=bestNormal;output.scalar=bestDistance;output.flags=2;query.surfaceRef=-100-(shape.slot&15);return 0;
}
