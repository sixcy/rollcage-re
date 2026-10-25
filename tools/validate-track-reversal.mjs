import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {createRaceRouteTopology,compileRaceRouteTopology} from '../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft,compileCheckpointTopology} from '../src/checkpoint-topology.mjs';
import {compileRaceLayoutEdits} from '../src/race-layout-editor.mjs';
import {createReversedTrackDraft} from '../src/track-reversal.mjs';
import {createSession} from '../src/solo-session.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {reverseSpeedPadArtwork} from '../src/speed-pad-patterns.mjs';
const [output,installation='C:/Program Files (x86)/Psygnosis/Rollcage']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-track-reversal.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),rows=[];
try{for(let level=1;level<=20;level++){
 const pair={};for(const quality of ['LOW','HIGH']){const t=getGame('rollcage').tracks.find(t=>t.name===`${quality}/LEV${level}.BLP`);pair[quality]={geometry:(await archive.readResource(t.index)).data,texture:(await archive.readResource(t.textureIndex)).data};}
 const row={level,pickups:createPickupDraft(pair.LOW.geometry),models:createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,level),terrain:{heights:[],surfaces:[]},layout:{routes:[],checkpoints:[],starts:[]},routeTopology:createRaceRouteTopology(pair.LOW.geometry),checkpointTopology:createCheckpointTopologyDraft(pair.LOW.geometry),assemblies:[]},before=structuredClone(row),reversed=createReversedTrackDraft(pair,row,{reverseArrowArtwork:(low,high,terrain)=>reverseSpeedPadArtwork(low,high,terrain,{originalLow:pair.LOW.geometry,originalHigh:pair.HIGH.geometry})});assert.deepEqual(row,before);assert.equal(reversed.draft.checkpointTopology.checkpoints[0].id,row.checkpointTopology.checkpoints[0].id);const cases=[];
 if([12,13].includes(level)){assert.deepEqual(reversed.draft,row);assert.equal(reversed.report.items[0].code,'protected-track');}
 else {const preview=compileTrackDraft(pair,{...reversed.draft,reversal:reversed.report},new Map(),{requireConnected:false});reversed.report=preview.reversalReport;for(const quality of ['LOW','HIGH']){
  const source=pair[quality].geometry,copy=Buffer.from(source),route=compileRaceRouteTopology(source,reversed.draft.routeTopology,{requireConnected:false});assert.deepEqual(source,copy);assert.equal(reversed.draft.routeTopology.groups.length,row.routeTopology.groups.length);assert.equal(reversed.draft.checkpointTopology.checkpoints.length,row.checkpointTopology.checkpoints.length);let compiled=false,race=null,error=null;
  try{const geometry=preview[quality].geometry;compiled=true;if(!reversed.report.items.some(i=>i.severity==='blocker')&&![16,17].includes(level)){const session=createSession(geometry,preview[quality].texture,{vehicleTypes:[0,1,2],aiDifficulty:2,weaponsEnabled:true});try{for(let tick=0;tick<90;tick++)session.step();race={ticks:session.snapshot.ticks,cars:session.snapshot.cars.length};}finally{session.dispose();}}}catch(e){error=e.message;assert.ok(reversed.report.items.some(i=>i.severity==='blocker'),`Unexpected compiler error without report: LEV${level} ${quality} ${error}`);}
  cases.push({quality,routeCompiled:true,pairedSourcesUnchanged:true,compiled,race,error});
 }}
 rows.push({level,protected:[12,13].includes(level),blockers:reversed.report.items.filter(i=>i.severity==='blocker').map(i=>({code:i.code,target:i.target})),warnings:reversed.report.items.filter(i=>i.severity==='warning').map(i=>i.code),pendingConnections:reversed.report.unresolvedConnections.length,cases});console.log(JSON.stringify(rows.at(-1)));
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'All20 track pairs, actual full editor compilers including recognized source-arrow rotation, route/table transformations and refreshed draft diagnostics. Clean source candidates run90 reconstructed ticks perquality. Native racing/playability is not claimed.',rows},null,2)+'\n',{flag:'wx'});
