// Combined editor corpus checks. Reads installed files; never launches the game.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createPickupDraft,validatePickupProject,PICKUP_EDITOR_LEVELS} from '../src/pickup-editor.mjs';
import {createSceneryDraft,inspectScenery,instantiateSceneryAssembly} from '../src/scenery-editor.mjs';
import {createRaceRouteTopology,insertRaceRoutePoint,cloneRaceRouteGroup,connectRaceRoutePoints,validateRaceRouteTopology} from '../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft,insertCheckpointAfter,setFinishCheckpoint} from '../src/checkpoint-topology.mjs';
import {compileTrackDraft,validateTrackProject} from '../src/track-editor-project.mjs';
import {inspectTerrain} from '../src/terrain-editor.mjs';
import {speedPadPatterns,speedPadFootprint} from '../src/speed-pad-patterns.mjs';
import {parseScene} from '../src/scene.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseCheckpointProgression} from '../src/respawn-progress.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {inspectRaceLayoutFallback} from '../src/race-layout-spatial.mjs';
import {createSession} from '../src/solo-session.mjs';

const [report,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);
if(!report)throw Error('Usage: node tools/validate-editor-v5.mjs NEW_REPORT.json [INSTALLATION]');
const sha=data=>createHash('sha256').update(data).digest('hex'),archive=await RollcageArchive.open(installation),rows=[];
function routeEdits(source,original){
  const eligible=original.groups.find((group,index)=>index&&!group.header[3]&&group.points.length>1);assert.ok(eligible,'A usable unblocked clone template exists');
  let insertion;
  for(const point of eligible.points){for(const axis of [0,2,1]){const position=[...point.position];position[axis]+=position[axis]<32767?1:-1;if(eligible.points.some(p=>p.position.every((n,i)=>n===position[i])))continue;
    const next=insertRaceRoutePoint(original,eligible.id,point.id,{position});if(validateRaceRouteTopology(source,next.topology).valid){insertion=next;break;}}
    if(insertion)break;
  }
  assert.ok(insertion,'A supported route insertion exists');
  const cloned=cloneRaceRouteGroup(insertion.topology,eligible.id),entry=eligible.points[0].id,cloneEntry=cloned.pointIds[entry];
  let topology=connectRaceRoutePoints(cloned.topology,entry,1,cloneEntry,{replace:true});topology=connectRaceRoutePoints(topology,cloneEntry,1,entry,{replace:true});
  return {topology,inserted:insertion.pointId,cloned:cloned.groupId,sourceGroup:eligible.index};
}
function checkpointEdits(source,original,level){
  if([12,13].includes(level))return {topology:original,locked:true};
  for(const row of original.checkpoints){try{const inserted=insertCheckpointAfter(source,original,row.id,{level}),order=inserted.checkpoints.findIndex(cp=>cp.id===row.id),id=inserted.checkpoints[order+1].id;return {topology:setFinishCheckpoint(inserted,id),inserted:id,locked:false};}catch(error){if(!/intersect covered terrain/.test(error.message))throw error;}}
  throw Error('No covered checkpoint insertion template found.');
}
function arrowEdits(pair){
  const patterns=speedPadPatterns(pair.LOW.geometry,pair.HIGH.geometry),low=inspectTerrain(pair.LOW.geometry),high=inspectTerrain(pair.HIGH.geometry),lowGrid=parseCollisionGrid(pair.LOW.geometry),highGrid=parseCollisionGrid(pair.HIGH.geometry),pattern=patterns.find(p=>!low.locked.has(p.sector)&&!high.locked.has(p.sector));
  if(!pattern)return {placements:[],reason:patterns.length?'All original arrow templates are animated/locked.':'No original paired arrow pattern exists.'};
  const placements=[],occupied=new Set();
  for(let rotation=0;rotation<4;rotation++){
    let placement;
    for(const sector of low.scene.segments){if(low.locked.has(sector.index)||high.locked.has(sector.index))continue;
      for(let cell=0;cell<sector.faces.length;cell++){const candidate={sector:sector.index,cell,sourceSector:pattern.sector,sourceCell:pattern.cell,rotation};let footprint;try{footprint=speedPadFootprint(low.scene,candidate,pattern);}catch{continue;}
        if(footprint.every(row=>!occupied.has(`${sector.index}:${row.cell}`)&&lowGrid.sectors[sector.index].cells[row.cell].covered&&highGrid.sectors[sector.index]?.cells[row.cell]?.covered)){placement=candidate;for(const row of footprint)occupied.add(`${sector.index}:${row.cell}`);break;}}
      if(placement)break;
    }
    assert.ok(placement,`Covered space exists for arrow rotation${rotation}`);placements.push(placement);
  }
  return {placements,pattern};
}
function validateSerialized(source,output,row,quality){
  const routes=parseRespawnRoutes(output.geometry),checkpoint=parseCheckpointProgression(output.geometry),sourceRoutes=parseRespawnRoutes(source.geometry),fallback=inspectRaceLayoutFallback(output.geometry,parseSpatialIndex(output.geometry),routes.groups),beforeFallback=inspectRaceLayoutFallback(source.geometry,parseSpatialIndex(source.geometry),sourceRoutes.groups);
  assert.equal(routes.groups.length,row.routeTopology.groups.length);let links=0;
  for(const group of routes.groups)for(const point of group.points){const word=point.bytes.readUInt32LE(12);for(const [g,p]of [[word&31,word>>>5&511],[word>>>14&31,word>>>19&511]])if(g){assert.ok(routes.groups[g]?.points[p]);links++;}}
  assert.equal(fallback.nodes.length,beforeFallback.nodes.length);for(let i=0;i<fallback.nodes.length;i++)for(const model of beforeFallback.nodes[i].models)assert.ok(fallback.nodes[i].models.includes(model),`Retained model${model} in spatial node${i}`);
  assert.equal(checkpoint.checkpointCount44,row.checkpointTopology.checkpoints.length);
  const planes=[];for(let order=0;order<checkpoint.checkpointCount44;order++)for(const id of checkpoint.checkpointIds90.subarray(order*4,order*4+4))if(id!==255){const offset=id*20;assert.equal(checkpoint.checkpoints70[offset+1],order);planes.push({order,progress:checkpoint.checkpoints70.readUInt16LE(offset+2),position:[4,6,8].map(n=>checkpoint.checkpoints70.readInt16LE(offset+n)),direction:[12,14,16].map(n=>checkpoint.checkpoints70.readInt16LE(offset+n))});}
  const startsOffset=source.geometry.readUInt32LE(0x74),startsLength=source.geometry[0x78]*8;assert.deepEqual(output.geometry.subarray(startsOffset,startsOffset+startsLength),source.geometry.subarray(startsOffset,startsOffset+startsLength));
  const scene=parseScene(output.geometry);for(const placement of row.terrain.patterns){const pattern=speedPadPatterns(source.geometry,source.geometry).find(p=>p.sector===placement.sourceSector&&p.cell===placement.sourceCell);assert.ok(pattern);for(const f of speedPadFootprint(scene,placement,pattern)){const face=scene.segments[placement.sector].faces[f.cell];assert.equal(output.geometry.readUInt32LE(scene.uvTable+face.textureRecord*16+12)&255,1);}}
  assert.equal(output.assemblies.length,1);assert.ok(output.assemblies[0].memberIndices.length);
  let race=null;
  if(![16,17].includes(row.level)){const session=createSession(output.geometry,output.texture,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{let at30;for(let tick=0;tick<90;tick++){session.step();if(tick===29)at30={ticks:session.snapshot.ticks,cars:session.snapshot.cars.length};}assert.equal(session.snapshot.ticks,90);race={at30,at90:{ticks:session.snapshot.ticks,cars:session.snapshot.cars.length}};}finally{session.dispose();}}
  return {quality,routeGroups:routes.groups.length,routePoints:routes.groups.reduce((n,g)=>n+g.count,0),links,fallbackNodes:fallback.nodes.length,checkpointCount:checkpoint.checkpointCount44,assemblyMembers:output.assemblies[0].memberIndices.length,arrowRotations:row.terrain.patterns.map(p=>p.rotation),race,
    paired:{routePoints:routes.groups.map(g=>g.points.map(p=>[...p.bytes])),groupMetadata:routes.groups.map(g=>[...g.bytes.subarray(0,8)]),checkpointIds:[...checkpoint.checkpointIds90],planes,assembly:output.assemblies[0]}};
}

try{for(let level=1;level<=20;level++){
  const pair={},hashes={};for(const quality of ['LOW','HIGH']){const track=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`);pair[quality]={geometry:(await archive.readResource(track.index)).data,texture:(await archive.readResource(track.textureIndex)).data};hashes[quality]={geometry:sha(pair[quality].geometry),texture:sha(pair[quality].texture)};}
  const base={level,pickups:createPickupDraft(pair.LOW.geometry),models:createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),terrain:{heights:[],surfaces:[],patterns:[]},layout:{routes:[],checkpoints:[],starts:[]},routeTopology:createRaceRouteTopology(pair.LOW.geometry),checkpointTopology:createCheckpointTopologyDraft(pair.LOW.geometry),assemblies:[]},sources=new Map([[level,pair]]);
  const identity=compileTrackDraft(pair,base,sources);for(const q of ['LOW','HIGH']){assert.deepEqual(identity[q].geometry,pair[q].geometry);assert.deepEqual(identity[q].texture,pair[q].texture);}
  const scenery=inspectScenery(pair.LOW.geometry,pair.LOW.texture),byPlacement=new Map(scenery.map(p=>[p.index,p])),legacyVersions=[];
  if(PICKUP_EDITOR_LEVELS.includes(level)){
    const legacy={schemaVersion:1,game:'rollcage',indexSha256:sha(archive.indexData),levels:[{level,sourceHashes:{LOW:hashes.LOW.geometry,HIGH:hashes.HIGH.geometry},pickups:base.pickups}]};
    validatePickupProject(legacy,{indexSha256:legacy.indexSha256,levels:[{level,sourceHashes:legacy.levels[0].sourceHashes,lowData:pair.LOW.geometry,highData:pair.HIGH.geometry}]});legacyVersions.push(1);
  }
  for(const version of [2,3,4]){
    const legacyRow={level,pickups:base.pickups,models:version<4?base.models.filter(p=>byPlacement.get(p.templateIndex).kind==='ordinary'):base.models,...(version>=3?{terrain:{heights:[],surfaces:[]}}:{}),...(version>=4?{layout:base.layout}:{})};
    const legacy={schemaVersion:version,game:'rollcage',indexSha256:sha(archive.indexData),sources:[{level,hashes}],levels:[legacyRow]},restored=validateTrackProject(legacy,{indexSha256:legacy.indexSha256,sources,hashes:new Map([[level,hashes]])});
    for(const q of ['LOW','HIGH']){assert.deepEqual(restored.compiled.get(level)[q].geometry,pair[q].geometry);assert.deepEqual(restored.compiled.get(level)[q].texture,pair[q].texture);}legacyVersions.push(version);
  }
  const route=routeEdits(pair.LOW.geometry,base.routeTopology),checkpoint=checkpointEdits(pair.LOW.geometry,base.checkpointTopology,level),arrows=arrowEdits(pair),row={...base,routeTopology:route.topology,checkpointTopology:checkpoint.topology,terrain:{heights:[],surfaces:[],patterns:arrows.placements}};
  const candidates=scenery.filter(p=>p.assemblyDuplicable).sort((a,b)=>Number(b.index===31&&level===1)-Number(a.index===31&&level===1)),rejected=[];let compiled,command;
  for(const candidate of candidates){for(const shift of [[0,-1,0],[512,-1,0],[-512,-1,0],[0,-1,512],[0,-1,-512],[1024,-1,0],[0,-1,1024]]){try{command=instantiateSceneryAssembly(pair.LOW,candidate.index,{id:'combined-assembly',level,position:candidate.position.map((n,i)=>n+shift[i])}).command;row.assemblies=[command];compiled=compileTrackDraft(pair,row,sources);break;}catch(error){rejected.push({templateIndex:candidate.index,shift,reason:error.message});}}if(compiled)break;}
  assert.ok(compiled,`LEV${level} combined assembly placement exists; ${rejected.at(-1)?.reason}`);
  const project={schemaVersion:5,game:'rollcage',indexSha256:sha(archive.indexData),sources:[{level,hashes}],levels:[row]},validated=validateTrackProject(JSON.parse(JSON.stringify(project)),{indexSha256:project.indexSha256,sources,hashes:new Map([[level,hashes]]),requireConnected:true});
  const cases=[];for(const quality of ['LOW','HIGH']){assert.deepEqual(validated.compiled.get(level)[quality].geometry,compiled[quality].geometry);assert.deepEqual(validated.compiled.get(level)[quality].texture,compiled[quality].texture);cases.push(validateSerialized(pair[quality],compiled[quality],row,quality));assert.equal(sha(pair[quality].geometry),hashes[quality].geometry);assert.equal(sha(pair[quality].texture),hashes[quality].texture);}
  assert.deepEqual(cases[1].paired,cases[0].paired,`LEV${level} LOW/HIGH topology and assembly parity`);for(const c of cases)delete c.paired;
  const result={level,sourceHashes:hashes,noEditIdentity:true,legacyNoEditVersions:legacyVersions,projectRoundTrip:true,pairedCompatible:true,route:{inserted:route.inserted,cloned:route.cloned,sourceGroup:route.sourceGroup},checkpoint:{locked:checkpoint.locked,inserted:checkpoint.inserted??null},assembly:command,arrows:{rotations:arrows.placements.map(p=>p.rotation),reason:arrows.reason??null},rejectedCandidates:rejected,cases};rows.push(result);console.log(JSON.stringify({level,passed:true,arrowRotations:result.arrows.rotations,checkpointLocked:checkpoint.locked,races:cases.map(c=>c.race?.at90??null)}));
}}finally{await archive.close();}
await writeFile(report,JSON.stringify({passed:true,scope:'All40 source resources; combined route insertion/connected clone, checkpoint insertion/finish except hardcoded-stage levels12/13, supported same-track assembly and all available arrow rotations; paired v5 JSON roundtrip and reconstructed90-tick races (16/17 remain disabled). No native-game runtime or complete-race parity claim.',rows},null,2)+'\n',{flag:'wx'});
