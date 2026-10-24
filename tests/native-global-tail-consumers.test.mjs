import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameMemory} from '../tools/lib/native-frame-memory.mjs';
import {appendRawBodyFlash} from '../src/body-retirement-effects.mjs';
import {removeDynamicLightRanges,updateDynamicLights} from '../src/dynamic-light-state.mjs';
import {updateRawType2Attachment} from '../src/attachment-effects.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';

//Constructed actual stack80f210 overlaps the fixed data domain. Module base
//940000 means preferred image operands move by540000; pointer bits do not.
const DELTA=0x540000,STACK=0x80f210,BODY=0x200000,actual=p=>p+DELTA;
function fixture(){
  const routes=[{address:0x80e660,targetAddress:actual(0x80e660),length:0x4000},{address:0x902000,targetAddress:actual(0x902000),length:0x1300}];
  const result=createNativeFrameMemory([
    ...routes.map(r=>({address:r.targetAddress,bytes:Buffer.alloc(r.length)})),
    {address:0x809a10,bytes:Buffer.alloc(0x6020,0x69)},
    {address:BODY,bytes:Buffer.alloc(0x180)},
    {address:0x8f00,bytes:Buffer.alloc(0x200)},
    {address:0x5e8890,bytes:Buffer.alloc(4)},
    {address:0x5ec958,bytes:Buffer.alloc(4)},
  ],{aliases:routes});
  const put=(p,v)=>result.memory.writeUInt32LE(v>>>0,p);
  return{...result,put};
}

test('queued light producer retains a stack position pointer while publishing relocated fixed records',()=>{
  const f=fixture(),m=f.memory;[1,-2,3].forEach((v,i)=>m.writeInt32LE(v,STACK+i*4));
  f.put(actual(0x810920),2);const before=Buffer.from(f.span(0x809a10,0x6020));
  appendRawBodyFlash(STACK,20,{memory:m});
  const row=actual(0x8106e0)+2*36;
  assert.deepEqual([0,4,8].map(o=>m.readInt32LE(row+o)),[1,-2,3]);
  assert.equal(m.readUInt32LE(row+12),STACK);assert.equal(m.readUInt32LE(actual(0x810920)),3);
  assert.deepEqual(f.span(0x809a10,0x6020),before);
});

test('light range removal follows raw stack band pointers and puts dirty entries in the relocated queue',()=>{
  const f=fixture(),m=f.memory,light=actual(0x80f520)+64;
  f.put(light+0x14,1); //Sector1, first/last band0, next range terminates.
  f.put(actual(0x80f224),STACK);f.put(STACK,(1<<22)|7);
  const oldRawQueue=Buffer.from(f.span(0x80f41c,12));
  removeDynamicLightRanges(1,{memory:m});
  assert.equal(m.readUInt32LE(STACK),0,'The raw band pointer still addresses the actual stack.');
  assert.equal(m.readUInt32LE(actual(0x80f210)),1);
  assert.equal(m.readInt32LE(actual(0x80f420)),(((7|0x800000)<<7)|1)|0);
  assert.deepEqual(f.span(0x80f41c,12),oldRawQueue);
});

test('dynamic-light queue aging uses relocated known arrays and preserves overlapping original stack bytes',()=>{
  const f=fixture(),m=f.memory;
  f.put(actual(0x80f20c),1);f.put(actual(0x80f210),1);f.put(actual(0x80f420),(2<<29)|37);
  const before=Buffer.from(f.span(0x809a10,0x6020));
  updateDynamicLights(0,{memory:m,scratchBase:0x9000});
  assert.equal(m.readUInt32LE(actual(0x80f420)),(1<<29)|37);
  assert.equal(m.readUInt32LE(actual(0x80f210)),1);
  assert.deepEqual(f.span(0x809a10,0x6020),before);
});

test('type2 attachment table translates fixed slots while its902-independent raw target pointer stays intact',()=>{
  const f=fixture(),m=f.memory;
  f.put(actual(0x80e660)+2*4,STACK);m[STACK+0x94]=1;
  m.writeUInt16LE(0x1003,BODY+0x16a);m.writeUInt16LE(0,BODY+0x16c);
  f.put(actual(0x80f56c)+3*64,123);const rawScalar=m.readUInt32LE(0x80f56c+3*64);
  updateRawType2Attachment(BODY,0x2002,{memory:m});
  assert.equal(m.readUInt32LE(STACK+0x90),246);assert.equal(m.readUInt32LE(actual(0x80e660)+8),STACK);
  assert.equal(m.readUInt32LE(0x80f56c+3*64),rawScalar);
});

test('physics time globals preserve an exempt body pointer whose bits overlap a relocated fixed operand',()=>{
  const f=fixture(),m=f.memory;
  f.put(STACK,4);f.put(actual(0x811180),1);f.put(actual(0x811184),STACK);f.put(actual(0x81118c),32768);
  const views=createPhysicsRuntimeViews({memory:m,bodyStorage:[{address:STACK,length:0x180}],bodyLists:[]});
  const body=views.bodyAt(STACK);
  assert.equal(body.address,STACK);assert.deepEqual(views.timeOptionsFor(body),{timeScaleActive:true,timeScaleQ16:32768,timeScaleExempt:true});
  assert.equal(m.readUInt32LE(STACK),4);assert.equal(m.readUInt32LE(actual(0x811184)),STACK);
});
