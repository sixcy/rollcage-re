import test from 'node:test';
import assert from 'node:assert/strict';
import {vectorLengthQ16,transformShortQ12} from '../src/fixed-integer.mjs';
import {decodeWheelContact,decodeWheelDescriptor,buildWheelProbe,resolveWheelContact,solveWheelSuspension,
 applyWheelSuspension,advanceWheelSpin,solveWheelTraction} from '../src/wheel-physics.mjs';
const unit=65536,identity=[4096,0,0,0,4096,0,0,0,4096];
const body=()=>({position:[0,0,0],momentum:[0,0,0],angularMomentum:[0,0,0],rotation:identity.slice(),linearVelocity:[2*unit,0,0],angularVelocity:[0,0,unit]});
const contact=()=>({directionQ12:[0,4096,0],probeVelocity:[0,0,0],leverArm:[unit,0,0],contactVelocity:[unit,unit,0],
 relativeHit:[unit,32*unit,0],normal:[0,-unit,0],distance:32*unit});
test('wheel buffer readers preserve signed data and reject truncated records',()=>{
 const bytes=Buffer.alloc(76);bytes.writeInt16LE(-256,0);bytes.writeInt16LE(256,10);
 const descriptor=decodeWheelDescriptor(bytes);assert.deepEqual(descriptor.positionQ8,[-256,0,0]);assert.deepEqual(descriptor.directionQ8,[0,256,0]);
 bytes.fill(0);bytes.writeInt32LE(-unit,0);bytes.writeInt32LE(32*unit,72);
 assert.deepEqual(decodeWheelContact(bytes).directionQ12,[-unit,0,0]);assert.equal(decodeWheelContact(bytes).distance,32*unit);
 assert.throws(()=>decodeWheelContact(bytes.subarray(0,75)),/bounds/);
 assert.throws(()=>decodeWheelDescriptor(bytes,60),/bounds/);
});
test('wheel probes retain Q8 points, short transforms and angular contact velocity',()=>{
 const descriptor={positionQ8:[256,0,0],directionQ8:[0,256,0],tag:0},state=body();
 const probe=buildWheelProbe(state,descriptor);
 assert.deepEqual(probe.query.originQ8,[256,0,0]);assert.deepEqual(probe.query.deltaQ8,[0,11264,0]);
 assert.deepEqual(probe.probeVelocity,[2*unit,unit,0]);
 const resolved=resolveWheelContact(state,descriptor,probe,{flags:1,fractionQ16:unit/2,pointQ8:[256,5632,0],normalQ16:[0,-unit,0]});
 assert.equal(resolved.distance,22*unit);assert.deepEqual(resolved.contactVelocity,[-20*unit,unit,0]);
 assert.deepEqual(resolved.relativeHit,[unit,22*unit,0]);
 assert.equal(resolveWheelContact(state,descriptor,probe,{flags:0}),null);
 assert.deepEqual(transformShortQ12(identity,[65535,0,0]),[-1,0,0]);
});
test('suspension preserves native coefficients, clamping, torque and tangent projection',()=>{
 const result=solveWheelSuspension(contact());
 assert.equal(result.scalar,-7268);assert.deepEqual(result.impulse,[0,-7268,0]);assert.deepEqual(result.angularImpulse,[0,0,-7268]);
 assert.deepEqual(result.slipVector,[unit,0,0]);assert.deepEqual(result.supportProjection,[0,-807,0]);
 assert.equal(solveWheelSuspension({...contact(),distance:36*unit}).scalar,0);
 assert.equal(solveWheelSuspension({...contact(),distance:0}).scalar,-40000);
 assert.equal(solveWheelSuspension({...contact(),distance:40*unit}).scalar,0);
});
test('four-wheel stage skips airborne slots and adds balanced suspension impulses',()=>{
 const state=body(),wheels=[{flags:1},{flags:1},{flags:0},{flags:0}];
 const left=contact(),right={...contact(),leverArm:[-unit,0,0]};
 const result=applyWheelSuspension(state,wheels,[left,right,null,null]);
 assert.deepEqual(state.momentum,[0,-14536,0]);assert.deepEqual(state.angularMomentum,[0,0,0]);
 assert.equal(result[2],null);assert.deepEqual(wheels[0].normal,[0,-unit,0]);
 assert.throws(()=>applyWheelSuspension(state,[{flags:1},{flags:0},{flags:0},{flags:0}],[null,null,null,null]),/no contact/);
});
test('traction changes from low-slip damping to capacity-limited grip',()=>{
 assert.equal(vectorLengthQ16([3*unit,4*unit,0]),5*unit);
 const wheel={spin:0,angle:0,driveDirection:[0,0,0]};
 const low=solveWheelTraction(wheel,[unit,0,0],unit,0);
 assert.deepEqual(low.correction,[-unit/8,0,0]);assert.equal(low.skidding,false);
 const high=solveWheelTraction(wheel,[16*unit,0,0],unit,16);
 assert.equal(high.effectiveCapacity,unit/2);assert.deepEqual(high.correction,[-unit/2,0,0]);
 assert.equal(high.slipSpeed,8*unit);assert.equal(high.skidding,true);
});
test('wheel spin cannot reverse through zero in one update and respects special time',()=>{
 const wheel={spin:unit,angle:0};advanceWheelSpin(wheel,-unit,0);
 assert.equal(wheel.spin,0);assert.equal(wheel.angle,0);
 advanceWheelSpin(wheel,-unit,0,{timeScaleActive:true,timeScaleQ16:unit/2});
 assert.ok(wheel.spin<0);assert.equal(wheel.angle,wheel.spin>>1);
});
