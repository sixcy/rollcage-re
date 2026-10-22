// 0x422dc0 consumes prepared native sphere cache records. It preserves list order,
// aggregate screening, state-based sphere substitution and stale contact fields.
import {querySpherePair,screenSpherePair} from './sphere-collision.mjs';
const signedByte=value=>value<<24>>24;
function idAt(body,index){const id=body.collisionIds?.[index];if(!Number.isInteger(id)||id<0||id>255)throw Error('Body-pair query requires explicit collisionIds entries.');return id;}
function recordAt(records,id){const record=Buffer.isBuffer(records)?records.subarray(id*72,(id+1)*72):records[id];if(!Buffer.isBuffer(record)||record.length<72)throw Error(`Body-pair sphere record ${id} requires 72 bytes.`);return record;}
function range(body,count) {
 if((body.flags&0x1ff)!==3)return [0,count];
 const state=body.pairCollisionContext?.stateByte6bc;
 if(!(state===null||(Number.isInteger(state)&&state>=0&&state<=255)))throw Error('Vehicle body-pair query requires explicit stateByte6bc.');
 return state!==null&&state!==0?[count,count+1]:[0,count];
}
export function queryBodyPairContact(first,second,records,output,maxTimeQ16,options) {
 output.flags=0;
 const distance=first.position.reduce((sum,value,index)=>{const lane=((value-second.position[index])|0)>>16;return(sum+Math.imul(lane,lane))|0;},0);
 if((distance>>>0)>0x4000||(((first.flags^second.flags)&0x1ff)===0&&(first.flags&0x4000)))return maxTimeQ16;
 for(const body of [first,second])if(!Number.isInteger(body.collisionCount10c)||body.collisionCount10c< -128||body.collisionCount10c>255)throw Error('Body-pair query requires explicit byte +0x10c.');
 const count1=signedByte(first.collisionCount10c),count2=signedByte(second.collisionCount10c),aggregate1=idAt(first,count1),aggregate2=idAt(second,count2);
 if(count1>1||count2>1){const time=screenSpherePair(recordAt(records,aggregate1),recordAt(records,aggregate2),output,maxTimeQ16,options);if(output.flags===0)return maxTimeQ16;if(time>maxTimeQ16){output.flags=0;return maxTimeQ16;}}
 const [start1,end1]=range(first,count1),[start2,end2]=range(second,count2),scratch={flags:0,point:[0,0,0],normal:[0,0,0],scalar:-1};let lastTime=0x7fffffff,lastKind=-1;
 for(let index1=start1;index1<end1;index1++) {
  const a=recordAt(records,idAt(first,index1));
  for(let index2=start2;index2<end2;index2++) {
   const b=recordAt(records,idAt(second,index2));scratch.flags=0;
   const time=querySpherePair(a,b,scratch,maxTimeQ16,options);output.flags=scratch.flags;
   if(!scratch.flags)continue;
   output.point=scratch.point.slice();output.normal=scratch.normal.map(value=>value<<8);output.auxiliaryVector=[0x14,0x18,0x1c].map(p=>(a.readInt32LE(p)-b.readInt32LE(p))|0);
   if(scratch.flags===2){output.scalar=scratch.scalar;return time;}
   // The native loop retains the LAST nonzero result, not the nearest time.
   lastTime=time;lastKind=scratch.flags===1?1:0;
  }
 }
 if(lastTime<0x7fffffff){output.flags=lastTime===maxTimeQ16&&lastKind===0?8:1;return lastTime;}
 return maxTimeQ16;
}
