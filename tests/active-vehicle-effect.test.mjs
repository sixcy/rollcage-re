import test from 'node:test';
import assert from 'node:assert/strict';
import {applyActiveVehicleEffect} from '../src/active-vehicle-effect.mjs';
const body=()=>({position:[1,2,3],rotation:[4096,0,0,0,4096,0,0,0,4096],effectByte6b4:1});
test('emission observes the signed-byte status before the computed decrement and timer writes',()=>{
 const object=body(),state=Buffer.alloc(265),lookup=Buffer.alloc(64);state[1]=255;let calls=0;
 applyActiveVehicleEffect(object,[0,0,0],112,{state,lookup,handlers:{onEmitActiveEffect:args=>{calls++;assert.equal(args.body,object);assert.equal(args.positionQ16,object.position);assert.equal(args.effectId,24);assert.deepEqual(args.nativeArgs,[0,1536,16383,6,object,0,1]);assert.equal(state[1],255);assert.equal(state[8],0);state[1]=77;state[8]=99;}}});
 assert.equal(calls,1);assert.equal(state[1],0);assert.equal(state[8],10);assert.equal(state[9],112);
});
test('signed status subtraction has no upper clamp before its byte store',()=>{
 const object=body(),state=Buffer.alloc(265),lookup=Buffer.alloc(64);state[1]=127;
 applyActiveVehicleEffect(object,[0,0,0],-1,{state,lookup,handlers:{onEmitActiveEffect:()=>{}}});assert.equal(state[1],128);assert.equal(state[9],255);
});
test('nonzero timer skips emission/status changes while still updating the selected slot',()=>{
 const state=Buffer.alloc(265),lookup=Buffer.alloc(64);state[1]=5;state[8]=255;lookup[42]=7;
 const result=applyActiveVehicleEffect(body(),[0,0,0],256,{state,lookup});assert.equal(result.index,42);assert.equal(state[1],5);assert.equal(state[8],255);assert.equal(state[16],0);
});
test('signed matrix projection clamps coordinates before all six index bits and accepts lookup offset255',()=>{
 const state=Buffer.alloc(265),lookup=Buffer.alloc(64);state[8]=1;lookup[40]=255;const result=applyActiveVehicleEffect(body(),[256,0,0],112,{state,lookup});
 assert.deepEqual(result,{coordinates:[0,4096,4096],index:40,offset:255});assert.equal(state[264],112);
 const other=applyActiveVehicleEffect(body(),[-256,0,0],3,{state,lookup});assert.deepEqual(other.coordinates,[8191,4096,4096]);assert.equal(other.index,43);
});
test('callback changes to matrix/direction/lookup take effect while writes retain captured state identity',()=>{
 const object=body(),first=Buffer.alloc(265),second=Buffer.alloc(265),lookup=Buffer.alloc(64),direction=[256,0,0];object.currentEffectState=first;first[1]=10;
 const result=applyActiveVehicleEffect(object,direction,112,{state:first,lookup,handlers:{onEmitActiveEffect:()=>{object.currentEffectState=second;object.rotation.fill(0);direction[0]=-256;lookup.fill(255);}}});
 assert.equal(result.index,42);assert.equal(first[264],112);assert.equal(first[1],7);assert.equal(first[8],10);assert.equal(second.some(value=>value!==0),false);assert.equal(object.currentEffectState,second);assert.deepEqual(direction,[-256,0,0]);
});
test('effectByte6b4 emits the final flag only for exact byte value1',()=>{
 for(const value of [0,1,2,128,255]){const object=body(),state=Buffer.alloc(265),lookup=Buffer.alloc(64);object.effectByte6b4=value;let flag;
  applyActiveVehicleEffect(object,[0,0,0],32,{state,lookup,handlers:{onEmitActiveEffect:args=>flag=args.nativeArgs[6]}});assert.equal(flag,value===1?1:0);
 }
});
