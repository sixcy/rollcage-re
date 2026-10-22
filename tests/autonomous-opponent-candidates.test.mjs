import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeAutonomousOpponentTables,measureAutonomousRouteCurvature,measureAutonomousRouteSide,hasAutonomousRouteSideChange,scoreAutonomousOpponentCollision,appendAutonomousOpponentAvoidance,appendAutonomousOpponentFollow,updateAutonomousOpponentCandidates} from '../src/autonomous-opponent-candidates.mjs';
const BODY=0x10000,OTHER=0x14000,MODEL=0x40000,SESSION=0x50000,PACK=0x51000,GROUPS=0x52000,POINTS=0x70000,PROGRESS=0x5b000,OUTPUT=0x60000,RELATIVE=0x61000,STACK=0x9000,FREE=0x8000,RECORDS=0x909300,ROWS=0x91f1e0;
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p),store=(m,p,v)=>v.forEach((x,i)=>put(m,p+i*4,x));
const fixture=()=>{
 const memory=initializeAutonomousOpponentTables(Buffer.alloc(0xa00000));put(memory,0x90b98c,PACK);put(memory,PACK+0x60,GROUPS);put(memory,0x5ecb1c,SESSION);memory[SESSION+0x54d]=2;put(memory,FREE,19);word(memory,MODEL+0x32,20);
 for(let group=0;group<8;group++){const g=GROUPS+group*12;word(memory,g,12);put(memory,g+8,POINTS+group*0x1000);for(let i=0;i<12;i++){const p=POINTS+group*0x1000+i*16;word(memory,p,i*20);word(memory,p+4,group%2?-100:100);}}
 for(const[i,body]of[BODY,OTHER].entries()){
  put(memory,body+0x10,MODEL);word(memory,body+0x65e,i);put(memory,body+0x664,30*65536);word(memory,body+0x668,300);word(memory,body+0xd0,4096);word(memory,body+0xc8,4096);store(memory,body+0x34,[100*65536,0,0]);store(memory,body+0x68,[30*65536,0,0]);word(memory,body+0x6c0,i+1);word(memory,body+0x6c2,3);memory[body+0x718]=i?10:8;
  const record=RECORDS+i*0x30c;put(memory,record,body);put(memory,record+0x54,PROGRESS+i*16);memory[PROGRESS+i*16+5]=i+1;word(memory,record+0x58,3);
 }
 store(memory,RELATIVE,[0,0,30*65536]);put(memory,POINTS+0x1000+3*16+12,2);
 return memory;
};

test('4919d0 leaves output bytes stale when an open point has no predecessor',()=>{
 const memory=fixture();memory.fill(0x55,OUTPUT,OUTPUT+36);assert.equal(measureAutonomousRouteCurvature(1,0,OUTPUT,OUTPUT+12,OUTPUT+24,{memory,scratchBase:STACK}),0);assert.equal(memory.subarray(OUTPUT,OUTPUT+36).toString('hex'),'55'.repeat(36));
});

test('4919d0 retains directional sign from the normalized cross Y component',()=>{
 const memory=fixture();for(let i=0;i<12;i++)word(memory,POINTS+0x1000+i*16+4,i*i);
 const forward=measureAutonomousRouteCurvature(1,5,OUTPUT,OUTPUT+12,OUTPUT+24,{memory,scratchBase:STACK});memory[GROUPS+12+2]=1;
 const reverse=measureAutonomousRouteCurvature(1,5,OUTPUT,OUTPUT+12,OUTPUT+24,{memory,scratchBase:STACK});assert.ok(forward<0);assert.ok(reverse>0);
});

test('493eb0 segment side and493b00 linked-group traversal distinguish opposite sides',()=>{
 const memory=fixture();assert.ok(measureAutonomousRouteSide(1,3,0,BODY+0x34,{memory,scratchBase:STACK})>0);assert.ok(measureAutonomousRouteSide(2,3,0,BODY+0x34,{memory,scratchBase:STACK})<0);
 assert.equal(hasAutonomousRouteSideChange(BODY,{memory,scratchBase:STACK}),1);assert.equal(memory.readUInt16LE(0x7136d2),2);
 for(let i=0;i<12;i++)word(memory,POINTS+0x2000+i*16+4,-100);assert.equal(hasAutonomousRouteSideChange(BODY,{memory,scratchBase:STACK}),0);
});

