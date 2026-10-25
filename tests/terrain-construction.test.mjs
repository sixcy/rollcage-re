import test from 'node:test';
import assert from 'node:assert/strict';
import {splineTerrainFixture} from './lib/spline-terrain-fixture.mjs';
import {createSplineRoad} from '../src/spline-road.mjs';
import {compileSplineRoads} from '../src/terrain-construction.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {queryTerrainRay} from '../src/terrain-query.mjs';
import {readTerrainVisibility,readTerrainLightCoverage} from '../src/terrain-spatial-builder.mjs';
const road=(extra={})=>createSplineRoad({id:'bridge',points:[{position:[64,-300,-32],width:64,bank:0},{position:[64,-300,-224],width:64,bank:0}],surface:{sector:0,cell:0},columns:2,spacing:32,...extra});
test('no roads preserve every source byte and duplicate road identities reject atomically',()=>{const data=splineTerrainFixture(),before=Buffer.from(data);assert.deepEqual(compileSplineRoads(data).data,data);assert.throws(()=>compileSplineRoads(data,[road(),road()]),/unique/);assert.deepEqual(data,before);});
test('new native sectors have real normals, full coverage, runtime row buffers and source isolation',()=>{const source=splineTerrainFixture(),before=Buffer.from(source),result=compileSplineRoads(source,[road()]),grid=parseCollisionGrid(result.data),index=result.generated[0].sectors[0],sector=grid.sectors[index];assert.equal(index,2);assert.ok(sector.cells.every(c=>c.covered&&c.forms.length===2));assert.deepEqual(source,before);for(let i=0;i<2;i++)assert.deepEqual(grid.sectors[i].vertices,parseCollisionGrid(source).sectors[i].vertices);assert.ok(result.data.readUInt32LE(0xc4)>=source.length);assert.ok(result.data.readUInt32LE(0x3c)>=source.length);});
test('actual terrain ray hits the added elevated road instead of the original lower surface',()=>{const result=compileSplineRoads(splineTerrainFixture(),[road()]),grid=parseCollisionGrid(result.data),body={flags:3,position:[64*65536,-340*65536,-64*65536],linearVelocity:[0,80*65536,0]},candidates=buildTerrainCandidates(grid,body,{radiusQ8:64*256}).candidates,hit=queryTerrainRay(grid,candidates,{originQ8:[64*256,-340*256,-64*256],deltaQ8:[0,80*256,0],radiusQ8:0});assert.ok(candidates.some(c=>c.sector===2));assert.ok(hit.flags);assert.equal(hit.pointQ8[1],-300*256);});
test('curves, ramps, banked bridges and stacked roads pass every generated triangle contact',()=>{
  const source=splineTerrainFixture();
  const curved=road({points:[{position:[32,-300,-32],width:48,bank:0},{position:[96,-350,-128],width:48,bank:12},{position:[128,-380,-256],width:48,bank:20}]});
  assert.ok(compileSplineRoads(source,[curved]).generated[0].centerline.length>3);
  const stacked=compileSplineRoads(source,[road(),road({id:'upper',points:[{position:[64,-600,-32],width:64,bank:0},{position:[64,-600,-224],width:64,bank:0}]})]),grid=parseCollisionGrid(stacked.data);
  for(const y of [-300,-600]){const candidates=buildTerrainCandidates(grid,{flags:3,position:[64*65536,(y-20)*65536,-64*65536],linearVelocity:[0,40*65536,0]},{radiusQ8:64*256}).candidates,hit=queryTerrainRay(grid,candidates,{originQ8:[64*256,(y-20)*256,-64*256],deltaQ8:[0,40*256,0],radiusQ8:0});assert.ok(hit.flags);assert.equal(hit.pointQ8[1],y*256);}
  assert.equal(stacked.data.readUInt32LE(8)-source.readUInt32LE(8),24);
  assert.equal(new Set(stacked.packetInitializers.entries.map(e=>e.index)).size,24);
});
test('native visibility retains original entries and includes the generated sector; light intervals round trip',()=>{const source=splineTerrainFixture(),result=compileSplineRoads(source,[road()]),old=parseCollisionGrid(source),grid=parseCollisionGrid(result.data);for(const [i,n]of old.spatial.nodes.entries()){const visibility=readTerrainVisibility(result.data,grid.spatial.nodes[i]);assert.deepEqual(visibility.slice(0,-1),readTerrainVisibility(source,n));assert.equal(visibility.at(-1).sector,2);const zone=grid.zones.find(z=>z.root===grid.spatial.nodes[i].zone),first=grid.regions.find(r=>r.index===zone.regions[0]);assert.deepEqual(readTerrainLightCoverage(result.data,grid.spatial.nodes[i],first),readTerrainLightCoverage(source,n,old.regions.find(r=>r.index===old.zones.find(z=>z.root===n.zone).regions[0])));}});
