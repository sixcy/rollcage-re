import test from 'node:test';
import assert from 'node:assert/strict';
import {BodySpatialRegistry,createBodySpatialSelector} from '../src/body-spatial.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';

test('spatial lists preserve sparse pool IDs, head order and stale tagged buckets',()=>{
 const bucket={headId:0},other={headId:0},a={},b={},c={};let target=bucket,outside=false;
 const registry=new BodySpatialRegistry([{body:a,poolOffset:0},{body:b,poolOffset:512},{body:c,poolOffset:1408}],()=>({bucket:target,outside}));
 registry.insert(a);registry.insert(b);outside=true;registry.insert(c);
 assert.equal(bucket.headId,12);assert.equal(c.spatialNextId,5);assert.equal(b.spatialPreviousId,12);assert.equal(a.spatialPreviousId,5);
 registry.remove(b);assert.equal(c.spatialNextId,1);assert.equal(a.spatialPreviousId,12);assert.equal(b.spatialBucket,bucket);
 registry.remove(c);assert.equal(bucket.headId,1);assert.equal(a.spatialPreviousId,0);assert.equal(c.spatialOutside,true);
 target=other;registry.insert(c);assert.equal(other.headId,12);registry.remove(a);assert.equal(bucket.headId,0);
 assert.deepEqual([a.spatialNextId,a.spatialPreviousId],[0,0]);
});
test('spatial registration connects parsed positions to explicit runtime buckets',()=>{
 const rowTable=288,mapBase=rowTable+4096,nodeBase=mapBase+4,data=Buffer.alloc(nodeBase+24);data.write('GFXM');data.writeUInt32LE(1,0x10);data.writeUInt32LE(2,0xc);data.writeUInt32LE(rowTable,0x24);data.writeUInt32LE(mapBase,0x6c);data.writeUInt32LE(nodeBase,0x68);
 for(let row=0;row<256;row++)for(let span=0;span<6;span++)data.writeUInt16LE(0xff,rowTable+row*16+span*2);
 const row=rowTable+128*16;data.writeUInt16LE(128|(128<<8),row);data.writeUInt32LE(1,row+12);data.writeUInt16LE(0,mapBase);data.writeUInt32LE(0x80000000,nodeBase+4);data.writeUInt32LE(40<<13,nodeBase+12);
 const index=parseSpatialIndex(data),buckets=[{headId:0},{headId:0}],body={position:[0,0,0]},registry=new BodySpatialRegistry([{body,poolOffset:128}],createBodySpatialSelector(index,buckets));
 registry.insert(body);assert.equal(body.spatialBucket,buckets[1]);assert.equal(body.spatialOutside,false);assert.equal(buckets[1].headId,2);
 registry.handlers().removeSpatial(body);body.position=[-1,9*0x1000000,0];registry.handlers().insertSpatial(body);assert.equal(body.spatialBucket,buckets[0]);assert.equal(body.spatialOutside,true);assert.equal(buckets[1].headId,0);
});
test('spatial registration requires explicit valid pool addresses and linked IDs',()=>{
 const body={},bucket={headId:9};assert.throws(()=>new BodySpatialRegistry([{body,poolOffset:1}],()=>({bucket,outside:false})),/aligned/);
 const registry=new BodySpatialRegistry([{body,poolOffset:0}],()=>({bucket,outside:false}));assert.throws(()=>registry.insert(body),/no explicit/);assert.equal(body.spatialBucket,undefined);assert.equal(bucket.headId,9);
 assert.throws(()=>registry.idFor({}),/explicit/);assert.throws(()=>createBodySpatialSelector({available:false},[]),/parsed/);
});
