// Uses caller-installed Playwright and Edge, like check-scene-viewer.mjs.
// No dependencies are downloaded. The installed archive is opened read-only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RollcageArchive } from '../src/archive.mjs';
import { decodeTrack, tracks } from './track-viewer/track-data.mjs';
import { buildViewerBundle } from './lib/track-viewer-bundle.mjs';
import { readTrackZIP } from './lib/check-track-download.mjs';

const [launcher, installation = 'C:\\Program Files (x86)\\Psygnosis\\Rollcage', output = `analysis/track-viewer/check-${Date.now()}`] = process.argv.slice(2);
if (!launcher) throw new Error('Usage: node tools/check-track-viewer.mjs <installed-REA-launcher> [installation-directory] [new-report-directory]');
const require = createRequire(path.resolve(launcher)), { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const summary = scene => ({
  segments: scene.segments, instances: scene.instances, triangles: scene.triangles, vertices: scene.vertices,
  bounds: scene.bounds, groupsHash: hash(JSON.stringify(scene.groups)),
  objHash: hash(scene.obj),
  textures: [...scene.textures].map(([page, image]) => ({ page, width: image.width, height: image.height, hash: hash(image.rgba) }))
});
let archive;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(path.resolve('docs/index.html')).href);
  const landingScreenshot = await page.screenshot();
  await page.getByRole('link', { name: 'Open the Track Viewer' }).click();
  assert.equal(page.url(), pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  const inspect = () => page.evaluate(() => window.rollcageViewer.inspect());
  const waitTrack = name => page.waitForFunction(name => window.rollcageViewer.inspect().track === name && !window.rollcageViewer.inspect().loading, name, { timeout: 30000 });
  const imagePath = path.join(installation, 'IDXData/Rollcage.img'), indexPath = path.join(installation, 'IDXData/Rollcage.idx');
  await page.locator('#image').setInputFiles(imagePath);
  assert.equal(await page.locator('#track').isDisabled(), true);
  assert.equal(await page.locator('#download').isDisabled(), true);
  await page.locator('#index').setInputFiles(indexPath);
  await waitTrack('LOW/LEV1.BLP');
  assert.equal(await page.locator('#track option').count(), 40);
  assert.equal(await page.locator('#error').textContent(), '');
  const initial = await inspect();
  assert.equal(await page.locator('#download').isEnabled(), true);
  assert.equal(initial.instances, 114); assert.equal(initial.triangles, 32851);
  const before = await page.locator('#canvas').screenshot();
  await page.mouse.move(1000, 600); await page.mouse.down(); await page.mouse.move(1120, 650, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -250); await page.waitForTimeout(80);
  const rotated = await inspect(); assert.notEqual(rotated.yaw, initial.yaw); assert.ok(rotated.distance < initial.distance);
  assert.ok(!(await page.locator('#canvas').screenshot()).equals(before));
  await page.mouse.down({ button: 'right' }); await page.mouse.move(1050, 680, { steps: 6 }); await page.mouse.up({ button: 'right' });
  const panned = await inspect(); assert.notDeepEqual(panned.target, rotated.target);
  await page.keyboard.down('w'); await page.waitForTimeout(100); await page.keyboard.up('w');
  assert.notDeepEqual((await inspect()).target, panned.target);
  // Holding a navigation key while leaving the canvas must not keep moving.
  await page.keyboard.down('w'); await page.locator('#mode').focus(); await page.keyboard.up('w');
  const stopped = await inspect(); await page.waitForTimeout(100);
  assert.deepEqual((await inspect()).eye, stopped.eye); assert.equal((await inspect()).heldKeys, 0);
  await page.keyboard.press('ArrowLeft'); assert.equal((await inspect()).yaw, stopped.yaw);
  await page.selectOption('#mode', 'fly'); const flyStart = await inspect();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(flyStart.eye[i] - stopped.eye[i]) < 1e-6);
  await page.mouse.click(1050, 650);
  await page.keyboard.down('w'); await page.keyboard.down('e'); await page.waitForTimeout(150); await page.keyboard.up('w'); await page.keyboard.up('e');
  const flown = await inspect(); assert.notDeepEqual(flown.eye, flyStart.eye);
  await page.mouse.move(1100, 620, { steps: 5 }); await page.waitForTimeout(50);
  const looked = await inspect();
  const pointerLockWorked = await page.evaluate(() => document.pointerLockElement === document.getElementById('canvas'));
  if (pointerLockWorked) assert.notEqual(looked.yaw, flown.yaw);
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => document.pointerLockElement === null), true);
  // Exercise drag-to-look even when pointer lock was supported above.
  await page.evaluate(() => { document.getElementById('canvas').requestPointerLock = undefined; });
  const fallbackBefore = await inspect();
  await page.mouse.move(1000, 600); await page.mouse.down(); await page.mouse.move(1080, 630, { steps: 5 }); await page.mouse.up();
  assert.notEqual((await inspect()).yaw, fallbackBefore.yaw);
  const speed = (await inspect()).speed; await page.mouse.wheel(0, -200); await page.waitForTimeout(50);
  assert.ok((await inspect()).speed > speed);
  const beforeOrbit = await inspect(); await page.selectOption('#mode', 'orbit');
  const afterOrbit = await inspect();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(beforeOrbit.eye[i] - afterOrbit.eye[i]) < 1e-6);
  await page.selectOption('#sector', '0');
  await page.locator('#objects').uncheck(); await page.locator('#textures').uncheck(); await page.locator('#lighting').uncheck(); await page.locator('#filter').check();
  await page.waitForTimeout(80);
  // A PNG encoding failure should keep the loaded scene available for retry.
  await page.evaluate(() => {
    window.savedCanvasToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); };
  });
  await page.locator('#download').click();
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('PNG'));
  assert.equal((await inspect()).track, 'LOW/LEV1.BLP');
  assert.equal(await page.locator('#download').isEnabled(), true);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.savedCanvasToBlob; });
  // Hidden objects and a selected sector must not filter the exported track.
  const downloading = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await downloading; assert.equal(download.suggestedFilename(), 'LOW-LEV1.zip');
  const downloadedFiles = readTrackZIP(await readFile(await download.path()));
  assert.equal(downloadedFiles.size, 22); // OBJ, MTL, instructions, 19 textures.
  const downloadedOBJ = downloadedFiles.get('scene.obj').toString('utf8');
  assert.equal(downloadedOBJ.split('\n').filter(line => line.startsWith('f ')).length, initial.triangles);
  assert.equal(downloadedOBJ.split('\n').filter(line => line.startsWith('g object_')).length, initial.instances);
  const downloadedMTL = downloadedFiles.get('scene.mtl').toString('utf8');
  assert.match(downloadedOBJ, /^mtllib scene\.mtl$/m);
  for (const match of downloadedMTL.matchAll(/^map_(?:Kd|d) (.+)$/gm)) assert.ok(downloadedFiles.has(match[1]));
  assert.equal(await page.evaluate(() => document.getElementById('canvas').getContext('webgl').getError()), 0);
  await page.locator('#reset').click(); assert.equal(await page.locator('#sector').inputValue(), '-1');
  assert.equal((await inspect()).mode, 'orbit');
  await page.locator('#objects').check(); await page.locator('#textures').check(); await page.locator('#lighting').check();
  // Two selections in one turn force the earlier asynchronous request stale.
  await page.evaluate(() => {
    const select = document.getElementById('track');
    select.value = '32'; select.dispatchEvent(new Event('change'));
    select.value = '108'; select.dispatchEvent(new Event('change'));
  });
  await waitTrack('HIGH/LEV20.BLP'); await page.waitForTimeout(150);
  assert.equal((await inspect()).track, 'HIGH/LEV20.BLP');
  await page.locator('#index').setInputFiles({ name: 'bad.idx', mimeType: 'application/octet-stream', buffer: Buffer.alloc(15) });
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('index size'));
  assert.equal(await page.locator('#track').isDisabled(), true); assert.equal((await inspect()).track, null);
  assert.equal(await page.locator('#download').isDisabled(), true);
  await page.locator('#index').setInputFiles(indexPath); await waitTrack('LOW/LEV1.BLP');
  // A structurally valid index with wrong resource bytes must fail safely too.
  await page.locator('#image').setInputFiles({ name: 'bad.img', mimeType: 'application/octet-stream', buffer: Buffer.from([0]) });
  const wrongResourceIndex = Buffer.alloc(344 * 16);
  for (let i = 0; i < 344; i++) { wrongResourceIndex.writeUInt32LE(1, i * 16 + 4); wrongResourceIndex.writeUInt32LE(1, i * 16 + 8); }
  await page.locator('#index').setInputFiles({ name: 'bad.idx', mimeType: 'application/octet-stream', buffer: wrongResourceIndex });
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('Invalid GFXM'));
  assert.equal((await inspect()).track, null);
  await page.locator('#image').setInputFiles(imagePath); await page.locator('#index').setInputFiles(indexPath); await waitTrack('LOW/LEV1.BLP');

  const unavailable = await browser.newPage();
  await unavailable.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await unavailable.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  assert.match(await unavailable.locator('#error').textContent(), /WebGL is unavailable/);
  assert.equal(await unavailable.locator('#image').isDisabled(), true);
  await unavailable.close();

  // Evaluate the exact packed browser readers in the actual browser runtime.
  const bundle = await buildViewerBundle(['tools/track-viewer/file-archive.mjs', 'tools/track-viewer/track-data.mjs']);
  const browserResults = await page.evaluate(async bundle => {
    const modules = (0, eval)(bundle);
    const { FileArchive } = modules['tools/track-viewer/file-archive.mjs'];
    const { decodeTrack, tracks } = modules['tools/track-viewer/track-data.mjs'];
    const archive = await FileArchive.open(document.getElementById('image').files[0], document.getElementById('index').files[0]);
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    const results = [];
    for (const track of tracks) {
      const geometry = await archive.readResource(track.index), texture = await archive.readResource(track.index + 1);
      const scene = decodeTrack(geometry.data, texture.data);
      results.push({ name: track.name, summary: {
        segments: scene.segments, instances: scene.instances, triangles: scene.triangles, vertices: scene.vertices,
        bounds: scene.bounds, groupsHash: await hash(new TextEncoder().encode(JSON.stringify(scene.groups))),
        objHash: await hash(new TextEncoder().encode(scene.obj)),
        textures: await Promise.all([...scene.textures].map(async ([page, image]) => ({ page, width: image.width, height: image.height, hash: await hash(image.rgba) })))
      } });
    }
    return results;
  }, bundle);
  archive = await RollcageArchive.open(installation);
  for (const [i, track] of tracks.entries()) {
    const geometry = await archive.readResource(track.index), texture = await archive.readResource(track.index + 1);
    assert.deepEqual(browserResults[i], { name: track.name, summary: summary(decodeTrack(geometry.data, texture.data)) });
  }
  const firstGeometry = await archive.readResource(30), firstTextures = await archive.readResource(31);
  const firstScene = decodeTrack(firstGeometry.data, firstTextures.data);
  assert.equal(downloadedOBJ, firstScene.obj);
  for (const [texturePage, texture] of firstScene.textures) {
    const png = downloadedFiles.get(`texture-${texturePage}.png`);
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
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  await page.locator('#reset').click(); await page.waitForTimeout(100);
  const levelOneScreenshot = await page.screenshot();
  await page.selectOption('#track', '34'); await waitTrack('LOW/LEV3.BLP'); await page.waitForTimeout(100);
  const levelThreeScreenshot = await page.screenshot();
  await page.selectOption('#track', '30'); await waitTrack('LOW/LEV1.BLP'); await page.waitForTimeout(100);
  const result = { initial, browserParity: browserResults, download: { filename: download.suggestedFilename(), files: [...downloadedFiles.keys()], exactOBJ: true, texturePixelsMatch: true, retryAfterEncodingFailure: true }, controls: 'passed', pointerLockWorked, fallbackLook: 'passed', staleLoads: 'passed', errorRecovery: 'passed', pageErrors: errors, externalRequests: requests,
    webglError: await page.evaluate(() => document.getElementById('canvas').getContext('webgl').getError()) };
  assert.equal(result.webglError, 0);
  await mkdir(output, { recursive: false });
  await writeFile(path.join(output, 'landing.png'), landingScreenshot, { flag: 'wx' });
  await writeFile(path.join(output, 'level1.png'), levelOneScreenshot, { flag: 'wx' });
  await writeFile(path.join(output, 'level3.png'), levelThreeScreenshot, { flag: 'wx' });
  await page.screenshot({ path: path.join(output, 'preview.png') });
  await writeFile(path.join(output, 'browser-check.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ matchedTracks: browserResults.length, controls: result.controls, pointerLockWorked, pageErrors: errors, externalRequests: requests, webglError: result.webglError, output }));
} finally { await archive?.close(); await browser.close(); }
