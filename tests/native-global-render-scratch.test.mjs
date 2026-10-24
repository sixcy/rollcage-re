import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameMemory} from '../tools/lib/native-frame-memory.mjs';
import {nativeGlobalAddress} from '../src/native-global-address.mjs';
import {updateRawBodyAttachments,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
import {transformAuthoredAttachmentPoint} from '../src/track-object-metadata.mjs';
import {emitBodyEffectBurst} from '../src/body-retirement.mjs';
import {applyPlacedModelEffectDamage} from '../src/placed-model-effect-update.mjs';

const DELTA=0x540000,START=0x91cd60,END=0x91d360,BODY=START,MODEL=0x91ce80,POINT=MODEL+0x100,OUTPUT=0x1a0000;
const actual=p=>p+DELTA;
function fixture(){
  //Constructed sparse collision: real body/model/point pointer bits occupy
  //the old preferred global range. Only fixed operands may be translated.
  const scratchEnd=ATTACHMENT_SCRATCH_BASE+ATTACHMENT_SCRATCH_LENGTH;
  const aliases=[{address:START,targetAddress:actual(START),length:scratchEnd-START},{address:0x902040,targetAddress:actual(0x902040),length:4},
    {address:0x811180,targetAddress:0x811180,length:4}];
  const rows=[{address:BODY,bytes:Buffer.alloc(0x400,0x69)},{address:actual(START),bytes:Buffer.alloc(scratchEnd-START,0x35)},
    {address:actual(0x902040),bytes:Buffer.alloc(4)},{address:0x6e6ba0,bytes:Buffer.alloc(4)},{address:0x5dc5f4,bytes:Buffer.alloc(4)},
    {address:0x90b690,bytes:Buffer.alloc(8,0x71)},{address:OUTPUT,bytes:Buffer.alloc(8,0x72)},{address:0x8f00,bytes:Buffer.alloc(0x200,0x73)},
    {address:0x811180,bytes:Buffer.alloc(4)},{address:0x9207e4,bytes:Buffer.alloc(4)},{address:0x920800,bytes:Buffer.alloc(16)}];
  const f=createNativeFrameMemory(rows,{aliases}),m=f.memory,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  put(BODY+0x10,MODEL);put(actual(0x902040),BODY);put(0x6e6ba0,1);m.writeFloatLE(1/4096,0x5dc5f4);
  [4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>m.writeInt16LE(v,BODY+0xc4+i*2));m.writeUInt16LE(0xabcd,BODY+0xd6);
  [10,20,30].forEach((v,i)=>put(BODY+0x34+i*4,v<<16));
  m.writeUInt16LE(0x1001,BODY+0x16a);m.writeUInt16LE(0x100,MODEL+0x4c); //Second handle has type0 and terminates.
  [2,-3,4].forEach((v,i)=>m.writeInt16LE(v,POINT+i*2));m.writeUInt16LE(0xface,POINT+6);
  return{...f,m,put};
}

test('raw attachment transform uses translated complete scratch while body/model/point pointers remain actual',()=>{
  const f=fixture(),before=Buffer.from(f.span(BODY,0x400));
  const report=updateRawBodyAttachments({memory:f.m,roundingMode:'nearest-even',x87PrecisionBits:24});
  assert.equal(report.transformedPoints,1);assert.equal(report.type1Writes,1);
  assert.deepEqual([0,2,4].map(o=>f.m.readInt16LE(0x90b690+o)),[12,17,34]);
  assert.equal(f.m.readUInt16LE(0x90b696),1);assert.deepEqual(f.span(BODY,0x400),before);
  assert.equal(f.m.readFloatLE(actual(0x91cdc0)),1);assert.equal(f.m.readFloatLE(actual(0x91cdb0)),10);
  assert.equal(f.m.readUInt16LE(0x91d36a),0,'Exclusive-end words still use the existing legacy image alias.');
  assert.equal(nativeGlobalAddress(f.m,ATTACHMENT_SCRATCH_BASE),actual(ATTACHMENT_SCRATCH_BASE));
  assert.throws(()=>nativeGlobalAddress(f.m,END),/outside the explicitly migrated domain/);
  assert.equal(f.span(actual(ATTACHMENT_SCRATCH_BASE),ATTACHMENT_SCRATCH_LENGTH).length,ATTACHMENT_SCRATCH_LENGTH);
});

test('authored attachment caller preserves raw actor/point pointers and relative scratch offsets across the exclusive end',()=>{
  const f=fixture(),before=Buffer.from(f.span(BODY,0x400));
  transformAuthoredAttachmentPoint(BODY,POINT,OUTPUT,{memory:f.m,scratchBase:0x9000,roundingMode:'nearest-even',x87PrecisionBits:24});
  assert.deepEqual([0,2,4].map(o=>f.m.readInt16LE(OUTPUT+o)),[12,17,34]);assert.deepEqual(f.span(BODY,0x400),before);
  assert.equal(f.m.readUInt32LE(0x8ffc),30,'Scalar actor values stored on stack are not rebased.');
  assert.equal(f.m.readInt32LE(actual(0x91d448)),12);assert.equal(f.m.readInt32LE(actual(0x91d44c)),17);assert.equal(f.m.readInt32LE(actual(0x91d450)),34);
});

test('effect publication translates only fixed destinations and keeps a raw input pointer with identical preferred bits',()=>{
  const f=fixture(),position=0x91cd80;[100,-200,300].forEach((v,i)=>f.put(position+i*4,v));const before=Buffer.from(f.span(BODY,0x400));
  emitBodyEffectBurst(position,0,2,0x10800,0,{memory:f.m,scratchBase:0x9000});
  assert.deepEqual([0,4,8].map(o=>f.m.readInt32LE(actual(0x91cd80+o))),[100,-200,300]);
  assert.deepEqual([0,4,8].map(o=>f.m.readInt32LE(actual(0x91cd6c+o))),[100,-200,300]);
  assert.equal(f.m.readInt32LE(actual(0x91cd8c)),12);assert.equal(f.m.readInt32LE(actual(0x91cd60)),1);assert.deepEqual(f.span(BODY,0x400),before);
});

test('placed-effect fixed-address array reads translated origin words without treating arbitrary pointers as globals',()=>{
  const f=fixture();[1,2,3].forEach((v,i)=>f.put(actual(0x91cd80+i*4),v<<16));f.put(actual(0x91cd8c),4);f.put(actual(0x91cd90),1);
  f.put(0x9207e4,1);[1,2,3].forEach((v,i)=>f.m.writeInt16LE(v,0x920800+i*2));f.m[0x920806]=4;
  const before=Buffer.from(f.span(BODY,0x400));applyPlacedModelEffectDamage({memory:f.m});
  assert.equal(f.m[0x920806],0);assert.deepEqual(f.span(BODY,0x400),before);
});
