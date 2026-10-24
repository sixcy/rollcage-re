import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {SCENERY_LEVELS,createSceneryDraft,inspectScenery} from '../src/scenery-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {parseStaticModelLinks} from '../src/model-links.mjs';
import {parseModelCollision,readPlacementCollision} from '../src/model-collision.mjs';
import {createSession} from '../src/solo-session.mjs';

const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/validate-scenery-editor.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),sources=new Map(),levels=[],game=getGame('rollcage');
function checkCompiled(compiled){for(const quality of ['LOW','HIGH']){const c=compiled[quality],gfxm=parseGFXM(c.geometry),p=parsePlacements(c.texture,gfxm.models),spatial=parseSpatialIndex(c.geometry);parseStaticModelLinks(c.geometry,spatial,p);for(const row of p.records)if(row.type===0)readPlacementCollision(c.geometry,row,parseModelCollision(c.geometry,gfxm.models[row.modelIndex]));game.decodeTrack(c.geometry,c.texture);}}
let report;
try{
  for(const level of SCENERY_LEVELS){const pair={};for(const q of ['LOW','HIGH']){const track=game.tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(track.index)).data,texture:(await archive.readResource(track.textureIndex)).data};}sources.set(level,pair);}
  for(const [level,pair]of sources){
    const models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),pickups=createPickupDraft(pair.LOW.geometry),info=inspectScenery(pair.LOW.geometry,pair.LOW.texture),safe=info.filter(p=>p.editable&&inspectScenery(pair.HIGH.geometry,pair.HIGH.texture).find(h=>h.index===p.index)?.editable);
    const row={level,objects:models.length,editable:safe.length,unchanged:true,delete:false,moveYaw:false,duplicate:false,refusals:[]};
    const original=compileTrackDraft(pair,{level,pickups,models},sources);for(const q of ['LOW','HIGH']){assert.deepEqual(original[q].geometry,pair[q].geometry);assert.deepEqual(original[q].texture,pair[q].texture);}
    if(safe.length){const removed=models.filter(m=>m.templateIndex!==safe[0].index),deleted=compileTrackDraft(pair,{level,pickups,models:removed},sources);checkCompiled(deleted);row.delete=true;
      for(const prop of safe){const draft=structuredClone(models),p=draft.find(m=>m.templateIndex===prop.index);p.position[0]+=16;p.yaw=1024;
        try{checkCompiled(compileTrackDraft(pair,{level,pickups,models:draft},sources));row.moveYaw=true;row.movedTemplate=prop.index;break;}catch(e){row.refusals.push(e.message);}}
      for(const prop of safe){const duplicate={id:'validation-copy',sourceLevel:level,templateIndex:prop.index,position:prop.position,yaw:prop.yaw};try{checkCompiled(compileTrackDraft(pair,{level,pickups,models:[...models,duplicate]},sources));row.duplicate=true;row.duplicatedTemplate=prop.index;break;}catch(e){row.refusals.push(e.message);}}
    }
    row.refusals=[...new Set(row.refusals)];levels.push(row);
  }
  const target=18,donor=sources.get(2),pair=sources.get(target),models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,target),position=inspectScenery(pair.LOW.geometry,pair.LOW.texture).find(p=>p.editable).position;
  const foreign={id:'validation-foreign',sourceLevel:2,templateIndex:60,position,yaw:1024},compiled=compileTrackDraft(pair,{level:target,pickups:createPickupDraft(pair.LOW.geometry),models:[...models,foreign]},sources);checkCompiled(compiled);
  const ticks=120,session=createSession(compiled.LOW.geometry,compiled.LOW.texture,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{for(let i=0;i<ticks;i++)session.step();assert.equal(session.snapshot.ticks,ticks);}finally{session.dispose();}
  report={passed:true,levels,qualityPairs:levels.length,crossLibrary:{target,donor:2,template:60,qualities:['LOW','HIGH'],sourceRuntimeTicks:ticks},limits:['Synthetic/corpus/source/browser checks do not establish original-process rendering or collision parity.','Spatial membership is conservative, bounded by native candidate-list limits.','Only plain unlinked class-7 scenery is editable; source archives were opened read-only.']};
}catch(error){report={passed:false,levels,error:error.stack};process.exitCode=1;}finally{await archive.close();}
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:report.passed,pairs:report.qualityPairs,editableLevels:levels.filter(l=>l.editable).length,moveYaw:levels.filter(l=>l.moveYaw).length,duplicate:levels.filter(l=>l.duplicate).length,error:report.error,output}));
