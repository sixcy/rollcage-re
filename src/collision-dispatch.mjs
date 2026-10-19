// Complete branch orchestration of 0x474bb0. Runtime contact storage and body
// removal are explicit handlers; contact/event generation is outside this module.
import {abs32} from './fixed-integer.mjs';
import {advanceBodyForCollision,correctCollisionPosition} from './body-advancement.mjs';
import {prepareStaticContact,collisionPointVelocity,resolveStaticContact,resolveBodyPairContact,splitCollisionVelocity,exchangePairNormalVelocity,advectCollisionContact,collisionPenetrationCorrection} from './collision-response.mjs';
import {replaceCollisionLinearVelocity,projectCollisionAngularState,applySlidingAngularImpulse,stopCollisionBody} from './collision-sliding.mjs';
const signedByte=value=>value<<24>>24,signedShort=value=>value<<16>>16;
const invoke=(handlers,name,...args)=>{if(typeof handlers[name]!=='function')throw Error(`Collision dispatch requires handler ${name}.`);return handlers[name](...args);};
function gravity(options){if(!Number.isInteger(options.gravityQ16)||options.gravityQ16< -2147483648||options.gravityQ16>2147483647)throw Error('Collision dispatch requires explicit signed gravityQ16.');return options.gravityQ16;}
function stopIfSlow(body,options) {
 const linear=body.linearVelocity.reduce((bits,value)=>bits|abs32(value),0),angular=body.angularVelocity.reduce((bits,value)=>bits|abs32(value),0);
 if(linear<((gravity(options)*2)|0)&&angular<5000)stopCollisionBody(body);
}
export function dampCollisionMotion(body,code) {
 const shifts=new Map([[0x100,[1,2,3]],[0x200,[1,2]],[0x400,[1]],[0x800,[2,3]]]).get(signedShort(code));
 if(shifts)for(const field of ['linearVelocity','momentum'])body[field]=body[field].map(value=>shifts.reduce((sum,shift)=>(sum+(value>>shift))|0,0));
 return body;
}
export function dispatchCollisionResponse(event,deltaQ16,options={}) {
 const first=event.object1,second=event.object2;if(!first)return;
 if(!Number.isInteger(first.collisionCounter168)||first.collisionCounter168<0||first.collisionCounter168>255)throw Error('Collision dispatch requires the explicit counter byte at +0x168.');
 const handlers=options.handlers??{},advance=(body,delta,normal)=>advanceBodyForCollision(body,delta,normal,handlers,options.timeOptionsFor?options.timeOptionsFor(body):options.timeOptions),classification=event.classFlags&255;
 first.collisionCounter168=(first.collisionCounter168-(second?2:1))&255;first.collisionFlags&=~0x10000000;first.collisionCache114=-1;
 if(event.kind===1) {
  first.collisionState128=0;
  if(classification===16){invoke(handlers,'removeBody',first);return;}
  if(classification===64){advance(first,deltaQ16,null);dampCollisionMotion(first,event.damping);return;}
  if(classification===1||classification===2) {
   if(classification===1)advance(first,deltaQ16,event.normal);
   prepareStaticContact(first,event);
   if(classification===2)correctCollisionPosition(first,collisionPenetrationCorrection(event),handlers);
   resolveStaticContact(first,event,collisionPointVelocity(first,event));
   if((first.flags&0x1ff)===7)stopIfSlow(first,options);
   invoke(handlers,'storeContact',first,event);return;
  }
  if(classification===8) {
   replaceCollisionLinearVelocity(first,splitCollisionVelocity(event.normal,first.linearVelocity).tangent);
   const upperTag=signedShort(event.tag)>(signedByte(first.collisionCount10c)>>1);
   if(upperTag)projectCollisionAngularState(first,event);
   advance(first,deltaQ16,null);prepareStaticContact(first,event);advectCollisionContact(first,event,deltaQ16);
   if(upperTag)stopIfSlow(first,options);else if(signedByte(first.collisionCount10c)>1)applySlidingAngularImpulse(first,event,gravity(options));
   invoke(handlers,'storeContact',first,event);return;
  }
  advance(first,deltaQ16,null);return;
 }
 if(!second){first.flags&=~0x2000;advance(first,deltaQ16,null);return;}
 first.collisionState128=0;second.collisionFlags&=~0x10000000;second.collisionState128=0;second.collisionCache114=-1;first.flags&=~0x2000;second.flags&=~0x2000;
 const secondContact={point:event.point.slice(),normal:event.normal.map(value=>-value|0),scalar:event.scalar};
 if(classification===2){event.scalar<<=7;const correction=collisionPenetrationCorrection(event);correctCollisionPosition(first,correction,handlers);correctCollisionPosition(second,correction.map(value=>-value|0),handlers);}
 else if(classification===8)exchangePairNormalVelocity(first,second,event.normal);
 const difference=(first.frameTimeQ16-second.frameTimeQ16)|0,delta1=difference<0?(deltaQ16+difference)|0:deltaQ16,delta2=(difference+delta1)|0;
 if(delta1)advance(first,delta1,event.normal);if(delta2)advance(second,delta2,secondContact.normal);
 event.point=event.point.map((value,index)=>((value<<8)-first.position[index])|0);secondContact.point=secondContact.point.map((value,index)=>((value<<8)-second.position[index])|0);
 if(classification===8){advectCollisionContact(first,event,delta1);advectCollisionContact(second,secondContact,delta2);return;}
 const contextFor=options.pairContextFor??(body=>body.pairCollisionContext);
 resolveBodyPairContact(first,second,event,secondContact,event.auxiliaryVector,{firstContext:contextFor(first),secondContext:contextFor(second)});
}
