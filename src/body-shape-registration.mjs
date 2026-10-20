// 0x428270 registers descriptors in a caller-owned native 72-byte shape pool.
// The free-ID order is explicit: native pool creation/allocation ownership is
// separate. Registration preserves every field the original routine leaves stale.
import {lookupSqrt} from './fixed-integer.mjs';
import {multiplyQ8} from './sphere-collision.mjs';
export class BodyShapePool {
 constructor(records,freeIds) {
  if(!Buffer.isBuffer(records)||records.length%72||records.length>256*72||!Array.isArray(freeIds)||new Set(freeIds).size!==freeIds.length||freeIds.some(id=>!Number.isInteger(id)||id<0||id>=records.length/72))throw Error('Body shape pool requires record storage and explicit unique free byte IDs.');
  this.records=records;this.freeIds=Uint8Array.from(freeIds);this.freeTop=freeIds.length-1;this.activeIds=new Uint8Array(freeIds.length);this.activeTop=-1;this.reverseIndices=new Uint8Array(256);this.allocatedCount=0;
 }
 allocate() {
  if(this.freeTop<0)throw Error('Body shape pool exhausted.');
  const id=this.freeIds[this.freeTop--];this.allocatedCount=(this.allocatedCount+1)|0;this.activeIds[++this.activeTop]=id;this.reverseIndices[id]=this.activeTop&255;
  return {id,record:this.records.subarray(id*72,(id+1)*72)};
 }
}
export function registerBodyCollisionShapes(body,descriptors,pool,physicalBodies) {
 if(!Buffer.isBuffer(descriptors)||descriptors.length%20||descriptors.length/20>255||!Array.isArray(physicalBodies))throw Error('Body shape registration requires 20-byte descriptors and a physical body list.');
 const count=descriptors.length/20;if(count&&pool.freeTop+1<count+1)throw Error('Body shape pool cannot hold descriptors plus aggregate.');
 body.collisionCount10c=count&255;body.collisionIds??=[];let radius=0;
 for(let index=0;index<count;index++) {
  const {id,record}=pool.allocate();body.collisionIds[index]=id;
  const center=[0,4,8].map(p=>descriptors.readInt16LE(index*20+p));center.forEach((value,axis)=>record.writeInt16LE(value,axis*2));record.writeInt32LE(descriptors.readInt32LE(index*20+12),0x40);record.writeUInt16LE(descriptors.readUInt16LE(index*20+16),0x44);
  record.fill(0,0x20,0x38);record.writeInt32LE(-1,0x38);record.writeUInt16LE(index,0x46);
  const squared=center.reduce((sum,value)=>(sum+multiplyQ8(value,value))|0,0),bound=((lookupSqrt(squared)<<4)+record.readInt32LE(0x40))|0;if((bound>>>0)>(radius>>>0))radius=bound;
 }
 if(count){const {id,record}=pool.allocate();body.collisionIds[count]=id;record.fill(0,0,6);record.fill(0,0x20,0x38);record.writeUInt16LE(0,0x44);record.writeInt32LE((body.flags&0x1ff)===17?0x5000:radius,0x40);record.writeUInt16LE(count,0x46);body.flags&=~0x8000;}
 physicalBodies.push(body);body.collisionGroup130=0;
 return count?pool.records.subarray(body.collisionIds[count]*72,(body.collisionIds[count]+1)*72):null;
}
