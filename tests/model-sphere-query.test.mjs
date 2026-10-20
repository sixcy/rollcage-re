import test from 'node:test';
import assert from 'node:assert/strict';
import {queryModelShapeSphere} from '../src/model-sphere-query.mjs';
import {sphereBoxCollision} from '../tools/lib/model-sphere-fixtures.mjs';
const initial=()=>({flags:7,point:[1,2,3],normal:[4,5,6],scalar:8});
test('sphere face hit retains radius-offset center rather than ray contact geometry',()=>{
 const collision=sphereBoxCollision(),query={originQ8:[0,-10240,0],deltaQ8:[0,20480,0],radiusQ8:1024},output=initial();
 assert.equal(queryModelShapeSphere(collision,collision.shapes[0],query,output,{roundingMode:'nearest-even'}),16384);
 assert.deepEqual(output,{flags:1,point:[0,-5120,0],normal:[0,-256,0],scalar:5120});assert.equal(query.surfaceRef,-100);
});
test('inside sphere chooses maximum plane distance and preserves first face on ties',()=>{
 const collision=sphereBoxCollision(),query={originQ8:[0,0,0],deltaQ8:[0,0,0],radiusQ8:1024},output=initial();
 assert.equal(queryModelShapeSphere(collision,collision.shapes[0],query,output,{roundingMode:'nearest-even'}),0);
 assert.deepEqual(output,{flags:2,point:[-5120,0,0],normal:[-256,0,0],scalar:-5120});
});
test('shared outside polygon edge invokes native finite-edge contact',()=>{
 const collision=sphereBoxCollision(),query={originQ8:[-10240,-10240,0],deltaQ8:[20480,20480,0],radiusQ8:1024},output=initial();
 assert.equal(queryModelShapeSphere(collision,collision.shapes[0],query,output,{roundingMode:'nearest-even'}),17343);
 assert.deepEqual(output,{flags:1,point:[-4097,-4097,0],normal:[-181,-181,0],scalar:0});
});
test('point shape keeps native bound-based surface-reference quirk',()=>{
 const collision=sphereBoxCollision(),shape={...collision.shapes[0],faceCount:1,center:[0,0,0]},query={originQ8:[-2048,0,0],deltaQ8:[4096,0,0],radiusQ8:1024},output=initial();
 assert.equal(queryModelShapeSphere(collision,shape,query,output,{roundingMode:'nearest-even'}),16384);assert.equal(query.surfaceRef,-65636);assert.equal(output.flags,1);assert.deepEqual(output.point,[0,0,0]);
});
test('finite-edge endpoint redirect queries the selected polygon vertex',()=>{
 const collision=sphereBoxCollision(),query={originQ8:[-10240,9216,-10240],deltaQ8:[20480,-18432,20480],radiusQ8:1024},output=initial();
 assert.equal(queryModelShapeSphere(collision,collision.shapes[0],query,output,{roundingMode:'nearest-even'}),17152);assert.equal(query.surfaceRef,-65636);
 assert.deepEqual(output,{point:[-4096,4096,-4096],normal:[-175,66,-175],scalar:9056,flags:1});
});
test('plane rejection clears flags while preserving all other caller fields',()=>{
 const collision=sphereBoxCollision(),query={originQ8:[0,-10240,0],deltaQ8:[0,-20480,0],radiusQ8:1024,surfaceRef:99},output=initial();
 assert.equal(queryModelShapeSphere(collision,collision.shapes[0],query,output,{roundingMode:'nearest-even'}),65536);assert.deepEqual(output,{...initial(),flags:0});assert.equal(query.surfaceRef,99);
});
test('zero-radius inside query keeps the original no-overlap behavior',()=>{
 const collision=sphereBoxCollision(),output=initial();assert.equal(queryModelShapeSphere(collision,collision.shapes[0],{originQ8:[0,0,0],deltaQ8:[0,0,0],radiusQ8:0},output),0);assert.deepEqual(output,{...initial(),flags:0});
});
