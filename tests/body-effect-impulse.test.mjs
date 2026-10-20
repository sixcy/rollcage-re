import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBodyEffectImpulse,reduceBodyEffectDirection} from '../src/body-effect-impulse.mjs';
function body(type=17){return {flags:type,position:[4*65536,0,0],force:[0,0,0],torque:[0,0,0],collisionFlags:-1,collisionCooldown66f:0,effectDirection680:[1,2,3],effectFallback674:[9,8,7],effectCounter6b8:0,effectMagnitude6ba:0,pairCollisionContext:{stateByte6bc:null}};}
const effect={originQ16:[0,0,0],strength:4,roundingMode:'nearest-even'};
test('outer radius includes exact boundary and rejects the next reduced-distance step',()=>{
 const inside=body(),outside=body();inside.position[0]=1024*65536;outside.position[0]=1028*65536;
 applyBodyEffectImpulse(inside,effect);applyBodyEffectImpulse(outside,effect);assert.deepEqual(inside.force,[65536,0,0]);assert.deepEqual(outside.force,[0,0,0]);assert.equal(inside.collisionFlags,0x7fffffff);assert.equal(outside.collisionFlags,-1);
});
test('zero reduced direction retains all state, while capped accepted impulses wrap accumulators',()=>{
 const object=body();object.position=[1,2,3];const before=structuredClone(object);applyBodyEffectImpulse(object,effect);assert.deepEqual(object,before);
 object.position=[4*65536,0,0];object.force[0]=2147483647;applyBodyEffectImpulse(object,{...effect,strength:100});assert.equal(object.force[0],-2145910785);assert.equal(object.torque[0],0x1800<<7);
});
test('types7 and12 halve signed impulses with an arithmetic shift',()=>{
 for(const type of [7,12]){const object=body(type);object.position[0]=-68*65536;applyBodyEffectImpulse(object,effect);assert.equal(object.force[0],-1928*256);assert.equal(object.torque[0],-1928*128);}
});
test('vehicle cooldown refresh can select the stored fallback after real direction reduction',()=>{
 const object=body(3),directionScratch={sum91d45c:99,leadingZeros91d460:99};object.position=[-1,-2,-3];
 applyBodyEffectImpulse(object,{...effect,strength:32,directionScratch});assert.equal(object.collisionCooldown66f,255);assert.deepEqual(object.effectDirection680,[9,8,7]);assert.equal(object.effectCounter6b8,16);assert.equal(object.effectMagnitude6ba,6144);assert.deepEqual(directionScratch,{sum91d45c:0,leadingZeros91d460:32});
});
test('cooldown equality preserves cached direction but vehicle counters and numeric impulse still update',()=>{
 const object=body(3),directionScratch={sum91d45c:3,leadingZeros91d460:4};object.collisionCooldown66f=32;
 applyBodyEffectImpulse(object,{...effect,directionScratch});assert.deepEqual(object.effectDirection680,[1,2,3]);assert.deepEqual(directionScratch,{sum91d45c:3,leadingZeros91d460:4});assert.equal(object.effectCounter6b8,16);assert.equal(object.effectMagnitude6ba,256);assert.deepEqual(object.force,[65536,0,0]);
});
test('active vehicle callback receives normalized Q8 direction/code before the numeric vehicle path',()=>{
 const object=body(3);object.pairCollisionContext.stateByte6bc=1;const before=structuredClone(object),calls=[];
 applyBodyEffectImpulse(object,{...effect,handlers:{onActiveVehicleEffect:args=>calls.push(args)}});assert.equal(calls.length,1);assert.equal(calls[0].body,object);assert.deepEqual(calls[0].directionQ8,[256,0,0]);assert.equal(calls[0].effectCode,0x70);assert.deepEqual(object,before);
});
test('zero-strength active normalization preserves the explicit masked-invalid conversion behavior',()=>{
 const object=body(3);object.pairCollisionContext.stateByte6bc=255;let direction;
 applyBodyEffectImpulse(object,{...effect,strength:0,handlers:{onActiveVehicleEffect:args=>direction=args.directionQ8}});assert.deepEqual(direction,[-134217728,-134217728,-134217728]);
});
test('direction reduction exposes shared scratch and its small-vector Z adjustment',()=>{
 const vector=[1,2,3],scratch={};reduceBodyEffectDirection(vector,scratch);assert.deepEqual(vector,[1,2,-131069]);assert.deepEqual(scratch,{sum91d45c:6,leadingZeros91d460:29});
 const large=[0x1000000,0,0];reduceBodyEffectDirection(large,scratch);assert.deepEqual(large,[0x400000,0,0]);assert.deepEqual(scratch,{sum91d45c:0x1000000,leadingZeros91d460:7});
});
