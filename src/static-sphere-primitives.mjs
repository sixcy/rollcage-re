// Native point (0x422230) and finite edge (0x422680) sphere contact queries.
// Outputs and integer quantization intentionally retain the binary's stale fields.
import {add32,abs32,lookupSqrt,multiplyQ16,signedShort} from './fixed-integer.mjs';
import {multiplyQ8,normalizeCollisionVector,contactDiscriminantRoot} from './sphere-collision.mjs';
const add=(a,b)=>a.map((v,i)=>add32(v,b[i]));
const sub=(a,b)=>a.map((v,i)=>(v-b[i])|0);
const dot8=(a,b)=>a.reduce((s,v,i)=>add32(s,multiplyQ8(v,b[i])),0);
const dotRaw=(a,b)=>a.reduce((s,v,i)=>add32(s,Math.imul(v,b[i])),0);
const scale8=(a,b)=>a.map(v=>multiplyQ8(v,b));
const norm8=(a,mode)=>normalizeCollisionVector(a,mode).vector.map(v=>v>>4);
function sphere(record) {
 if(Buffer.isBuffer(record)){if(record.length<72)throw Error('Contact cache requires 72 bytes.');return {position:[8,12,16].map(p=>record.readInt32LE(p)),velocity:[20,24,28].map(p=>record.readInt32LE(p)),radius:record.readInt32LE(64)};}
 return {position:record.originQ8,velocity:record.deltaQ8,radius:record.radiusQ8|0};
}
function divide8(a,b) {
 const quotient=(BigInt(a|0)<<8n)/BigInt(b|0);
 if(quotient< -2147483648n||quotient>2147483647n)throw Error('Point contact quotient overflows x86 IDIV.');
 return Number(quotient);
}
export function queryPointSphereContact(record,pointQ8,output,maxTimeQ16,{roundingMode}={}) {
 const {position,velocity,radius}=sphere(record),relative=sub(position,pointQ8);
 output.flags=0;
 const shift=maxTimeQ16>0?((maxTimeQ16-1)>>16)&31:0;
 const end=relative.map((value,i)=>add32(value,maxTimeQ16>0?velocity[i]<<shift:0));
 if(relative.some((v,i)=>v>radius?(end[i]>radius||velocity[i]>=0):v<(-radius|0)?(end[i]<(-radius|0)||velocity[i]<=0):false))return maxTimeQ16;
 const speedSquared=dot8(velocity,velocity);
 if(speedSquared===0)return maxTimeQ16;
 const approach=dot8(relative,velocity),squared=dot8(relative,relative);
 output.scalar=((lookupSqrt(squared)<<4)-radius)|0;
 const overlap=()=>{output.normal=norm8(relative,roundingMode);output.point=pointQ8.slice();output.flags=2;return 0;};
 if(output.scalar<0)return overlap();
 const root=contactDiscriminantRoot(speedSquared,approach,(squared-multiplyQ8(radius,radius))|0);
 if(root>=0){const a=(root-approach)|0,b=-(approach+root)|0,numerator=Math.min(a,b),other=Math.max(a,b),time=divide8(numerator,speedSquared)<<8;
  if((other<<8)>=0&&time<=maxTimeQ16){if(time<0)return overlap();output.flags=1;const quantum=time>>8;output.normal=norm8(sub(add(position,scale8(velocity,quantum)),pointQ8),roundingMode);output.point=pointQ8.slice();return time;}
 }
 output.flags=0;return maxTimeQ16;
}
const crossShort=(a,b)=>{
 a=a.map(signedShort);b=b.map(signedShort);
 return [(Math.imul(a[1],b[2])-Math.imul(a[2],b[1]))|0,(Math.imul(a[2],b[0])-Math.imul(a[0],b[2]))|0,(Math.imul(a[0],b[1])-Math.imul(a[1],b[0]))|0];
};
export function queryEdgeSphereContact(record,firstVertexS16,secondVertexS16,directionQ8,output,maxTimeQ16,{roundingMode}={}) {
 const {position,velocity,radius}=sphere(record),first=firstVertexS16.map(v=>signedShort(v)<<8),second=secondVertexS16.map(v=>signedShort(v)<<8),relative=sub(position,first),projectionScalar=dotRaw(directionQ8,relative),projection=directionQ8.map(v=>multiplyQ16(projectionScalar,v)),perpendicular=sub(relative,projection);
 output.flags=0;
 if(perpendicular.some(v=>abs32(v)>0xb504))return maxTimeQ16;
 if(velocity.reduce((s,v,i)=>add32(s,Math.imul(v,perpendicular[i])>>8),0)>=0)return maxTimeQ16;
 const distance=lookupSqrt(dot8(perpendicular,perpendicular))<<4;
 let time;
 if(distance<=radius){output.flags=2;time=0;output.normal=norm8(perpendicular.slice(),roundingMode);output.scalar=-Math.max(0,(radius-distance)|0)|0;output.point=add(projection,first);}
 else {
  let radial=crossShort(velocity,directionQ8);
  if(radial.every(v=>v===0))return maxTimeQ16;
  radial=norm8(radial,roundingMode);
  let offset=dotRaw(radial,perpendicular)>>8;
  if(offset<0){offset=-offset|0;radial=radial.map(v=>-v|0);}
  if(offset>radius)return maxTimeQ16;
  let trajectory=crossShort(directionQ8,radial).map(v=>v>>8),speed=dotRaw(velocity,trajectory);
  if(speed>0)trajectory=trajectory.map(v=>-v|0);else speed=-speed|0;
  speed>>=8;
  const chord=lookupSqrt((multiplyQ8(radius,radius)-multiplyQ8(offset,offset))|0)<<4;
  const contactVector=add(scale8(radial,offset),scale8(trajectory,chord));
  let travel=(-dotRaw(sub(contactVector,perpendicular),trajectory)|0)>>8;
  if(travel<0)travel=0;
  const available=multiplyQ16(maxTimeQ16,speed);
  if(available===0||travel>available)return maxTimeQ16;
  time=Math.trunc((travel<<16)/available)|0;
  if(time>maxTimeQ16)return maxTimeQ16;
  output.point=sub(add(position,velocity.map(v=>multiplyQ16(time,v))),contactVector);
  output.normal=norm8(contactVector,roundingMode);output.scalar=0;output.flags=1;
 }
 if(dotRaw(directionQ8,sub(output.point,first))<0||dotRaw(directionQ8,sub(output.point,second))>0){output.flags=0x100000;return maxTimeQ16;}
 return time;
}
