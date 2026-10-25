import {Workspaces} from './workspaces.mjs';
import { FileArchive } from './file-archive.mjs';
import { identifyGame } from '../../src/track-games.mjs';
import { FirebugsArchive } from '../../src/firebugs-archive.mjs';
import { openFirebugsDisc } from '../../src/ps1-disc.mjs';
import { Navigation } from './navigation.mjs';
import { Renderer } from './renderer.mjs';
import { buildTrackDownload } from './export-track.mjs';
import { pathColor } from './path-color.mjs';
import { createSession } from '../../src/solo-session.mjs';
import { SoloController } from './solo-controller.mjs';
import { formatPracticeTime } from './solo-presentation.mjs';
import { pickupLabel } from './pickup-label.mjs';
import { TrackEditor } from './track-editor-ui.mjs';

const element = id => document.getElementById(id);
const setText = (id, text) => {const output = element(id); if (output.textContent !== text) output.textContent = text;};
const setDisabled = (id, disabled) => {const output = element(id); if (output.disabled !== disabled) output.disabled = disabled;};
const setHidden = (id, hidden) => {const output = element(id); if (output.hidden !== hidden) output.hidden = hidden;};
const canvas = element('canvas'), navigation = new Navigation(), keys = new Set();
let renderer, editor, archive, game, scene, selectedTrack, availableTracks = [], verified = false, generation = 0, drag = null, lastFrame = 0, contextLost = false, exporting = false, practiceDirty = false;
let sourceKind = 'pc';
let workspaces;
let practice = null, practiceInputs = null, renderedPractice = null, renderedAlpha = 1, followedCarIndex = 0;
const focusedCar = value => value?.cars?.[followedCarIndex] ?? value;
const errorText = error => error instanceof Error ? error.message : String(error);
const status = message => { element('status').textContent = message; };
const fail = error => { element('error').textContent = errorText(error); status('Unable to load. Choose another track or select the archive files again.'); };
function clearInput() { keys.clear(); drag = null; }
function releaseMouse() { if (document.pointerLockElement === canvas) document.exitPointerLock(); editor?.cancelDrag(); clearInput(); }
function help() {
  const fly = navigation.mode === 'fly';
  setText('help', navigation.mode === 'follow' ? `Following car ${followedCarIndex + 1}. Choose Orbit & pan or Fly-in to explore while the cars race.` : fly
    ? 'Click the view for mouse-look · WASD move · Q/E down/up · Shift faster · Wheel changes speed · Esc releases mouse. If capture is unavailable, drag to look.'
    : 'Left-drag rotates · Right-drag or Shift-drag pans · Wheel zooms · Arrow keys rotate · WASD pans · +/− zoom · Shift faster. Click the view to use keys.');
  if (element('mode').value !== navigation.mode) element('mode').value = navigation.mode;
  setHidden('speed', !fly);
}
function clearScene() {
  editor?.clearTrack(); practiceDirty = false;
  practice?.dispose(); practice = null;
  practiceInputs = null;
  renderedPractice = null;
  renderedAlpha = 1; followedCarIndex = 0;
  scene = null; selectedTrack = null; renderer?.clear();
  element('download').disabled = true;
  element('scene-scope').textContent = '';
  element('counts').textContent = ''; element('sector').replaceChildren(new Option('All terrain sectors', '-1'));
  element('path-group').replaceChildren(new Option('All groups', '-1'));
  updatePaths();
  updatePractice();
}
function updatePractice() {
  const editing = Boolean(editor?.active), available = Boolean(practice), running = practice?.state === 'running', usable = available && !['error', 'disposed'].includes(practice.state);
  const interactive = usable && !editing;
  const value = available ? practice.snapshot : null, car = focusedCar(value), physics = car?.physics;
  const carCount = value?.cars?.length ?? (value ? 1 : 0);
  const selector = element('practice-car');
  if (selector.options.length !== carCount) selector.replaceChildren(...Array.from({length: carCount}, (_, index) => new Option(`Car ${index + 1}`, String(index))));
  if (selector.value !== String(followedCarIndex)) selector.value = String(followedCarIndex);
  setDisabled('practice-car', !interactive);
  setDisabled('practice-ai-count', !practiceInputs || editing);
  setText('practice-ai-count-value', element('practice-ai-count').value);
  setText('practice-follow-label', `Follow car ${followedCarIndex + 1}`);
  setText('camera-follow', `Follow car ${followedCarIndex + 1}`);
  const difficulty = ['Easy', 'Hard', 'Expert'][value?.aiDifficulty];
  setDisabled('practice-start', !interactive);
  setDisabled('practice-step', !interactive || !['ready', 'paused'].includes(practice.state));
  setDisabled('practice-recover', !interactive || Boolean(physics?.recoveryPending));
  setDisabled('practice-reset', editing || (!usable && !value?.weapons?.enabled));
  setDisabled('practice-weapons', !available || editing);
  setDisabled('practice-follow', !interactive);
  setDisabled('practice-telemetry', !usable);
  setDisabled('camera-follow', !interactive);
  setText('practice-start', running ? 'Pause' : practice?.state === 'paused' ? 'Resume' : 'Start');
  const excluded = game?.id === 'rollcage' && /\/(?:LEV16|LEV17)\.BLP$/.test(selectedTrack?.name ?? '');
  setText('practice-note', editing ? 'Editing track · Test changes restarts the race with your edits.' : practice?.state === 'error' ? 'Racing test stopped. Load this track again to restart.' : available ? `Continuous racing test · ${practice.state}. Step while paused, or test a recovery.` : excluded ? 'Racing test is disabled on LEV16 and LEV17.' : 'Available on verified Rollcage tracks, except LEV16 and LEV17.');
  const message = practice?.message ?? '';
  if (element('practice-error').textContent !== message) element('practice-error').textContent = message;
  setText('practice-readout', car ? `${car.speed} km/h · ${car.laps} laps completed · Lap ${formatPracticeTime(car.lapTime)} · Best ${formatPracticeTime(car.bestLap)}` : '');
  setText('practice-roster', value ? `${carCount} AI ${carCount === 1 ? 'car' : 'cars'}${difficulty ? ` · ${difficulty}` : ''} · Car ${followedCarIndex + 1} telemetry, follow and recovery.` : '');
  const weaponsEnabled = Boolean(value?.weapons?.enabled);
  setText('practice-inventory', weaponsEnabled ? `Car ${followedCarIndex + 1} · Slot 1: ${pickupLabel(car.inventory[0])} · Slot 2: ${pickupLabel(car.inventory[1])} · Pickups ${value.weapons.pickups.filter(row => row.visible).length}/${value.weapons.authoredPickupCount} · Projectiles ${value.weapons.projectiles.filter(row => row.visible).length}` : available ? 'Weapons disabled.' : '');
  setHidden('physics-inventory', !weaponsEnabled);
  for (let index = 0; index < 2; index++) setText(`physics-pickup-${index}`, weaponsEnabled ? pickupLabel(car.inventory[index]) : '—');
  setText('physics-car-label', value ? `Car ${followedCarIndex + 1} of ${carCount}${difficulty ? ` · ${difficulty}` : ''}` : '');
  const rank = car?.racePosition;
  const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';
  setText('physics-race-position', Number.isInteger(rank) && rank >= 1 && rank <= carCount ? `${rank}${suffix} / ${carCount}` : '—');
  //Repeated hidden writes still mutate the DOM and can refresh an open native
  //select popup in Chromium, even when the overlay is already hidden.
  setHidden('physics-hud', editing || !available || !element('practice-telemetry').checked);
  const metric = value => Number.isFinite(value) ? Math.trunc(value).toLocaleString() : '—';
  for (const [id, amount] of [['physics-speed', car?.speed], ['physics-tick', value?.ticks], ['physics-recoveries', car?.recoveries], ['physics-collisions', physics?.collisionEvents], ['physics-terrain-hits', physics?.terrainHits], ['physics-model-hits', physics?.modelHits]]) {
    const output = element(id), text = metric(amount);
    if (output.textContent !== text) output.textContent = text;
  }
  for (let index = 0; index < 4; index++) {
    const output = element(`physics-wheel-${index}`), contact = physics?.wheelContacts?.[index], text = contact === true ? 'Contact' : contact === false ? 'Air' : '—';
    if (output.textContent !== text) output.textContent = text;
    const flag = typeof contact === 'boolean' ? String(contact) : '';
    if (output.dataset.contact !== flag) output.dataset.contact = flag;
  }
  setText('physics-recovery-state', physics?.recoveryPending ? 'Recovery requested · awaiting the next frame' : practice?.state === 'error' ? 'Stopped · latest completed physics frame' : available ? `${running ? 'Running' : practice.state === 'paused' ? 'Paused' : 'Ready'} · hits from the latest world frame` : 'Latest physics frame');
}
function followCar(reset = false, seconds = 0, presentation = practice?.renderSnapshot) {
  if (practice && element('practice-follow').checked) {
    const previousMode = navigation.mode;
    navigation.follow(focusedCar(presentation), seconds, reset);
    if (reset || previousMode !== navigation.mode) help();
  }
}
function updatePaths() {
  const paths = scene?.paths, available = paths?.status === 'available';
  for (const id of ['paths', 'path-points', 'path-through', 'path-group']) element(id).disabled = !available;
  element('path-note').textContent = practice && available ? 'Segments show consecutive authored points. The AI cars select their routes independently.' : paths?.message ?? 'Load a track to inspect stored paths.';
  const index = Number(element('path-group').value);
  const groups = (paths?.groups ?? []).filter(group => index === -1 || group.index === index);
  const points = groups.reduce((sum, group) => sum + group.positions.length, 0);
  const segments = groups.reduce((sum, group) => sum + Math.max(0, group.positions.length - 1), 0);
  const count = (value, noun) => `${value.toLocaleString()} ${noun}${value === 1 ? '' : 's'}`;
  element('path-counts').textContent = available
    ? `${index === -1 ? `${count(groups.length, 'group')} · ` : `Group ${index} · `}${count(points, 'point')} · ${count(segments, 'segment')}`
    : '';
  element('path-color').hidden = index === -1 || !available;
  if (index !== -1 && available) element('path-color').style.color = pathColor(index);
}
function refreshEditorScene() {
  if (!editor?.current?.modelDraft || !selectedTrack || game?.id !== 'rollcage') return;
  const base = editor.current, quality = selectedTrack.name.startsWith('HIGH/') ? 'HIGH' : 'LOW';
  const resources = editor.resourcesFor(selectedTrack,base[quality].geometry,base[quality].texture);
  const decoded = editor.decodeScene(resources.geometry,resources.texture);
  decoded.editorScripted=Boolean(editor.modelsEditing);renderer.setScene(decoded); scene = decoded; editor.scene = decoded;
  if(practice&&!practiceDirty)renderer.setCar(practice.session.assets);
  editor.modelPicks.clear(); editor.refresh();
  setText('counts', `${scene.segments} sectors · ${scene.instances} objects · ${scene.triangles.toLocaleString()} triangles · ${scene.textures.size} texture pages`);
}
function restartPractice() {
  if (!practiceInputs) return;
  practice?.dispose(); practice = null; renderedPractice = null; renderedAlpha = 1; lastFrame = 0;
  let failure;
  try {
    const count = Number(element('practice-ai-count').value);
    const resources = editor?.resourcesFor(selectedTrack,practiceInputs.geometry,practiceInputs.texture) ?? practiceInputs;
    const session = createSession(resources.geometry, resources.texture, {vehicleTypes: Array.from({length: count}, (_, index) => index), aiDifficulty: 2, weaponsEnabled: element('practice-weapons').checked});
    try {renderer.setCar(session.assets);} catch (error) {session.dispose(); throw error;}
    practice = new SoloController(session);
    practiceDirty = false;
    followedCarIndex = Math.min(followedCarIndex, count - 1);
    if (navigation.mode === 'follow') followCar(true);
  } catch (error) {
    renderer.clearCar();
    failure = `Racing test unavailable: ${errorText(error)}`;
  }
  updatePractice(); updatePaths(); help();
  if (failure) element('practice-error').textContent = failure;
}
async function loadTrack() {
  const token = ++generation, source = archive, adapter = game, track = availableTracks.find(track => track.index === Number(element('track').value));
  if (!source || !track || !adapter) return;
  releaseMouse(); clearScene(); element('error').textContent = '';
  status(`Loading ${track.label}…`); element('stage').setAttribute('aria-busy', 'true');
  try {
    // Yield before decoding so loading status is painted even for cached files.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (token !== generation) return;
    const decoded = await adapter.loadTrack(source, track);
    if (token !== generation) return;
    renderer.setScene(decoded); scene = decoded; selectedTrack = track;
    await editor?.setTrack(track,decoded);
    if(token!==generation)return;
    refreshEditorScene();
    if(workspaces?.value==='editor')element('editor-tool').dispatchEvent(new Event('change'));
    updatePractice();
    for (const group of scene.paths.groups) element('path-group').append(new Option(`Group ${group.index} (${group.positions.length} ${group.positions.length === 1 ? 'point' : 'points'})`, String(group.index)));
    updatePaths();
    element('download').disabled = exporting;
    navigation.reset(scene.bounds); help();
    for (let i = 0; i < scene.segments; i++) element('sector').append(new Option(`Sector ${i}`, String(i)));
    element('counts').textContent = `${scene.segments} sectors · ${scene.instances} objects · ${scene.triangles.toLocaleString()} triangles · ${scene.textures.size} texture pages`;
    element('scene-scope').textContent = scene.source?.scope ?? '';
    status(`${track.label} ready.`);
    if (verified && adapter.id === 'rollcage' && !/\/(?:LEV16|LEV17)\.BLP$/.test(track.name)) {
      try {
        const geometry = await source.readResource(track.index);
        const texture = await source.readResource(track.textureIndex);
        if (token !== generation) return;
        practiceInputs = {geometry: geometry.data, texture: texture.data};
        restartPractice();
      } catch (error) {
        if (token === generation) element('practice-error').textContent = `Racing test unavailable: ${errorText(error)}`;
      }
      if (token === generation && practice) {updatePractice(); updatePaths();}
    }
  } catch (error) { if (token === generation) { clearScene(); fail(error); } }
  finally { if (token === generation) element('stage').setAttribute('aria-busy', 'false'); }
}

