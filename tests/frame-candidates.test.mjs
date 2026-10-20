import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFrameCandidates,candidateArenaView} from '../src/frame-candidates.mjs';
import {beginPhysicsFrame} from '../src/physics-frame-state.mjs';
function fixture() {
 const node={index:0,zone:0},grid={zones:[{root:0,regions:[0]}],regions:[{index:0}],spatial:{lookup:()=>({found:true,outside:false,node})}},records=Buffer.alloc(72*8,0xa5);
 const body=(id=0)=>({flags:3,collisionFlags:0,collisionCount10c:1,collisionIds:[id,id+1],position:[65536,-131072,196608],linearVelocity:[-65536,0,65536],spatialBucket:node,spatialOutside:false,closestTerrain11c:123,collisionBound120:0x7fffffff});
 for(let id=0;id<8;id++)records.writeInt32LE(60*256,id*72+64);
 return {grid,node,records,body,arena:{entries:Array.from({length:32},()=>null),startOffset:16}};
}
const hooks={appendRegion:()=>{},appendModels:()=>({candidates:[]})};
test('frame reset and region append share native +120, retaining the closest +11c output',()=>{
 const f=fixture(),body=f.body();body.collisionBound120=-99;beginPhysicsFrame([body],[]);
 buildFrameCandidates([body],{...f,...hooks,appendRegion:(grid,region,query,center,radius,state)=>{assert.equal(state.closestDistanceSquared,0x7fffffff);assert.equal(state.closest,123);state.closest={sector:0,row:1,column:2};state.closestDistanceSquared=64;}});
 assert.equal(body.collisionBound120,64);assert.deepEqual(body.closestTerrain11c,{sector:0,row:1,column:2});assert.equal(Object.hasOwn(body,'closestTerrainDistance120'),false);
});
test('the shared model arena advances by terrain count and later model writes overwrite earlier entries',()=>{
 const f=fixture(),first=f.body(0),second=f.body(2),order=[];
 const result=buildFrameCandidates([first,second],{...f,appendRegion:(grid,region,query,center,radius,state,body)=>{order.push(['terrain',body]);state.candidates.push(body===first?'t0':'t1');},appendModels:(models,body)=>{order.push(['model',body]);return {candidates:body===first?['m0','m1','m2']:['m3','m4']};}});
 assert.deepEqual(order,[['terrain',first],['terrain',second],['model',first],['model',second]]);
 assert.equal(first.modelCandidateOffset158,48);assert.equal(second.modelCandidateOffset158,64);assert.equal(result.cursor,80);
 assert.deepEqual(candidateArenaView(f.arena,first),['t0']);assert.deepEqual(candidateArenaView(f.arena,first,'model'),['m0','m3','m4']);
 assert.deepEqual(candidateArenaView(f.arena,second,'model'),['m3','m4']);
});
test('skipped terrain still updates aggregate cache, resets counts and leaves unrelated retained arena entries',()=>{
 const f=fixture(),body=f.body();body.flags|=0x200;body.terrainWord15c=12;body.modelCandidateCount15e=5;f.arena.entries[1]='retained';
 let calls=0;buildFrameCandidates([body],{...f,appendRegion:()=>calls++,appendModels:()=>{calls++;return {candidates:[]};}});
 const aggregate=f.records.subarray(72,144);assert.deepEqual([8,12,16].map(p=>aggregate.readInt32LE(p)),[256,-512,768]);assert.deepEqual([20,24,28].map(p=>aggregate.readInt32LE(p)),[-256,0,256]);
 assert.equal(calls,0);assert.equal(body.terrainWord15c,0);assert.equal(body.modelCandidateCount15e,0);assert.equal(body.terrainCandidateOffset154,16);assert.equal(body.modelCandidateOffset158,16);assert.equal(f.arena.entries[1],'retained');
});
test('outside midpoint uses prior node when crossing out and preserves model registration independently',()=>{
 const f=fixture(),body=f.body(),outsideNode={index:2,zone:99};let regionCalls=0;
 const options={...f,lookup:()=>({found:true,outside:true,node:outsideNode}),appendRegion:()=>regionCalls++,appendModels:(models,body,{spatialState})=>{assert.equal(spatialState.node,f.node);return {candidates:[]};}};
 const result=buildFrameCandidates([body],options);assert.equal(regionCalls,1);assert.equal(result.reports[0].spatial.usedNode,0);
 body.spatialOutside=true;const skipped=buildFrameCandidates([body],options);assert.equal(regionCalls,1);assert.equal(body.collisionState128,16);assert.equal(skipped.reports[0].skipped,'outside_stays_outside');
});
test('type17 changes the first two radii before region queries and retains the reset distance without a region hit',()=>{
 const f=fixture(),body=f.body();body.flags=17;
 buildFrameCandidates([body],{...f,...hooks,appendRegion:(grid,region,query)=>assert.equal(query.radiusQ8,0x5000)});
 assert.equal(f.records.readInt32LE(64),0x1900);assert.equal(f.records.readInt32LE(72+64),0x5000);assert.equal(body.collisionBound120,0x7fffffff);assert.equal(body.closestTerrain11c,123);
});
