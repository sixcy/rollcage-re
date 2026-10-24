import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryFixture} from './lib/scenery-fixture.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {compileTrackDraft,parseTrackProject,validateTrackProject} from '../src/track-editor-project.mjs';
const h='a'.repeat(64),hashes={LOW:{geometry:h,texture:h},HIGH:{geometry:h,texture:h}};
function fixture(){const source=sceneryFixture();source.geometry.writeUInt32LE(0x1480,0x90);source.geometry[0x94]=1;const models=createSceneryDraft(source.geometry,source.texture,1);models[0].yaw=1024;const row={level:1,pickups:[{id:'pickup',templateIndex:0,position:[1,2,3]}],models};return {source,row,project:{schemaVersion:2,game:'rollcage',indexSha256:h,sources:[{level:1,hashes}],levels:[row]}};}
test('combined project compiles scenery and pickups in LOW and HIGH without losing either change',()=>{
  const {source,row,project}=fixture(),pair={LOW:source,HIGH:source},sources=new Map([[1,pair]]);
  assert.deepEqual(parseTrackProject(JSON.stringify(project)),project);const {compiled}=validateTrackProject(project,{indexSha256:h,sources,hashes:new Map([[1,hashes]])});
  for(const q of ['LOW','HIGH']){const c=compiled.get(1)[q];assert.equal(c.geometry.readInt16LE(c.geometry.readUInt32LE(0x90)),1);assert.equal(c.texture.readInt16LE(c.texture.readUInt32LE(0x28)+16),1024);}
  assert.deepEqual(compileTrackDraft(pair,row,sources).HIGH.geometry,compiled.get(1).HIGH.geometry);
});
test('source hash, donor, schema, unknown patches and failed HIGH validation reject before application',()=>{
  const {source,row,project}=fixture(),sources=new Map([[1,{LOW:source,HIGH:source}]]);
  assert.throws(()=>validateTrackProject(project,{indexSha256:'b'.repeat(64),sources,hashes:new Map([[1,hashes]])}),/index hash/);
  assert.throws(()=>validateTrackProject(project,{indexSha256:h,sources,hashes:new Map()}),/source.*hash/);
  assert.throws(()=>parseTrackProject({...project,patch:[]}));const bad=structuredClone(project);bad.levels[0].models[0].sourceLevel=2;assert.throws(()=>parseTrackProject(bad),/donor/);
  const high={geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture)};high.texture[0x500+31]=1;assert.throws(()=>compileTrackDraft({LOW:source,HIGH:high},row,sources),/locked/);
});
