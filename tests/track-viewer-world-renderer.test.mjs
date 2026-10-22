import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../tools/track-viewer/renderer.mjs';

const identity = [1,0,0,0,1,0,0,0,1];
const pose = (position = [0,0,0], rotation = identity) => ({position, rotation});
const image = {width: 1, height: 1, rgba: new Uint8Array([255,255,255,255])};
const group = (instance, page = 0, extra = {}) => ({instance, page, vertices: 3, buffer: Buffer.alloc(96).toString('base64'), ...extra});
const assets = () => ({groups: [group(0)], textures: new Map([[0,image]]),
  worldObjects: {groups: [group(0), group(0,1), group(1)], textures: new Map([[0,image],[1,image]]), placementIndices: [7,8]}});
function fixture(t) {
  const previousRatio = globalThis.devicePixelRatio; globalThis.devicePixelRatio = 1;
  t.after(() => {if (previousRatio === undefined) delete globalThis.devicePixelRatio; else globalThis.devicePixelRatio = previousRatio;});
  let next = 0, boundBuffer, boundTexture, matrix;
  const calls = {draws: [], deletedBuffers: [], deletedTextures: [], filters: [], error: 0};
  const gl = new Proxy({
    NO_ERROR: 0, createShader: () => ++next, createProgram: () => ++next,
    createBuffer: () => ({buffer: ++next}), createTexture: () => ({texture: ++next}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_, name) => name, getUniformLocation: (_, name) => name,
    getError: () => {const result = calls.error; calls.error = 0; return result;},
    bindBuffer: (_, buffer) => {boundBuffer = buffer;}, bindTexture: (_, texture) => {boundTexture = texture;},
    uniformMatrix4fv: (name, _, value) => {if (name === 'model') matrix = [...value];},
    drawArrays: () => calls.draws.push({buffer: boundBuffer, texture: boundTexture, matrix}),
    deleteBuffer: value => calls.deletedBuffers.push(value), deleteTexture: value => calls.deletedTextures.push(value),
    texParameteri: (_, parameter, value) => calls.filters.push({texture: boundTexture, parameter, value})
  }, {get: (target, key) => key in target ? target[key] : /^[A-Z_]+$/.test(key) ? key : () => {}});
  const renderer = new Renderer({getContext: () => gl, clientWidth: 100, clientHeight: 100});
  renderer.setScene({groups: [group(-1,0,{kind:'terrain',segment:0}), ...[7,8,9].map(instance => group(instance,0,{kind:'object'}))], textures: new Map([[0,image]])});
  renderer.setCar(assets());
  const options = {textures: true, lighting: true, objects: true, sector: -1, paths: false,
    car: {parts: [pose([1,2,3])], brokenPlacements: [], worldObjects: [
      {placementIndex:7, visible:true, ...pose([10,-20,30],[0,0,1,0,1,0,-1,0,0])},
      {placementIndex:8, visible:false, ...pose([50,60,70])}
    ]}};
  const draw = () => {calls.draws = []; renderer.render({matrix: () => new Float32Array(16)}, options); return calls.draws;};
  return {renderer, calls, gl, options, draw};
}

test('moving world meshes replace static placements and use native visible poses with the car transform', t => {
  const {renderer, options, draw} = fixture(t), draws = draw();
  assert.deepEqual(draws.map(value => value.buffer), [renderer.groups[0].buffer, renderer.groups[3].buffer, renderer.worldGroups[0].buffer, renderer.worldGroups[1].buffer, renderer.carGroups[0].buffer]);
  // S*R*S and S*p are checked literally: the handedness conversion happens once.
  assert.deepEqual(draws[2].matrix, [0,-0,1,0,-0,1,0,0,-1,0,0,0,10,20,-30,1]);
  assert.deepEqual(draws[4].matrix.slice(12), [1,-2,-3,1]);
  assert.deepEqual(renderer.worldDraws, {groups:2,objects:1});
  options.car.worldObjects[0] = {placementIndex:7, visible:true, ...pose([12,-21,33],[0.5,0,0,0,0.5,0,0,0,0.5])};
  const changed = draw(); assert.deepEqual(changed[2].matrix.slice(12), [12,21,-33,1]);
  assert.equal(changed[2].matrix[0], 0.5); // Native shrink remains in the matrix.
  options.car.worldObjects[0].visible = false;
  assert.equal(draw().length, 3); assert.deepEqual(renderer.worldDraws, {groups:0,objects:0});
});

test('objects visibility hides moving scenery while preserving the car and static preview without a session', t => {
  const {renderer, options, draw} = fixture(t);
  options.objects = false;
  assert.deepEqual(draw().map(value => value.buffer), [renderer.groups[0].buffer, renderer.carGroups[0].buffer]);
  assert.deepEqual(renderer.worldDraws, {groups:0,objects:0});
  options.objects = true; options.car = null;
  assert.deepEqual(draw().map(value => value.buffer), renderer.groups.map(value => value.buffer));
});

test('runtime object buffers and textures share filtering, replacement, failure and track cleanup', t => {
  const {renderer, calls, gl} = fixture(t);
  renderer.setFilters(true);
  for (const texture of renderer.worldTextures.values()) assert.ok(calls.filters.some(call => call.texture === texture && call.parameter === gl.TEXTURE_MIN_FILTER && call.value === gl.LINEAR));
  const buffers = [...renderer.carGroups,...renderer.worldGroups].map(value => value.buffer), textures = [...renderer.carTextures.values(),...renderer.worldTextures.values()];
  renderer.setCar({groups: [group(0)], textures: new Map([[0,image]])});
  assert.ok(buffers.every(value => calls.deletedBuffers.includes(value))); assert.ok(textures.every(value => calls.deletedTextures.includes(value)));
  assert.equal(renderer.worldGroups.length, 0); assert.equal(renderer.worldPlacements.size, 0);
  calls.error = 1285; assert.throws(() => renderer.setCar(assets()), /GPU/);
  assert.equal(renderer.carGroups.length, 0); assert.equal(renderer.worldTextures.size, 0); assert.equal(renderer.worldPlacements.size, 0);
  renderer.setCar(assets()); const worldBuffers = renderer.worldGroups.map(value => value.buffer), worldTextures = [...renderer.worldTextures.values()];
  renderer.clear(); renderer.clear();
  assert.ok(worldBuffers.every(value => calls.deletedBuffers.filter(old => old === value).length === 1));
  assert.ok(worldTextures.every(value => calls.deletedTextures.filter(old => old === value).length === 1));
  assert.equal(renderer.groups.length, 0); assert.equal(renderer.worldGroups.length, 0);
});
