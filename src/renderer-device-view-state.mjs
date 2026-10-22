import {obtainRendererIdentity, initializeRendererSceneConstants} from './renderer-scene-nodes.mjs';
import constants from './renderer-device-view-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), copy16 = (m, output, input) => Buffer.from(m.subarray(input, input + 16)).copy(m, output);
export function initializeRendererDeviceViewConstants(memory) {initializeRendererSceneConstants(memory); for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//50ef40. Actual seven identity matrices, scalar/vector fields and dirty flag.
export function constructRendererTransformState(object, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20;
  for (const offset of [0x100, 0x104, 0x108, 0x10c, 0x110, 0x114, 0x118, 0x11c]) put(m, object + offset, 0);
  for (const base of [0, 0x40, 0x80, 0xc0, 0x128, 0x168, 0x1a8]) {const identity = obtainRendererIdentity(runtime); for (let block = 0; block < 4; block++) copy16(m, object + base + block * 16, identity + block * 16);}
  for (const offset of [0, 4, 8, 12]) put(m, frame + 4 + offset, 0); for (const offset of [0, 4, 8, 12]) put(m, object + 0x100 + offset, get(m, frame + 4 + offset)); m[object + 0x1e8] = 1; return object;
}

//511380. Game-owned D3D9VisualManager adapter: retain input-copy ordering,
//actual D3DVIEWPORT9 request, unsigned integer conversion and screen matrix.
//The Direct3D device call is the platform boundary after this real adapter.
export function setRendererViewportRectangle(device, rectangle, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 32, f = Math.fround, read = p => m.readFloatLE(p); put(m, scratchBase + 4, rectangle);
  for (const offset of [0, 4, 8, 12, 16, 20]) put(m, frame + 8 + offset, 0); put(m, frame + 28, 0x3f800000); copy16(m, device + 0x4ec, rectangle);
  for (const offset of [0, 4, 8, 12]) put(m, frame + 8 + offset, get(m, rectangle + offset));
  if (typeof runtime.services?.d3d9Call !== 'function') throw Error('Renderer viewport rectangle requires IDirect3DDevice9::SetViewport.'); runtime.services.d3d9Call(ptr(m, device + 0x36c), 0xbc, [frame + 8], runtime);
  for (let i = 0; i < 4; i++) m.writeFloatLE(f(ptr(m, frame + 8 + i * 4)), device + 0x284 + i * 4);
  m.fill(0, device + 0x234, device + 0x274); m.writeFloatLE(f(read(device + 0x28c) * read(0x5dc6ec)), device + 0x234); m.writeFloatLE(f(read(device + 0x290) * read(0x5dcaf0)), device + 0x248); put(m, device + 0x25c, 0x3f800000); put(m, device + 0x270, 0x3f800000); m.writeFloatLE(f(read(device + 0x234) + read(device + 0x284)), device + 0x264); m.writeFloatLE(f(read(device + 0x288) - read(device + 0x248)), device + 0x268);
}
