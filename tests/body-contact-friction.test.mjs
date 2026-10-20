import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeBodyContactState,scaleContactVector,calculateBodyContactFriction,accumulateBodyContactFriction} from '../src/body-contact-friction.mjs';
const record=({flags=0,radius=65536,point=[0,0,0],normal=[0,65536,0]}={})=>{
 const bytes=Buffer.alloc(72);bytes.writeUInt16LE(flags,0x44);bytes.writeInt32LE(radius,0x3c);
 point.forEach((value,index)=>bytes.writeInt32LE(value,0x20+index*4));normal.forEach((value,index)=>bytes.writeInt32LE(value,0x2c+index*4));return bytes;
};
const body=(extra={})=>({position:[0,0,0],collisionCount10c:0,collisionIds:[0],contactFrictionB4:65536,momentum:[0,0,0],angularMomentum:[0,0,0],linearVelocity:[0,0,0],angularVelocity:[0,0,0],force:[0,0,0],torque:[0,0,0],...extra});

test('contact consumption clears every individual flag word and refreshes only the aggregate radius',()=>{
 const records=[record({flags:0x8100}),record({flags:0x4000}),record({flags:0x1234,radius:17,point:[256+3*65536,4*65536,0]})],target=body({position:[65536,0,0],collisionCount10c:2,collisionIds:[0,1,2]});
 const aggregateBefore=Buffer.from(records[2]);aggregateBefore.writeInt32LE(5*65536,0x3c);
 assert.equal(consumeBodyContactState(target,records),1);assert.equal(records[0].readUInt16LE(0x44),0);assert.equal(records[1].readUInt16LE(0x44),0);
 assert.deepEqual(records[2],aggregateBefore);assert.equal(consumeBodyContactState(target,records),0);assert.deepEqual(records[2],aggregateBefore);
});

test('aliased shape IDs are counted once because consumption clears flags during reverse traversal',()=>{
 const records=[record({flags:0xffff}),record()],target=body({collisionCount10c:2,collisionIds:[0,0,1]});
 assert.equal(consumeBodyContactState(target,records),1);assert.equal(records[0].readUInt16LE(0x44),0);
});

test('unmarked and signed-negative shape counts preserve the stale aggregate radius',()=>{
 const records=[record({flags:0x80}),record({radius:12345})],target=body({collisionCount10c:1,collisionIds:[0,1]});
 assert.equal(consumeBodyContactState(target,records),0);assert.equal(records[0].readUInt16LE(0x44),0);assert.equal(records[1].readInt32LE(0x3c),12345);
 assert.equal(consumeBodyContactState(body({collisionCount10c:255,collisionIds:[]}),[]),0);
});

test('native target-length scaling preserves zero vectors and lookup-table approximation',()=>{
 const zero=[0,0,0];assert.equal(scaleContactVector(zero,65536),zero);assert.deepEqual(zero,[0,0,0]);
 assert.deepEqual(scaleContactVector([3*65536,4*65536,0],10*65536),[393210,524280,0]);
 assert.deepEqual(scaleContactVector([200*65536,0,0],65536),[65800,0,0]);
});

test('slow contacts zero momenta strictly below each native threshold and zero their derived velocities',()=>{
 const target=body({momentum:[69,-69,0],angularMomentum:[9999,-9999,0],linearVelocity:[65536,0,0],angularVelocity:[0,65536,0]}),records=[record({radius:0})];
 const result=calculateBodyContactFriction(target,records,[0,65536,0],[65536,0,0],1);
 assert.deepEqual(target.momentum,[0,0,0]);assert.deepEqual(target.angularMomentum,[0,0,0]);assert.deepEqual(target.linearVelocity,[0,0,0]);assert.deepEqual(target.angularVelocity,[0,0,0]);
 assert.deepEqual(result,{linear:[0,0,0],angular:[0,0,0]});
});

test('slow-contact thresholds are strict and still permit separate spin and linear drag',()=>{
 const target=body({momentum:[70,0,0],angularMomentum:[0,10000,0],linearVelocity:[65536,0,0],angularVelocity:[0,65536,0]}),records=[record()];
 const result=calculateBodyContactFriction(target,records,[0,65536,0],[0,0,0],1);
 assert.deepEqual(target.momentum,[70,0,0]);assert.deepEqual(target.angularMomentum,[0,10000,0]);
 assert.deepEqual(result,{linear:[-3800,0,0],angular:[0,-327680,0]});
});

test('sliding friction opposes tangential speed and creates lever-arm torque with the native doubled cap',()=>{
 const target=body(),records=[record({point:[0,0,65536]})];
 assert.deepEqual(calculateBodyContactFriction(target,records,[0,65536,0],[65536,0,0],1),{linear:[-65536,0,0],angular:[0,-65536,0]});
 assert.deepEqual(calculateBodyContactFriction(target,records,[0,65536,0],[65536,0,0],3),{linear:[-131072,0,0],angular:[0,-131072,0]});
});

test('friction accumulation adds linear and angular increments without consuming stored contact bytes',()=>{
 const target=body({linearVelocity:[65536,0,0],force:[0,-65536,0]}),records=[record()],before=Buffer.from(records[0]);
 const result=accumulateBodyContactFriction(target,records,1);
 assert.deepEqual(result,{linear:[-69336,0,0],angular:[0,0,0]});assert.deepEqual(target.force,[-69336,-65536,0]);assert.deepEqual(target.torque,[0,0,0]);assert.deepEqual(records[0],before);
});
