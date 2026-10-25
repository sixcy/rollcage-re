import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackEditor} from '../tools/track-viewer/track-editor-ui.mjs';
import {raceLayoutFixture} from './lib/race-layout-fixture.mjs';
import {createPickupDraft} from '../src/pickup-editor.mjs';
import {createRaceRouteTopology} from '../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft} from '../src/checkpoint-topology.mjs';
import {compileTrackDraft} from '../src/track-editor-project.mjs';
import {inspectRaceLayout,emptyRaceLayoutDraft} from '../src/race-layout-editor.mjs';

const h='a'.repeat(64),hashes={LOW:{geometry:h,texture:h},HIGH:{geometry:h,texture:h}};
function harness(){
  const geometry=raceLayoutFixture();for(let i=0;i<3;i++)geometry.writeUInt32LE(0,0x190c+i*16);
  geometry[0x1806]=0x7c;geometry[0x180f]=7;geometry[0x1812]=0x34;geometry[0x1813]=0x56;
  geometry.writeUInt32LE(0x1d00,0x90);geometry[0x94]=1;[64,-20,-64].forEach((n,i)=>geometry.writeInt16LE(n,0x1d00+i*2));geometry.fill(0x7b,0x1d06,0x1d0c);
  const texture=Buffer.alloc(0x40);texture.write('BTP ');const pair={LOW:{geometry,texture},HIGH:{geometry:Buffer.from(geometry),texture:Buffer.from(texture)}};
  const original=createPickupDraft(geometry),routeOriginal=createRaceRouteTopology(geometry),checkpointOriginal=createCheckpointTopologyDraft(geometry);
  const base={level:1,...pair,sourceHashes:{LOW:h,HIGH:h},hashes,original,modelOriginal:[],draft:structuredClone(original),modelDraft:[],terrainDraft:{heights:[],surfaces:[]},layoutDraft:emptyRaceLayoutDraft(),routeOriginal,routeTopology:structuredClone(routeOriginal),checkpointOriginal,checkpointTopology:structuredClone(checkpointOriginal),assemblies:[],undo:[],redo:[],modelUndo:[],modelRedo:[],terrainUndo:[],terrainRedo:[],layoutUndo:[],layoutRedo:[]};
  const editor={archive:{},indexSha256:h,current:base,levels:new Map([[1,base]]),revision:0,savedRevision:0,loadLevel:async()=>base,sources:()=>new Map([[1,pair]]),cancelModels(){},cancelDrag(){},onChange(){},setLayoutEditing(){},say(){},signature:TrackEditor.prototype.signature,compile:TrackEditor.prototype.compile,changed:TrackEditor.prototype.changed};
  const row={level:1,pickups:structuredClone(original),models:[],terrain:{heights:[],surfaces:[]},layout:emptyRaceLayoutDraft()};
  const project=version=>version===1?{schemaVersion:1,game:'rollcage',indexSha256:h,levels:[{level:1,sourceHashes:{LOW:h,HIGH:h},pickups:structuredClone(original)}]}:{schemaVersion:version,game:'rollcage',indexSha256:h,sources:[{level:1,hashes:structuredClone(hashes)}],levels:[{level:1,pickups:structuredClone(original),models:[],...(version>=3?{terrain:structuredClone(row.terrain)}:{}),...(version>=4?{layout:structuredClone(row.layout)}:{})}]};
  return {editor,base,pair,row,project};
}
async function withDocument(run){const prior=globalThis.document;globalThis.document={getElementById:()=>({value:'routes'})};try{return await run();}finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}}

test('actual editor migrates no-edit v1–v4 projects to complete v6 snapshots without changing either resource',()=>withDocument(async()=>{
  for(const version of [1,2,3,4]){
    const {editor,base,pair,project}=harness(),saved=project(version),input=structuredClone(saved);
    await TrackEditor.prototype.restoreProject.call(editor,saved);
    assert.deepEqual(saved,input,`v${version} caller project stays immutable`);
    assert.deepEqual(base.routeTopology,base.routeOriginal);assert.deepEqual(base.checkpointTopology,base.checkpointOriginal);
    const compiled=editor.compile();for(const q of ['LOW','HIGH']){assert.deepEqual(compiled[q].geometry,pair[q].geometry);assert.deepEqual(compiled[q].texture,pair[q].texture);}
    assert.equal(editor.changed(base),false);assert.deepEqual(base.layoutDraft,emptyRaceLayoutDraft());
    const exported=await TrackEditor.prototype.project.call(editor);assert.equal(exported.schemaVersion,6);assert.deepEqual(exported.levels,[]);
  }
}));

test('v1 pickup and v2/v3 terrain edits survive conversion to v5 and reload with identical compiled output',()=>withDocument(async()=>{
  for(const version of [1,2,3]){
    const {editor,base,pair,project}=harness(),saved=project(version);saved.levels[0].pickups[0].position[0]++;
    if(version===3)saved.levels[0].terrain.heights.push({sector:0,vertex:4,height:-8});
    await TrackEditor.prototype.restoreProject.call(editor,saved);const compiled=editor.compile(),v5=await TrackEditor.prototype.project.call(editor);
    assert.equal(v5.levels[0].pickups[0].position[0],65);assert.equal(v5.levels[0].routeTopology.version,1);assert.equal(v5.levels[0].checkpointTopology.checkpoints.length,2);
    if(version===3)assert.equal(compiled.LOW.geometry.readInt16LE(0x1240+4*8+2),-8);
    await TrackEditor.prototype.restoreProject.call(editor,JSON.parse(JSON.stringify(v5)));const reloaded=editor.compile();
    for(const q of ['LOW','HIGH']){assert.deepEqual(reloaded[q].geometry,compiled[q].geometry);assert.deepEqual(reloaded[q].texture,compiled[q].texture);}
    assert.notDeepEqual(compiled.LOW.geometry,pair.LOW.geometry);assert.equal(base.draft[0].position[0],65);
  }
}));

