// Numeric helpers used by collision class 8. The dispatcher supplies its signed
// byte/tag gates, advancement, contact conversion and final response callback.
import {add32,multiplyQ16,dotQ16,crossQ16,transformVectorQ16} from './fixed-integer.mjs';

// 0x47a770: replace cached linear speed, then reconstruct momentum from mass.
export function replaceCollisionLinearVelocity(body,velocity) {
 body.linearVelocity=velocity.slice();
 body.momentum=body.linearVelocity.map(value=>multiplyQ16(value,body.mass));
 return body;
}

// 0x47a7f0 projects the two angular caches independently onto the supplied
// normal. It neither normalizes that normal nor refreshes quaternion derivative.
export function projectCollisionAngularState(body,contact) {
 for(const field of ['angularMomentum','angularVelocity']) {
  const magnitude=dotQ16(body[field],contact.normal);
  body[field]=contact.normal.map(value=>multiplyQ16(value,magnitude));
 }
 return body;
}

// 0x47a670 consumes an already-relative Q16 contact point. Gravity is the
// explicit signed global DAT_005eb5e0; the normal's Y component enters twice.
export function applySlidingAngularImpulse(body,contact,gravityQ16) {
 if(!Number.isInteger(gravityQ16)||gravityQ16< -2147483648||gravityQ16>2147483647)throw Error('Sliding angular response requires explicit signed Q16 gravity.');
 const magnitude=multiplyQ16(multiplyQ16(body.mass,gravityQ16),contact.normal[1])>>2;
 const impulse=contact.normal.map(value=>multiplyQ16(value,magnitude));
 // Native order is impulse x lever arm, unlike the usual r x impulse formula.
 const torque=crossQ16(impulse,contact.point);
 body.angularMomentum=body.angularMomentum.map((value,index)=>add32(value,torque[index]));
 body.angularVelocity=transformVectorQ16(body.worldInverseInertia,body.angularMomentum).map(value=>value>>8);
 return {magnitude,impulse,torque};
}

// 0x47af80 sets the collision-cache high bit and clears six vector fields. The
// pose, frame clock and quaternion derivative retain their previous values.
export function stopCollisionBody(body) {
 body.collisionFlags=(body.collisionFlags|0x80000000)|0;
 for(const field of ['momentum','linearVelocity','angularMomentum','angularVelocity','torque','force'])body[field]=[0,0,0];
 return body;
}
