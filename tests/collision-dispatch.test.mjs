import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchCollisionResponse} from '../src/collision-dispatch.mjs';
import {resolveBodyPairContact,exchangePairNormalVelocity} from '../src/collision-response.mjs';
import {CollisionEventQueue,insertCollisionEvent,processCollisionEvents} from '../src/collision-events.mjs';
import {finishBodyAdvancement} from '../src/body-advancement.mjs';
const body=(extra={})=>({flags:3,integrationFlags:1,frameTimeQ16:0,attachmentCount:0,position:[0,0,0],momentum:[0,0,0],angularMomentum:[0,0,0],linearVelocity:[0,0,0],angularVelocity:[0,0,0],quaternion:[65536,0,0,0],quaternionDerivative:[1,2,3,4],mass:65536,inverseMass:65536,coefficient7c:65536,collisionCount10c:2,collisionCounter168:2,collisionFlags:0x10000000,collisionCache114:0,collisionState128:17,force:[1,2,3],torque:[4,5,6],worldInverseInertia:[65536,0,0,0,65536,0,0,0,65536],pairCollisionContext:{field3d00:0,stateByte6bc:null},...extra});
const event=(state,extra={})=>({object1:state,object2:null,kind:1,classFlags:1,point:[0,0,0],normal:[65536,0,0],scalar:0,tag:0,...extra});
test('queue dispatch and frame completion exchange equal-mass elastic velocities at half-frame',()=>{
 const a=body({position:[-65536,0,0],momentum:[131072,0,0],linearVelocity:[131072,0,0]}),b=body({position:[65536,0,0],momentum:[-131072,0,0],linearVelocity:[-131072,0,0]}),queue=new CollisionEventQueue(1),relativeQ8=[1024,0,0];
 insertCollisionEvent(queue,{object1:a,object2:b,contact:{point:[0,0,0],normal:[-65536,0,0],scalar:0,field38:0},flags:{value:1},tag:0,auxiliaryVector:relativeQ8,deltaQ16:32768});
 assert.equal(processCollisionEvents(queue,{respond:dispatchCollisionResponse,refresh:()=>{},finish:()=>finishBodyAdvancement([a,b])}),1);
 assert.deepEqual(a.linearVelocity,[-131072,0,0]);assert.deepEqual(b.linearVelocity,[131072,0,0]);assert.deepEqual(a.position,[-66048,0,0]);assert.deepEqual(b.position,[66048,0,0]);assert.equal(a.frameTimeQ16,65536);assert.equal(b.frameTimeQ16,65536);assert.equal(a.collisionCounter168,0);assert.equal(b.collisionCounter168,2);
});
test('static overlap correction keeps the original clock and prepares its lever arm before moving',()=>{
 const state=body(),contact=event(state,{classFlags:2,scalar:-1}),stored=[];dispatchCollisionResponse(contact,32768,{handlers:{storeContact:(...args)=>stored.push(args)}});
 assert.deepEqual(state.position,[768,0,0]);assert.equal(state.frameTimeQ16,0);assert.deepEqual(contact.point,[0,0,0]);assert.equal(contact.scalar,256);assert.equal(stored[0][0],state);
});
test('signed tag selects angular support versus projection and stopping for vehicle class8',()=>{
 const low=body(),lowContact=event(low,{classFlags:8,normal:[0,65536,0],point:[256,0,0],tag:65535});dispatchCollisionResponse(lowContact,0,{gravityQ16:65536,handlers:{storeContact:()=>{}}});assert.deepEqual(low.angularMomentum,[0,0,-16384]);assert.deepEqual(low.quaternionDerivative,[1,2,3,4]);assert.deepEqual(low.force,[1,2,3]);
 const high=body({angularMomentum:[65536,0,65536]}),highContact=event(high,{classFlags:8,normal:[0,65536,0],point:[256,0,0],tag:2});dispatchCollisionResponse(highContact,0,{gravityQ16:65536,handlers:{storeContact:()=>{}}});assert.deepEqual(high.angularMomentum,[0,0,0]);assert.deepEqual(high.force,[0,0,0]);assert.equal(high.collisionFlags,-2147483648);assert.deepEqual(high.quaternionDerivative,[1,2,3,4]);
});
test('damping preserves separate signed shifts and does not store a contact',()=>{
 const state=body({momentum:[-1,7,-7],linearVelocity:[-1,7,-7]});dispatchCollisionResponse(event(state,{classFlags:64,damping:0x100}),0);assert.deepEqual(state.momentum,[-3,4,-7]);assert.deepEqual(state.linearVelocity,[-3,4,-7]);
});
test('slow static impact stopping is restricted to object type7',()=>{
 const vehicle=body(),other=body({flags:7});for(const state of [vehicle,other])dispatchCollisionResponse(event(state),0,{gravityQ16:65536,handlers:{storeContact:()=>{}}});assert.deepEqual(vehicle.force,[1,2,3]);assert.deepEqual(other.force,[0,0,0]);
});
test('pair normal sharing uses speed rather than mass weighting',()=>{
 const a=body({linearVelocity:[4*65536,3,0]}),b=body({mass:2*65536,linearVelocity:[0,7,0]});exchangePairNormalVelocity(a,b,[65536,0,0]);assert.deepEqual(a.linearVelocity,[2*65536,3,0]);assert.deepEqual(b.linearVelocity,[2*65536,7,0]);assert.equal(a.momentum[0],2*65536);assert.equal(b.momentum[0],4*65536);
});
test('pair impulse admits separating motion and ignores the second restitution coefficient',()=>{
 const a=body({flags:7}),b=body({flags:7,coefficient7c:0}),c1={point:[0,0,0],normal:[65536,0,0]},c2={point:[0,0,0],normal:[-65536,0,0]},result=resolveBodyPairContact(a,b,c1,c2,[65536,0,0]);assert.equal(result.magnitude,-65536);assert.deepEqual(a.momentum,[-65536,0,0]);assert.deepEqual(b.momentum,[65536,0,0]);
});
test('null and removal responses preserve explicit lifecycle boundaries',()=>{
 assert.equal(dispatchCollisionResponse({object1:null},0),undefined);const state=body();assert.throws(()=>dispatchCollisionResponse(event(state,{classFlags:16}),0),/handler removeBody/);
 const calls=[],other=body();dispatchCollisionResponse(event(other,{classFlags:16}),0,{handlers:{removeBody:value=>calls.push(value)}});assert.deepEqual(calls,[other]);assert.equal(other.frameTimeQ16,0);
});
