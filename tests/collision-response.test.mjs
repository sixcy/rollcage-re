import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStaticContact,collisionPointVelocity,resolveStaticContact} from '../src/collision-response.mjs';
import {CollisionEventQueue,insertCollisionEvent,processCollisionEvents} from '../src/collision-events.mjs';
import {advanceBodyForCollision,finishBodyAdvancement} from '../src/body-advancement.mjs';
const body=(extra={})=>({flags:3,integrationFlags:1,frameTimeQ16:0,attachmentCount:0,position:[0,0,0],momentum:[-65536,0,0],angularMomentum:[0,0,0],linearVelocity:[-65536,0,0],angularVelocity:[0,0,0],quaternion:[65536,0,0,0],quaternionDerivative:[0,0,0,0],inverseMass:65536,coefficient7c:32768,collisionCount10c:2,worldInverseInertia:[65536,0,0,0,65536,0,0,0,65536],...extra});
test('central static impact reflects incoming speed using the native body coefficient',()=>{
 const state=body(),contact={point:[0,0,0],normal:[65536,0,0]};assert.deepEqual(collisionPointVelocity(state,contact),[-65536,0,0]);assert.equal(resolveStaticContact(state,contact).magnitude,98304);assert.deepEqual(state.linearVelocity,[32768,0,0]);assert.deepEqual(state.angularMomentum,[0,0,0]);
 const before=structuredClone(state);assert.equal(resolveStaticContact(state,contact).applied,false);assert.deepEqual(state,before);
});
test('signed collision byte inhibits torque but retains inertia in the impulse denominator',()=>{
 const contact={point:[0,65536,0],normal:[65536,0,0]},rotating=body({coefficient7c:0}),frozen=body({coefficient7c:0,collisionCount10c:255});
 const a=resolveStaticContact(rotating,contact),b=resolveStaticContact(frozen,contact);assert.equal(a.magnitude,b.magnitude);assert.ok(a.magnitude<65536);assert.deepEqual(rotating.angularMomentum,[0,0,-a.magnitude]);assert.deepEqual(frozen.angularMomentum,[0,0,0]);assert.deepEqual(rotating.momentum,frozen.momentum);
});
test('static response refresh bypasses the general speed limiter',()=>{
 const state=body({momentum:[256*65536,0,0]}),inertia=state.worldInverseInertia.slice();resolveStaticContact(state,{point:[0,0,0],normal:[65536,0,0]},[-65536,0,0]);assert.ok(state.linearVelocity[0]>128*65536);assert.deepEqual(state.worldInverseInertia,inertia);
});
test('an event at half-frame produces an elastic bounce and the native normal nudge',()=>{
 const state=body({position:[2*65536,0,0],momentum:[-4*65536,0,0],linearVelocity:[-4*65536,0,0],coefficient7c:65536}),queue=new CollisionEventQueue(1);
 insertCollisionEvent(queue,{object1:state,contact:{point:[0,0,0],normal:[65536,0,0],scalar:0,field38:0},flags:{value:1},tag:0,deltaQ16:32768});
 processCollisionEvents(queue,{respond:(event,delta)=>{advanceBodyForCollision(event.object1,delta,event.normal);prepareStaticContact(event.object1,event);resolveStaticContact(event.object1,event);},refresh:()=>{},finish:()=>finishBodyAdvancement([state])});
 assert.deepEqual(state.position,[2*65536+512,0,0]);assert.deepEqual(state.linearVelocity,[4*65536,0,0]);assert.equal(state.frameTimeQ16,65536);
});
