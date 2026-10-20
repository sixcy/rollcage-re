// Merge native per-shape static contacts: 0x448570 / normal helper0x492cc0.
import {abs32,dotQ16,vectorLengthQ16,divideQ16,multiplyQ16} from './fixed-integer.mjs';
const vector=(record,p)=>[0,4,8].map(axis=>record.readInt32LE(p+axis));
function recordAt(body,records,index){const id=body.collisionIds?.[index];if(!Number.isInteger(id)||id<0||id>255)throw Error('Static contact requires explicit unsigned byte shape IDs.');const record=Buffer.isBuffer(records)?records.subarray(id*72,(id+1)*72):records[id];if(!Buffer.isBuffer(record)||record.length<72)throw Error('Static contact requires 72-byte cache records.');return record;}
function normalizeNormal(input) {
 const value=input.some(lane=>abs32(lane)>0x230000)?input.map(lane=>lane>>3):input;
 const reciprocal=divideQ16(65536,vectorLengthQ16(value));return value.map(lane=>multiplyQ16(lane,reciprocal));
}
export function mergeStaticShapeContacts(body,contact,tag,allowSliding,records) {
 if(!Number.isInteger(body.collisionCount10c)||body.collisionCount10c< -128||body.collisionCount10c>255)throw Error('Static contact requires explicit byte +0x10c.');
 const count=body.collisionCount10c<<24>>24;tag.value=0;
 if(body.collisionState128&0x2000){const record=recordAt(body,records,count);contact.normal=vector(record,0x2c);contact.point=vector(record,0x20);contact.flags44=record.readUInt16LE(0x44);contact.scalar=record.readInt32LE(0x3c);contact.field38=record.readInt32LE(0x38);body.collisionState128&=~0x2000;return 0;}
 if(!(body.collisionFlags&0xffffff))return 1;
 contact.normal=[0,0,0];contact.point=[0,0,0];contact.flags44=0;contact.scalar=0;contact.field38=-1;
 let bits=body.collisionFlags,normalCount=0;
 for(let index=0;index<count;index++,bits>>=1){const record=recordAt(body,records,index);if(bits&1){contact.normal=contact.normal.map((value,axis)=>(value+record.readInt32LE(0x2c+axis*4))|0);normalCount++;}}
 if(contact.normal.every(value=>value===0))return 1;
 if(normalCount>1)contact.normal=normalizeNormal(contact.normal);
 bits=body.collisionFlags;let pointCount=0;
 for(let index=0;index<count;index++,bits>>=1){const record=recordAt(body,records,index);record.writeUInt16LE(record.readUInt16LE(0x44)&0xfeff,0x44);
  if(!(bits&1))continue;
  contact.field38=record.readInt32LE(0x38);
  if(body.collisionState128===8){tag.value=(tag.value+1)|0;if(!allowSliding)continue;}
  contact.point=contact.point.map((value,axis)=>(value+record.readInt32LE(0x20+axis*4))|0);contact.flags44&=record.readUInt16LE(0x44);
  if(body.collisionState128===2){const alignment=dotQ16(contact.normal,vector(record,0x2c));if(alignment===0)return 1;const penetration=divideQ16(record.readInt32LE(0x3c),alignment);if(penetration<contact.scalar)contact.scalar=penetration;}
  record.writeUInt16LE(record.readUInt16LE(0x44)|0x100,0x44);pointCount++;
 }
 const center=body.position.map(value=>value>>8),reciprocal=divideQ16(65536,pointCount<<16);
 contact.point=contact.point.map((value,axis)=>(multiplyQ16((value-Math.imul(center[axis],pointCount))|0,reciprocal)+center[axis])|0);
 return 0;
}
