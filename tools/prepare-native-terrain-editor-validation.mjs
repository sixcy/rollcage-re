// Creates a new isolated installation and an export from the same terrain
// compiler used by the browser. Original game/assets are always read-only.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareNativePhysicsCapture} from './prepare-native-physics-capture.mjs';
import {createNativePickupEditorValidationConfig,writePickupArchiveParts} from './prepare-native-pickup-editor-validation.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {buildEditedArchive} from '../src/archive-write.mjs';
import {getGame} from '../src/track-games.mjs';
import {inspectTerrain,terrainSurfacePresets} from '../src/terrain-editor.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {createSession} from '../src/solo-session.mjs';
import {intersectTerrain} from './track-viewer/pickup-picking.mjs';
const [output,quality='LOW',installation='analysis/pickup-editor-native-baseline-20261024/installation',levelText='1']=process.argv.slice(2),level=Number(levelText);
if(!output||!['LOW','HIGH'].includes(quality)||![1,16,17].includes(level))throw Error('Usage: node tools/prepare-native-terrain-editor-validation.mjs NEW_DIRECTORY LOW|HIGH [PRISTINE_INSTALLATION] [LEVEL=1|16|17]');
const sha=d=>createHash('sha256').update(d).digest('hex'),root=path.resolve(output),game=getGame('rollcage'),archive=await RollcageArchive.open(path.resolve(installation)),pair={};
let compiled,terrain,probe;
try{
 for(const q of ['LOW','HIGH']){const t=game.tracks.find(t=>t.name===`${q}/LEV${level}.BLP`);pair[q]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}
 const scene=game.decodeTrack(pair.LOW.geometry,pair.LOW.texture),info=inspectTerrain(pair.LOW.geometry),points=[];
 if(level===1){const s=createSession(pair.LOW.geometry,pair.LOW.texture,{vehicleTypes:[0,1,2,3,4,5],aiDifficulty:2});points.push(...s.snapshot.cars.map(c=>c.position));s.dispose();}
 const cells=new Map();for(const p of points){const hit=intersectTerrain(scene,{origin:[p[0],-p[1]+1000,-p[2]],direction:[0,-1,0]});assert.ok(hit&&hit.cell!==null);cells.set(`${hit.sector}:${hit.cell}`,{sector:hit.sector,cell:hit.cell});}
 if(level!==1)cells.set('0:17',{sector:0,cell:17});
 const heights=new Map(),surfaces=[],presets=terrainSurfacePresets(pair.LOW.geometry,pair.HIGH.geometry);
 for(const cell of cells.values()){
  const sector=info.scene.segments[cell.sector],face=sector.faces[cell.cell];for(const vertex of face.gridIndices)for(const id of info.seamFor.get(`${cell.sector}:${vertex}`)){const v=info.vertices.get(id);heights.set(id,{sector:v.sector,vertex:v.vertex,height:v.position[1]-4});}
  const preset=presets.find(p=>info.scene.segments[p.sector].faces[p.cell].textureRecord!==face.textureRecord&&p.gripReduction>0)??presets.find(p=>info.scene.segments[p.sector].faces[p.cell].textureRecord!==face.textureRecord);assert.ok(preset);surfaces.push({...cell,sourceSector:preset.sector,sourceCell:preset.cell});
 }
 terrain={heights:[...heights.values()].sort((a,b)=>a.sector-b.sector||a.vertex-b.vertex),surfaces};
 compiled=compileTrackDraft(pair,{level,models:createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),pickups:createPickupDraft(pair.LOW.geometry),terrain});
 const data=compiled[quality].geometry,after=inspectTerrain(data),spans=[],add=(id,offset,length)=>spans.push({id,offset,length,expectedHex:data.subarray(offset,offset+length).toString('hex')});
 for(const [i,h]of terrain.heights.slice(0,6).entries())add(`terrain-vertex-${i}`,after.vertices.get(`${h.sector}:${h.vertex}`).offset,6);
 for(const [i,c]of terrain.surfaces.slice(0,2).entries()){const sector=after.scene.segments[c.sector],packet=sector.packetsOffset+c.cell*8;add(`terrain-packet-${i}`,packet+2,6);add(`terrain-normal-${i}`,data.readUInt32LE(0x34)+data.readUInt16LE(packet+2)*4,8);add(`terrain-surface-${i}`,after.scene.uvTable+data.readUInt32LE(packet+4)*16,16);}
 probe={spans,requireContact:level===1,allowedCellRefs:[...cells.values()].map(c=>{const s=info.scene.segments[c.sector];return (c.sector|((c.cell%s.columns)<<8)|(Math.floor(c.cell/s.columns)<<16))|0;})};
 await prepareNativePhysicsCapture(path.resolve(installation),root);
 await mkdir(path.join(root,'original-archives'));for(const ext of ['img','idx'])await rename(path.join(root,`installation/IDXData/Rollcage.${ext}`),path.join(root,`original-archives/Rollcage.${ext}`));
 const replacements=new Map();for(const q of ['LOW','HIGH'])replacements.set(game.tracks.find(t=>t.name===`${q}/LEV${level}.BLP`).index,compiled[q].geometry);
 const image=path.join(root,'original-archives/Rollcage.img'),imageSize=(await stat(image)).size,plan=buildEditedArchive(archive.indexData,imageSize,replacements);
 await writePickupArchiveParts(image,path.join(root,'installation/IDXData/Rollcage.img'),plan);await writeFile(path.join(root,'installation/IDXData/Rollcage.idx'),plan.index,{flag:'wx'});
 const imageSha256=sha(await readFile(path.join(root,'installation/IDXData/Rollcage.img'))),configuration=createNativePickupEditorValidationConfig(root,{kind:'baseline',quality,compiledData:data,indexSha256:sha(plan.index),imageSha256,frontendLevel:level});configuration.terrainEditorObservation=probe;configuration.pickupEditorObservation.level=level;configuration.pickupEditorObservation.sceneName=`${quality}/LEV${level}.BLP`;
 configuration.breakpoints.push({id:'pickup-terrain-contact',rva:'0x25e2b',ranges:[]});
 await writeFile(path.join(root,'terrain-capture-config.json'),JSON.stringify(configuration,null,2)+'\n',{flag:'wx'});
 await writeFile(path.join(root,'terrain-expected.json'),JSON.stringify({quality,level,terrain,probe,sourceHashes:{LOW:sha(pair.LOW.geometry),HIGH:sha(pair.HIGH.geometry)},resourceSha256:sha(data),scope:level===1?'Exported LEV1 starting-grid lift and surface presets; contact observation required.':'Native level-specific loading/initialization only. AI race and native edited-cell contact are not claimed.'},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({root,quality,heights:terrain.heights.length,surfaces:surfaces.length,spans:spans.length,configuration:path.join(root,'terrain-capture-config.json')}));
}finally{await archive.close();}
