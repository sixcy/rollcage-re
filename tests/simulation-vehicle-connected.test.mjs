import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
import {writeRawWheelAngularProbe} from '../src/raw-vehicle-contacts.mjs';
import {verifySimulationVehicleConnected} from '../tools/verify-simulation-vehicle-connected-instructions.mjs';
const program=await loadRetainedNativeProgram();
test('raw wheel angular probe preserves sequential alias reads',()=>{
 const memory=Buffer.alloc(128);[65536,131072,196608].forEach((v,i)=>memory.writeInt32LE(v,i*4));[262144,327680,393216].forEach((v,i)=>memory.writeInt32LE(v,32+i*4));writeRawWheelAngularProbe(0,32,0,{memory});assert.deepEqual([0,4,8].map(p=>memory.readInt32LE(p)),[-3,30,-135].map(v=>v*65536));
});
test('actual frame candidates feed wheel rays and suspension without replacement hit answers',()=>{
 const f=createSimulationVehicleFixture(program,1),vehicle=f.vehicles[0],body=vehicle.body;
 const report=stepSimulationFrame(f.views.physicalGroup,f.vehicles,f.context);
 assert.equal(report.vehicles[0].contacts.contact,true);assert.equal(report.vehicles[0].contacts.hits,4);assert.equal(body.collisionCount10c,5);assert.ok(body.terrainWord15c>0);assert.equal(body.terrainCandidateOffset154,0);assert.ok(vehicle.state.wheels.every(w=>w.flags&1));assert.ok(vehicle.state.wheels.some(w=>w.spin!==0));assert.ok(vehicle.state.contacts.every(c=>c.distance>=0));
});
test('missed wheel attempts preserve the original orientation byte and stale contact normals',()=>{
 const f=createSimulationVehicleFixture(program,1),m=f.memory,p=f.bodies[0].address,state=f.vehicles[0].state;m.writeInt32LE(-200*65536,p+0x38);m[p+0x64f]=1;state.contacts[0].normal=[123,456,789];
 const report=stepSimulationFrame(f.views.physicalGroup,f.vehicles,f.context);assert.equal(report.vehicles[0].contacts.contact,false);assert.equal(m[p+0x64f],1);assert.deepEqual(state.contacts[0].normal.slice(),[123,456,789]);assert.ok(state.wheels.every(w=>w.flags===0));assert.ok(state.contacts.every(c=>c.distance===-1));
});
test('preparation side/counter/speed fields share the live vehicle bytes',()=>{
 const f=createSimulationVehicleFixture(program,2),v=f.vehicles[0],m=f.memory,p=v.body.address;v.state.airCounter655=255;v.state.rememberedSide654=129;v.state.reverseByte64f=1;v.state.speed664=-12345;assert.equal(m[p+0x655],255);assert.equal(m[p+0x654],129);assert.equal(v.state.side,1);assert.equal(v.body.speed664,-12345);
});
test('complete vehicle parent matches retained instructions over persistent populated frames',async()=>{
 const report=await verifySimulationVehicleConnected({fixtures:8,frames:4,output:null});assert.equal(report.matched,true);assert.equal(report.allMemory,true);assert.equal(report.calls,32);assert.ok(report.wheelContacts>0);assert.ok(report.visits['41e080']>0);assert.ok(report.visits['436698']>0);assert.ok(report.visits['475d96']>0);
});
