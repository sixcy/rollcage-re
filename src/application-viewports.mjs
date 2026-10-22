import {assignViewportString, getOrCreateViewportRecord} from './weather-viewport.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
import {obtainRendererTextureIndex} from './renderer-texture-ownership.mjs';
import {createRendererViewportTexture} from './renderer-texture-creation.mjs';
import {constructRendererViewport} from './renderer-state-producers.mjs';
import {constructRendererStockName, registerRendererTarget} from './renderer-target-registration.mjs';
import {appendGameImagePointer} from './game-image-storage.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const cLength = (m, p) => {let end = p; while (m[end]) end++; return end - p;};
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Application viewport requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//404020. Actual application viewport creation: allocate a texture index and
//surface, a named render target and scene-linked viewport, then publish both
//the renderer target vector and the application rectangle/enable map.
export function createApplicationViewport(application, name, x, y, width, height, runtime) {
  const {memory: m, scratchBase: s} = runtime, aligned = (s - 4) & ~15, f = aligned - 196, key = f + 0x78;
  [name, x, y, width, height].forEach((v, i) => put(m, s + 4 + i * 4, v));
  put(m, f + 0xb0, get(m, 0x5e8890) ^ (aligned - 184)); put(m, f + 0x20, application);
  const originalWidth = get(m, s + 16), originalHeight = get(m, s + 20), source = ptr(m, s + 4) || 0x56fe6b;
  put(m, f + 0x1c, 0); put(m, f + 0x30, originalWidth); put(m, f + 0x24, originalHeight); m[f + 0x17] = 0;
  put(m, key + 20, 15); put(m, key + 16, 0); m[key] = 0;
  assignViewportString(key, source, cLength(m, source), {...runtime, scratchBase: f - 12}); put(m, f + 0x90, 0); put(m, f + 0xc0, 0);
  obtainRendererTextureIndex(ptr(m, 0x714ae8), f + 0x28, {...runtime, scratchBase: f - 12});
  const config = ptr(m, 0x5ecefc), scale = m[config + 0x41a] && get(m, 0x6e6c04) ? 2 : 1;
  getApplicationDebugger({...runtime, scratchBase: f - 4});
  const scaledHeight = Math.imul(get(m, f + 0x24), scale), scaledWidth = Math.imul(originalWidth, scale);
  put(m, f + 0x18, scaledHeight); put(m, f + 0x2c, scaledWidth);
  createRendererViewportTexture(ptr(m, 0x714ae8), get(m, f + 0x28), 0, scaledWidth, scaledHeight, 1, 2, 1, f + 0x17, {...runtime, scratchBase: f - 36});
  let target = library(runtime, 'operatorNew', [76]) >>> 0; put(m, f + 0x10, target);
  const copyString = (output, input, entry) => {
    put(m, entry + 4, input); put(m, entry + 8, 0); put(m, entry + 12, -1);
    const data = ptr(m, input + 20) >= 16 ? ptr(m, input) : input;
    assignViewportString(output, data, ptr(m, input + 16), {...runtime, scratchBase: entry});
  };
  if (target) {
    const index = get(m, f + 0x28); for (const o of [0, 4, 8, 12]) put(m, target + o, 0); m[f + 0xc0] = 2;
    const targetKey = target + 20; m[target + 16] = 1; put(m, targetKey + 20, 15); put(m, targetKey + 16, 0); m[targetKey] = 0;
    copyString(targetKey, key, f - 16); put(m, targetKey + 24, 0); target = ptr(m, f + 0x10);
    put(m, target + 0x30, index); put(m, target + 0x34, 0); m[target + 0x38] = 1; put(m, target + 0x39, 0xff000000); m.writeUInt16LE(0x101, target + 0x3d);
    for (const o of [0x40, 0x44, 0x48]) put(m, target + o, 0);
  }
  m[f + 0xc0] = 0; constructRendererStockName(f + 0x94, true, {...runtime, scratchBase: f - 4}); m[f + 0xc0] = 3;
  put(m, f + 0x70, 15); put(m, f + 0x6c, 0); m[f + 0x5c] = 0; copyString(f + 0x5c, f + 0x94, f - 16); put(m, f + 0x74, 0); m[f + 0xc0] = 5;
  const destroy = (object, reset = false) => {
    const owner = ptr(m, object + 24); if (owner) {library(runtime, 'operatorDeleteArray', [owner]); put(m, object + 24, 0);}
    if (ptr(m, object + 20) >= 16) {if (typeof runtime.handlers?.free !== 'function') throw Error('Application viewport requires CRT free.'); runtime.handlers.free(ptr(m, object), runtime);}
    if (reset) {put(m, object + 20, 15); put(m, object + 16, 0); m[object] = 0;}
  };
  destroy(f + 0x94); put(m, f + 0xa8, 15); put(m, f + 0xa4, 0); m[f + 0x94] = 0;
  registerRendererTarget(ptr(m, 0x6e6388), target, f + 0x5c, 0, {...runtime, scratchBase: f - 16});
  const viewport = library(runtime, 'operatorNew', [0x25c]) >>> 0; put(m, f + 0x10, viewport); m[f + 0xc0] = 6;
  if (viewport) {
    const scene = constructRendererStockName(f + 0x34, false, {...runtime, scratchBase: f - 4}); m[f + 0xc0] = 7; put(m, f + 0x1c, 1);
    put(m, f + 0x10, constructRendererViewport(viewport, key, scene, 0, {...runtime, scratchBase: f - 16}));
  }
  m[f + 0xc0] = 5; if (m[f + 0x1c] & 1) destroy(f + 0x34);
  let object = ptr(m, f + 0x10); const app = ptr(m, f + 0x20);
  put(m, f + 0x34, 0); put(m, f + 0x38, 0); put(m, object + 0x4c, get(m, app + 0x6c));
  put(m, f + 0x3c, get(m, f + 0x2c)); put(m, f + 0x40, get(m, f + 0x18)); put(m, f + 0x18, object);
  for (let i = 0; i < 16; i++) m[object + 0x84 + i] = m[f + 0x34 + i];
  appendGameImagePointer(target + 0x40, f + 0x18, {...runtime, scratchBase: f - 8});
  put(m, f + 0x34, get(m, s + 8)); put(m, f + 0x38, get(m, s + 12)); put(m, f + 0x3c, get(m, f + 0x30)); put(m, f + 0x40, get(m, f + 0x24));
  m.writeUInt16LE(0x101, target + 0x3d); put(m, target + 0x39, get(m, 0x91ce1c)); object = ptr(m, f + 0x10); m.writeUInt16LE(0, object + 0xbd);
  const record = getOrCreateViewportRecord(ptr(m, f + 0x20) + 0x7c, key, {...runtime, scratchBase: f - 8});
  object = ptr(m, f + 0x10); put(m, record, target); put(m, record + 4, object);
  for (let i = 0; i < 16; i++) m[record + 8 + i] = m[f + 0x34 + i];
  for (let o = 0x18; o <= 0x30; o += 4) put(m, record + o, 0); m[record + 0x34] = 0;
  destroy(f + 0x5c, true); destroy(key);
  if ((get(m, f + 0xb0) ^ (aligned - 184)) !== get(m, 0x5e8890)) throw Error('Application viewport security-cookie check failed.');
}

