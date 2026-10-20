import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBodyCandidateGroups} from '../src/body-candidate-groups.mjs';
const group=(bodies=[],count=0,spatialBucket=null)=>({bodies,count,spatialBucket});
const body=(bucket,changes={})=>({flags:0x803,collisionFlags:0,collisionGroup130:null,spatialBucket:bucket,position:[0,0,0],...changes});

test('candidate grouping keeps nearby bodies in separate groups and deduplicates physical pointers',()=>{
 const bucket={headId:1},a=body(bucket),b=body(bucket),context={count:0,groups:[group(),group(),group()]};
 assert.equal(buildBodyCandidateGroups([a,b,a],context),context);
 assert.equal(context.count,2);assert.deepEqual(context.groups.map(value=>value.count),[1,1,0]);
 assert.equal(context.groups[0].bodies[0],a);assert.equal(context.groups[1].bodies[0],b);
 assert.equal(a.collisionGroup130,context.groups[0]);assert.equal(b.collisionGroup130,context.groups[1]);
 assert.equal(a.collisionFlags,0x1000000);assert.equal(b.collisionFlags,0x1000000);
});

test('candidate eligibility checks flags and nonempty spatial body list',()=>{
 const bucket={headId:8},disabled=body(bucket,{flags:0x8803}),unflagged=body(bucket,{flags:3}),type4=body(bucket,{flags:0x804}),marked=body(bucket,{collisionFlags:0x1000000}),empty=body({headId:0}),accepted=body(bucket,{flags:0x807,collisionFlags:0x40});
 const context={count:0,groups:[group(),group()]};buildBodyCandidateGroups([disabled,unflagged,type4,marked,empty,accepted],context);
 assert.equal(context.count,1);assert.equal(context.groups[0].bodies[0],accepted);assert.equal(accepted.collisionFlags,0x1000040);
 for(const skipped of [disabled,unflagged,type4,marked,empty])assert.equal(skipped.collisionGroup130,null);
});

test('reusing group storage clears only counts and buckets while preserving old body slots',()=>{
 const bucket={headId:1},old=body(bucket),a=body(bucket),stale=body(bucket),groups=[group([old,stale],2,bucket),group([stale],1,bucket),group([old],0,bucket)],context={count:2,groups};
 buildBodyCandidateGroups([a],context);
 assert.equal(context.count,1);assert.deepEqual(groups.map(value=>value.count),[1,0,0]);
 assert.deepEqual(groups[0].bodies,[a,stale]);assert.deepEqual(groups[1].bodies,[stale]);
 assert.equal(groups[0].spatialBucket,bucket);assert.equal(groups[1].spatialBucket,null);assert.equal(groups[2].spatialBucket,bucket);
});

test('group storage outside the previous active range retains its count until used or sentinel-cleared',()=>{
 const bucket={headId:1},stale=body(bucket),a=body(bucket),b=body(bucket),groups=[group([stale],1,bucket),group([stale],1,bucket),group([stale],1,bucket)],context={count:1,groups};
 buildBodyCandidateGroups([a,b],context);
 assert.equal(groups[0].count,1);assert.deepEqual(groups[0].bodies,[a]);
 assert.equal(groups[1].count,2);assert.deepEqual(groups[1].bodies,[stale,b]);assert.equal(groups[2].count,0);
 assert.deepEqual(groups[2].bodies,[stale]);assert.equal(groups[2].spatialBucket,null);
});
