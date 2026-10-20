import test from 'node:test';
import assert from 'node:assert/strict';
import {updateBodyAttachments,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
const offset=address=>address-ATTACHMENT_SCRATCH_BASE;
const body=(extra={})=>({position:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],rotationPaddingD6:0xbeef,attachmentHandles:[0,0,0,0,0],points:Buffer.alloc(40),...extra});
const point=(target,index,position,tag=0)=>{position.forEach((value,axis)=>target.points.writeInt16LE(value,index*8+axis*2));target.points.writeUInt16LE(tag,index*8+6);};
const environment=(extra={})=>({pointsFor:target=>target.points,type1Records:Buffer.alloc(8*8,0xa5),type2Objects:Array.from({length:8},()=>({bytes:Buffer.alloc(32)})),type4Records:Buffer.alloc(8*12,0xa5),scratch:Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH,0xa5),roundingMode:'nearest-even',...extra});
const run=(target,options=environment())=>updateBodyAttachments({entries:[target],count:1},options);
const read=(bytes,p=0)=>[0,2,4].map(axis=>bytes.readInt16LE(p+axis));

test('zero queue count leaves every scratch byte and retained queue entry untouched',()=>{
 const target=body(),queue={entries:[target],count:0},options=environment({pointsFor:()=>{throw Error('should not run');}}),before=Buffer.from(options.scratch);
 assert.equal(updateBodyAttachments(queue,options).processedBodies,0);assert.equal(queue.entries[0],target);assert.equal(queue.count,0);assert.deepEqual(options.scratch,before);
});

test('type1 transforms native point records, copies padding/tag bytes and sets its mark word',()=>{
 const target=body({position:[10*65536+65535,20*65536,30*65536],attachmentHandles:[0x1002,0,0,0,0]}),options=environment();point(target,0,[2,3,4],0xcafe);
 const expected=Buffer.from(options.type1Records);[12,23,34,1].forEach((value,index)=>expected.writeUInt16LE(value,16+index*2));
 const report=run(target,options);assert.equal(report.type1Writes,1);assert.deepEqual(options.type1Records,expected);
 assert.equal(options.scratch.readUInt16LE(offset(0x91d372)),0xbeef);assert.equal(options.scratch.readUInt16LE(offset(0x91d3ea)),0xcafe);
 assert.deepEqual([0,4,8].map(axis=>options.scratch.readInt32LE(offset(0x91d374)+axis)),[10,20,30]);
 for(const address of [0x91cdbc,0x91cdcc,0x91cddc,0x91cdec])assert.equal(options.scratch.readUInt32LE(offset(address)),0xa5a5a5a5);
});

test('a zero high nibble terminates even with nonzero low bits and preserves stale point/output scratch',()=>{
 const target=body({attachmentHandles:[0x0fff,0x1001,0,0,0]}),options=environment(),before=Buffer.from(options.type1Records);
 const result=run(target,options);assert.equal(result.transformedPoints,0);assert.deepEqual(options.type1Records,before);
 assert.equal(options.scratch.readUInt32LE(offset(0x91d3e4)),0xa5a5a5a5);assert.equal(options.scratch.readUInt32LE(offset(0x91d448)),0xa5a5a5a5);
});

test('unsupported handle types still transform points and retain all output tables',()=>{
 const target=body({attachmentHandles:[0x3000,0,0,0,0]}),options=environment(),first=Buffer.from(options.type1Records),fourth=Buffer.from(options.type4Records);point(target,0,[-2,3,4]);
 assert.equal(run(target,options).transformedPoints,1);assert.deepEqual([0,4,8].map(axis=>options.scratch.readInt32LE(offset(0x91d448)+axis)),[-2,3,4]);
 assert.deepEqual(options.type1Records,first);assert.deepEqual(options.type4Records,fourth);
});

