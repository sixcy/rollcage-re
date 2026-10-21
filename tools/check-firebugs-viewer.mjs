// Uses the existing REA Playwright installation and local Edge. No downloads.
// The input disc is read-only; every report uses a new output directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FirebugsArchive } from '../src/firebugs-archive.mjs';
import { identifyFirebugs } from '../src/firebugs.mjs';
import { buildTrackManifest } from '../src/track-manifest.mjs';
import { openFirebugsZip } from './lib/firebugs-disc.mjs';
import { buildViewerBundle } from './lib/track-viewer-bundle.mjs';
import { readTrackZIP } from './lib/check-track-download.mjs';
import { assertStoredPathBytes, checkPathOverlay } from './lib/check-path-overlay.mjs';

const [launcher, filename, output = `analysis/firebugs-browser-${Date.now()}`, ...extra] = process.argv.slice(2);
if (!launcher || !filename || extra.length) throw new Error('Usage: node tools/check-firebugs-viewer.mjs <installed-REA-launcher> <disc.zip> [new-report-directory]');
const { chromium } = createRequire(path.resolve(launcher))('playwright-core');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const summary = scene => ({ segments: scene.segments, instances: scene.instances, triangles: scene.triangles,
  vertices: scene.vertices, bounds: scene.bounds, groupsHash: hash(JSON.stringify(scene.groups)), objHash: hash(scene.obj), pathsHash: hash(JSON.stringify(scene.paths)),
  textures: [...scene.textures].map(([page, image]) => ({ page, width: image.width, height: image.height, hash: hash(image.rgba) })) });
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await mkdir(output, { recursive: false });
const disc = await openFirebugsZip(filename);
const archive = await FirebugsArchive.open(disc);
const identified = await identifyFirebugs(archive);
const tracks = identified.tracks, first = tracks[0];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], requests = [], screenshots = [], uiTracks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  const inspect = () => page.evaluate(() => window.rollcageViewer.inspect());
  const waitTrack = name => page.waitForFunction(name => {
    const state = window.rollcageViewer.inspect();
    return state.game === 'firebugs' && state.track === name && !state.loading;
  }, name, { timeout: 120000 });
  await page.locator('#disc').setInputFiles(path.resolve(filename));
  await waitTrack(first.name);
  assert.equal((await inspect()).verified, true);
  assert.equal(await page.locator('#track option').count(), tracks.length);
  await page.evaluate(() => { window.checkDiscFile = document.getElementById('disc').files[0]; });
  const categories = new Set();
  for (const [i, track] of tracks.entries()) {
    await page.selectOption('#track', String(track.index)); await waitTrack(track.name);
    const state = await inspect();
    assert.ok(state.triangles > 0, track.name);
    assert.equal(await page.locator('#error').textContent(), '', track.name);
    const decoded = await identified.game.loadTrack(archive, track);
    assert.equal(state.triangles, decoded.triangles, track.name);
    assert.equal(state.instances, decoded.instances, track.name);
    assert.equal(state.textures, decoded.textures.size, track.name);
    uiTracks.push({ name: track.name, ...summary(decoded) });
    const category = track.category ?? 'tracks';
    assertStoredPathBytes(decoded.paths, (await archive.readResource(track.index)).data);
    await checkPathOverlay(page, decoded.paths, !categories.has(category));
    if (!categories.has(category) || [Math.floor(tracks.length / 3), Math.floor(2 * tracks.length / 3), tracks.length - 1].includes(i)) {
      categories.add(category);
      const screenshot = `firebugs-${track.index}.png`;
      await page.screenshot({ path: path.join(output, screenshot) });
      screenshots.push({ category, name: track.name, filename: screenshot });
    }
  }
  console.log(`Loaded ${tracks.length} Firebugs resources through the viewer.`);
  await page.selectOption('#track', String(first.index)); await waitTrack(first.name);
  const initial = await inspect();
  await page.mouse.move(1050, 600); await page.mouse.down(); await page.mouse.move(1130, 650, { steps: 5 }); await page.mouse.up();
  assert.notEqual((await inspect()).yaw, initial.yaw);
  await page.selectOption('#mode', 'fly');
  await page.evaluate(() => { document.getElementById('canvas').requestPointerLock = undefined; });
  await page.mouse.click(1050, 600);
  const fly = await inspect();
  await page.keyboard.down('w'); await page.waitForTimeout(100); await page.keyboard.up('w');
  assert.notDeepEqual((await inspect()).eye, fly.eye);
  await page.selectOption('#mode', 'orbit'); await page.locator('#reset').click();
  await page.selectOption('#sector', '0'); await page.locator('#objects').uncheck();
  await page.locator('#textures').uncheck(); await page.locator('#lighting').uncheck();
  const downloading = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await downloading;
  assert.ok(download.suggestedFilename().startsWith('firebugs-'));
  const files = readTrackZIP(await readFile(await download.path()));
  const scene = await identified.game.loadTrack(archive, first);
  assert.equal(files.get('scene.obj').toString('utf8'), scene.obj);
  assert.deepEqual(JSON.parse(files.get('scene.json').toString('utf8')), JSON.parse(JSON.stringify(buildTrackManifest(scene, first))));
  assert.equal(files.size, scene.textures.size + 4);
  for (const match of files.get('scene.mtl').toString('utf8').matchAll(/^map_(?:Kd|d) (.+)$/gm)) assert.ok(files.has(match[1]));
  for (const [texturePage, texture] of scene.textures) {
    const png = files.get(`texture-${texturePage}.png`);
    const pixels = await page.evaluate(async base64 => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, image.width, image.height).data;
      return { width: image.width, height: image.height, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba)), byte => byte.toString(16).padStart(2, '0')).join('') };
    }, png.toString('base64'));
    assert.deepEqual(pixels, { width: texture.width, height: texture.height, hash: hash(texture.rgba) });
  }
  await page.locator('#objects').check(); await page.locator('#textures').check(); await page.locator('#lighting').check();
  await page.locator('#reset').click();
  const bundle = await buildViewerBundle(['src/ps1-disc.mjs', 'src/firebugs-archive.mjs', 'src/firebugs.mjs']);
  const browserParity = await page.evaluate(async bundle => {
    const modules = (0, eval)(bundle), file = document.getElementById('disc').files[0];
    const disc = await modules['src/ps1-disc.mjs'].openFirebugsDisc({ size: file.size,
      read: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()) });
    const archive = await modules['src/firebugs-archive.mjs'].FirebugsArchive.open(disc);
    const identified = await modules['src/firebugs.mjs'].identifyFirebugs(archive);
    if (!identified.verified) throw new Error('Browser disc identity is unverified.');
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    const result = [], encode = value => new TextEncoder().encode(value);
    for (const track of identified.tracks) {
      const scene = await identified.game.loadTrack(archive, track);
      result.push({ name: track.name, segments: scene.segments, instances: scene.instances, triangles: scene.triangles,
        vertices: scene.vertices, bounds: scene.bounds, groupsHash: await hash(encode(JSON.stringify(scene.groups))), objHash: await hash(encode(scene.obj)), pathsHash: await hash(encode(JSON.stringify(scene.paths))),
        textures: await Promise.all([...scene.textures].map(async ([page, image]) => ({ page, width: image.width, height: image.height, hash: await hash(image.rgba) }))) });
    }
    return result;
  }, bundle);
  assert.deepEqual(browserParity, uiTracks);
  console.log(`Matched ${tracks.length} Firebugs browser/Node geometry and texture summaries.`);
  // A newer invalid source must win over an older pending reload, then recover.
  await page.evaluate(() => {
    document.getElementById('reload').click();
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(8)], 'invalid.zip'));
    document.getElementById('disc').files = transfer.files;
    document.getElementById('disc').dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => document.getElementById('error').textContent.length > 0);
  await page.waitForTimeout(200);
  assert.equal((await inspect()).track, null); assert.equal(await page.locator('#download').isDisabled(), true);
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(window.checkDiscFile);
    document.getElementById('disc').files = transfer.files;
    document.getElementById('disc').dispatchEvent(new Event('change'));
  });
  await waitTrack(first.name);
  const last = tracks.at(-1);
  await page.evaluate(({ first, last }) => {
    const track = document.getElementById('track');
    for (const index of [first, last]) { track.value = String(index); track.dispatchEvent(new Event('change')); }
  }, { first: first.index, last: last.index });
  await waitTrack(last.name);
  await page.selectOption('#game', 'firebugs'); await waitTrack(first.name);
  await page.selectOption('#game', 'auto'); await waitTrack(first.name);
  const webglError = await page.evaluate(() => document.getElementById('canvas').getContext('webgl').getError());
  assert.equal(webglError, 0); assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  const result = { identity: identified.identity, verified: identified.verified, uiTracks, browserParity, screenshots,
    download: { filename: download.suggestedFilename(), exactOBJ: true, exactManifest: true, texturePixelsMatch: true, completeDespiteDisplayFilters: true },
    navigation: 'passed', sourceRecovery: 'passed', staleLoads: 'passed', explicitAndAutomatic: 'passed', pathOverlays: 'source-byte parity, experimental label, controls and filters passed', pageErrors: errors, externalRequests: requests, webglError };
  await writeFile(path.join(output, 'browser-check.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ tracks: tracks.length, screenshots, pageErrors: errors, externalRequests: requests, webglError, output }));
} finally {
  await archive.close?.(); await disc.close?.(); await browser.close();
}
