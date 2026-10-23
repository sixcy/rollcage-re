import {FileArchive} from '../track-viewer/file-archive.mjs';
import {identifyGame} from '../../src/track-games.mjs';
import {FirebugsArchive} from '../../src/firebugs-archive.mjs';
import {openFirebugsDisc} from '../../src/ps1-disc.mjs';
import {Navigation} from '../track-viewer/navigation.mjs';
import {Renderer} from '../track-viewer/renderer.mjs';
import {listObjectResources, loadObjectCollection} from '../../src/object-catalog.mjs';
import {buildObjectDownload} from './export-object.mjs';

const el = id => document.getElementById(id), canvas = el('canvas'), navigation = new Navigation(), keys = new Set();
let renderer, archive, game, resources = [], collection, scene, selectedEntry, verified = false;
let generation = 0, sourceKind = 'pc', drag, lastFrame = 0, exporting = false, contextLost = false;
const status = text => {el('status').textContent = text;};
const errorText = error => error instanceof Error ? error.message : String(error);
function labelFor(entry) {
  if (entry.kind === 'scenery') {
    const variants = collection.entries.filter(row => row.modelIndex === entry.modelIndex && row.kind === 'scenery');
    return `Scenery · Model ${entry.modelIndex}${variants.length > 1 ? ` · Texture variant ${variants.findIndex(row => row.id === entry.id) + 1}` : ''}`;
  }
  return entry.kind === 'unresolved' ? `Model ${entry.modelIndex}` : entry.label;
}
function empty(title, note) {el('empty-title').textContent = title; el('empty-note').textContent = note; el('empty').hidden = false;}
function clearInput() {keys.clear(); drag = null;}
function releaseMouse() {if (document.pointerLockElement === canvas) document.exitPointerLock(); clearInput();}
function busy(value) {el('stage').setAttribute('aria-busy', String(value));}
function clearModel() {
  releaseMouse(); scene = null; selectedEntry = null; renderer?.clear();
  el('download').disabled = true; el('fit').disabled = true; el('counts').textContent = ''; el('model-title').textContent = '';
  el('download').textContent = 'Download textured model (.zip)';
  empty(archive ? 'Choose a model.' : 'Your models, up close.', archive ? 'Browse or search the model library.' : 'Select your game files to begin.');
}
function showLimits(values = []) {
  el('limits').replaceChildren(...values.map(text => {const item = document.createElement('li'); item.textContent = text; return item;}));
}
function help() {
  el('model-mode').value = navigation.mode;
  el('help').textContent = navigation.mode === 'fly' ? 'Click for mouse-look · WASD move · Q/E down/up · Shift faster · Esc releases mouse' : 'Drag to orbit · Right-drag or Shift-drag to pan · Scroll to zoom';
}
async function loadModel() {
  const entry = collection?.entries.find(row => row.id === el('object').value), source = collection;
  const token = ++generation;
  clearModel(); el('error').textContent = ''; busy(false);
  if (!entry) {empty('No models match.', 'Try another search, or include unavailable models.'); status('No models match this filter.'); return;}
  selectedEntry = entry;
  if (entry.status === 'unsupported') {
    empty('Preview unavailable.', entry.reason ?? 'This model uses an unreconstructed material or object path.');
    status(entry.reason ?? 'This model uses an unreconstructed material or object path.');
    showLimits([entry.reason ?? 'Textured preview and export are unavailable for this model.', ...(source.limits ?? [])]);
    return;
  }
  empty('Loading model…', labelFor(entry)); status(`Loading ${labelFor(entry)}…`); busy(true);
  try {
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (token !== generation) return;
    const decoded = await source.load(entry);
    if (token !== generation) return;
    renderer.setScene(decoded); scene = decoded; selectedEntry = entry;
    navigation.reset(scene.bounds); help();
    el('counts').textContent = `${entry.kind === 'vehicle-assembled' ? `${scene.meshes.length} parts · ` : ''}${scene.vertices.toLocaleString()} vertices · ${scene.triangles.toLocaleString()} triangles · ${scene.textures.size} texture ${scene.textures.size === 1 ? 'page' : 'pages'}`;
    el('download').textContent = entry.kind === 'vehicle-assembled' ? 'Download complete car (.zip)' : 'Download textured model (.zip)';
    el('model-title').textContent = labelFor(entry); el('empty').hidden = true;
    el('fit').disabled = false; el('download').disabled = exporting;
    showLimits(scene.limits ?? source.limits ?? []);
    status(`${labelFor(entry)} ready.`);
  } catch (error) {if (token === generation) {clearModel(); el('error').textContent = errorText(error); status('This model could not be loaded. Choose another model.');}}
  finally {if (token === generation) busy(false);}
}
function filterModels() {
  const query = el('search').value.trim().toLowerCase(), previous = el('object').value;
  const all = collection?.entries ?? [], available = all.filter(row => row.status !== 'unsupported');
  const kind = el('kind').value;
  const matchesKind = row => kind === 'all' || kind === 'cars' && row.kind === 'vehicle-assembled' || kind === 'parts' && row.kind.startsWith('vehicle-') && row.kind !== 'vehicle-assembled' || kind === 'scenery' && row.kind === 'scenery';
  const rows = all.filter(row => matchesKind(row) && (el('show-unavailable').checked || row.status !== 'unsupported') && `${labelFor(row)} ${row.label} ${row.kind} ${row.modelIndex}`.toLowerCase().includes(query));
  el('object').replaceChildren(...rows.map(row => new Option(`${labelFor(row)}${row.status === 'unsupported' ? ' — unavailable' : ''}`, row.id)));
  if (rows.some(row => row.id === previous)) el('object').value = previous;
  else if (rows.length) el('object').selectedIndex = 0;
  el('object').disabled = !rows.length;
  el('library-counts').textContent = `${rows.length} shown · ${available.length} supported · ${all.length - available.length} unavailable`;
  if (el('object').value !== previous || !scene) loadModel();
}
async function loadResource() {
  const resource = resources.find(row => String(row.id) === el('resource').value), token = ++generation;
  collection = null; clearModel(); el('object').replaceChildren(); el('object').disabled = true;
  el('search').disabled = true; el('kind').disabled = true; el('show-unavailable').disabled = true; el('error').textContent = '';
  if (!resource || !archive) return;
  busy(true); status(`Reading ${resource.label}…`);
  try {
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const decoded = await loadObjectCollection(archive, game, resource);
    if (token !== generation) return;
    collection = decoded; el('search').value = ''; el('search').disabled = false; el('show-unavailable').disabled = false;
    const hasCars = collection.entries.some(row => row.kind === 'vehicle-assembled' && row.status === 'supported');
    el('kind').querySelector('option[value="cars"]').disabled = !hasCars;
    el('kind').querySelector('option[value="parts"]').disabled = !collection.entries.some(row => row.kind.startsWith('vehicle-') && row.kind !== 'vehicle-assembled');
    el('kind').value = hasCars ? 'cars' : 'all'; el('kind').disabled = false;
    showLimits(collection.limits ?? []); busy(false); filterModels();
  } catch (error) {if (token === generation) {busy(false); el('error').textContent = errorText(error); status('This library could not be loaded. Choose another one.');}}
}
async function openFiles() {
  const token = ++generation, requested = el('game').value;
  archive = null; game = null; resources = []; collection = null; verified = false;
  clearModel(); busy(false); el('error').textContent = ''; el('game-info').textContent = '';
  for (const id of ['resource', 'object']) {el(id).replaceChildren(); el(id).disabled = true;}
  el('search').disabled = true; el('kind').disabled = true; el('show-unavailable').disabled = true;
  el('library-counts').textContent = 'Choose your archive files to browse models.';
  el('pc-files').hidden = requested === 'firebugs'; el('disc-files').hidden = requested !== 'auto' && requested !== 'firebugs';
  const discMode = requested === 'firebugs' || requested === 'auto' && sourceKind === 'disc';
  const image = el('image').files[0], index = el('index').files[0], zip = el('disc').files[0];
  if (discMode ? !zip : !image || !index) {status(discMode ? 'Select a Firebugs disc ZIP.' : 'Select matching IMG and IDX files.'); return;}
  status('Reading game files…'); busy(true);
  try {
    let opened;
    if (discMode) {
      const disc = await openFirebugsDisc({size: zip.size, read: async (offset, length) => new Uint8Array(await zip.slice(offset, offset + length).arrayBuffer())}, {onProgress: phase => {if (token === generation) status(`${phase}…`);}});
      if (token !== generation) return;
      opened = await FirebugsArchive.open(disc);
    } else opened = await FileArchive.open(image, index);
    const identified = await identifyGame(opened, requested);
    if (token !== generation) return;
    const libraries = await listObjectResources(opened, identified.game, identified.tracks);
    if (token !== generation) return;
    if (!libraries.length) throw Error('No supported model libraries were found.');
    archive = opened; game = identified.game; verified = identified.verified; resources = libraries;
    el('game-info').textContent = `${game.label} · ${resources.length} model libraries${verified ? '' : ' · Unverified release'}`;
    el('resource').replaceChildren(...resources.map(row => new Option(row.label, String(row.id)))); el('resource').disabled = false;
    el('files').open = false; busy(false); await loadResource();
  } catch (error) {if (token === generation) {busy(false); el('error').textContent = errorText(error); status('Unable to open these game files. Select a matching archive or another release.');}}
}
async function downloadModel() {
  if (!scene || exporting) return;
  const source = scene, token = generation; exporting = true; el('download').disabled = true; status('Preparing model and textures…');
  try {
    const download = await buildObjectDownload(source);
    if (token !== generation) return;
    const url = URL.createObjectURL(download.blob), link = document.createElement('a');
    link.href = url; link.download = download.filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status(`Downloaded ${download.filename}. Unzip it and import object.obj into Blender.`);
  } catch (error) {if (token === generation) {el('error').textContent = errorText(error); status('Download failed. Try again.');}}
  finally {exporting = false; el('download').disabled = !scene;}
}
for (const id of ['image', 'index', 'disc']) el(id).addEventListener('change', () => {sourceKind = id === 'disc' ? 'disc' : 'pc'; openFiles();});
el('game').addEventListener('change', () => {if (el('game').value !== 'auto') sourceKind = el('game').value === 'firebugs' ? 'disc' : 'pc'; openFiles();});
el('resource').addEventListener('change', loadResource); el('object').addEventListener('change', loadModel);
el('search').addEventListener('input', filterModels); el('show-unavailable').addEventListener('change', filterModels);
el('kind').addEventListener('change', filterModels);
el('download').addEventListener('click', downloadModel);
el('fit').addEventListener('click', () => {releaseMouse(); if (scene) navigation.reset(scene.bounds); help();});
el('model-mode').addEventListener('change', () => {releaseMouse(); navigation.setMode(el('model-mode').value); help();});
el('smooth').addEventListener('change', () => renderer?.setFilters(el('smooth').checked));
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (!scene || ![0, 2].includes(event.button)) return;
  canvas.focus(); drag = {id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey}; canvas.setPointerCapture(event.pointerId);
  if (navigation.mode === 'fly' && event.button === 0 && document.pointerLockElement !== canvas) {
    try {canvas.requestPointerLock?.()?.catch(() => status('Mouse capture unavailable. Drag to look around.'));} catch {status('Mouse capture unavailable. Drag to look around.');}
  }
});
canvas.addEventListener('pointermove', event => {
  if (!scene) return;
  if (document.pointerLockElement === canvas) {navigation.look(event.movementX, event.movementY); return;}
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (navigation.mode === 'orbit' && drag.pan) navigation.pan(dx, dy, canvas.clientHeight); else navigation.look(dx, dy);
  drag.x = event.clientX; drag.y = event.clientY;
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, clearInput);
canvas.addEventListener('wheel', event => {if (scene) {event.preventDefault(); navigation.wheel(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1));}}, {passive: false});
const navigationKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', event => {if (event.code === 'Escape') {releaseMouse(); return;} if (scene && document.activeElement === canvas && !event.ctrlKey && !event.metaKey && !event.altKey && navigationKeys.has(event.code)) {event.preventDefault(); keys.add(event.code);}});
window.addEventListener('keyup', event => keys.delete(event.code)); window.addEventListener('blur', releaseMouse); canvas.addEventListener('blur', clearInput);
document.addEventListener('pointerlockchange', clearInput); document.addEventListener('visibilitychange', () => {if (document.hidden) releaseMouse(); lastFrame = 0;});
canvas.addEventListener('webglcontextlost', event => {event.preventDefault(); contextLost = true; ++generation; releaseMouse(); clearModel(); busy(false); for (const id of ['image', 'index', 'disc', 'game', 'resource']) el(id).disabled = true; el('error').textContent = 'The graphics context was lost. Reload the page to restore the viewer.';});
function frame(time) {
  if (contextLost) return;
  const seconds = lastFrame ? Math.max(0, (time - lastFrame) / 1000) : 0; lastFrame = time;
  if (scene && !document.hidden) {navigation.step(keys, seconds); if (el('rotate').checked && navigation.mode === 'orbit' && !drag) navigation.yaw += Math.min(seconds, 0.05) * 0.35;}
  renderer.render(navigation, {textures: el('textures').checked, lighting: el('lighting').checked, objects: true, sector: -1, paths: false, pathPoints: false, pathThrough: false, pathGroup: -1});
  requestAnimationFrame(frame);
}
window.rollcageObjectViewer = {inspect: () => ({game: game?.id ?? null, verified, resources: resources.map(({id, label}) => ({id, label})),
  resource: el('resource').value, entries: collection?.entries.map(({id, label, modelIndex, kind, status, reason}) => ({id, label, modelIndex, kind, status, reason})) ?? [],
  selected: selectedEntry?.id ?? null, selectedKind: selectedEntry?.kind ?? null, parts: scene?.meshes.length ?? 0, assembly: scene?.assembly ?? null,
  triangles: scene?.triangles ?? 0, vertices: scene?.vertices ?? 0, textures: scene?.textures.size ?? 0,
  groups: renderer?.groups.length ?? 0, bounds: scene?.bounds ?? null, mode: navigation.mode, eye: navigation.position(), heldKeys: keys.size,
  loading: el('stage').getAttribute('aria-busy') === 'true', exporting, error: el('error').textContent})};
try {renderer = new Renderer(canvas); requestAnimationFrame(frame);} catch (error) {el('error').textContent = errorText(error); status('Rendering is unavailable.'); for (const id of ['image', 'index', 'disc', 'game']) el(id).disabled = true;}
