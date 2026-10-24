import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {inspectTerrain,compileTerrainEdits,emptyTerrainDraft,terrainSurfacePresets} from '../src/terrain-editor.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createSession} from '../src/solo-session.mjs';
const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-terrain-editor.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),rows=[],sha=d=>createHash('sha256').update(d).digest('hex');
try{for(let level=1;level<=20;level++){
 const pair={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};assert.deepEqual(compileTerrainEdits(pair[q].geometry,emptyTerrainDraft()),pair[q].geometry);}
 const info=inspectTerrain(pair.LOW.geometry),originalHashes={LOW:sha(pair.LOW.geometry),HIGH:sha(pair.HIGH.geometry)},presets=terrainSurfacePresets(pair.LOW.geometry,pair.HIGH.geometry),cases=[],rejected=[];
 const candidates=[...info.vertices.values()].filter(v=>!info.isLocked(`${v.sector}:${v.vertex}`)&&v.vertex%(info.scene.segments[v.sector].columns+1)>0).filter((_,i)=>i%17===0).slice(0,40);
 for(const v of candidates){
  const heights=info.seamFor.get(`${v.sector}:${v.vertex}`).map(id=>{const ref=info.vertices.get(id);return {sector:ref.sector,vertex:ref.vertex,height:ref.position[1]-8};}),surfaces=[];
  if(presets.length>1){const target=info.scene.segments[v.sector].faces[0],preset=presets.find(p=>info.scene.segments[p.sector].faces[p.cell].textureRecord!==target.textureRecord);if(preset)surfaces.push({sector:v.sector,cell:0,sourceSector:preset.sector,sourceCell:preset.cell});}
  try{
   const models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),pickups=createPickupDraft(pair.LOW.geometry),compiled=compileTrackDraft(pair,{level,models,pickups,terrain:{heights,surfaces}});
   for(const q of ['LOW','HIGH']){const grid=parseCollisionGrid(compiled[q].geometry);for(const h of heights)assert.equal(grid.sectors[h.sector].vertices[h.vertex][1],h.height);}
   let race=null;if(![16,17].includes(level)){const s=createSession(compiled.LOW.geometry,compiled.LOW.texture,{aiDifficulty:2,vehicleTypes:[0,1,2],weaponsEnabled:true});try{for(let i=0;i<90;i++)s.step();race={ticks:s.snapshot.ticks,modelHits:s.snapshot.stats.modelHits};}finally{s.dispose();}}
   cases.push({vertex:{sector:v.sector,vertex:v.vertex},heights:heights.length,surfaces:surfaces.length,race});break;
  }catch(error){rejected.push(error.message);}
 }
 assert.ok(cases.length,`No supported edit found for LEV${level}: ${rejected.slice(0,3).join('; ')}`);assert.equal(sha(pair.LOW.geometry),originalHashes.LOW);assert.equal(sha(pair.HIGH.geometry),originalHashes.HIGH);
 rows.push({level,noEditIdentity:true,presetCount:presets.length,originalHashes,cases,rejected});console.log(JSON.stringify({level,cases,rejected:rejected.length}));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'Read-only installed 20 LOW/HIGH pairs; reconstructed source runtime, no original-game acceptance claim.',rows},null,2)+'\n',{flag:'wx'});