test('the processor transforms at most five handles and type4 retains its six trailing bytes',()=>{
 const target=body({attachmentHandles:[0x4000,0x4001,0x4002,0x4003,0x4004,0x4005]}),options=environment();for(let index=0;index<5;index++)point(target,index,[index+1,2,3]);
 assert.equal(run(target,options).type4Writes,5);for(let index=0;index<5;index++){assert.deepEqual(read(options.type4Records,index*12),[index+1,2,3]);assert.ok(options.type4Records.subarray(index*12+6,index*12+12).every(value=>value===0xa5));}
 assert.ok(options.type4Records.subarray(60,72).every(value=>value===0xa5));
});

test('explicit x87 rounding modes control half-coordinate ties',()=>{
 for(const [roundingMode,expected]of [['nearest-even',[0,0,2]],['toward-zero',[0,0,1]],['down',[0,-1,1]],['up',[1,0,2]]]){
  const target=body({rotation:[2048,0,0,0,2048,0,0,0,2048],attachmentHandles:[0x4000,0,0,0,0]}),options=environment({roundingMode});point(target,0,[1,-1,3]);run(target,options);assert.deepEqual(read(options.type4Records),expected);
 }
});

test('target stores truncate to shorts while the transform retains complete integer coordinates',()=>{
 const target=body({rotation:[32767,0,0,0,4096,0,0,0,4096],attachmentHandles:[0x4000,0,0,0,0]}),options=environment();point(target,0,[32767,0,0]);
 run(target,options);const x=options.scratch.readInt32LE(offset(0x91d448));assert.equal(x,262128);assert.equal(options.type4Records.readUInt16LE(0),x&65535);
});

test('type2 skips spatial callbacks for low-byte movement and rereads coordinates after removal',()=>{
 const low=body({attachmentHandles:[0x2000,0,0,0,0]}),lowOptions=environment();point(low,0,[2,3,4]);lowOptions.type2Objects[0].bytes.writeInt16LE(1,0x10);
 assert.equal(run(low,lowOptions).spatialMoves,0);assert.deepEqual(read(lowOptions.type2Objects[0].bytes,0x10),[2,3,4]);
 const target=body({attachmentHandles:[0x2001,0,0,0,0]}),options=environment(),log=[];point(target,0,[256,0,0]);options.type2Objects[1].bytes.writeInt16LE(255,0x10);
 options.handlers={removeTarget:item=>{log.push(['remove',read(item.bytes,0x10)]);item.bytes.writeInt16LE(-256,0x12);},insertTarget:(item,positionQ16)=>log.push(['insert',positionQ16])};
 assert.equal(run(target,options).spatialMoves,1);assert.deepEqual(log,[['remove',[256,0,0]],['insert',[256*65536,-256*65536,0]]]);
});

test('spatial callbacks append live queue entries and retained slots survive final count clearing',()=>{
 const first=body({attachmentHandles:[0x2000,0,0,0,0]}),second=body({position:[10*65536,0,0],attachmentHandles:[0x1001,0,0,0,0]}),stale=body(),queue={entries:[first,stale],count:1},options=environment();point(first,0,[256,0,0]);point(second,0,[5,0,0]);
 options.handlers={removeTarget:()=>{queue.entries[queue.count++]=second;},insertTarget:()=>{}};
 const result=updateBodyAttachments(queue,options);assert.equal(result.processedBodies,2);assert.equal(queue.count,0);assert.equal(queue.entries[1],second);assert.deepEqual(read(options.type1Records,8),[15,0,0]);
});

test('queue shrink does not interrupt remaining handles of the current body and scratch writes remain live',()=>{
 const first=body({attachmentHandles:[0x2000,0x1001,0,0,0]}),second=body({attachmentHandles:[0x1002,0,0,0,0]}),queue={entries:[first,second],count:2},options=environment();point(first,0,[256,0,0]);point(first,1,[1,0,0]);
 options.handlers={removeTarget:()=>{queue.count=0;options.scratch.writeFloatLE(2,offset(0x91cdc0));},insertTarget:()=>{}};
 const result=updateBodyAttachments(queue,options);assert.equal(result.processedBodies,1);assert.equal(result.transformedPoints,2);assert.deepEqual(read(options.type1Records,8),[2,0,0]);assert.ok(options.type1Records.subarray(16,24).every(value=>value===0xa5));
});
