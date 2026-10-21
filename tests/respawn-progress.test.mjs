import test from 'node:test';
import assert from 'node:assert/strict';
import {findNearestRespawnCheckpoint,updateRespawnProgress,transitionCheckpoint,parseCheckpointProgression} from '../src/respawn-progress.mjs';
function fixture(){
 const checkpoints70=Buffer.alloc(40);checkpoints70[1]=0;checkpoints70[21]=1;checkpoints70.writeInt16LE(100,24);
 return {record:{bytes:Buffer.alloc(780,0xa5),body00:{position:[0,0,0]}},runtime:{pack:{checkpointCount44:2,checkpointIds90:Buffer.from([255,0,255,255,1,255,255,255]),checkpoints70}}};
}
test('nearest scan admits every packed ID lane and preserves first identity on ties',()=>{
 const {record,runtime}=fixture();assert.equal(findNearestRespawnCheckpoint(record,runtime.pack).id,0);
 record.body00.position[0]=100<<16;assert.equal(findNearestRespawnCheckpoint(record,runtime.pack).id,1);
 runtime.pack.checkpoints70.writeInt16LE(0,24);record.body00.position[0]=0;assert.equal(findNearestRespawnCheckpoint(record,runtime.pack).id,0);
});
test('initial forward wrapping uses current byte and final transition sees cleared direction byte',()=>{
 const {record,runtime}=fixture(),calls=[];let count=0;
 const result=updateRespawnProgress(record,runtime,{transition:(object,mode)=>{calls.push([mode,object.bytes[0x20],object.bytes[0x21],object.bytes[0x1f]]);return mode&&count++===0?1:mode?0:77;}});
 assert.equal(result,77);assert.deepEqual(calls.map(call=>call.slice(0,3)),[[1,0,1],[1,1,0],[0,1,0]]);assert.equal(calls.at(-1)[3],0);
});
test('backward wrap observes replacement pack and bounded retries still make the final mode0 call',()=>{
 const {record,runtime}=fixture();let calls=0;
 updateRespawnProgress(record,runtime,{transition:(object,mode)=>{calls++;if(mode&&calls===1){object.bytes[0x21]=0;runtime.pack={...runtime.pack,checkpointCount44:3};}return mode?2:0;}});
 assert.equal(calls,14);assert.equal(record.bytes[0x1f],0);
});
test('an all-ff table does not invent a readable native checkpoint',()=>{
 const {record,runtime}=fixture();runtime.pack.checkpointIds90.fill(255);
 assert.throws(()=>findNearestRespawnCheckpoint(record,runtime.pack),/no readable checkpoint/);
});

function transitionFixture(){
 const f=fixture(),bytes=Buffer.alloc(0x4000),record=f.record;record.bytes.fill(0);record.body00.bytes=bytes;
 record.bytes[0x20]=0;record.bytes[0x21]=1;record.bytes[0x249]=1;record.bytes[0x1c]=1;
 f.runtime.session={mode579:0};const table=f.runtime.pack.checkpoints70;
 table.writeUInt16LE(65535,2);table.writeUInt16LE(0,22);table.writeInt16LE(0,4);table.writeInt16LE(-128,24);table.writeInt16LE(64,12);table.writeInt16LE(64,32);
 f.runtime.pack.checkpointIds90=Buffer.from([0,255,255,255,1,255,255,255]);
 bytes.writeInt32LE(-64<<16,0x34);bytes.writeInt32LE(0,0x11c);bytes.writeInt16LE(4,0x668);bytes.writeInt32LE(65536,0x68);
 return f;
}
test('checkpoint interpolation preserves per-product truncation and the direction counter wraps after240',()=>{
 const {record,runtime}=transitionFixture();record.bytes[0x1f]=240;
 transitionCheckpoint(record,0,runtime,{trackBasis:()=>[65536,0,0]});
 assert.equal(record.bytes.readInt32LE(0x24),32256);assert.equal(record.bytes[0x1f],177);assert.equal(record.bytes[0x20],0);assert.equal(record.bytes[0x21],1);
});
test('mode1 changes checkpoint tag bytes but returns before progress and track-basis processing',()=>{
 const {record,runtime}=transitionFixture();record.body00.bytes.writeInt32LE(1<<16,0x34);record.bytes[0x22]=77;
 assert.equal(transitionCheckpoint(record,1,runtime),1);assert.equal(record.bytes[0x22],77);assert.equal(record.bytes[0x23],1);assert.equal(record.bytes.readInt32LE(0x24),0);
 runtime.session.mode579=11;assert.equal(transitionCheckpoint(record,1,runtime),3);
});
test('negative terrain returns before requiring checkpoint memory or basis in mode0',()=>{
 const {record,runtime}=transitionFixture();record.body00.bytes.writeInt32LE(-1,0x11c);runtime.pack=null;const before=Buffer.from(record.bytes);
 assert.equal(transitionCheckpoint(record,0,runtime),0);assert.deepEqual(record.bytes,before);
});
test('backward crossing through previous index zero wraps indices and decrements an unfinished lap',()=>{
 const {record,runtime}=transitionFixture();record.bytes[0x20]=1;record.bytes[0x21]=0;record.bytes[0x249]=0;record.bytes[0x1c]=2;
 record.body00.bytes.writeInt32LE(-256<<16,0x34);
 transitionCheckpoint(record,0,runtime,{trackBasis:()=>[-65536,0,0]});
 assert.equal(record.bytes[0x20],0);assert.equal(record.bytes[0x21],1);assert.equal(record.bytes[0x1c],1);assert.equal(record.bytes.readInt32LE(0x24),65535);assert.equal(record.bytes[0x1f],0);
});
test('authored checkpoint parser maps loader offsets, preserves views and validates ID bounds',()=>{
 const data=Buffer.alloc(0x200);data.write('GFXM');data[0x95]=1;data.writeUInt32LE(0x100,0xa0);data.writeUInt32LE(0x180,0xbc);data.fill(255,0x180,0x184);data[0x180]=1;
 const pack=parseCheckpointProgression(data);assert.equal(pack.checkpointCount44,1);assert.equal(pack.checkpointIds90[0],1);data[0x100]=123;assert.equal(pack.checkpoints70[0],123);
 data[0x180]=254;assert.throws(()=>parseCheckpointProgression(data),/ID exceeds/);
});
