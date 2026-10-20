// Stored-contact consumption4285d0 and ordinary frame friction47a080.
import {abs32,lookupSqrt,multiplyQ16,divideQ16,dotQ16,crossQ16} from './fixed-integer.mjs';
import {multiplyQ8} from './sphere-collision.mjs';
import {splitCollisionVelocity} from './collision-response.mjs';
const vector=(record,p)=>[0,4,8].map(axis=>record.readInt32LE(p+axis));
const countOf=body=>{const count=body.collisionCount10c;if(!Number.isInteger(count)||count< -128||count>255)throw Error('Body contact requires explicit byte +0x10c.');return count<<24>>24;};
export function bodyContactRecord(body,records,index=countOf(body)){const id=body.collisionIds?.[index];if(!Number.isInteger(id)||id<0||id>255)throw Error('Body contact requires explicit byte shape IDs.');const record=Buffer.isBuffer(records)?records.subarray(id*72,(id+1)*72):records[id];if(!Buffer.isBuffer(record)||record.length<72)throw Error('Body contact requires a72-byte cache record.');return record;}
export function consumeBodyContactState(body,records){
 const count=countOf(body);let selected=0;
 for(let index=count-1;index>=0;index--){const record=bodyContactRecord(body,records,index);if(record.readUInt16LE(0x44)&0x100)selected++;record.writeUInt16LE(0,0x44);}
 if(selected){const record=bodyContactRecord(body,records),relative=vector(record,0x20).map((value,axis)=>((value-(body.position[axis]>>8))|0)>>8),squared=relative.reduce((sum,value)=>(sum+multiplyQ8(value,value))|0,0);record.writeInt32LE(lookupSqrt(squared)<<12,0x3c);}
 return selected;
}
// Helpers492430/492340 scale to a target length. Large inputs first truncate
// their components toward zero to integer units, with the native root clamp.
export function scaleContactVector(input,targetQ16){
 let length;
 if(input.some(value=>abs32(value)>0xb40000)){const integers=input.map(value=>Math.trunc(value/65536));length=lookupSqrt(abs32(integers.reduce((sum,value)=>(sum+Math.imul(value,value))|0,0)));if(length)length=Math.min(length,0x7fff)<<16;}
 else length=lookupSqrt(abs32(dotQ16(input,input)))<<8;
 if(length){const scale=multiplyQ16(divideQ16(65536,length),targetQ16);for(let axis=0;axis<3;axis++)input[axis]=multiplyQ16(input[axis],scale);}
 return input;
}
export function calculateBodyContactFriction(body,records,normalForce,tangentVelocity,count,linearOutput=[0,0,0],angularOutput=[0,0,0]){
 if(!Number.isInteger(body.contactFrictionB4)||body.contactFrictionB4< -2147483648||body.contactFrictionB4>2147483647)throw Error('Body friction requires explicit signed coefficient +0xb4.');
 const record=bodyContactRecord(body,records),normal=vector(record,0x2c),lever=vector(record,0x20),reduced=tangentVelocity.map(value=>value>>2),speed=lookupSqrt(abs32(dotQ16(reduced,reduced)))<<10,radius=record.readInt32LE(0x3c),ratio=radius?divideQ16(speed,radius):0;
 const forceMagnitude=lookupSqrt(abs32(dotQ16(normalForce,normalForce)))<<8;let cap=Math.imul(multiplyQ16(forceMagnitude,body.contactFrictionB4),count);
 for(let axis=0;axis<3;axis++)linearOutput[axis]=-tangentVelocity[axis]|0;
 if(ratio<16){
  linearOutput.fill(0);angularOutput.fill(0);
  if(body.angularMomentum.every(value=>abs32(value)<10000)){body.angularMomentum=[0,0,0];body.angularVelocity=[0,0,0];}
  if(body.momentum.every(value=>abs32(value)<70)){body.momentum=[0,0,0];body.linearVelocity=[0,0,0];}
 }else{
  if(cap>ratio)cap=ratio*2|0;
  scaleContactVector(linearOutput,cap);const torque=crossQ16(lever,linearOutput);for(let axis=0;axis<3;axis++)angularOutput[axis]=torque[axis];
 }
 const spin=-dotQ16(body.angularVelocity,normal)|0,spinProjection=scaleContactVector(normal.map(value=>multiplyQ16(spin,value)),Math.imul(cap,5));
 for(let axis=0;axis<3;axis++)angularOutput[axis]=(angularOutput[axis]+spinProjection[axis])|0;
 const tangent=splitCollisionVelocity(normal,body.linearVelocity).tangent.map(value=>-value|0);scaleContactVector(tangent,Math.imul(multiplyQ16(forceMagnitude,0xed8),count));
 for(let axis=0;axis<3;axis++)linearOutput[axis]=(linearOutput[axis]+tangent[axis])|0;
 return {linear:linearOutput,angular:angularOutput};
}
export function accumulateBodyContactFriction(body,records,count){
 const record=bodyContactRecord(body,records),normal=vector(record,0x2c),velocity=crossQ16(body.angularVelocity,vector(record,0x20)).map((value,axis)=>(value+body.linearVelocity[axis])|0),normalForce=normal.map(value=>multiplyQ16(value,dotQ16(body.force,normal))),tangent=splitCollisionVelocity(normal,velocity).tangent;
 const result=calculateBodyContactFriction(body,records,normalForce,tangent,count);for(let axis=0;axis<3;axis++){body.force[axis]=(body.force[axis]+result.linear[axis])|0;body.torque[axis]=(body.torque[axis]+result.angular[axis])|0;}
 return result;
}
