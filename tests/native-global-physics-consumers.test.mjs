import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameMemory} from '../tools/lib/native-frame-memory.mjs';
import {registerNativeGlobalAddresses,nativeGlobalAddress} from '../src/native-global-address.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createRawAttachmentQueue} from '../src/raw-attachment-queue.mjs';
import {createRawBody,registerRawBodySpatial} from '../src/raw-body-construction.mjs';
import {removeBodySpatial} from '../src/body-retirement.mjs';
import {initializeRawBodyArena,initializeRawShapePools,initializeWorldPhysicsConstants} from '../src/world-physics-pools.mjs';

//Constructed ASLR collision: preferred clone70f130 +1f0000 is8ff130 and
//its3e78-byte input span crosses the902xxx canonical fixed-global domain.
//A raw pointer with those bits must still refer to the actual clone bytes.
const DELTA=0x1f0000,CLONE=0x8ff130,ARENA=0x902000,BODY=0x902b80,RAWLIST=0x902040,RAWGROUP=0x902ee0,OTHERLIST=0x180000,BUCKET=0x190000,ROWS=0x1a0000,INDICES=0x1b0000;
const actual=p=>p+DELTA;
function fixture(){
  const routes=[{address:0x902040,targetAddress:actual(0x902040),length:16},{address:0x902ba0,targetAddress:actual(0x902ba0),length:0x350}];
  const rows=[{address:CLONE,bytes:Buffer.alloc(0x3e78)},...routes.map(route=>({address:route.targetAddress,bytes:Buffer.alloc(route.length)})),
    {address:OTHERLIST,bytes:Buffer.alloc(32)},{address:BUCKET,bytes:Buffer.alloc(16)},{address:ROWS,bytes:Buffer.alloc(4096)},{address:INDICES,bytes:Buffer.alloc(256*2)},
    {address:0x909254,bytes:Buffer.alloc(4)},{address:0x909278,bytes:Buffer.alloc(4)},{address:0x6e6ba0,bytes:Buffer.alloc(4)}];
  const result=createNativeFrameMemory(rows,{aliases:routes}),m=result.memory,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  put(BODY,4);put(BODY+12,BUCKET);put(RAWLIST,BODY);put(RAWLIST+4,0);put(OTHERLIST,BODY);put(OTHERLIST+4,0);
  put(actual(0x902bc0),RAWLIST);m.writeUInt16LE(1,actual(0x902bc4));put(actual(0x902ba4),4);put(actual(0x902ba8),ARENA);
  put(actual(0x902eec),ARENA);put(0x902eec,0x41424344); //Actual clone bytes, not the module global.
  put(RAWGROUP,OTHERLIST);m.writeUInt16LE(3,RAWGROUP+4);m.writeUInt16LE(7,actual(0x902ee4));
  put(actual(0x902040),BODY);put(0x6e6ba0,1);put(0x909254,ROWS);put(0x909278,BUCKET);
  for(let i=0;i<256;i++){m.writeUInt16LE(0xff00,ROWS+i*16);put(ROWS+i*16+12,INDICES);}
  const views=createPhysicsRuntimeViews({memory:m,bodyStorage:[{address:BODY,length:0x180}],bodyLists:[{address:RAWLIST,capacity:4},{address:OTHERLIST,capacity:4}]});
  return{...result,routes,views,put};
}

test('physics views distinguish module group headers from actual clone pointers with902xxx bits',()=>{
  const f=fixture(),m=f.memory;
  assert.equal(f.views.physicalGroup.address,actual(0x902bc0));assert.equal(f.views.physicalGroup.count,1);
  assert.equal(f.views.physicalGroup.bodies[0].address,BODY);assert.equal(m.readUInt32LE(actual(0x902bc0)),RAWLIST);
  assert.equal(f.views.candidateGroups.refreshGroup.address,actual(0x902ee0));assert.equal(f.views.candidateGroups.refreshGroup.count,7);
  const raw=f.views.groupAt(RAWGROUP);assert.equal(raw.address,RAWGROUP);assert.equal(raw.count,3);assert.equal(raw.isRefreshGroup,false);
  raw.count=4;assert.equal(m.readUInt16LE(RAWGROUP+4),4);assert.equal(m.readUInt16LE(actual(0x902ee4)),7);
  for(let i=0;i<65;i++)assert.equal(f.views.candidateGroups.groups[i].address,actual(0x902be0+i*12));
});

