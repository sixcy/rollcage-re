import {nativeGlobalAddress} from './native-global-address.mjs';
import {initializeRawShapePools} from './world-physics-pools.mjs';
import {initializeTerrainPointAnimation} from './terrain-point-animation.mjs';
import {initializeTrackDeformation} from './track-deformation.mjs';
import {initializeDynamicLightStorage, initializeAuthoredDynamicLights} from './dynamic-light-state.mjs';
import {initializeWorldFragments} from './world-fragment-registry.mjs';
import {initializeWorldPickups} from './pickup-world-construction.mjs';
import {initializeProjectilePools} from './projectile-construction.mjs';
import {initializeVehicleContactColorTopology, initializeVehicleContactColorController} from './vehicle-contact-colors.mjs';
import {initializePeriodicBody} from './periodic-body-spawn.mjs';
import {initializeRawBodyDebrisPool, initializeRawParticlePools} from './particle-pools.mjs';
import {initializeProceduralTextureStorage, initializeProceduralTexturePalette, updateProceduralTexture} from './procedural-texture.mjs';
import {readRendererViewportExtent} from './renderer-viewports.mjs';
import {updateCameraProjection, updateCameraProjectionRatios} from './camera-projection.mjs';
import {constructVehicle} from './vehicle-construction.mjs';
import {constructCameraController} from './camera-construction.mjs';
import {initializeVehicleAutonomousState} from './vehicle-autonomous-init.mjs';
import {initializeVehicleOverlayGrids} from './vehicle-overlay-grid.mjs';
import {initializeWeather} from './weather-initialization.mjs';
import {initializeModelContactFragments} from './model-contact-effects.mjs';
import {initializeRaceInputLatches, initializeRaceQuadStorage, initializeRacePolygonStorage, initializeVehicleTrailStorage, initializeVehicleExecutionModes, initializeRacePhasePresentation, initializeRacePairedStripStorage, initializeRaceRadialStorage, applyRaceLightingTint, initializeRaceContactPrimitiveStorage} from './race-startup-storage.mjs';
import {initializeModelVertexNormals} from './model-vertex-normals.mjs';
import {initializeRaceViewStorage} from './race-view-initialization.mjs';
import {selectRaceInputCalibration, readRaceInputButtonMask} from './race-input-bindings.mjs';
import {initializeRaceTextures} from './race-textures.mjs';
import {discoverGameRootName} from './root-name-discovery.mjs';
import {initializeLocalizedRaceMessages} from './localized-startup.mjs';
import {initializeRaceViewports} from './race-viewports.mjs';
import {initializeRaceHudLayout} from './race-hud-layout.mjs';
import {initializeNetworkStartupText} from './race-startup-text.mjs';
import {initializeRaceObjectList} from './race-object-startup.mjs';
import {loadRuntimeRaceTrack} from './track-runtime-loading.mjs';
import {initializeRaceAudio} from './game-audio-samples.mjs';

const f32 = Math.fround;
const trunc32 = v => Number.isFinite(v) && v >= -2147483648 && v < 2147483648 ? Math.trunc(v) | 0 : -2147483648;

