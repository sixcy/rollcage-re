import test from 'node:test';
import assert from 'node:assert/strict';
import {sphereBoxCollision} from '../tools/lib/model-sphere-fixtures.mjs';
import {buildModelCollisionPreview,collisionPlaneWarnings} from '../src/model-collision-preview.mjs';

const settings={class:7,configurations:[{type:0}]};
test('collision preview uses actual face perimeter edges, local display coordinates and face normals',()=>{
  const collision=sphereBoxCollision(),original=structuredClone(collision),preview=buildModelCollisionPreview({...collision,available:true},settings);
  const group=preview.groups[0];assert.equal(group.active,true);assert.equal(group.lines.length,12*2*3);assert.equal(group.normals.length,6*3*2*3);
  assert.deepEqual(preview.warnings,[]);assert.ok(preview.bounds.flat().every(Number.isFinite));assert.deepEqual(structuredClone(collision),original);
  for(let i=0;i<group.lines.length;i++)assert.ok(Math.abs(group.lines[i])===16,'Box edges use the actual vertices, not a padded bound');
});
test('reversed convex face planes are diagnosed without modifying their geometry',()=>{
  const collision=sphereBoxCollision(),shape=collision.shapes[0],face=collision.faces[0];face.normalQ8=face.normalQ8.map(n=>-n);
  const warnings=collisionPlaneWarnings(collision,shape);assert.ok(warnings.length);assert.equal(warnings[0].face,face.index);assert.equal(warnings[0].outsideDistance,32);
});
test('disabled configurations retain grey geometry; zero-count and point records use center markers only',()=>{
  const collision={...sphereBoxCollision(),available:true};let preview=buildModelCollisionPreview(collision,{class:7,configurations:[{type:5}]});
  assert.equal(preview.groups[0].active,false);assert.equal(preview.groups[0].lines.length,72);
  for(const count of [0,1]){
    collision.shapes[0]={...collision.shapes[0],faceCount:count,center:[7,-8,9],kind:count?'point':'disabled'};
    preview=buildModelCollisionPreview(collision,settings);const group=preview.groups[0];assert.equal(group.active,Boolean(count));assert.equal(group.markerOnly,true);assert.equal(group.lines.length,18);assert.equal(group.normals.length,0);
    assert.deepEqual(group.lines.slice(0,6),[3,8,-9,11,8,-9]);
  }
  assert.deepEqual(buildModelCollisionPreview({available:false},settings),{groups:[],warnings:[],bounds:null});
});

test('edge shapes display exactly the stored endpoints with no radius or normal volume',()=>{
  const collision={available:true,shapes:[{index:0,slot:0,faceCount:2,kind:'edge',records:[3]}],faceRecords:[{index:3,edgeIndex:8}],edges:[{index:8,indices:[1,2]}],vertices:[[3,-4,5],[8,9,-10]]};
  const preview=buildModelCollisionPreview(collision,settings);assert.deepEqual(preview.groups[0].lines,[3,4,-5,8,-9,10]);assert.deepEqual(preview.groups[0].normals,[]);assert.equal(preview.groups[0].active,true);
  assert.equal(buildModelCollisionPreview(collision,{...settings,class:5}).groups[0].active,false);
});
