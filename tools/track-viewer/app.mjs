import { FileArchive } from './file-archive.mjs';
import { identifyGame } from '../../src/track-games.mjs';
import { Navigation } from './navigation.mjs';
import { Renderer } from './renderer.mjs';
import { buildTrackDownload } from './export-track.mjs';

const element = id => document.getElementById(id);
const canvas = element('canvas'), navigation = new Navigation(), keys = new Set();
let renderer, archive, game, scene, selectedTrack, availableTracks = [], verified = false, generation = 0, drag = null, lastFrame = 0, contextLost = false, exporting = false;
const errorText = error => error instanceof Error ? error.message : String(error);
const status = message => { element('status').textContent = message; };
const fail = error => { element('error').textContent = errorText(error); status('Unable to load. Choose another track or select the archive files again.'); };
function clearInput() { keys.clear(); drag = null; }
function releaseMouse() { if (document.pointerLockElement === canvas) document.exitPointerLock(); clearInput(); }
function help() {
  const fly = navigation.mode === 'fly';
  element('help').textContent = fly
    ? 'Click the view for mouse-look · WASD move · Q/E down/up · Shift faster · Wheel changes speed · Esc releases mouse. If capture is unavailable, drag to look.'
    : 'Left-drag rotates · Right-drag or Shift-drag pans · Wheel zooms · Arrow keys rotate · WASD pans · +/− zoom · Shift faster. Click the view to use keys.';
  element('mode').value = navigation.mode;
  element('speed').hidden = !fly;
}
function clearScene() {
  scene = null; selectedTrack = null; renderer?.clear();
  element('download').disabled = true;
  element('counts').textContent = ''; element('sector').replaceChildren(new Option('All terrain sectors', '-1'));
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
    element('download').disabled = exporting;
    navigation.reset(scene.bounds); help();
    for (let i = 0; i < scene.segments; i++) element('sector').append(new Option(`Sector ${i}`, String(i)));
    element('counts').textContent = `${scene.segments} sectors · ${scene.instances} objects · ${scene.triangles.toLocaleString()} triangles · ${scene.textures.size} texture pages`;
    status(`${track.label} ready.`);
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
  const token = ++generation;
  archive = null; game = null; availableTracks = []; verified = false;
  releaseMouse(); clearScene(); element('track').replaceChildren(); element('track').disabled = true;
  element('game-info').textContent = '';
  element('error').textContent = ''; element('stage').setAttribute('aria-busy', 'false');
  const image = element('image').files[0], index = element('index').files[0];
  if (!image || !index) { status('Select both Rollcage.img and Rollcage.idx to begin.'); return; }
  status('Reading archive index…');
  try {
    const opened = await FileArchive.open(image, index);
    if (token !== generation) return;
    const identified = await identifyGame(opened, element('game').value);
    if (token !== generation) return;
    archive = opened; game = identified.game; availableTracks = identified.tracks; verified = identified.verified;
    element('game-info').textContent = `${game.label} · ${availableTracks.length} environments${verified ? '' : ' · Unverified release; format compatibility is not established.'}`;
    for (const track of availableTracks) element('track').append(new Option(track.label, String(track.index)));
    element('track').disabled = false;
    await loadTrack();
  } catch (error) { if (token === generation) fail(error); }
}
element('image').addEventListener('change', openFiles);
element('index').addEventListener('change', openFiles);
element('game').addEventListener('change', openFiles);
element('track').addEventListener('change', loadTrack);
element('reload').addEventListener('click', () => archive ? loadTrack() : openFiles());
element('download').addEventListener('click', downloadTrack);
element('mode').addEventListener('change', () => { releaseMouse(); navigation.setMode(element('mode').value); help(); });
element('reset').addEventListener('click', () => {
  releaseMouse(); if (scene) navigation.reset(scene.bounds); element('sector').value = '-1'; help();
});
element('filter').addEventListener('change', () => renderer?.setFilters(element('filter').checked));
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
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
  if (!scene) return;
  if (document.pointerLockElement === canvas) { navigation.look(event.movementX, event.movementY); return; }
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (navigation.mode === 'orbit' && drag.pan) navigation.pan(dx, dy, canvas.clientHeight);
  else navigation.look(dx, dy);
  drag.x = event.clientX; drag.y = event.clientY;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', clearInput);
canvas.addEventListener('lostpointercapture', () => { drag = null; });
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
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseMouse(); });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); ++generation; releaseMouse(); clearScene(); contextLost = true;
  element('stage').setAttribute('aria-busy', 'false');
  for (const id of ['image', 'index', 'game', 'track', 'reload']) element(id).disabled = true;
  status('Reload this page to restore rendering.');
  element('error').textContent = 'The graphics context was lost. Reload this page to restore the viewer.';
});
function frame(time) {
  if (contextLost) return;
  if (scene) navigation.step(keys, (time - lastFrame) / 1000);
  lastFrame = time;
  renderer.render(navigation, {
    textures: element('textures').checked, lighting: element('lighting').checked,
    objects: element('objects').checked, sector: Number(element('sector').value)
  });
  if (navigation.mode === 'fly') element('speed').textContent = `Speed: ${Math.round(navigation.speed).toLocaleString()} units/s`;
  requestAnimationFrame(frame);
}
// Read-only diagnostics for browser checks; no game data is embedded in the page.
window.rollcageViewer = { inspect: () => ({
  game: game?.id ?? null, verified,
  track: selectedTrack?.name ?? null, segments: scene?.segments ?? 0, instances: scene?.instances ?? 0,
  triangles: scene?.triangles ?? 0, textures: scene?.textures.size ?? 0, groups: renderer?.groups.length ?? 0,
  mode: navigation.mode, eye: navigation.position(), target: [...navigation.target],
  yaw: navigation.yaw, pitch: navigation.pitch, distance: navigation.distance, speed: navigation.speed,
  heldKeys: keys.size, loading: element('stage').getAttribute('aria-busy') === 'true'
}) };
help();
try { renderer = new Renderer(canvas); requestAnimationFrame(frame); }
catch (error) {
  element('error').textContent = errorText(error); status('Rendering is unavailable.');
  for (const id of ['image', 'index', 'game', 'track', 'reload']) element(id).disabled = true;
}
