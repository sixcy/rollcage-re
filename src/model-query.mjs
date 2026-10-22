// FUN_00424040's radius-zero path. Input rays are already in the object's
// yaw-adjusted world coordinates; outer class/type filtering is separate.
import {add32,subtract32,multiplyQ16,signedShort} from './fixed-integer.mjs';
const dot32=(a,b)=>a.reduce((sum,value,i)=>add32(sum,Math.imul(value,b[i])),0);
const cross32=(a,b)=>[0,1,2].map(i=>subtract32(Math.imul(a[(i+1)%3],b[(i+2)%3]),Math.imul(a[(i+2)%3],b[(i+1)%3])));
const productShift8=(a,b)=>Number(BigInt.asIntN(32,(BigInt(a|0)*BigInt(b|0))>>8n));
// FUN_00424a40. Preserve its edge numbering and two-edge return codes.
export function modelPolygonOutside(vertices,normalQ8,pointQ8,nativeState) {
 const relative=vertices.map(vertex=>vertex.map((value,i)=>signedShort(value-signedShort(pointQ8[i]>>8))));
 let first=-1;
 for(let edge=0;edge<vertices.length;edge++){
  const a=relative[(edge+1)%vertices.length],b=relative[edge],cross=cross32(a,b);nativeState?.polygonCross(a,b,cross,edge);
  if(dot32(cross,normalQ8)<0) {
  if(first>=0)return edge===1?0x201:edge===2?0x202:first+0x204;
  first=edge;
  }
 }
 return first;
}
export function queryModelShapeRay(collision,shape,query,{positionQ16=[0,0,0],maxFractionQ16=65536}={}) {
 if((query.radiusQ8??query.radius??0)!==0)throw Error('Model ray query requires zero radius; sphere contacts are not reconstructed.');
 const miss={flags:0,fractionQ16:maxFractionQ16};
 if(shape.faceCount<3)return shape.faceCount===0?miss:{flags:0,fractionQ16:0};
 const lookup=new Map(collision.faceRecords.map(record=>[record.index,record]));
 const records=shape.records.map(index=>lookup.get(index)),relative=query.originQ8.map((value,i)=>subtract32(value,positionQ16[i]>>8));
 const plane=record=>{
  const face=collision.faces[record.faceIndex],anchor=collision.vertices[face.indices[0]-1];
  const distance=dot32(relative.map((value,i)=>subtract32(value,anchor[i]<<8)),face.normalQ8)>>8;
  return {face,distance};
 };
 // The complete convex-plane screen runs before any polygon containment.
 for(const record of records) {
  const {face,distance}=plane(record);if(distance<0)continue;
  const approach=dot32(query.deltaQ8,face.normalQ8)>>8;
  if(approach>=0)return miss;
  const travel=maxFractionQ16===65536?approach:multiplyQ16(approach,maxFractionQ16);
  if(add32(travel,distance)>0)return miss;
 }
 let outsideCount=0;
 for(const record of records) {
  const {face,distance}=plane(record);let fraction=0,point;
  if(distance<0)point=query.originQ8.map((value,i)=>add32(value,Math.imul((-distance)|0,face.normalQ8[i])>>8));
  else {
   const denominator=(- (dot32(query.deltaQ8,face.normalQ8)>>8))|0;
   if(!denominator)throw Error('Model ray fraction division by zero.');
   const quotient=(BigInt(distance<<8)<<8n)/BigInt(denominator);
   if(quotient< -2147483648n||quotient>2147483647n)throw Error('Model ray fraction division overflows a signed quotient.');
   fraction=Number(quotient);if(fraction>maxFractionQ16)return miss;
   point=query.originQ8.map((value,i)=>add32(value,productShift8(query.deltaQ8[i],fraction>>8)));
  }
  const indices=face.triangle?[face.indices[0],face.indices[2],face.indices[1]]:[face.indices[0],face.indices[2],face.indices[3],face.indices[1]];
  const vertices=indices.map(index=>collision.vertices[index-1].slice(0,3).map((value,i)=>signedShort(value+(positionQ16[i]>>16))));
  const outside=modelPolygonOutside(vertices,face.normalQ8,point);
  if(fraction>0&&outside===-1)return {flags:1,fractionQ16:fraction,pointQ8:point,normalQ8:face.normalQ8.slice(),distanceQ8:distance,querySurfaceRef:-100-shape.slot,faceIndex:record.faceIndex};
  if(outside>=0)outsideCount+=outside>0x200?2:1;
  if(outsideCount>=15)return miss;
 }
 // Radius-zero starts inside a polyhedron do not produce terrain-style overlap
 // hits. Point/edge contact fallbacks belong to the nonzero-radius path.
 return {flags:0,fractionQ16:0};
}
