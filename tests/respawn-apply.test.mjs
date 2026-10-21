import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRespawn} from '../src/respawn-apply.mjs';
import {BodySpatialRegistry} from '../src/body-spatial.mjs';
function fixture(flags=3){
 const bucket={headId:1},body={flags,position:[1,2,3],quaternion:[4,5,6,7],rotation:Array(9).fill(8),quaternionDerivative:[9,10,11,12],vehicleIndex65e:0,mode718:0,checkpoint6c0:123,checkpoint6c2:456,spatialBucket:bucket,spatialOutside:false,spatialNextId:0,spatialPreviousId:0};
 for(const name of ['linearVelocity','momentum','angularVelocity','force','torque','angularMomentum'])body[name]=[11,12,13];
 const controller={flags39:1},record={body00:body,controller18:controller,lap1c:3,progress24:0,respawn54:null,respawn58:0},runtime={records:[record],session:{mode551:0,lapLimit586:3,counters08:[7]}};
 const state={wheels:Array.from({length:4},()=>({spin:100,angle:200})),field650:99},log=[];
 const args={position:[100,200,300],quaternion:[65536,0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],progressionPointer:{byte05:254},progressionValue:0x12345678,closestTerrain11c:-4,vehicleState:state,runtime,spatialRegistry:new BodySpatialRegistry([{body,poolOffset:0}],object=>{log.push(['insert',object.position.slice()]);return{bucket,outside:true};}),handlers:{updateProgress44a2e0:()=>log.push('progress'),advanceLap44a560:()=>log.push('lap'),finishProgress449760:()=>log.push('finish')}};
 return {body,bucket,controller,record,runtime,state,log,args};
}
test('respawn resets pose, six motion accumulators and wheel spin while preserving derivative and angles',()=>{
 const f=fixture();applyRespawn(f.body,f.args);
 assert.deepEqual(f.body.position,[100,200,300]);assert.deepEqual(f.body.quaternion,[65536,0,0,0]);assert.deepEqual(f.body.rotation,f.args.rotation);
 for(const name of ['linearVelocity','momentum','angularVelocity','force','torque','angularMomentum'])assert.deepEqual(f.body[name],[0,0,0]);
 assert.deepEqual(f.body.quaternionDerivative,[9,10,11,12]);assert.equal(f.body.closestTerrain11c,-4);assert.ok(f.state.wheels.every(wheel=>wheel.spin===0&&wheel.angle===200));assert.equal(f.state.field650,0);assert.equal(f.record.respawn54,f.args.progressionPointer);assert.equal(f.record.respawn58,0x12345678);assert.equal(f.controller.flags39,5);assert.equal(f.bucket.headId,1);assert.equal(f.body.spatialOutside,true);
});
test('nonvehicles require no vehicle registry and still remove before reading the supplied pose',()=>{
 const f=fixture(4);delete f.args.runtime;delete f.args.vehicleState;delete f.args.spatialRegistry;
 f.args.handlers={removeSpatial:body=>{assert.deepEqual(body.position,[1,2,3]);f.args.position[1]=-77;f.log.push('remove');},insertSpatial:body=>{assert.deepEqual(body.position,[100,-77,300]);f.log.push('insert');}};
 applyRespawn(f.body,f.args);assert.deepEqual(f.log,['remove','insert']);assert.equal(f.state.field650,99);assert.equal(f.controller.flags39,1);
});
test('mode8 checkpoints use the registered vehicle and special counters use its own index',()=>{
 const f=fixture(),registered={mode718:8,vehicleIndex65e:1};f.record.body00=registered;f.runtime.session.mode551=8;f.runtime.session.counters08=[9,1];
 applyRespawn(f.body,f.args);assert.equal(registered.checkpoint6c0,254);assert.equal(registered.checkpoint6c2,0x5678);assert.deepEqual(f.runtime.session.counters08,[9,0]);assert.ok(!f.log.includes('progress'));
 applyRespawn(f.body,f.args);assert.equal(f.runtime.session.counters08[1],0);
});
test('backward wrap decrements only a nonzero lap within the current limit',()=>{
 for(const [lap,limit,expected]of [[0,4,0],[1,4,0],[4,4,3],[5,4,5]]){const f=fixture();f.record.progress24=10;f.record.lap1c=lap;f.runtime.session.lapLimit586=limit;f.args.handlers.updateProgress44a2e0=record=>{record.progress24=65530;};applyRespawn(f.body,f.args);assert.equal(f.record.lap1c,expected);}
});
test('forward completion is strictly past65536 and callbacks observe each preceding mutation',()=>{
 for(const [next,forward]of [[0,false],[1,true]]){const f=fixture();f.record.progress24=65530;f.args.handlers.updateProgress44a2e0=record=>{record.progress24=next;};f.args.handlers.advanceLap44a560=record=>{f.log.push('lap');record.lap1c=17;};f.args.handlers.finishProgress449760=record=>{assert.equal(record.lap1c,17);f.log.push('finish');};applyRespawn(f.body,f.args);assert.equal(f.log.includes('lap'),forward);assert.equal(f.log.includes('finish'),forward);}
});
test('controller marking re-reads the body index and record after progression callbacks',()=>{
 const f=fixture(),newController={flags39:128};f.args.handlers.updateProgress44a2e0=()=>{f.body.vehicleIndex65e=1;f.runtime.records[1]={controller18:newController};};
 applyRespawn(f.body,f.args);assert.equal(f.controller.flags39,1);assert.equal(newController.flags39,132);
});
test('native controller sentinel suppresses marking without requiring a controller object',()=>{
 const f=fixture();f.record.controller18=0x12345678;applyRespawn(f.body,f.args);assert.equal(f.record.controller18,0x12345678);
});