async function downloadTrack() {
  if (!scene || !selectedTrack || exporting) return;
  const token = generation, source = scene, track = selectedTrack;
  releaseMouse(); exporting = true; element('download').disabled = true; element('error').textContent = '';
  status(`Preparing ${track.label} download…`);
  try {
    const download = await buildTrackDownload(source, track);
    if (token !== generation) return;
    const url = URL.createObjectURL(download.blob), link = document.createElement('a');
    link.href = url; link.download = download.filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status(`Download started: ${download.filename}. Unzip it and import scene.obj into Blender.`);
  } catch (error) {
    if (token === generation) { element('error').textContent = errorText(error); status('Download failed. Try again.'); }
  } finally { exporting = false; element('download').disabled = !scene; }
}
async function openFiles() {
  if(editor?.busy)return;
  if(editor?.hasUnsavedChanges&&!window.confirm('Discard unsaved track project changes and open another archive?'))return;
  const token = ++generation;
  await editor?.setSource(null,null,false);
  archive = null; game = null; availableTracks = []; verified = false;
  releaseMouse(); clearScene(); element('track').replaceChildren(); element('track').disabled = true;
  element('game-info').textContent = ''; element('editor-source-note').textContent = '';
  element('error').textContent = ''; element('stage').setAttribute('aria-busy', 'false');
  const requested = element('game').value;
  const useDisc = requested === 'firebugs' || (requested === 'auto' && sourceKind === 'disc');
  element('pc-files').hidden = requested === 'firebugs';
  element('disc-files').hidden = requested !== 'auto' && requested !== 'firebugs';
  const image = element('image').files[0], index = element('index').files[0], zip = element('disc').files[0];
  if (useDisc ? !zip : !image || !index) {
    status(useDisc ? 'Select a Firebugs disc ZIP containing its CUE and data BIN.' : 'Select both Rollcage.img and Rollcage.idx, or a Firebugs disc ZIP.');
    return;
  }
  status(useDisc ? 'Reading Firebugs disc ZIP…' : 'Reading archive index…');
  try {
    let opened;
    if (useDisc) {
      const disc = await openFirebugsDisc({ size: zip.size,
        read: async (offset, length) => new Uint8Array(await zip.slice(offset, offset + length).arrayBuffer()) },
        { onProgress: phase => { if (token === generation) status(`${phase}…`); } });
      if (token !== generation) return;
      status('Reading Firebugs archive index…');
      opened = await FirebugsArchive.open(disc);
    } else opened = await FileArchive.open(image, index);
    if (token !== generation) return;
    const identified = await identifyGame(opened, requested);
    if (token !== generation) return;
    archive = opened; game = identified.game; availableTracks = identified.tracks; verified = identified.verified;
    await editor?.setSource(archive,game,verified);
    if(token!==generation)return;
    element('game-info').textContent = `${game.label} · ${availableTracks.length} environments${identified.modified ? ' · Recognized edited archive.' : verified ? '' : ' · Unverified release; format compatibility is not established.'}`;
    element('editor-source-note').textContent = game.id!=='rollcage' ? '' : identified.modified
      ? 'These game files already contain edits. Racing and editing are available. A saved project requires the exact starting IMG/IDX pair it was created with.'
      : verified ? 'To continue an earlier edit, load its project below after selecting its matching starting IMG/IDX pair.'
      : 'This archive supports viewing only. Racing and editing require supported original files or a recognized editor export. To continue a saved project, select its matching starting files.';
    for (const track of availableTracks) element('track').append(new Option(track.label, String(track.index)));
    element('track').disabled = false;
    element('source-files').open=false;
    await loadTrack();
  } catch (error) { if (token === generation) fail(error); }
}
element('image').addEventListener('change', () => { sourceKind = 'pc'; openFiles(); });
element('index').addEventListener('change', () => { sourceKind = 'pc'; openFiles(); });
element('disc').addEventListener('change', () => { sourceKind = 'disc'; openFiles(); });
element('game').addEventListener('change', () => {
  const requested = element('game').value;
  if (requested !== 'auto') sourceKind = requested === 'firebugs' ? 'disc' : 'pc';
  openFiles();
});
element('track').addEventListener('change', loadTrack);
element('reload').addEventListener('click', () => archive ? loadTrack() : openFiles());
element('download').addEventListener('click', downloadTrack);
element('mode').addEventListener('change', () => {
  if(editor?.active&&element('mode').value==='follow'){element('mode').value=navigation.mode;return;}
  releaseMouse(); navigation.setMode(element('mode').value);
  element('practice-follow').checked = navigation.mode === 'follow';
  if (navigation.mode === 'follow') followCar(true);
  help();
});
element('practice-start').addEventListener('click', () => {
  if(practiceDirty)restartPractice();
  if (!practice || ['error', 'disposed'].includes(practice.state)) return;
  releaseMouse();
  if (practice.state === 'running') practice.pause();
  else {practice.start(); lastFrame = 0; followCar(true);}
  updatePractice();
});
element('practice-reset').addEventListener('click', () => {
  if(practiceDirty){restartPractice();return;}
  if (!practice || practice.state === 'disposed' || practice.state === 'error' && !practice.snapshot.weapons?.enabled) return;
  practice.reset(); followCar(true); updatePractice();
});
element('practice-weapons').addEventListener('change', () => {
  releaseMouse(); practice?.pause(); loadTrack();
});
element('practice-ai-count').addEventListener('input', () => {
  setText('practice-ai-count-value', element('practice-ai-count').value);
});
element('practice-ai-count').addEventListener('change', () => {
  releaseMouse(); restartPractice();
});
element('practice-step').addEventListener('click', () => {
  if(practiceDirty)restartPractice();
  if (!practice || !['ready', 'paused'].includes(practice.state)) return;
  releaseMouse(); practice.stepFrame(); lastFrame = 0; followCar(true); updatePractice();
});
element('practice-recover').addEventListener('click', () => {
  if (!practice || ['error', 'disposed'].includes(practice.state) || focusedCar(practice.snapshot).physics?.recoveryPending) return;
  releaseMouse(); practice.requestRecovery(followedCarIndex); lastFrame = 0; followCar(true); updatePractice();
});
element('practice-car').addEventListener('change', () => {
  if (!practice || ['error', 'disposed'].includes(practice.state)) return;
  const index = Number(element('practice-car').value);
  if (!Number.isInteger(index) || index < 0 || index >= practice.snapshot.cars.length) return;
  releaseMouse(); followedCarIndex = index; followCar(true); updatePractice(); help();
});
element('practice-telemetry').addEventListener('change', updatePractice);
element('practice-follow').addEventListener('change', () => {
  releaseMouse();
  if (element('practice-follow').checked) followCar(true);
  else navigation.setMode('orbit');
  help();
});
element('reset').addEventListener('click', () => {
  releaseMouse(); if (scene) navigation.reset(scene.bounds); element('sector').value = '-1'; element('practice-follow').checked = false; help();
});
element('filter').addEventListener('change', () => renderer?.setFilters(element('filter').checked));
element('path-group').addEventListener('change', updatePaths);
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if(editor?.pointerDown(event))return;
  if (!scene || (event.button !== 0 && event.button !== 2)) return;
  canvas.focus();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey };
  canvas.setPointerCapture(event.pointerId);
  if (navigation.mode === 'fly' && event.button === 0 && document.pointerLockElement !== canvas) {
    try {
      const request = canvas.requestPointerLock?.();
      request?.catch(() => { status('Mouse capture unavailable. Drag in the view to look around.'); });
    } catch { status('Mouse capture unavailable. Drag in the view to look around.'); }
  }
});
canvas.addEventListener('pointermove', event => {
  if(editor?.pointerMove(event))return;
  if (!scene) return;
  if (document.pointerLockElement === canvas) { navigation.look(event.movementX, event.movementY); return; }
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (navigation.mode === 'orbit' && drag.pan) navigation.pan(dx, dy, canvas.clientHeight);
  else navigation.look(dx, dy);
  drag.x = event.clientX; drag.y = event.clientY;
});
canvas.addEventListener('pointerup', () => {editor?.pointerUp();drag = null;});
canvas.addEventListener('pointercancel', () => {editor?.cancelDrag();clearInput();});
canvas.addEventListener('lostpointercapture', () => {editor?.cancelDrag();drag = null;});
document.addEventListener('pointerlockchange', clearInput);
document.addEventListener('pointerlockerror', () => status('Mouse capture unavailable. Drag in the view to look around.'));
canvas.addEventListener('wheel', event => {
  if (!scene) return;
  event.preventDefault();
  navigation.wheel(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1));
}, { passive: false });
const navigationKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', event => {
  if (event.code === 'Escape') { releaseMouse(); return; }
  if (!scene || document.activeElement !== canvas || event.ctrlKey || event.metaKey || event.altKey || !navigationKeys.has(event.code)) return;
  event.preventDefault(); keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', releaseMouse);
