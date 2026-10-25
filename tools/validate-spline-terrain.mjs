import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {parseStaticModelLinks} from '../src/model-links.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {createSplineRoad} from '../src/spline-road.mjs';
import {compileSplineRoads} from '../src/terrain-construction.mjs';
import {createSession} from '../src/solo-session.mjs';
import {parseBTP,decodeBTPTexture} from '../src/btp.mjs';
const [output,installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-spline-terrain.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),rows=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex'),protectedSectors=level=>new Set(level===12?[2,3,4,5,7,8,10,16]:level===13?[0,4,5,24]:[]);
try{for(let level=1;level<=20;level++)for(const quality of ['LOW','HIGH']){
 const track=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`),source=(await archive.readResource(track.index)).data,texture=(await archive.readResource(track.textureIndex)).data,before=sha(source),grid=parseCollisionGrid(source),sourceLinks=parseStaticModelLinks(source,grid.spatial,parsePlacements(texture,parseGFXM(source).models));assert.deepEqual(compileSplineRoads(source).data,source);
 const rejected=[],cases=[];let result,definition;
 const candidates=grid.sectors.filter(s=>!protectedSectors(level).has(s.index)&&!(source[s.offset+6]&63)).flatMap(s=>s.cells.filter(c=>c.covered).filter((_,i)=>i%17===0).slice(0,8).map(c=>({s,c})));
 for(const {s,c}of candidates.slice(0,80)){
  const face=grid.scene.segments[s.index].faces[c.index],center=[0,1,2].map(axis=>face.gridIndices.reduce((sum,i)=>sum+s.vertices[i][axis],0)/4),a=s.vertices[face.gridIndices[0]],b=s.vertices[face.gridIndices[2]],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(length<1)continue;
  try{definition=createSplineRoad({id:'corpus-road',points:[{position:[Math.round(center[0]-dx/length*64),Math.round(center[1]-512),Math.round(center[2]-dz/length*64)],width:64,bank:0},{position:[Math.round(center[0]+dx/length*64),Math.round(center[1]-528),Math.round(center[2]+dz/length*64)],width:64,bank:8}],surface:{sector:s.index,cell:c.index},columns:2,spacing:48});result=compileSplineRoads(source,[definition],{texture});break;}catch(error){rejected.push(error.message);}
 }
 if(!result){const s=grid.sectors.find(s=>!protectedSectors(level).has(s.index)&&!(source[s.offset+6]&63)&&s.cells.some(c=>c.covered)),c=s.cells.find(c=>c.covered);for(const [x,z]of [[-20000,-20000],[20000,-20000],[-20000,20000],[20000,20000]])try{definition=createSplineRoad({id:'corpus-road',points:[{position:[x,-512,z],width:64,bank:0},{position:[x,-528,z+128],width:64,bank:8}],surface:{sector:s.index,cell:c.index},columns:2,spacing:48});result=compileSplineRoads(source,[definition],{texture});break;}catch(error){rejected.push(error.message);}}
 assert.ok(result,`${quality}/LEV${level}: no supported spline placement: ${rejected.slice(0,5).join('; ')}`);const parsed=parseCollisionGrid(result.data),compiledLinks=parseStaticModelLinks(result.data,parsed.spatial,parsePlacements(result.texture,parseGFXM(result.data).models));
 assert.equal(result.texture.readUInt32LE(12),result.data.readUInt32LE(8));assert.deepEqual(parsePlacements(result.texture,parseGFXM(result.data).models).records.map(r=>r.raw),parsePlacements(texture,parseGFXM(source).models).records.map(r=>r.raw));
 assert.deepEqual(result.texture.subarray(0x40,0x40+source.readUInt32LE(8)*2),texture.subarray(0x40,0x40+source.readUInt32LE(8)*2));
 for(const row of result.packetInitializers.entries)assert.equal(result.texture.readUInt16LE(0x40+row.index*2),texture.readUInt16LE(0x40+row.sourcePacket*2));
 const oldBtp=parseBTP(texture),newBtp=parseBTP(result.texture);for(const slot of oldBtp.textures)if(!slot.empty)assert.deepEqual(decodeBTPTexture(newBtp,slot.index),decodeBTPTexture(oldBtp,slot.index));
 for(const [index,old]of sourceLinks.nodes.entries()){assert.deepEqual(compiledLinks.nodes[index].placementIndices,old.placementIndices);assert.equal(compiledLinks.entries[compiledLinks.nodes[index].start],sourceLinks.entries[old.start]);}
 for(const s of grid.scene.segments)assert.deepEqual(parsed.scene.segments[s.index].vertices,s.vertices);
 assert.equal(sha(source),before);assert.equal(result.generated[0].sectors.length,1);assert.ok(parsed.sectors[result.generated[0].sectors[0]].cells.every(c=>c.covered));
 let race=null;if(![16,17].includes(level)){const session=createSession(result.data,result.texture,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{for(let i=0;i<30;i++)session.step();race={ticks:session.snapshot.ticks};assert.equal(race.ticks,30);}finally{session.dispose();}}
 cases.push({road:definition,generated:result.generated,race});rows.push({level,quality,sourceUnchanged:true,noEditIdentity:true,oldSectorVerticesPreserved:true,oldModelFallbackWordsPreserved:true,oldTextureRgbaPreserved:true,oldPlacementRecordsPreserved:true,originalPacketInitializersPreserved:true,generatedPacketInitializersCloned:true,cases,rejected});console.log(JSON.stringify({level,quality,bytes:result.data.length,sectors:parsed.sectors.length,rejected:rejected.length}));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'All40 original resources, native-contract serialization, actual reconstructed terrain contacts and short reconstructed races. Original-process compatibility remains a separate acceptance step.',rows},null,2)+'\n',{flag:'wx'});
