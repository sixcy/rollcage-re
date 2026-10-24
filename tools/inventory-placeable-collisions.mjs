// Authored collision metadata, not an original-process contact observation.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {SCENERY_LEVELS,inspectScenery,createSceneryDraft,validateSceneryImport} from '../src/scenery-editor.mjs';
import {inspectSceneryCollisions} from '../src/scenery-collision-info.mjs';
import {decodeObjectCollection} from '../src/object-catalog.mjs';

const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!output)throw Error('Usage: node tools/inventory-placeable-collisions.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),sha=data=>createHash('sha256').update(data).digest('hex'),sources=[],rows=[];
try{
  for(const level of SCENERY_LEVELS){
    const pair={},info={},collision={},hashes={};
    for(const quality of ['LOW','HIGH']){const track=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`),geometry=(await archive.readResource(track.index)).data,texture=(await archive.readResource(track.textureIndex)).data;pair[quality]={geometry,texture};info[quality]=inspectScenery(geometry,texture);collision[quality]=inspectSceneryCollisions(geometry,texture);hashes[quality]={geometry:sha(geometry),texture:sha(texture)};}
    sources.push({level,hashes});
    const catalog=decodeObjectCollection(pair.LOW.geometry,pair.LOW.texture,{game:'rollcage'}),original=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level);
    for(const entry of catalog.entries.filter(e=>e.kind==='scenery'&&e.status==='supported')){
      const template=info.LOW.find(p=>entry.placementIndices.includes(p.index)&&p.editable&&info.HIGH.find(h=>h.index===p.index)?.editable);if(!template)continue;
      const draft=[...original,{id:'inventory-copy',sourceLevel:level,templateIndex:template.index,position:template.position,yaw:template.yaw}];
      for(const quality of ['LOW','HIGH'])validateSceneryImport(pair[quality],draft,{level,quality});
      const LOW=collision.LOW.get(template.index),HIGH=collision.HIGH.get(template.index);
      rows.push({level,model:entry.modelIndex,materialVariant:entry.materialVariant,templateIndex:template.index,LOW,HIGH});
    }
  }
  const enabled=rows.filter(r=>r.LOW.status==='enabled'&&r.HIGH.status==='enabled');
  const report={scope:'Supported static model/material variants with enabled authored collision in both LOW/HIGH; placeable in their own library, subject to location limits. Cross-track texture limits still apply. No native process was run.',indexSha256:sha(archive.indexData),sources,totals:{libraries:sources.length,placeableVariants:rows.length,enabledVariants:enabled.length,disabledVariants:rows.filter(r=>r.LOW.status==='disabled'&&r.HIGH.status==='disabled').length,otherVariants:rows.filter(r=>r.LOW.status!==r.HIGH.status||r.LOW.status==='unknown').length},enabled,rows};
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({totals:report.totals,enabled:enabled.map(r=>({library:r.level,model:r.model,variant:r.materialVariant,lowShapes:r.LOW.activeShapes,highShapes:r.HIGH.activeShapes})),output}));
}finally{await archive.close();}
