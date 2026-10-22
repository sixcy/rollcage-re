import test from 'node:test';
import assert from 'node:assert/strict';
import {configureRendererGraphicsMode, configureRendererPresentation, getRendererWindowApplication, initializeRendererPresentationConstants} from '../src/renderer-presentation.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), get = (m, p) => m.readInt32LE(p);
function fixture() {
  const memory = initializeRendererPresentationConstants(Buffer.alloc(0xa00000)), manager = 0x100000, settings = 0x110000, caps = 0x120000, app = 0x130000;
  put(memory, manager + 0x488, caps); put(memory, manager + 0x368, 0x140000); put(memory, manager + 0x374, 1); put(memory, manager + 0x424, 640); put(memory, manager + 0x428, 480); put(memory, manager + 0x430, 22); put(memory, manager + 0x42c, 60); put(memory, caps + 0x534, 1);
  put(memory, 0x6e64a4, settings); put(memory, 0x6e63d0, 3); put(memory, 0x6efb38, app); put(memory, app + 8, 0x111); put(memory, app + 12, 0x222); put(memory, app + 16, 0x333);
  const casts = [], runtime = {memory, scratchBase: 0x9000, services: {direct3DCall: () => 0}, handlers: {dynamicCast(...args) {casts.push(args.slice(0, -1)); return args[0];}}};
  return {memory, manager, settings, caps, app, runtime, casts};
}
test('WindowsApplication getter uses its original RTTI target', () => {
  const {app, casts, runtime} = fixture(); assert.equal(getRendererWindowApplication(runtime), app); assert.deepEqual(casts, [[app, 0, 0x6e213c, 0x6e2054, 0]]);
});
test('graphics mode writer truncates flags and preserves scalar division order', () => {
  const {memory: m, settings, runtime} = fixture(); m[settings + 0x3d] = 0x77; configureRendererGraphicsMode(settings, 2, 1, 32, 60, 257, 2, runtime);
  assert.equal(m[settings + 0x3c], 1); assert.equal(m[settings + 0x3d], 0x77); assert.equal(m.readFloatLE(settings + 0x44), 0.5); assert.equal(m.readFloatLE(settings + 0x48), 1); assert.equal(m.readFloatLE(settings + 0x4c), 1);
});
test('refresh interval matching supports half-refresh policy and clears unsupported preference', () => {
  const {memory: m, manager, settings, caps, runtime} = fixture(); m[settings + 0x3c] = 1; m[settings + 0x58] = 1; put(m, settings + 0x5c, 30); m[caps + 0x418] = 2;
  configureRendererPresentation(manager, runtime); assert.equal(get(m, manager + 0x3ac), 2); assert.equal(get(m, settings + 0x5c), 30);
  put(m, settings + 0x5c, 47); configureRendererPresentation(manager, runtime); assert.equal(get(m, settings + 0x5c), 0);
});
test('multisample preference is capped to four supported enumerated modes', () => {
  const {memory: m, manager, settings, runtime} = fixture(); put(m, settings + 0x54, 6); configureRendererPresentation(manager, runtime);
  assert.equal(get(m, manager + 0x388), 5); assert.equal(get(m, manager + 0x390), 1); assert.equal(get(m, manager + 0x500), 22); assert.equal(get(m, manager + 0x504), 75);
});
test('additional windows copy presentation data but use separate live application handles', () => {
  const {memory: m, manager, runtime} = fixture(); put(m, manager + 0x374, 3); configureRendererPresentation(manager, runtime);
  assert.equal(get(m, manager + 0x394), 0x111); assert.equal(get(m, manager + 0x3cc), 0x222); assert.equal(get(m, manager + 0x404), 0x333);
  assert.equal(get(m, manager + 0x3b0), 640); assert.equal(get(m, manager + 0x3e8), 640);
});
