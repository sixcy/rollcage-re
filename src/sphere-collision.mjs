// Native Q8 sphere contacts (0x423360) and aggregate screening (0x4230a0).
// Float normalization mirrors 0x422c70; caller supplies the x87 rounding mode.
import {add32,abs32,lookupSqrt} from './fixed-integer.mjs';
export const multiplyQ8=(a,b)=>Number(BigInt.asIntN(32,(BigInt(a|0)*BigInt(b|0))>>8n));
const dot8=(a,b)=>a.reduce((sum,value,index)=>add32(sum,multiplyQ8(value,b[index])),0);
const add=(a,b)=>a.map((value,index)=>add32(value,b[index]));
const subtract=(a,b)=>a.map((value,index)=>(value-b[index])|0);
const scale=(a,value)=>a.map(component=>multiplyQ8(component,value));
const sphere=record=>{if(!Buffer.isBuffer(record)||record.length<72)throw Error('Sphere collision requires a 72-byte native cache record.');return {position:[8,12,16].map(p=>record.readInt32LE(p)),velocity:[20,24,28].map(p=>record.readInt32LE(p)),radius:record.readInt32LE(64)};};
function divide8(a,b){if(!b)throw Error('Contact division by zero.');const value=(BigInt(a|0)<<8n)/BigInt(b|0);if(value< -2147483648n||value>2147483647n)throw Error('Contact division overflows x86 quotient.');return Number(value);}
function integerFloat(value,roundingMode) {
 let rounded;
 if(roundingMode==='nearest-even'){const below=Math.floor(value),part=value-below;rounded=part<0.5?below:part>0.5?below+1:below%2===0?below:below+1;}
 else if(roundingMode==='toward-zero')rounded=Math.trunc(value);
 else if(roundingMode==='down')rounded=Math.floor(value);
 else if(roundingMode==='up')rounded=Math.ceil(value);
 else throw Error('Contact normalization requires an explicit x87 rounding mode.');
 return Number.isFinite(rounded)&&rounded>= -2147483648&&rounded<=2147483647?rounded:-2147483648;
}
export function normalizeCollisionVector(input,roundingMode,nativeState) {
 let bits=input.reduce((mask,value)=>mask|abs32(value),0);if(bits<0)bits=-bits|0;
 nativeState?.normalizeReduction(bits,Math.clz32(bits));
 const shift=Math.max(0,18-Math.clz32(bits));if(shift)for(let i=0;i<3;i++)input[i]>>=shift;
 return {vector:normalizeUnreducedCollisionVector(input,roundingMode).vector,shift};
}
// 0x4343e0 shares the float conversion but omits422c70's input reduction.
export function normalizeUnreducedCollisionVector(input,roundingMode) {
 const lanes=input.map(value=>Math.fround(value<<8)),squares=lanes.map(value=>Math.fround(value*value)),length=Math.fround(Math.sqrt(Math.fround(Math.fround(squares[1]+squares[0])+squares[2]))),inverse=Math.fround(1/length);
 return {vector:lanes.map(value=>integerFloat(Math.fround(Math.fround(value*4096)*inverse),roundingMode))};
}
// 0x4225d0 quantizes coefficients before taking the lookup-table square root.
export function contactDiscriminantRoot(a,b,c,nativeState) {
 let bits=a|c;if(bits<0)bits=-bits|0;let shift=16-Math.clz32(bits),squared;
 nativeState?.normalizeReduction(bits,Math.clz32(bits));
 if(shift<=0){shift=0;squared=Math.imul(b>>4,b>>4);}else{const reduced=b>>((shift+4)&31);squared=Math.imul(reduced,reduced);a>>=shift;c>>=shift;}
 const product=multiplyQ8(a,c),difference=(squared-product)|0;if(product<0||difference<0)return -1;
 nativeState?.sqrtLookup(difference);
 return (lookupSqrt(difference)<<4)<<shift;
}
function relativeState(first,second,maxTimeQ16,nativeState) {
 const a=sphere(first),b=sphere(second),position=subtract(b.position,a.position),velocity=subtract(b.velocity,a.velocity),radius=add32(a.radius,b.radius),bits=abs32((maxTimeQ16-1)|0);nativeState?.normalizeReduction(bits,Math.clz32(bits));const shift=Math.max(0,16-Math.clz32(bits)),end=position.map((value,index)=>add32(value,velocity[index]<<shift));
 const rejected=position.some((value,index)=>value>radius?(end[index]>radius||velocity[index]>=0):value<(-radius|0)?(end[index]<(-radius|0)||velocity[index]<=0):false);
 return {a,b,position,velocity,radius,rejected};
}
export function screenSpherePair(first,second,output,maxTimeQ16,{nativeState}={}) {
 const state=relativeState(first,second,maxTimeQ16,nativeState);if(state.rejected)return 0;
 const {position,velocity,radius}=state,squared=dot8(position,position),radiusSquared=multiplyQ8(radius,radius);
 if(squared<radiusSquared){output.flags=(output.flags&0xffffff00)+2;return 0;}
 const speedSquared=dot8(velocity,velocity);if(speedSquared!==0){const approach=dot8(position,velocity),root=contactDiscriminantRoot(speedSquared,approach,(squared-radiusSquared)|0,nativeState);
  if(root>=0){const upper=(root-approach)|0,lower=-(approach+root)|0,numerator=Math.min(upper,lower),opposite=Math.max(upper,lower),time=divide8(numerator,speedSquared)<<8;
   if(time>=0||opposite>=0){if((opposite^time)<0){output.flags=(output.flags&0xffffff00)+2;return 0;}output.flags=1;return time;}
  }
 }
 output.flags&=0xffffff00;return 0;
}
export function querySpherePair(first,second,output,maxTimeQ16,{roundingMode,nativeState}={}) {
 const state=relativeState(first,second,maxTimeQ16,nativeState);if(state.rejected)return maxTimeQ16;
 const {a,b,position,velocity,radius}=state,approach=dot8(position,velocity),squared=dot8(position,position),coarseSquared=Math.imul(radius>>4,radius>>4);
 const overlapPoint=(distance,doubleScale=false)=>{
  const unit=normalizeCollisionVector(position,roundingMode,nativeState).vector.map(value=>-(value>>4)|0);output.normal=unit;output.scalar=distance;
  // The negative-time recovery branch overwrites its first scaling result.
  output.point=scale(unit,doubleScale?-a.radius|0:-((distance>>1)+a.radius)|0);output.point=add(output.point,a.position);output.flags=(output.flags&0xffffff00)+2;return 0;
 };
 if(squared>coarseSquared) {
  const speedSquared=dot8(velocity,velocity);
  if(approach<=0&&speedSquared!==0) {
   const root=contactDiscriminantRoot(speedSquared,approach,(squared-(Math.imul(radius,radius)>>8))|0,nativeState);
   if(root<0){output.flags&=0xffffff00;return 0;}
   const numerator=Math.min((root-approach)|0,-(root+approach)|0),time=divide8(numerator,speedSquared)<<8;nativeState?.sqrtLookup(squared);const distance=((lookupSqrt(squared)<<4)-radius)|0;
   if(time<0)return overlapPoint(distance,true);
   if(time<=maxTimeQ16){output.flags=1;const quantum=time>>8,firstPoint=add(a.position,scale(a.velocity,quantum)),secondPoint=add(b.position,scale(b.velocity,quantum)),difference=subtract(secondPoint,firstPoint),normal=normalizeCollisionVector(difference,roundingMode,nativeState).vector.map(value=>value>>4);output.normal=normal;output.point=add(firstPoint,scale(normal,a.radius));
    if(distance<256&&(((dot8(normal,velocity)-1)|0)>>>0)<=0xffe){output.flags=(output.flags&0xffffff00)|0x80000;return maxTimeQ16;}
    if(time===0){output.flags=2;output.scalar=-16;}return time;
   }
  }
 }else if(squared<Math.imul((radius-256)>>4,(radius-256)>>4)||squared>coarseSquared||approach<=0){nativeState?.sqrtLookup(squared);return overlapPoint(((lookupSqrt(squared)<<4)-radius)|0);}
 output.flags&=0xffffff00;return maxTimeQ16;
}
