import {abs32} from './fixed-integer.mjs';
import {nativeGlobalAddress} from './native-global-address.mjs';
import {queryRawTerrain} from './raw-terrain-query.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {orientWormholeBody} from './wormhole-visuals.mjs';
import {updateProjectileTrail} from './projectile-trails.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {registerRawBodySpatial} from './raw-body-construction.mjs';
import {transformWheelEffectOffset} from './wheel-effects.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

//430780. Two real terrain rays reuse one output slot. The first hit flag and
//height survive the second query; the second ray is displaced by half velocity.
export function updateProjectileMasterGroundVelocity(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 140, query = frame + 0x40, output = frame + 0x18;
  put(m, frame + 0x58, 0x5000);
  let x = get(m, body + 0x34) >> 8, z = get(m, body + 0x3c) >> 8;
  put(m, frame + 0x4c, get(m, body + 0x38) >> 8); put(m, frame + 0x48, x); put(m, frame + 0x50, z); put(m, frame + 0x54, 0); put(m, frame + 0x5c, 0); put(m, frame + 0x80, 0);
  let height = queryRawTerrain(body, query, output, 65536, {...runtime, scratchBase: frame - 12}), hits = get(m, output + 28) ? 1 : 0;
  const first = height + ((height >> 2) - 50000) | 0; put(m, frame + 0x14, first);
  x = x + (get(m, body + 0x68) >> 9) | 0; z = z + (get(m, body + 0x70) >> 9) | 0; put(m, frame + 0x48, x); put(m, frame + 0x50, z);
  height = queryRawTerrain(body, query, output, 65536, {...runtime, scratchBase: frame - 20}); if (get(m, output + 28)) hits |= 2;
  height = height + ((height >> 2) - 50000) | 0;
  if (!hits) put(m, body + 0x44, get(m, body + 0x44) + 32768);
  else if (hits === 1) put(m, body + 0x44, get(m, body + 0x44) + (get(m, frame + 0x14) << 3));
  else if (hits === 2) put(m, body + 0x44, get(m, body + 0x44) + (height << 3));
  else put(m, body + 0x44, ((height << 1) - get(m, frame + 0x14)) << 3);
}

