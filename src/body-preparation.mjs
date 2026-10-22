// Ordinary frame preparation0x47a8e0. Effect implementations remain explicit
// callbacks; stored-contact friction and rigid-body arithmetic are recovered.
import {multiplyQ16,signedShort} from './fixed-integer.mjs';
import {applyBodyForces,updateLinearVelocity} from './body-physics.mjs';
import {consumeBodyContactState,accumulateBodyContactFriction} from './body-contact-friction.mjs';
import {applyVehiclePreparationForce} from './vehicle-preparation-force.mjs';
const invoke=(handlers,name,body)=>{if(typeof handlers[name]!=='function')throw Error(`Body preparation requires ${name}.`);return handlers[name](body);};
export function prepareOrdinaryBody(body,{records,gravityQ16,effectFlags,timeOptions={},specialVehicleState,specialVehicleStateFor,handlers={}}={}){
 if(!Number.isInteger(gravityQ16)||gravityQ16< -2147483648||gravityQ16>2147483647)throw Error('Body preparation requires explicit signed gravityQ16.');
 if(!effectFlags||!Number.isInteger(effectFlags.first)||!Number.isInteger(effectFlags.second))throw Error('Body preparation requires explicit frame effect flags.');
 for(const [flag,handler]of [['first','applyEffect91cd90'],['second','applyEffect9153d0']])if(effectFlags[flag]===1){
  const flags=body.flags;if(flags&0x20000)body.flags=flags&~0x20000;else if(![17,21,25].includes(flags&0x1ff))invoke(handlers,handler,body);
 }
 if(body.linearVelocity.some(value=>value!==0))body.collisionFlags&=0x7fffffff;
 if(body.flags&0x1000){
  if(body.flags===0x1c03){
   if(!Number.isInteger(body.dragCoefficient2f38))throw Error('Exact vehicle flags1c03 require explicit drag coefficient+0x2f38.');
   const drag=signedShort(body.dragCoefficient2f38);body.force=body.force.map((value,axis)=>(value-Math.imul(body.linearVelocity[axis]>>16,drag))|0);
   // Native0x47a8e0 reaches vehicle-only storage after the live effect/flags gates.
   const state=specialVehicleStateFor?specialVehicleStateFor(body):specialVehicleState;
   applyVehiclePreparationForce(body,state,{gravityQ16,...timeOptions});
  }else if(!(body.collisionFlags&0x80000000)){
   let force=multiplyQ16(body.mass,gravityQ16);
   if(timeOptions.timeScaleActive&&!timeOptions.timeScaleExempt&&[3,7,21].includes(body.flags&0x1ff))force=multiplyQ16(timeOptions.timeScaleQ16??65536,force);
   body.force[1]=(body.force[1]+force)|0;
  }
 }
 const contacts=consumeBodyContactState(body,records);let friction=null;
 if(contacts){if(!Number.isInteger(body.contactFrictionB4))throw Error('Body preparation requires explicit contact friction coefficient+0xb4.');if(body.contactFrictionB4!==0)friction=accumulateBodyContactFriction(body,records,contacts);}
 applyBodyForces(body);updateLinearVelocity(body);return {contacts,friction};
}
