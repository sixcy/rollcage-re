import test from 'node:test';
import assert from 'node:assert/strict';
import {PickupEditor} from '../tools/track-viewer/pickup-editor-ui.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

function editor(readLevel) {
  return Object.assign(Object.create(PickupEditor.prototype), {
    archive: {}, levels: new Map(), levelLoads: new Map(), readLevel
  });
}

test('concurrent project and track loads share the same editable level', async () => {
  const pending = deferred(); let reads = 0;
  const state = editor(() => {reads++; return pending.promise;});
  const project = state.loadLevel(1), track = state.loadLevel(1);
  const level = {level: 1, draft: []}; pending.resolve(level);
  assert.equal(await project, level);
  assert.equal(await track, level);
  assert.equal(reads, 1);
});

test('a failed level load can be retried', async () => {
  let reads = 0;
  const state = editor(async () => {if (++reads === 1) throw Error('read failed'); return {level: 1};});
  await assert.rejects(state.loadLevel(1), /read failed/);
  assert.deepEqual(await state.loadLevel(1), {level: 1});
  assert.equal(reads, 2);
});

test('finishing an old source load does not discard the new source load', async () => {
  const oldSource = deferred(), newSource = deferred(); let reads = 0;
  const state = editor(() => (++reads === 1 ? oldSource : newSource).promise);
  const old = state.loadLevel(1);
  state.archive = {}; state.levelLoads.clear(); state.levels.clear();
  const current = state.loadLevel(1);
  oldSource.resolve({level: 1, source: 'old'}); await old;
  const shared = state.loadLevel(1), level = {level: 1, source: 'current'};
  newSource.resolve(level);
  assert.equal(await current, level);
  assert.equal(await shared, level);
  assert.equal(reads, 2);
});
