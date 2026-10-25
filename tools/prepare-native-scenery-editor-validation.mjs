// Stages a complete move/yaw/delete/add export for native loading acceptance.
// Installed source archives are always read-only; this script never launches a game.
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
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
const [output,quality='LOW',installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);
if(!output||!['LOW','HIGH'].includes(quality))throw Error('Usage: node tools/prepare-native-scenery-editor-validation.mjs NEW_DIRECTORY LOW|HIGH [PRISTINE_INSTALLATION]');
const sha=d=>createHash('sha256').update(d).digest('hex'),root=path.resolve(output),game=getGame('rollcage'),level=10,archive=await RollcageArchive.open(path.resolve(installation)),pair={};
try{
 for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV10.BLP');pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}
 const original=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),models=structuredClone(original).filter(p=>p.id!=='original-22'),moved=models.find(p=>p.id==='original-21');assert.ok(moved);moved.position[0]+=16;moved.yaw+=1024;
 const added={...structuredClone(original.find(p=>p.id==='original-21')),id:'native-added',position:[-2670,-540,7450],yaw:512};models.push(added);
 const compiled=compileTrackDraft(pair,{level,models,pickups:createPickupDraft(pair.LOW.geometry)}),selected=compiled[quality],observed=buildNativeSceneryObservation(selected.geometry,selected.texture,[{index:21},{index:22,present:false},{index:selected.indices['native-added']}]);
 await prepareNativePhysicsCapture(path.resolve(installation),root);await mkdir(path.join(root,'original-archives'));
 for(const ext of ['img','idx'])await rename(path.join(root,'installation/IDXData/Rollcage.'+ext),path.join(root,'original-archives/Rollcage.'+ext));
 const replacements=new Map();for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV10.BLP');replacements.set(t.index,compiled[q].geometry);replacements.set(t.textureIndex,compiled[q].texture);}
 const image=path.join(root,'original-archives/Rollcage.img'),plan=buildEditedArchive(archive.indexData,(await stat(image)).size,replacements);await writePickupArchiveParts(image,path.join(root,'installation/IDXData/Rollcage.img'),plan);await writeFile(path.join(root,'installation/IDXData/Rollcage.idx'),plan.index,{flag:'wx'});
 const imageSha256=sha(await readFile(path.join(root,'installation/IDXData/Rollcage.img'))),config=createNativePickupEditorValidationConfig(root,{kind:'baseline',quality,compiledData:selected.geometry,indexSha256:sha(plan.index),imageSha256,frontendLevel:level});config.sceneryEditorObservation=observed;config.pickupEditorObservation.level=level;config.pickupEditorObservation.sceneName=quality+'/LEV10.BLP';config.breakpoints.push({id:'pickup-scenery-world',rva:'0x4d120',ranges:[]});config.breakpoints.push({id:'pickup-scenery-contact',rva:'0x25e2b',ranges:[]});
 await writeFile(path.join(root,'scenery-capture-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 const expected={quality,level,models,changes:{moved:21,deleted:22,added:selected.indices['native-added'],movedYaw:1024,addedYaw:512},probe:observed,sourceHashes:Object.fromEntries(['LOW','HIGH'].map(q=>[q,{geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)}])),resourceSha256:sha(selected.geometry),textureSha256:sha(selected.texture),scope:'Native loading and constructed move/yaw/delete/add state, collision bytes, spatial-node words and relocated static links. An actual collision response is not claimed.'};
 await writeFile(path.join(root,'scenery-expected.json'),JSON.stringify(expected,null,2)+'\n',{flag:'wx'});
 await copyFile('tools/lib/scenery-editor-native-debugger.cs',path.join(root,'observer-source.cs'),constants.COPYFILE_EXCL);await copyFile('tools/native-scenery-editor-capture.ps1',path.join(root,'observer-wrapper.ps1'),constants.COPYFILE_EXCL);
 console.log(JSON.stringify({root,quality,level,changes:expected.changes,spans:observed.spans.length,links:observed.links.length,configuration:path.join(root,'scenery-capture-config.json')}));
}finally{await archive.close();}
