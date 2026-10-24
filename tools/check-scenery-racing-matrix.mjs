// Reconstructed JS runtime only; no original game process or archive writes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {SCENERY_LEVELS,createSceneryDraft,inspectScenery} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseStaticModelLinks} from '../src/model-links.mjs';
import {createSession} from '../src/solo-session.mjs';

const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/check-scenery-racing-matrix.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),sources=new Map(),cases=[],issues=[],game=getGame('rollcage');
const options={vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true},longTicks=600;
const links=source=>parseStaticModelLinks(source.geometry,parseSpatialIndex(source.geometry),parsePlacements(source.texture,parseGFXM(source.geometry).models));
function verifyRouteWords(original,compiled){const before=links(original),after=links(compiled);assert.equal(before.nodes.length,after.nodes.length);for(let i=0;i<before.nodes.length;i++)assert.equal(after.entries[after.nodes[i].start],before.entries[before.nodes[i].start],`Route fallback in node ${i}`);}
function run(source,ticks){const s=createSession(source.geometry,source.texture,options);try{for(let i=0;i<ticks;i++)s.step();assert.equal(s.snapshot.ticks,ticks);for(const car of s.snapshot.cars)assert.ok(car.position.every(Number.isFinite));return {ticks,cars:s.snapshot.cars.length,modelHits:s.snapshot.cars.map(c=>c.physics.modelHits)};}finally{s.dispose();}}
try{
  for(const level of SCENERY_LEVELS){const pair={};for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}sources.set(level,pair);}
  for(const [level,pair]of sources){
    const low=inspectScenery(pair.LOW.geometry,pair.LOW.texture),high=inspectScenery(pair.HIGH.geometry,pair.HIGH.texture),safe=low.filter(p=>p.editable&&high.find(h=>h.index===p.index)?.editable).sort((a,b)=>level===3?Number(b.modelIndex===27)-Number(a.modelIndex===27):0);
    let models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),compiled,accepted=[];const pickups=createPickupDraft(pair.LOW.geometry),seen=new Set(),row={level,added:accepted,rejected:[],starts:[],races:[]};
    for(const template of safe){if(accepted.length===3)break;if(seen.has(template.modelIndex))continue;seen.add(template.modelIndex);
      const n=accepted.length,added={id:`matrix-${n}`,sourceLevel:level,templateIndex:template.index,position:template.position.map((v,i)=>v+(i===0?16*(n+1):i===2?16*(n%2):0)),yaw:template.yaw+16},draft=[...models,added];
      let next;try{next=compileTrackDraft(pair,{level,pickups,models:draft},sources);}catch(error){row.rejected.push({model:template.modelIndex,reason:error.message});continue;}
      for(const quality of ['LOW','HIGH']){verifyRouteWords(pair[quality],next[quality]);try{row.starts.push({quality,afterModels:n+1,...run(next[quality],3)});}catch(error){issues.push({level,quality,afterModels:n+1,stage:'restart',error:error.stack});}}
      models=draft;compiled=next;accepted.push({model:template.modelIndex,template:template.index,position:added.position,yaw:added.yaw});
    }
    if(compiled)for(const quality of ['LOW','HIGH']){try{row.races.push({quality,...run(compiled[quality],longTicks)});}catch(error){issues.push({level,quality,stage:'long-race',error:error.stack});}}
    cases.push(row);console.log(JSON.stringify({level,models:accepted.length,starts:row.starts.length,races:row.races.length,issues:issues.length}));
  }
  // An actual cross-library dependency copy exercises a different allocation
  // layout and HIGH texture mapping as well as preserved per-node route words.
  const level=18,pair=sources.get(level),models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),donor=sources.get(2),point=parsePlacements(pair.LOW.texture,parseGFXM(pair.LOW.geometry).models).records[1].position;
  const compiled=compileTrackDraft(pair,{level,pickups:createPickupDraft(pair.LOW.geometry),models:[...models,{id:'foreign',sourceLevel:2,templateIndex:60,position:point,yaw:1024}]},sources);
  const cross={level,sourceLevel:2,model:inspectScenery(donor.LOW.geometry,donor.LOW.texture).find(p=>p.index===60).modelIndex,races:[]};
  for(const quality of ['LOW','HIGH']){verifyRouteWords(pair[quality],compiled[quality]);try{cross.races.push({quality,...run(compiled[quality],longTicks)});}catch(error){issues.push({level,quality,stage:'cross-library-race',error:error.stack});}}
  cases.push(cross);
}catch(error){issues.push({stage:'matrix',error:error.stack});}finally{await archive.close();}
const report={passed:issues.length===0,cases,issues,longTicks,scope:'Read-only installed assets; reconstructed JavaScript runtime, no original-process physics parity claim.'};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:report.passed,cases:cases.length,restarts:cases.reduce((n,c)=>n+(c.starts?.length??0),0),races:cases.reduce((n,c)=>n+c.races.length,0),issues,output}));if(issues.length)process.exitCode=1;
