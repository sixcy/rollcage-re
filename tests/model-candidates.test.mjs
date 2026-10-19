import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsModelShape,buildModelCandidates} from '../src/model-candidates.mjs';
import {boxCollision} from '../tools/lib/model-query-fixtures.mjs';
function fixture() {
 const collision=boxCollision(),settings={placementIndex:0,position:[0,0,0],yaw:0,class:0,configurations:[{type:1}]},registration={found:true,outside:false,node:{index:0}};
 const context={spatial:{available:true,lookup:()=>registration},links:{nodes:[{placementIndices:[0]}]},instances:new Map([[0,{collision,settings}]])};
 return {context,collision,settings,registration,body:{flags:3,position:[0,-40*65536,0],linearVelocity:[0,0,0]}};
}
test('model screens accept point/edge shapes regardless of contact-helper outputs',()=>{
 const {collision}=fixture(),query={originQ8:[10000,10000,10000],deltaQ8:[0,0,0],radiusQ8:0};
 for(const faceCount of [1,2])assert.equal(acceptsModelShape(collision,{...collision.shapes[0],faceCount},query,[0,0,0]),true);
 assert.equal(acceptsModelShape(collision,{faceCount:0},query,[0,0,0]),false);
});
test('polyhedron candidate screen preserves omission of its last plane',()=>{
 const {collision}=fixture(),shape=collision.shapes[0];
 assert.equal(acceptsModelShape(collision,shape,{originQ8:[0,0,40*256],deltaQ8:[0,0,0],radiusQ8:0},[0,0,0]),true);
 assert.equal(acceptsModelShape(collision,shape,{originQ8:[0,-40*256,0],deltaQ8:[0,0,0],radiusQ8:0},[0,0,0]),false);
});
test('model candidates preserve registration list order/repetition and radius filtering',()=>{
 const {context,body}=fixture();context.links.nodes[0].placementIndices=[0,0];
 assert.equal(buildModelCandidates(context,body,{radiusQ8:64*256}).candidates.length,2);
 assert.equal(buildModelCandidates(context,body,{radiusQ8:10*256}).candidates.length,0);
 assert.equal(buildModelCandidates(context,{...body,linearVelocity:[0,40*65536,0]},{radiusQ8:10*256}).candidates.length,2);
});
test('model stage applies parent/class/config filters and uses supplied original registration',()=>{
 const {context,body,settings,registration}=fixture();
 assert.equal(buildModelCandidates(context,{...body,flags:4},{radiusQ8:64*256}).skipped,'object_filter');
 assert.equal(buildModelCandidates(context,{...body,flags:0x203},{radiusQ8:64*256}).skipped,'object_filter');
 context.spatial.lookup=()=>{throw Error('Unexpected new spatial lookup.');};
 assert.equal(buildModelCandidates(context,body,{radiusQ8:64*256,spatialState:registration}).candidates.length,1);
 settings.class=5;assert.equal(buildModelCandidates(context,body,{radiusQ8:64*256,spatialState:registration}).candidates.length,0);
 settings.class=0;settings.configurations[0].type=5;assert.equal(buildModelCandidates(context,body,{radiusQ8:64*256,spatialState:registration}).candidates.length,0);
});
