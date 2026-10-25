import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {inspectScenery,createSceneryDraft,compileSceneryEdits,instantiateSceneryAssembly} from '../src/scenery-editor.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {parseStaticModelLinks} from '../src/model-links.mjs';
import {parseModelCollision,readPlacementCollision} from '../src/model-collision.mjs';
const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-scenery-assemblies.mjs NEW_REPORT.json [INSTALLATION]');
const sha=data=>createHash('sha256').update(data).digest('hex'),archive=await RollcageArchive.open(installation),tracks=[];
try{for(let level=1;level<=20;level++)for(const quality of ['LOW','HIGH']){
  const t=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`),source={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data},before={geometry:sha(source.geometry),texture:sha(source.texture)},original=createSceneryDraft(source.geometry,source.texture,level),info=inspectScenery(source.geometry,source.texture),identity=compileSceneryEdits(source,original,{level,quality}),cases=[],rejected=[];
  assert.deepEqual(identity.geometry,source.geometry);assert.deepEqual(identity.texture,source.texture);
  const candidates=info.filter(p=>p.assemblyDuplicable),targets=level===1?[31,...candidates.filter(p=>p.index!==31).map(p=>p.index)]:candidates.map(p=>p.index),kinds=new Set();
  for(const index of targets){const p=info.find(p=>p.index===index);if(!p?.assemblyDuplicable)continue;const kind=`${p.class}:${p.assemblyDependencyPlan.attachments.map(a=>a.type).sort().join('')}:${p.assemblyDependencyPlan.localEffectCount?'local':''}:${p.assemblyMemberIndices.length>1?'chain':'single'}`;if(kinds.has(kind))continue;
    for(const shift of [[0,-1,0],[512,-1,0],[-512,-1,0],[0,-1,512],[0,-1,-512],[1024,-1,0],[0,-1,1024]]){try{
      const instance=instantiateSceneryAssembly(source,index,{id:`assembly-${index}`,level,position:p.position.map((n,i)=>n+shift[i])}),out=compileSceneryEdits(source,original,{level,quality,assemblies:[instance.command]}),gfxm=parseGFXM(out.geometry),placements=parsePlacements(out.texture,gfxm.models),links=parseStaticModelLinks(out.geometry,parseSpatialIndex(out.geometry),placements),result=out.assemblies[0];
      assert.equal(result.memberIndices.length,instance.members.length);assert.equal(new Set(result.memberIndices).size,instance.members.length);
      for(const [i,cloneIndex]of result.memberIndices.entries()){const from=placements.records[instance.members[i].templateIndex],clone=placements.records[cloneIndex],collision=parseModelCollision(out.geometry,gfxm.models[clone.modelIndex]),old=readPlacementCollision(out.geometry,from,collision),next=readPlacementCollision(out.geometry,clone,collision);assert.notEqual(old.configurationBase,next.configurationBase);assert.deepEqual(old.configurations.map(c=>c.raw),next.configurations.map(c=>c.raw));assert.deepEqual(clone.position,instance.members[i].position);assert.ok(links.nodes.some(n=>n.placementIndices.includes(cloneIndex)));assert.deepEqual(clone.raw.subarray(24,46),from.raw.subarray(24,46));}
      cases.push({placement:index,kind,command:instance.command,...result,sourcePlacementCount:original.length,placementCount:placements.count});kinds.add(kind);break;
    }catch(error){rejected.push({placement:index,shift,error:error.message});}}
  }
  assert.ok(cases.length,`${quality}/LEV${level} must compile a supported assembly`);if(level===1)assert.ok(cases.some(c=>c.placement===31),'Required LEV1 original31/model6 group10 assembly must compile');
  assert.equal(sha(source.geometry),before.geometry);assert.equal(sha(source.texture),before.texture);
  tracks.push({level,quality,sourceHashes:before,noEditIdentity:true,candidates:candidates.length,cases,rejected});console.log(JSON.stringify({level,quality,candidates:candidates.length,cases:cases.length,rejected:rejected.length}));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,evidence:'Read-only installed resources, native-format compiler invariants. Synthetic reconstructed constructor/destruction checks are separate tests; this report does not claim original-process validation.',tracks},null,2)+'\n',{flag:'wx'});
