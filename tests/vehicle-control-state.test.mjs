import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceDigitalVehicleControls,updateVehicleControlState,copyLinkedVehicleControls,updateVehicleMotionState,updateVehicleInputBlock} from '../src/vehicle-control-state.mjs';
import {initializeVehicleInputConstants} from '../src/vehicle-input-packets.mjs';
import {updateAutonomousSteering} from '../src/autonomous-steering.mjs';
import skill from '../src/finish-skill-tables.json' with {type:'json'};
const BODY=0x10000,OTHER=0x14000,RECORD=0x909300,SESSION=0x50000,U=65536;
function fixture(){
 const memory=Buffer.alloc(0xa00000);Buffer.from(skill.hex,'hex').copy(memory,0x570680);memory.writeUInt32LE(SESSION,0x5ecb1c);memory.writeInt32LE(4,SESSION+0x57c);memory[SESSION+0x54d]=1;memory[SESSION+0x586]=3;memory.writeUInt32LE(BODY,RECORD);memory[BODY+0x720]=16;[4096,0,0,0,4096,0,0,0,4096].forEach((value,index)=>memory.writeInt16LE(value,BODY+0xc4+index*2));
 return {memory,digital:()=>advanceDigitalVehicleControls(RECORD,BODY+0x708,{memory}),handling:()=>updateVehicleControlState(BODY,{memory}),motion:()=>updateVehicleMotionState(RECORD,{memory})};
}
test('autonomous steering bits flow through real digital axes into steering and drive state',()=>{
 const f=fixture();f.memory[BODY+0x718]=8;f.memory[BODY+0x721]=15;f.memory.writeInt32LE(0x40,BODY+0x710);[U,0,U].forEach((value,index)=>f.memory.writeInt32LE(value,0x30000+index*4));
 updateAutonomousSteering(BODY,0x30000,0,0,{memory:f.memory,scratchBase:0x9000});updateVehicleInputBlock(BODY,0,{memory:f.memory});f.handling();
 assert.equal(f.memory[BODY+0x708],152);assert.equal(f.memory[BODY+0x709],128);assert.equal(f.memory.readInt32LE(BODY+0x644),5120);assert.equal(f.memory.readInt32LE(BODY+0x650),32768);assert.equal(f.memory.readUInt32LE(BODY+0x714),0x2040);
});
test('analog exemption bits preserve raw axes but reset their digital counters; mode8 ignores exemptions',()=>{
 const f=fixture();f.memory.writeUInt16LE(7,RECORD+0x25e);f.memory[BODY+0x708]=17;f.memory[BODY+0x709]=18;f.memory[BODY+0x70a]=19;f.memory[BODY+0x720]=2;f.memory[BODY+0x721]=30;f.memory[BODY+0x722]=15;f.digital();assert.deepEqual(Array.from(f.memory.subarray(BODY+0x708,BODY+0x70b)),[17,18,19]);assert.deepEqual(Array.from(f.memory.subarray(BODY+0x720,BODY+0x723)),[16,0,0]);
 f.memory[BODY+0x718]=8;f.memory.writeInt32LE(0x20c0,BODY+0x710);f.digital();assert.deepEqual(Array.from(f.memory.subarray(BODY+0x708,BODY+0x70b)),[152,8,255]);
});
test('steering direction reversal first reaches center and neutral returns in four-index steps',()=>{
 const f=fixture();f.memory[BODY+0x720]=4;f.memory.writeInt32LE(0x2000,BODY+0x710);f.digital();assert.equal(f.memory[BODY+0x720],16);assert.equal(f.memory[BODY+0x708],128);f.digital();assert.equal(f.memory[BODY+0x720],19);f.memory.writeInt32LE(0,BODY+0x710);f.digital();assert.equal(f.memory[BODY+0x720],16);
 f.memory[BODY+0x720]=32;f.memory.writeInt32LE(0x8000,BODY+0x710);f.digital();assert.equal(f.memory[BODY+0x720],16);
});
test('handling deadzone and throttle endpoint rules are asymmetric native byte thresholds',()=>{
 const f=fixture();f.memory[BODY+0x708]=135;f.memory[BODY+0x709]=15;f.memory[BODY+0x70a]=15;f.handling();assert.equal(f.memory.readInt32LE(BODY+0x644),0);assert.equal(f.memory[BODY+0x64d],0);assert.equal(f.memory[BODY+0x64e],0);
 f.memory[BODY+0x708]=137;f.memory[BODY+0x709]=241;f.memory[BODY+0x70a]=16;f.handling();assert.equal(f.memory.readInt32LE(BODY+0x644),320);assert.equal(f.memory[BODY+0x64d],255);assert.equal(f.memory[BODY+0x64e],255);assert.equal(f.memory.readInt32LE(BODY+0x650),65280);
});
test('prestart writes6b0 while active brake divides by signed high speed with minimum5',()=>{
 const f=fixture();f.memory[BODY+0x709]=128;f.memory.writeInt32LE(123,BODY+0x650);f.memory.writeInt32LE(3,SESSION+0x57c);f.handling();assert.equal(f.memory.readInt32LE(BODY+0x6b0),32768);assert.equal(f.memory.readInt32LE(BODY+0x650),123);
 f.memory.writeInt32LE(4,SESSION+0x57c);f.memory.writeInt32LE(0x10,BODY+0x710);f.memory.writeInt16LE(-1,BODY+0x666);f.handling();assert.equal(f.memory.readInt32LE(BODY+0x650),-13107);f.memory.writeInt16LE(100,BODY+0x666);f.handling();assert.equal(f.memory.readInt32LE(BODY+0x650),-655);
});
test('the speed producer uses velocity magnitude, updates peak and keeps skipped timer rows stale',()=>{
 const f=fixture();[3*U,4*U,0].forEach((value,index)=>f.memory.writeInt32LE(value,BODY+0x68+index*4));f.memory[RECORD+0x1c]=1;f.memory.writeInt32LE(600,0x90a548);f.memory.writeInt32LE(100,RECORD+0x4c);f.memory.writeInt32LE(200,RECORD+0x50);f.memory.writeUInt32LE(0x12345678,RECORD+0x40);f.memory.writeUInt32LE(0x87654321,RECORD+0x48);
 assert.equal(f.motion(),5*U);assert.equal(f.memory.readInt32LE(BODY+0x664),5*U);assert.equal(f.memory.readInt16LE(BODY+0x668),33);assert.equal(f.memory.readInt16LE(BODY+0x66a),33);assert.equal(f.memory.readInt32LE(RECORD+0x2c),409500);assert.equal(f.memory.readInt32LE(RECORD+0x34),409400);assert.equal(f.memory.readUInt32LE(RECORD+0x40),0x12345678);assert.equal(f.memory.readUInt32LE(RECORD+0x48),0x87654321);
});
test('prestart still updates664 but zeroes668 without lowering its retained peak or timers',()=>{
 const f=fixture();f.memory.writeInt32LE(U,BODY+0x68);f.memory.writeInt16LE(100,BODY+0x66a);f.memory.writeInt32LE(99,RECORD+0x2c);f.memory.writeInt32LE(3,SESSION+0x57c);f.motion();assert.equal(f.memory.readInt32LE(BODY+0x664),U);assert.equal(f.memory.readInt16LE(BODY+0x668),0);assert.equal(f.memory.readInt16LE(BODY+0x66a),100);assert.equal(f.memory.readInt32LE(RECORD+0x2c),99);
});
test('linked input copies controls in order while retaining local mode and metadata',()=>{
 const f=fixture();f.memory.writeUInt32LE(OTHER,BODY+0x690);f.memory[BODY+0x698]=100;f.memory.writeUInt32LE(0x12345678,BODY+0x710);f.memory.writeUInt32LE(0,BODY+0x714);f.memory.fill(0x12,BODY+0x718,BODY+0x728);f.memory.fill(0xff,OTHER+0x708,OTHER+0x728);const result=copyLinkedVehicleControls({memory:f.memory});
 assert.deepEqual(result,{processed:1,copied:1,detached:0});assert.equal(f.memory.readUInt32LE(BODY+0x694),0x12345678);assert.equal(f.memory.readUInt32LE(BODY+0x710),0xf0f0);assert.equal(f.memory[BODY+0x708],255);assert.equal(f.memory[BODY+0x718],0x12);assert.equal(f.memory[BODY+0x71b],0x12);assert.equal(f.memory[BODY+0x723],255);assert.equal(f.memory.readUInt32LE(BODY+0x724),0x12121212);
});
test('linked input cancels for a new edge below60 or a signed expired byte',()=>{
 const f=fixture();f.memory.writeUInt32LE(OTHER,BODY+0x690);f.memory[BODY+0x698]=60;f.memory.writeInt32LE(1,BODY+0x714);assert.equal(copyLinkedVehicleControls({memory:f.memory}).detached,1);assert.equal(f.memory.readUInt32LE(BODY+0x690),0);
 f.memory.writeUInt32LE(OTHER,BODY+0x690);f.memory[BODY+0x698]=0;f.memory.writeInt32LE(0,BODY+0x714);assert.equal(copyLinkedVehicleControls({memory:f.memory}).detached,1);assert.equal(f.memory[BODY+0x698],255);
});
test('mode9 packet controls return before pressed-edge and replay processing',()=>{
 const f=fixture(),packet=0x30000;f.memory[BODY+0x718]=9;f.memory.writeUInt32LE(0x12345678,BODY+0x714);f.memory[packet+1]=0x41;f.memory[packet+2]=0x12;f.memory[packet+3]=0x34;
 updateVehicleInputBlock(BODY,0,{memory:f.memory,scratchBase:0x9000,handlers:{pollInput471250:({pointerAddress})=>f.memory.writeUInt32LE(packet,pointerAddress),replay42ab90:()=>assert.fail('early packet mode must not dispatch replay')}});assert.equal(f.memory.readUInt32LE(BODY+0x710),(~0x1234)>>>0);assert.equal(f.memory.readUInt32LE(BODY+0x714),0x12345678);assert.equal(f.memory[BODY+0x719],0);
});
test('mode10 mirror handling preserves packet upper bits and swaps steering before edges',()=>{
 const f=fixture(),packet=0x30000;f.memory[BODY+0x718]=10;f.memory[SESSION+0x58b]=1;f.memory[packet+1]=0x23;f.memory[packet+2]=0x7f;f.memory[packet+3]=0xff;f.memory.writeUInt16LE(0x1234,packet+4);
 updateVehicleInputBlock(BODY,0,{memory:f.memory,scratchBase:0x9000,handlers:{pollInput471250:({pointerAddress})=>f.memory.writeUInt32LE(packet,pointerAddress),decodeAnalog434360:()=>{f.memory[BODY+0x708]=100;}}});assert.equal(f.memory[BODY+0x708],155);assert.equal(f.memory.readUInt32LE(BODY+0x710),0x12342000);assert.equal(f.memory.readUInt32LE(BODY+0x714),0x12342000);
});
test('replay state is reloaded so a playback-to-recording change can dispatch twice',()=>{
 const f=fixture(),controller=0x60000;f.memory.writeUInt32LE(controller,BODY+0x660);f.memory.writeInt32LE(5,controller+0x1e880);let calls=0;
 updateVehicleInputBlock(BODY,0,{memory:f.memory,handlers:{replay42ab90:()=>{calls++;f.memory.writeInt32LE(2,controller+0x1e880);}}});assert.equal(calls,2);
});

