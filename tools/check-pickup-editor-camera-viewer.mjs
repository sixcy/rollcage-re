// Genuine camera/menu regression after terrain placement; no native game launch.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {Navigation} from './track-viewer/navigation.mjs';
import {cameraRay, intersectTerrain, pickPickup, sourceToDisplay} from './track-viewer/pickup-picking.mjs';

const [launcher, output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!launcher || !output) throw Error('Usage: node tools/check-pickup-editor-camera-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
await mkdir(output);
const {chromium} = createRequire(path.resolve(launcher))('playwright-core');
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}}), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const inspect = () => page.evaluate(() => window.rollcageViewer.inspect());
let archive, stage = 'load', report, mutations;
try {
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation, 'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation, 'IDXData/Rollcage.idx'));
  await page.waitForFunction(() => {const s = window.rollcageViewer.inspect(); return s.editor?.available && !s.loading;});
  await page.locator('#practice-start').click();
  await page.waitForFunction(() => window.rollcageViewer.inspect().practice.state === 'running');
  await page.locator('#editor-enable').check();
  archive = await RollcageArchive.open(installation);
  const game = getGame('rollcage'), track = game.tracks.find(row => row.name === 'LOW/LEV1.BLP');
  const {data} = await archive.readResource(track.index), {data: texture} = await archive.readResource(track.textureIndex);
  const scene = game.decodeTrack(data, texture), before = await inspect();
  const nav = new Navigation(); nav.reset(scene.bounds);
  Object.assign(nav, {mode: before.mode, eye: before.eye, target: before.target, yaw: before.yaw, pitch: before.pitch, distance: before.distance});
  const box = await page.locator('#canvas').boundingBox(), rect = {left: box.x, top: box.y, width: box.width, height: box.height};
  const points = before.editor.pickups.map(row => sourceToDisplay(row.position));
  const candidates = Array.from({length: 81}, (_, i) => [450 + i % 9 * 95, 120 + Math.floor(i / 9) * 90]);
  const drop = candidates.find(([x,y]) => pickPickup(points, nav, rect, x, y) === null && intersectTerrain(scene, cameraRay(nav, rect, x, y)));
  assert.ok(drop, 'An uncovered terrain point is available');
  stage = 'place-pickup';
  await page.locator('#editor-add').click(); await page.mouse.click(...drop);
  let state = await inspect();
  assert.equal(state.editor.pickups.length, before.editor.pickups.length + 1);
  assert.equal(state.editor.adding, false); assert.equal(state.editor.editing, true);
  assert.equal(state.practice.state, 'paused');
  assert.equal(await page.locator('#canvas').evaluate(canvas => canvas.hasPointerCapture(1)), false);
  const placed = state.editor.pickups;
  checks.push('Genuine terrain addition finishes placement without capturing the sidebar');

  stage = 'idle-menu-mutations';
  mutations = await page.evaluate(async () => {
    const result = {camera: 0, editingControls: 0, note: 0};
    const observers = [];
    for (const [key, ids] of Object.entries({camera: ['mode'], editingControls: ['practice-start','practice-step','practice-reset','practice-recover','practice-weapons','practice-ai-count','practice-car','practice-follow'], note: ['practice-note']})) {
      const observer = new MutationObserver(rows => {result[key] += rows.length;}); observers.push(observer);
      for (const id of ids) observer.observe(document.getElementById(id), {attributes: true, attributeFilter: ['disabled'], childList: true, subtree: true, characterData: true});
    }
    for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
    observers.forEach(observer => observer.disconnect()); return result;
  });
  assert.deepEqual(mutations, {camera: 0, editingControls: 0, note: 0}, 'Idle frames must not rewrite paused editor controls or camera options');
  checks.push('Twenty idle render frames produce zero camera, editor-control or status-text mutations');

  stage = 'camera-dropdown';
  await page.locator('#mode').click(); await page.waitForTimeout(350);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.rollcageViewer.inspect().mode === 'fly');
  assert.equal(await page.locator('#mode').inputValue(), 'fly');
  assert.equal(await page.locator('#camera-follow').isDisabled(), true);
  state = await inspect(); assert.equal(state.editor.editing, true); assert.equal(state.practice.state, 'paused');
  assert.deepEqual(state.editor.pickups, placed);
  await page.locator('#mode').click(); await page.waitForTimeout(350);
  await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.rollcageViewer.inspect().mode === 'orbit');
  checks.push('Mouse-opened Camera menu stays usable and switches Fly-in / Orbit while retaining the paused draft');

  stage = 'exit-editor';
  await page.locator('#editor-enable').uncheck();
  await page.waitForFunction(() => !window.rollcageViewer.inspect().editor.editing);
  assert.equal(await page.locator('#camera-follow').isDisabled(), false);
  await page.selectOption('#mode', 'follow');
  await page.waitForFunction(() => window.rollcageViewer.inspect().mode === 'follow');
  assert.deepEqual((await inspect()).editor.pickups, placed);
  checks.push('Leaving editing restores Follow car without losing the added point');
  assert.deepEqual(errors, []);
  report = {matched: true, checks, mutations, errors, scope: 'Headless Edge DOM interaction with original archives read-only; no native game capture.'};
} catch (error) {
  report = {matched: false, stage, error: error.stack, mutations, errors, state: await inspect().catch(() => null)};
  process.exitCode = 1;
} finally {
  await page.screenshot({path: path.join(output, 'camera-menu.png'), fullPage: true}).catch(() => {});
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  await archive?.close(); await browser.close();
}
console.log(JSON.stringify({matched: report.matched, stage, checks: report.checks, mutations, error: report.error, output}));
