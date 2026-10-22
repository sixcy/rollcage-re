import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';

const program=await loadRetainedNativeProgram();

test('outside rejection copies the earlier derivative stack into the retained event',()=>{
 const f=createSimulationRuntimeFixture(program,4),result=stepSimulationFrame(f.views.physicalGroup,[],f.context);
 assert.equal(result.processedEvents,1);assert.equal(result.rejectedContacts,1);assert.equal(result.terrainHits,0);
 const event=f.views.eventAt(f.extraAddresses.events+99*104);
 assert.deepEqual(event.normal.slice(),[65536,65536,0]);
 assert.equal(f.bodies[0].collisionState128,32);assert.equal(f.bodies[0].frameTimeQ16,65536);
 //The event normal is uninitialized static scratch, not a newly calculated
 //surface normal. Removing its legitimate producer loses observable bytes.
 const separate=createSimulationRuntimeFixture(program,4);delete separate.context.nativePhysicsStack;
 stepSimulationFrame(separate.views.physicalGroup,[],separate.context);
 assert.deepEqual(separate.views.eventAt(separate.extraAddresses.events+99*104).normal.slice(),[0,0,0]);
});

test('shared terrain queries generate and resolve contacts for two live native bodies',()=>{
 const f=createSimulationRuntimeFixture(program,2,{count:2}),first=f.bodies[0],second=f.bodies[1];
 const result=stepSimulationFrame(f.views.physicalGroup,[],f.context);
 assert.equal(result.preparedBodies,2);assert.ok(result.terrainHits>=1);assert.ok(result.processedEvents>=1);assert.ok(result.storedContacts>=1);
 assert.equal(f.views.bodyAt(first.address),first);assert.equal(f.views.bodyAt(second.address),second);
 assert.equal(first.frameTimeQ16,65536);assert.equal(second.frameTimeQ16,65536);
 assert.ok(first.position[1]<=-2*65536);assert.equal(first.linearVelocity[1],-4*65536);
 assert.equal(f.memory.readInt32LE(first.address+0x38),first.position[1]);assert.equal(f.views.queue.count,0);
});
