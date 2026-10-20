import test from 'node:test';
import assert from 'node:assert/strict';
import {queryTerrainBodyShapes,queryModelBodyShapes} from '../src/static-shape-queries.mjs';
const scratch=()=>({point:[10,20,30],normal:[40,50,60],scalar:70,flags:0,contactTime:80});
const makeBody=changes=>({flags:0x10007,collisionFlags:-1,collisionCount10c:3,collisionIds:[0,1,2,3],frameTimeQ16:65526,collisionDelta124:10,collisionState128:123,terrainWord15c:1,...changes});

test('terrain batch clears flags and resets bounds even when geometry is skipped, respecting captured count',()=>{
 const a=makeBody({flags:7}),b=makeBody({terrainWord15c:0}),unvisited=makeBody(),output=scratch();
 queryTerrainBodyShapes([a,b,unvisited],Buffer.alloc(4*72),{count:2,output,query(){throw Error('Unexpected geometry query.');}});
 for(const body of [a,b]){assert.equal(body.collisionFlags,-2147483648);assert.equal(body.collisionDelta124,10);assert.equal(body.collisionState128,123);}
 assert.equal(unvisited.collisionFlags,-1);assert.equal(unvisited.collisionState128,123);
});

test('terrain bound tightening suppresses tolerance hits and retains tied sphere contacts',()=>{
 const body=makeBody(),records=Buffer.alloc(4*72,0xa5),output=scratch(),bounds=[];let ordinal=0;
 queryTerrainBodyShapes([body],records,{output,query(record,object,bound,scratch){assert.equal(record.readUInt16LE(0x44),0);assert.equal(object,body);bounds.push(bound);scratch.flags=ordinal++===1?0x80000:1;return scratch.flags===1?5:4;}});
 assert.deepEqual(bounds,[10,6,6]);assert.equal(body.collisionFlags,-2147483643);assert.equal(body.collisionDelta124,5);assert.equal(body.collisionState128,1);
 assert.equal(records.readInt32LE(0x20),10);assert.equal(records.readInt32LE(2*72+0x38),80);
 assert.equal(records.readUInt32LE(72+0x20),0xa5a5a5a5);assert.equal(output.flags,1);
});

test('terrain discards exact-bound contacts for vehicle types while preserving other types',()=>{
 for(const type of [3,4,7]){const body=makeBody({flags:0x10000|type,collisionCount10c:1}),output=scratch();queryTerrainBodyShapes([body],Buffer.alloc(2*72),{output,query(record,object,bound,scratch){scratch.flags=1;return bound;}});assert.equal(body.collisionFlags,type===7?-2147483647:0);assert.equal(body.collisionState128,type===7?8:0);}
});

test('model query adds an active vehicle aggregate, carries special flags and clears suppressed output flags',()=>{
 const body=makeBody({flags:3,collisionCount10c:2,pairCollisionContext:{stateByte6bc:1}}),records=Buffer.alloc(3*72,0xa5),output=scratch(),bounds=[];let index=2;
 queryModelBodyShapes(body,records,{output,query(record,object,bound,scratch){assert.equal(record.byteOffset-records.byteOffset,index*72);bounds.push(bound);scratch.flags=[0x80000,1,0xa40][index--];return 4;}});
 assert.deepEqual(bounds,[10,5,5]);assert.equal(body.collisionState128,0x2a40);assert.equal(body.collisionFlags,0);assert.equal(body.collisionDelta124,4);assert.equal(output.flags,0);
 assert.equal(records.readInt32LE(2*72+0x20),10);assert.equal(records.readInt32LE(72+0x20),10);assert.equal(records.readUInt32LE(0x20),0xa5a5a5a5);
});

test('terrain callback may replace a future body-list entry before that entry is visited',()=>{
 const first=makeBody({collisionCount10c:1}),oldSecond=makeBody(),replacement=makeBody({collisionCount10c:0}),bodies=[first,oldSecond],output=scratch();
 queryTerrainBodyShapes(bodies,Buffer.alloc(4*72),{output,query(record,object,bound,scratch){bodies[1]=replacement;scratch.flags=0;return bound;}});
 assert.equal(oldSecond.collisionFlags,-1);assert.equal(replacement.collisionFlags,-2147483648);assert.equal(replacement.collisionState128,0);
});
