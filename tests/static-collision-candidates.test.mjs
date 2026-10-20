import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStaticCollisionEvents} from '../src/static-collision-candidates.mjs';
import {CollisionEventQueue,decodeCollisionEventKey} from '../src/collision-events.mjs';
const scratch=()=>({contact:{point:[1,2,3],normal:[0,65536,0],field38:-3,scalar:-16},tag:{value:73}});
const body=(flags,extra={})=>({flags,collisionFlags:0,collisionCache114:0,frameTimeQ16:0,collisionState128:0,collisionDelta124:0,modelCandidateCount15e:0,collisionIds:[0,1],...extra});
const options=extra=>({queue:new CollisionEventQueue(8),selectionCounter:0,scratch:scratch(),prepare:()=>{},terrainBatch:()=>{},modelBody:()=>{},prepareContact:()=>false,...extra});

test('alternation is local and only eligible types 7/21 advance it',()=>{
 const values=[body(7),body(0x807),body(0x815),body(0x807),body(0x803)],observed=[];
 const run=()=>buildStaticCollisionEvents({bodies:values},options({selectionCounter:1,terrainBatch:bodies=>observed.push(bodies.map(value=>!!(value.flags&0x10000)))}));
 assert.equal(run(),0);for(const value of values)value.collisionFlags=0;assert.equal(run(),0);
 assert.deepEqual(observed,[[false,false,true,false,true],[false,false,true,false,true]]);
 assert.equal(values[2].collisionFlags,0x10000000);assert.equal(values[4].collisionFlags,0x10000000);
});

test('type 17 radii are temporary during detection and restored even for unselected bodies',()=>{
 const records=Buffer.alloc(4*72),selected=body(0x811),ineligible=body(17,{collisionIds:[2,3]}),seen=[];
 for(let id=0;id<4;id++)records.writeInt32LE(1234,id*72+64);
 buildStaticCollisionEvents({bodies:[selected,ineligible]},options({records,terrainBatch:()=>seen.push(Array.from({length:4},(_,id)=>records.readInt32LE(id*72+64)))}));
 assert.deepEqual(seen,[[0x1900,0x5000,1234,1234]]);
 assert.deepEqual(Array.from({length:4},(_,id)=>records.readInt32LE(id*72+64)),[32000,32000,32000,32000]);
});

test('a removal event uses the current clock, zero tag and reusable contact scratch',()=>{
 const first=body(0x801,{frameTimeQ16:100,collisionCache114:100,collisionState128:8,collisionDelta124:200}),second=body(0x801,{frameTimeQ16:200,collisionCache114:200,collisionState128:1}),queue=new CollisionEventQueue(2),seen=[];
 assert.equal(buildStaticCollisionEvents({bodies:[first,second]},options({queue,prepareContact:(value,contact,tag,isEight)=>{seen.push(isEight);if(value===first){value.collisionState128=0xa41;contact.point=[4,5,6];tag.value=19;return false;}contact.scalar=-77;return true;}})),2);
 assert.deepEqual(seen,[true,false]);assert.equal(first.collisionState128,0x41);assert.equal(second.collisionState128,16);
 const firstKey=queue.pop(),removed=queue.events[firstKey>>>20],nextKey=queue.pop(),normal=queue.events[nextKey>>>20];
 assert.equal(decodeCollisionEventKey(firstKey).timeQ16,200);assert.equal(removed.object1,second);assert.equal(removed.classFlags,16);assert.equal(removed.tag,0);
 assert.deepEqual(removed.point,[4,5,6]);assert.equal(removed.scalar,-77);
 assert.equal(decodeCollisionEventKey(nextKey).timeQ16,300);assert.equal(normal.object1,first);assert.equal(normal.tag,19);assert.equal(normal.damping,0xa00);
 assert.equal(first.flags&0x10000,0);assert.equal(second.collisionFlags,0x10000000);
});

test('terrain callbacks can change later pass counts while model iteration keeps its captured count',()=>{
 const first=body(0x803,{modelCandidateCount15e:65535}),group={bodies:[first]},calls=[];
 const result=buildStaticCollisionEvents(group,options({terrainBatch:(bodies,count)=>{calls.push(['terrain',count]);group.count=0;},modelBody:()=>calls.push(['model']),prepareContact:()=>{throw Error('Contact pass should be empty.');}}));
 assert.equal(result,0);assert.deepEqual(calls,[['terrain',1],['model']]);assert.equal(first.flags&0x10000,0x10000);
});

test('pre-existing active marks still run detection and emit despite first-pass ineligibility',()=>{
 const first=body(0x10003,{frameTimeQ16:65536,collisionState128:0,modelCandidateCount15e:1}),calls=[];
 assert.equal(buildStaticCollisionEvents({bodies:[first]},options({terrainBatch:()=>calls.push('terrain'),modelBody:()=>{calls.push('model');first.collisionState128=1;},prepareContact:()=>{calls.push('contact');return true;}})),1);
 assert.deepEqual(calls,['terrain','model','contact']);assert.equal(first.collisionFlags,0x10000000);assert.equal(first.flags,3);
});
