import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {FirebugsArchive} from '../src/firebugs-archive.mjs';
import {identifyGame} from '../src/track-games.mjs';
import {openFirebugsZip} from './lib/firebugs-disc.mjs';
import {listObjectResources, loadObjectCollection} from '../src/object-catalog.mjs';
import {buildObjectManifest} from './object-viewer/export-object.mjs';
import {readTrackZIP} from './lib/check-track-download.mjs';

const [launcher, output, rollcage = 'C:/Program Files (x86)/Psygnosis/Rollcage', stage2 = 'C:/Program Files (x86)/Psygnosis/Rollcage Stage II', firebugs] = process.argv.slice(2);
if (!launcher || !output || !firebugs) throw Error('Usage: node tools/check-object-viewer.mjs INSTALLED_LAUNCHER NEW_REPORT_DIRECTORY ROLLCAGE_ROOT STAGE2_ROOT FIREBUGS_ZIP');
const require = createRequire(path.resolve(launcher)), {chromium} = require('playwright-core');
await mkdir(output);
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), results = [];
try {
  for (const [gameId, installation] of [['rollcage', rollcage], ['stage2', stage2], ['firebugs', firebugs]]) {
    const archive = gameId === 'firebugs' ? await FirebugsArchive.open(await openFirebugsZip(installation)) : await RollcageArchive.open(installation);
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
    try {
      const identified = await identifyGame(archive, gameId), resources = await listObjectResources(archive, identified.game, identified.tracks);
      const collection = await loadObjectCollection(archive, identified.game, resources[0]);
      await page.goto(pathToFileURL(path.resolve('docs/object-viewer.html')).href);
      if (gameId === 'firebugs') await page.locator('#disc').setInputFiles(installation);
      else {
        await page.locator('#image').setInputFiles(path.join(installation, 'IDXData/ROLLCAGE.IMG'));
        await page.locator('#index').setInputFiles(path.join(installation, 'IDXData/ROLLCAGE.IDX'));
      }
      const inspect = () => page.evaluate(() => window.rollcageObjectViewer.inspect());
      await page.waitForFunction(id => {const state = window.rollcageObjectViewer.inspect(); return state.game === id && state.triangles > 0 && !state.loading;}, gameId, {timeout: 120000});
      let state = await inspect();
      const initialSelection = state.selected;
      if (gameId === 'rollcage') {
        assert.equal(state.selectedKind, 'vehicle-assembled'); assert.equal(state.parts, 5);
        assert.equal(await page.locator('#kind').inputValue(), 'cars');
        assert.match(await page.locator('#download').textContent(), /complete car/i);
      }
      await page.selectOption('#kind', 'all');
      assert.equal(state.verified, true); assert.equal(state.resources.length, resources.length);
      assert.deepEqual(state.entries.map(row => row.id), collection.entries.map(row => row.id));
      const checked = [];
      const choices = collection.entries.filter(row => row.status === 'supported');
      const selected = [...new Set([state.selected, choices[1]?.id, choices.find(row => row.kind === 'vehicle-body')?.id].filter(Boolean))];
      for (const id of selected) {
        await page.selectOption('#object', id);
        await page.waitForFunction(id => {const s = window.rollcageObjectViewer.inspect(); return s.selected === id && !s.loading && s.triangles > 0;}, id);
        state = await inspect(); const expected = collection.load(id);
        assert.equal(state.triangles, expected.triangles); assert.equal(state.vertices, expected.vertices); assert.equal(state.textures, expected.textures.size);
        assert.equal(state.groups, expected.groups.length); assert.deepEqual(state.bounds, expected.bounds); assert.equal(state.error, '');
        checked.push({id, triangles: state.triangles, textures: state.textures});
      }
      if (gameId === 'rollcage') {
        await page.selectOption('#object', initialSelection);
        await page.waitForFunction(id => {const s = window.rollcageObjectViewer.inspect(); return s.selected === id && s.parts === 5 && !s.loading;}, initialSelection);
      }
      const before = await inspect(), canvasBefore = await page.locator('#canvas').screenshot();
      await page.mouse.move(1000, 500); await page.mouse.down(); await page.mouse.move(1100, 560, {steps: 6}); await page.mouse.up();
      assert.notDeepEqual((await inspect()).eye, before.eye);
      assert.equal(canvasBefore.equals(await page.locator('#canvas').screenshot()), false);
      await page.locator('#fit').click();
      assert.deepEqual((await inspect()).eye, before.eye);
      await page.locator('#search').fill(String(collection.entries.find(row => row.id === before.selected).modelIndex));
      await page.locator('#search').press('w');
      assert.equal((await inspect()).heldKeys, 0);
      await page.locator('#search').fill('');
      await page.selectOption('#object', before.selected);
      await page.waitForFunction(id => window.rollcageObjectViewer.inspect().selected === id && !window.rollcageObjectViewer.inspect().loading, before.selected);
      await page.locator('#model-mode').focus();
      const focus = await page.evaluate(() => new Promise(resolve => {
        const select = document.getElementById('model-mode'), mutations = [];
        const observer = new MutationObserver(rows => mutations.push(...rows.map(row => row.type)));
        observer.observe(select, {subtree: true, attributes: true, childList: true, characterData: true});
        let count = 0, focused = 0;
        function frame() {count++; if (document.activeElement === select) focused++; if (count < 30) requestAnimationFrame(frame); else {observer.disconnect(); resolve({count, focused, mutations});}}
        requestAnimationFrame(frame);
      }));
      assert.equal(focus.count, focus.focused); assert.deepEqual(focus.mutations, []);
      await page.selectOption('#model-mode', 'fly');
      await page.evaluate(() => {document.getElementById('canvas').requestPointerLock = undefined;});
      await page.locator('#canvas').click(); const flying = await inspect();
      await page.keyboard.down('w'); await page.waitForTimeout(100); await page.keyboard.up('w');
      assert.notDeepEqual((await inspect()).eye, flying.eye);
      await page.locator('#fit').click();
      await page.locator('#textures').uncheck(); await page.locator('#lighting').uncheck();
      state = await inspect(); const scene = collection.load(state.selected);
      const downloading = page.waitForEvent('download'); await page.locator('#download').click(); const download = await downloading;
      const files = readTrackZIP(await readFile(await download.path()));
      assert.deepEqual(JSON.parse(files.get('manifest.json').toString('utf8')), buildObjectManifest(scene));
      const expectedOBJ = ['mtllib object.mtl', ...scene.obj.split(/\r?\n/).filter(line => !/^mtllib\b/.test(line))].join('\n').replace(/\n*$/, '\n');
      assert.equal(files.get('object.obj').toString('utf8'), expectedOBJ);
      for (const match of files.get('object.mtl').toString('utf8').matchAll(/^map_(?:Kd|d) (.+)$/gm)) assert.ok(files.has(match[1]));
      for (const [id, image] of scene.textures) {
        const bytes = files.get(`texture-${id}.png`); assert.ok(bytes);
        const decoded = await page.evaluate(async base64 => {
          const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          const rgba = context.getImageData(0, 0, image.width, image.height).data;
          return {width: image.width, height: image.height, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba)), b => b.toString(16).padStart(2, '0')).join('')};
        }, bytes.toString('base64'));
        assert.deepEqual(decoded, {width: image.width, height: image.height, hash: hash(image.rgba)});
      }
      await page.locator('#textures').check(); await page.locator('#lighting').check();
      await page.screenshot({path: path.join(output, `${gameId}-desktop.png`)});
      const unavailable = collection.entries.find(row => row.status === 'unsupported');
      if (unavailable) {
        await page.locator('#show-unavailable').check(); await page.selectOption('#object', unavailable.id);
        await page.waitForFunction(id => window.rollcageObjectViewer.inspect().selected === id && !window.rollcageObjectViewer.inspect().loading, unavailable.id);
        assert.equal((await inspect()).triangles, 0); assert.equal(await page.locator('#download').isDisabled(), true);
        assert.match(await page.locator('#status').textContent(), new RegExp(unavailable.reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        await page.selectOption('#object', choices[0].id);
        await page.waitForFunction(() => window.rollcageObjectViewer.inspect().triangles > 0 && !window.rollcageObjectViewer.inspect().loading);
      }
      await page.setViewportSize({width: 390, height: 844});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#download').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(output, `${gameId}-mobile.png`)});
      assert.equal(await page.evaluate(() => document.getElementById('canvas').getContext('webgl').getError()), 0);
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      results.push({game: gameId, resources: resources.length, checked, download: download.suggestedFilename(), zipFiles: files.size, focus, unsupportedChecked: Boolean(unavailable), errors, requests});
      console.log(JSON.stringify({game: gameId, checkedModels: checked.length, downloadedTextures: scene.textures.size, passed: true}));
    } finally {await page.close(); await archive.close?.();}
  }
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify({passed: true, method: 'Actual headless Edge, local file inputs, independent Node scene comparison, UI navigation/focus/mobile, real ZIP download and PNG pixel verification; no native game launched.', results}, null, 2)}\n`, {flag: 'wx'});
} finally {await browser.close();}
