import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeStaticShapeContacts} from '../src/static-contact.mjs';
import {buildStaticCollisionEvents} from '../src/static-collision-candidates.mjs';
import {queryTerrainBodyShapes} from '../src/static-shape-queries.mjs';
import {storeBodyShapeContact} from '../src/body-shape-cache.mjs';
import {CollisionEventQueue,processCollisionEvents} from '../src/collision-events.mjs';
import {dispatchCollisionResponse} from '../src/collision-dispatch.mjs';
import {finishBodyAdvancement} from '../src/body-advancement.mjs';
function sphere(point,normal,scalar,time,flags=0x1234){const record=Buffer.alloc(72);for(const [offset,values]of [[0x20,point],[0x2c,normal]])values.forEach((value,index)=>record.writeInt32LE(value,offset+index*4));record.writeInt32LE(scalar,0x3c);record.writeInt32LE(time,0x38);record.writeUInt16LE(flags,0x44);return record;}
const body=(extra={})=>({collisionCount10c:2,collisionIds:[0,1,2],collisionState128:1,collisionFlags:3,position:[65536,2*65536,3*65536],...extra});
const output=()=>({point:[9,9,9],normal:[8,8,8],scalar:7,field38:6,flags44:5});
test('multiple static contacts normalize their summed normal and average points relative to the body',()=>{
 const records=[sphere([512,512,768],[0,65536,0],-32,11),sphere([1024,512,768],[0,65536,0],-64,22)],contact=output(),tag={value:99};
 assert.equal(mergeStaticShapeContacts(body(),contact,tag,true,records),0);
 assert.deepEqual(contact,{point:[768,512,768],normal:[0,65536,0],scalar:0,field38:22,flags44:0});assert.equal(tag.value,0);
 for(const record of records)assert.ok(record.readUInt16LE(0x44)&0x100);
});
test('overlap merger projects penetration and sliding merger counts selected shapes',()=>{
 const records=[sphere([512,512,768],[0,65536,0],-32,11),sphere([1024,512,768],[0,65536,0],-64,22)],contact=output(),tag={value:99};
 assert.equal(mergeStaticShapeContacts(body({collisionState128:2}),contact,tag,true,records),0);assert.equal(contact.scalar,-64);
 assert.equal(mergeStaticShapeContacts(body({collisionState128:8}),contact,tag,true,records),0);assert.equal(tag.value,2);assert.equal(contact.scalar,0);
});
test('aggregate static hit copies its cache fields and consumes only the aggregate marker',()=>{
 const record=sphere([1,-2,3],[65536,0,0],-17,42,0x4321),first=body({collisionState128:0x2041,collisionFlags:0}),contact=output(),tag={value:99};
 assert.equal(mergeStaticShapeContacts(first,contact,tag,true,[null,null,record]),0);
 assert.deepEqual(contact,{point:[1,-2,3],normal:[65536,0,0],scalar:-17,field38:42,flags44:0x4321});assert.equal(first.collisionState128,0x41);assert.equal(tag.value,0);
});
test('opposite selected normals request removal before changing shape flags',()=>{
 const records=[sphere([0,0,0],[0,65536,0],0,1),sphere([0,0,0],[0,-65536,0],0,2)],before=records.map(record=>Buffer.from(record)),contact=output();
 assert.equal(mergeStaticShapeContacts(body(),contact,{value:99},true,records),1);assert.deepEqual(contact.normal,[0,0,0]);assert.deepEqual(records,before);
});
test('static scheduling connects cache, shape selection, real merger, response and aggregate contact storage',()=>{
 const first=body({flags:0x803,position:[0,2*65536,0],linearVelocity:[0,-4*65536,0],momentum:[0,-4*65536,0],angularVelocity:[0,0,0],angularMomentum:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],quaternion:[65536,0,0,0],quaternionDerivative:[0,0,0,0],worldInverseInertia:Array(9).fill(0),integrationFlags:1,mass:65536,inverseMass:65536,coefficient7c:65536,frameTimeQ16:0,attachmentCount:0,collisionCache114:-1,collisionCounter168:3,collisionState128:0,collisionFlags:0,terrainWord15c:1,modelCandidateCount15e:0});
 const records=Array.from({length:3},()=>Buffer.alloc(72)),queue=new CollisionEventQueue(2),queryOutput={point:[0,0,0],normal:[0,65536,0],scalar:0,contactTime:42,flags:1};
 // Only the low-level geometric query is supplied; both shapes report the same
 // declared half-frame plane hit. All scheduling/merging/response is real code.
 assert.equal(buildStaticCollisionEvents({bodies:[first]},{records,queue,selectionCounter:0,scratch:{contact:output(),tag:{value:99}},terrainBatch:(bodies,count)=>queryTerrainBodyShapes(bodies,records,{count,output:queryOutput,query:()=>32768}),modelBody:()=>assert.fail('No model candidates declared.')}),1);
 const event=queue.events[queue.heap[1]>>>20];assert.equal(event.classFlags,1);assert.deepEqual(event.normal,[0,65536,0]);
 const handlers={storeContact:(target,contact)=>storeBodyShapeContact(target,contact,records)};
 assert.equal(processCollisionEvents(queue,{respond:(contact,delta)=>dispatchCollisionResponse(contact,delta,{handlers}),refresh:()=>{},finish:()=>finishBodyAdvancement([first],handlers)}),1);
 assert.equal(first.frameTimeQ16,65536);assert.deepEqual(first.linearVelocity,[0,4*65536,0]);assert.deepEqual(first.position,[0,2*65536+512,0]);
 assert.deepEqual([0,4,8].map(axis=>records[2].readInt32LE(0x2c+axis)),[0,65536,0]);assert.equal(records[2].readInt32LE(0x24),-512);
});
