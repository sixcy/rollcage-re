import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession, SOLO_STEP_SECONDS} from '../src/solo-session.mjs';
import {buildViewerBundle} from './lib/track-viewer-bundle.mjs';
import {getGame} from '../src/track-games.mjs';

const [launcher, output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!launcher || !output) throw Error('Usage: node tools/check-racing-physics-viewer.mjs INSTALLED_REA_LAUNCHER NEW_REPORT_DIRECTORY [INSTALLATION]');
const require = createRequire(path.resolve(launcher)), {chromium} = require('playwright-core');
await mkdir(output);
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
let archive;
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}}), errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => {if (/^https?:/.test(request.url())) network.push(request.url());});
  await page.goto(pathToFileURL(path.resolve('docs/track-viewer.html')).href);
  await page.locator('#image').setInputFiles(path.join(installation, 'IDXData/Rollcage.img'));
  await page.locator('#index').setInputFiles(path.join(installation, 'IDXData/Rollcage.idx'));
  const inspect = () => page.evaluate(() => window.rollcageViewer.inspect());
  const inspectAfterFrame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(window.rollcageViewer.inspect()))));
  await page.waitForFunction(() => window.rollcageViewer.inspect().practice?.state === 'ready');
  await page.locator('#practice-weapons').uncheck();
  await page.waitForFunction(() => window.rollcageViewer.inspect().practice?.state === 'ready' && !window.rollcageViewer.inspect().practice?.weapons?.enabled);
  await page.waitForFunction(() => window.rollcageViewer.inspect().worldDraws?.objects === 5);
  await page.waitForFunction(() => window.rollcageViewer.inspect().carDraws?.cars === 6);
  const ready = await inspect();
  const cameraMenuChecks = [];
  const checkCameraMenu = async stage => {
    const originalMode = (await inspect()).mode;
    await page.locator('#mode').focus();
    const result = await page.evaluate(() => new Promise(resolve => {
      const menu = document.getElementById('mode'), mutations = [];
      const observer = new MutationObserver(records => {
        for (const record of records) mutations.push({type: record.type, target: record.target.id || record.target.parentElement?.id, attribute: record.attributeName});
      });
      observer.observe(menu, {subtree: true, childList: true, characterData: true, attributes: true});
      let frames = 0, focusedFrames = 0;
      function sample() {
        frames++; if (document.activeElement === menu) focusedFrames++;
        if (frames < 30) requestAnimationFrame(sample);
        else {observer.disconnect(); resolve({frames, focusedFrames, mutations});}
      }
      requestAnimationFrame(sample);
    }));
    cameraMenuChecks.push({stage, ...result});
    await writeFile(path.join(output, `camera-menu-${stage}.json`), `${JSON.stringify(result, null, 2)}\n`, {flag: 'wx'});
    assert.equal(result.focusedFrames, result.frames, 'The camera menu must retain keyboard focus.');
    assert.deepEqual(result.mutations, [], 'Steady rendering must not rebuild or rewrite the native camera menu.');
    await page.locator('#mode').press('Home');
    await page.locator('#mode').press('ArrowDown');
    await page.locator('#mode').press('Enter');
    assert.equal((await inspect()).mode, 'fly', 'The focused camera menu must accept Fly-in keyboard selection.');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'mode');
    assert.equal((await inspect()).heldKeys, 0);
    await page.selectOption('#mode', originalMode);
  };
  await checkCameraMenu('ready');
  assert.ok(ready.worldBuffers > 0);
  assert.match(await page.locator('#racing-warning').textContent(), /Super experimental/);
  const assertPhysics = value => {
    assert.equal(value.physics.wheelContacts.length, 4);
    assert.ok(value.physics.wheelContacts.every(contact => typeof contact === 'boolean'));
    for (const key of ['collisionEvents', 'terrainHits', 'modelHits']) assert.ok(Number.isSafeInteger(value.physics[key]) && value.physics[key] >= 0, key);
    assert.equal(typeof value.physics.recoveryPending, 'boolean');
    assert.ok([value.speed, ...value.position, ...value.rotation, ...value.quaternion].every(Number.isFinite));
  };
  const assertRoster = value => {
    assert.equal(value.cars.length, 6);
    assert.equal(value.aiDifficulty, 2);
    assert.deepEqual(value.cars.map(car => car.vehicleType), [0, 1, 2, 3, 4, 5]);
    for (const [index, car] of value.cars.entries()) {
      assert.equal(car.index, index); assertPhysics(car);
      assert.equal(car.position.length, 3); assert.equal(car.rotation.length, 9); assert.equal(car.quaternion.length, 4);
      for (const key of ['route', 'point', 'checkpoint', 'checkpointCount', 'checkpointTransitions', 'laps', 'recoveries']) {
        assert.ok(Number.isSafeInteger(car[key]) && car[key] >= 0, `Car ${index} ${key}`);
      }
      assert.ok(Number.isFinite(car.lapTime) && car.lapTime >= 0);
      assert.ok(car.bestLap === null || Number.isFinite(car.bestLap) && car.bestLap >= 0);
      assert.equal(car.parts.length, 5);
      for (const part of car.parts) {
        assert.equal(part.position.length, 3); assert.equal(part.rotation.length, 9);
        assert.ok([...part.position, ...part.rotation].every(Number.isFinite));
      }
    }
    for (const key of ['position', 'rotation', 'parts', 'quaternion', 'speed', 'route', 'point', 'checkpoint', 'checkpointCount', 'checkpointTransitions', 'laps', 'lapTime', 'bestLap', 'recoveries', 'physics']) {
      assert.deepEqual(value[key], value.cars[0][key], `Legacy ${key} must follow the first car.`);
    }
  };
  const assertRenderedRoster = value => {
    assert.equal(value.carInstances, 6); assert.equal(value.renderedCars, 6); assert.equal(value.carDraws.cars, 6);
    assert.equal(value.carMeshCounts.length, 6);
    assert.ok(value.carMeshCounts.every(count => Number.isSafeInteger(count) && count > 0));
    assert.equal(value.carBuffers, value.carMeshCounts.reduce((sum, count) => sum + count, 0));
    assert.equal(value.carDraws.groups, value.carBuffers);
  };
  const assertHud = async (value, carIndex = 0) => {
    assert.equal(await page.locator('#physics-hud').isVisible(), true);
    const selected = value.cars[carIndex];
    const metrics = [['physics-speed', selected.speed], ['physics-tick', value.ticks], ['physics-recoveries', selected.recoveries],
      ['physics-collisions', selected.physics.collisionEvents], ['physics-terrain-hits', selected.physics.terrainHits], ['physics-model-hits', selected.physics.modelHits]];
    const formatted = await page.evaluate(metrics => metrics.map(([id, amount]) => [id, Math.trunc(amount).toLocaleString()]), metrics);
    for (const [id, text] of formatted) {
      assert.equal((await page.locator(`#${id}`).textContent()).trim(), text);
    }
    for (let index = 0; index < 4; index++) {
      const wheel = page.locator(`#physics-wheel-${index}`), contact = selected.physics.wheelContacts[index];
      assert.equal(await wheel.getAttribute('data-contact'), String(contact));
      assert.equal((await wheel.textContent()).trim(), contact ? 'Contact' : 'Air');
    }
    const state = (await page.locator('#physics-recovery-state').textContent()).trim();
    assert.ok(state.startsWith(selected.physics.recoveryPending ? 'Recovery requested' : `${value.state[0].toUpperCase()}${value.state.slice(1)}`));
    assert.match(await page.locator('#physics-car-label').textContent(), new RegExp(`Car ${carIndex + 1} of 6`));
    assert.equal(await page.locator('#practice-follow-label').textContent(), `Follow car ${carIndex + 1}`);
    assert.equal(await page.locator('#camera-follow').textContent(), `Follow car ${carIndex + 1}`);
  };
  const assertPausedPresentation = value => {
    const selected = value.practice.cars[value.followedCarIndex], display = value.presentation;
    assert.ok(['ready', 'paused'].includes(value.practice.state));
    assert.equal(display.carIndex, value.followedCarIndex); assert.equal(display.ticks, value.practice.ticks); assert.equal(display.alpha, 1);
    assert.deepEqual(display.position, selected.position); assert.deepEqual(display.rotation, selected.rotation);
    assert.equal(value.mode, 'follow');
    assert.deepEqual(value.target, [display.position[0], -display.position[1] + 25, -display.position[2]]);
  };
  assertRoster(ready.practice); assertRenderedRoster(ready);
  assert.equal(ready.followedCarIndex, 0);
  assert.deepEqual(await page.locator('#practice-car option').evaluateAll(options => options.map(option => option.value)), ['0', '1', '2', '3', '4', '5']);
  assert.match(await page.locator('#practice-roster').textContent(), /6 AI cars · Expert/);
  assert.match(await page.locator('#physics-car-label').textContent(), /Car 1 of 6 · Expert/);
  assert.equal(new Set(ready.practice.cars.map(car => JSON.stringify(car.position))).size, 6, 'The six cars must occupy distinct starting positions.');
  assert.equal(await page.locator('#practice-telemetry').isChecked(), true);
  await assertHud(ready.practice);
  await page.locator('#practice-step').click();
  const firstStep = await inspect();
  assert.equal(firstStep.practice.state, 'paused'); assert.equal(firstStep.practice.ticks, 1);
  assertRoster(firstStep.practice);
  //Frame the authored grid using only the public orbit controls. Simulation
  //stays paused; the screenshot must show the six real cars, not a distant map.
  await page.selectOption('#mode', 'orbit');
  await page.mouse.move(1000, 450); await page.mouse.wheel(0, 1900);
  await page.mouse.down(); await page.mouse.move(1000, 550, {steps: 8}); await page.mouse.up();
  await page.waitForTimeout(100);
  assert.deepEqual((await inspect()).practice, firstStep.practice);
  await page.screenshot({path: path.join(output, 'racing-test-six-car-grid.png')});
  await page.locator('#practice-follow').check();
  await page.locator('#practice-reset').click();
  assert.deepEqual((await inspect()).practice, ready.practice);
  await page.locator('#practice-start').click();
  assert.equal(await page.locator('#practice-step').isDisabled(), true);
  await checkCameraMenu('running');
  await page.waitForFunction(() => window.rollcageViewer.inspect().practice?.ticks >= 60);
  await page.locator('#practice-start').click();
  const paused = await inspect(); assert.equal(paused.practice.state, 'paused');
  assertRoster(paused.practice); assertRenderedRoster(paused);
  await page.waitForTimeout(150); assert.deepEqual((await inspect()).practice, paused.practice);
  await page.locator('#practice-step').click();
  const stepped = await inspect();
  assert.equal(stepped.practice.state, 'paused'); assert.equal(stepped.practice.ticks, paused.practice.ticks + 1);
  assertRoster(stepped.practice);
  await page.waitForTimeout(150); assert.deepEqual((await inspect()).practice, stepped.practice);
  await page.locator('#practice-recover').click();
  const recovered = await inspect();
  assert.equal(recovered.practice.state, 'paused'); assert.equal(recovered.practice.ticks, stepped.practice.ticks + 1);
  assert.equal(recovered.practice.recoveries, stepped.practice.recoveries + 1);
  assert.equal(recovered.practice.physics.recoveryPending, false);
  assertRoster(recovered.practice); await assertHud(recovered.practice);
  assert.equal(recovered.practice.cars[0].recoveries, stepped.practice.cars[0].recoveries + 1);
  await page.locator('#practice-telemetry').uncheck();
  assert.equal(await page.locator('#physics-hud').isVisible(), false);
  assert.deepEqual((await inspect()).practice, recovered.practice);
  await page.locator('#practice-telemetry').check();
  await assertHud(recovered.practice); assert.deepEqual((await inspect()).practice, recovered.practice);
  await page.locator('#practice-start').click();
  await page.waitForFunction(ticks => window.rollcageViewer.inspect().practice?.ticks >= ticks + 10, recovered.practice.ticks);
  await page.locator('#practice-start').click();
  const continued = await inspect();
  assert.equal(continued.practice.state, 'paused'); assert.ok(continued.practice.ticks >= recovered.practice.ticks + 10);
  assert.equal(continued.practice.recoveries, recovered.practice.recoveries); assertRoster(continued.practice); assertRenderedRoster(continued);
  await checkCameraMenu('paused');
  assert.deepEqual((await inspect()).practice, continued.practice, 'Using the paused camera menu must not change simulation state.');
  assert.ok(paused.worldDraws.groups > 0); assert.equal(paused.worldDraws.objects, paused.practice.worldObjects.filter(object => object.visible).length);
  await page.locator('#objects').uncheck();
  await page.waitForFunction(() => window.rollcageViewer.inspect().worldDraws?.objects === 0);
  assertRenderedRoster(await inspect());
  await page.locator('#objects').check();
  await page.waitForFunction(() => window.rollcageViewer.inspect().worldDraws?.objects > 0);
  const selections = [];
  for (let index = 0; index < 6; index++) {
    await page.selectOption('#practice-car', String(index));
    const selected = await inspectAfterFrame();
    assert.equal(selected.followedCarIndex, index); assert.equal(selected.presentation.carIndex, index);
    assert.deepEqual(selected.practice, continued.practice, 'Changing the followed car must preserve the entire paused physics state.');
    assertPausedPresentation(selected); assertRenderedRoster(selected); await assertHud(selected.practice, index);
    selections.push({index, ticks: selected.practice.ticks, position: selected.presentation.position, rotation: selected.presentation.rotation});
  }
  const recoveryCarIndex = 4;
  await page.selectOption('#practice-car', String(recoveryCarIndex));
  const beforeSelectedRecovery = await inspectAfterFrame();
  await page.locator('#practice-recover').click();
  const selectedRecovery = await inspectAfterFrame();
  assert.equal(selectedRecovery.practice.state, 'paused'); assert.equal(selectedRecovery.practice.ticks, beforeSelectedRecovery.practice.ticks + 1);
  assert.equal(selectedRecovery.followedCarIndex, recoveryCarIndex);
  for (let index = 0; index < 6; index++) {
    assert.equal(selectedRecovery.practice.cars[index].recoveries, beforeSelectedRecovery.practice.cars[index].recoveries + (index === recoveryCarIndex ? 1 : 0), `Recovery must target car ${recoveryCarIndex + 1} only.`);
    assert.equal(selectedRecovery.practice.cars[index].physics.recoveryPending, false);
  }
  assertRoster(selectedRecovery.practice); assertPausedPresentation(selectedRecovery); await assertHud(selectedRecovery.practice, recoveryCarIndex);
  await page.locator('#practice-start').click();
  const runningBeforeSelection = await inspect();
  await page.selectOption('#practice-car', '2');
  const runningSelection = await inspectAfterFrame();
  assert.equal(runningSelection.practice.state, 'running'); assert.equal(runningSelection.followedCarIndex, 2);
  assert.ok(runningSelection.practice.ticks >= runningBeforeSelection.practice.ticks);
  const followFrames = await page.evaluate(() => new Promise(resolve => {
    const frames = [];
    function sample(time) {
      const value = window.rollcageViewer.inspect(), raw = value.practice.cars[value.followedCarIndex];
      frames.push({frame: frames.length, time, state: value.practice.state, tick: value.practice.ticks, carIndex: value.followedCarIndex,
        presentation: value.presentation, rawPosition: raw.position, rawRotation: raw.rotation, rawSnapshot: value.practice,
        target: value.target, mode: value.mode, carDraws: value.carDraws});
      if (frames.length === 60) resolve(frames); else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
  await writeFile(path.join(output, 'racing-test-follow-frames.json'), `${JSON.stringify(followFrames, null, 2)}\n`, {flag: 'wx'});
  const intermediatePairs = [];
  for (const [index, frame] of followFrames.entries()) {
    assert.equal(frame.state, 'running'); assert.equal(frame.mode, 'follow'); assert.equal(frame.carIndex, 2);
    assert.equal(frame.presentation.carIndex, frame.carIndex); assert.equal(frame.presentation.ticks, frame.tick);
    assert.ok(frame.presentation.alpha >= 0 && frame.presentation.alpha <= 1);
    assert.ok([...frame.presentation.position, ...frame.presentation.rotation].every(Number.isFinite));
    assert.deepEqual(frame.target, [frame.presentation.position[0], -frame.presentation.position[1] + 25, -frame.presentation.position[2]]);
    assert.equal(frame.carDraws.cars, 6);
    const previous = followFrames[index - 1];
    if (previous) {assert.ok(frame.time > previous.time); assert.ok(frame.tick >= previous.tick);}
    if (previous?.tick === frame.tick) {
      assert.deepEqual(frame.rawSnapshot, previous.rawSnapshot, 'Presentation between physics ticks must preserve every raw snapshot field.');
      if (frame.presentation.position.some((value, axis) => value !== previous.presentation.position[axis])) intermediatePairs.push([index - 1, index]);
    }
  }
  assert.ok(intermediatePairs.length > 0, 'Real RAF samples must show distinct displayed positions while the completed physics tick stays unchanged.');
  await page.locator('#practice-start').click();
  const displayed = await inspectAfterFrame();
  assertRoster(displayed.practice); assertRenderedRoster(displayed); assertPausedPresentation(displayed); await assertHud(displayed.practice, 2);
  await page.locator('#physics-hud').scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(output, 'racing-test.png')});
  await page.screenshot({path: path.join(output, 'racing-test-physics-hud.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  const narrowLayout = await page.evaluate(() => {
    const hud = document.getElementById('physics-hud').getBoundingClientRect(), panel = document.querySelector('aside').getBoundingClientRect();
    return {hud: {left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom}, panelBottom: panel.bottom,
      viewport: {width: innerWidth, height: innerHeight}, pageWidth: document.documentElement.scrollWidth};
  });
  assert.ok(narrowLayout.hud.left >= 0 && narrowLayout.hud.right <= narrowLayout.viewport.width);
  assert.ok(narrowLayout.hud.bottom <= narrowLayout.viewport.height && narrowLayout.hud.top >= narrowLayout.panelBottom);
  assert.equal(narrowLayout.pageWidth, narrowLayout.viewport.width);
  await assertHud(displayed.practice, 2);
  await page.screenshot({path: path.join(output, 'racing-test-mobile.png')});
  await page.setViewportSize({width: 1440, height: 1000});
  await page.locator('#practice-reset').click();
  const reset = await inspectAfterFrame();
  assert.equal(reset.followedCarIndex, 2); assertPausedPresentation(reset);
  assert.deepEqual(reset.practice, ready.practice); assertRoster(reset.practice); await assertHud(reset.practice, 2);
  const bundle = await buildViewerBundle(['tools/track-viewer/file-archive.mjs', 'src/solo-session.mjs']);
  const browserState = await page.evaluate(async bundle => {
    const modules = (0, eval)(bundle), archive = await modules['tools/track-viewer/file-archive.mjs'].FileArchive.open(document.getElementById('image').files[0], document.getElementById('index').files[0]);
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31);
    const session = modules['src/solo-session.mjs'].createSession(data, textures, {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2});
    for (let index = 0; index < 150; index++) session.step();
    const value = session.snapshot; session.dispose(); return value;
  }, bundle);
  assertRoster(browserState);
  const movedCars = browserState.cars.map((car, index) => ({index, vehicleType: car.vehicleType,
    moved: car.position.some((value, axis) => value !== ready.practice.cars[index].position[axis]),
    initialPosition: ready.practice.cars[index].position, position: car.position}));
  assert.ok(movedCars.every(car => car.moved), 'All six AI cars must move during the 150-tick session.');
  archive = await RollcageArchive.open(installation);
  const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31), session = createSession(data, textures, {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2});
  for (let index = 0; index < 150; index++) session.step();
  assert.deepEqual(browserState, JSON.parse(JSON.stringify(session.snapshot))); session.dispose();
  await page.selectOption('#track', String(getGame('rollcage').tracks.find(track => track.name === 'LOW/LEV16.BLP').index));
  await page.waitForFunction(() => window.rollcageViewer.inspect().track === 'LOW/LEV16.BLP' && !window.rollcageViewer.inspect().loading);
  for (const id of ['practice-start', 'practice-reset', 'practice-follow', 'practice-step', 'practice-recover', 'practice-telemetry', 'practice-car', 'camera-follow']) {
    assert.equal(await page.locator(`#${id}`).isDisabled(), true, `${id} must be disabled on LEV16`);
  }
  assert.equal(await page.locator('#physics-hud').isVisible(), false);
  assert.equal((await inspect()).practice, null);
  assert.equal((await inspect()).worldBuffers, 0);
  const excluded = await inspect();
  assert.equal(excluded.followedCarIndex, 0); assert.equal(excluded.presentation, null);
  assert.equal(excluded.carInstances, 0); assert.equal(excluded.renderedCars, 0); assert.equal(excluded.carBuffers, 0);
  assert.deepEqual(excluded.carMeshCounts, []); assert.equal(excluded.carDraws.cars, 0); assert.equal(excluded.carDraws.groups, 0);
  assert.equal(await page.evaluate(() => document.getElementById('canvas').getContext('webgl').getError()), 0);
  assert.deepEqual(errors, []); assert.deepEqual(network, []); assert.equal(SOLO_STEP_SECONDS, 1 / 30);
  const report = {method: 'Actual Edge six-car roster rendering, distinct starting grid, startup/pause/single-step/selected-car recovery/reset, car selection with immutable paused physics, selected-car HUD, 60 real RAF samples of interpolated follow poses and matching camera targets, visibility-only telemetry toggle, native moving-object mesh rendering/object toggle/track-change cleanup, all-six-car movement and 150-tick browser/Node equality including per-car physics telemetry and scripted poses, explicit experimental notice and LEV16 exclusion; no original-process trajectory equivalence.',
    ticksPerSecond: 30, browserState, controls: {start: true, pause: true, stepReady: true, stepPaused: true, recovery: true, selectedRecovery: true, pausedSelection: true, runningSelection: true, continueAfterRecovery: true, telemetry: true, reset: true, resetKeepsSelection: true, trackChangeResetsSelection: true, excludedTrack: true},
    uiSnapshots: {ready: ready.practice, paused: paused.practice, stepped: stepped.practice, recovered: recovered.practice, continued: continued.practice, selectedRecovery: selectedRecovery.practice, displayed: displayed.practice, reset: reset.practice},
    selection: {paused: selections, recoveryCarIndex, resetCarIndex: reset.followedCarIndex}, cameraMenuChecks,
    followPresentation: {frames: followFrames.length, trace: 'racing-test-follow-frames.json', intermediatePairs},
    roster: {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2, renderedCars: continued.carDraws.cars, carMeshCounts: continued.carMeshCounts, movedCars},
    screenshots: ['racing-test-six-car-grid.png', 'racing-test.png', 'racing-test-physics-hud.png', 'racing-test-mobile.png'], narrowLayout, webglErrors: 0, errors, network,
    limits: 'This startup smoke check does not assess completed laps or original-process trajectory equivalence; the separate long-run checker retains those reconstruction checks.'};
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({matched: true, browserTicks: browserState.ticks, output}));
} finally {await archive?.close(); await browser.close();}
