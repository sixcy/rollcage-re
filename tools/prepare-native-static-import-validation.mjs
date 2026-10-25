// Stages the formerly blocked LEV3/model19 -> LEV1 import; never launches a game.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename,stat,copyFile,constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareNativePhysicsCapture} from './prepare-native-physics-capture.mjs';
import {createNativePickupEditorValidationConfig,writePickupArchiveParts} from './prepare-native-pickup-editor-validation.mjs';
import {buildNativeSceneryObservation} from './lib/native-scenery-editor-fixture.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {buildEditedArchive} from '../src/archive-write.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSceneryDraft,inspectScenery} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {readModelMaterials} from '../src/model-materials.mjs';
import {parseBTP} from '../src/btp.mjs';
const [output,quality='LOW',installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);if(!output||!['LOW','HIGH'].includes(quality))throw Error('Usage: node tools/prepare-native-static-import-validation.mjs NEW_DIRECTORY LOW|HIGH [INSTALLATION]');
const sha=d=>createHash('sha256').update(d).digest('hex'),root=path.resolve(output),game=getGame('rollcage'),archive=await RollcageArchive.open(path.resolve(installation)),sources=new Map();
try{
  for(const level of [1,3]){const pair={};for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}sources.set(level,pair);}
  const pair=sources.get(1),template=inspectScenery(sources.get(3).LOW.geometry,sources.get(3).LOW.texture).find(p=>p.modelIndex===19&&p.importable);assert.equal(template.index,42);const models=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,1);models.push({id:'native-static-import',sourceLevel:3,templateIndex:template.index,position:[0,0,0],yaw:template.yaw});
  const compiled=compileTrackDraft(pair,{level:1,models,pickups:createPickupDraft(pair.LOW.geometry)},sources),selected=compiled[quality],index=selected.indices['native-static-import'],observed=buildNativeSceneryObservation(selected.geometry,selected.texture,[{index}]),btp=parseBTP(selected.texture),gfxm=parseGFXM(selected.geometry),placement=parsePlacements(selected.texture,gfxm.models).records[index],faces=readModelMaterials(selected.geometry,gfxm.models[placement.modelIndex],placement.uvStarts[0]),pages=[...new Set(faces.map(f=>f.page))].sort((a,b)=>a-b);
  observed.importedTextureCount=btp.textureCount;observed.importedTextures=pages.map(id=>({id,width:btp.textures[id].width,height:btp.textures[id].height}));for(const [i,offset]of [...new Set(faces.map(f=>f.descriptor))].entries()){if(observed.spans.length>=16)break;observed.spans.push({id:'scenery-import-material-'+i,offset,length:12,expectedHex:selected.geometry.subarray(offset,offset+12).toString('hex')});}
  await prepareNativePhysicsCapture(path.resolve(installation),root);await mkdir(path.join(root,'original-archives'));for(const ext of ['img','idx'])await rename(path.join(root,'installation/IDXData/Rollcage.'+ext),path.join(root,'original-archives/Rollcage.'+ext));
  const replacements=new Map();for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===`${q}/LEV1.BLP`);replacements.set(t.index,compiled[q].geometry);replacements.set(t.textureIndex,compiled[q].texture);}const originalImage=path.join(root,'original-archives/Rollcage.img'),plan=buildEditedArchive(archive.indexData,(await stat(originalImage)).size,replacements);await writePickupArchiveParts(originalImage,path.join(root,'installation/IDXData/Rollcage.img'),plan);await writeFile(path.join(root,'installation/IDXData/Rollcage.idx'),plan.index,{flag:'wx'});
  const imageSha256=sha(await readFile(path.join(root,'installation/IDXData/Rollcage.img'))),config=createNativePickupEditorValidationConfig(root,{kind:'baseline',quality,compiledData:selected.geometry,indexSha256:sha(plan.index),imageSha256,frontendLevel:1});config.sceneryEditorObservation=observed;config.breakpoints.push({id:'pickup-scenery-world',rva:'0x4d120',ranges:[]},{id:'pickup-scenery-contact',rva:'0x25e2b',ranges:[]});
  await writeFile(path.join(root,'scenery-capture-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});const expected={profile:'static-import',quality,level:1,models,probe:observed,changes:{added:index,sourceLevel:3,sourceModel:19,templateIndex:42},materialWords:[...new Set(faces.map(f=>f.pageWord))],sourceHashes:Object.fromEntries(['LOW','HIGH'].map(q=>[q,{geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)}])),resourceSha256:sha(selected.geometry),textureSha256:sha(selected.texture),scope:'Original static import construction, complete live BTP texture count, imported material descriptors, actual logical texture-map upload IDs and initialized texel-center lookup tables. Does not claim pixel-perfect native GPU rendering or a complete race.'};await writeFile(path.join(root,'scenery-expected.json'),JSON.stringify(expected,null,2)+'\n',{flag:'wx'});
  await copyFile('tools/lib/static-import-native-debugger.cs',path.join(root,'observer-source.cs'),constants.COPYFILE_EXCL);await copyFile('tools/native-static-import-capture.ps1',path.join(root,'observer-wrapper.ps1'),constants.COPYFILE_EXCL);console.log(JSON.stringify({root,quality,index,pages,materialWords:expected.materialWords,textureCount:btp.textureCount,spans:observed.spans.length}));
}finally{await archive.close();}
