//482730: target-local effect state. Lookup contents and target allocation belong
// to the caller. The original484bb0 emission remains an explicit boundary.
import {multiplyQ8} from './sphere-collision.mjs';
const short=value=>value<<16>>16;
export function applyActiveVehicleEffect(body,directionQ8,effectCode,{state,lookup,handlers={}}={}) {
 if(!Buffer.isBuffer(state)||state.length<265||!Buffer.isBuffer(lookup)||lookup.length!==64)throw Error('Active vehicle effect requires explicit state bytes and its64-byte lookup.');
 if(state[8]===0){
  const next=(state.readInt8(1)-(effectCode>>5))|0,status=next<0?0:next;
  if(typeof handlers.onEmitActiveEffect!=='function')throw Error('Active vehicle effect requires its484bb0 emission handler.');
  handlers.onEmitActiveEffect({body,positionQ16:body.position,effectId:24,nativeArgs:[0,0x600,0x3fff,6,body,0,body.effectByte6b4===1?1:0]});
  state[1]=status&255;state[8]=10;
 }
 const coordinates=[0,1,2].map(column=>{
  const terms=[0,1,2].map(row=>multiplyQ8(-short(body.rotation[row*3+column]),directionQ8[row]));
  const value=(0x1000+terms[0]+terms[1]+terms[2])|0;return Math.max(0,Math.min(0x1fff,value));
 });
 const index=((coordinates[2]>>7)&0x30)|(((coordinates[1]>>11)&3)<<2)|((coordinates[0]>>11)&3),offset=lookup[index];state[9+offset]=effectCode&255;
 return {index,offset,coordinates};
}
