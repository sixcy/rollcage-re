import test from 'node:test';
import assert from 'node:assert/strict';
import {rotateModelYaw,rotateModelYawPoint,toModelYawQuery} from '../src/model-transforms.mjs';
import {queryPlacedModelRay,selectWheelHits} from '../src/placed-model-query.mjs';
import {boxCollision} from '../tools/lib/model-query-fixtures.mjs';
const ray={originQ8:[0,-40*256,0],deltaQ8:[0,80*256,0],tag:100};
function candidate({type=1,objectClass=0,yaw=0,placementIndex=0}={}) {
 const collision=boxCollision();return {collision,shape:collision.shapes[0],settings:{position:[0,0,0],yaw,class:objectClass,placementIndex,configurations:[{type,flags:type<<24}]}};
}
test('native yaw lookup retains quarter turns and Q8 diagonal quantization',()=>{
 assert.deepEqual(rotateModelYaw([256,0,0],64),[0,0,-256]);assert.deepEqual(rotateModelYaw([256,0,0],192),[0,0,256]);
 assert.deepEqual(rotateModelYaw([256,0,0],32),[181,0,-181]);assert.deepEqual(rotateModelYaw([100,-20,300],256),[100,-20,300]);
 const position=[10*65536,20*65536,30*65536];assert.deepEqual(rotateModelYawPoint([11*256,20*256,30*256],position,64),[10*256,20*256,29*256]);
 assert.deepEqual(toModelYawQuery(ray,[0,0,0],0),ray);
});
test('placed queries rotate hit points/normals and retain the last equal-fraction hit',()=>{
 const first=candidate({yaw:64,placementIndex:12}),second=candidate({yaw:192,placementIndex:13});
 const hit=queryPlacedModelRay([first,second],ray);assert.equal(hit.flags,1);assert.equal(hit.cellRef,-4);assert.equal(hit.placementIndex,13);
 assert.equal(hit.candidateIndex,1);assert.equal(hit.fractionQ16,19660);assert.deepEqual(hit.normalQ16,[0,-65536,0]);
});
test('zero-radius class and matching-tag filters skip model candidates',()=>{
 for(const objectClass of [1,2,5])assert.equal(queryPlacedModelRay([candidate({objectClass})],ray).flags,0);
 assert.equal(queryPlacedModelRay([candidate({type:5})],ray).flags,0);
 assert.equal(queryPlacedModelRay([candidate()],{...ray,tag:0},{activeTag:0}).flags,0);
});
test('type-four routing and destruction require explicit object-state handling',()=>{
 const target=candidate({type:4});
 assert.equal(queryPlacedModelRay([target],ray,{specialType4:true,activeTag:0}).flags,0);
 assert.throws(()=>queryPlacedModelRay([target],ray),/object-state/);
 assert.equal(queryPlacedModelRay([target],ray,{onBreakableContact:()=>false}).flags,1);
 assert.equal(queryPlacedModelRay([target],ray,{onBreakableContact:()=>true}).flags,0x840);
 assert.equal(queryPlacedModelRay([target],{...ray,tag:0},{specialType4:true,activeTag:0,onBreakableContact:()=>false}).flags,1);
});
test('wheel selector runs every terrain probe before any model probe',()=>{
 const probes=Array.from({length:4},(_,index)=>({query:{index}})),order=[];
 const hits=selectWheelHits(probes,{terrainQuery:query=>{order.push(`t${query.index}`);return {flags:1,fractionQ16:40000};},modelQuery:query=>{order.push(`m${query.index}`);return {flags:1,fractionQ16:20000,cellRef:-4};}});
 assert.deepEqual(order,['t0','t1','t2','t3','m0','m1','m2','m3']);assert.ok(hits.every(hit=>hit.fractionQ16===20000&&hit.cellRef===-4));
});
test('farther model writes survive native restoration of terrain flags and fraction',()=>{
 const probes=Array.from({length:4},()=>({query:ray}));
 const hits=selectWheelHits(probes,{terrainQuery:()=>({flags:2,fractionQ16:10000,pointQ8:[1,2,3],normalQ16:[0,-65536,0],cellRef:0}),modelQuery:()=>({flags:1,fractionQ16:20000,pointQ8:[4,5,6],normalQ16:[65536,0,0],cellRef:-4})});
 assert.ok(hits.every(hit=>hit.flags===2&&hit.fractionQ16===10000&&hit.cellRef===-4));assert.deepEqual(hits[0].pointQ8,[4,5,6]);
});
test('empty terrain and model misses produce no contact and a bounded selected fraction',()=>{
 const probes=Array.from({length:4},()=>({query:ray}));
 const hits=selectWheelHits(probes,{terrainQuery:()=>({flags:0,fractionQ16:0x1010000}),modelQuery:()=>({flags:0,fractionQ16:65536})});
 assert.ok(hits.every(hit=>hit.flags===0&&hit.fractionQ16===65536));
});
