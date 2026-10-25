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
import {createSceneryDraft,inspectScenery,applySceneryTransform} from '../src/scenery-editor.mjs';
import {inspectRaceLayout,createRaceLayoutDraft,emptyRaceLayoutDraft,raceLayoutMoveConstraint} from '../src/race-layout-editor.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
const [output,quality='LOW',installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);
if(!output||!['LOW','HIGH'].includes(quality))throw Error('Usage: node tools/prepare-native-combined-editor-validation.mjs NEW_DIRECTORY LOW|HIGH [PRISTINE_INSTALLATION]');
const sha=d=>createHash('sha256').update(d).digest('hex'),root=path.resolve(output),game=getGame('rollcage'),level=1,archive=await RollcageArchive.open(path.resolve(installation)),pair={};
try{
 for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV1.BLP');pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}
 const original=createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),info=inspectScenery(pair.LOW.geometry,pair.LOW.texture),special=info.find(p=>p.kind==='ordinary'&&p.class===2&&p.linkedIndices.length===1&&p.editable),scripted=info.find(p=>p.kind==='animated'&&p.bodyType===25&&p.linkedIndices.length===1&&p.editable),particle=info.find(p=>p.kind==='particle'&&p.bodyType===2);assert.ok(special&&scripted&&particle);
 let models=original;for(const p of [special,scripted,particle])models=applySceneryTransform(models,{id:'original-'+p.index,position:[p.position[0]+1,p.position[1],p.position[2]]},info);
 const layoutInfo=inspectRaceLayout(pair.LOW.geometry),full=createRaceLayoutDraft(pair.LOW.geometry),layout=emptyRaceLayoutDraft();
 const route={...full.routes[0],position:[full.routes[0].position[0]+1,...full.routes[0].position.slice(1)],targetSpeed:full.routes[0].targetSpeed===255?254:full.routes[0].targetSpeed+1};assert.ok(raceLayoutMoveConstraint(layoutInfo,full.routes[0].position,route.position).allowed);layout.routes.push(route);
 const checkpoint={...full.checkpoints[0],position:[full.checkpoints[0].position[0]+1,...full.checkpoints[0].position.slice(1)],direction:[...full.checkpoints[0].direction]};checkpoint.direction[2]++;layout.checkpoints.push(checkpoint);
 const start={...full.starts[0],position:[full.starts[0].position[0]+8,...full.starts[0].position.slice(1)]};assert.ok(raceLayoutMoveConstraint(layoutInfo,full.starts[0].position,start.position).allowed);layout.starts.push(start);
 const compiled=compileTrackDraft(pair,{level,models,pickups:createPickupDraft(pair.LOW.geometry),layout}),selected=compiled[quality],observed=buildNativeSceneryObservation(selected.geometry,selected.texture,[{index:special.index}],{allowedClasses:[2]}),after=inspectRaceLayout(selected.geometry),scriptInfo=inspectScenery(selected.geometry,selected.texture).find(p=>p.index===scripted.index),placements=parsePlacements(selected.texture,parseGFXM(selected.geometry).models),scriptPlacement=placements.records[scripted.index],particlePlacement=placements.records[particle.index];
 Object.assign(observed,{scriptPlacementIndex:scripted.index,scriptBodyType:25,scriptModelOffset:parseGFXM(selected.geometry).models[scripted.modelIndex].offset,scriptIndex:scriptPlacement.raw[38],spawnIndex:scriptPlacement.raw[39],scriptPosition:scriptPlacement.position,particlePlacementIndex:particle.index,particleType:2,particlePosition:particlePlacement.position,startPositions:after.starts.map(p=>p.position),startsOffset:after.startsOffset});
 const add=(id,offset,length)=>{assert.ok(observed.spans.length<16&&length<=64);observed.spans.push({id:'scenery-'+id,offset,length,expectedHex:selected.geometry.subarray(offset,offset+length).toString('hex')});};
 add('edited-route',after.routes.find(p=>p.group===route.group&&p.point===route.point).offset,16);add('edited-checkpoint',after.checkpoints.find(p=>p.id===checkpoint.id).offset,20);add('edited-starting-table',after.startsOffset,48);
 const coordinates=scriptInfo.script.path,commands=scriptInfo.script.commands,sourceScriptOffset=commands[0].offset;add('edited-script-command',sourceScriptOffset,Math.min(64,commands[0].length));const curve=commands.find(c=>c.opcode===3||c.opcode===7);assert.ok(curve);add('edited-script-point',curve.offset+8,12);const spawn=selected.geometry.readUInt32LE(0xa8)+observed.spawnIndex*8;add('edited-script-restart',spawn,8);
 await prepareNativePhysicsCapture(path.resolve(installation),root);await mkdir(path.join(root,'original-archives'));
 for(const ext of ['img','idx'])await rename(path.join(root,'installation/IDXData/Rollcage.'+ext),path.join(root,'original-archives/Rollcage.'+ext));
 const replacements=new Map();for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===q+'/LEV1.BLP');replacements.set(t.index,compiled[q].geometry);replacements.set(t.textureIndex,compiled[q].texture);}
 const image=path.join(root,'original-archives/Rollcage.img'),plan=buildEditedArchive(archive.indexData,(await stat(image)).size,replacements);await writePickupArchiveParts(image,path.join(root,'installation/IDXData/Rollcage.img'),plan);await writeFile(path.join(root,'installation/IDXData/Rollcage.idx'),plan.index,{flag:'wx'});
 const imageSha256=sha(await readFile(path.join(root,'installation/IDXData/Rollcage.img'))),config=createNativePickupEditorValidationConfig(root,{kind:'baseline',quality,compiledData:selected.geometry,indexSha256:sha(plan.index),imageSha256,frontendLevel:level});config.sceneryEditorObservation=observed;config.pickupEditorObservation.level=level;config.pickupEditorObservation.sceneName=quality+'/LEV1.BLP';config.breakpoints.push({id:'pickup-scenery-world',rva:'0x4d120',ranges:[]});config.breakpoints.push({id:'pickup-scenery-contact',rva:'0x25e2b',ranges:[]},{id:'pickup-scripted-built',rva:'0x4cc5b',ranges:[]},{id:'pickup-particle-two-built',rva:'0x4cff1',ranges:[]},{id:'pickup-particle-thirteen-built',rva:'0x4d078',ranges:[]},{id:'pickup-car-spawned',rva:'0x1dc96',ranges:[]});
 await writeFile(path.join(root,'scenery-capture-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 const expected={profile:'combined',nativePurpose:'existing-track-editor-original-validation',quality,level,models,layout,changes:{special:special.index,scripted:scripted.index,particle:particle.index,translation:[1,0,0],route:{group:route.group,point:route.point},checkpoint:checkpoint.id,start:start.index},probe:observed,sourceHashes:Object.fromEntries(['LOW','HIGH'].map(q=>[q,{geometry:sha(pair[q].geometry),texture:sha(pair[q].texture)}])),resourceSha256:sha(selected.geometry),textureSha256:sha(selected.texture),scope:'Native initialization of edited ordinary class2 object, scripted type24 and particle2 translations, route/checkpoint/starting data, and all six cars at their original constructor spawn boundary. Script trajectories, destruction effects, racing fidelity and all editor combinations remain separate.'};
 await writeFile(path.join(root,'scenery-expected.json'),JSON.stringify(expected,null,2)+'\n',{flag:'wx'});
 await copyFile('tools/lib/combined-editor-native-debugger.cs',path.join(root,'observer-source.cs'),constants.COPYFILE_EXCL);await copyFile('tools/native-combined-editor-capture.ps1',path.join(root,'observer-wrapper.ps1'),constants.COPYFILE_EXCL);
 console.log(JSON.stringify({root,quality,level,changes:expected.changes,spans:observed.spans.length,links:observed.links.length,configuration:path.join(root,'scenery-capture-config.json')}));
}finally{await archive.close();}