test('v4 sparse route/checkpoint/start edits hydrate onto stable identities and remain after subsequent topology editing',()=>withDocument(async()=>{
  const {editor,base,pair,project}=harness(),saved=project(4),info=inspectRaceLayout(pair.LOW.geometry);
  saved.levels[0].layout.routes=[{group:1,point:0,position:[...info.routes[0].position],minSpeed:7,targetSpeed:179}];
  saved.levels[0].layout.checkpoints=[{id:1,position:[193,-20,-64],direction:[0,0,-16384]}];saved.levels[0].layout.starts=[{index:0,position:[49,-20,-80]}];
  const expected=compileTrackDraft(pair,saved.levels[0]);await TrackEditor.prototype.restoreProject.call(editor,saved);
  assert.deepEqual(base.layoutDraft,{routes:[],checkpoints:[],starts:saved.levels[0].layout.starts});
  assert.equal(base.routeTopology.groups[1].points[0].minSpeed,7);assert.equal(base.checkpointTopology.checkpoints[1].planes[0].position[0],193);
  for(const q of ['LOW','HIGH']){const a=inspectRaceLayout(editor.compile()[q].geometry),b=inspectRaceLayout(expected[q].geometry);assert.deepEqual(a.routes.map(({position,minSpeed,targetSpeed,flags,links})=>({position,minSpeed,targetSpeed,flags,links})),b.routes.map(({position,minSpeed,targetSpeed,flags,links})=>({position,minSpeed,targetSpeed,flags,links})));assert.deepEqual(a.checkpoints.map(({position,direction,sector})=>({position,direction,sector})),b.checkpoints.map(({position,direction,sector})=>({position,direction,sector})));assert.deepEqual(a.starts.map(r=>r.position),b.starts.map(r=>r.position));}
  const v5=await TrackEditor.prototype.project.call(editor);assert.equal(v5.schemaVersion,6);assert.deepEqual(v5.levels[0].layout.routes,[]);assert.deepEqual(v5.levels[0].layout.checkpoints,[]);
  await TrackEditor.prototype.restoreProject.call(editor,v5);assert.equal(base.routeTopology.groups[1].points[0].minSpeed,7);
}));

test('legacy restore rejects hash/coordinate/HIGH failures before replacing existing visible draft or histories',()=>withDocument(async()=>{
  for(const version of [1,2,3,4]){
    const {editor,base,project}=harness();base.draft[0].position[0]=70;base.layoutUndo.push({retained:'history'});base.routeTopology.groups[1].points[0].targetSpeed=123;
    const original={draft:structuredClone(base.draft),routes:structuredClone(base.routeTopology),history:structuredClone(base.layoutUndo)};
    const invalid=project(version);if(version===1)invalid.levels[0].sourceHashes.HIGH='b'.repeat(64);else invalid.sources[0].hashes.HIGH.geometry='b'.repeat(64);
    await assert.rejects(TrackEditor.prototype.restoreProject.call(editor,invalid),/hash/);
    assert.deepEqual(base.draft,original.draft);assert.deepEqual(base.routeTopology,original.routes);assert.deepEqual(base.layoutUndo,original.history);
    const bad=project(version);bad.levels[0].pickups[0].position=[32768,0,0];await assert.rejects(TrackEditor.prototype.restoreProject.call(editor,bad));assert.deepEqual(base.draft,original.draft);
    base.HIGH.geometry[0x94]=0;await assert.rejects(TrackEditor.prototype.restoreProject.call(editor,project(version)),/pickup|template/i);assert.deepEqual(base.draft,original.draft);assert.deepEqual(base.routeTopology,original.routes);assert.deepEqual(base.layoutUndo,original.history);
  }
}));

test('v4 migration validates route movement against its edited terrain before changing visible state',()=>withDocument(async()=>{
  const {editor,pair,project}=harness(),saved=project(4),row=saved.levels[0];
  row.terrain.heights=Array.from({length:2},(_,sector)=>Array.from({length:9},(_,vertex)=>({sector,vertex,height:-127}))).flat();
  row.layout.routes=[{group:1,point:0,position:[64,-350,-32],minSpeed:8,targetSpeed:180}];
  const expected=compileTrackDraft(pair,row);
  await TrackEditor.prototype.restoreProject.call(editor,saved);
  for(const q of ['LOW','HIGH'])assert.deepEqual(inspectRaceLayout(editor.compile()[q].geometry).routes.map(r=>r.position),inspectRaceLayout(expected[q].geometry).routes.map(r=>r.position));
}));

test('a failure during final stable-topology staging preserves every prior visible draft and undo history',()=>withDocument(async()=>{
  const {editor,base,project}=harness();base.draft[0].position[0]=71;base.layoutUndo.push({retained:true});base.routeTopology.groups[1].points[0].minSpeed=12;
  const before=structuredClone({pickups:base.draft,layout:base.layoutDraft,routes:base.routeTopology,undo:base.layoutUndo});
  // Legacy v2 can retain these opaque graph bytes, while stable topology must
  // reject the dangling group reference during its final compile.
  for(const q of ['LOW','HIGH'])base[q].geometry.writeUInt32LE(31,0x190c);
  await assert.rejects(TrackEditor.prototype.restoreProject.call(editor,project(2)),/link|reference|target|missing/i);
  assert.deepEqual({pickups:base.draft,layout:base.layoutDraft,routes:base.routeTopology,undo:base.layoutUndo},before);
}));
