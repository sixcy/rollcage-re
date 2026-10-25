import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSceneryDraft,inspectScenery,compileSceneryEdits,applySceneryTransform} from '../src/scenery-editor.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {decodeTrackScene} from '../src/track-scene.mjs';
import {buildPlacedMeshes} from '../src/placed-meshes.mjs';
import {buildScriptedEditorMeshes} from '../src/scripted-scenery-editor.mjs';
const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-special-scenery-editor.mjs NEW_REPORT.json [INSTALLATION]');
const sha=data=>createHash('sha256').update(data).digest('hex'),archive=await RollcageArchive.open(installation),tracks=[];
try{for(let level=1;level<=20;level++)for(const quality of ['LOW','HIGH']){
  const t=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`),source={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data},before={geometry:sha(source.geometry),texture:sha(source.texture)},info=inspectScenery(source.geometry,source.texture),original=createSceneryDraft(source.geometry,source.texture,level),identity=compileSceneryEdits(source,original,{level,quality}),cases=[],rejected=[];
  assert.deepEqual(identity.geometry,source.geometry);assert.deepEqual(identity.texture,source.texture);
  const preview=decodeTrackScene(source.geometry,source.texture,{buildPlacedMeshes:(data,gfxm,placements)=>[...buildPlacedMeshes(data,gfxm,placements),...buildScriptedEditorMeshes(data,gfxm,placements)]});assert.ok(preview.bounds.flat().every(Number.isFinite));
  const key=p=>`${p.kind}:${p.class}:${p.bodyType??''}`,classes=new Set(info.filter(p=>p.special&&p.editable).map(key));
  for(const kind of classes)for(const p of info.filter(p=>key(p)===kind&&p.special&&p.editable)){
    const selected=original.find(r=>r.templateIndex===p.index);try{
      const draft=applySceneryTransform(original,{id:selected.id,position:selected.position.map((n,i)=>n+(i===1?-1:0))},info),out=compileSceneryEdits(source,draft,{level,quality}),placements=parsePlacements(out.texture,parseGFXM(out.geometry).models);
      for(const row of draft.filter(r=>p.linkedIndices.includes(r.templateIndex)))assert.deepEqual(placements.records[row.templateIndex].position,row.position);
      const a=parsePlacements(source.texture,parseGFXM(source.geometry).models).records[p.index].raw,b=placements.records[p.index].raw;for(let i=0;i<56;i++)if(![8,9,10,11,12,13,16,17].includes(i))assert.equal(a[i],b[i]);
      if(p.kind==='animated'){const meshes=buildScriptedEditorMeshes(out.geometry,parseGFXM(out.geometry),placements);assert.ok(meshes.flatMap(m=>m.vertices.flat()).every(Number.isFinite));}
      cases.push({kind,placement:p.index,linked:p.linkedIndices,attachmentHandles:[...a.subarray(46)].some(Boolean)});break;
    }catch(error){rejected.push({class:kind,placement:p.index,error:error.message});}
  }
  assert.equal(cases.length,classes.size,'Every present special class must have an accepted edit');
  assert.equal(sha(source.geometry),before.geometry);assert.equal(sha(source.texture),before.texture);
  tracks.push({level,quality,sourceHashes:before,noEditIdentity:true,ordinary:info.filter(p=>p.kind==='ordinary').length,scripted:info.filter(p=>p.kind!=='ordinary').length,transformable:info.filter(p=>p.editable).length,placeable:info.filter(p=>p.importable).length,preview:{instances:preview.instances,texturePages:preview.textures.size,triangles:preview.triangles,finiteBounds:true},classes:[...classes],cases,rejected});console.log(JSON.stringify({level,quality,transformable:tracks.at(-1).transformable,cases:cases.length,rejected:rejected.length}));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'Read-only installed 40 variants and editor compilation. No original process launch or native special-object export acceptance claim.',tracks},null,2)+'\n',{flag:'wx'});
