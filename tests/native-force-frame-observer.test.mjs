import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {completeNativeFrameGeometryFixture} from '../tools/lib/native-frame-fixtures.mjs';
import {replayNativeFrame} from '../tools/lib/native-frame-replay.mjs';
import {traceNativeFrameForces} from '../tools/check-native-force-frame-replay.mjs';
test('complete frame force observer exposes frozen nonempty inputs without changing any replay memory',async()=>{
 const program=await loadRetainedNativeProgram(),f=createSimulationVehicleFixture(program,1,{vehicleCount:2,ordinaryCount:1,interacting:true,effects:false}),m=f.memory,base=f.addresses.bodies[0];completeNativeFrameGeometryFixture(f);
 for(const[p,value]of[[0x6e6b40,base],[0x902eec,base],[0x709808,-140000+0x14000/32],[0x70dcf4,0x13000],[f.extraAddresses.session+0x57c,4],[0x91cd90,1],[0x91cd8c,32],[0x91cd80,-4*65536],[0x91cd84,0],[0x91cd88,-8*65536]])m.writeInt32LE(value|0,p);
 const snapshot={moduleBaseAddress:0x400000,registers:{esp:0x9000,ebx:0x11223344,ebp:0x55667788,esi:0x22334455,edi:0x33445566,fpuControlWord:0x7f,mxcsr:0x1f80},ranges:[{address:0,bytes:m}]},options={stackBytesBefore:4096},initial=Buffer.from(m),plain=replayNativeFrame(snapshot,options),seen=[];
 const observed=traceNativeFrameForces(snapshot,{...options,onBodyEffectImpulse:record=>{
  assert.ok(Object.isFrozen(record)&&Object.isFrozen(record.entryRegisters)&&Object.isFrozen(record.originQ16));assert.equal(record.bodyHeaderHex.length,768);assert.equal(record.returnAddress,0x47a913);assert.equal(record.entryEsp,0x9000-96);assert.throws(()=>{record.originQ16[0]=0;},TypeError);seen.push(record);return {strength:0};
 }});
 assert.equal(observed.forceRecords.length,3);assert.equal(seen.length,3);assert.deepEqual(seen.map(row=>row.entryRegisters.esi),[3,2,1]);assert.deepEqual(seen.map(row=>row.entryRegisters.edi),f.bodies.map(row=>row.address));assert.deepEqual(observed.span(0,m.length),plain.span(0,m.length),'Observer leaves every replay byte unchanged, including stack.');assert.deepEqual(m,initial,'Captured input is immutable.');
 assert.throws(()=>traceNativeFrameForces(snapshot,{...options,onBodyEffectImpulse:()=>{throw Error('test-force-observer');}}),error=>error.message==='test-force-observer'&&error.replayStage==='physics-frame'&&error.forceRecords.length===1);
 assert.throws(()=>traceNativeFrameForces(snapshot,{...options,onBodyEffectImpulse:3}),/must be a function/);
});