//406b80. The enabled byte belongs to the Application's named viewport map,
//separate from the renderer owner vectors and viewport object state.
export function setApplicationViewportEnabled(application, name, enabled, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 60, key = frame + 0x10;
  put(m, scratchBase + 4, name); put(m, scratchBase + 8, enabled);
  put(m, frame + 0x2c, get(m, 0x5e8890) ^ (scratchBase - 44));
  put(m, key + 20, 15); put(m, key + 16, 0); m[key] = 0;
  const source = name || 0x56fe6b; assignViewportString(key, source, cLength(m, source), {...runtime, scratchBase: frame - 12});
  put(m, key + 24, 0); put(m, frame + 0x38, 0);
  const active = get(m, scratchBase + 8) === 1;
  const record = getOrCreateViewportRecord(application + 0x7c, key, {...runtime, scratchBase: frame - 8}); m[record + 0x34] = active ? 1 : 0;
  const owner = ptr(m, key + 24);
  if (owner) {
    if (typeof runtime.services?.libraryCall !== 'function') throw Error('Application viewport requires CRT operatorDeleteArray.');
    runtime.services.libraryCall('operatorDeleteArray', [owner], runtime); put(m, key + 24, 0);
  }
  if (ptr(m, key + 20) >= 16) {
    if (typeof runtime.handlers?.free !== 'function') throw Error('Application viewport requires CRT free.');
    runtime.handlers.free(ptr(m, key), runtime);
  }
  if ((get(m, frame + 0x2c) ^ (scratchBase - 44)) !== get(m, 0x5e8890)) throw Error('Application viewport security-cookie check failed.');
}
