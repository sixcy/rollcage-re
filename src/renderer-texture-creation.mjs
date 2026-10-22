import constants from './renderer-texture-creation-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export function initializeRendererTextureCreationConstants(memory) {for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}
const compressed = value => [0x31545844, 0x33545844, 0x35545844].includes(value);
const device = (runtime, object, method, args) => {
  if (typeof runtime.services?.direct3DCall !== 'function') throw Error('Texture creation requires an explicit Direct3D COM service.');
  return runtime.services.direct3DCall(object, method, args, runtime) | 0;
};

//50f350, renderer virtual98: retain the texture-to-integer-slot association.
export function associateRendererTexture(manager, index, value, {memory: m}) {
  if ((index | 0) !== -1) put(m, ptr(m, ptr(m, manager + 0x890) + Math.imul(index, 4)), value);
}

//5207a0. Unsigned caps/dimension clamps and signed power-of-two search are
//intentionally distinct. The resource kind and six arguments are native DWORDs.
export function normalizeRendererTextureDimensions(manager, width, height, mode, kind, granularity, flags, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 16, caps = ptr(m, manager + 0x488);
  for (const [i, v] of [width, height, mode, kind, granularity, flags].entries()) put(m, s + 4 + i * 4, v);
  let limitW = ptr(m, caps + 0x45c), limitH = ptr(m, caps + 0x460), cl = mode & 255;
  if (cl !== 1) {
    limitW = Math.min(limitW, 0x1000); limitH = Math.min(limitH, 0x1000);
    if (cl === 0) {
      const w = Math.max(ptr(m, width), granularity >>> 0), h = Math.max(ptr(m, height), granularity >>> 0);
      put(m, width, w); cl = m[f + 0x1c]; put(m, height, h);
    }
  }
  const bits = get(m, caps + 0x440), noPow2 = ((bits >>> 1) & 1) === 0, conditional = !!(bits & 0x100) || noPow2;
  put(m, f + 0x1c, bits);
  const plain = get(m, f + 0x20) === 0 && ((m[f + 0x28] === 1 && noPow2) || (cl === 1 && conditional));
  const ceil = value => {for (let i = 0; i < 32; i++) {const power = 1 << i; if ((value | 0) <= power) return power;} return 0;};
  width = ptr(m, f + 0x14);
  limitW = Math.min(ptr(m, width), limitW); const heightBelowLimit = ptr(m, height) < limitH;
  if (!plain) limitW = ceil(limitW);
  put(m, width, limitW);
  //CMP height precedes the width store, but its CMOV memory operand is live
  //after that store. Shared width/height pointers therefore observe width.
  if (heightBelowLimit) limitH = ptr(m, height);
  if (!plain) limitH = ceil(limitH);
  put(m, height, limitH);
  if (m[f + 0x1c] & 0x20) {const size = Math.max(ptr(m, height), ptr(m, width)); put(m, height, size); put(m, width, size);}
}

//51fee0: signed minimum dimension, stopping at a compressed block (or pixel).
export function countRendererTextureMipLevels(width, height, resource, {memory: m}) {
  const minimum = compressed(get(m, resource + 0x444)) ? 4 : 1;
  let value = Math.min(width | 0, height | 0), count = 1;
  while (value > minimum) {value >>= 1; count++;} return count;
}

//511a30/510f60. The format preferences are original table bytes in mapped
//memory; the two actual adapter queries are Direct3D9 COM methods.
export function chooseRendererDepthFormat(manager, format, runtime) {
  const m = runtime.memory, delta = format - 20 >>> 0;
  let table = 0x6e1f20;
  if (delta <= 10) {
    const target = ptr(m, 0x510f9c + m[0x510fb0 + delta] * 4), bits = new Map([[0x510f72, 24], [0x510f7c, 32], [0x510f86, 16], [0x510f90, 8], [0x510f95, 0]]).get(target);
    if (bits === undefined) throw Error('Unmapped native texture-format branch.');
    if (bits > 16) table = 0x6e1f40;
  }
  for (let i = 0; i < 8; i++) {
    let caps = ptr(m, manager + 0x488), object = ptr(m, manager + 0x368), candidate = get(m, table + i * 4);
    if (device(runtime, object, 0x28, [object, get(m, caps), get(m, caps + 0x534), format, 2, 1, candidate]) !== 0) continue;
    caps = ptr(m, manager + 0x488); object = ptr(m, manager + 0x368); candidate = get(m, table + i * 4);
    if (device(runtime, object, 0x30, [object, get(m, caps), get(m, caps + 0x534), get(m, manager + 0x430), format, candidate]) === 0) return get(m, table + i * 4);
  }
  return 0;
}

