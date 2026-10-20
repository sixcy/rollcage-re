// Static-candidate orchestration 0x427bd0. Terrain/model geometry queries remain
// explicit callbacks; contact merging and event storage are recovered.
import {prepareBodyShapeCache} from './body-shape-cache.mjs';
import {insertCollisionEvent} from './collision-events.mjs';
import {mergeStaticShapeContacts} from './static-contact.mjs';
function groupState(group){const count=group.count??group.bodies.length;if(!Number.isInteger(count)||count<0||count>65535||count>group.bodies.length)throw Error('Static candidate group requires an in-bounds unsigned16 count.');return {bodies:group.bodies,count};}
function radiusRecord(records,id){if(!Number.isInteger(id)||id<0||id>255)throw Error('Type 17 static candidates require two explicit collisionIds.');const record=Buffer.isBuffer(records)?records.subarray(id*72,(id+1)*72):records[id];if(!Buffer.isBuffer(record)||record.length<72)throw Error('Static candidate radius requires a 72-byte record.');return record;}
// scratch.contact and scratch.tag preserve caller-selected initial/stale stack
// values across bodies. prepareContact(body, contact, tag, stateIsEight) mutates
// them and body.collisionState128 / collisionDelta124, returning removal status.
export function buildStaticCollisionEvents(group,{records,queue,selectionCounter,terrainBatch,modelBody,prepareContact=(body,contact,tag,allowSliding)=>mergeStaticShapeContacts(body,contact,tag,allowSliding,records),scratch,prepare=prepareBodyShapeCache,timeOptions}={}) {
 if(!Number.isInteger(selectionCounter)||selectionCounter< -2147483648||selectionCounter>2147483647)throw Error('Static candidate selection requires the explicit global counter value.');
 for(const [name,handler]of Object.entries({terrainBatch,modelBody,prepareContact}))if(typeof handler!=='function')throw Error(`Static candidate callback ${name} is required.`);
 if(!scratch?.contact||!scratch?.tag||!Number.isInteger(scratch.tag.value))throw Error('Static candidates require explicit reusable contact and tag scratch.');
 let counter=selectionCounter,emitted=0;
 const marked=groupState(group);
 for(let index=0;index<marked.count;index++){
  const body=marked.bodies[index],flags=body.flags,type=flags&0x1ff;
  if(!(flags&0x800)||(flags&0x8200))continue;
  if(type===7||type===21){const previous=counter;counter=(counter+1)|0;if(previous&1)continue;}
  if((body.collisionFlags&0x90000000)||body.frameTimeQ16===65536)continue;
  body.flags=flags|0x10000;
  if(body.collisionCache114!==body.frameTimeQ16)prepare(body,body.frameTimeQ16,records,timeOptions);
  if((body.flags&0x1ff)===17){radiusRecord(records,body.collisionIds?.[0]).writeInt32LE(0x1900,0x40);radiusRecord(records,body.collisionIds?.[1]).writeInt32LE(0x5000,0x40);}
 }
 const modeled=groupState(group);
 terrainBatch(modeled.bodies,modeled.count);
 for(let index=0;index<modeled.count;index++){const body=modeled.bodies[index];if((body.flags&0x10000)&&(body.modelCandidateCount15e&65535))modelBody(body);}
 const contacts=groupState(group);
 for(let index=0;index<contacts.count;index++){
  const body=contacts.bodies[index];if(!(body.flags&0x10000))continue;
  body.flags&=~0x10000;
  const initialState=body.collisionState128;
  if(initialState!==0){
   const removed=prepareContact(body,scratch.contact,scratch.tag,initialState===8);
   if(removed)body.collisionState128=16;
   const flags={value:body.collisionState128|0};
   insertCollisionEvent(queue,{object1:body,contact:scratch.contact,flags,tag:removed?0:scratch.tag.value,deltaQ16:removed?0:body.collisionDelta124});
   body.collisionState128=flags.value;emitted++;
  }
  body.collisionFlags|=0x10000000;
 }
 const restored=groupState(group);
 for(let index=0;index<restored.count;index++){const body=restored.bodies[index];if((body.flags&0x1ff)===17)for(let sphere=0;sphere<2;sphere++)radiusRecord(records,body.collisionIds?.[sphere]).writeInt32LE(32000,0x40);}
 return emitted;
}
