// Read-only installed corpus and reconstructed source runtime, no game launch.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseBTP,decodeBTPTexture} from '../src/btp.mjs';
import {parseScene} from '../src/scene.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {readModelMaterials} from '../src/model-materials.mjs';
import {createSceneryDraft,inspectScenery,compileSceneryEdits,inspectSceneryImport} from '../src/scenery-editor.mjs';
import {createSession} from '../src/solo-session.mjs';
const [output,installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-static-model-textures.mjs NEW_REPORT.json [INSTALLATION]');
const sha=b=>createHash('sha256').update(b).digest('hex'),archive=await RollcageArchive.open(installation),sources=new Map(),infos=new Map(),rows=[],imports=[],examples=[];
try{
  for(let level=1;level<=20;level++){
    const pair={},info={};for(const quality of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`),source={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};pair[quality]=source;info[quality]=inspectScenery(source.geometry,source.texture);const original=createSceneryDraft(source.geometry,source.texture,level),compiled=compileSceneryEdits(source,original,{level,quality});assert.deepEqual(compiled.geometry,source.geometry);assert.deepEqual(compiled.texture,source.texture);
      const btp=parseBTP(source.texture),gfxm=parseGFXM(source.geometry),placements=parsePlacements(source.texture,gfxm.models),faces=[...parseScene(source.geometry).segments.flatMap(s=>s.faces),...placements.records.filter(p=>p.type===0).flatMap(p=>readModelMaterials(source.geometry,gfxm.models[p.modelIndex],p.uvStarts[0]))],higher=new Set();for(const face of faces){assert.ok(btp.textures[face.page]&&!btp.textures[face.page].empty,`${quality}/LEV${level} material${face.pageWord.toString(16)} resolves to valid native logical texture`);if(face.page>=64)higher.add(face.page);}
      rows.push({level,quality,sourceHashes:{geometry:sha(source.geometry),texture:sha(source.texture)},noEditIdentity:true,authoredTextures:btp.textureCount,higherLogicalIds:[...higher].sort((a,b)=>a-b),materialReferences:faces.length});
    }sources.set(level,pair);infos.set(level,info);
  }
  // All400 source/destination level combinations use one deterministic ordinary
  // donor with paired eligibility. This is asset preflight, not placement proof.
  for(let sourceLevel=1;sourceLevel<=20;sourceLevel++){
    const template=infos.get(sourceLevel).LOW.find(p=>p.importable&&infos.get(sourceLevel).HIGH.find(h=>h.index===p.index)?.importable);
    if(!template){imports.push({sourceLevel,skipped:'No eligible paired ordinary static model.'});continue;}
    for(let targetLevel=1;targetLevel<=20;targetLevel++)if(sourceLevel!==targetLevel){const pair=sources.get(targetLevel),models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,targetLevel),added={id:'foreign-preflight',sourceLevel,templateIndex:template.index,position:[0,0,0],yaw:template.yaw},checks={};for(const quality of ['LOW','HIGH'])checks[quality]=inspectSceneryImport(pair[quality],[...models,added],{level:targetLevel,quality,donors:sources});imports.push({sourceLevel,targetLevel,templateIndex:template.index,model:template.modelIndex,checks});}
  }
  const pair=sources.get(1),donor=sources.get(3),template=infos.get(3).LOW.find(p=>p.modelIndex===19&&p.importable);assert.equal(template.index,42);const models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,1),added={id:'foreign-model19',sourceLevel:3,templateIndex:template.index,position:[0,0,0],yaw:template.yaw};
  for(const quality of ['LOW','HIGH']){
    const source=pair[quality],out=compileSceneryEdits(source,[...models,added],{level:1,quality,donors:sources}),btp=parseBTP(out.texture),original=parseBTP(source.texture),gfxm=parseGFXM(out.geometry),p=parsePlacements(out.texture,gfxm.models).records[out.indices[added.id]],materials=readModelMaterials(out.geometry,gfxm.models[p.modelIndex],p.uvStarts[0]);for(const t of original.textures.filter(t=>!t.empty))assert.deepEqual(decodeBTPTexture(btp,t.index).rgba,decodeBTPTexture(original,t.index).rgba,'Every original image remains unchanged');
    const donorBTP=parseBTP(donor[quality].texture);for(const allocation of out.textureAllocations)assert.deepEqual(decodeBTPTexture(btp,allocation.targetPage).rgba,decodeBTPTexture(donorBTP,allocation.sourcePage).rgba,'Imported image is lossless');
    let race;const session=createSession(out.geometry,out.texture,{aiDifficulty:2,vehicleTypes:[0,1,2],weaponsEnabled:true});try{for(let tick=0;tick<90;tick++)session.step();assert.equal(session.snapshot.ticks,90);race={ticks:session.snapshot.ticks,cars:session.snapshot.cars.length};}finally{session.dispose();}
    examples.push({target:'LEV1',source:'LEV3/model19',quality,placement:out.indices[added.id],textures:out.textureAllocations,materialWords:[...new Set(materials.map(f=>f.pageWord))],effectivePages:[...new Set(materials.map(f=>f.page))],race});
  }
}finally{await archive.close();}
const compatible=imports.filter(r=>r.checks&&r.checks.LOW.compatible&&r.checks.HIGH.compatible).length,report={passed:true,scope:'All40 original resources and native material reference inventory; read-only static import asset preflight across level pairs; real compiled known-blocked example plus90-tick reconstructed races. No original game execution or GPU rendering claim.',rows,imports,examples,compatibleLevelPairs:compatible};await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,resources:rows.length,assetChecks:imports.filter(r=>r.checks).length,compatibleLevelPairs:compatible,examples,output}));
