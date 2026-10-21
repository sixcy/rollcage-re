import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPostFrameVehicles} from '../src/post-frame-vehicle-check.mjs';

function fixture({height=0,y=512,speed=0,counter=0,wheels=[0,0,0,0],closestTerrain11c=0}={}){
 const body={position:[0,y<<16,0],speed668:speed,closestTerrain11c,collisionState128:7,collisionFlags:0x81234567|0},record={body00:body,field248:counter},state={wheels:wheels.map(flags=>({flags}))},runtime={records:[record],session:{vehicleCount54d:1}},sectorHeights=Array(256).fill(height),run=()=>checkPostFrameVehicles(runtime,{sectorHeights,vehicleStateFor:()=>state});
 return {body,record,state,runtime,sectorHeights,run};
}

test('height rejection uses signed high Y and a strict sector height plus512 threshold',()=>{
 const exact=fixture({y:512,speed:2});assert.equal(exact.run().markedBodies,0);assert.equal(exact.body.collisionState128,7);
 const above=fixture({y:513,speed:32767,counter:99,wheels:[1,1,1,1]});assert.deepEqual(above.run(),{checkedVehicles:1,markedBodies:1,heightFailures:1,slowFailures:0});assert.equal(above.body.collisionState128,32);assert.equal(above.record.field248,0);assert.equal(above.body.collisionFlags,0x1234567);
});

test('slow counter rejects on the91st unresolved check and wraps at255',()=>{
 const ninety=fixture({counter:89});assert.equal(ninety.run().markedBodies,0);assert.equal(ninety.record.field248,90);assert.equal(ninety.run().slowFailures,1);assert.equal(ninety.record.field248,0);
 const wrap=fixture({counter:255});assert.equal(wrap.run().markedBodies,0);assert.equal(wrap.record.field248,0);assert.equal(wrap.body.collisionState128,7);
});

test('all four wheel low bits reset a slow counter before its rejection check',()=>{
 const grounded=fixture({counter:200,speed:-32768,wheels:[3,5,9,255]});assert.equal(grounded.run().markedBodies,0);assert.equal(grounded.record.field248,0);
 const missing=fixture({counter:200,wheels:[1,1,2,1]});assert.equal(missing.run().slowFailures,1);
});

test('speed2 resets the counter and does not request wheel state',()=>{
 const value=fixture({speed:2,counter:255});assert.equal(checkPostFrameVehicles(value.runtime,{sectorHeights:value.sectorHeights}).markedBodies,0);assert.equal(value.record.field248,0);
});

test('terrain selection uses only low sector byte or a structured sector field',()=>{
 for(const closestTerrain11c of [0x1234ab02,{sector:2,row:9,column:8}]){
  const value=fixture({y:513,speed:2,closestTerrain11c});value.sectorHeights[0]=32767;value.sectorHeights[2]=0;assert.equal(value.run().heightFailures,1);
 }
});

test('declared vehicle count limits the registry without filtering body type',()=>{
 const value=fixture({y:513});value.body.flags=33;value.runtime.records.push({body00:{position:[0,0,0]},field248:0});assert.equal(value.run().markedBodies,1);
 value.runtime.session.vehicleCount54d=0;assert.deepEqual(value.run(),{checkedVehicles:0,markedBodies:0,heightFailures:0,slowFailures:0});
});

test('unprovided sector height and reached wheel state remain explicit errors',()=>{
 const value=fixture();assert.throws(()=>checkPostFrameVehicles(value.runtime),/sector height/);assert.throws(()=>checkPostFrameVehicles(value.runtime,{sectorHeights:value.sectorHeights}),/vehicleStateFor/);
});
