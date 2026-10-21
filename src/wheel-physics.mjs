// Native wheel arithmetic, with terrain/model hit selection supplied separately.
// Anchors: scene results 137..154; see re-docs/wheels.md for layouts and limits.
import {add32,subtract32,multiplyQ16,divideQ16,dotQ16,crossQ16,
 vectorLengthQ16,transformShortQ12,signedShort} from './fixed-integer.mjs';
const vector=(data,p)=>[0,1,2].map(i=>data.readInt32LE(p+i*4));
function range(data,offset,length,label) {
 if(!Buffer.isBuffer(data)||!Number.isSafeInteger(offset)||offset<0||offset+length>data.length)throw Error(`Wheel ${label} exceeds buffer bounds.`);
}
export function decodeWheelDescriptor(data,offset=0) {
 range(data,offset,0x1c,'descriptor');
 return {positionQ8:[0,2,4].map(p=>data.readInt16LE(offset+p)),directionQ8:[8,10,12].map(p=>data.readInt16LE(offset+p)),
  tag:data.readInt32LE(offset+16),raw:Buffer.from(data.subarray(offset,offset+0x1c))};
}
export function decodeWheelContact(data,offset=0) {
 range(data,offset,0x4c,'contact');
 return {directionQ12:vector(data,offset),probeVelocity:vector(data,offset+0xc),leverArm:vector(data,offset+0x18),
  contactVelocity:vector(data,offset+0x24),relativeHit:vector(data,offset+0x30),normal:vector(data,offset+0x3c),distance:data.readInt32LE(offset+0x48)};
}
export function decodeWheelState(data,offset=0) {
 range(data,offset,200,'state');
 return {flags:data[offset],supportProjection:vector(data,offset+4),slipVector:vector(data,offset+0x10),relativeHit:vector(data,offset+0x1c),
  leverArm:vector(data,offset+0x28),driveDirection:vector(data,offset+0x34),spin:data.readInt32LE(offset+0x58),
  angle:data.readInt32LE(offset+0x78),slipSpeed:data.readInt32LE(offset+0x7c),raw:Buffer.from(data.subarray(offset,offset+200))};
}
// FUN_004890a0: descriptor points are Q8 shorts; the native probe spans 44
// source units. Short wrapping and the Q12 transform happen before Q16 shifts.
export function buildWheelProbe(body,descriptor) {
 const leverArm=transformShortQ12(body.rotation,descriptor.positionQ8).map(value=>value<<8);
 const directionQ12=transformShortQ12(body.rotation,descriptor.directionQ8.map(value=>signedShort(value<<4)));
 const probeVelocity=crossQ16(body.angularVelocity,leverArm).map((value,i)=>add32(value,body.linearVelocity[i]));
 return {directionQ12,probeVelocity,leverArm,query:{originQ8:leverArm.map((value,i)=>add32(body.position[i],value)>>8),
  deltaQ8:directionQ12.map(value=>Math.imul(value,44)>>4),radius:0,tag:descriptor.tag+100,rangeQ16:44*65536}};
}
// FUN_00488bf0 / FUN_00488d20. hit is the native query result, not an inferred
// ray intersection. Hit-point/normal selection and material lookup stay external.
export function resolveWheelContact(body,descriptor,probe,hit) {
 if(!hit.flags)return null;
 const distance=multiplyQ16(hit.fractionQ16,probe.query.rangeQ16);
 const localContact=descriptor.positionQ8.map((value,i)=>signedShort(value+multiplyQ16(descriptor.directionQ8[i],distance)));
 const contactLever=transformShortQ12(body.rotation,localContact).map(value=>value<<8);
 const contactVelocity=crossQ16(body.angularVelocity,contactLever).map((value,i)=>add32(value,body.linearVelocity[i]));
 const point=hit.fractionQ16===0?probe.query.originQ8:hit.pointQ8;
 return {directionQ12:probe.directionQ12.slice(),probeVelocity:probe.probeVelocity.slice(),leverArm:probe.leverArm.slice(),
  contactVelocity,relativeHit:point.map((value,i)=>subtract32(value<<8,body.position[i])),normal:hit.normalQ16.slice(),distance};
}
// FUN_00488910 / FUN_00488f00 side attempts. The batch selector supplies the
// terrain/model decision for all four probes. Original raw surface pointers are
// represented by caller-resolved metadata rather than fabricated addresses.
export function prepareWheelContactSides(body,state,selectHits,{resolveSurface=()=>null}={}) {
 const {descriptors,wheels}=state;
 if(descriptors.length!==4||wheels.length!==4)throw Error('Wheel-side preparation requires four wheel slots.');
 state.contacts??=Array.from({length:4},()=>({}));
 if(state.contacts.length!==4)throw Error('Wheel-side preparation requires four contact slots.');
 const positionY=Math.abs(signedShort(descriptors[0].positionQ8[1])),directionY=Math.abs(signedShort(descriptors[0].directionQ8[1]));
 let side=state.side??0;
 for(let attempt=0;attempt<2;attempt++) {
  for(const descriptor of descriptors){descriptor.positionQ8[1]=signedShort(side?-positionY:positionY);descriptor.directionQ8[1]=signedShort(side?-directionY:directionY);}
  const probes=descriptors.map(descriptor=>buildWheelProbe(body,descriptor)),hits=selectHits(probes,{side,attempt});
  if(!Array.isArray(hits)||hits.length!==4)throw Error('Wheel selector must return four hit results.');
  let anyContact=false;
  for(let wheel=0;wheel<4;wheel++) {
   const descriptor=descriptors[wheel],probe=probes[wheel],hit=hits[wheel],target=state.contacts[wheel];
   Object.assign(target,{directionQ12:probe.directionQ12.slice(),probeVelocity:probe.probeVelocity.slice(),leverArm:probe.leverArm.slice()});
   const contact=resolveWheelContact(body,descriptor,probe,hit);
   if(contact){Object.assign(target,contact);descriptor.cellRef=hit.cellRef;descriptor.surface=(hit.cellRef|0)<0?null:resolveSurface(hit.cellRef);}
   else {descriptor.cellRef=-1;descriptor.surface=null;target.distance=-1;}
   if(target.distance<0){wheels[wheel].flags=0;target.distance=-1;}
   else {wheels[wheel].flags|=1;anyContact=true;}
  }
  if(anyContact){state.side=side;return {contact:true,attempts:attempt+1,side,probes,hits};}
  side=side===0?1:0;
 }
 return {contact:false,attempts:2,side:state.side??0};
}
// FUN_00488370, including the coefficient sequence and unilateral clamp.
export function solveWheelSuspension(contact) {
 const direction=contact.directionQ12.map(value=>value<<4);
 const compression=subtract32(0x240000,contact.distance),rate=(-dotQ16(contact.probeVelocity,contact.normal))|0;
 const intermediate=divideQ16(subtract32(rate,multiplyQ16(compression,-0x2aab)),0x532c);
 const termA=multiplyQ16(add32(multiplyQ16(compression,0xf29b),multiplyQ16(intermediate,0x51b8)),-0x241e);
 const termB=multiplyQ16(add32(multiplyQ16((-compression)|0,0x1a8d),multiplyQ16(intermediate,0x4ed2)),0xd8b3);
 const scalar=Math.max(-40000,Math.min(0,add32(subtract32(termB,rate),termA)>>2));
 const impulse=direction.map(value=>multiplyQ16(value,scalar)),angularImpulse=crossQ16(contact.leverArm,impulse);
 const relative=contact.contactVelocity.map((value,i)=>subtract32(value,multiplyQ16(direction[i],rate)));
 const normalComponent=dotQ16(direction,relative);
 const slipVector=relative.map((value,i)=>subtract32(value,multiplyQ16(direction[i],normalComponent)));
 const supportDot=dotQ16(contact.normal,impulse),supportProjection=impulse.map(value=>multiplyQ16(supportDot,value));
 return {scalar,impulse,angularImpulse,slipVector,supportProjection};
}
export function applyWheelSuspension(body,wheels,contacts) {
 if(wheels.length!==4||contacts.length!==4)throw Error('Native suspension requires four wheel slots.');
 const total=[0,0,0],torque=[0,0,0],results=[];
 for(let index=0;index<4;index++) {
  const wheel=wheels[index],contact=contacts[index];
  if(!(wheel.flags&1)){results.push(null);continue;}
  if(!contact)throw Error(`Active wheel ${index} has no contact record.`);
  const result=solveWheelSuspension(contact);results.push(result);
  for(let axis=0;axis<3;axis++){total[axis]=add32(total[axis],result.impulse[axis]);torque[axis]=add32(torque[axis],result.angularImpulse[axis]);}
  Object.assign(wheel,{slipVector:result.slipVector,supportProjection:result.supportProjection,
   relativeHit:contact.relativeHit.slice(),leverArm:contact.leverArm.slice(),normal:contact.normal.slice(),distance:contact.distance});
 }
 body.momentum=body.momentum.map((value,i)=>add32(value,total[i]));
 body.angularMomentum=body.angularMomentum.map((value,i)=>add32(value,torque[i]));
 return results;
}
// FUN_0041c870. The caller supplies global special-time eligibility explicitly.
export function advanceWheelSpin(wheel,driveInput,contactDot,{timeScaleActive=false,timeScaleQ16=65536,timeScaleExempt=false}={}) {
 const increment=multiplyQ16(add32(driveInput,multiplyQ16(contactDot,-0x1b333)),0x22f5c);
 let spin=add32(wheel.spin,increment);
 if(wheel.spin!==0&&((wheel.spin^spin)|0)<0)spin=0;
 wheel.spin=spin;
 wheel.angle=add32(wheel.angle,timeScaleActive&&!timeScaleExempt?multiplyQ16(timeScaleQ16,spin):spin);
 return spin;
}
// FUN_0041c720's grip arithmetic; skid sound/particle bookkeeping is excluded.
export function solveWheelTraction(wheel,slip,capacity,surfaceReduction,driveInput=0,timeOptions={},onMeasuredSlip) {
 const measuredSpeed=vectorLengthQ16(slip);onMeasuredSlip?.({wheel,measuredSpeed,surfaceReduction});
 const reduction=Math.max(surfaceReduction,0);
 const effectiveCapacity=subtract32(capacity,Math.trunc(Math.imul(capacity,reduction)/32));
 let correction,slipSpeed=measuredSpeed,skidding=false;
 if(measuredSpeed<(effectiveCapacity<<3))correction=slip.map(value=>(-Math.trunc(value/8))|0);
 else {
  const scale=divideQ16((-effectiveCapacity)|0,measuredSpeed);
  correction=slip.map(value=>multiplyQ16(value,scale));
  slipSpeed=subtract32(measuredSpeed,Math.trunc(Math.imul(measuredSpeed,reduction)/32));
  skidding=slipSpeed>=0x30000;
 }
 wheel.slipSpeed=slipSpeed;
 advanceWheelSpin(wheel,driveInput,dotQ16(correction,wheel.driveDirection),timeOptions);
 return {correction,measuredSpeed,slipSpeed,effectiveCapacity,skidding};
}
