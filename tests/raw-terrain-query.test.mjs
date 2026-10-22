import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createRawTerrainGrid,queryRawTerrain} from '../src/raw-terrain-query.mjs';
import sqrt from '../src/sqrt-table.json' with {type:'json'};
const BODY=0x10000,RECORD=0x20000,OUT=0x21000,LIST=0x30000,VERTICES=0x40000;
function fixture({type=0,radius=0,output=OUT}={}){
 const memory=Buffer.alloc(0xa00000),put=(p,v)=>memory.writeInt32LE(v|0,p),vector=(p,v)=>v.forEach((x,i)=>put(p+i*4,x)),vertices=[],trace=[];
 for(let row=0;row<3;row++)for(let column=0;column<3;column++)vertices.push([column*32,0,-row*32,0]);vertices.forEach((v,i)=>v.forEach((x,j)=>memory.writeInt16LE(x,VERTICES+i*8+j*2)));
 put(BODY,3);put(BODY+0x154,LIST);memory.writeUInt16LE(1,BODY+0x15c);put(0x90b98c,0x50000);put(0x50000,0x50100);put(0x50100,0x50200);put(0x5020c,2);put(0x90a548,123);
 const packed=type===6?256<<20:768<<10;memory[LIST]=0xb0|type;memory[LIST+1]=0;memory[LIST+2]=0x6a;memory[LIST+3]=2;put(LIST+4,0);put(LIST+8,packed);put(LIST+12,VERTICES+(type===6?3*8:0));
 memory.fill(0xa5,OUT,OUT+36);memory.fill(0x69,0x91e7a0,0x91e7a0+64*40);memory.fill(0x36,0x911c00,0x911c28);vector(RECORD+8,[4096,-8192,-4096]);vector(RECORD+20,[0,16384,0]);put(RECORD+64,radius);
 sqrt.values.forEach((value,i)=>memory.writeUInt16LE(value,0x5eb290+i*2));memory.writeFloatLE(1,0x5dc774);memory.writeFloatLE(4096,0x5dca88);
 const views=createPhysicsRuntimeViews({memory,bodyStorage:[{address:BODY,length:0x4000}],bodyLists:[{address:0x1000,capacity:1}],candidateMapping:{terrainVerticesFor:()=>VERTICES}}),candidate=views.candidateAt(LIST),grid=createRawTerrainGrid({sectors:[{index:0,rows:2,columns:2,vertices}]},()=>VERTICES,{memory});
 return {memory,put,vector,candidate,trace,query:(parameter=65536)=>queryRawTerrain(BODY,RECORD,output,parameter,{memory,views,grid,roundingMode:'nearest-even',trace:value=>trace.push(value)})};
}

test('filtered wall resets and marks the same native candidate before writing only final flags',()=>{
 const f=fixture({type:6}),before=Buffer.from(f.memory.subarray(OUT,OUT+36));assert.equal(f.query(0x1010000),0x1010000);
 assert.equal(f.candidate.flagsByte0,0xb6);assert.equal(f.candidate.byte2,255);before.writeInt32LE(0,28);assert.deepEqual(f.memory.subarray(OUT,OUT+36),before);
 assert.deepEqual(f.trace,[{address:LIST,width:8,value:0xa6},{address:LIST+2,width:8,value:255},{address:LIST,width:8,value:0xb6},{address:OUT+28,width:32,value:0}]);
});

test('ray exterior rejection retains edge byte and the original polygon cross globals',()=>{
 const f=fixture();f.vector(RECORD+8,[-512,-8192,-4096]);assert.equal(f.query(),65536);assert.equal(f.memory.readInt32LE(OUT+28),0);assert.equal(f.candidate.byte2,3);assert.equal(f.candidate.flagsByte0,0xb0);
 assert.ok(f.trace.some(value=>value.address===0x91d448));assert.ok(f.trace.some(value=>value.address===LIST+2&&value.value===3));
});

test('sphere plane cache stores preserve untouched padding and precede accepted output stores',()=>{
 const f=fixture({radius:512});assert.equal(f.query(),30720);assert.equal(f.memory.readInt32LE(OUT+28),1);assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(OUT+o)),[4096,0,-4096]);
 assert.equal(f.memory.readInt32LE(0x91e7a0+28),0x69696969);assert.equal(f.memory.readInt32LE(0x91e7a0+32),0x69696969);assert.equal(f.memory.readInt32LE(0x91e7a0+36),30720);
 const stores=f.trace.filter(value=>value.address>=0x91e7a0&&value.address<0x91e7a0+40).map(value=>value.address-0x91e7a0);assert.deepEqual(stores,[4,12,16,20,24,0,8,36]);
 const output=f.trace.filter(value=>value.address>=OUT&&value.address<OUT+36).map(value=>value.address-OUT);assert.deepEqual(output,[12,16,20,24,0,4,8,32,28]);
});

test('accepted border writes point, anchor, normal and current clock with native widths',()=>{
 const f=fixture({type:6});f.vector(RECORD+8,[4096,-8192,-4096]);f.vector(RECORD+20,[-8192,0,0]);assert.equal(f.query(),32768);
 assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(0x911c00+o)),[65536,0,0]);assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(0x911c10+o)),[0,-8192,-4096]);assert.equal(f.memory.readInt32LE(0x911c0c),123);assert.equal(f.memory.readUInt16LE(0x911c26),0x3636);
 assert.deepEqual(f.trace.filter(value=>value.address>=0x911c00&&value.address<0x911c28).map(({address,width})=>[address-0x911c00,width]),[[16,32],[20,32],[24,32],[32,16],[34,16],[36,16],[0,32],[4,32],[8,32],[12,32]]);
});

test('aliased output uses the entry query coordinates before overwriting their native bytes',()=>{
 const f=fixture({radius:512,output:RECORD+8});assert.equal(f.query(),30720);assert.deepEqual([0,4,8].map(o=>f.memory.readInt32LE(RECORD+8+o)),[4096,0,-4096]);assert.equal(f.memory.readInt32LE(RECORD+8+28),1);
});

test('zero-bound overlap consults stale output distance instead of accepting a new ray contact',()=>{
 const f=fixture();f.vector(RECORD+8,[4096,0,-4096]);f.vector(RECORD+20,[0,0,0]);f.put(OUT+24,-1);assert.equal(f.query(0),0);assert.equal(f.memory.readInt32LE(OUT+28),0);assert.equal(f.memory.readInt32LE(OUT+24),-1);
 assert.equal(f.trace.some(value=>value.address===OUT+24),false);
});

test('exterior sphere contact uses actual finite-edge and normalization scratch writes',()=>{
 const f=fixture({radius:1024});f.vector(RECORD+8,[4096,-4096,512]);f.vector(RECORD+20,[0,8192,0]);const fraction=f.query();assert.ok(fraction>=0&&fraction<65536);assert.equal(f.memory.readInt32LE(OUT+28),1);
 assert.ok(f.trace.some(value=>value.address===0x91d45c));assert.ok(f.trace.some(value=>value.address===0x91d460&&value.value===0));assert.ok(f.trace.some(value=>value.address===0x91d360&&value.width===32));
});
