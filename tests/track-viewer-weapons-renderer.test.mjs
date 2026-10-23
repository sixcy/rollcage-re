import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../tools/track-viewer/renderer.mjs';

test('weapon meshes use native visibility/pose and archive textures; spawn markers are display-only and resources clean up', t => {
  const previous = globalThis.devicePixelRatio; globalThis.devicePixelRatio = 1;
  t.after(() => {if (previous === undefined) delete globalThis.devicePixelRatio; else globalThis.devicePixelRatio = previous;});
  let next = 0, bound, model;
  const draws = [], deleted = [], uploads = [];
  const gl = new Proxy({NO_ERROR: 0, createShader: () => ++next, createProgram: () => ++next,
    createBuffer: () => ({buffer: ++next}), createTexture: () => ({texture: ++next}),
    getShaderParameter: () => true, getProgramParameter: () => true, getError: () => 0,
    getAttribLocation: (_, name) => name, getUniformLocation: (_, name) => name,
    bindBuffer: (_, value) => {bound = value;}, bufferData: (_, data) => uploads.push({buffer: bound, data}),
    uniformMatrix4fv: (name, _, value) => {if (name === 'model') model = [...value];},
    drawArrays: (mode, _, count) => draws.push({buffer: bound, mode, count, model}),
    deleteBuffer: value => deleted.push(value), deleteTexture: value => deleted.push(value)
  }, {get: (target, key) => key in target ? target[key] : /^[A-Z_]+$/.test(key) ? key : () => {}});
  const renderer = new Renderer({getContext: () => gl, clientWidth: 320, clientHeight: 240});
  const image = {width: 1, height: 1, rgba: new Uint8Array([255,255,255,255])};
  const group = instance => ({instance, page: 0, vertices: 3, buffer: Buffer.alloc(96).toString('base64')});
  const car = {groups: [group(0)], textures: new Map([[0,image]])};
  renderer.setCar({...car, weapons: {groups: [group(0), group(1), group(2)], textures: new Map([[0,image]]), spawnPositions: [[10,20,30]]}});
  const pose = {position: [4,5,6], rotation: [1,0,0,0,1,0,0,0,1]};
  const objects = [{...pose, kind: 'pickup', visible: true}, {...pose, kind: 'projectile', visible: true}, {...pose, kind: 'projectile', visible: false}];
  const options = {textures: true, lighting: true, objects: false, paths: false, sector: -1, car: {parts: [pose], weapons: {enabled: true, objects}}};
  renderer.render({matrix: () => new Float32Array(16)}, options);
  assert.deepEqual(renderer.weaponDraws, {pickups: 1, projectiles: 1, groups: 2, spawnMarkers: 1});
  assert.deepEqual(draws.filter(row => renderer.weaponGroups.some(group => group.buffer === row.buffer)).map(row => row.model.slice(12)), [[4,-5,-6,1],[4,-5,-6,1]]);
  assert.deepEqual([...uploads.find(row => row.buffer === renderer.weaponMarkerBuffer).data], [10,-20,-30]);
  assert.ok(draws.some(row => row.buffer === renderer.weaponMarkerBuffer && row.mode === gl.POINTS && row.count === 1));
  const resources = [...renderer.weaponGroups.map(row => row.buffer), renderer.weaponMarkerBuffer, ...renderer.weaponTextures.values()];
  renderer.setCar(car);
  assert.ok(resources.every(value => deleted.filter(row => row === value).length === 1));
  assert.equal(renderer.weaponGroups.length, 0); assert.equal(renderer.weaponMarkerCount, 0);
  renderer.render({matrix: () => new Float32Array(16)}, {...options, car: {parts: [pose]}});
  assert.deepEqual(renderer.weaponDraws, {pickups: 0, projectiles: 0, groups: 0, spawnMarkers: 0});
  renderer.clear();
});
