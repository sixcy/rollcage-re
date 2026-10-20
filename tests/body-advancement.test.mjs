import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceBodyForCollision,finishBodyAdvancement} from '../src/body-advancement.mjs';
const body=(extra={})=>({flags:3,integrationFlags:1,position:[0,0,0],linearVelocity:[65536,0,0],frameTimeQ16:0,attachmentCount:0,...extra});
test('normal nudge uses arithmetic shifts and spatial callbacks see the updated clock',()=>{
 const value=body({position:[0xffffff,0,0]}),calls=[];
 assert.equal(advanceBodyForCollision(value,0,[128,-1,127],{removeSpatial:b=>calls.push(['remove',b.frameTimeQ16,b.position.slice()]),insertSpatial:b=>calls.push(['insert',b.frameTimeQ16,b.position.slice()])}),true);
 assert.deepEqual(calls,[['remove',0,[0x1000000,-1,0]],['insert',0,[0x1000000,-1,0]]]);
});
test('special time scaling changes translation but keeps the original frame clock',()=>{
 const value=body();advanceBodyForCollision(value,32768,null,{}, {timeScaleActive:true,timeScaleQ16:32768});assert.deepEqual(value.position,[16384,0,0]);assert.equal(value.frameTimeQ16,32768);
 advanceBodyForCollision(value,-16384);assert.deepEqual(value.position,[0,0,0]);assert.equal(value.frameTimeQ16,16384);
});
test('frame completion skips finished bodies and kinematic translation bypasses spatial callbacks',()=>{
 const queue=[],moving=body({flags:0x8000,position:[0xffffff,0,0],attachmentCount:2,quaternion:[1,2,3,4]}),done=body({frameTimeQ16:65536}),overshot=body({frameTimeQ16:70000}),pastSentinel=body(),calls=[];
 assert.equal(finishBodyAdvancement([moving,done,overshot,null,pastSentinel],{attachmentQueue:queue,removeSpatial:()=>calls.push('remove'),insertSpatial:()=>calls.push('insert')}),1);
 assert.deepEqual(moving.position,[0x100ffff,0,0]);assert.deepEqual(moving.quaternion,[1,2,3,4]);assert.equal(moving.frameTimeQ16,65536);assert.deepEqual(queue,[moving]);assert.deepEqual(calls,[]);assert.equal(pastSentinel.frameTimeQ16,0);
});
test('the first tagged handle controls native queue writes and retained storage is reused after count reset',()=>{
 const value=body({attachmentHandles:[0x1001,0,0,0,0]});delete value.attachmentCount;
 const retained={old:true},queue={entries:[retained,retained],count:0};advanceBodyForCollision(value,1,null,{attachmentQueue:queue});
 assert.equal(queue.count,1);assert.equal(queue.entries[0],value);assert.equal(queue.entries[1],retained);
 queue.count=0;value.attachmentHandles[0]=0;advanceBodyForCollision(value,1,null,{attachmentQueue:queue});assert.equal(queue.count,0);assert.equal(queue.entries[0],value);
 value.attachmentCount=1;assert.throws(()=>advanceBodyForCollision(value,1,null,{attachmentQueue:queue}),/must agree/);
});
