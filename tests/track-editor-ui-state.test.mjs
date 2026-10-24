import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackEditor} from '../tools/track-viewer/track-editor-ui.mjs';
import {getGame} from '../src/track-games.mjs';
import {sceneryFixture} from './lib/scenery-fixture.mjs';

test('concurrent library/project/track loads cannot observe a partially initialized scenery pair',async()=>{
  const fixture=sceneryFixture(),tracks=['LOW','HIGH'].map(q=>getGame('rollcage').tracks.find(t=>t.name===`${q}/LEV1.BLP`));
  let release,started,reads=0;const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>started=resolve);
  const archive={async readResource(index){reads++;if(tracks.some(t=>t.textureIndex===index)){started();await gate;return {data:Buffer.from(fixture.texture)};}assert.ok(tracks.some(t=>t.index===index));return {data:Buffer.from(fixture.geometry)};}};
  const state=Object.assign(Object.create(TrackEditor.prototype),{archive,levels:new Map(),levelLoads:new Map()});
  const first=state.loadLevel(1);await entered;assert.equal(state.levels.has(1),false);
  const second=state.loadLevel(1);release();const base=await first;assert.equal(await second,base);assert.equal(await state.loadLevel(1),base);assert.equal(reads,4);
  assert.ok(base.modelDraft.length);assert.ok(base.hashes.HIGH.texture);assert.equal(base.HIGH.texture.length,fixture.texture.length);
});
