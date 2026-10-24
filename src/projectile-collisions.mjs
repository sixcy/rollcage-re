import {nativeGlobalAddress} from './native-global-address.mjs';
import {applyRawActiveVehicleEffect} from './vehicle-collision-filter.mjs';
import {appendBodyPositionEffect, emitBodyEffectBurst, removeBodySpatial, unregisterPhysicalBody} from './body-retirement.mjs';
import {emitRawEffectParticles, emitRawBodyDebris, activateRawBodyTrail, alterRawTerrainBrightness} from './body-retirement-effects.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {stopVehicleSound} from './vehicle-sound-controls.mjs';
import {updateProjectileTrail} from './projectile-trails.mjs';
import {publishProjectileImpactNotification, sendProjectileSessionScores} from './projectile-notifications.mjs';
import {isRaceNetworkClient} from './race-phase-state.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//46bcd0. Shielded vehicles consume actual482730; ordinary hits add a wrapped
//angular kick,particles/debris/position effects, then zero velocity/momentum.
export function applyProjectileVehicleImpact(body, event, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 44, state = ptr(m, body + 0x6bc);
  if ((get(m, body) & 511) !== 3) return;
  if (state !== 0xffffffff && m[state]) {
    for (const offset of [0, 4, 8]) put(m, frame + 0x20 + offset, 256);
    applyRawActiveVehicleEffect(body, frame + 0x20, 384, {...runtime, scratchBase: frame - 8}); return;
  }
  let seed = Math.imul(get(m, 0x5ec954), 0x41a7) & 0x7fffffff;
  let x = get(m, body + 0x34), z = get(m, body + 0x3c), y = get(m, body + 0x38); put(m, frame + 0x20, 0); put(m, 0x5ec954, seed); y = y + 0x320000 | 0;
  let value = Math.imul(seed >>> 15, 32767) >>> 16; put(m, frame + 0x18, y); put(m, frame + 0x24, -0x400000); put(m, frame + 0x28, 0);
  put(m, body + 0x80, get(m, body + 0x80) + (((value & 7) - 4) << 20)); value >>= 3; put(m, body + 0x84, get(m, body + 0x84) + (((value & 7) - 4) << 20)); value >>= 3; put(m, body + 0x88, get(m, body + 0x88) + (((value & 7) - 4) << 20));
  x = x + (get(m, event + 0x38) << 4) | 0; z = z + (get(m, event + 0x40) << 4) | 0; put(m, frame + 0x14, x); put(m, frame + 0x1c, z);
  const index = get(m, 0x9153dc), position = 0x919020 + Math.imul(index, 12), next = index + 1 | 0; put(m, position, x); put(m, position + 4, y); put(m, position + 8, z); put(m, 0x9153dc, (next >>> 0) < 24 ? next : 0);
  emitNativeEffect(11, position, [0, 1024, 12000, 6, next, 0, 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
  appendBodyPositionEffect(frame + 0x14, 2, runtime); emitRawEffectParticles(frame + 0x14, frame + 0x20, 2, get(m, 0x919000), 1, runtime);
  put(m, nativeGlobalAddress(m,0x91cd90), 1); put(m, nativeGlobalAddress(m,0x91cd80), x); put(m, nativeGlobalAddress(m,0x91cd84), y); put(m, nativeGlobalAddress(m,0x91cd88), z); put(m, nativeGlobalAddress(m,0x91cd8c), 12); emitRawBodyDebris(frame + 0x14, frame + 0x20, 2, runtime);
  for (const offset of [0x68, 0x6c, 0x70, 0x40, 0x44, 0x48]) put(m, body + offset, 0);
}

function collisionTeardown(body, frame, runtime) {
  const {memory: m} = runtime; updateProjectileTrail(body, 1, {...runtime, scratchBase: frame - 4}); const mask = get(m, body + 0x184) === 0 ? 0xd1a6b : 0x51a6b, y = get(m, body + 0x38) + 0x280000 | 0;
  put(m, frame + 0x24, 0); put(m, frame + 0x18, get(m, body + 0x34)); const z = get(m, body + 0x3c); put(m, frame + 0x1c, y); put(m, frame + 0x20, z); put(m, frame + 0x28, -0x400000); put(m, frame + 0x2c, 0);
  emitBodyEffectBurst(frame + 0x18, frame + 0x24, 3, mask, 11, {...runtime, scratchBase: frame - 16}); removeBodySpatial(body, runtime); unregisterPhysicalBody(body, runtime);
  const channel = get(m, body + 0x5c0); put(m, body + 0x180, 0); put(m, body + 0x188, 16); if (channel !== 127) {stopVehicleSound(channel, runtime.soundRuntime ?? runtime); put(m, body + 0x5c0, 127);}
}
function prepareCallback(body, other, event, runtime, allocation) {
  const {memory: m, scratchBase} = runtime; put(m, scratchBase + 4, body); put(m, scratchBase + 8, other); put(m, scratchBase + 12, event); put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - allocation));
  const frame = scratchBase - allocation - 12; put(m, frame + 0x10, body); return frame;
}
function impactMessage(body, other, kind, frame, runtime) {
  const {memory: m} = runtime, owner = ptr(m, body + 0x194);
  if (!owner || m[other + 0x718] === 8) return;
  const ownerId = m.readUInt16LE(owner + 0x65e), targetId = m.readUInt16LE(other + 0x65e); put(m, frame + 0x14, ownerId); const flags = get(m, 0x6eafe0);
  if ((flags & 1) && (flags & 6) && (flags & 64)) publishProjectileImpactNotification(kind, targetId, ownerId, frame, runtime);
}

