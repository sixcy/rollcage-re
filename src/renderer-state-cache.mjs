import constants from './renderer-state-cache-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export function initializeRendererStateCacheConstants(memory) {for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}
const argsAt = (m, s, values) => values.forEach((v, i) => put(m, s + 4 + i * 4, v));
function com(runtime, object, method, args) {
  if (typeof runtime.services?.direct3DCall !== 'function') throw Error('Renderer state cache requires a Direct3D COM service.');
  return runtime.services.direct3DCall(object, method, args, runtime) | 0;
}
//523fd0. Four original packed vectors contain the integer3 in every lane.
export function constructRendererStateCache(cache, device, runtime) {
  const m = runtime.memory, defaults = Buffer.from(m.subarray(0x5dcc70, 0x5dcc80)); put(m, cache + 8, device); put(m, cache, 0x5dbfac);
  for (const [o, v] of [[4, 0], [12, 0], [0x54, 0], [0x58, 0], [0x5c, -1], [0x60, -1], [0x64, 0]]) put(m, cache + o, v);
  for (let i = 0; i < 64; i += 16) defaults.copy(m, cache + 0x68 + i);
  for (const [o, v] of [[0x6c, 1], [0x70, 1], [0x78, 2], [0x88, 2]]) put(m, cache + o, v);
  return cache;
}
function allocate(size, runtime) {
  if (typeof runtime.services?.libraryCall !== 'function') throw Error('Renderer device caches require CRT allocation.');
  return runtime.services.libraryCall('operatorNew', [size], runtime) >>> 0;
}
//527bd0. Allocation failure belongs to the CRT bad_alloc throw service.
export function createRendererDrawSentinel(runtime) {
  const m = runtime.memory, node = allocate(0x48, runtime);
  if (!node) {
    if (typeof runtime.services?.libraryCall !== 'function') throw Error('Renderer map sentinel requires CRT bad_alloc.');
    runtime.services.libraryCall('throwBadAlloc', [], runtime); throw Error('CRT bad_alloc service returned unexpectedly.');
  }
  put(m, node, node); if (node + 4 >>> 0) put(m, node + 4, node); if (node + 8 >>> 0) put(m, node + 8, node); m.writeUInt16LE(0x101, node + 12);
  return node;
}
//525b90. Two map sentinels and the original pair of 2048-byte FF tables.
export function constructRendererDrawCache(cache, runtime) {
  const m = runtime.memory;
  for (const offset of [0, 4, 8, 0x100c, 0x1010, 0x1014, 0x1018, 0x101c, 0x1020, 0x1024, 0x1028]) put(m, cache + offset, 0);
  put(m, cache + 0x1024, createRendererDrawSentinel({...runtime, scratchBase: runtime.scratchBase - 24}));
  put(m, cache + 0x102c, 0); put(m, cache + 0x1030, 0);
  put(m, cache + 0x102c, createRendererDrawSentinel({...runtime, scratchBase: runtime.scratchBase - 24}));
  m.fill(255, cache + 12, cache + 0x80c); m.fill(255, cache + 0x80c, cache + 0x100c);
  return cache;
}
//5243e0. The first owner is published before the second allocation, which
//can mutate manager fields or fail independently. The native AL is always1.
export function createRendererDeviceCaches(manager, unused, runtime) {
  const m = runtime.memory, f = runtime.scratchBase - 20;
  const state = allocate(0x9f0, {...runtime, scratchBase: f - 8});
  const result = state ? constructRendererStateCache(state, ptr(m, manager + 0x36c), {...runtime, scratchBase: f - 8}) : 0;
  put(m, manager + 0x364, result);
  const draw = allocate(0x1034, {...runtime, scratchBase: f - 8});
  if (draw) put(m, manager + 0x360, constructRendererDrawCache(draw, {...runtime, scratchBase: f - 8}));
  else put(m, manager + 0x360, 0);
  return 1;
}
//528f80, manager virtualE4.
export function setRendererDepthPolicy(manager, mode, runtime) {
  const m = runtime.memory, r = {...runtime, scratchBase: runtime.scratchBase - 8};
  virtual(ptr(m, manager + 0x364), 0x1c, [0x17, mode === 1 || mode === 3 ? 4 : 8], r);
  virtual(ptr(m, manager + 0x364), 0x1c, [0xe, mode === 2 || mode === 3 ? 1 : 0], r);
}
//5112e0. Reset is unconditional; the extra policy calls require a device.
export function initializeRendererDeviceState(manager, runtime) {
  const m = runtime.memory, f = runtime.scratchBase - 4, r = {...runtime, scratchBase: f};
  resetRendererStateCache(ptr(m, manager + 0x364), 1, {...runtime, scratchBase: f - 8});
  const hasDevice = ptr(m, manager + 0x36c) !== 0; put(m, manager + 0x884, -1); put(m, manager + 0x888, -1);
  if (!hasDevice) return;
  virtual(ptr(m, manager + 0x364), 0x1c, [0xa1, get(m, manager + 0x388) !== 0 ? 1 : 0], r);
  const target = ptr(m, ptr(m, manager) + 0xe4);
  if (target !== 0x528f80) throw Error(`Unclosed renderer manager virtualE4 target${target.toString(16)}.`);
  setRendererDepthPolicy(manager, 3, {...runtime, scratchBase: f - 8});
  for (const [state, value] of [[0xf,1],[0x1b,0],[0x18,0x80],[0xe,1]]) virtual(ptr(m, manager + 0x364), 0x1c, [state, value], r);
}
//525840. The signed multiply-high quotient and unsigned loop comparison are
//retained even for malformed/reversed raw vector pointers.
export function lookupRendererTextureAddressMode(owner, texture, runtime) {
  const m = runtime.memory;
  const count = () => {const delta = get(m, owner + 0x70) - get(m, owner + 0x6c) | 0, high = Number(BigInt(delta) * 0x2e8ba2e9n >> 32n) >> 3; return high + (high >>> 31) | 0;};
  if (!count()) return 0;
  let index = 0, row = ptr(m, owner + 0x6c) + 0x24;
  do {
    if (get(m, row) === (texture | 0)) return get(m, ptr(m, owner + 0x6c) + Math.imul(index, 44) + 0x28);
    row += 44; index++;
  } while ((index >>> 0) < (count() >>> 0));
  return 0;
}
//518b50,518be0,518c20. Game caches are written before the COM request;
//the actual methods deliberately return0 regardless of the HRESULT.
export function setRendererCachedState(cache, state, value, runtime) {
  const m = runtime.memory; argsAt(m, runtime.scratchBase, [cache, state, value]); put(m, cache + Math.imul(state, 4) + 0xc8, value);
  const device = ptr(m, cache + 8); com(runtime, device, 0xe4, [device, state, value]); return 0;
}
export function setRendererCachedTextureStage(cache, stage, state, value, runtime) {
  const m = runtime.memory; argsAt(m, runtime.scratchBase, [cache, stage, state, value]); put(m, cache + Math.imul((state * 8 | 0) | stage, 4) + 0x410, value);
  const device = ptr(m, cache + 8); com(runtime, device, 0x10c, [device, stage, state, value]); return 0;
}
export function setRendererCachedSampler(cache, stage, state, value, runtime) {
  const m = runtime.memory; argsAt(m, runtime.scratchBase, [cache, stage, state, value]); put(m, cache + Math.imul((state * 8 | 0) | stage, 4) + 0x830, value);
  const device = ptr(m, cache + 8); com(runtime, device, 0x114, [device, stage, state, value]); return 0;
}
function virtual(cache, method, values, runtime) {
  const m = runtime.memory, address = ptr(m, ptr(m, cache) + method), n = values.length + 1, child = {...runtime, scratchBase: runtime.scratchBase - n * 4 - 4};
  const fn = new Map([[0x518b50, setRendererCachedState], [0x518b80, setRendererCachedTexture], [0x518be0, setRendererCachedTextureStage], [0x518c20, setRendererCachedSampler]]).get(address);
  if (!fn) throw Error(`Unclosed renderer cache game virtual${method.toString(16)} target${address.toString(16)}.`);
  return fn(cache, ...values, child);
}
//518b80. The optional texture-owner path performs the actual525840 search
//and reloads each sampler setting around the first COM/game call.
export function setRendererCachedTexture(cache, stage, texture, runtime) {
  const m = runtime.memory, f = runtime.scratchBase - 12; argsAt(m, runtime.scratchBase, [cache, stage, texture]); put(m, cache + Math.imul(stage, 4) + 0xa8, texture);
  const device = ptr(m, cache + 8); com(runtime, device, 0x104, [device, stage, texture]);
  const owner = ptr(m, cache + 12);
  if (owner) {
    const mode = lookupRendererTextureAddressMode(owner, texture, {...runtime, scratchBase: f - 8});
    virtual(cache, 0x28, [stage, 1, get(m, cache + (mode & 5) * 4 + 0x68)], {...runtime, scratchBase: f});
    virtual(cache, 0x28, [stage, 2, get(m, cache + (mode & 10) * 4 + 0x68)], {...runtime, scratchBase: f});
  }
  return 0;
}
//518aa0. BL is captured, while settings/caps are reloaded after each store.
export function getRendererSamplerDefaults(manager, first, second, third, fourth, runtime) {
  const m = runtime.memory, enabled = m[manager + 0x5c4];
  put(m, first, !enabled ? 1 : get(m, ptr(m, manager + 0x488) + 0x444) & 0x400 ? get(m, manager + 0x5b8) : 2);
  put(m, second, !enabled ? 1 : get(m, ptr(m, manager + 0x488) + 0x444) & 0x4000000 ? get(m, manager + 0x5b8) : 2);
  put(m, third, !enabled ? 1 : get(m, manager + 0x5bc)); put(m, fourth, !enabled ? 1 : get(m, manager + 0x5c0));
}
//519050.
export function resetRendererSamplerDefaults(cache, runtime) {
  const m = runtime.memory, f = runtime.scratchBase - 32;
  for (let i = 0; i < 4; i++) put(m, f + 0x10 + i * 4, 0);
  getRendererSamplerDefaults(ptr(m, 0x714ae8), f + 0x10, f + 0x14, f + 0x18, f + 0x1c, {...runtime, scratchBase: f - 20});
  const first = get(m, f + 0x10), second = get(m, f + 0x14);
  for (let stage = 0; stage < 8; stage++) {
    virtual(cache, 0x28, [stage, 6, first], {...runtime, scratchBase: f}); virtual(cache, 0x28, [stage, 5, second], {...runtime, scratchBase: f});
    virtual(cache, 0x28, [stage, 7, get(m, f + 0x18)], {...runtime, scratchBase: f}); virtual(cache, 0x28, [stage, 10, get(m, f + 0x1c)], {...runtime, scratchBase: f});
  }
}
//518cb0. The invalidate-only path is also used independently of creation.
export function resetRendererStateCache(cache, applyDefaults, runtime) {
  const m = runtime.memory, s = runtime.scratchBase, f = s - 12; put(m, s + 4, applyDefaults); const apply = !!m[s + 4];
  for (const [o, v] of [[0x5c, -1], [0x60, -1], [0x58, 0], [0x54, 0]]) put(m, cache + o, v);
  for (const [o, count] of [[0xc8, 0xd2], [0x410, 0x108], [0x830, 0x70]]) for (let i = 0; i < count; i++) put(m, cache + o + i * 4, 0x12345678);
  for (let i = 0; i < 8; i++) put(m, cache + 0xa8 + i * 4, -1);
  if (!apply) return;
  const r = {...runtime, scratchBase: f}, state = (key, value) => virtual(cache, 0x1c, [key, value], r);
  state(8, get(m, ptr(m, 0x714ae8) + 0x5b4));
  for (const [key, value] of [[9,2],[0xc3,0],[0x8d,0],[0x93,0],[0x91,0],[0x92,0],[0x94,0],[7,1],[0x1a,0],[0x16,3],[0x1d,0],[0x10,0],[0x1c,0],[0x22,0],[0x23,3],[0x24,0],[0x25,0],[0x30,0],[0x8c,0],[0xf,1],[0x18,0x80],[0x19,5],[0x3a,-1],[0x3b,-1],[0x88,1],[0x89,1],[0x3c,-1],[0x34,0],[0x35,1],[0x36,1],[0x37,1],[0x38,8],[0x39,0],[0x8e,1],[0x8f,0],[0x97,0],[0x98,0]]) state(key, value);
  state(0x8b, get(m, cache + 0x64)); state(0xb0, 1); put(m, f + 0x10, 0x42c80000); put(m, f + 8, 0x3f800000); state(0x9e, 0x42c80000);
  for (const [key, value] of [[0x9f,0],[0xa0,0],[0x9d,1]]) state(key, value); state(0x9b, get(m, f + 8));
  resetRendererSamplerDefaults(cache, {...runtime, scratchBase: f - 4});
  for (let stage = 0; stage < 8; stage++) {
    virtual(cache, 0x20, [stage, 0], r);
    for (const [key, value] of [[1,1],[2,2],[3,1],[4,1],[5,2],[6,1],[11,stage],[24,0]]) virtual(cache, 0x24, [stage, key, value], r);
    for (const [key, value] of [[1,3],[2,3],[3,3],[8,0],[9,0],[4,0]]) virtual(cache, 0x28, [stage, key, value], r);
  }
  virtual(cache, 0x24, [0, 1, 4], r); virtual(cache, 0x24, [0, 4, 4], r);
}
