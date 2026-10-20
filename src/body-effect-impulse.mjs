// Outer first-effect impulse47b020. Its origin/strength are explicit runtime
// globals. The active-vehicle482730 operation remains an explicit boundary.
import {abs32,vectorLengthQ16,divideQ16,multiplyQ16} from './fixed-integer.mjs';
import {normalizeUnreducedCollisionVector} from './sphere-collision.mjs';
const clamp=value=>Math.max(-0x1800,Math.min(0x1800,value));
//417610 mutates the input and two process scratch globals. Its Z offset is
// intentional; this is not a general-purpose vector normalization primitive.
export function reduceBodyEffectDirection(vector,scratch={}) {
 let sum=vector.reduce((value,component)=>(value+abs32(component))|0,0);if(sum<0)sum=-sum|0;
 const leadingZeros=Math.clz32(sum);scratch.sum91d45c=sum;scratch.leadingZeros91d460=leadingZeros;
 if(leadingZeros<9){const shift=9-leadingZeros;for(let axis=0;axis<3;axis++)vector[axis]>>=shift;}
 else if(abs32(vector.reduce((value,component)=>(value+Math.imul(component>>18,component>>18))|0,0))<1)vector[2]=(vector[2]-0x20000)|0;
 return scratch;
}
export function applyBodyEffectImpulse(body,{originQ16,strength,roundingMode,directionScratch={},handlers={}}={}) {
 const difference=body.position.map((value,axis)=>(value-originQ16[axis])|0),reduced=difference.map(value=>value>>18),squared=reduced.reduce((sum,value)=>(sum+Math.imul(value,value))|0,0);
 if(squared>65536)return;
 const denominator=Math.max(squared,256),direction=reduced.map(value=>Math.trunc((value<<16)/denominator));
 if(direction.reduce((sum,value)=>(sum+abs32(value))|0,0)<32)return;
 let impulse=direction.map(value=>clamp(Math.imul(strength>>2,value))),type=body.flags&0x1ff;
 if(type===3){
  const state=body.pairCollisionContext?.stateByte6bc;
  if(state===undefined)throw Error('Body effect requires explicit vehicle byte state or null sentinel+6bc.');
  if(state!==null&&(state&255)!==0){
   if(typeof handlers.onActiveVehicleEffect!=='function')throw Error('Body effect requires explicit active vehicle handler482730.');
   const directionQ8=normalizeUnreducedCollisionVector(impulse,roundingMode).vector.map(value=>value>>4);handlers.onActiveVehicleEffect({body,directionQ8,effectCode:0x70});return;
  }
  const cooldown=Math.min(Math.imul(strength,8),255);
  if(cooldown>(body.collisionCooldown66f&255)){
   body.collisionCooldown66f=cooldown&255;body.effectDirection680=difference.slice();
   reduceBodyEffectDirection(body.effectDirection680,directionScratch);
   const length=vectorLengthQ16(body.effectDirection680);
   // The length callee's fixed square root overwrites the same scratch pair.
   let squares=body.effectDirection680.map(value=>multiplyQ16(value,value));
   if(squares.reduce((bits,value)=>bits|value,0)&0xe0000000)squares=squares.map(value=>value>>>2);
   const rootInput=squares.reduce((sum,value)=>(sum+value)|0,0);directionScratch.sum91d45c=abs32(rootInput);directionScratch.leadingZeros91d460=Math.clz32(directionScratch.sum91d45c);
   if(length<64)body.effectDirection680=body.effectFallback674.slice();
   else {const scale=divideQ16(65536,length);body.effectDirection680=body.effectDirection680.map(value=>multiplyQ16(value,scale));}
  }
  body.effectCounter6b8=16;body.effectMagnitude6ba=impulse.reduce((sum,value)=>sum+abs32(value),0)&65535;
 }else if(type===7||type===12)impulse=impulse.map(value=>value>>1);
 body.force=body.force.map((value,axis)=>(value+(impulse[axis]<<8))|0);body.torque=body.torque.map((value,axis)=>(value+(impulse[axis]<<7))|0);body.collisionFlags&=0x7fffffff;
}
