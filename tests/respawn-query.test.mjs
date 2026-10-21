import test from 'node:test';
import assert from 'node:assert/strict';
import {BodyShapePool} from '../src/body-shape-registration.mjs';
import {probeRespawnPlacementBytes,queryRespawnObstruction} from '../src/respawn-query.mjs';
const U=65536,put=(bytes,p,vector)=>vector.forEach((value,index)=>bytes.writeInt32LE(value,p+index*4));
function fixture(count=2,type=7){
 const source={bytes:Buffer.alloc(0x4000,0xa5)},clone={bytes:Buffer.alloc(0x4000,0x36)},pool=new BodyShapePool(Buffer.alloc(72*32),Array.from({length:32},(_,index)=>index));
 source.bytes.writeInt32LE(type,0);source.bytes.writeInt8(count,0x10c);source.bytes.writeInt32LE(0,0x118);put(source.bytes,0x34,[0,0,0]);put(source.bytes,0x68,[0,0,0]);put(source.bytes,0xb8,[0,0,0]);[4096,0,0,0,4096,0,0,0,4096].forEach((value,index)=>source.bytes.writeInt16LE(value,0xc4+index*2));
 for(let index=0;index<=count;index++){const {id,record}=pool.allocate();source.bytes[0x140+index]=id;record.writeInt32LE(512,0x40);}
 return {source,clone,pool};
}
const noHit=(record,body,bound,output)=>{output.flags=0;};

test('temporary placement shapes are freed while copied pool records and stale clone tail remain',()=>{
 const {source,clone,pool}=fixture(),before=Buffer.from(source.bytes),count=pool.allocatedCount,freeTop=pool.freeTop,output={value:99},state={candidates:[]};let tested=false;
 const result=probeRespawnPlacementBytes(source,[U,2*U,3*U],{pool,clone,mode:1,output,terrainState:state,handlers:{lookup:()=>({outside:true}),appendTerrain:()=>assert.fail(),appendModels:()=>assert.fail(),testGeometry:body=>{tested=true;assert.equal(body,clone);assert.equal(pool.allocatedCount,count+3);assert.equal(clone.bytes.readInt32LE(0x34),U);return 0;}}});
 assert.equal(result,0);assert.equal(tested,true);assert.equal(output.value,-1);assert.equal(pool.allocatedCount,count);assert.equal(pool.freeTop,freeTop);assert.deepEqual(source.bytes,before);assert.equal(clone.bytes[0x180],0x36);assert.notEqual(clone.bytes[0x140],source.bytes[0x140]);
});

test('quaternion conversion can update the source matrix before cloning without touching its padding',()=>{
 const {source,clone,pool}=fixture(),quaternion=Buffer.alloc(16);quaternion.writeInt32LE(U,0);source.bytes.fill(0x12,0xc4,0xd8);
 probeRespawnPlacementBytes(source,[0,0,0],{pool,clone,quaternion,rotation:source.bytes.subarray(0xc4,0xd6),mode:1,output:{value:0},terrainState:{candidates:[]},handlers:{lookup:()=>({outside:true}),appendTerrain:()=>{},appendModels:()=>{},testGeometry:()=>0}});
 assert.equal(source.bytes.readInt16LE(0xc4),4096);assert.equal(source.bytes.readInt16LE(0xc6),0);assert.equal(source.bytes.readUInt16LE(0xd6),0x1212);assert.equal(clone.bytes.readUInt16LE(0xd6),0x1212);
});

test('region callbacks share live count and nearest fields with the raw clone; type4 skips model append',()=>{
 const {source,clone,pool}=fixture(1,4),state={candidates:[]},output={value:9},seen=[];
 const result=probeRespawnPlacementBytes(source,[0,0,0],{pool,clone,mode:2,output,terrainState:state,handlers:{lookup:()=>({outside:false,regions:[0,1]}),appendTerrain:(body,sphere,region,center,radius,scratch)=>{seen.push([scratch.count,sphere.readInt32LE(0x40),radius]);scratch.count++;scratch.closestId=123+region;scratch.closestDistanceSquared=64;},appendModels:()=>assert.fail(),testGeometry:()=>0}});
 assert.equal(result,1);assert.deepEqual(seen,[[0,8000,31*31],[1,8000,31*31]]);assert.equal(output.value,124);assert.equal(clone.bytes.readUInt16LE(0x15c),2);assert.equal(clone.bytes.readUInt32LE(0x158),0x70ed50);
});

test('mode1 checks only the aggregate and static contact returns before model or body screening',()=>{
 const {source,pool}=fixture(),calls=[],aggregate=source.bytes[0x142];
 const result=queryRespawnObstruction(source,source,pool,{mode:1,physicalGroup:{bodies:[source]},output:{flags:0},terrainQuery:(record,body,bound,out)=>{calls.push([record.byteOffset-pool.records.byteOffset,bound]);out.flags=2;},modelQuery:()=>assert.fail()});
 assert.equal(result,1);assert.deepEqual(calls,[[aggregate*72,0]]);
});

test('mode0 with a single shape skips static queries, while invalid zero-count traversal is bounded explicitly',()=>{
 const {source,pool}=fixture(1);assert.equal(queryRespawnObstruction(source,source,pool,{mode:0,physicalGroup:{bodies:[source]},terrainQuery:()=>assert.fail(),modelQuery:()=>assert.fail(),output:{flags:0}}),0);
 source.bytes.writeInt8(0,0x10c);assert.throws(()=>queryRespawnObstruction(source,source,pool,{mode:0,physicalGroup:{bodies:[]},terrainQuery:noHit,modelQuery:noHit,output:{flags:0},maxShapeQueries:1}),/workflow budget/);
});

test('logical displacement shifts preserve directional screening and the asymmetric vertical polynomial',()=>{
 const {source,pool}=fixture(1),other={bytes:Buffer.from(source.bytes)},options={mode:0,physicalGroup:{bodies:[source,other]},terrainQuery:noHit,modelQuery:noHit,output:{flags:0}};
 put(other.bytes,0x34,[-U,0,0]);assert.equal(queryRespawnObstruction(source,source,pool,options),1);
 put(other.bytes,0x34,[U,0,0]);assert.equal(queryRespawnObstruction(source,source,pool,options),0);
 put(other.bytes,0x34,[0,-10*U,0]);assert.equal(queryRespawnObstruction(source,source,pool,options),1);
 put(other.bytes,0x34,[0,0,-10*U]);assert.equal(queryRespawnObstruction(source,source,pool,options),0);
});

test('pool release swaps the last active ID, preserves record bytes and rejects a duplicate free',()=>{
 const pool=new BodyShapePool(Buffer.alloc(72*4,0xa5),[0,1,2,3]),a=pool.allocate().id,b=pool.allocate().id,c=pool.allocate().id,before=Buffer.from(pool.records);pool.release(b);
 assert.equal(pool.activeIds[1],c);assert.equal(pool.reverseIndices[c],1);assert.equal(pool.activeIds[0],a);assert.equal(pool.allocate().id,b);pool.release(b);assert.throws(()=>pool.release(b),/active pool ID/);assert.deepEqual(pool.records,before);
});
