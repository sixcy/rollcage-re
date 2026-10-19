// Numeric contact responses from 0x447dd0/0x447f60. This does not dispatch collision
// classes, generate contact times, or implement object/effect callbacks.
import {add32,multiplyQ16,divideQ16,dotQ16,crossQ16,transformVectorQ16,multiplyQuaternionQ16} from './fixed-integer.mjs';
function validateCollisionCount(body){if(!Number.isInteger(body.collisionCount10c)||body.collisionCount10c< -128||body.collisionCount10c>255)throw Error('Collision response requires the explicit byte at object +0x10c.');}
function refreshCollisionVelocities(body) {
 body.linearVelocity=body.momentum.map(value=>multiplyQ16(value,body.inverseMass));
 body.angularVelocity=transformVectorQ16(body.worldInverseInertia,body.angularMomentum).map(value=>value>>8);
 body.quaternionDerivative=multiplyQuaternionQ16([0,...body.angularVelocity],body.quaternion).map(value=>value>>1);
}
// 0x475890 converts the world Q8 point to a relative Q16 lever arm, clearing
// each result's low byte. Its scalar also changes from Q8 to Q16 in place.
export function prepareStaticContact(body,contact) {
 contact.point=contact.point.map((value,index)=>((value<<8)-body.position[index])&0xffffff00);contact.scalar<<=8;return contact;
}
// 0x475290 moves an already-relative contact point using the post-response speed.
export function advectCollisionContact(body,contact,deltaQ16) {
 contact.point=contact.point.map((value,index)=>add32(value,multiplyQ16(body.linearVelocity[index],deltaQ16)));return contact;
}
// 0x448400 negates the stored penetration scalar before forming its correction.
export function collisionPenetrationCorrection(contact) {
 contact.scalar=-contact.scalar|0;return contact.normal.map(value=>add32(multiplyQ16(value,contact.scalar),value>>7));
}
// 0x47a4f0 uses the current angular velocity, not the accumulated angular momentum.
export function collisionPointVelocity(body,contact) {
 const angular=crossQ16(body.angularVelocity,contact.point);return body.linearVelocity.map((value,index)=>add32(value,angular[index]));
}
export function resolveStaticContact(body,contact,velocity=collisionPointVelocity(body,contact)) {
 validateCollisionCount(body);
 const normalSpeed=dotQ16(velocity,contact.normal);
 if(normalSpeed>=0)return {applied:false,normalSpeed};
 const numerator=multiplyQ16(normalSpeed,-add32(body.coefficient7c,65536)|0);
 const crossed=crossQ16(contact.point,contact.normal),response=transformVectorQ16(body.worldInverseInertia,crossed).map(value=>value>>8);
 const denominator=add32(body.inverseMass,dotQ16(contact.normal,crossQ16(response,contact.point))),magnitude=divideQ16(numerator,denominator),impulse=contact.normal.map(value=>multiplyQ16(value,magnitude));
 body.momentum=body.momentum.map((value,index)=>add32(value,impulse[index]));
 if((body.collisionCount10c<<24>>24)>1){const torque=crossQ16(contact.point,impulse);body.angularMomentum=body.angularMomentum.map((value,index)=>add32(value,torque[index]));}
 // The response refresh deliberately bypasses the shared velocity limiter and
 // retains the existing world inertia; neither body pose nor frame clock changes.
 refreshCollisionVelocities(body);
 return {applied:true,normalSpeed,magnitude,impulse};
}
// 0x47a5d0 assumes the supplied normal's native scale; it does not renormalize.
export function splitCollisionVelocity(normal,velocity) {
 const speed=dotQ16(velocity,normal),projection=normal.map(value=>multiplyQ16(value,speed));
 return {normal:projection,tangent:velocity.map((value,index)=>(value-projection[index])|0)};
}
// Class8 preparation, 0x475300: share half of relative normal velocity, even for
// unequal masses and separating motion, then reconstruct both linear momenta.
export function exchangePairNormalVelocity(first,second,normal) {
 const relative=first.linearVelocity.map((value,index)=>(value-second.linearVelocity[index])|0),projection=splitCollisionVelocity(normal,relative).normal;
 for(let i=0;i<3;i++){const half=projection[i]>>1;first.linearVelocity[i]=(first.linearVelocity[i]-half)|0;second.linearVelocity[i]=(second.linearVelocity[i]+half)|0;}
 first.momentum=first.linearVelocity.map(value=>multiplyQ16(value,first.mass));second.momentum=second.linearVelocity.map(value=>multiplyQ16(value,second.mass));
 return projection;
}
// Vehicle-only state read in 0x447f60. Context explicitly represents +0x3d00
// and the byte pointed to by +0x6bc (null means the native -1 pointer sentinel).
export function readPairCollisionClass(body,context) {
 if((body.flags&0x1ff)!==3)return 0;
 if(!context||!Number.isInteger(context.field3d00)||context.field3d00< -2147483648||context.field3d00>2147483647||!(context.stateByte6bc===null||(Number.isInteger(context.stateByte6bc)&&context.stateByte6bc>=0&&context.stateByte6bc<=255)))throw Error('Vehicle pair response requires explicit +0x3d00 and +0x6bc state.');
 return context.stateByte6bc===1?3:context.field3d00;
}
// 0x447f60. Contacts already contain relative Q16 points and opposing normals.
// relativeVelocity is supplied by the event, not inferred from cached speeds.
export function resolveBodyPairContact(first,second,contact1,contact2,relativeVelocity,{firstContext,secondContext}={}) {
 validateCollisionCount(first);validateCollisionCount(second);
 const class1=readPairCollisionClass(first,firstContext),class2=readPairCollisionClass(second,secondContext),shift1=class1>class2?(class1-class2)|0:0,shift2=class2>=class1?(class2-class1)|0:0;
 const normalSpeed=dotQ16(relativeVelocity,contact1.normal),numerator=multiplyQ16(normalSpeed,-add32(first.coefficient7c,65536)|0);
 // Native asymmetry: first shifts Iw*(r x n) before its second cross product;
 // second shifts AFTER that cross product. Do not merge these expressions.
 const transformed1=transformVectorQ16(first.worldInverseInertia,crossQ16(contact1.point,contact1.normal)).map(value=>value>>8);
 const rotational1=dotQ16(contact1.normal,crossQ16(transformed1,contact1.point));
 const transformed2=transformVectorQ16(second.worldInverseInertia,crossQ16(contact2.point,contact2.normal));
 const rotational2=dotQ16(contact2.normal,crossQ16(transformed2,contact2.point).map(value=>value>>8));
 const denominator=add32(add32(second.inverseMass,rotational2),add32(rotational1,first.inverseMass)),magnitude=divideQ16(numerator,denominator),magnitudes=[magnitude>>(shift1&31),magnitude>>(shift2&31)],impulses=[];
 for(const [index,body,contact]of [[0,first,contact1],[1,second,contact2]]) {
  const impulse=contact.normal.map(value=>multiplyQ16(value,magnitudes[index]));impulses.push(impulse);body.momentum=body.momentum.map((value,axis)=>add32(value,impulse[axis]));
  if((body.collisionCount10c<<24>>24)>1){const torque=crossQ16(contact.point,impulse);body.angularMomentum=body.angularMomentum.map((value,axis)=>add32(value,torque[axis]));}
  refreshCollisionVelocities(body);
 }
 return {normalSpeed,magnitude,magnitudes,impulses,classes:[class1,class2]};
}
