import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {RollcageArchive} from '../../src/archive.mjs';
import {createSession} from '../../src/solo-session.mjs';
import {buildViewerBundle} from './track-viewer-bundle.mjs';

export async function checkSoloPractice(page, installation) {
  const inspect = () => page.evaluate(() => window.rollcageViewer.inspect());
  assert.equal(await page.locator('fieldset').filter({has: page.locator('#practice-start')}).locator('legend').textContent(), 'Racing test');
  assert.match(await page.locator('#racing-warning').textContent(), /Super experimental/);
  await page.waitForFunction(() => window.rollcageViewer.inspect().practice?.state === 'ready');
  await page.locator('#practice-weapons').uncheck();
  await page.waitForFunction(() => window.rollcageViewer.inspect().practice?.state === 'ready' && !window.rollcageViewer.inspect().practice?.weapons?.enabled);
  assert.equal((await inspect()).practice.ticks, 0);
  assert.ok((await inspect()).carBuffers > 0);
  await page.locator('#practice-follow').check();
  await page.locator('#practice-start').click();
  await page.waitForFunction(() => window.rollcageViewer.inspect().practice?.ticks >= 60);
  await page.locator('#practice-start').click();
  const paused = await inspect();
  assert.equal(paused.practice.state, 'paused'); assert.equal(paused.mode, 'follow');
  assert.notDeepEqual(paused.practice.position, [-4015,-40,1759]);
  await page.waitForTimeout(150); assert.deepEqual((await inspect()).practice, paused.practice);
  const screenshot = await page.screenshot();
  await page.selectOption('#mode', 'fly');
  assert.equal((await inspect()).practice.state, 'paused');
  await page.locator('#practice-start').click();
  await page.waitForFunction(ticks => window.rollcageViewer.inspect().practice.ticks > ticks, paused.practice.ticks);
  assert.equal((await inspect()).mode, 'fly');
  // Simulate the browser visibility event without a multi-minute sleep.
  await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));});
  const hidden = await inspect(); assert.equal(hidden.practice.state, 'paused');
  await page.waitForTimeout(100); assert.equal((await inspect()).practice.ticks, hidden.practice.ticks);
  await page.evaluate(() => {delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await inspect()).practice.state, 'paused');
  await page.locator('#practice-reset').click();
  assert.equal((await inspect()).practice.ticks, 0); assert.equal((await inspect()).practice.laps, 0);
  // Evaluate the actual packed runtime with the browser's own File/ByteBuffer.
  const bundle = await buildViewerBundle(['tools/track-viewer/file-archive.mjs', 'src/solo-session.mjs']);
  const browserState = await page.evaluate(async bundle => {
    const modules = (0, eval)(bundle), {FileArchive} = modules['tools/track-viewer/file-archive.mjs'];
    const archive = await FileArchive.open(document.getElementById('image').files[0], document.getElementById('index').files[0]);
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31);
    const session = modules['src/solo-session.mjs'].createSession(data, textures);
    let value = session.snapshot;
    while (value.laps < 3 && value.ticks < 10800) value = session.step();
    session.dispose(); return value;
  }, bundle);
  const archive = await RollcageArchive.open(installation);
  try {
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31), session = createSession(data, textures);
    while (session.snapshot.ticks < browserState.ticks) session.step();
    assert.deepEqual(browserState, JSON.parse(JSON.stringify(session.snapshot)));
    assert.equal(browserState.laps, 3); assert.equal(browserState.recoveries, 0);
    session.dispose();
  } finally {await archive.close();}
  assert.equal(await page.evaluate(() => document.getElementById('canvas').getContext('webgl').getError()), 0);
  return {screenshot, report: {controls: ['start', 'pause', 'resume', 'reset', 'follow', 'free-camera', 'hidden-tab-pause'], browserState, browserNodeMatched: true}};
}

export async function saveSoloPractice(result, output) {
  await writeFile(path.join(output, 'solo-practice.png'), result.screenshot, {flag: 'wx'});
  await writeFile(path.join(output, 'solo-practice.json'), JSON.stringify(result.report, null, 2), {flag: 'wx'});
}