test('4938f0 applies lane and cross-distance penalties while skipping disabled rows',()=>{
 const memory=fixture();store(memory,RELATIVE,[0,0,0]);put(memory,BODY+0x664,10*65536);put(memory,OTHER+0x664,5*65536);
 for(let i=0;i<3;i++){const row=ROWS+i*52;word(memory,row,i===1?3:2);store(memory,row+4,[65536,0,0]);put(memory,row+44,100);}memory[ROWS+2*52+38]=1;
 scoreAutonomousOpponentCollision(BODY,OTHER,RELATIVE,40,3200,2,{memory});assert.equal(memory.readInt32LE(ROWS+44),-300);assert.equal(memory.readInt32LE(ROWS+52+44),-100);assert.equal(memory.readInt32LE(ROWS+2*52+44),100);
});

test('493610 inserts a lateral type1 candidate using the physical side axis',()=>{
 const memory=fixture();appendAutonomousOpponentAvoidance(RECORDS,RECORDS+0x30c,RELATIVE,100<<16,20,0,3000,FREE,{memory,scratchBase:STACK});
 assert.equal(memory[ROWS+19*52+37],1);assert.equal(memory.readInt32LE(ROWS+19*52+44),31);assert.equal(memory.readInt32LE(FREE),18);assert.equal(memory[0x6e650f],1);assert.deepEqual([0,2,4].map(o=>memory.readInt16LE(0x91f600+o)),[100,0,-100]);
});

test('493610 lead candidate projects opponent velocity with the time-dependent shift',()=>{
 const memory=fixture();appendAutonomousOpponentAvoidance(RECORDS,RECORDS+0x30c,RELATIVE,100<<16,20,100<<16,3000,FREE,{memory,scratchBase:STACK});assert.deepEqual([0,2,4].map(o=>memory.readInt16LE(0x91f600+o)),[580,0,30]);assert.equal(memory[0x91f1c0],4);
});

test('493290 inserts a type2 follow candidate through actual curvature and side queries',()=>{
 const memory=fixture();appendAutonomousOpponentFollow(RELATIVE,100,RECORDS,RECORDS+0x30c,FREE,{memory,scratchBase:STACK});assert.equal(memory[ROWS+19*52+37],2);assert.equal(memory.readInt32LE(ROWS+19*52+44),28);assert.equal(memory.readInt32LE(FREE),18);assert.equal(memory[0x6e650f],1);assert.equal(memory[0x91f1c0],31);
});

test('493290 fallback adds14 only to enabled candidates on the opponent progression group',()=>{
 const memory=fixture();word(memory,ROWS,2);word(memory,ROWS+52,1);word(memory,ROWS+104,2);memory[ROWS+104+38]=1;
 appendAutonomousOpponentFollow(RELATIVE,500,RECORDS,RECORDS+0x30c,FREE,{memory,scratchBase:STACK});assert.equal(memory.readInt32LE(ROWS+44),14);assert.equal(memory.readInt32LE(ROWS+52+44),0);assert.equal(memory.readInt32LE(ROWS+104+44),0);assert.equal(memory.readInt32LE(FREE),19);
});

test('492d80 resets the special pool counter and rejects opponents farther than2000 units',()=>{
 const memory=fixture();store(memory,OTHER+0x34,[2201*65536,0,0]);memory[0x6e650f]=17;put(memory,BODY+0x6ec,0x23);
 updateAutonomousOpponentCandidates(BODY,FREE,{memory,scratchBase:STACK});assert.equal(memory[0x6e650f],0);assert.equal(memory.readInt32LE(FREE),19);assert.equal(memory.readInt32LE(ROWS+19*52+44),0);
});

test('492d80 captures the aggression profile before clearing an aliased special counter',()=>{
 const memory=fixture(),body=0x6e650f-0x6f9;memory.copy(memory,body,BODY,BODY+0x4000);put(memory,RECORDS,body);put(memory,body+0x6f8,7<<12);word(memory,body+0x6fe,50);store(memory,OTHER+0x34,[100*65536,0,30*65536]);
 updateAutonomousOpponentCandidates(body,FREE,{memory,scratchBase:STACK});assert.equal(memory[0x6e650f],1);assert.equal(memory[ROWS+19*52+37],1);assert.equal(memory.readInt32LE(FREE),18);
});
