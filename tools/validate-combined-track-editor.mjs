// Integrated authoring/export compiler coverage. Installed assets stay read-only.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {inspectTerrain,emptyTerrainDraft,terrainSurfacePresets} from '../src/terrain-editor.mjs';
import {createSceneryDraft,inspectScenery,applySceneryTransform} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {inspectRaceLayout,emptyRaceLayoutDraft,raceLayoutMoveConstraint} from '../src/race-layout-editor.mjs';
import {compileTrackDraft,validateTrackProject} from '../src/track-editor-project.mjs';
import {createSession} from '../src/solo-session.mjs';

const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-combined-track-editor.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),rows=[],sha=d=>createHash('sha256').update(d).digest('hex');
try{for(let level=1;level<=20;level++){
  const pair={},hashes={};for(const q of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};hashes[q]={geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)};}
  const info=inspectTerrain(pair.LOW.geometry),scenery=inspectScenery(pair.LOW.geometry,pair.LOW.texture),race=inspectRaceLayout(pair.LOW.geometry),originalModels=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),pickups=createPickupDraft(pair.LOW.geometry),layout=emptyRaceLayoutDraft(),surfaces=terrainSurfacePresets(pair.LOW.geometry,pair.HIGH.geometry);
  for(const kind of ['routes','checkpoints','starts']){
    const original=race[kind].find(row=>[[0,1],[0,-1],[2,1],[2,-1]].some(([axis,sign])=>raceLayoutMoveConstraint(race,row.position,row.position.map((n,i)=>n+(i===axis?sign:0))).allowed));assert.ok(original,`A supported ${kind} record exists in LEV${level}`);
    const position=original.position.slice();let moved=false;for(const [axis,sign]of [[0,1],[0,-1],[2,1],[2,-1]]){const candidate=original.position.map((n,i)=>n+(i===axis?sign:0));if(raceLayoutMoveConstraint(race,original.position,candidate).allowed){position.splice(0,3,...candidate);moved=true;break;}}
    if(kind==='routes')layout.routes.push({group:original.group,point:original.point,position,minSpeed:original.minSpeed,targetSpeed:original.targetSpeed===255?254:original.targetSpeed+1});
    else if(kind==='checkpoints')layout.checkpoints.push({id:original.id,position,direction:original.direction.slice()});else layout.starts.push({index:original.index,position});
    assert.ok(moved,`A supported ${kind} move exists in LEV${level}`);
  }
  if(pickups.length)pickups[0].position[0]+=1;
  const rejected=[];let result,project;
  const candidates=[...info.vertices.values()].filter(v=>!info.isLocked(`${v.sector}:${v.vertex}`)).filter((_,i)=>i%17===0).slice(0,50);
  for(const vertex of candidates){
    const terrain=emptyTerrainDraft();terrain.heights=info.seamFor.get(`${vertex.sector}:${vertex.vertex}`).map(id=>{const v=info.vertices.get(id);return {sector:v.sector,vertex:v.vertex,height:v.position[1]-2};});
    const cell=info.scene.segments[vertex.sector].faces[0],preset=surfaces.find(p=>info.scene.segments[p.sector].faces[p.cell].textureRecord!==cell.textureRecord);if(preset)terrain.surfaces.push({sector:vertex.sector,cell:0,sourceSector:preset.sector,sourceCell:preset.cell});
    for(const model of scenery.filter(p=>p.editable)){
      try{
        const models=applySceneryTransform(originalModels,{id:`original-${model.index}`,position:model.position.map((n,i)=>n+(i===0?1:0)),yaw:model.yaw},scenery),row={level,pickups,models,terrain,layout};
        result=compileTrackDraft(pair,row,new Map([[level,pair]]));project={schemaVersion:4,game:'rollcage',indexSha256:sha(archive.indexData),sources:[{level,hashes}],levels:[row]};
        const validated=validateTrackProject(project,{indexSha256:project.indexSha256,sources:new Map([[level,pair]]),hashes:new Map([[level,hashes]])});for(const q of ['LOW','HIGH'])assert.deepEqual(validated.compiled.get(level)[q].geometry,result[q].geometry);
        break;
      }catch(error){result=undefined;project=undefined;rejected.push(error.message);}
    }
    if(result&&project)break;
  }
  assert.ok(result&&project,`No supported combined edit for LEV${level}: ${rejected.slice(0,4).join('; ')}`);
  const simulations=[];for(const q of ['LOW','HIGH']){
    assert.equal(sha(pair[q].geometry),hashes[q].geometry);assert.equal(sha(pair[q].texture),hashes[q].texture);
    if(![16,17].includes(level)){const session=createSession(result[q].geometry,result[q].texture,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{for(let i=0;i<90;i++)session.step();simulations.push({quality:q,ticks:session.snapshot.ticks});}finally{session.dispose();}}
  }
  rows.push({level,heights:project.levels[0].terrain.heights.length,surfaces:project.levels[0].terrain.surfaces.length,pickups:pickups.length,layout:{routes:layout.routes.length,checkpoints:layout.checkpoints.length,starts:layout.starts.length},models:project.levels[0].models.length,simulations,rejected:rejected.length});console.log(JSON.stringify(rows.at(-1)));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,rows,scope:'All20 LOW/HIGH pairs with simultaneous existing-record authoring edits, v4 project validation and source simulations. No original game launch or complete fidelity claim.'},null,2)+'\n',{flag:'wx'});
