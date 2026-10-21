// Uses the caller's existing Playwright install and local Edge; no server or downloads.
// Installed archives are read-only. Retained outputs require a new directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RollcageArchive } from '../src/archive.mjs';
import { getGame } from '../src/track-games.mjs';
import { buildTrackManifest } from '../src/track-manifest.mjs';
import { buildViewerBundle } from './lib/track-viewer-bundle.mjs';
import { readTrackZIP } from './lib/check-track-download.mjs';

const [launcher, output = `analysis/track-games-browser/check-${Date.now()}`] = process.argv.slice(2);
if (!launcher) throw new Error('Usage: node tools/check-track-games.mjs <installed-REA-launcher> [new-report-directory]');
const { chromium } = createRequire(path.resolve(launcher))('playwright-core');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const summarize = scene => ({
  segments: scene.segments, instances: scene.instances, triangles: scene.triangles, vertices: scene.vertices,
  bounds: scene.bounds, groupsHash: hash(JSON.stringify(scene.groups)), objHash: hash(scene.obj),
  textures: [...scene.textures].map(([page, image]) => ({ page, width: image.width, height: image.height, hash: hash(image.rgba) }))
});
const paths = id => ({
  image: path.join(getGame(id).installation, 'IDXData/Rollcage.img'),
  index: path.join(getGame(id).installation, 'IDXData/Rollcage.idx')
});
// Refuse overwriting any retained evidence, before the lengthy checks begin.
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await mkdir(output, { recursive: false });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const archives = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], requests = [], screenshots = [], uiTracks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  const inspect = () => page.evaluate(() => window.rollcageViewer.inspect());
  const waitTrack = (id, name) => page.waitForFunction(({ id, name }) => {
    const state = window.rollcageViewer.inspect();
    return state.game === id && state.track === name && !state.loading;
  }, { id, name }, { timeout: 60000 });
  const waitError = () => page.waitForFunction(() => document.getElementById('error').textContent.length > 0);
  async function openGame(id) {
    await page.selectOption('#game', 'auto');
    await page.locator('#image').setInputFiles(paths(id).image);
    await page.locator('#index').setInputFiles(paths(id).index);
    await waitTrack(id, getGame(id).tracks[0].name);
    assert.equal((await inspect()).verified, true);
    assert.equal(await page.locator('#track option').count(), getGame(id).tracks.length);
    assert.equal(await page.locator('#error').textContent(), '');
    await page.evaluate(id => {
      window.checkArchiveFiles ??= {};
      window.checkArchiveFiles[id] = ['image', 'index'].map(name => document.getElementById(name).files[0]);
    }, id);
  }
  async function restoreFiles(id) {
    await page.evaluate(id => {
      for (const [i, name] of ['image', 'index'].entries()) {
        const transfer = new DataTransfer(); transfer.items.add(window.checkArchiveFiles[id][i]);
        document.getElementById(name).files = transfer.files;
      }
      document.getElementById('index').dispatchEvent(new Event('change'));
    }, id);
    await waitTrack(id, getGame(id).tracks[0].name);
  }
  await openGame('stage2');
  assert.equal(getGame('stage2').tracks.length, 66);
  const firstState = await inspect();
  assert.ok(firstState.triangles > 0); assert.ok(firstState.instances > 0); assert.ok(firstState.textures > 0);

  // Test actual UI loading for every Stage II environment, keeping one image per category.
  const categories = new Set();
  for (const track of getGame('stage2').tracks) {
    await page.selectOption('#track', String(track.index)); await waitTrack('stage2', track.name);
    const state = await inspect();
    assert.ok(state.triangles > 0, track.name);
    assert.equal(await page.locator('#error').textContent(), '', track.name);
    uiTracks.push({ name: track.name, segments: state.segments, instances: state.instances, triangles: state.triangles, textures: state.textures });
    const category = track.category ?? 'environments';
    if (!categories.has(category)) {
      categories.add(category);
      const filename = `stage2-${category.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      await page.screenshot({ path: path.join(output, filename) }); screenshots.push({ category, track: track.name, filename });
    }
  }
  console.log(`Loaded ${uiTracks.length} Stage II environments through the viewer.`);
  const game = getGame('stage2'), first = game.tracks[0];
  await page.selectOption('#track', String(first.index)); await waitTrack('stage2', first.name);

  // Hidden display content must remain present in the complete scene export.
  await page.selectOption('#sector', '0'); await page.locator('#objects').uncheck();
  await page.locator('#textures').uncheck(); await page.locator('#lighting').uncheck();
  await page.evaluate(() => {
    window.checkSavedToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); };
  });
  await page.locator('#download').click(); await waitError();
  assert.match(await page.locator('#error').textContent(), /PNG/);
  assert.equal((await inspect()).track, first.name); assert.equal(await page.locator('#download').isEnabled(), true);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.checkSavedToBlob; });
  const downloading = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), 'stage2-LEV01.zip');
  const files = readTrackZIP(await readFile(await download.path()));
  const archive = await RollcageArchive.open(game.installation); archives.push(archive);
  const firstScene = await game.loadTrack(archive, first);
  assert.equal(files.size, firstScene.textures.size + 4);
  assert.equal(files.get('scene.obj').toString('utf8'), firstScene.obj);
  assert.deepEqual(JSON.parse(files.get('scene.json').toString('utf8')), JSON.parse(JSON.stringify(buildTrackManifest(firstScene, first))));
  assert.equal(files.get('scene.obj').toString('utf8').split('\n').filter(line => line.startsWith('f ')).length, firstState.triangles);
  for (const match of files.get('scene.mtl').toString('utf8').matchAll(/^map_(?:Kd|d) (.+)$/gm)) assert.ok(files.has(match[1]));
  for (const [texturePage, texture] of firstScene.textures) {
    const png = files.get(`texture-${texturePage}.png`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const decoded = await page.evaluate(async base64 => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      return { width: image.width, height: image.height, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)), n => n.toString(16).padStart(2, '0')).join('') };
    }, png.toString('base64'));
    assert.deepEqual(decoded, { width: texture.width, height: texture.height, hash: hash(texture.rgba) });
  }
  await page.locator('#objects').check(); await page.locator('#textures').check(); await page.locator('#lighting').check();
  await page.locator('#reset').click();

  // Compare the exact packed browser readers with Node, including all OBJ and pixel bytes.
  const bundle = await buildViewerBundle(['tools/track-viewer/file-archive.mjs', 'src/track-games.mjs']);
  const browserResults = await page.evaluate(async bundle => {
    const modules = (0, eval)(bundle);
    const { FileArchive } = modules['tools/track-viewer/file-archive.mjs'];
    const { getGame, identifyGame } = modules['src/track-games.mjs'];
    const archive = await FileArchive.open(document.getElementById('image').files[0], document.getElementById('index').files[0]);
    const identified = await identifyGame(archive);
    if (identified.game.id !== 'stage2' || !identified.verified) throw new Error('Packed browser archive identification failed.');
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    const results = [], encode = text => new TextEncoder().encode(text);
    for (const track of getGame('stage2').tracks) {
      const scene = await getGame('stage2').loadTrack(archive, track);
      results.push({ name: track.name, summary: {
        segments: scene.segments, instances: scene.instances, triangles: scene.triangles, vertices: scene.vertices,
        bounds: scene.bounds, groupsHash: await hash(encode(JSON.stringify(scene.groups))), objHash: await hash(encode(scene.obj)),
        textures: await Promise.all([...scene.textures].map(async ([page, image]) => ({ page, width: image.width, height: image.height, hash: await hash(image.rgba) })))
      } });
    }
    return results;
  }, bundle);
  for (const [i, track] of game.tracks.entries()) {
    const scene = await game.loadTrack(archive, track);
    assert.deepEqual(browserResults[i], { name: track.name, summary: summarize(scene) }, track.name);
    assert.equal(uiTracks[i].triangles, scene.triangles, track.name);
    assert.equal(uiTracks[i].instances, scene.instances, track.name);
  }
  console.log(`Matched ${browserResults.length} Stage II browser/Node scene, OBJ and texture summaries.`);

  // Invalid indexes, explicit wrong selection, and mismatched installations clear the scene.
  await page.selectOption('#game', 'rollcage'); await waitError();
  assert.match(await page.locator('#error').textContent(), /belong to Rollcage Stage II/);
  assert.equal((await inspect()).track, null); assert.equal(await page.locator('#download').isDisabled(), true);
  await page.selectOption('#game', 'auto'); await waitTrack('stage2', first.name);
  await page.locator('#index').setInputFiles({ name: 'bad.idx', mimeType: 'application/octet-stream', buffer: Buffer.alloc(15) });
  await waitError(); assert.match(await page.locator('#error').textContent(), /index size/);
  assert.equal((await inspect()).track, null); assert.equal(await page.locator('#track').isDisabled(), true);
  await restoreFiles('stage2');
  await page.locator('#image').setInputFiles(paths('rollcage').image); await waitError();
  assert.equal((await inspect()).track, null); assert.equal(await page.locator('#download').isDisabled(), true);
  await restoreFiles('stage2');

  // A metadata-only index change preserves resources while removing known-release identity.
  const unverifiedIndex = await readFile(paths('stage2').index);
  unverifiedIndex.writeInt16LE(unverifiedIndex.readInt16LE(12) === 0 ? 1 : 0, 12);
  await page.locator('#index').setInputFiles({ name: 'unverified.idx', mimeType: 'application/octet-stream', buffer: unverifiedIndex });
  await waitError(); assert.match(await page.locator('#error').textContent(), /Unrecognized archive/);
  await page.selectOption('#game', 'stage2'); await waitTrack('stage2', first.name);
  assert.equal((await inspect()).verified, false); assert.match(await page.locator('#game-info').textContent(), /Unverified release/);
  await page.selectOption('#game', 'auto'); await restoreFiles('stage2'); assert.equal((await inspect()).verified, true);
  await openGame('rollcage');
  assert.equal(await page.locator('#track option').count(), 40);
  await page.screenshot({ path: path.join(output, 'rollcage.png') });

  // Start earlier requests and immediately supersede them across both game and track changes.
  await page.evaluate(() => {
    for (const game of ['stage2', 'rollcage']) {
      for (const [i, name] of ['image', 'index'].entries()) {
        const transfer = new DataTransfer(); transfer.items.add(window.checkArchiveFiles[game][i]);
        document.getElementById(name).files = transfer.files;
      }
      document.getElementById('index').dispatchEvent(new Event('change'));
    }
  });
  await waitTrack('rollcage', getGame('rollcage').tracks[0].name);
  await restoreFiles('stage2');
  const last = game.tracks.at(-1);
  await page.evaluate(({ first, last }) => {
    const select = document.getElementById('track');
    for (const index of [first, last]) { select.value = String(index); select.dispatchEvent(new Event('change')); }
  }, { first: game.tracks[1].index, last: last.index });
  await waitTrack('stage2', last.name); await page.waitForTimeout(100);
  assert.equal((await inspect()).track, last.name);
  await page.selectOption('#track', String(first.index)); await waitTrack('stage2', first.name);
  const webglError = await page.evaluate(() => document.getElementById('canvas').getContext('webgl').getError());
  assert.equal(webglError, 0); assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  const result = {
    uiTracks, browserParity: browserResults, screenshots,
    download: { filename: download.suggestedFilename(), files: [...files.keys()], exactOBJ: true, exactManifest: true, texturePixelsMatch: true, completeDespiteDisplayFilters: true, retryAfterPNGFailure: true },
    automaticIdentification: 'passed', explicitSelection: 'passed', unverifiedRelease: 'passed', gameSwitching: 'passed',
    staleLoads: 'passed', errorRecovery: 'passed', pageErrors: errors, externalRequests: requests, webglError
  };
  await writeFile(path.join(output, 'browser-check.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ matchedTracks: browserResults.length, screenshots, pageErrors: errors, externalRequests: requests, webglError, output }));
} finally {
  await Promise.all(archives.map(archive => archive.close()));
  await browser.close();
}
