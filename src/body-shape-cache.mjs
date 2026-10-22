// Candidate-time sphere cache: 0x429820, 0x429ab0, and contact store 0x475840.
// Records retain their native 72-byte layout so unmodified/stale fields survive.
import {multiplyQ16} from './fixed-integer.mjs';
import {assertNativeMemorySpan,sharesNativeMemorySpan} from './native-memory-spans.mjs';
export const BODY_SHAPE_CACHE_STRIDE=0x48;
export const BODY_SHAPE_CACHE_LAYOUT=Object.freeze({localCenter:0,position:8,velocity:0x14,contactPoint:0x20,contactNormal:0x2c,contactTime:0x38,contactScalar:0x3c});
const signedByte=value=>(value<<24)>>24;
const short=value=>(value<<16)>>16;
const signed32=(value,label)=>{if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error(`${label} must be a signed 32-bit integer.`);return value;};
function countOf(body){if(!Number.isInteger(body.collisionCount10c)||body.collisionCount10c< -128||body.collisionCount10c>255)throw Error('Sphere cache requires the explicit byte at body +0x10c.');return signedByte(body.collisionCount10c);}
function recordAt(records,id){if(!Number.isInteger(id)||id<0||id>255)throw Error('Sphere cache requires an explicit unsigned byte ID for every accessed collisionIds entry.');const record=Buffer.isBuffer(records)?records.subarray(id*0x48,(id+1)*0x48):records[id];if(!Buffer.isBuffer(record)||record.length<0x48)throw Error(`Sphere cache record ${id} requires 72 bytes.`);return record;}
const writeVector=(record,p,values)=>values.forEach((value,index)=>record.writeInt32LE(value|0,p+index*4));
// 0x429ab0: delta and velocityScale are already selected by 0x429820. A zero
// scale means "skip scaling" in this helper, including when the global scale
// was itself zero. Pose remains unchanged; only record +8..+1f is refreshed.
export function updateBodyShapeCacheEntry(body,record,deltaQ16,velocityScaleQ16=0,nativeState) {
 signed32(deltaQ16,'Sphere cache delta');signed32(velocityScaleQ16,'Sphere cache velocity scale');
 if(!Buffer.isBuffer(record)||record.length<0x48)throw Error('Sphere cache entry requires 72 bytes.');
 let offset=[0,0,0],velocity=body.linearVelocity.slice();
 if(countOf(body)>1){
  const local=[0,1,2].map(index=>record.readInt16LE(index*2));
  offset=[0,1,2].map(row=>{let sum=0;for(let column=0;column<3;column++)sum=(sum+Math.imul(short(body.rotation[row*3+column]),local[column]))|0;return sum>>12;});
  nativeState?.shapeTransform?.(record,offset);
  const angular=body.angularVelocity.map(value=>value>>8);
  const cross=[(Math.imul(angular[1],offset[2])-Math.imul(angular[2],offset[1]))|0,(Math.imul(angular[2],offset[0])-Math.imul(angular[0],offset[2]))|0,(Math.imul(angular[0],offset[1])-Math.imul(angular[1],offset[0]))|0];
  velocity=velocity.map((value,index)=>(value+cross[index])|0);
 }
 if(velocityScaleQ16!==0)velocity=velocity.map(value=>multiplyQ16(velocityScaleQ16,value));
 if(deltaQ16>0)offset=offset.map((value,index)=>(value+(multiplyQ16(velocity[index],deltaQ16)>>8))|0);
 writeVector(record,8,offset.map((value,index)=>(value+(body.position[index]>>8))|0));
 writeVector(record,0x14,velocity.map(value=>value>>8));
 return record;
}
// collisionIds[count] selects an aggregate cache entry. It is refreshed without
// extrapolation or time scaling; individual entries run in descending list order.
// A negative signed count still selects that explicit collisionIds property,
// then skips the sphere loop, matching the byte-indexed machine behavior.
export function prepareBodyShapeCache(body,timeQ16,records,{timeScaleQ16=65536,timeScaleActive=false,timeScaleExempt=false,nativeState,nativeStack}={}) {
 signed32(timeQ16,'Sphere cache time');signed32(body.frameTimeQ16,'Body frame clock');
 const count=countOf(body),aggregate=recordAt(records,body.collisionIds?.[count]);
 //429820 locals only: these survive its429ab0 children and alias the next
 //424e20 output scalar/flags/contactTime. Caller-specific saved registers and
 //deeper children are separate contracts; no invented incoming values here.
 const frame=nativeStack?nativeStack.scratchBase-40:0,stackMemory=nativeStack?.memory;
 if(nativeStack){
  assertNativeMemorySpan(stackMemory,frame,40);
  if(!sharesNativeMemorySpan(stackMemory,body.bytes,body.address,0x180))throw Error('Native shape cache requires shared body storage.');
  const put=(offset,value)=>stackMemory.writeInt32LE(value|0,frame+offset),delta=(timeQ16-body.frameTimeQ16)|0;
  put(0x18,timeQ16);put(0x14,delta);put(0x20,delta);put(0x10,stackMemory.readUInt32LE(0x91e79c));put(0x24,count);
  //FILD/FSTP's temporary is finally overwritten by zero at4299e9.
  for(let i=0;i<9;i++)stackMemory.writeFloatLE(Math.fround(body.rotation[i]),frame+0x1c);
  put(0x1c,0);
 }
 writeVector(aggregate,8,body.position.map(value=>value>>8));writeVector(aggregate,0x14,body.linearVelocity.map(value=>value>>8));
 nativeState?.cacheRotation(body);
 let delta=(timeQ16-body.frameTimeQ16)|0,scale=0;
 if(timeScaleActive&&!timeScaleExempt&&delta!==0&&[3,7,21].includes(body.flags&0x1ff)){scale=signed32(timeScaleQ16,'Sphere cache global time scale');delta=multiplyQ16(scale,delta);}
 if(nativeStack){stackMemory.writeInt32LE(delta,frame+0x14);stackMemory.writeInt32LE(scale,frame+0x1c);}
 for(let index=count-1;index>=0;index--){const record=recordAt(records,body.collisionIds?.[index]);nativeState?.beforeShapeCacheEntry?.(body,record,delta,scale);updateBodyShapeCacheEntry(body,record,delta,scale,nativeState);if(timeQ16===0&&body.frameTimeQ16===0)record.writeInt32LE(-1,0x38);}
 body.collisionCache114=timeQ16;
 return aggregate;
}
// The dispatcher supplies its already-mutated contact payload. Keep the native
// units; this helper performs only copies into the aggregate record.
export function storeBodyShapeContact(body,contact,records) {
 const aggregate=recordAt(records,body.collisionIds?.[countOf(body)]);
 writeVector(aggregate,0x2c,contact.normal);writeVector(aggregate,0x20,contact.point);aggregate.writeInt32LE(contact.scalar|0,0x3c);
 return aggregate;
}
