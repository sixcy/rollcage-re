import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionEventQueue,decodeCollisionEventKey,insertCollisionEvent,filterCollisionEvent,processCollisionEvents} from '../src/collision-events.mjs';
import {advanceBodyForCollision,finishBodyAdvancement} from '../src/body-advancement.mjs';
const contact={point:[0,0,0],normal:[0,65536,0],scalar:0,field38:0};
const insert=(queue,object1,time,extra={})=>insertCollisionEvent(queue,{object1,contact,flags:{value:1},tag:0,deltaQ16:time-object1.frameTimeQ16,...extra});
test('equal-time body pairs precede terrain and pool exhaustion is explicit',()=>{
 const queue=new CollisionEventQueue(3),a={frameTimeQ16:0},b={frameTimeQ16:0};
 insert(queue,a,8192);insert(queue,a,8192,{object2:b});insert(queue,a,4096);
 assert.throws(()=>insert(queue,a,0),/exhausted/);
 assert.deepEqual([queue.pop(),queue.pop(),queue.pop()].map(decodeCollisionEventKey).map(({timeQ16,terrain})=>[timeQ16,terrain]),[[4096,true],[8192,false],[8192,true]]);assert.equal(queue.pop(),null);
});
test('recycled records retain damping and auxiliary vector unless overwritten',()=>{
 const queue=new CollisionEventQueue(1),body={frameTimeQ16:0},flags={value:0x840},point=[1,-2,3],first=insert(queue,body,0,{flags,auxiliaryVector:point});
 assert.equal(flags.value,0x40);assert.deepEqual(point,[256,-512,768]);assert.equal(first.event.damping,0x800);queue.pop();
 const second=insert(queue,body,0);assert.equal(second.event,first.event);assert.equal(second.event.damping,0x800);assert.deepEqual(second.event.auxiliaryVector,point);
});
test('rejected first body promotes the second after its callback and reverses the normal',()=>{
 const calls=[],a={frameTimeQ16:10,collisionFilter:(self,other,event)=>{calls.push(['a',other]);other.frameTimeQ16=40;return 0;}},b={frameTimeQ16:30,collisionFilter:(self,other)=>{calls.push(['b',other]);return -1;}},event={object1:a,object2:b,normal:[-2147483648,127,-128],kind:0};
 assert.equal(filterCollisionEvent(event,90),60);assert.equal(event.object1,b);assert.equal(event.object2,null);assert.equal(event.kind,0);assert.deepEqual(event.normal,[-2147483648,-127,128]);assert.deepEqual(calls,[['a',b],['b',null]]);
});
test('collision times split translation and candidate refresh can reuse the current record',()=>{
 const body={flags:3,integrationFlags:1,position:[0,0,0],linearVelocity:[65536,0,0],frameTimeQ16:0,attachmentCount:0},queue=new CollisionEventQueue(4),first=insert(queue,body,16384),records=[],refreshes=[];
 const processed=processCollisionEvents(queue,{respond:(event,delta)=>{records.push(event);advanceBodyForCollision(event.object1,delta);event.object1.linearVelocity[0]+=65536;},refresh:(a,b,q)=>{refreshes.push(a.frameTimeQ16);if(refreshes.length===1)insert(q,a,32768);},finish:()=>finishBodyAdvancement([body])});
 assert.equal(processed,2);assert.equal(records[0],first.event);assert.equal(records[0],records[1]);assert.deepEqual(refreshes,[16384,32768]);assert.deepEqual(body.position,[147456,0,0]);assert.equal(body.frameTimeQ16,65536);
});
test('a negative delta responds and refreshes once before finishing',()=>{
 const body={frameTimeQ16:300},other={frameTimeQ16:0},queue=new CollisionEventQueue(3),calls=[];insert(queue,body,100);insert(queue,other,200);
 assert.equal(processCollisionEvents(queue,{respond:(event,delta)=>calls.push(['respond',delta]),refresh:()=>calls.push(['refresh']),finish:()=>calls.push(['finish'])}),1);assert.deepEqual(calls,[['respond',-200],['refresh'],['finish']]);assert.equal(queue.count,1);
});
