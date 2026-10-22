import {orientWormholeBody} from './wormhole-visuals.mjs';
import {updateProjectileTrail, emitProjectileLaunchRing} from './projectile-trails.mjs';
import {updateProjectileHoming} from './projectile-guidance.mjs';
import {emitBodyEffectBurst, removeBodySpatial, unregisterPhysicalBody} from './body-retirement.mjs';
import {stopVehicleSound} from './vehicle-sound-controls.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
const get = (m, p) => m.readInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//46bc30 is a decaying impulse/orientation helper, not a collision query.
export function updateProjectileImpulse(body, runtime) {
  const {memory: m} = runtime, x = get(m, body + 0x1a8), y = get(m, body + 0x1ac), age = get(m, body + 0x180), shift = age - 1 | 0;
  const scale = value => shift > 0 ? value >> (shift & 31) : value << (-shift & 31);
  put(m, body + 0x40, get(m, body + 0x40) + scale(x)); put(m, body + 0x44, get(m, body + 0x44) + scale(y)); put(m, body + 0x48, get(m, body + 0x48) + scale(get(m, body + 0x1b0)));
  if (age) {
    put(m, body + 0x1a8, x + m.readInt16LE(body + 0x1b8)); put(m, body + 0x1ac, y + m.readInt16LE(body + 0x1ba)); put(m, body + 0x1b0, get(m, body + 0x1b0) + m.readInt16LE(body + 0x1bc));
    orientWormholeBody(body + 0x1a8, body + 0xc4, runtime);
  }
}

//46b740. Publish a final trail row, run the actual effect mask, unlink both
//spatial and physical registries, then enter state16 and stop the sound.
export function explodeProjectile(body, mode, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36;
  updateProjectileTrail(body, 1, {...runtime, scratchBase: frame - 4});
  let mask;
  if (mode === 0) mask = get(m, body + 0x184) === 0 ? 0xd1a6b : 0x51a6b;
  else if (mode === 1) mask = 0x50a28;
  else if (mode === 2) mask = 0x51a6b;
  if (mask !== undefined) {
    const y = get(m, body + 0x38) + 0x280000 | 0, x = get(m, body + 0x34);
    put(m, frame + 0x18, x); const z = get(m, body + 0x3c); put(m, frame + 0x1c, y); put(m, frame + 0x20, z);
    put(m, frame + 12, 0); put(m, frame + 16, -0x400000); put(m, frame + 20, 0);
    emitBodyEffectBurst(frame + 0x18, frame + 12, 3, mask, 11, {...runtime, scratchBase: frame - 16});
  }
  removeBodySpatial(body, runtime); unregisterPhysicalBody(body, runtime);
  const channel = get(m, body + 0x5c0); put(m, body + 0x180, 0); put(m, body + 0x188, 16);
  if (channel !== 127) {stopVehicleSound(channel, runtime.soundRuntime ?? runtime); put(m, body + 0x5c0, 127);}
}

//46a900. Full kind1 tick: countdown launch, seeking/near-target detonation,
//effect teardown, and signed trail drain. Actual switch bytes map2/32 together.
export function updateHomingProjectile(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36, state = get(m, body + 0x188), child = {...runtime, scratchBase: frame - 4};
  if (state === 2 || state === 32) {
    const age = get(m, body + 0x180) + (state === 2 ? 1 : -1) | 0; put(m, body + 0x180, age);
    if (state === 2 ? age === 150 : age === 0) put(m, body + 0x188, 8);
    updateProjectileHoming(body, child); orientWormholeBody(body + 0x1a8, body + 0xc4, child);
    //This is a native tail call after restoring the dispatcher EDI. The
    //trail's46abd8 PUSH saves that remaining-slot count; the following ground
    //trail can consume its upper WORD instead of the earlier normalizer value.
    if (Number.isInteger(runtime.entryRegisters?.EDI)) put(m, scratchBase - 60, runtime.entryRegisters.EDI);
    updateProjectileTrail(body, m[0x90a548] & 1 ? 0 : 1, runtime); return;
  }
  if (state === 4) {explodeProjectile(body, 0, runtime); return;}
  if (state === 8) {explodeProjectile(body, 1, runtime); return;}
  if (state === 16) {
    if (!(m[0x90a548] & 1)) {m[body + 0x18e] = m[body + 0x18e] - 1 & 255; m.writeUInt16LE(m.readUInt16LE(body + 0x18c) + 1 & 65535, body + 0x18c);}
    if (m.readUInt16LE(body + 0x18c) === 32) m.writeUInt16LE(0, body + 0x18c);
    if (m.readInt8(body + 0x18e) < 2) {put(m, body + 0x188, 0); m[0x903500] = m[0x903500] - 1 & 255;} return;
  }
  put(m, body + 0x180, get(m, body + 0x180) - 1); updateProjectileTrail(body, 2, child); updateProjectileImpulse(body, child);
  if (get(m, body + 0x180)) return;
  const emit = (code, position, args) => {
    //46aac8/46ab17 PUSH the fixed pitch before each actual effect call.
    //A later ground trail reads the upper WORD of this reused caller slot.
    put(m, frame - 24, 2048);
    return emitNativeEffect(code, position, args, {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
  };
  put(m, body + 0x5c0, emit(30, body + 0x34, [body + 0x68, 2048, 16383, 9, 1, 0, 0])); put(m, body + 0x188, 2);
  emitProjectileLaunchRing(body + 0x34, child);
  let owner = m.readUInt32LE(body + 0x194); put(m, body, get(m, body) & ~0x1000);
  emit(27, owner + 0x34, [0, 2048, 13000, 6, 0, 0, m[owner + 0x6b4] === 1 ? 1 : 0]); owner = m.readUInt32LE(body + 0x194);
  if (m[owner + 0x70b] && m[owner + 0x71e] <= 10) {m.writeUInt16LE(0x10a, owner + 0x71e); m.writeUInt16LE(200, owner + 0x71a); m[owner + 0x71d] = 50;}
}
