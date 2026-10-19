import test from 'node:test';
import assert from 'node:assert/strict';
import {multiplyQ16,divideQ16,sqrtQ16,lookupSqrt,multiplyQuaternionQ16,normalizeQuaternionQ16} from '../src/fixed-integer.mjs';
import {initializeBody,applyBodyForces,updateBodyDerived,advanceBody} from '../src/body-physics.mjs';
const unit=65536;
function config() {
 const bytes=Buffer.alloc(128);bytes.writeInt32LE(unit,0x24);
 for(const p of [0x68,0x6c,0x70,0x74,0x78])bytes.writeInt32LE(unit,p);
 return bytes;
}
test('fixed arithmetic retains signed product rounding, overflow and division truncation',()=>{
 assert.equal(multiplyQ16(-1,1),-1);assert.equal(multiplyQ16(0x7fffffff,0x7fffffff),-65536);
 assert.equal(divideQ16(-1,3),-21845);assert.equal(divideQ16(unit,2*unit),32768);
 assert.throws(()=>divideQ16(1,0),/zero/);assert.throws(()=>divideQ16(0x7fffffff,1),/overflows/);
});
test('the two native square roots preserve their distinct quantization',()=>{
 assert.equal(sqrtQ16(0),0);assert.equal(sqrtQ16(unit),unit);
 assert.equal(sqrtQ16(2*unit),92680);assert.equal(sqrtQ16(0x7fffffff),11863040);
 assert.equal(lookupSqrt(2*unit),362);assert.equal(lookupSqrt(unit),256);
 assert.throws(()=>sqrtQ16(-1),/nonnegative/);
});
test('quaternion multiplication preserves orientation and handedness',()=>{
 assert.deepEqual(multiplyQuaternionQ16([unit,0,0,0],[0,unit,0,0]),[0,unit,0,0]);
 assert.deepEqual(multiplyQuaternionQ16([0,unit,0,0],[0,0,unit,0]),[0,0,0,unit]);
 assert.deepEqual(multiplyQuaternionQ16([0,0,unit,0],[0,unit,0,0]),[0,0,0,-unit]);
 assert.deepEqual(normalizeQuaternionQ16([2*unit,0,0,0]),[unit,0,0,0]);
 assert.deepEqual(normalizeQuaternionQ16([256*unit,0,0,0]),[unit,0,0,0]);
 assert.deepEqual(normalizeQuaternionQ16([0,0,0,0]),[0,0,0,0]);
});
test('body configuration decodes vectors and initializes derived state',()=>{
 const bytes=config();bytes.writeInt32LE(-3*unit,0);bytes.writeInt32LE(2*unit,0xc);
 const body=initializeBody(bytes);
 assert.deepEqual(body.position,[-3*unit,0,0]);assert.deepEqual(body.linearVelocity,[2*unit,0,0]);
 assert.deepEqual(body.worldInverseInertia,[unit,0,0,0,unit,0,0,0,unit]);
 assert.deepEqual(body.quaternionDerivative,[0,0,0,0]);
 assert.throws(()=>initializeBody(bytes.subarray(0,127)),/128/);
});
test('force application rejects same-sign near-overflow increments and always clears them',()=>{
 const body=initializeBody(config());body.momentum=[0x7cffffff,-0x7cffffff,100];body.force=[2,-2,-10];
 body.angularMomentum=[1,2,3];body.torque=[-4,5,6];applyBodyForces(body);
 assert.deepEqual(body.momentum,[0x7cffffff,-0x7cffffff,90]);assert.deepEqual(body.angularMomentum,[-3,7,9]);
 assert.deepEqual(body.force,[0,0,0]);assert.deepEqual(body.torque,[0,0,0]);
});
test('speed limiting uses the vector length and writes corrected momentum back',()=>{
 const body=initializeBody(config());body.mass=2*unit;body.inverseMass=unit/2;body.momentum=[512*unit,0,0];
 updateBodyDerived(body);assert.deepEqual(body.linearVelocity,[128*unit,0,0]);assert.deepEqual(body.momentum,[256*unit,0,0]);
 body.momentum=[200*unit,0,0];updateBodyDerived(body);assert.deepEqual(body.linearVelocity,[100*unit,0,0]);
});
test('world inertia rotates anisotropic axes and derives angular quaternion change',()=>{
 const body=initializeBody(config());body.inverseInertia=[unit,2*unit,3*unit];
 body.rotation=[0,0,4096,0,4096,0,-4096,0,0];body.angularMomentum=[256*unit,0,0];updateBodyDerived(body);
 assert.deepEqual(body.worldInverseInertia,[3*unit,0,0,0,2*unit,0,0,0,unit]);
 assert.deepEqual(body.angularVelocity,[3*unit,0,0]);assert.deepEqual(body.quaternionDerivative,[0,3*unit/2,0,0]);
});
test('fractional advance preserves frozen orientation and applies eligible time scaling',()=>{
 const bytes=config();bytes.writeInt32LE(2*unit,0xc);const body=initializeBody(bytes);
 body.integrationFlags=1;body.quaternionDerivative=[0,unit,0,0];advanceBody(body,unit/2);
 assert.deepEqual(body.position,[unit,0,0]);assert.deepEqual(body.quaternion,[unit,0,0,0]);
 body.flags=3;advanceBody(body,unit,{timeScaleActive:true,timeScaleQ16:unit/2});
 assert.deepEqual(body.position,[2*unit,0,0]);
 assert.throws(()=>advanceBody(body,unit+1),/frame fraction/);
});
