import test from 'node:test';
import assert from 'node:assert/strict';
import {completeRejectedCollisionBody} from '../src/body-advancement.mjs';
const body=()=>({flags:4,integrationFlags:1,frameTimeQ16:32768,collisionState128:7,attachmentCount:0,position:[0,0,0],linearVelocity:[65536,0,0],quaternion:[65536,0,0,0],quaternionDerivative:[0,0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]});
test('non-type4 rejection completes the clock/state while retaining pose and attachment queue',()=>{
 const object=body();object.flags=0x8003;object.attachmentCount=5;object.frameTimeQ16=-123;const before=structuredClone(object),attachmentQueue=['retained'];
 completeRejectedCollisionBody(object,{attachmentQueue});assert.deepEqual(object,{...before,frameTimeQ16:65536,collisionState128:32});assert.deepEqual(attachmentQueue,['retained']);
});
test('type4 advances the signed remaining interval, even when its clock already overshot',()=>{
 const object=body();object.frameTimeQ16=131072;const calls=[];completeRejectedCollisionBody(object,{removeSpatial:()=>calls.push('remove'),insertSpatial:()=>calls.push('insert')});assert.deepEqual(object.position,[-65536,0,0]);assert.equal(object.frameTimeQ16,65536);assert.equal(object.collisionState128,32);assert.deepEqual(calls,['remove','insert']);
});
test('type4 spatial hooks observe completed pose/clock, prior state and the already queued attachment',()=>{
 const object=body();object.position[0]=0xfffff0;object.attachmentCount=1;const attachmentQueue=['retained'],calls=[];
 const observe=name=>value=>{calls.push(name);assert.equal(value,object);assert.equal(value.position[0],0x1007ff0);assert.equal(value.frameTimeQ16,65536);assert.equal(value.collisionState128,7);assert.deepEqual(attachmentQueue,['retained',object]);};
 completeRejectedCollisionBody(object,{attachmentQueue,removeSpatial:observe('remove'),insertSpatial:observe('insert')});assert.deepEqual(calls,['remove','insert']);assert.equal(object.collisionState128,32);
});
test('completed type4 still runs the native advancement callee and queues its attachment',()=>{
 const object=body();object.frameTimeQ16=65536;object.attachmentCount=65535;const attachmentQueue=[];completeRejectedCollisionBody(object,{attachmentQueue});assert.deepEqual(object.position,[0,0,0]);assert.deepEqual(attachmentQueue,[object]);
});
test('type4 with8000 flag still advances and is ineligible for global special time scaling',()=>{
 const object=body();object.flags=0x8004;completeRejectedCollisionBody(object,{}, {timeScaleActive:true,timeScaleExempt:false,timeScaleQ16:0});assert.deepEqual(object.position,[32768,0,0]);assert.equal(object.frameTimeQ16,65536);
});
test('type4 advances quaternion orientation through the shared numeric callee',()=>{
 const object=body();object.integrationFlags=0;object.quaternionDerivative=[0,0,0,65536];completeRejectedCollisionBody(object);assert.notDeepEqual(object.quaternion,[65536,0,0,0]);assert.notDeepEqual(object.rotation,[4096,0,0,0,4096,0,0,0,4096]);
});