test('event and attachment consumers translate fixed slots while preserving their raw pointer values',()=>{
  const f=fixture(),m=f.memory;f.put(ARENA+4,BODY);
  const event=f.views.queue.events[0];assert.equal(event.address,ARENA);assert.equal(event.object1.address,BODY);
  event.scalar=77;assert.equal(m.readInt32LE(ARENA+0x48),77);assert.equal(m.readInt32LE(actual(0x902048)),0);
  const queue=createRawAttachmentQueue({memory:m,bodyAt:p=>f.views.bodyAt(p)});
  assert.equal(queue.entries[0].address,BODY);queue.entries[2]=f.views.bodyAt(BODY);
  assert.equal(m.readUInt32LE(actual(0x902048)),BODY);assert.equal(m.readInt32LE(ARENA+0x48),77);
  assert.throws(()=>queue.entries[4],/Unobserved native global operand/,'Unobserved derived array slots do not inherit the source transport capacity.');
});

test('raw body spatial algorithms resolve the fixed arena root and retain actual overlapping body addresses',()=>{
  const f=fixture(),m=f.memory;
  registerRawBodySpatial(BODY,{memory:m});assert.equal(m.readUInt32LE(BODY+12),BUCKET);assert.equal(m.readUInt16LE(BUCKET+8),24);
  assert.equal(m.readUInt32LE(0x902eec),0x41424344);assert.equal(m.readUInt32LE(actual(0x902eec)),ARENA);
  removeBodySpatial(BODY,{memory:m});assert.equal(m.readUInt16LE(BUCKET+8),0);assert.equal(m.readUInt32LE(BODY+4),0);
});

test('raw body constructor uses registered fixed globals without rebasing the returned arena pointer',()=>{
  //Ordinary byte-backed construction remains supported; registration changes
  //only explicit fixed-global operands, not Buffer's ordinary numeric API.
  const memory=Buffer.alloc(0xb10000,0x69);
  registerNativeGlobalAddresses(memory,[{address:0x902000,targetAddress:actual(0x902000),length:0x1300}]);
  memory.writeUInt32LE(ARENA,actual(0x902eec));memory.writeUInt32LE(0,0x70dcf4);memory.writeUInt32LE(0,0x6e6b44);memory.writeUInt32LE(0x55667788,actual(0x902040));
  assert.equal(createRawBody(0,0x9004,0x180,0,{memory,scratchBase:0x9000}),ARENA);
  assert.equal(memory.readUInt32LE(ARENA),0x9004);assert.equal(memory.readUInt32LE(0x70e200),ARENA);assert.equal(memory.readUInt32LE(0x70dcf4),0x180);
  assert.equal(memory.readUInt32LE(actual(0x902040)),0x55667788);assert.equal(memory.readUInt32LE(actual(0x902eec)),ARENA);
});

test('world pool constructors publish relocated fixed roots without overwriting captured clone bytes',()=>{
  const memory=Buffer.alloc(0xb10000,0x69);
  registerNativeGlobalAddresses(memory,[{address:0x902ba0,targetAddress:actual(0x902ba0),length:0x350}]);
  initializeWorldPhysicsConstants(memory);memory.writeInt32LE(27,0x709808);
  const cloneBefore=Buffer.from(memory.subarray(CLONE,CLONE+0x3e78));
  initializeRawBodyArena({memory,allocate:()=>0x100003});
  assert.equal(memory.readUInt32LE(actual(0x902eec)),0x100080);
  let cursor=0x600000;
  initializeRawShapePools({memory,allocate:size=>{const p=cursor;cursor+=size;return p;}});
  assert.equal(memory.readUInt32LE(actual(0x902ba4)),100);assert.equal(memory.readUInt32LE(actual(0x902bc4)),0);
  assert(memory.readUInt32LE(actual(0x902ba8))>=0x600000);assert(memory.readUInt32LE(actual(0x902bc0))>=0x600000);
  assert.deepEqual(memory.subarray(CLONE,CLONE+0x3e78),cloneBefore);
  assert.equal(nativeGlobalAddress(memory,0x902ee0),actual(0x902ee0));
});
