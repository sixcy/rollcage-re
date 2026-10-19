import test from 'node:test';
import assert from 'node:assert/strict';
import {clampVehicleAtRest,dampAirborneSpin,assistAirborneOrientation,applyVehicleAssists} from '../src/vehicle-assists.mjs';
import {updateVehicleSpecialState} from '../src/vehicle-special.mjs';
const body=()=>({momentum:[0,0,0],angularMomentum:[0,0,0],torque:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]});
const state=flags=>({airSpinCounter:0,wheels:Array.from({length:4},()=>({flags,spin:100,angle:200,normal:[0,-65536,0]}))});
const track=()=>({tangentQ16:[0,0,65536],normalQ16:[0,65536,0]});
test('rest clamp uses whole flag bytes, inclusive momentum limits and spin-adjusted angles',()=>{
 const b=body(),s=state(8);b.momentum=[8000,0,0];b.angularMomentum=[0,-8000,0];assert.equal(clampVehicleAtRest(b,s,{multiplierQ16:0,inputByte:0}),true);assert.deepEqual(b.momentum,[0,0,0]);assert.ok(s.wheels.every(wheel=>wheel.spin===0&&wheel.angle===100));
 b.momentum=[8001,0,0];assert.equal(clampVehicleAtRest(b,s,{multiplierQ16:0,inputByte:0}),false);assert.equal(clampVehicleAtRest(b,s,{multiplierQ16:0,inputByte:128}),true);
 s.wheels[0].flags=0;assert.equal(clampVehicleAtRest(b,s,{multiplierQ16:0,inputByte:128}),false);
});
test('air-spin counter wraps as a byte before its threshold and damping truncates toward zero',()=>{
 const b=body(),s=state(8);b.rotation=[4096,0,0,0,0,-4096,0,4096,0];b.angularMomentum=[0,-8000001,0];s.airSpinCounter=255;
 assert.equal(dampAirborneSpin(b,s),false);assert.equal(s.airSpinCounter,0);assert.equal(b.angularMomentum[1],-8000001);
 s.airSpinCounter=30;assert.equal(dampAirborneSpin(b,s),true);assert.equal(s.airSpinCounter,30);assert.equal(b.angularMomentum[1],-7750001);
 s.wheels[0].flags=1;assert.equal(dampAirborneSpin(b,s),false);assert.equal(s.airSpinCounter,0);
});
test('air orientation uses nearest vertical sign and native post-rest stage order',()=>{
 const b=body(),s=state(8);b.rotation=[0,-4096,0,4096,0,0,0,0,4096];
 const result=applyVehicleAssists(b,s,{multiplierQ16:0,inputByte:0});assert.equal(result.rest,true);assert.equal(result.orientation,true);assert.deepEqual(b.angularMomentum,[0,0,-32768]);
 s.wheels[0].flags=1;assert.equal(assistAirborneOrientation(b,s),false);
});
test('special timer event precedes basis resolution and transitions preserve the final force step',()=>{
 const b=body(),s=state(0),d={capacityOverride:1,specialTimer:21},events=[];
 updateVehicleSpecialState(b,s,d,{onSpecialEvent:({code})=>events.push(code),readTrackBasis:()=>{events.push('basis');return null;}});assert.deepEqual(events,[2,'basis']);assert.equal(d.specialTimer,22);
 d.capacityOverride=2;d.specialTimer=40;b.momentum=[8,-8,0];const result=updateVehicleSpecialState(b,s,d,{readTrackBasis:track});assert.equal(d.capacityOverride,0);assert.equal(d.specialTimer,0);assert.equal(result.applied,true);assert.deepEqual(b.momentum,[7,-7,0]);
 assert.equal(updateVehicleSpecialState(b,s,d).active,false);
});
test('special forces override track normal only with multiple strong contacts',()=>{
 const run=contacts=>{const b=body(),s=state(0);for(let i=0;i<contacts;i++)s.wheels[i].flags=1;return updateVehicleSpecialState(b,s,{capacityOverride:1,specialTimer:0},{readTrackBasis:track});};
 assert.deepEqual(run(1).normalQ16,[0,65536,0]);assert.deepEqual(run(2).normalQ16,[0,-65536,0]);
 assert.throws(()=>updateVehicleSpecialState(body(),state(0),{capacityOverride:1,specialTimer:21},{readTrackBasis:track}),/event handler/);
});
