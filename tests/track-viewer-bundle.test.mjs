import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';

test('classic viewer script resolves the real compact audio imports and exposes its callable module',async()=>{
  const bundle=await buildViewerBundle('src/sound-manager-databases.mjs');
  const api=runInNewContext(bundle);
  assert.equal(typeof api.loadAudioManagerDatabase,'function');
  assert.throws(()=>api.loadAudioManagerDatabase(0,'unknown',{}),/Unknown audio database unknown/);
});
