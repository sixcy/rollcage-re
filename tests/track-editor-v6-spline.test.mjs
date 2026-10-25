import test from 'node:test';
import assert from 'node:assert/strict';
import {splineTerrainFixture} from './lib/spline-terrain-fixture.mjs';
import {raceLayoutFixture} from './lib/race-layout-fixture.mjs';
import {createSplineRoad,generateSplineRoad} from '../src/spline-road.mjs';
import {createRaceRouteTopology,removeRaceRoutePoint,upsertSplineRoadRoute,removeSplineRoadRoute} from '../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft} from '../src/checkpoint-topology.mjs';
import {parseTrackProject,validateTrackProject,compileTrackDraft} from '../src/track-editor-project.mjs';
import {parseScene} from '../src/scene.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {inspectRaceLayoutFallback} from '../src/race-layout-spatial.mjs';
import {TrackEditor} from '../tools/track-viewer/track-editor-ui.mjs';

// Combined synthetic terrain/race contracts, never original-process evidence.
function fixture(){
 const geometry=splineTerrainFixture(),race=raceLayoutFixture();
 for(const offset of [0x74,0x8c,0x98,0xa0,0xbc])geometry.writeUInt32LE(race.readUInt32LE(offset),offset);
 for(const offset of [0x78,0x79,0x95])geometry[offset]=race[offset];
 geometry.set(race.subarray(0x1800,0x1c00),0x1800);geometry.writeUInt32LE(1<<16,0x3900);geometry.writeUInt32LE(1,8);
 for(let i=0;i<3;i++)geometry.writeUInt32LE(1|1<<5,0x190c+i*16);
 const first=parseScene(geometry).segments[0];geometry.writeUInt32LE(1,first.packetsOffset+12);
 const texture=Buffer.alloc(0x70);texture.write('BTP ');texture.writeUInt32LE(1,12);texture.writeUInt16LE(0x12a5,0x40);
 const road=createSplineRoad({id:'v6-road',points:[{position:[64,-300,-32],width:64,bank:0},{position:[64,-300,-224],width:64,bank:0}],surface:{sector:0,cell:0},columns:2,spacing:32});
 let routes=removeRaceRoutePoint(createRaceRouteTopology(geometry),'g1:p1').topology;
 routes=upsertSplineRoadRoute(geometry,routes,{roadId:road.id,centerline:generateSplineRoad(geometry,road).centerline,templateGroupId:'g1',entryPointId:'g1:p0',exitPointId:'g1:p2',replaceEntry:true}).topology;
 const row={level:1,pickups:[],models:[],terrain:{heights:[],surfaces:[{sector:2,cell:0,sourceSector:0,sourceCell:1}]},layout:{routes:[],checkpoints:[],starts:[]},routeTopology:routes,checkpointTopology:createCheckpointTopologyDraft(geometry),assemblies:[],roads:[road],reversal:null};
 const h='a'.repeat(64),hashes={LOW:{geometry:h,texture:h},HIGH:{geometry:h,texture:h}},pair={LOW:{geometry,texture},HIGH:{geometry:Buffer.from(geometry),texture:Buffer.from(texture)}},project={schemaVersion:6,game:'rollcage',indexSha256:h,sources:[{level:1,hashes}],levels:[row]};
 return {geometry,texture,pair,row,project,context:{indexSha256:h,sources:new Map([[1,pair]]),hashes:new Map([[1,hashes]])}};
}

test('v6 round trip compiles roads before generated surface paint and routes after terrain with matching BTP counts',()=>{
 const {project,context,geometry}=fixture(),parsed=parseTrackProject(JSON.stringify(project));assert.deepEqual(parsed,project);
 const {compiled}=validateTrackProject(parsed,context);
 for(const quality of ['LOW','HIGH']){const result=compiled.get(1)[quality],scene=parseScene(result.geometry);assert.equal(scene.segments.length,3);assert.equal(scene.segments[2].faces[0].textureRecord,1);assert.equal(result.geometry.readUInt32LE(8),result.texture.readUInt32LE(12));assert.equal(result.texture.readUInt16LE(0x40),0x12a5);for(const s of parseScene(geometry).segments)assert.deepEqual(scene.segments[s.index].vertices,s.vertices);}
 assert.deepEqual(compiled.get(1).LOW.geometry,compiled.get(1).HIGH.geometry);
});

