import {constructRendererResourcePool} from './renderer-resource-pools.mjs';
import {constructRendererListeners} from './renderer-state-producers.mjs';
import {constructRendererTransformState} from './renderer-device-view-state.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer device construction requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//50da10's exact constant-input branch reached by50f510/50fb10: kind4,
//null shader name. Other material kinds/shader lookup remain separate work.
export function constructUnboundRendererMaterial(object, enabled, runtime) {
  const m = runtime.memory; put(m, object, 0); m.writeUInt16LE(0, object + 4); m[object + 6] = 0; m[object + 7] = enabled & 255; put(m, object + 28, 7); put(m, object + 24, 0); m.writeUInt16LE(0, object + 8); put(m, object + 32, 0);
  for (let slot = 0; slot < 8; slot++) {put(m, object + 36 + slot * 8, -1); m.writeUInt16LE(m.readUInt16LE(0x6e1e50), object + 40 + slot * 8); m.writeUInt16LE(0x30f, object + 42 + slot * 8);} for (const offset of [100, 104, 108]) put(m, object + offset, 0); return object;
}

//514800, with actual vertex pool, depth-sorted cache records and listeners.
export function constructRendererBaseManager(object, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20; put(m, object, 0x5db3c8); constructRendererResourcePool(object + 4, 'vertex', {...runtime, scratchBase: frame - 8});
  for (let offset = 0x38; offset <= 0x5c; offset += 4) put(m, object + offset, 0);
  for (const base of [0x60, 0x8c, 0xb8]) {for (const offset of [4, 8, 12, 24, 28]) put(m, object + base + offset, 0); put(m, object + base, 0x5db518); put(m, object + base + 40, -1);}
  const childRuntime = {...runtime, scratchBase: frame - 4, handlers: {...runtime.handlers, allocate: size => library(runtime, 'operatorNew', [size]), free: p => library(runtime, 'operatorDelete', [p])}}; constructRendererListeners(object + 0xf0, childRuntime);
  for (const offset of [0x124, 0x128, 0x12c]) put(m, object + offset, 0); m[object + 0x130] = 0; for (let offset = 0x134; offset <= 0x150; offset += 4) put(m, object + offset, 0); return object;
}

//50f510, D3D9VisualManager construction. This initializes game-owned raw
//state/resource pools; it does not create or execute a Direct3D device.
export function constructRendererD3D9Manager(object, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24; put(m, object + 0x16c, 0); put(m, object + 0x170, 0);
  if (typeof runtime.services?.platformCall !== 'function') throw Error('Renderer D3D9 manager requires critical-section initialization.'); runtime.services.platformCall('InitializeCriticalSectionAndSpinCount', [object + 0x154, 4096], runtime);
  constructRendererBaseManager(object, {...runtime, scratchBase: frame - 4}); put(m, object, 0x5db278); constructRendererTransformState(object + 0x174, {...runtime, scratchBase: frame - 4});
  for (const offset of [0x360, 0x364, 0x368, 0x36c]) put(m, object + offset, 0); put(m, object + 0x370, -1); for (const offset of [0x374, 0x438, 0x47c, 0x480, 0x484, 0x488]) put(m, object + offset, 0);
  constructRendererResourcePool(object + 0x48c, 'texture', {...runtime, scratchBase: frame - 8}); for (const offset of [0x4c0, 0x4c4, 0x4c8]) put(m, object + offset, 0); for (let offset = 0x4cc; offset <= 0x4f8; offset += 4) put(m, object + offset, -1);
  put(m, object + 0x4fc, 0); put(m, object + 0x508, 0); for (const offset of [0x50c, 0x510, 0x514, 0x518]) put(m, object + offset, -1); for (const offset of [0x51c, 0x520, 0x524, 0x528]) put(m, object + offset, 0); m.writeUInt16LE(0, object + 0x52c); m[object + 0x52e] = 0; for (let offset = 0x530; offset <= 0x53c; offset += 4) put(m, object + offset, 0);
  put(m, object + 0x55c, 0); put(m, object + 0x560, 0); put(m, object + 0x57c, 0); put(m, object + 0x580, 0); m.fill(0, object + 0x540, object + 0x584);
  for (let offset = 0x584; offset <= 0x5b0; offset += 4) put(m, object + offset, 0); for (const [offset, value] of [[0x5b4, 3], [0x5b8, 2], [0x5bc, 1], [0x5c0, 1]]) put(m, object + offset, value); m[object + 0x5c4] = 1; put(m, object + 0x5c8, 0); put(m, object + 0x5cc, m.readInt32LE(0x5dcb10)); put(m, object + 0x5d0, 0); m[object + 0x5d4] = 0;
  for (let offset = 0x5d8; offset <= 0x83c; offset += 0x44) m[object + offset] = 0; m.writeUInt16LE(0, object + 0x880); put(m, object + 0x884, 0); put(m, object + 0x888, 0); put(m, object + 0x88c, -1);
  constructRendererResourcePool(object + 0x890, 'integer', {...runtime, scratchBase: frame - 8}); for (const offset of [0x8c4, 0x8c8, 0x8cc, 0x8d0, 0x8d4]) put(m, object + offset, 0); constructUnboundRendererMaterial(object + 0x8d8, 1, {...runtime, scratchBase: frame - 16});
  m[object + 0x948] = 0; for (let offset = 0x94c; offset <= 0x978; offset += 4) put(m, object + offset, 0); m[object + 0x97c] = 0;
  //5688c0's normal compiler array-construction loop invokes real50fb10 twice.
  for (let index = 0; index < 2; index++) constructUnboundRendererMaterial(object + 0x988 + index * 0x70, 1, runtime);
  put(m, object + 0xa68, 0); m[object + 0xa6c] = 0; put(m, object + 0xa84, 0); m[object + 0xa88] = 0; put(m, object + 0xa8c, 0); put(m, object + 0xa90, 0);
  const head = library(runtime, 'operatorNew', [24]) >>> 0; if (!head) throw Error('Native renderer device tree bad_alloc.'); for (const offset of [0, 4, 8]) put(m, head + offset, head); m.writeUInt16LE(0x101, head + 12); put(m, object + 0xa8c, head);
  for (let index = 0; index < ptr(m, object + 0x894); index++) put(m, ptr(m, ptr(m, object + 0x890) + index * 4), index); return object;
}
