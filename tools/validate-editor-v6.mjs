import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {createRaceRouteTopology,removeRaceRoutePoint} from '../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft} from '../src/checkpoint-topology.mjs';
import {compileTrackDraft,validateTrackProject} from '../src/track-editor-project.mjs';
import {parseScene} from '../src/scene.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {speedPadPatterns} from '../src/speed-pad-patterns.mjs';
import {createSession} from '../src/solo-session.mjs';

const [output,installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/validate-editor-v6.mjs NEW_REPORT.json [INSTALLATION]');
const load=async name=>JSON.parse(await readFile(name,'utf8'));
const [roads,deletions,imports]=await Promise.all(['analysis/spline-terrain-corpus-20261025-v3.json','analysis/route-deletion-matrix-20261025-v2.json','analysis/static-model-texture-matrix-20261025-v6.json'].map(load));
const archive=await RollcageArchive.open(installation),sources=new Map(),hashes=new Map(),rows=[],sha=b=>createHash('sha256').update(b).digest('hex');
try{
 for(let level=1;level<=20;level++){
  const pair={},h={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};h[q]={geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)};}sources.set(level,pair);hashes.set(level,h);
 }
 for(const [level,pair]of sources){
  const row={level,pickups:createPickupDraft(pair.LOW.geometry),models:createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),terrain:{heights:[],surfaces:[],patterns:[]},layout:{routes:[],checkpoints:[],starts:[]},routeTopology:createRaceRouteTopology(pair.LOW.geometry),checkpointTopology:createCheckpointTopologyDraft(pair.LOW.geometry),assemblies:[],roads:[],reversal:null};
  const original=compileTrackDraft(pair,row,sources);for(const q of ['LOW','HIGH'])for(const key of ['geometry','texture'])assert.deepEqual(original[q][key],pair[q][key],`${q}/LEV${level} central no-edit identity`);
  row.routeTopology=removeRaceRoutePoint(row.routeTopology,deletions.rows.find(r=>r.level===level&&r.quality==='LOW').deleted).topology;
  const road=structuredClone(roads.rows.find(r=>r.level===level&&r.quality==='LOW').cases[0].road);
  if([12,13].includes(level))road.points.forEach((p,i)=>p.position=[-20000,-512-i*16,-20000+i*128]);
  row.roads=[road];let result=compileTrackDraft(pair,row,sources),sector=result.LOW.roads[0].sectors[0];
  row.terrain.surfaces.push({sector,cell:0,sourceSector:road.surface.sector,sourceCell:road.surface.cell});
  const patterns=speedPadPatterns(pair.LOW.geometry,pair.HIGH.geometry),s=parseScene(result.LOW.geometry).segments[sector];if(patterns.length&&s.rows>=2)row.terrain.patterns.push({kind:'arrow4',sector,cell:0,sourceSector:patterns[0].sector,sourceCell:patterns[0].cell,rotation:0});
  const donor=imports.imports.find(r=>r.targetLevel===level&&r.checks.LOW.compatible&&r.checks.HIGH.compatible);
  if(donor)row.models.push({id:'combined-foreign-model',sourceLevel:donor.sourceLevel,templateIndex:donor.templateIndex,position:[...road.points[0].position],yaw:0});
  const project={schemaVersion:6,game:'rollcage',indexSha256:'a'.repeat(64),sources:[...hashes].map(([level,hashes])=>({level,hashes})),levels:[row]};
  const validated=validateTrackProject(JSON.stringify(project),{indexSha256:project.indexSha256,sources,hashes,requireConnected:true});result=validated.compiled.get(level);
  for(const q of ['LOW','HIGH']){
   const r=result[q],grid=parseCollisionGrid(r.geometry);assert.ok(grid.sectors[sector].cells.every(c=>c.covered));assert.equal(r.geometry.readUInt32LE(8),r.texture.readUInt32LE(12));
   let race=null;if(![16,17].includes(level)){const session=createSession(r.geometry,r.texture,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{for(let i=0;i<30;i++)session.step();assert.equal(session.snapshot.ticks,30);race={ticks:30,cars:session.snapshot.cars.length};}finally{session.dispose();}}
   for(const key of ['geometry','texture'])assert.equal(sha(pair[q][key]),hashes.get(level)[q][key]);
   rows.push({level,quality:q,noEditIdentity:true,sourceUnchanged:true,roadSector:sector,deleted:row.routeTopology.deletedPoints,arrow:row.terrain.patterns.length===1,foreignModel:donor?{sourceLevel:donor.sourceLevel,templateIndex:donor.templateIndex}:null,projectRoundTrip:true,race});
  }
  console.log(JSON.stringify({level,passed:true}));
 }
}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'All40 central compiler identities and combined road/surface/deletion/static-import/recognized-arrow v6 projects;36 short reconstructed races. Slice matrices supply retained fixture choices. No native process evidence.',rows},null,2)+'\n',{flag:'wx'});