canvas.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { releaseMouse(); practice?.pause(); updatePractice(); }
  lastFrame = 0;
});
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); ++generation; releaseMouse(); clearScene(); contextLost = true;
  element('stage').setAttribute('aria-busy', 'false');
  for (const id of ['image', 'index', 'disc', 'game', 'track', 'reload']) element(id).disabled = true;
  status('Reload this page to restore rendering.');
  element('error').textContent = 'The graphics context was lost. Reload this page to restore the viewer.';
});
function frame(time) {
  if (contextLost) return;
  const seconds = lastFrame ? Math.max(0, (time - lastFrame) / 1000) : 0;
  if (!document.hidden && !editor?.active) practice?.advance(seconds);
  renderedPractice = practice?.renderSnapshot ?? null;
  renderedAlpha = practice?.renderAlpha ?? 1;
  if (scene) {
    if (navigation.mode === 'follow'&&!editor?.active) followCar(false, seconds, renderedPractice);
    else navigation.step(keys, seconds);
  }
  lastFrame = time;
  renderer.render(navigation, {
    textures: element('textures').checked, lighting: element('lighting').checked,
    objects: element('objects').checked, sector: Number(element('sector').value),
    paths: element('paths').checked, pathPoints: element('path-points').checked,
    pathThrough: element('path-through').checked, pathGroup: Number(element('path-group').value), car: editor?.active?null:renderedPractice
  });
  editor?.terrain?.render(navigation);editor?.layout?.render(navigation);editor?.renderEditorOverlay(navigation);
  if (practice) updatePractice();
  if (navigation.mode === 'fly') setText('speed', `Speed: ${Math.round(navigation.speed).toLocaleString()} units/s`);
  requestAnimationFrame(frame);
}
// Read-only diagnostics for browser checks; no game data is embedded in the page.
window.rollcageViewer = { inspect: () => ({
  game: game?.id ?? null, verified, workspace:workspaces?.value??'explore',
  track: selectedTrack?.name ?? null, segments: scene?.segments ?? 0, instances: scene?.instances ?? 0,
  triangles: scene?.triangles ?? 0, textures: scene?.textures.size ?? 0, groups: renderer?.groups.length ?? 0,
  paths: scene?.paths ?? null, pathBuffers: renderer?.pathGroups.length ?? 0, pathDraws: renderer?.pathDraws ?? null,
  practice: practice ? {state: practice.state, ...practice.snapshot} : null, carBuffers: renderer?.carGroups.length ?? 0,
  followedCarIndex,
  editor: editor?.inspect() ?? null,
  presentation: renderedPractice ? {ticks: renderedPractice.ticks, alpha: renderedAlpha, carIndex: followedCarIndex,
    position: [...focusedCar(renderedPractice).position], rotation: [...focusedCar(renderedPractice).rotation]} : null,
  carInstances: renderer?.carInstances.length ?? 0, renderedCars: renderer?.carDraws.cars ?? 0,
  carMeshCounts: renderer?.carInstances.map(car => car.groups.length) ?? [], carDraws: renderer ? {...renderer.carDraws} : {cars: 0, groups: 0},
  worldBuffers: renderer?.worldGroups.length ?? 0, worldDraws: renderer ? {...renderer.worldDraws} : null,
  weaponBuffers: renderer?.weaponGroups.length ?? 0, weaponDraws: renderer ? {...renderer.weaponDraws} : null,
  terrainBuffers: renderer?.terrainGroups.size ?? 0, terrainDraws: renderer ? {...renderer.terrainDraws} : null,
  mode: navigation.mode, eye: navigation.position(), target: [...navigation.target],
  yaw: navigation.yaw, pitch: navigation.pitch, distance: navigation.distance, speed: navigation.speed,
  heldKeys: keys.size, loading: element('stage').getAttribute('aria-busy') === 'true'
}) };
help();
function downloadEditorFile({filename,blob}) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
try {
  renderer = new Renderer(canvas);
  editor = new TrackEditor({canvas,navigation,renderer,releaseMouse, onDownload:downloadEditorFile,
    onModeChange(editing,{testing=false}={}){practice?.pause();if(editor&&scene&&Boolean(scene.editorScripted)!==Boolean(editor.modelsEditing)){refreshEditorScene();}if(!editing&&practiceDirty&&!testing)restartPractice();if(editing)element('practice-follow').checked=false;help();updatePractice();},
    onChange(){practice?.pause();practiceDirty=true;refreshEditorScene();updatePractice();},
    onTest(){if(!practiceInputs){refreshEditorScene();editor.say('Preview updated. AI Racing test is not verified for this level.');return;}workspaces.select('racing');element('practice-weapons').checked=true;restartPractice();practice?.start();lastFrame=0;updatePractice();editor.say(practice?'Testing edited track. Weapons are enabled; the race has restarted.':'Racing test could not start. See the Racing test error.');}
  });
  const chooseTool=()=>{
    const tool=element('editor-tool').value;
    for(const panel of document.querySelectorAll('[data-editor-tool]'))panel.hidden=panel.dataset.editorTool!==tool&&!(tool==='surfaces'&&panel.id==='terrain-panel')&&!(['routes','checkpoints','starts'].includes(tool)&&panel.id==='layout-panel');
    if(tool==='models')editor.setModelsEditing(true);else if(tool==='pickups')editor.setEditing(true);else if(['routes','checkpoints','starts'].includes(tool))editor.perform(()=>editor.setLayoutEditing(tool));else editor.perform(()=>editor.setTerrainEditing(tool));
  };
  workspaces=new Workspaces(value=>{
    releaseMouse();
    if(value==='editor'){practice?.pause();chooseTool();}
    else {editor.setEditing(false);editor.setModelsEditing(false);}
    help();updatePractice();
  });
  element('editor-tool').addEventListener('change',chooseTool);
  for(const panel of document.querySelectorAll('[data-editor-tool]'))panel.hidden=panel.dataset.editorTool!==element('editor-tool').value;
  requestAnimationFrame(frame);
}
catch (error) {
  element('error').textContent = errorText(error); status('Rendering is unavailable.');
  for (const id of ['image', 'index', 'disc', 'game', 'track', 'reload']) element(id).disabled = true;
}
