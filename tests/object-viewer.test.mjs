import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';

test('standalone object page matches current browser sources and links to the other local tools', async () => {
  const template = await readFile('tools/object-viewer/viewer.html', 'utf8');
  const bundle = (await buildViewerBundle('tools/object-viewer/app.mjs')).replace(/<\/script/gi, '<\\/script');
  const page = await readFile('docs/object-viewer.html', 'utf8');
  assert.equal(page, template.replace('__VIEWER_BUNDLE__', () => bundle));
  assert.match(page, /href="track-viewer\.html"/);
  assert.match(page, /Files stay on your computer/);
  assert.doesNotMatch(page, /<script[^>]+src=|__VIEWER_BUNDLE__|data:image\/png;base64,/);
  for (const id of ['image', 'index', 'disc', 'game', 'resource', 'object', 'search', 'download', 'canvas']) assert.match(template, new RegExp(`id="${id}"`));
  const landing = await readFile('docs/index.html', 'utf8');
  assert.match(landing, /href="object-viewer\.html"/);
});

test('the object renderer/archive/catalog/export bundle parses as standalone JavaScript', async () => {
  const source = await buildViewerBundle(['src/object-catalog.mjs', 'tools/object-viewer/export-object.mjs']);
  const modules = runInNewContext(source, {TextEncoder, Blob, Uint8Array, Uint32Array, Float32Array, ArrayBuffer, DataView, Map, Set});
  assert.equal(typeof modules['src/object-catalog.mjs'].loadObjectCollection, 'function');
  assert.equal(typeof modules['tools/object-viewer/export-object.mjs'].buildObjectDownload, 'function');
});
