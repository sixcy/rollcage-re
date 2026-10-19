import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceCollisionLinearVelocity,projectCollisionAngularState,applySlidingAngularImpulse,stopCollisionBody} from '../src/collision-sliding.mjs';

test('sliding projection uses angular momentum and velocity independently',()=>{
 const body={angularMomentum:[7,19,23],angularVelocity:[31,43,47],quaternionDerivative:[2,3,5,7]};
 projectCollisionAngularState(body,{normal:[0,65536,0]});
 assert.deepEqual(body.angularMomentum,[0,19,0]);assert.deepEqual(body.angularVelocity,[0,43,0]);assert.deepEqual(body.quaternionDerivative,[2,3,5,7]);
});
test('sliding support impulse uses impulse cross lever and retains derivative',()=>{
 const body={mass:65536,angularMomentum:[0,0,0],angularVelocity:[0,0,0],worldInverseInertia:[65536,0,0,0,65536,0,0,0,65536],quaternionDerivative:[2,3,5,7]};
 const result=applySlidingAngularImpulse(body,{normal:[0,65536,0],point:[65536,0,0]},65536);
 assert.deepEqual(result.impulse,[0,16384,0]);assert.deepEqual(body.angularMomentum,[0,0,-16384]);assert.deepEqual(body.angularVelocity,[0,0,-64]);assert.deepEqual(body.quaternionDerivative,[2,3,5,7]);
 assert.throws(()=>applySlidingAngularImpulse(body,{normal:[0,65536,0],point:[0,0,0]}),/explicit/);
});
test('linear replacement rebuilds momentum and stopping preserves derivative',()=>{
 const body={mass:131072,collisionFlags:0x12345678,quaternionDerivative:[2,3,5,7],position:[11,13,17]};
 replaceCollisionLinearVelocity(body,[65536,-65536,3]);assert.deepEqual(body.momentum,[131072,-131072,6]);
 stopCollisionBody(body);assert.equal(body.collisionFlags,0x92345678|0);for(const field of ['momentum','linearVelocity','angularMomentum','angularVelocity','force','torque'])assert.deepEqual(body[field],[0,0,0]);
 assert.deepEqual(body.position,[11,13,17]);assert.deepEqual(body.quaternionDerivative,[2,3,5,7]);
});
