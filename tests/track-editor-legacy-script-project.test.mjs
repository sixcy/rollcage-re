import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {scriptedSceneryFixture} from './lib/scripted-scenery-fixture.mjs';
import {createSceneryDraft} from '../src/scenery-editor.mjs';
import {validateTrackProject} from '../src/track-editor-project.mjs';
import {emptyTerrainDraft} from '../src/terrain-editor.mjs';
import {emptyRaceLayoutDraft} from '../src/race-layout-editor.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(version){
  const source=scriptedSceneryFixture();source.texture.writeUInt32LE(4,0x14);source.texture.writeUInt16LE(13,0x500+3*56);
  const original=createSceneryDraft(source.geometry,source.texture,1),digests={geometry:sha(source.geometry),texture:sha(source.texture)},hashes={LOW:{...digests},HIGH:{...digests}},indexSha256='a'.repeat(64),project={schemaVersion:version,game:'rollcage',indexSha256,sources:[{level:1,hashes}],levels:[{level:1,pickups:[],models:original.filter(r=>r.templateIndex<2),...(version>=3?{terrain:emptyTerrainDraft()}:{}),...(version===4?{layout:emptyRaceLayoutDraft()}:{})}]};
  return {source,original,project,context:{indexSha256,sources:new Map([[1,{LOW:source,HIGH:source}]]),hashes:new Map([[1,hashes]])}};
}

for(const version of [2,3])test(`legacy version ${version} restores unchanged animated and particle originals without mutating the input project`,()=>{
  const {source,original,project,context}=fixture(version),saved=structuredClone(project),{project:migrated,compiled}=validateTrackProject(project,context);
  assert.deepEqual(project,saved);assert.deepEqual(migrated.levels[0].models,original);assert.deepEqual(compiled.get(1).LOW.geometry,source.geometry);assert.deepEqual(compiled.get(1).HIGH.texture,source.texture);
});

test('version 4 preserves explicit special deletion intent and rejects it instead of silently restoring rows',()=>{
  const {project,context}=fixture(4);assert.throws(()=>validateTrackProject(project,context),/cannot be removed/);
});

test('legacy hydration retains saved ordinary transforms and adds only missing original special identities',()=>{
  const {original,project,context}=fixture(3);project.levels[0].models[0].position[0]+=10;project.levels[0].models.push({...original[2],position:[40,0,32]});
  const {project:migrated}=validateTrackProject(project,context);assert.equal(migrated.levels[0].models[0].position[0],42);assert.deepEqual(migrated.levels[0].models.find(r=>r.id==='original-2').position,[40,0,32]);assert.equal(migrated.levels[0].models.filter(r=>r.id==='original-2').length,1);assert.ok(migrated.levels[0].models.some(r=>r.id==='original-3'));
});

test('interleaved legacy originals regain native ordering and unchanged projects preserve exact bytes',()=>{
  const source=scriptedSceneryFixture(),ordinary=Buffer.from(source.texture.subarray(0x538,0x570)),animated=Buffer.from(source.texture.subarray(0x570,0x5a8));source.texture.set(animated,0x538);source.texture.set(ordinary,0x570);source.geometry.writeUInt32LE(2,0x143c);
  const original=createSceneryDraft(source.geometry,source.texture,1),digests={geometry:sha(source.geometry),texture:sha(source.texture)},hashes={LOW:{...digests},HIGH:{...digests}},indexSha256='a'.repeat(64),project={schemaVersion:3,game:'rollcage',indexSha256,sources:[{level:1,hashes}],levels:[{level:1,pickups:[],models:original.filter(r=>r.templateIndex!==1),terrain:emptyTerrainDraft()}]},context={indexSha256,sources:new Map([[1,{LOW:source,HIGH:source}]]),hashes:new Map([[1,hashes]])};
  const {project:migrated,compiled}=validateTrackProject(project,context);assert.deepEqual(migrated.levels[0].models,original);assert.deepEqual(compiled.get(1).LOW.geometry,source.geometry);assert.deepEqual(compiled.get(1).LOW.texture,source.texture);
});