//520660. Only Direct3D resource allocation itself is a platform boundary.
export function allocateRendererTextureSurface(resource, secondary, object, caps, runtime) {
  const m = runtime.memory;
  if (secondary === 1 && m[resource + 0x45d] === 1) {put(m, resource + 0x43c, get(m, resource + 0x438)); return 1;}
  const output = resource + (secondary === 0 ? 0x438 : 0x43c);
  let usage = m[resource + 0x45c] === 1 && (ptr(m, caps + 12) >>> 29 & 1) ? 0x200 : 0;
  const pool = secondary !== 0 ? 0 : m[resource + 0x45d] === 1 ? 1 : 2;
  if (get(m, resource + 0x458) !== 0) usage |= 1;
  const type = get(m, resource + 0x10), common = [get(m, resource + 0x428), usage, get(m, resource + 0x444), pool, output, 0];
  const args = type === 1 ? [object, get(m, resource + 0x420), ...common] : type === 2 ? [object, get(m, resource + 0x420), get(m, resource + 0x424), get(m, resource + 0x44c), ...common] : [object, get(m, resource + 0x420), get(m, resource + 0x424), ...common];
  const result = device(runtime, object, type === 1 ? 0x64 : type === 2 ? 0x60 : 0x5c, args);
  if (result !== 0) {put(m, output, 0); return 0;}
  if ([2, 4].includes(get(m, resource + 0x458))) device(runtime, object, 0x74, [object, get(m, resource + 0x420), get(m, resource + 0x424), get(m, resource + 0x448), 0, 0, 1, resource + 0x440, 0]);
  return 1;
}

//526a90: evict this resource from every live device texture binding cache.
export function unbindRendererTexture(owner, texture, runtime) {
  const m = runtime.memory;
  let index = 0;
  while (index < ((get(m, owner + 4) - get(m, owner)) >> 2) >>> 0) {
    const item = ptr(m, ptr(m, owner) + index * 4);
    let binding = 0;
    const count = () => Math.trunc((get(m, item + 0x70) - get(m, item + 0x6c) | 0) / 44) >>> 0;
    while (binding < count()) {
      const row = ptr(m, item + 0x6c) + Math.imul(binding, 44), object = ptr(m, item);
      if (get(m, row + 0x24) === (texture | 0)) {
        device(runtime, object, 0xd0, [object, get(m, row + 0x20), 0]); put(m, row + 0x24, 0); put(m, row + 0x28, 0);
      }
      binding++;
    }
    index++;
  }
}

//50eed0/50f280/51ef10: secondary surface, depth surface, then primary texture.
export function releaseRendererTextureResource(resource, runtime) {
  const m = runtime.memory;
  const release = offset => {
    const texture = ptr(m, resource + offset);
    if (texture) {
      if (offset !== 0x440) {const owner = ptr(m, ptr(m, 0x714ae8) + 0x360); if (owner) unbindRendererTexture(owner, texture, runtime);}
      const live = ptr(m, resource + offset); device(runtime, live, 8, [live]); put(m, resource + offset, 0);
    }
  };
  if (get(m, resource + 0x438) === get(m, resource + 0x43c)) put(m, resource + 0x43c, 0); else release(0x43c);
  release(0x440); release(0x438);
}

