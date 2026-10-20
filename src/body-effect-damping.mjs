// Native47b280. Global output meanings remain unresolved and caller-owned.
import {multiplyQ16} from './fixed-integer.mjs';
const signed32=value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(signed32);
export function applyBodyEffectDamping(body,{originQ16,timeScaleActive,globals}={}) {
 if(!vector(body.position)||!vector(originQ16))throw Error('Body effect damping requires explicit signed32 position and origin.');
 if(typeof timeScaleActive!=='boolean'&&!signed32(timeScaleActive))throw Error('Body effect damping requires explicit timeScaleActive.');
 if(!globals||[0x60,0x64,0x68,0x6c,0x70,0x74].some(offset=>!signed32(globals[`field91cd${offset.toString(16)}`])))throw Error('Body effect damping requires explicit retained output globals.');
 const delta=body.position.map((value,index)=>((value-originQ16[index])|0)>>18),distanceSquared=delta.reduce((sum,value)=>(sum+Math.imul(value,value))|0,0);
 if(distanceSquared>=0x1000)return {applied:false,distanceSquared,scaleQ16:null};
 if((body.flags&0x1ff)===3){
  const state=body.pairCollisionContext?.stateByte6bc;
  if(state!==null&&(!Number.isInteger(state)||state<0||state>255))throw Error('Vehicle damping requires explicit stateByte6bc.');
  if(state!==null&&state!==0)return {applied:false,distanceSquared,scaleQ16:null};
 }
 if(!vector(body.linearVelocity)||!vector(body.momentum))throw Error('Body effect damping requires explicit signed32 velocity and momentum.');
 const scaleQ16=(0x8000+Math.imul(distanceSquared,8))|0;
 body.linearVelocity=body.linearVelocity.map(value=>multiplyQ16(scaleQ16,value));body.momentum=body.momentum.map(value=>multiplyQ16(scaleQ16,value));
 if(!timeScaleActive)Object.assign(globals,{field91cd6c:originQ16[0],field91cd70:originQ16[1],field91cd60:1,field91cd64:31,field91cd68:2,field91cd74:originQ16[2]});
 return {applied:true,distanceSquared,scaleQ16};
}