test('v6 persisted tombstones and original IDs survive generated route fallback serialization',()=>{
 const {project,context}=fixture(),row=parseTrackProject(JSON.stringify(project)).levels[0],group=row.routeTopology.groups.find(g=>g.roadId==='v6-road');assert.ok(row.routeTopology.deletedPoints.some(p=>p.id==='g1:p1'));assert.ok(row.routeTopology.groups[1].points.some(p=>p.id==='g1:p2'));
 const {compiled}=validateTrackProject(project,context),data=compiled.get(1).LOW.geometry,grid=parseCollisionGrid(data),fallback=inspectRaceLayoutFallback(data,grid.spatial,parseRespawnRoutes(data).groups);
 assert.ok(fallback.nodes.some(n=>n.group===group.index));
 const removed=removeSplineRoadRoute(row.routeTopology,'v6-road',{replacementPointId:'g1:p2'}).topology;assert.ok(removed.deletedPoints.length>row.routeTopology.deletedPoints.length);assert.equal(removed.groups.some(g=>g.roadId==='v6-road'&&!g.retired),false);
});

test('invalid saved road fields, duplicated identities and failed HIGH compilation are atomic',()=>{
 const {pair,row,project}=fixture(),before=Buffer.from(pair.LOW.geometry),textureBefore=Buffer.from(pair.LOW.texture);
 const unknown=structuredClone(project);unknown.levels[0].roads[0].patch=[];assert.throws(()=>parseTrackProject(unknown),/fields/);
 const duplicate=structuredClone(project);duplicate.levels[0].roads.push(duplicate.levels[0].roads[0]);assert.throws(()=>parseTrackProject(duplicate),/Duplicate/);
 const sector=parseScene(pair.HIGH.geometry).segments[0];pair.HIGH.geometry[sector.offset+6]|=1;assert.throws(()=>compileTrackDraft(pair,row),/Animated/);assert.deepEqual(pair.LOW.geometry,before);assert.deepEqual(pair.LOW.texture,textureBefore);
});

test('v5 arrow records retain their original shape when parsed alongside v6 road support',()=>{
 const {project}=fixture(),legacy=structuredClone(project);legacy.schemaVersion=5;delete legacy.levels[0].roads;delete legacy.levels[0].reversal;legacy.levels[0].terrain={heights:[],surfaces:[],patterns:[{sector:0,cell:0,sourceSector:0,sourceCell:0,rotation:1}]};
 assert.deepEqual(parseTrackProject(JSON.stringify(legacy)),legacy);assert.equal(parseTrackProject(legacy).levels[0].terrain.patterns[0].kind,undefined);
});

test('reshaping and deleting a road rebases painted cells by row and column and drops removed cells',()=>{
 const {pair,row}=fixture(),base={...pair,terrainDraft:{heights:[],surfaces:[{sector:2,cell:3,sourceSector:0,sourceCell:1}],patterns:[]},roads:row.roads};
 const editor=Object.assign(Object.create(TrackEditor.prototype),{current:base,compile:()=>compileTrackDraft(pair,{...row,terrain:base.terrainDraft})});
 const wider=structuredClone(row.roads);wider[0].columns=4;
 const mapped=editor.remapRoadPaint(wider);assert.equal(mapped.surfaces[0].cell,5);assert.equal(mapped.surfaces[0].sector,2);
 assert.equal(editor.remapRoadPaint([]).surfaces.length,0);
 assert.equal(base.terrainDraft.surfaces[0].cell,3,'preview remapping cannot mutate the saved draft');
 const narrower=structuredClone(row.roads);narrower[0].columns=1;assert.equal(editor.remapRoadPaint(narrower).surfaces.length,0);
});

test('spline boundary previews use current height edits and invalidate the source cache',()=>{
 const {pair}=fixture(),base={...pair,terrainDraft:{heights:[{sector:0,vertex:6,height:-8}],surfaces:[]}},editor=Object.assign(Object.create(TrackEditor.prototype),{current:base});
 const definition=createSplineRoad({id:'snap-height',points:[{position:[64,0,-128],width:128,bank:0},{position:[64,0,-256],width:128,bank:0}],surface:{sector:0,cell:0},columns:2,spacing:32,startSnap:{sector:0,edge:'end'}});
 const source=editor.roadSourceGeometry(),preview=generateSplineRoad(source,definition);assert.deepEqual(preview.segments[0].vertices.slice(0,3),parseScene(source).segments[0].vertices.slice(6,9).map(v=>v.slice(0,3)));assert.equal(parseScene(source).segments[0].vertices[6][1],-8);assert.equal(editor.roadSourceGeometry(),source);
 base.terrainDraft.heights[0].height=-16;assert.notEqual(editor.roadSourceGeometry(),source);assert.equal(parseScene(pair.LOW.geometry).segments[0].vertices[6][1],0);
});