//42fce0. All three satellites share one master update per live frame clock.
//The phase WORD's high byte is explicitly cleared after its add16.
export function updateSatelliteMaster(satellite, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20, master = ptr(m, satellite + 0x194), clock = get(m, 0x90a548);
  if (get(m, master + 0x190) === clock) return;
  put(m, master + 0x190, clock); const state = get(m, master + 0x194);
  if (state === 2) {
    word(m, master + 0x1a8, m.readUInt16LE(master + 0x1a8) + 16); put(m, master + 0x198, get(m, master + 0x198) + 1); m[master + 0x1a9] = 0;
    let radius = m.readInt16LE(master + 0x1aa); if (radius > 128) {radius = radius - 10 << 16 >> 16; word(m, master + 0x1aa, radius); if (radius < 128) word(m, master + 0x1aa, 128);}
    const baseZ = get(m, master + 0x1a4); put(m, frame + 0x10, baseZ); let z = get(m, master + 0x48), x = get(m, master + 0x40);
    if ((abs32(x) | abs32(z)) > 4096) {const damp = value => (value >> 1) + ((value >> 4) + (value >> 3) + (value >> 2) | 0) | 0; x = damp(x); z = damp(z);}
    put(m, master + 0x40, get(m, master + 0x19c) + x); put(m, master + 0x48, get(m, frame + 0x10) + z);
    updateProjectileMasterGroundVelocity(master, runtime); return;
  }
  if (state !== 1) return;
  put(m, master + 0x198, get(m, master + 0x198) - 1);
  if (!get(m, master + 0x198)) {
    const emit = (code, position, args) => emitNativeEffect(code, position, args, {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
    put(m, master + 0x1ac, emit(30, master + 0x34, [master + 0x68, 2048, 16383, 9, satellite, 0, 0]));
    let owner = ptr(m, master + 0x180); emit(28, owner + 0x34, [0, 1200, 16000, 6, 0, 0, m[owner + 0x6b4] === 1 ? 1 : 0]); owner = ptr(m, master + 0x180);
    if (m[owner + 0x70b] && m[owner + 0x71e] <= 10) {word(m, owner + 0x71e, 0x10a); word(m, owner + 0x71a, 255); m[owner + 0x71d] = 64;}
    put(m, master + 0x194, 2);
  }
  word(m, master + 0x1aa, m.readUInt16LE(0x5706f8 + get(m, master + 0x198) * 2));
  updateProjectileMasterGroundVelocity(master, runtime);
}

//42f950. Actual shared-master orbit and three-body retirement, retaining the
//native partially initialized packed transform scratch and live pointer table.
export function updateSatelliteProjectile(satellite, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36, master = ptr(m, satellite + 0x194), child = {...runtime, scratchBase: frame - 4};
  put(m, frame + 0x20, master); updateSatelliteMaster(satellite, child);
  put(m, satellite + 0x180, get(m, master + 0x198)); const state = get(m, master + 0x194); put(m, satellite + 0x188, state);
  if (!state) return;
  if (state === 16) {
    m[satellite + 0x18e] = m[satellite + 0x18e] - 1 & 255; word(m, satellite + 0x18c, m.readUInt16LE(satellite + 0x18c) + 1); if (m.readUInt16LE(satellite + 0x18c) === 32) word(m, satellite + 0x18c, 0);
    if (m.readInt8(satellite + 0x18e) < 2) put(m, satellite + 0x188, 0);
    if (![0x184, 0x188, 0x18c].some(offset => get(m, ptr(m, master + offset) + 0x188))) {m[0x903501] = m[0x903501] - 1 & 255; put(m, master + 0x194, 0);} return;
  }
  if (state === 1 || state === 2) {
    for (let j = 0; j < 3; j++) put(m, frame + 0x14 + j * 4, m.readInt16LE(master + 0x6a + j * 4)); orientWormholeBody(frame + 0x14, master + 0xc4, child);
    for (let j = 0; j < 3; j++) {const body = ptr(m, master + 0x184 + j * 4); for (let k = 0; k < 4; k++) put(m, body + 0xc4 + k * 4, get(m, master + 0xc4 + k * 4)); word(m, body + 0xd4, m.readUInt16LE(master + 0xd4));}
    const index = m[satellite + 0x18f], phase = get(m, satellite + 0x188) === 2 ? (Math.imul(index, 85) + 64 + m.readInt16LE(master + 0x1a8)) & 255 : index === 1 ? 0x95 : index === 2 ? 0xef : 0x40;
    for (let j = 0; j < 5; j++) put(m, 0x91d360 + j * 4, get(m, master + 0xc4 + j * 4)); const factor = m.readFloatLE(0x5dc5f4);
    for (let j = 0; j < 9; j++) {const value = Math.fround(m.readInt16LE(0x91d360 + j * 2)); m.writeFloatLE(value, frame + 0x14); m.writeFloatLE(Math.fround(value * factor), nativeGlobalAddress(m,0x91cdc0 + Math.floor(j / 3) * 16 + j % 3 * 4));}
    word(m, frame + 0x14, m.readUInt16LE(0x5ed0b0 + phase * 2)); word(m, frame + 0x16, m.readUInt16LE(0x5ed030 + phase * 2)); word(m, frame + 0x18, 0); put(m, 0x91d3e4, get(m, frame + 0x14)); put(m, 0x91d3e8, get(m, frame + 0x18)); transformWheelEffectOffset(runtime);
    const point = [0, 4, 8].map(offset => m.readInt16LE(0x91d448 + offset)); removeBodySpatial(satellite, runtime);
    const liveMaster = ptr(m, frame + 0x20), radius = m.readInt16LE(liveMaster + 0x1aa);
    for (let j = 0; j < 3; j++) put(m, satellite + 0x34 + j * 4, Math.imul(point[j], radius) + get(m, liveMaster + 0x34 + j * 4)); registerRawBodySpatial(satellite, runtime);
  } else for (const offset of [0, 4, 8]) put(m, satellite + 0x34 + offset, get(m, master + 0x34 + offset));
  updateProjectileTrail(satellite, 1, runtime);
}