test('sampled analog input reaches handling through actual packet and axis defaults',()=>{
 const f=fixture();initializeVehicleInputConstants(f.memory);f.memory[BODY+0x718]=10;f.memory.writeUInt16LE(0x87,RECORD+0x25e);f.memory.writeUInt32LE(1,0x6e675c);f.memory.writeUInt32LE(0,0x6eafe0);
 f.memory.writeInt8(127,0x6e7ac4+5);f.memory.writeInt8(-127,0x6e7ac4+6);
 updateVehicleInputBlock(BODY,0,{memory:f.memory,scratchBase:0x9000});f.handling();
 assert.equal(f.memory.readUInt32LE(BODY+0x724),0x6e7edc);assert.deepEqual([...f.memory.subarray(BODY+0x708,BODY+0x70b)],[255,255,0]);assert.equal(f.memory.readInt32LE(BODY+0x644),38080);assert.equal(f.memory.readInt32LE(BODY+0x650),65280);assert.equal(f.memory[BODY+0x64e],0);
 f.memory.writeInt8(127,0x6e7ac4+6);updateVehicleInputBlock(BODY,0,{memory:f.memory,scratchBase:0x9000});f.handling();assert.equal(f.memory[BODY+0x70a],254);assert.equal(f.memory[BODY+0x64e],255);
});
