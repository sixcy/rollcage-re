import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOrdinaryBody} from '../src/body-preparation.mjs';
const body=(extra={})=>({flags:3,position:[0,0,0],momentum:[0,0,0],angularMomentum:[0,0,0],linearVelocity:[0,0,0],angularVelocity:[0,0,0],force:[0,0,0],torque:[0,0,0],mass:65536,inverseMass:65536,collisionFlags:0,collisionCount10c:0,collisionIds:[],contactFrictionB4:0,rotation:[4096,0,0,0,4096,0,0,0,4096],...extra});
const environment=(extra={})=>({records:[],gravityQ16:65536,effectFlags:{first:0,second:0},...extra});
const special=()=>({wheels:Array.from({length:4},()=>({flags:0})),reverseByte64f:0,rememberedSide654:0,airCounter655:6,speed664:0});
function contactRecords(){const records=[Buffer.alloc(72),Buffer.alloc(72)];records[0].writeUInt16LE(0x8100,0x44);records[1].writeInt32LE(65536,0x28);records[1].writeInt32LE(65536,0x30);return records;}

test('effect protection is consumed by the first active effect so the second one can execute',()=>{
 const target=body({flags:0x20003}),effects={first:1,second:1},log=[];
 prepareOrdinaryBody(target,environment({effectFlags:effects,handlers:{applyEffect9153d0:b=>log.push(b.flags)}}));
 assert.deepEqual(log,[3]);assert.equal(target.flags,3);assert.deepEqual(effects,{first:1,second:1});
});

test('effect callbacks can enable the second gate and their increments are applied before accumulators clear',()=>{
 const target=body({angularVelocity:[7,8,9]}),effects={first:1,second:0},log=[];
 prepareOrdinaryBody(target,environment({effectFlags:effects,handlers:{applyEffect91cd90:b=>{log.push('first');b.force[0]=65536;effects.second=1;},applyEffect9153d0:b=>{log.push('second');b.torque[2]=65536;}}}));
 assert.deepEqual(log,['first','second']);assert.deepEqual(target.momentum,[65536,0,0]);assert.deepEqual(target.angularMomentum,[0,0,65536]);assert.deepEqual(target.linearVelocity,[65536,0,0]);
 assert.deepEqual(target.angularVelocity,[7,8,9]);assert.deepEqual(target.force,[0,0,0]);assert.deepEqual(target.torque,[0,0,0]);
});

test('effect gates require exactly one and live type mutations govern the second exemption',()=>{
 for(const type of [17,21,25])prepareOrdinaryBody(body({flags:type}),environment({effectFlags:{first:1,second:1}}));
 prepareOrdinaryBody(body(),environment({effectFlags:{first:2,second:-1}}));
 const target=body();prepareOrdinaryBody(target,environment({effectFlags:{first:1,second:1},handlers:{applyEffect91cd90:b=>{b.flags=17;}}}));assert.equal(target.flags,17);
 assert.throws(()=>prepareOrdinaryBody(body(),environment({effectFlags:{first:1,second:0}})),/requires applyEffect91cd90/);
});

test('a stopped body skips gravity until any nonzero velocity clears its stopped bit',()=>{
 const stopped=body({flags:0x1003,collisionFlags:0x80001234|0});prepareOrdinaryBody(stopped,environment());
 assert.deepEqual(stopped.momentum,[0,0,0]);assert.equal(stopped.collisionFlags,0x80001234|0);
 const moving=body({flags:0x1003,collisionFlags:0x80001234|0,linearVelocity:[1,0,0]});prepareOrdinaryBody(moving,environment());
 assert.equal(moving.collisionFlags,0x1234);assert.deepEqual(moving.momentum,[0,65536,0]);assert.deepEqual(moving.linearVelocity,[0,65536,0]);
});

