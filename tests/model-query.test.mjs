import test from 'node:test';
import assert from 'node:assert/strict';
import {queryModelShapeRay,modelPolygonOutside} from '../src/model-query.mjs';
import {boxCollision} from '../tools/lib/model-query-fixtures.mjs';
const ray={originQ8:[0,-40*256,0],deltaQ8:[0,80*256,0]};
test('model face hits retain native fraction, Q8 normals and quantized point',()=>{
 const collision=boxCollision(),shape=collision.shapes[0],hit=queryModelShapeRay(collision,shape,ray);
 assert.equal(hit.flags,1);assert.equal(hit.fractionQ16,19660);assert.deepEqual(hit.normalQ8,[0,-256,0]);
 assert.deepEqual(hit.pointQ8,[0,-4160,0]);assert.equal(hit.distanceQ8,24*256);assert.equal(hit.querySurfaceRef,-100);
});
test('model fraction bound is inclusive after the convex plane screen',()=>{
 const collision=boxCollision(),shape=collision.shapes[0];
 assert.equal(queryModelShapeRay(collision,shape,ray,{maxFractionQ16:19660}).flags,1);
 assert.deepEqual(queryModelShapeRay(collision,shape,ray,{maxFractionQ16:19659}),{flags:0,fractionQ16:19659});
});
test('inside and zero-travel surface starts do not create model overlap hits',()=>{
 const collision=boxCollision(),shape=collision.shapes[0];
 for(const y of [0,-16*256])assert.deepEqual(queryModelShapeRay(collision,shape,{...ray,originQ8:[0,y,0]}),{flags:0,fractionQ16:0});
 assert.deepEqual(queryModelShapeRay(collision,shape,{...ray,deltaQ8:[0,-80*256,0]}),{flags:0,fractionQ16:65536});
});
test('triangle faces and fractional object translations preserve model-local arithmetic',()=>{
 const collision=boxCollision({triangles:true}),positionQ16=[20*65536+16384,-30*65536-32768,100*65536];
 const query={originQ8:positionQ16.map((value,i)=>(value>>8)+ray.originQ8[i]),deltaQ8:ray.deltaQ8};
 const hit=queryModelShapeRay(collision,collision.shapes[0],query,{positionQ16});assert.equal(hit.flags,1);
 assert.deepEqual(hit.pointQ8,[positionQ16[0]>>8,(positionQ16[1]>>8)-4160,positionQ16[2]>>8]);
});
test('disabled/point/edge shapes preserve distinct zero-radius early returns',()=>{
 const collision=boxCollision();
 for(const faceCount of [0,1,2])assert.deepEqual(queryModelShapeRay(collision,{...collision.shapes[0],faceCount},ray),{flags:0,fractionQ16:faceCount?0:65536});
 assert.throws(()=>queryModelShapeRay(collision,collision.shapes[0],{...ray,radiusQ8:1}),/zero radius/);
});
test('model polygon containment retains edge numbers and short-coordinate wrapping',()=>{
 const collision=boxCollision(),face=collision.faces.find(face=>face.normalQ8[1]===-256),indices=[face.indices[0],face.indices[2],face.indices[3],face.indices[1]];
 const vertices=indices.map(index=>collision.vertices[index-1].slice(0,3));
 assert.equal(modelPolygonOutside(vertices,face.normalQ8,[0,-4096,0]),-1);
 const outside=modelPolygonOutside(vertices,face.normalQ8,[100*256,-4096,100*256]);assert.ok(outside>0x200);
 assert.equal(modelPolygonOutside(vertices,face.normalQ8,[65536*256,-4096,0]),-1);
});
