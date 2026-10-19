import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWheelContactSides} from '../src/wheel-physics.mjs';
import {queryTerrainRay} from '../src/terrain-query.mjs';
function fixture(side=0) {
 const body={flags:3,position:[16*65536,-20*65536,-16*65536],linearVelocity:[0,0,0],angularVelocity:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]};
 const state={side,descriptors:Array.from({length:4},(_,i)=>({positionQ8:[(i&1?2:-2)*256,5*256,(i&2?2:-2)*256],directionQ8:[0,256,0],tag:i})),wheels:Array.from({length:4},()=>({flags:8})),contacts:Array.from({length:4},()=>({normal:[10,20,30]}))};
 const grid={sectors:[{index:0,columns:1,rows:1,vertices:[[0,0,0],[32,0,0],[0,0,-32],[32,0,-32]]}]};
 const candidates=[{id:0,sector:0,type:0,columns:1,vertexBase:0,pointOffset:0,normalQ8:[0,-256,0],packedNormal:768<<10}];
 return {body,state,select:probes=>probes.map(probe=>queryTerrainRay(grid,candidates,probe.query))};
}
test('successful remembered side preserves other wheel flags and resolves surfaces',()=>{
 const {body,state,select}=fixture();let calls=0;
 const result=prepareWheelContactSides(body,state,probes=>{calls++;return select(probes);},{resolveSurface:cellRef=>({cellRef})});
 assert.equal(result.attempts,1);assert.equal(calls,1);assert.equal(state.side,0);
 assert.deepEqual(state.wheels.map(wheel=>wheel.flags),[9,9,9,9]);
 assert.ok(state.contacts.every(contact=>contact.distance>0));assert.deepEqual(state.descriptors[0].surface,{cellRef:0});
});
test('all misses flip the four probes and remember a successful retry',()=>{
 const {body,state,select}=fixture(1),attempts=[];
 const result=prepareWheelContactSides(body,state,(probes,context)=>{attempts.push({side:context.side,delta:probes[0].query.deltaQ8[1]});return select(probes);});
 assert.equal(result.contact,true);assert.equal(result.attempts,2);assert.equal(state.side,0);
 assert.deepEqual(attempts,[{side:1,delta:-44*256},{side:0,delta:44*256}]);
 assert.deepEqual(state.wheels.map(wheel=>wheel.flags),[1,1,1,1]);
});
test('any valid wheel stops side attempts while misses clear the entire flag byte',()=>{
 const {body,state,select}=fixture(7);let calls=0;
 const result=prepareWheelContactSides(body,state,probes=>{calls++;const hits=select(probes);hits[2]={flags:2,fractionQ16:0,pointQ8:[0,0,0],normalQ16:[0,65536,0],cellRef:-4};return hits;});
 assert.equal(result.attempts,1);assert.equal(calls,1);assert.equal(state.side,7);
 assert.deepEqual(state.wheels.map(wheel=>wheel.flags),[0,0,9,0]);assert.equal(state.descriptors[2].surface,null);
});
test('two failed sides retain remembered side, stale normals and final probe fields',()=>{
 const {body,state}=fixture(1);let calls=0;
 const result=prepareWheelContactSides(body,state,()=>{calls++;return Array.from({length:4},()=>({flags:0,fractionQ16:65536}));});
 assert.equal(result.contact,false);assert.equal(calls,2);assert.equal(state.side,1);
 assert.ok(state.descriptors.every(descriptor=>descriptor.positionQ8[1]===5*256&&descriptor.cellRef===-1));
 assert.ok(state.contacts.every(contact=>contact.distance===-1));assert.deepEqual(state.contacts[0].normal,[10,20,30]);
 assert.deepEqual(state.wheels.map(wheel=>wheel.flags),[0,0,0,0]);
});
