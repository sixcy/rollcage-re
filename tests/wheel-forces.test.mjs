import test from 'node:test';
import assert from 'node:assert/strict';
import {correctWheelTraction,applyWheelTractionForces,initializeWheelForceCoefficients} from '../src/wheel-forces.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import {readVehicleDriveConfiguration} from '../src/wheel-drive.mjs';
const body=()=>({mass:65536,momentum:[0,0,0],angularMomentum:[0,0,0],worldInverseInertia:[65536,0,0,0,65536,0,0,0,65536]});
test('wheel force coefficients use descriptor radius and mass; constructor drive variants remain distinct',()=>{
 const s=initializeVehicleContacts(),b=body();initializeWheelForceCoefficients(b,s);assert.ok(s.wheels.every(wheel=>wheel.torqueScaleQ16===1753*65536));
 const initial=s.wheels[0].correctionScaleQ16;b.mass=32768;initializeWheelForceCoefficients(b,s);assert.equal(s.wheels[0].torqueScaleQ16,1753*32768);assert.equal(s.wheels[0].correctionScaleQ16,initial);
 assert.equal(readVehicleDriveConfiguration(0).spinThreshold,0x110000);assert.equal(readVehicleDriveConfiguration(0).capacityOffset,-2500);assert.equal(readVehicleDriveConfiguration(1).rearDrive,40000);assert.equal(readVehicleDriveConfiguration(0,{specialMode:true}).rearDrive,125000);assert.throws(()=>readVehicleDriveConfiguration(7),/variant/);
});
test('parallel correction has no torque and inactive wheels retain stale caches',()=>{
 const b=body(),wheel={flags:1,leverArm:[65536,0,0],tractionCorrection:[10000,0,0],correctionScaleQ16:1000,torqueScaleQ16:1000};
 assert.deepEqual(correctWheelTraction(wheel,b),{correction:[10000,0,0],angularImpulse:[0,0,0]});
 const inactive={flags:0,tractionCorrection:[99,98,97]},result=applyWheelTractionForces(b,[wheel,inactive,inactive,inactive]);assert.equal(result[1],null);assert.deepEqual(b.momentum,[10000,0,0]);assert.deepEqual(inactive.tractionCorrection,[99,98,97]);
});
test('torque damping preserves sign and mirrored wheel impulses cancel angular momentum',()=>{
 const b=body(),make=x=>({flags:1,leverArm:[x*65536,0,0],tractionCorrection:[0,10000,0],correctionScaleQ16:0,torqueScaleQ16:65536}),wheel=make(1),result=correctWheelTraction(wheel,b);
 assert.ok(result.angularImpulse[2]>0&&result.angularImpulse[2]<10000);assert.deepEqual(wheel.tractionCorrection,[0,10000,0]);
 applyWheelTractionForces(b,[wheel,make(-1),{flags:0},{flags:0}]);assert.deepEqual(b.momentum,[0,20000,0]);assert.ok(Math.abs(b.angularMomentum[2])<=1);
});
