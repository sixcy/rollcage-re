import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBodyEffectDamping} from '../src/body-effect-damping.mjs';
const globals=()=>({field91cd60:10,field91cd64:20,field91cd68:30,field91cd6c:40,field91cd70:50,field91cd74:60});
const body=(extra={})=>({flags:7,position:[0,0,0],linearVelocity:[65536,-65537,1],momentum:[131072,-196609,-1],pairCollisionContext:{stateByte6bc:null},...extra});
const environment=(extra={})=>({originQ16:[0,0,0],timeScaleActive:0,globals:globals(),...extra});

test('coincident damping independently halves current velocity and momentum and writes all output globals',()=>{
 const origin=[12345,-23456,34567],target=body({position:origin.slice()}),state=environment({originQ16:origin});
 assert.deepEqual(applyBodyEffectDamping(target,state),{applied:true,distanceSquared:0,scaleQ16:32768});
 assert.deepEqual(target.linearVelocity,[32768,-32769,0]);assert.deepEqual(target.momentum,[65536,-98305,-1]);
 assert.deepEqual(state.globals,{field91cd60:1,field91cd64:31,field91cd68:2,field91cd6c:12345,field91cd70:-23456,field91cd74:34567});
});

test('the distance gate uses summed squared quarter-unit differences and excludes the exact radius',()=>{
 const accepted=body({position:[63*4*65536,0,0]});assert.equal(applyBodyEffectDamping(accepted,environment()).scaleQ16,64520);
 for(const position of [[64*4*65536,0,0],[48*4*65536,48*4*65536,0]]){
  const target=body({position}),before=structuredClone(target),state=environment(),priorGlobals=structuredClone(state.globals);
  assert.equal(applyBodyEffectDamping(target,state).applied,false);assert.deepEqual(target,before);assert.deepEqual(state.globals,priorGlobals);
 }
});

test('position subtraction wraps before its signed arithmetic shift',()=>{
 const target=body({position:[2147483647,0,0]}),result=applyBodyEffectDamping(target,environment({originQ16:[-2147483648,0,0]}));
 assert.equal(result.distanceSquared,1);assert.equal(result.scaleQ16,32776);
 const positive=applyBodyEffectDamping(body({position:[1,0,0]}),environment());assert.equal(positive.distanceSquared,0);
});

test('only type3 checks the explicit sentinel or pointed state byte',()=>{
 for(const stateByte6bc of [null,0])assert.equal(applyBodyEffectDamping(body({flags:0x1003,pairCollisionContext:{stateByte6bc}}),environment()).applied,true);
 for(const stateByte6bc of [1,255]){const target=body({flags:3,pairCollisionContext:{stateByte6bc}}),before=structuredClone(target);assert.equal(applyBodyEffectDamping(target,environment()).applied,false);assert.deepEqual(target,before);}
 assert.equal(applyBodyEffectDamping(body({flags:7,pairCollisionContext:undefined}),environment()).applied,true);
 assert.throws(()=>applyBodyEffectDamping(body({flags:3,pairCollisionContext:undefined}),environment()),/explicit stateByte6bc/);
});

test('any nonzero time-scale global preserves stale output globals while still damping the body',()=>{
 for(const timeScaleActive of [1,2,-1,-2147483648,true]){
  const target=body(),state=environment({timeScaleActive}),before=structuredClone(state.globals);
  assert.equal(applyBodyEffectDamping(target,state).applied,true);assert.equal(target.linearVelocity[0],32768);assert.deepEqual(state.globals,before);
 }
});

test('out-of-radius vehicles return before reading their pointer-derived state',()=>{
 const target=body({flags:3,position:[0x1000000,0,0],pairCollisionContext:undefined});assert.equal(applyBodyEffectDamping(target,environment()).applied,false);
});
