import test from 'node:test';
import assert from 'node:assert/strict';
import {beginPhysicsFrame} from '../src/physics-frame-state.mjs';
test('frame start resets clocks for all bodies but preserves disabled collision headers',()=>{
 const a={flags:3,collisionCount10c:255,collisionFlags:0x90000000,collisionCounter168:99},b={flags:0x8007,collisionCount10c:1,collisionFlags:123,collisionCounter168:9},c={flags:7,collisionCount10c:0,collisionFlags:456,collisionCounter168:8};beginPhysicsFrame([a,b,c],[]);
 assert.equal(a.collisionFlags,-2147483648);assert.equal(a.collisionCounter168,3);assert.equal(b.collisionFlags,123);assert.equal(b.collisionCounter168,9);assert.equal(c.collisionFlags,456);for(const body of [a,b,c]){assert.equal(body.frameTimeQ16,0);assert.equal(body.collisionCache114,-1);assert.equal(body.collisionState128,0);assert.equal(body.collisionBound120,2147483647);}
});
test('vehicle cooldown uses a separate vehicle list and saturates at zero',()=>{
 const a={collisionCooldown66f:31},b={collisionCooldown66f:32},c={collisionCooldown66f:255};beginPhysicsFrame([],[a,b,c]);assert.deepEqual([a.collisionCooldown66f,b.collisionCooldown66f,c.collisionCooldown66f],[0,0,223]);
});