//47ea40. The complete race initializer's owned writes, order, captured/live
//roots and argument production. Missing game callees and input virtuals are
//explicit reached contracts; binding this parent does not close race startup.
//scratchBase is native entry ESP; the saved-register/local frame is44 bytes.
export function initializeRace(runtime) {
  const {memory: m, scratchBase, handlers = {}} = runtime;
  const get = p => m.readInt32LE(p), ptr = p => m.readUInt32LE(p);
  const put = (p, v) => m.writeInt32LE(v | 0, p), word = (p, v) => m.writeUInt16LE(v & 65535, p);
  const frame = scratchBase - 44, child = {...runtime, scratchBase: frame - 4};
  let heapAllocator = 0, objectList = 0;
  const allocate = size => {
    const service = runtime.allocate ?? handlers.allocate;
    if (typeof service !== 'function') throw Error('Race startup requires CRT allocate service.');
    const result = service(size, child), address = typeof result === 'number' ? result : result?.eax;
    if (!Number.isInteger(address)) throw Error('Race startup allocation requires EAX pointer.');
    if (address) m.fill(0, address >>> 0, (address >>> 0) + size);
    return address >>> 0;
  };
  const call = (id, ecx, edx, args = []) => {
    const context = {...child, scratchBase: frame - 4 - args.length * 4};
    if (handlers[`call${id}`]) return handlers[`call${id}`]({memory: m, ecx, edx, args, scratchBase: context.scratchBase});
    if (id === '42a600') return initializeRaceInputLatches(context);
    if (id === '495320') return initializeRaceQuadStorage(context);
    if (id === '43f130') return initializeRacePolygonStorage(context);
    if (id === '494060') return initializeVehicleTrailStorage(context);
    if (id === '42a670') return initializeVehicleExecutionModes(context);
    if (id === '47f8c0') return initializeRacePhasePresentation(context);
    if (id === '43f870') return initializeRacePairedStripStorage(context);
    if (id === '412bb0') return initializeRaceRadialStorage(context);
    if (id === '497790') return applyRaceLightingTint(context);
    if (id === '483a00') return initializeRaceContactPrimitiveStorage(context);
    if (id === '41e850') return initializeModelVertexNormals(ecx, context);
    if (id === '42f2f0') return initializeRaceViewStorage(context);
    if (id === '4797a0') return discoverGameRootName(context);
    if (id === '44c2b0') return loadRuntimeRaceTrack(ecx, {...context, entryRegisters: {...runtime.entryRegisters, EDI: heapAllocator, ESI: objectList}});
    if (id === '479420') return initializeLocalizedRaceMessages({...context, entryRegisters: {...runtime.entryRegisters, EDI: heapAllocator, ESI: objectList}});
    if (id === '450a90') return initializeRaceViewports({...context, entryRegisters: {...runtime.entryRegisters, EDI: heapAllocator, ESI: objectList}});
    if (id === '4428e0') return initializeRaceHudLayout({...context, entryRegisters: {...runtime.entryRegisters, EDI: heapAllocator, ESI: objectList}});
    if (id === '477000') return initializeNetworkStartupText(ecx, {...context, entryRegisters: {...runtime.entryRegisters, EDI: heapAllocator, ESI: objectList}});
    //The six contact-controller constructors advance ESI by6*8c and leave
    //the EDI loop counter at zero before this later initializer.
    if (id === '429d60') return initializeRaceObjectList({...context, entryRegisters: {...runtime.entryRegisters, EDI: 0, ESI: 0x8495e0 + 6 * 0x8c}});
    if (id === '485250') return initializeRaceAudio({...context, entryRegisters: {...runtime.entryRegisters, ESI: 0x57506e, EDI: get(frame + 0x10), EBX: get(frame + 0x10) ? get(frame + 0x18) : 0, EBP: get(frame + 0x10) ? get(frame + 0x14) : 0x909060}});
    if (id === '433d80') return selectRaceInputCalibration(ecx, edx, context);
    if (id === '45eac0') return readRaceInputButtonMask(ecx, context);
    if (id === '4900a0') return initializeRaceTextures({...context, entryRegisters: {...runtime.entryRegisters, EDI: heapAllocator, ESI: objectList}});
    if (id === '428100') return initializeRawShapePools({...context, allocate: runtime.allocate ?? handlers.allocate});
    if (id === '44a5c0') return initializeTerrainPointAnimation(context);
    if (id === '494c80') return initializeTrackDeformation(context);
    if (id === '48ef30') return initializeDynamicLightStorage(context);
    if (id === '44e220') return initializeAuthoredDynamicLights(context);
    if (id === '480760') return initializeWorldFragments({...context, allocate: runtime.allocate ?? handlers.allocate});
    if (id === '499760') return initializeProceduralTextureStorage(context);
    if (id === '499a90') return initializeProceduralTexturePalette(context);
    if (id === '499de0') return updateProceduralTexture(context);
    if (id === '47b580') return initializeWorldPickups(context);
    if (id === '46a420') return initializeProjectilePools(context);
    if (id === '4820f0') return initializeVehicleContactColorTopology(context);
    if (id === '482590') return initializeVehicleContactColorController(ecx, context);
    if (id === '469ec0') return initializePeriodicBody(context);
    if (id === '48e800') return initializeModelContactFragments(context);
    if (id === '4758d0') return initializeRawBodyDebrisPool({...context, allocate: runtime.allocate ?? handlers.allocate});
    if (id === '4356a0') return initializeRawParticlePools({...context, allocate: runtime.allocate ?? handlers.allocate});
    if (id === '40aeb0') return readRendererViewportExtent(true, context);
    if (id === '40ad40') return readRendererViewportExtent(false, context);
    if (id === '431dc0') return updateCameraProjection(ecx, context);
    if (id === '42f820') return updateCameraProjectionRatios(ecx, context);
    if (id === '41dbb0') return constructVehicle(ecx, edx, context);
    if (id === '416180') return constructCameraController(ecx, edx, args[0], context);
    if (id === '410060') return initializeVehicleAutonomousState(ecx, context);
    if (id === '487410') return initializeVehicleOverlayGrids(context);
    if (id === '496290') return initializeWeather(context);
    throw Error(`Race startup requires reached handler call${id}.`);
  };
  const number = (id, ecx, edx, args) => {
    const returned = call(id, ecx, edx, args), value = typeof returned === 'number' ? returned : returned?.eax;
    if (!Number.isInteger(value)) throw Error(`Race startup requires EAX from call${id}.`);
    return value | 0;
  };
  const inputCall = (owner, method, args) => {
    if (typeof handlers.inputManagerCall !== 'function') throw Error('Race startup requires inputManagerCall; game adapters remain to trace.');
    return handlers.inputManagerCall(owner, method, args, {...child, scratchBase: frame - 4 - args.length * 4});
  };
  let session = ptr(0x5ecb1c);
  if (!get(0x6e6c04)) m[session + 0x57b] = 0;
  m[session + 0x54c] = 0; put(0x909228, 0); put(0x909050, 0); m[session + 0x550] = 0;
  if (m[session + 0x551] === 4) m[session + 0x586] = 7;
  put(session + 0x580, 0);
  if (!m[ptr(0x5ecefc) + 0x2b] || m[session + 0x579] !== 12) m[session + 0x54e] = 0;
  put(0x5ec954, get(session + 0x618));
  if (m[session + 0x552] > m[session + 0x54d]) {
    m[session + 0x552] = m[session + 0x54d];
    if (m[session + 0x552] === 2) m[session + 0x552] = 1;
  }
  for (const offset of [0x1fb20, 0x3e3a4, 0x5cc28, 0x7b4ac, 0x99d30, 0xb85b4]) put(session + offset, 8);
  call('42f2f0'); put(0x90a548, 0); put(0x6e675c, 0); call('42a600');
  //47eb38 captures the allocator in callee-preserved EDI; ESI retains the
  //first64-byte allocation through4900a0, independently of later globals.
  heapAllocator = ptr(0x56e258);
  put(0x6e6ba0, 0); put(0x6e6b1c, 0); put(0x6e6b20, 0);
  objectList = allocate(64); put(0x91e77c, objectList); put(0x91e778, 0); put(0x91e744, 0);
  for (let offset = 0; offset < 800; offset += 16) word(0x920806 + offset, 255);
  put(0x9207e4, 0); put(nativeGlobalAddress(m, 0x82e904), 0); put(nativeGlobalAddress(m, 0x82e900), 0); call('428100');
  for (let offset = 0; offset < 0x238; offset += 8) word(0x90b686 + offset, 0);
  const rootName = number('4797a0');
  if (!number('44c2b0', rootName)) return 0;
  call('450a90'); call('44a5c0'); call('494c80');
  put(0x6fbae0, 0); put(0x6e65ac, 0x440640); call('48ef30'); call('44e220');
  for (const p of [nativeGlobalAddress(m, 0x810fe0), nativeGlobalAddress(m, 0x810ca0), nativeGlobalAddress(m, 0x810e40), nativeGlobalAddress(m, 0x810b00)]) put(p, 0);
  for (const [p, v] of [[nativeGlobalAddress(m, 0x811174), nativeGlobalAddress(m, 0x810fe0)], [nativeGlobalAddress(m, 0x810948), nativeGlobalAddress(m, 0x810ca0)], [nativeGlobalAddress(m, 0x810e34), nativeGlobalAddress(m, 0x810e40)], [nativeGlobalAddress(m, 0x810af4), nativeGlobalAddress(m, 0x810b00)]]) put(p, v);
  put(0x7130b8, 0); put(0x6fbae8, 0); call('480760'); call('4428e0'); call('4900a0');
  if (get(0x5ed02c) !== -1) {call('499760'); call('499a90'); call('499de0');}
  call('479420');
  const networkMode = m[ptr(0x5ecb1c) + 0x58c]; if (networkMode) call('477000', networkMode);
  put(nativeGlobalAddress(m, 0x9020a0), 0); put(nativeGlobalAddress(m, 0x9020a4), 0); put(nativeGlobalAddress(m, 0x9020a8), 0); call('495320'); call('47b580'); call('46a420');
  put(0x90cb80, 0); const history = allocate(0x800); put(0x90cb60, history);
  //Native REP STOSD is unconditional, including a null allocation result.
  for (let i = 0; i < 512; i++) put(history + i * 4, -1);
  put(nativeGlobalAddress(m, 0x811180), 0); word(0x90d974, 0x3cf); put(nativeGlobalAddress(m, 0x811184), 0); put(nativeGlobalAddress(m, 0x811188), 0); put(nativeGlobalAddress(m, 0x81118c), 0x10000); put(0x6e6704, 127);
  const pack = ptr(0x90b98c); put(0x713184, get(ptr(pack + 0x18) + m.readInt16LE(ptr(pack + 0x58) + 14) * 4));
  call('4820f0'); for (let i = 0; i < 6; i++) call('482590', 0x8495e0 + i * 0x8c);
  for (const id of ['469ec0', '48e800', '43f130', '4758d0', '412bb0', '43f870', '4356a0', '483a00', '429d60']) call(id);
  const auxiliary = ptr(0x90b990), materials = ptr(0x90b988);
  for (const index of [0x92, 0x93, 0x94, 0x95, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e]) {
    const p = materials + (m.readUInt16LE(auxiliary + 0x2e) + index) * 16;
    const first = m.readUInt16LE(p + 4), second = m.readUInt16LE(p + 8); word(p + 4, second); word(p + 8, first);
  }
  const height = number('40aeb0'); m.writeFloatLE(f32(m.readFloatLE(0x5dc774) / f32(height)), frame + 0x18);
  const width = number('40ad40'), aspect = f32(f32(width) * m.readFloatLE(frame + 0x18)), limit = m.readFloatLE(0x5dc7a0);
  let distance = 104;
  if (aspect > limit) distance = trunc32(f32(f32(limit / aspect) * m.readFloatLE(0x5dca1c))) & 65535;
  word(0x91d50a, distance); put(frame + 0x18, 104); m.writeFloatLE(104, nativeGlobalAddress(m, 0x91ceb0));
  call('431dc0', (distance << 16) >> 16); call('42f820', distance);
  for (let i = 0; i < 7; i++) m[nativeGlobalAddress(m, 0x810940) + i] = 0;
  const capturedCount = m[ptr(0x5ecb1c) + 0x54d]; put(frame + 0x10, 0); put(frame + 0x1c, capturedCount);
  if (capturedCount) for (let index = 0, configOffset = 0, control = 0x909060; ; index++, configOffset += 0x90, control += 0x4c) {
    const record = 0x909300 + index * 0x30c;
    put(frame + 0x18, configOffset); put(frame + 0x14, control);
    call('41dbb0', record, index);
    if (index < get(frame + 0x1c)) {
      put(record + 0x18, control); call('416180', index, ptr(record), [control]);
      const render = nativeGlobalAddress(m, 0x80b600) + Math.imul(get(0x6e6ba8), 0x690); put(frame + 0x20, render);
      put(ptr(record) + 0x69c, render); word(render + 0x3e, 63); m[render + 3] = 12;
      for (const offset of [0x60, 0x44, 0x28, 0xc]) put(render + offset, 0x412028f6);
      for (const offset of [0x5c, 0x40, 0x24, 8]) put(render + offset, 64);
      m[render + 7] = 0x9a;
      const texture = ptr(0x90b988) + (m.readUInt16LE(ptr(0x90b990) + 0x2e) + 0x40) * 16;
      const first = get(texture), second = get(texture + 4), third = m.readUInt16LE(texture + 8), fourth = m.readUInt16LE(texture + 10);
      put(frame + 0x24, third); put(frame + 0x28, fourth);
      for (let i = 0; i < 13; i++) {
        const p = render + 0xb4 + i * 120;
        put(p - 28, first); put(p, second); word(p + 28, third); word(p + 56, fourth); m[p - 57] = 12; m[p - 53] = 0x9a;
      }
      put(0x6e6ba8, get(0x6e6ba8) + 1);
    } else put(record + 0x18, 0x12345678);
    call('410060', record); m[record + 0x246] = 0; word(record + 0x244, 200); put(record + 0x260, 0);
    word(record + 0x25c, index <= 3 ? m[ptr(0x5ecefc) + configOffset + 0x1a1] : 255);
    put(record + 0x258, 0x32004000);
    if (!m[ptr(0x5ecb1c) + 0x58c] && index < 4) {
      put(frame + 0x28, 1023); m.writeFloatLE(1023, frame + 0x28);
      if (m.readFloatLE(ptr(0x5ecefc) + configOffset + 0x1a4) > 1023) m[record + 0x258] = number('433d80', index, m.readInt16LE(record + 0x25c)) & 255;
      const value = f32(m.readFloatLE(ptr(0x5ecefc) + configOffset + 0x1a4) * m.readFloatLE(0x5dc5e0)); m.writeFloatLE(value, frame + 0x28);
      const device = inputCall(ptr(0x714b54), 0x14, [m.readInt16LE(record + 0x25c), 3]);
      if (device) inputCall(device, 0x50, [value]);
    }
    const device = inputCall(ptr(0x714b54), 0x14, [m.readInt16LE(record + 0x25c), 3]);
    if (device) inputCall(device, 0x24, []);
    word(record + 0x25e, number('45eac0', index)); put(frame + 0x10, index + 1);
    put(frame + 0x14, control + 0x4c); put(frame + 0x18, configOffset + 0x90);
    if (index + 1 >= m[ptr(0x5ecb1c) + 0x54d]) break;
  }
  for (let p = 0x575060; p < 0x57506e; p += 2) {
    const current = ptr(0x90b98c), key = m.readUInt16LE(p), model = m.readInt16LE(ptr(current + 0x58) + key * 2);
    call('41e850', ptr(ptr(current + 0x18) + model * 4));
  }
  {const current = ptr(0x90b98c); call('41e850', ptr(ptr(current + 0x18) + m.readInt16LE(ptr(current + 0x58) + 16) * 4));}
  for (const id of ['487410', '494060', '496290', '485250', '42a670']) call(id);
  session = ptr(0x5ecb1c);
  if (m[session + 0x58c]) {
    const old = get(nativeGlobalAddress(m, 0x91ce90)), bit = (~(old >>> 1)) & 1;
    if (bit || get(0x91ff80) !== 14) {
      put(nativeGlobalAddress(m, 0x91ce90), old ^ ((bit * 2 ^ old) & 2));
      if (!bit) for (const p of [0x849482, 0x8494d6, 0x84952a, 0x84957e]) word(p, 0);
    }
  }
  put(0x6fbae0, 0); put(nativeGlobalAddress(m, 0x91ceb4), m[session + 0x58b]); call('47f8c0');
  put(0x6fbb14, 0); if (m[session + 0x555]) call('497790'); return 1;
}
