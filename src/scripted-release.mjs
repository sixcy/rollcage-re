//46e4e0 leaves scripted motion or installs the unresolved46e470 filter.
import {abs32,signedShort,vectorLengthQ16,divideQ16,multiplyQ16,sqrtQ16} from './fixed-integer.mjs';
export function quaternionFromReleaseDirection(direction,mathScratch={}) {
 if(direction.some(value=>abs32(value)>0x230000))for(let axis=0;axis<3;axis++)direction[axis]>>=3;
 const scale=divideQ16(65536,vectorLengthQ16(direction));for(let axis=0;axis<3;axis++)direction[axis]=multiplyQ16(direction[axis],scale);
 const sineInput=Math.max(0,Math.trunc(((65536-direction[2])|0)/2));let sine=sqrtQ16(sineInput);if(direction[0]<0)sine=-sine|0;
 const cosineInput=Math.trunc(((Math.max(direction[2],-65536)+65536)|0)/2),cosine=sqrtQ16(cosineInput);
 mathScratch.sum91d45c=abs32(cosineInput);mathScratch.leadingZeros91d460=Math.clz32(mathScratch.sum91d45c);
 return [cosine,0,sine,0];
}
const requireHandler=(handlers,name)=>{if(typeof handlers[name]!=='function')throw Error(`Scripted release requires explicit ${name} callback.`);return handlers[name];};
export function releaseScriptedBody(body,{rng,mathScratch={},handlers={}}={}) {
 if(body.flags&0x2000){
  body.integrationFlags&=~1;body.flags=(body.flags&0xffffddff)|0x1000;
  body.quaternion=quaternionFromReleaseDirection([2,5,8].map(index=>signedShort(body.rotation[index])),mathScratch);
  if(!rng||!Number.isInteger(rng.seed))throw Error('Scripted release requires its explicit mutable RNG seed5ec954.');
  rng.seed=Math.imul(rng.seed,0x41a7)&0x7fffffff;const roll=Math.imul(rng.seed>>>15,0x7fff)>>>16;
  body.torque=[0,4,8].map(shift=>(((roll>>>shift)&15)-8)<<20);
  requireHandler(handlers,'onReleaseEffect')({body,code:16});return 0;
 }
 const filter=requireHandler(handlers,'collisionFilter46e470');
 requireHandler(handlers,'onUnscriptedReleaseEffect')({body,positionQ16:body.position.map((value,axis)=>axis===1?(value+0x8c0000)|0:value),vectorQ16:[0,-0x400000,0],nativeArgs:[1,0x11229,11]});
 body.collisionFilter=filter;body.collisionFilterNativeAddress148=0x46e470;return 1;
}
