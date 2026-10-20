import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseScriptedBody,quaternionFromReleaseDirection} from '../src/scripted-release.mjs';
const body=()=>({flags:0xa203,integrationFlags:7,position:[1,2,3],quaternion:[9,8,7,6],rotation:[4096,0,0,0,4096,0,0,0,4096],torque:[1,2,3],collisionFilter:null,collisionFilterNativeAddress148:0});
test('scripted release changes flags/orientation and uses one retained RNG update for all three torque components',()=>{
 const object=body(),rng={seed:1};let calls=0;
 const result=releaseScriptedBody(object,{rng,handlers:{onReleaseEffect:({body:target,code})=>{calls++;assert.equal(target,object);assert.equal(code,16);assert.equal(object.flags,0x9003);assert.equal(object.integrationFlags,6);assert.equal(rng.seed,16807);assert.deepEqual(object.quaternion,[65536,0,0,0]);assert.deepEqual(object.torque,[-8388608,-8388608,-8388608]);}}});
 assert.equal(result,0);assert.equal(calls,1);assert.deepEqual(object.rotation,[4096,0,0,0,4096,0,0,0,4096]);assert.equal(object.collisionFilter,null);
});
test('quaternion builder preserves the sign of X and native cardinal square-root rounding',()=>{
 assert.deepEqual(quaternionFromReleaseDirection([4096,0,0]),[46340,0,46340,0]);assert.deepEqual(quaternionFromReleaseDirection([-4096,0,0]),[46340,0,-46340,0]);assert.deepEqual(quaternionFromReleaseDirection([0,0,-4096]),[0,0,65536,0]);
});
test('large quaternion input is reduced and normalized in place, with final shared root scratch',()=>{
 const direction=[0x300000,0,0],scratch={};const quaternion=quaternionFromReleaseDirection(direction,scratch);assert.deepEqual(direction,[65532,0,0]);assert.deepEqual(quaternion,[46340,0,46340,0]);assert.deepEqual(scratch,{sum91d45c:32768,leadingZeros91d460:16});
});
test('non-scripted path emits both vectors/arguments before installing the supplied unresolved filter',()=>{
 const object=body();object.flags=3;object.position=[9,2147483647,-7];const oldFilter=()=>1,newFilter=()=>0;object.collisionFilter=oldFilter;const rng={seed:123},torque=object.torque.slice(),quaternion=object.quaternion.slice();let calls=0;
 const result=releaseScriptedBody(object,{rng,handlers:{collisionFilter46e470:newFilter,onUnscriptedReleaseEffect:args=>{calls++;assert.equal(args.body,object);assert.equal(object.collisionFilter,oldFilter);assert.equal(object.collisionFilterNativeAddress148,0);assert.deepEqual(args.positionQ16,[9,-2138308609,-7]);assert.deepEqual(args.vectorQ16,[0,-4194304,0]);assert.deepEqual(args.nativeArgs,[1,0x11229,11]);}}});
 assert.equal(result,1);assert.equal(calls,1);assert.equal(rng.seed,123);assert.equal(object.collisionFilter,newFilter);assert.equal(object.collisionFilterNativeAddress148,0x46e470);assert.deepEqual(object.torque,torque);assert.deepEqual(object.quaternion,quaternion);
});
test('a second call after release takes the non-scripted branch without advancing RNG again',()=>{
 const object=body(),rng={seed:1},filter=()=>0,log=[],handlers={onReleaseEffect:()=>log.push('release'),onUnscriptedReleaseEffect:()=>log.push('ordinary'),collisionFilter46e470:filter};
 assert.equal(releaseScriptedBody(object,{rng,handlers}),0);assert.equal(releaseScriptedBody(object,{rng,handlers}),1);assert.equal(rng.seed,16807);assert.deepEqual(log,['release','ordinary']);assert.equal(object.collisionFilter,filter);
});
test('zero seed remains zero under the native multiplication/mask sequence',()=>{
 const object=body(),rng={seed:0};releaseScriptedBody(object,{rng,handlers:{onReleaseEffect:()=>{}}});assert.equal(rng.seed,0);assert.deepEqual(object.torque,[-8388608,-8388608,-8388608]);
});
test('zero fixed-point direction length retains the native division fault boundary',()=>{
 assert.throws(()=>quaternionFromReleaseDirection([0,0,0]),/division by zero/);assert.throws(()=>quaternionFromReleaseDirection([1,-1,1]),/division by zero/);
});

