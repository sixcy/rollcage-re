import test from 'node:test';
import assert from 'node:assert/strict';
import {appendAutonomousRouteCandidates,buildAutonomousRouteCandidates} from '../src/autonomous-candidate-builder.mjs';

const BODY=0x10000,PACK=0x20000,GROUPS=0x21000,POINTS=0x30000,FREE=0x8000,STACK=0x9000,ROWS=0x91f1e0;
const put=(memory,address,value)=>memory.writeInt32LE(value|0,address);
const point=(group,index=0)=>POINTS+group*0x2000+index*16;
const fixture=()=>{
  const memory=Buffer.alloc(0xa00000);put(memory,0x90b98c,PACK);put(memory,PACK+0x60,GROUPS);put(memory,FREE,19);memory.fill(0xa5,ROWS,ROWS+20*52);
  for(let group=0;group<8;group++){memory.writeUInt16LE(8,GROUPS+group*12);put(memory,GROUPS+group*12+8,point(group));}
  return memory;
};
const append=(memory,group,index,budget,tier=2)=>appendAutonomousRouteCandidates(group,index,FREE,budget,tier,{memory,scratchBase:STACK});

test('421260 writes descending rows, preserves zero tags and marks an open endpoint',()=>{
  const memory=fixture();memory.writeUInt16LE(2,GROUPS+12);memory[point(1)+10]=1;memory[point(1,1)+10]=1;memory[point(1,1)+8]=3;
  append(memory,1,0,1);
  assert.equal(memory.readInt32LE(FREE),17);assert.equal(memory.readUInt16LE(ROWS+19*52),1);assert.equal(memory[ROWS+19*52+2],0);
  assert.equal(memory[ROWS+19*52+38],1);assert.equal(memory.readUInt16LE(ROWS+19*52+42),0xa5a5);
  assert.equal(memory[ROWS+18*52+2],1);assert.equal(memory[ROWS+18*52+36],0);assert.equal(memory.readUInt16LE(ROWS+18*52+38),0x101);assert.equal(memory.readUInt16LE(ROWS+18*52+42),3);
});

test('421260 reduces low-tier lookahead and clamps each next point independently',()=>{
  const memory=fixture();memory[point(1)+10]=5;memory[point(1,1)+10]=1;
  append(memory,1,0,7,1);
  assert.equal(memory[ROWS+19*52+36],4);assert.equal(memory[ROWS+18*52+36],1);assert.equal(memory[ROWS+17*52+36],0);assert.equal(memory.readInt32LE(FREE),16);
});

test('421260 reverse cyclic traversal wraps and leaves preexisting row fields alone',()=>{
  const memory=fixture();const group=GROUPS+12;memory[group+2]=1;memory[group+4]=1;memory.writeUInt16LE(3,group);
  for(let i=0;i<3;i++)memory[point(1,i)+10]=3;
  append(memory,1,0,2);
  assert.deepEqual([19,18,17].map(i=>memory[ROWS+i*52+2]),[0,2,1]);assert.equal(memory.readInt32LE(FREE),16);assert.equal(memory.readInt32LE(ROWS+19*52+44),0xa5a5a5a5|0);
});

test('421260 negative free index is inert and zero capacity writes only the final row',()=>{
  const memory=fixture();put(memory,FREE,-1);const before=Buffer.from(memory.subarray(ROWS,ROWS+20*52));append(memory,1,0,15);assert.deepEqual(memory.subarray(ROWS,ROWS+20*52),before);
  put(memory,FREE,0);memory[point(1)+10]=15;append(memory,1,0,15);assert.equal(memory.readInt32LE(FREE),-1);assert.equal(memory.readUInt16LE(ROWS),1);assert.deepEqual(memory.subarray(ROWS+52,ROWS+20*52),before.subarray(52));
});

test('4210b0 expands both links, remembers shared groups, and terminates route cycles',()=>{
  const memory=fixture();put(memory,point(1)+12,2|(3<<14));put(memory,point(2)+12,4);put(memory,point(3)+12,4);put(memory,point(4)+12,1);
  assert.equal(buildAutonomousRouteCandidates(BODY,1,0,{memory,scratchBase:STACK}),15);
  assert.deepEqual([19,18,17,16].map(i=>memory.readUInt16LE(ROWS+i*52)),[1,2,3,4]);
  assert.deepEqual([0,1,2,3,4].map(i=>memory.readUInt16LE(STACK-0x84+i*2)),[1,2,3,4,0]);
});

test('4210b0 stores point indices as bytes before link discovery',()=>{
  const memory=fixture();memory.writeUInt16LE(512,GROUPS+12);put(memory,point(1,44)+12,2);put(memory,point(1,300)+12,3);
  assert.equal(buildAutonomousRouteCandidates(BODY,1,300,{memory,scratchBase:STACK}),17);
  assert.equal(memory[ROWS+19*52+2],44);assert.equal(memory.readUInt16LE(ROWS+18*52),2);
});

test('4210b0 group0 creates candidates while suppressing all link expansion',()=>{
  const memory=fixture();put(memory,point(0)+12,2|(3<<14));
  assert.equal(buildAutonomousRouteCandidates(BODY,0,0,{memory,scratchBase:STACK}),18);
  assert.equal(memory.readUInt16LE(ROWS+19*52),0);assert.equal(memory.readUInt16LE(STACK-0x82),0);
});
