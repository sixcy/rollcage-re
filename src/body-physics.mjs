// Recovered shared rigid-body arithmetic. Native anchors and scope are in
// docs/physics.md. This is not the wheel/contact solver or race simulation.
import {quaternionMatrix} from './fixed-math.mjs';
import {add32,abs32,multiplyQ16,divideQ16,sqrtQ16,multiplyQuaternionQ16,
 multiplyMatrixQ16,transformVectorQ16,dotQ16,normalizeQuaternionQ16} from './fixed-integer.mjs';
const vector=(data,p,count=3)=>Array.from({length:count},(_,i)=>data.readInt32LE(p+i*4));
export function initializeBody(config) {
 if(!Buffer.isBuffer(config)||config.length<0x80)throw Error('Body configuration requires 128 bytes.');
 const body={position:vector(config,0),momentum:vector(config,0xc),angularMomentum:vector(config,0x18),quaternion:vector(config,0x24,4),
  inverseInertia:vector(config,0x68),mass:config.readInt32LE(0x74),inverseMass:config.readInt32LE(0x78),coefficient7c:config.readInt32LE(0x7c),
  force:[0,0,0],torque:[0,0,0],flags:0,integrationFlags:0};
 body.rotation=quaternionMatrix(body.quaternion);
 updateBodyDerived(body);
 return body;
}
// FUN_00479ed0: apply accumulated increments once, keep the native near-overflow
// guard, and clear the accumulators even when an increment is rejected.
export function applyBodyForces(body) {
 for(const [state,increment]of [[body.momentum,body.force],[body.angularMomentum,body.torque]]) {
  for(let axis=0;axis<3;axis++) {
   const next=add32(state[axis],increment[axis]);
   if(abs32(next)<0x7d000000||((state[axis]^increment[axis])|0)<0)state[axis]=next;
   increment[axis]=0;
  }
 }
 return body;
}
// FUN_00479b30: convert momentum to velocity and, when required, rescale the
// whole vector to the native 128-unit limit, then write momentum back as m*v.
export function updateLinearVelocity(body) {
 let velocity=body.inverseMass===65536?body.momentum.slice():body.momentum.map(value=>multiplyQ16(value,body.inverseMass));
 if(velocity.some(value=>abs32(value)>0x490000)) {
  const reduced=velocity.map(value=>value>>8),squared=dotQ16(reduced,reduced);
  if((squared>>>0)>0x4000) {
   const length=sqrtQ16(squared<<8)<<4,scale=divideQ16(0x800000,length);
   velocity=velocity.map(value=>multiplyQ16(value,scale));
   body.momentum=velocity.map(value=>multiplyQ16(value,body.mass));
  }
 }
 body.linearVelocity=velocity;
 return velocity;
}
// FUN_004799f0: R*diag(I^-1)*R^T, angular velocity, then 1/2*(0,w)*q.
// The native angular velocity path shifts its matrix-vector result right by 8.
export function updateBodyDerived(body) {
 updateLinearVelocity(body);
 const rotation=body.rotation.map(value=>value<<4);
 const inertiaTimesTranspose=Array.from({length:9},(_,i)=>multiplyQ16(body.inverseInertia[Math.floor(i/3)],rotation[(i%3)*3+Math.floor(i/3)]));
 body.worldInverseInertia=multiplyMatrixQ16(rotation,inertiaTimesTranspose);
 body.angularVelocity=transformVectorQ16(body.worldInverseInertia,body.angularMomentum).map(value=>value>>8);
 body.quaternionDerivative=multiplyQuaternionQ16([0,...body.angularVelocity],body.quaternion).map(value=>value>>1);
 return body;
}
// FUN_00479d20's arithmetic. Callers split a frame at collision event times.
// Optional special time scaling only affects eligible object types 3, 7 and 21.
// Runtime attachment queues and broad-phase updates are handled by the caller.
export function advanceBody(body,fractionQ16,{timeScaleQ16=65536,timeScaleActive=false,timeScaleExempt=false}={}) {
 if(!Number.isInteger(fractionQ16)||fractionQ16<0||fractionQ16>65536)throw Error('Body advance requires a frame fraction from 0 to 65536.');
 return advanceBodyDelta(body,fractionQ16,{timeScaleQ16,timeScaleActive,timeScaleExempt});
}
// Collision scheduling also admits signed deltas (and processes a negative one
// before terminating its loop). Keep that machine domain separate from the
// convenient bounded-frame API above.
export function advanceBodyDelta(body,deltaQ16,{timeScaleQ16=65536,timeScaleActive=false,timeScaleExempt=false}={}) {
 if(!Number.isInteger(deltaQ16)||deltaQ16< -2147483648||deltaQ16>2147483647)throw Error('Body time delta must be a signed 32-bit integer.');
 const eligible=[3,7,21].includes(body.flags&0x1ff);
 const fraction=timeScaleActive&&!timeScaleExempt&&eligible?multiplyQ16(deltaQ16,timeScaleQ16):deltaQ16;
 body.position=body.position.map((value,axis)=>add32(value,multiplyQ16(fraction,body.linearVelocity[axis])));
 if(!(body.integrationFlags&1)) {
  body.quaternion=normalizeQuaternionQ16(body.quaternion.map((value,index)=>add32(value,multiplyQ16(fraction,body.quaternionDerivative[index]))));
  body.rotation=quaternionMatrix(body.quaternion);
 }
 return body;
}
