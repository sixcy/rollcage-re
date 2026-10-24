import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainFixture} from './lib/terrain-fixture.mjs';
import {inspectTerrain,compileTerrainEdits,emptyTerrainDraft,validateTerrainDraft} from '../src/terrain-editor.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {queryTerrainRay} from '../src/terrain-query.mjs';
import {stampTerrain,terrainBrushSelection} from '../tools/track-viewer/terrain-brush.mjs';

test('empty terrain drafts preserve every source byte',()=>{const source=terrainFixture();assert.deepEqual(compileTerrainEdits(source,emptyTerrainDraft()),source);});
test('height compilation updates actual collision planes, preserves source and gives both spatial height layers access',()=>{
 const source=terrainFixture(),before=Buffer.from(source),info=inspectTerrain(source),draft={heights:[{sector:0,vertex:4,height:-16}],surfaces:[]},edited=compileTerrainEdits(source,draft),grid=parseCollisionGrid(edited);
 assert.deepEqual(source,before);assert.equal(grid.scene.segments[0].vertices[4][1],-16);assert.notEqual(grid.sectors[0].cells[0].rawNormalIndex,0);assert.equal(grid.sectors[0].cells[0].forms.length,2);
 for(const node of grid.spatial.nodes){const zone=grid.zones.find(z=>z.root===node.zone);assert.ok(zone.regions.some(i=>grid.regions.find(r=>r.index===i).sector===0));}
 const body={flags:3,position:[48*65536,-40*65536,-48*65536],linearVelocity:[0,80*65536,0]},candidates=buildTerrainCandidates(grid,body,{radiusQ8:64*256}).candidates;
 const hit=queryTerrainRay(grid,candidates,{originQ8:[48*256,-40*256,-48*256],deltaQ8:[0,80*256,0],radiusQ8:0});assert.ok(hit.flags);assert.ok(hit.pointQ8[1]<0,'Wheel ray hits raised terrain rather than the old flat plane');
 assert.equal(info.scene.segments[0].vertices[4][1],0);
});
test('matched sector seams must agree and brush edits propagate them',()=>{
 const source=terrainFixture(),info=inspectTerrain(source);assert.deepEqual(new Set(info.seamFor.get('0:5')),new Set(['0:5','1:3']));
 assert.throws(()=>compileTerrainEdits(source,{heights:[{sector:0,vertex:5,height:-8}],surfaces:[]}),/seam/);
 const result=stampTerrain(info,emptyTerrainDraft(),{sector:0,cell:1,position:[127,0,64]},{radius:70,strength:8});const a=result.heights.find(r=>r.sector===0&&r.vertex===5),b=result.heights.find(r=>r.sector===1&&r.vertex===3);assert.equal(a.height,b.height);compileTerrainEdits(source,result);
});
test('surface edits reference complete presets without modifying shared descriptors or height data',()=>{
 const source=terrainFixture();source.writeUInt32LE(1,0x13a0+4);const before=Buffer.from(source),out=compileTerrainEdits(source,{heights:[],surfaces:[{sector:0,cell:0,sourceSector:1,sourceCell:0}]});assert.equal(out.readUInt32LE(0x1384),1);assert.deepEqual(out.subarray(0x1600,0x1620),before.subarray(0x1600,0x1620));assert.deepEqual(out.subarray(0x1240,0x1350),before.subarray(0x1240,0x1350));assert.deepEqual(source,before);
});
test('animated terrain and aliased seams are locked; invalid heights and duplicate edits fail before output',()=>{
 const source=terrainFixture();source[0x1166]=1;const info=inspectTerrain(source);assert.ok(info.isLocked('1:3'));assert.throws(()=>validateTerrainDraft(source,{heights:[{sector:1,vertex:3,height:-8}],surfaces:[]}),/Animated/);
 assert.throws(()=>compileTerrainEdits(terrainFixture(),{heights:[{sector:0,vertex:4,height:32768}],surfaces:[]}),/16-bit/);
 assert.throws(()=>compileTerrainEdits(terrainFixture(),{heights:[{sector:0,vertex:4,height:-8},{sector:0,vertex:4,height:-8}],surfaces:[]}),/duplicate/);
});
test('raise/lower, flatten/set and smoothing are discrete, connected operations',()=>{
 const info=inspectTerrain(terrainFixture()),hit={sector:0,cell:0,position:[64,0,64]},raised=stampTerrain(info,emptyTerrainDraft(),hit,{radius:40,strength:8});assert.equal(raised.heights.find(r=>r.vertex===4).height,-8);
 assert.deepEqual(stampTerrain(info,raised,hit,{mode:'lower',radius:40,strength:8}),emptyTerrainDraft());
 const set=stampTerrain(info,emptyTerrainDraft(),hit,{mode:'set',radius:40,height:24});assert.equal(set.heights[0].height,-24);assert.ok(stampTerrain(info,set,hit,{mode:'smooth',radius:40,strength:8}).heights[0].height>-24);
 assert.equal(terrainBrushSelection(info,emptyTerrainDraft(),{sector:99,cell:0,position:[0,0,0]},100).length,0);
});

test('brushes do not cross to a disconnected road at the same XZ; padding overflow is atomic',()=>{
 const source=terrainFixture();for(let i=0;i<9;i++){source.writeInt16LE(source.readInt16LE(0x1240+i*8),0x12c0+i*8);source.writeInt16LE(-300,0x12c2+i*8);}
 const info=inspectTerrain(source),selection=terrainBrushSelection(info,emptyTerrainDraft(),{sector:0,cell:0,position:[64,0,64]},1000);assert.ok(selection.length);assert.ok(selection.every(v=>v.sector===0));
 const clean=terrainFixture(),before=Buffer.from(clean);assert.throws(()=>compileTerrainEdits(clean,{heights:[{sector:0,vertex:4,height:-256}],surfaces:[]}),/padding capacity/);assert.deepEqual(clean,before);
});
