import {nativeGlobalAddress} from './native-global-address.mjs';
import {createRawBody, initializeRawBody} from './raw-body-construction.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {createWormholeBody, initializeWormholeConstructionTables} from './wormhole-construction.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

//495280. Two material descriptors, with live loads between native stores.
export function initializeProjectileMaterialRecords(body, {memory: m}) {
  const material = ptr(m, 0x90b988) + ((m.readUInt16LE(ptr(m, 0x90b990) + 0x2e) + 63) << 4);
  put(m, body + 0x5c8, 0); m[body + 0x5c7] = 12; m[body + 0x5cb] = 0x9a;
  put(m, body + 0x5e4, get(m, material)); put(m, body + 0x600, get(m, material + 4)); word(m, body + 0x61c, m.readUInt16LE(material + 8)); const last = m.readUInt16LE(material + 10);
  put(m, body + 0x640, 0); word(m, body + 0x638, last); m[body + 0x63f] = 12; m[body + 0x643] = 0x9a;
  put(m, body + 0x65c, get(m, material)); put(m, body + 0x678, get(m, material + 4)); word(m, body + 0x694, m.readUInt16LE(material + 8)); word(m, body + 0x6b0, m.readUInt16LE(material + 10));
}

//46a380. Common projectile/trail state, retaining all other allocator bytes.
export function initializeProjectileState(body, index, runtime) {
  const {memory: m} = runtime; put(m, body + 0x5c0, 127); initializeProjectileMaterialRecords(body, runtime); const kind = get(m, body + 0x184);
  put(m, body + 0x108, get(m, body + 0x108) | 1); m[body + 0x18f] = index & 255;
  for (const offset of [0x198, 0x19c, 0x1a0, 0x1a4, 0x1a8, 0x1ac, 0x1b0, 0x180, 0x188]) put(m, body + offset, 0);
  word(m, body + 0x190, kind === 2 ? 88 : 71);
}

//46a420. Actual4 homing bodies,6 masters with3 satellites each,2 ground
//projectiles, then the wormhole body and its real47-record visual pool.
export function initializeProjectilePools(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36, pack = ptr(m, 0x90b98c), lookup = ptr(m, pack + 0x58), models = ptr(m, pack + 0x18);
  const firstModel = ptr(m, models + m.readInt16LE(lookup + 10) * 4), groundModel = ptr(m, models + m.readInt16LE(lookup + 8) * 4), child = {...runtime, scratchBase: frame - 4};
  put(m, frame + 0x1c, firstModel); put(m, frame + 0x20, groundModel);
  for (let i = 0; i < 4; i++) {
    const body = createRawBody(firstModel, 0x1c0c, 0x6bc, 0, {...runtime, scratchBase: frame - 12}); put(m, 0x9034a0 + i * 4, body); put(m, body + 0x148, 0x46b820); put(m, body + 0x184, 1);
    initializeRawBody(body, 0x5ec408, child); removeBodySpatial(body, runtime); initializeProjectileState(body, i, child);
  }
  let arena = ptr(m, nativeGlobalAddress(m, 0x902eec));
  for (let masterIndex = 0; masterIndex < 6; masterIndex++) {
    const old = ptr(m, 0x70dcf4), master = arena + (old & 0xfffffffc) >>> 0; put(m, 0x70dcf4, old + 512); m.fill(255, master, master + 384);
    put(m, master, 0x811); put(m, master + 4, 0); word(m, master + 8, 0); put(m, master + 12, 0);
    for (const offset of [0x118, 0x110, 0x148]) put(m, master + offset, 0); put(m, master + 0x11c, -1); m[master + 0x12f] = 255; m.fill(0, master + 0x16a, master + 0x172); word(m, master + 0x172, 0);
    const registryIndex = get(m, 0x6e6b44); if (registryIndex < 512) {put(m, 0x70e200 + registryIndex * 4, master); word(m, master + 0x10e, registryIndex); put(m, 0x6e6b44, registryIndex + 1);}
    put(m, 0x903480 + masterIndex * 4, master); initializeRawBody(master, 0x5ec408, child); removeBodySpatial(master, runtime);
    put(m, master + 0x108, get(m, master + 0x108) | 1); put(m, master + 0x148, 0x4302f0); put(m, master + 0x1ac, 127);
    for (let i = 0; i < 3; i++) {
      const body = createRawBody(firstModel, 0x8c0c, 0x6bc, 0, {...runtime, scratchBase: frame - 12}); put(m, 0x9034b0 + (masterIndex * 3 + i) * 4, body); put(m, body + 0x148, 0); put(m, body + 0x184, 2);
      initializeRawBody(body, 0x5ec408, child); arena = ptr(m, nativeGlobalAddress(m, 0x902eec)); removeBodySpatial(body, runtime); initializeProjectileState(body, i, child); put(m, master + 0x184 + i * 4, body); put(m, body + 0x194, master);
    }
    put(m, master + 0x190, -1); put(m, master + 0x194, 0);
  }
  for (let i = 0; i < 2; i++) {
    const body = createRawBody(groundModel, 0x1c0c, 0x6dc, 0, {...runtime, scratchBase: frame - 12}); put(m, 0x9034f8 + i * 4, body); put(m, body + 0x148, 0x44b6c0); put(m, body + 0x184, 0);
    initializeRawBody(body, 0x5ec408, child); removeBodySpatial(body, runtime); initializeProjectileState(body, i, child);
  }
  createWormholeBody(child); put(m, 0x903500, 0);
}

//Shared retained5ec408 body configuration and wormhole visual defaults.
export const initializeProjectileConstructionTables = initializeWormholeConstructionTables;
