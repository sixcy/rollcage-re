import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsCollisionPlane,appendRegionCandidates,buildTerrainCandidates} from '../src/terrain-candidates.mjs';
const unit=65536,packed=(x,y,z)=>(((x&1023)<<20)|((y&1023)<<10)|(z&1023))>>>0;
function fixture(columns=2,rows=1) {
 const step=columns===2?100:1,vertices=[];
 for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++)vertices.push([col*step,0,row*step,4]);
 const cells=Array.from({length:columns*rows},(_,index)=>{const row=Math.floor(index/columns),col=index%columns,top=row*(columns+1)+col;
  return {forms:[{type:0,normal:0,point:null,indices:[top,top+1,top+columns+2,top+columns+1]}]};});
 const sector={index:0,columns,rows,vertices,cells,flags:1,left:0,right:columns,borders:[]};
 const region={index:0,sector:0,row:0,column:0,rows,columns,padding:200};
 const spatial={lookup:()=>({found:true,outside:false,node:{index:0,zone:0}})};
 return {available:true,sectors:[sector],normals:[{packed:packed(0,-256,0),components:[0,-256,0]}],regions:[region],zones:[{root:0,regions:[0]}],spatial};
}
const state=()=>({candidates:[],closest:null,closestDistanceSquared:0x7fffffff,dropped:0});
const query={originQ8:[50*256,-20*256,50*256],deltaQ8:[0,0,0],radiusQ8:64*256};
test('native plane screen preserves approach, overlap depth and explicit override',()=>{
 const normal=packed(0,-256,0),point=[0,0,0];
 assert.equal(acceptsCollisionPlane(query,normal,point),true);
 const below={...query,originQ8:[0,80*256,0],radiusQ8:32*256};
 assert.equal(acceptsCollisionPlane(below,normal,point),false);assert.equal(acceptsCollisionPlane(below,normal,point,0x80000000),true);
 const approaching={originQ8:[0,-100*256,0],deltaQ8:[0,200*256,0],radiusQ8:0};
 assert.equal(acceptsCollisionPlane(approaching,normal,point),true);
 assert.equal(acceptsCollisionPlane({...approaching,deltaQ8:[0,-200*256,0]},normal,point),false);
});
test('region candidates preserve order, nearest ties and previous-call duplicate checks',()=>{
 const grid=fixture(),result=state();appendRegionCandidates(grid,grid.regions[0],query,[50,-20,50],4096,result);
 assert.deepEqual(result.candidates.map(c=>c.id),[0,256]);assert.equal(result.candidates[0].pointOffset,0);
 assert.deepEqual(result.closest,{sector:0,row:0,column:0});
 appendRegionCandidates(grid,grid.regions[0],query,[50,-20,50],4096,result);assert.equal(result.candidates.length,2);
});
test('distance padding still rejects the outside nearest-corner wedge',()=>{
 const grid=fixture(),result=state();appendRegionCandidates(grid,grid.regions[0],query,[-100,-20,-100],4096,result);
 assert.equal(result.candidates.length,0);
});
test('native region cap preserves the first 64 candidates',()=>{
 const grid=fixture(9,9),result=state();appendRegionCandidates(grid,grid.regions[0],query,[4,-20,4],4096,result);
 assert.equal(result.candidates.length,64);assert.equal(result.dropped,17);
 assert.equal(result.candidates.at(-1).row,7);assert.equal(result.candidates.at(-1).column,0);
});
test('border candidates append after cells in left-then-right order',()=>{
 const grid=fixture(),sector=grid.sectors[0];sector.flags=0;
 grid.normals.push({packed:packed(256,0,0),components:[256,0,0]},{packed:packed(-256,0,0),components:[-256,0,0]});
 sector.borders=[{left:{type:6,column:0,normal:1},right:{type:7,column:2,normal:2}}];
 const result=state();appendRegionCandidates(grid,grid.regions[0],{...query,radiusQ8:1000*256},[50,-20,50],1000000,result);
 assert.deepEqual(result.candidates.map(c=>c.type),[0,0,6,7]);
 assert.deepEqual(result.candidates.slice(-2).map(c=>c.vertexBase),[3,2]);
});
test('body wrapper derives midpoint/radius and preserves outside registration context',()=>{
 const grid=fixture(),body={flags:3,position:[50*unit,-20*unit,50*unit],linearVelocity:[0,0,0]};
 const result=buildTerrainCandidates(grid,body,{radiusQ8:64*256});assert.equal(result.radiusSquared,4096);assert.equal(result.candidates.length,2);
 const outside={...grid,spatial:{lookup:()=>({found:true,outside:true,node:{index:1,zone:1}})}};
 assert.equal(buildTerrainCandidates(outside,body,{radiusQ8:64*256}).skipped,'outside_stays_outside');
 const retained=buildTerrainCandidates(outside,body,{radiusQ8:64*256,spatialState:{outside:false,node:{index:0,zone:0}}});
 assert.equal(retained.spatial.usedNode,0);assert.equal(retained.candidates.length,2);
 assert.equal(buildTerrainCandidates(grid,{...body,flags:0x200},{radiusQ8:0}).skipped,'object_filter');
});
