import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {inspectRaceLayoutFallback} from '../src/race-layout-spatial.mjs';
import {createRaceRouteTopology,upgradeRaceRouteTopology,previewRaceRoutePointDeletion,removeRaceRoutePoint,compileRaceRouteTopology} from '../src/race-route-topology.mjs';
import {createSession} from '../src/solo-session.mjs';
import {validateProtectedTrackDraft} from '../src/editor-protection.mjs';
const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-route-deletion.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),rows=[],paired=new Map();
try{for(let level=1;level<=20;level++)for(const quality of ['LOW','HIGH']){
 const t=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`),source=(await archive.readResource(t.index)).data,topology=createRaceRouteTopology(source);assert.deepEqual(compileRaceRouteTopology(source,upgradeRaceRouteTopology(topology)).data,source);
 let selected;for(const group of topology.groups.filter((g,i)=>i&&g.points.length>2))for(const point of group.points){const preview=previewRaceRoutePointDeletion(topology,point.id);if(preview.conflicts.length)continue;const removed=removeRaceRoutePoint(topology,point.id);try{validateProtectedTrackDraft({geometry:source},{level,routeTopology:removed.topology});}catch{continue;}selected={pointId:point.id,removed};break;}assert.ok(selected,t.name);
 const result=compileRaceRouteTopology(source,selected.removed.topology),parsed=parseRespawnRoutes(result.data),before=inspectRaceLayoutFallback(source,parseSpatialIndex(source),parseRespawnRoutes(source).groups),after=inspectRaceLayoutFallback(result.data,parseSpatialIndex(result.data),parsed.groups);assert.deepEqual(after.nodes.map(n=>n.models),before.nodes.map(n=>n.models));for(const group of parsed.groups)for(const point of group.points){const word=point.bytes.readUInt32LE(12);for(const [g,p]of [[word&31,word>>>5&511],[word>>>14&31,word>>>19&511]])if(g)assert.ok(parsed.groups[g]?.points[p]);}
 if(quality==='LOW')paired.set(level,{pointId:selected.pointId,remap:result.remap});else assert.deepEqual({pointId:selected.pointId,remap:result.remap},paired.get(level));let race=null;if(![16,17].includes(level)){const session=createSession(result.data,(await archive.readResource(t.textureIndex)).data,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{for(let i=0;i<90;i++)session.step();race={ticks:session.snapshot.ticks,cars:session.snapshot.cars.length};}finally{session.dispose();}}
 rows.push({level,quality,deleted:selected.pointId,replacement:selected.removed.selectedPointId,modelWordsPreserved:true,sourceIdentity:true,race});console.log(JSON.stringify(rows.at(-1)));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'All40 source resources, native reference parsing and36 reconstructed90-tick races. No original-process observation.',rows},null,2)+'\n',{flag:'wx'});
