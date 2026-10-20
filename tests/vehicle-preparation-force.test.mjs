import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVehiclePreparationForce} from '../src/vehicle-preparation-force.mjs';
import {vectorLengthQ16} from '../src/fixed-integer.mjs';
function fixture(){return {body:{force:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]},state:{wheels:Array.from({length:4},()=>({flags:0})),reverseByte64f:0,rememberedSide654:0,airCounter655:0,speed664:0}};}
const options={gravityQ16:65536};
test('gravity is applied before the sixth-frame airborne early return, with explicit time scaling',()=>{
 const {body,state}=fixture();state.airCounter655=6;state.speed664=0x300000;body.force=[-2147483648,2147483647,9];
 applyVehiclePreparationForce(body,state,{...options,timeScaleActive:true,timeScaleQ16:32768});
 assert.deepEqual(body.force,[-2147483648,-2147450881,9]);assert.equal(state.airCounter655,6);
});
test('only wheel contact bit0 refreshes the remembered reverse byte and clears the airborne byte',()=>{
 const {body,state}=fixture();state.airCounter655=5;state.rememberedSide654=128;state.reverseByte64f=255;state.wheels[2].flags=0x80;
 applyVehiclePreparationForce(body,state,options);assert.equal(state.airCounter655,6);assert.equal(state.rememberedSide654,128);
 state.wheels[2].flags=0x81;applyVehiclePreparationForce(body,state,options);assert.equal(state.airCounter655,0);assert.equal(state.rememberedSide654,255);
});
test('explicit speed below the threshold leaves gravity while contact state still updates',()=>{
 const {body,state}=fixture();state.speed664=0x1fffff;state.reverseByte64f=7;state.wheels[0].flags=1;
 applyVehiclePreparationForce(body,state,options);assert.deepEqual(body.force,[0,65536,0]);assert.equal(state.rememberedSide654,7);
});
test('remembered reverse side controls the airborne thrust direction and speed above cap is identical',()=>{
 const first=fixture(),second=fixture();first.state.speed664=0x300000;second.state.speed664=2147483647;first.state.rememberedSide654=second.state.rememberedSide654=1;
 applyVehiclePreparationForce(first.body,first.state,options);applyVehiclePreparationForce(second.body,second.state,options);
 assert.deepEqual(first.body.force,[0,-65535,0]);assert.deepEqual(second.body.force,first.body.force);assert.equal(first.state.airCounter655,1);
});
test('limiter uses global gravity even when time scaling reduces the force and exemption is explicit',()=>{
 const reduced=fixture(),exempt=fixture(),ordinary=fixture();
 for(const f of [reduced,exempt,ordinary]){f.body.rotation=[0,4096,0,4096,0,0,0,0,4096];f.state.speed664=0x300000;}
 applyVehiclePreparationForce(reduced.body,reduced.state,{...options,timeScaleActive:true,timeScaleQ16:32768});
 const length=vectorLengthQ16(reduced.body.force);assert(length>60000&&length<=65536);
 applyVehiclePreparationForce(exempt.body,exempt.state,{...options,timeScaleActive:true,timeScaleExempt:true,timeScaleQ16:0});applyVehiclePreparationForce(ordinary.body,ordinary.state,options);
 assert.deepEqual(exempt.body.force,ordinary.body.force);assert.deepEqual(reduced.body.force,ordinary.body.force);
});
test('zero gravity permits contact state updates while clamping nonzero special thrust to zero',()=>{
 const {body,state}=fixture();state.wheels[0].flags=1;state.speed664=0x300000;applyVehiclePreparationForce(body,state,{gravityQ16:0});assert.deepEqual(body.force,[0,0,0]);assert.equal(state.airCounter655,0);
});
