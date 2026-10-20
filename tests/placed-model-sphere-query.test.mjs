import test from 'node:test';
import assert from 'node:assert/strict';
import {queryPlacedModelSphere} from '../src/placed-model-sphere-query.mjs';
import {sphereBoxCollision} from '../tools/lib/model-sphere-fixtures.mjs';
const probe=()=>({originQ8:[0,-10240,0],deltaQ8:[0,20480,0],radiusQ8:1024,tag:100,surfaceRef:99}),initial=()=>({point:[1,2,3],normal:[4,5,6],scalar:7,flags:8,cellRef:9}),inert={onObjectContact:()=>false};
function candidate({objectClass=0,type=1,yaw=0,position=[0,0,0],stateByte198=0,placementIndex=0}={}){const collision=sphereBoxCollision();return{collision,shape:collision.shapes[0],settings:{position,yaw,class:objectClass,stateByte198,placementIndex,configurations:[{type,flags:type<<24}]}};}
test('placed spheres restore probe vectors and expose yaw-adjusted Q16 contact normals',()=>{
 const query=probe(),before=structuredClone(query),out=initial();assert.equal(queryPlacedModelSphere([candidate({yaw:64})],query,out,{roundingMode:'nearest-even',effects:inert}),16384);
 assert.deepEqual(out,{point:[0,-5120,0],normal:[0,-65536,0],scalar:5120,flags:1,cellRef:-4});assert.deepEqual(query.originQ8,before.originQ8);assert.deepEqual(query.deltaQ8,before.deltaQ8);assert.equal(query.surfaceRef,-100);
});
test('class one admits nonzero spheres and routes its distinct contact effect',()=>{
 const out=initial(),seen=[];queryPlacedModelSphere([candidate({objectClass:1})],probe(),out,{roundingMode:'nearest-even',effects:{onClass1Contact:p=>{seen.push(p.candidateIndex);return true;}}});assert.equal(out.flags,0x240);assert.deepEqual(seen,[0]);
 const ray={...probe(),radiusQ8:0},miss=initial();queryPlacedModelSphere([candidate({objectClass:1})],ray,miss);assert.deepEqual(miss,{...initial(),flags:0});assert.equal(ray.surfaceRef,99);
});
test('class two invokes its effect unconditionally on a geometric hit',()=>{
 const out=initial(),seen=[];queryPlacedModelSphere([candidate({objectClass:2})],probe(),out,{roundingMode:'nearest-even',effects:{onClass2Contact:p=>seen.push(p.shapeSlot)}});assert.equal(out.flags,0x240);assert.deepEqual(seen,[0]);
});
test('ordinary object contact passes the original velocity to its effect',()=>{
 const query=probe(),out=initial(),seen=[];queryPlacedModelSphere([candidate({yaw:32})],query,out,{roundingMode:'nearest-even',effects:{onObjectContact:p=>{seen.push(p.velocityQ16);return true;}}});assert.equal(out.flags,0x840);assert.deepEqual(seen,[[0,5242880,0]]);
});
test('class four calls break processing only when the object-state byte allows it',()=>{
 for(const stateByte198 of [0,1]){const seen=[],out=initial();queryPlacedModelSphere([candidate({objectClass:4,stateByte198})],probe(),out,{roundingMode:'nearest-even',effects:{onObjectContact:()=>{seen.push('contact');return true;},onClass4Break:()=>seen.push('break')}});assert.deepEqual(seen,stateByte198?['contact']:['contact','break']);assert.equal(out.flags,0x840);}
});
test('type-four special routing selects matching aggregate tag',()=>{
 const query={...probe(),tag:0},out=initial();queryPlacedModelSphere([candidate({type:4})],query,out,{activeTag:0,specialType4:true,roundingMode:'nearest-even',effects:inert});assert.equal(out.flags,1);
 const miss=initial();queryPlacedModelSphere([candidate({type:4})],probe(),miss,{activeTag:0,specialType4:true});assert.deepEqual(miss,{...initial(),flags:0});
});
test('a later filtered candidate preserves the previous accepted result',()=>{
 const out=initial();assert.equal(queryPlacedModelSphere([candidate(),candidate({objectClass:5})],probe(),out,{roundingMode:'nearest-even',effects:inert}),16384);assert.equal(out.flags,1);assert.deepEqual(out.point,[0,-5120,0]);
});
test('effects remain explicit boundaries with an actionable missing-handler error',()=>{
 assert.throws(()=>queryPlacedModelSphere([candidate()],probe(),initial(),{roundingMode:'nearest-even'}),/onObjectContact/);
 assert.throws(()=>queryPlacedModelSphere([candidate({objectClass:2})],probe(),initial(),{roundingMode:'nearest-even'}),/onClass2Contact/);
});