//520380. Arguments retain the original ten-DWORD ABI, with the native local
//slots published because dimensional normalization consumes their pointers.
export function createRendererTextureResource(manager, resource, width, height, type, shift, mipCount, mode, usage, kind, flags, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 16;
  for (const [i, value] of [resource, width, height, type, shift, mipCount, mode, usage, kind, flags].entries()) put(m, s + 4 + i * 4, value);
  put(m, resource + 0x10, kind);
  if (get(m, resource + 0x444) === 0 && (mode >>> 0) <= 4) {
    if (mode === 1 || mode === 2) {put(m, resource + 0x444, get(m, manager + 0x500)); put(m, resource + 0x448, get(m, manager + 0x504));}
    else {
      const format = get(m, ptr(m, manager + 0x43c + Math.imul(get(m, resource + 0x454), 4))); put(m, resource + 0x444, format);
      if (mode !== 0) put(m, resource + 0x448, chooseRendererDepthFormat(manager, format, {...runtime, scratchBase: f - 8}));
    }
  }
  const shiftCount = get(m, f + 0x24) & 31;
  if (mode === 0) {
    const minimum = compressed(get(m, resource + 0x444)) ? 4 : 1;
    if ((ptr(m, f + 0x18) >>> shiftCount) < minimum || (ptr(m, f + 0x1c) >>> shiftCount) < minimum) return 0;
  } else m[f + 0x38] = 0;
  const liveKind = get(m, f + 0x34), mask = liveKind === 0 ? 0x4000 : liveKind === 1 ? 0x10000 : liveKind === 2 ? 0x8000 : -1;
  put(m, f + 0x24, ptr(m, f + 0x18) >>> shiftCount); put(m, f + 0x34, ptr(m, f + 0x1c) >>> shiftCount);
  normalizeRendererTextureDimensions(manager, f + 0x24, f + 0x34, mode !== 0 ? 1 : 0, liveKind, compressed(get(m, resource + 0x444)) ? 4 : 1, get(m, f + 0x38), {...runtime, scratchBase: f - 28});
  let levels = mode === 0 && (get(m, ptr(m, manager + 0x488) + 0x440) & mask) ? ptr(m, f + 0x28) : 1;
  const h = get(m, f + 0x34);
  if (levels !== 0) {const maximum = countRendererTextureMipLevels(get(m, f + 0x24), h, resource, runtime); if ((levels >>> 0) >= (maximum >>> 0)) levels = countRendererTextureMipLevels(get(m, f + 0x24), h, resource, runtime);}
  else levels = countRendererTextureMipLevels(get(m, f + 0x24), h, resource, runtime);
  put(m, resource + 0x458, get(m, f + 0x2c)); put(m, resource + 0x420, get(m, f + 0x24)); put(m, resource + 0x44c, get(m, f + 0x20)); put(m, resource + 0x424, h); put(m, resource + 0x428, levels);
  //51f690, the resource's actual virtual14, selects the initial mip/face.
  put(m, resource + 0x434, 0); put(m, resource + 0x450, -1);
  const flag = m[f + 0x38]; put(m, resource + 0x42c, get(m, f + 0x30)); m[resource + 0x45c] = flag; m[resource + 0x45d] = flag === 0 && get(m, f + 0x2c) === 0 ? 1 : 0;
  if (get(m, resource + 0x10) === 1) {const w = get(m, resource + 0x420), heightNow = get(m, resource + 0x424); if (w > heightNow) put(m, resource + 0x424, w); else if (w < heightNow) put(m, resource + 0x420, heightNow);}
  const allocate = secondary => allocateRendererTextureSurface(resource, secondary, get(m, manager + 0x36c), ptr(m, manager + 0x488) + 0x404, {...runtime, scratchBase: f - 16});
  if (get(m, resource + 0x458) === 0 && !(flag !== 0 && (get(m, ptr(m, manager + 0x488) + 0x410) & 0x20000000)) && !allocate(0)) {
    const liveManager = ptr(m, 0x714ae8), index = get(m, resource + 8);
    if (index !== -1) releaseRendererTextureResource(ptr(m, ptr(m, liveManager + 0x48c) + Math.imul(index, 4)), {...runtime, scratchBase: f - 4}); return 0;
  }
  if (!get(m, resource + 0x43c)) allocate(1);
  return 1;
}

//520dc0, renderer virtual80. Read the mode/output after the association store,
//whose destination may alias either argument in an explicitly mapped caller.
export function createRendererViewportTexture(manager, index, mode, width, height, mipCount, textureMode, flags, output, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 20;
  for (const [i, value] of [index, mode, width, height, mipCount, textureMode, flags, output].entries()) put(m, s + 4 + i * 4, value);
  const resource = ptr(m, ptr(m, manager + 0x48c) + Math.imul(index, 4)), kind = get(m, resource + 0x10); put(m, f + 0x10, kind);
  associateRendererTexture(manager, index, index, runtime);
  output = ptr(m, f + 0x34); mode = get(m, f + 0x1c); m[output] = 0;
  if (![0, 1, 2].includes(mode)) return 0;
  put(m, resource + 0x454, [10, 12, 2][mode]);
  const result = createRendererTextureResource(manager, resource, get(m, f + 0x20), get(m, f + 0x24), get(m, f + 0x10) === 1 ? 6 : 1, 0, get(m, f + 0x28), get(m, f + 0x2c), [0x20, 0x40, 8][mode], get(m, f + 0x10), get(m, f + 0x30), {...runtime, scratchBase: f - 44});
  if (!result) return 0;
  const format = get(m, resource + 0x444); m[output] = mode === 0 ? [21, 22].includes(format) ? 1 : 0 : format === (mode === 1 ? 0x71 : 0x29) ? 1 : 0; return 1;
}
