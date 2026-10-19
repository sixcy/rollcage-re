import test from 'node:test';
import assert from 'node:assert/strict';
import {runVehicleWheelStages,updateFrameBodyDerivatives,updateVehicleWheelFrame} from '../src/vehicle-frame.mjs';
test('frame stages process the entire field before post-wheel assists and retain each tail pointer',()=>{
 const vehicles=[{id:0},{id:1}],events=[],stages={};for(const key of ['directions','contacts','suspension','drive','rest','airSpin','orientation','special'])stages[key]=vehicle=>events.push(`${key}:${vehicle.id}`);stages.forces=all=>events.push(`forces:${all.length}`);
 stages.rest=(vehicle,index)=>{events.push(`rest:${vehicle.id}`);vehicles[index]={id:99};};runVehicleWheelStages(vehicles,stages);
 assert.deepEqual(events.slice(0,9),['directions:0','directions:1','contacts:0','contacts:1','suspension:0','suspension:1','drive:0','drive:1','forces:2']);
 assert.deepEqual(events.slice(9),['rest:0','airSpin:0','orientation:0','special:0','rest:1','airSpin:1','orientation:1','special:1']);
});
test('derivative refresh includes eligible nonvehicles and respects the native flag guard',()=>{
 const bodies=[{id:'vehicle',flags:3},{id:'other',flags:7},{id:'skipped',flags:0x8000}],updated=[];updateFrameBodyDerivatives(bodies,body=>updated.push(body.id));assert.deepEqual(updated,['vehicle','other']);
 assert.deepEqual(updateVehicleWheelFrame([],{data:null,grid:null,modelContext:null}),[]);
 assert.throws(()=>updateVehicleWheelFrame([{}],{}),/surface-particle handler/);
});