//46b820 stack ABI [projectile,other,event]. Detonation precedes the hit; any
//non-null other finally marks the live owner, including nonvehicle objects.
export function filterHomingProjectileCollision(body, other, event, runtime) {
  const {memory: m} = runtime, frame = prepareCallback(body, other, event, runtime, 236); collisionTeardown(body, frame, runtime);
  if (other) {
    if ((get(m, other) & 511) === 3) {applyProjectileVehicleImpact(other, event, {...runtime, scratchBase: frame - 4}); impactMessage(body, other, 1, frame, runtime);}
    const owner = ptr(m, body + 0x194); put(m, owner, get(m, owner) | 0x20000);
  }
  return 0;
}

//44b6c0 uses the same three-stack-argument ABI, but applies hit/message before
//detonation and does not perform46b820's final owner-flag write.
export function filterGroundProjectileCollision(body, other, event, runtime) {
  const {memory: m} = runtime, frame = prepareCallback(body, other, event, runtime, 236);
  if (other) {applyProjectileVehicleImpact(other, event, {...runtime, scratchBase: frame - 4}); if ((get(m, other) & 511) === 3) impactMessage(body, other, 0, frame, runtime);}
  collisionTeardown(body, frame, runtime); return 0;
}

//4302f0. Master hits remember two identities and score/send feedback without
//retiring; a normal world hit tears down the master and all three satellites.
export function filterSatelliteMasterCollision(body, other, event, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 232, child = {...runtime, scratchBase: frame - 4};
  put(m, scratchBase + 4, body); put(m, scratchBase + 8, other); put(m, scratchBase + 12, event); put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - 220));
  if (other) {
    const previous = ptr(m, body + 0x1b0); if (other === previous || other === ptr(m, body + 0x1b4)) return 0;
    put(m, body + 0x1b4, previous); put(m, body + 0x1b0, other); applyProjectileVehicleImpact(other, event, child);
    let owner = ptr(m, body + 0x180); put(m, owner, get(m, owner) | 0x20000); let session = ptr(m, 0x5ecb1c), flags = get(m, 0x6eafe0);
    if ((m[session + 0x551] === 3 || m[session + 0x551] === 8) && (get(m, other) & 511) === 3) {
      if ((flags & 1) && isRaceNetworkClient(runtime) === 1 && (flags & 64)) {const id = m.readUInt16LE(owner + 0x65e); m[session + 8 + id] = m[session + 8 + id] + 1 & 255; sendProjectileSessionScores(session + 8, child); session = ptr(m, 0x5ecb1c); flags = get(m, 0x6eafe0);}
      else if (!(flags & 1) || !(flags & 128)) {const id = m.readUInt16LE(owner + 0x65e); m[session + 8 + id] = m[session + 8 + id] + 1 & 255;}
    }
    owner = ptr(m, body + 0x180);
    if ((get(m, other) & 511) === 3 && owner && m[other + 0x718] !== 8 && (flags & 1) && (flags & 6) && (flags & 64)) {const ownerId = m.readUInt16LE(owner + 0x65e), targetId = m.readUInt16LE(other + 0x65e); put(m, frame + 0x10, ownerId); publishProjectileImpactNotification(2, targetId, ownerId, frame, runtime);}
    return 0;
  }
  if (event && get(m, event + 0x44) === -4) return 0;
  put(m, frame + 0x14, 0); put(m, frame + 0x18, -0x400000); put(m, frame + 0x1c, 0);
  const index = get(m, 0x9153dc), next = index + 1 | 0, position = 0x919020 + Math.imul(index, 12); put(m, 0x9153dc, (next >>> 0) < 24 ? next : 0); for (const offset of [0, 4, 8]) put(m, position + offset, get(m, body + 0x34 + offset));
  emitNativeEffect(11, position, [0, 1024, 12000, 6, next, 0, 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
  emitRawEffectParticles(body + 0x34, frame + 0x14, 1, get(m, 0x9153e0), 8, runtime); appendBodyPositionEffect(body + 0x34, 1, runtime); emitRawEffectParticles(body + 0x34, frame + 0x14, 1, get(m, 0x919000), 1, runtime);
  for (const offset of [0, 4, 8]) put(m, nativeGlobalAddress(m,0x91cd80 + offset), get(m, body + 0x34 + offset)); put(m, nativeGlobalAddress(m,0x91cd90), 1); put(m, nativeGlobalAddress(m,0x91cd8c), 8); activateRawBodyTrail(body + 0x34, 2, runtime);
  if (!get(m, nativeGlobalAddress(m, 0x811180))) {for (const offset of [0, 4, 8]) put(m, nativeGlobalAddress(m,0x91cd6c + offset), get(m, body + 0x34 + offset)); put(m, nativeGlobalAddress(m,0x91cd60), 1); put(m, nativeGlobalAddress(m,0x91cd64), 31); put(m, nativeGlobalAddress(m,0x91cd68), 1);}
  alterRawTerrainBrightness(body + 0x34, 1, child);
  for (let j = 0; j < 3; j++) m.writeUInt16LE(m.readUInt16LE(body + 0x36 + j * 4), 0x6fb954 + j * 2); put(m, 0x6fb9a4, 1); emitRawEffectParticles(body + 0x34, frame + 0x14, 1, get(m, 0x9153c8), 0x4000, runtime);
  put(m, body + 0x198, 0); put(m, body + 0x194, 16); removeBodySpatial(body, runtime); unregisterPhysicalBody(body, runtime); const channel = get(m, body + 0x1ac); if (channel !== 127) {stopVehicleSound(channel, runtime.soundRuntime ?? runtime); put(m, body + 0x1ac, 127);}
  //4284d0 last saved incoming ESI=other=0 at frame-8. Each474850 then
  //saves its incoming ESI=current satellite in the same slot; the next trail
  //copies its high word into partially initialized transform scratch.
  put(m, frame - 8, 0);
  for (let j = 0; j < 3; j++) {const satellite = ptr(m, body + 0x184 + j * 4); updateProjectileTrail(satellite, 1, child); put(m, frame - 8, satellite); removeBodySpatial(satellite, runtime);} return 0;
}