test('ordinary gravity is mass-scaled and time scaling applies only to eligible, nonexempt types',()=>{
 for(const [type,exempt,expected]of [[3,false,98304],[7,false,98304],[21,false,98304],[26,false,196608],[3,true,196608]]){
  const target=body({flags:0x1000|type,mass:131072,inverseMass:32768});prepareOrdinaryBody(target,environment({gravityQ16:196608,timeOptions:{timeScaleActive:true,timeScaleExempt:exempt,timeScaleQ16:32768}}));
  assert.deepEqual(target.linearVelocity,[0,expected,0]);assert.deepEqual(target.momentum,[0,expected*2,0]);
 }
});

test('only exact vehicle flags select direct gravity and signed short drag before force application',()=>{
 const target=body({flags:0x1c03,mass:131072,inverseMass:32768,dragCoefficient2f38:0});
 prepareOrdinaryBody(target,environment({specialVehicleState:special()}));assert.deepEqual(target.momentum,[0,65536,0]);assert.deepEqual(target.linearVelocity,[0,32768,0]);
 const ordinary=body({flags:0x5c03,mass:131072,inverseMass:32768});prepareOrdinaryBody(ordinary,environment());assert.deepEqual(ordinary.momentum,[0,131072,0]);
 const drag=body({flags:0x1c03,linearVelocity:[-1,65535,0],dragCoefficient2f38:65535});prepareOrdinaryBody(drag,environment({gravityQ16:0,specialVehicleState:special()}));assert.deepEqual(drag.momentum,[-1,0,0]);
});

test('ordinary bodies do not materialize vehicle-only state',()=>{
 for(const flags of [4,0x1004,0x5c03]){
  const target=body({flags});
  prepareOrdinaryBody(target,environment({specialVehicleStateFor:()=>{throw Error('Vehicle state must remain unread.');}}));
 }
});

test('vehicle state selection follows protection clearing and signed drag in the exact vehicle branch',()=>{
 const target=body({flags:0x21c03,linearVelocity:[65536,0,0],dragCoefficient2f38:2});
 let calls=0;
 prepareOrdinaryBody(target,environment({effectFlags:{first:1,second:0},specialVehicleStateFor:selected=>{
  calls++;assert.equal(selected,target);assert.equal(selected.flags,0x1c03);assert.deepEqual(selected.force,[-2,0,0]);return special();
 }}));
 assert.equal(calls,1);assert.deepEqual(target.momentum,[-2,65536,0]);
 const changed=body({flags:0x1c03,dragCoefficient2f38:0});
 prepareOrdinaryBody(changed,environment({effectFlags:{first:1,second:0},handlers:{applyEffect91cd90:selected=>{selected.flags=0x1004;}},specialVehicleStateFor:()=>{throw Error('Effects removed the vehicle branch.');}}));
 assert.equal(changed.flags,0x1004);assert.deepEqual(changed.momentum,[0,65536,0]);
});

test('zero contact coefficient consumes flags and updates the contact radius while skipping friction entirely',()=>{
 const records=contactRecords(),target=body({flags:0x1003,momentum:[65536,0,0],linearVelocity:[65536,0,0],collisionCount10c:1,collisionIds:[0,1]});
 const result=prepareOrdinaryBody(target,environment({records}));assert.deepEqual(result,{contacts:1,friction:null});assert.equal(records[0].readUInt16LE(0x44),0);assert.equal(records[1].readInt32LE(0x3c),65536);
 assert.deepEqual(target.momentum,[65536,65536,0]);assert.deepEqual(target.angularMomentum,[0,0,0]);
});

test('stored contact friction uses this frame gravity and is accumulated before velocity refresh',()=>{
 const records=contactRecords(),target=body({flags:0x1003,momentum:[65536,0,0],linearVelocity:[65536,0,0],collisionCount10c:1,collisionIds:[0,1],contactFrictionB4:65536});
 const result=prepareOrdinaryBody(target,environment({records}));assert.equal(result.contacts,1);assert.deepEqual(result.friction,{linear:[-69336,0,0],angular:[0,-65536,0]});
 assert.deepEqual(target.momentum,[-3800,65536,0]);assert.deepEqual(target.linearVelocity,[-3800,65536,0]);assert.deepEqual(target.angularMomentum,[0,-65536,0]);assert.deepEqual(target.force,[0,0,0]);assert.deepEqual(target.torque,[0,0,0]);
});
