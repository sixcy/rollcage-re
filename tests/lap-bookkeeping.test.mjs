import test from 'node:test';
import assert from 'node:assert/strict';
import {finishLapBookkeeping,packLapTime} from '../src/lap-bookkeeping.mjs';
const record=0x10000,body=0x20000,otherBody=0x24000,session=0x30000,otherSession=0x38000;
function fixture(){const memory=Buffer.alloc(0xa00000);memory.writeUInt32LE(body,record);memory.writeUInt32LE(session,0x5ecb1c);memory.writeInt32LE(-1,record+0x30);memory[record+0x1c]=1;return memory;}
test('lap bookkeeping updates unsigned best/recent times and wrapped clock stamp',()=>{
 const memory=fixture();memory.writeUInt32LE(0x80000000,record+0x2c);memory.writeInt32LE(-1,0x90a548);memory[session+0x58c]=1;
 finishLapBookkeeping(record,{memory});assert.equal(memory.readUInt32LE(record+0x30),0x80000000);assert.equal(memory.readUInt32LE(record+0x38),0x80000000);assert.equal(memory.readUInt32LE(record+0x4c),Math.floor(((-1<<11)>>>0)/3));
 memory.writeUInt32LE(0x90000000,record+0x2c);finishLapBookkeeping(record,{memory});assert.equal(memory.readUInt32LE(record+0x30),0x80000000);assert.equal(memory.readUInt32LE(record+0x38),0x90000000);
});
test('packed time keeps sentinel, saturation and native signed negative behavior',()=>{
 assert.equal(packLapTime(-1),0x595999);assert.equal(packLapTime(0x4650000),0x595999);assert.equal(packLapTime(0x464ffff),0x595999);assert.equal(packLapTime(6000<<11),0x100000);assert.equal(packLapTime(-2048),0xfffffff2);assert.equal(packLapTime(0),0);
});
test('mode1 inserts strictly into the five best values and shifts the trailing entries',()=>{
 const memory=fixture();memory[session+0x551]=1;[10,20,30,40,50].forEach((value,index)=>memory.writeUInt32LE(value,session+0x30+index*4));
 const options={memory,handlers:{formatTime4459f0:()=>{},convertTime445d40:()=>25}};finishLapBookkeeping(record,options);
 assert.deepEqual(Array.from({length:5},(_,index)=>memory.readUInt32LE(session+0x30+index*4)),[10,20,25,30,40]);
 options.handlers.convertTime445d40=()=>40;finishLapBookkeeping(record,options);assert.deepEqual(Array.from({length:5},(_,index)=>memory.readUInt32LE(session+0x30+index*4)),[10,20,25,30,40]);
});
test('session/lap are cached before conversion while mode1 index is captured and other modes re-read it',()=>{
 for(const mode of [0,1]){const memory=fixture();memory[session+0x551]=mode;memory.writeUInt16LE(1,otherBody+0x65e);for(let index=0;index<5;index++)memory.writeUInt32LE(0xffffffff,session+0x30+index*4);
  finishLapBookkeeping(record,{memory,handlers:{formatTime4459f0:()=>{memory[record+0x1c]=2;},convertTime445d40:()=>{memory.writeUInt32LE(otherSession,0x5ecb1c);memory.writeUInt32LE(otherBody,record);memory[record+0x1c]=7;return 123;}}});
  const address=mode?session+0x30:session+(0x37+2)*4+0x2c;assert.equal(memory.readUInt32LE(address),123);assert.equal(memory.readUInt32LE(otherSession+0x30),0);
 }
});
