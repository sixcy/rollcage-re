import {nativeGlobalAddress} from './native-global-address.mjs';
import {updateProjectileTrail, emitProjectileLaunchRing, startProjectileLoopSound} from './projectile-trails.mjs';
import {computeProjectileRouteVector, updateProjectileRouteMotion} from './projectile-guidance.mjs';
import {updateProjectileRoute} from './projectile-routes.mjs';
import {lookupRawIntegerRoot} from './raw-vector-normalization.mjs';
import {startVehicleSound} from './vehicle-sound-controls.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

//44b240. Kind0 route following, target lead, turnaround and trail retirement.
export function updateGroundProjectile(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 52, child = {...runtime, scratchBase: frame - 4}, targetPosition = ptr(m, body + 0x198) + 0x34;
  put(m, frame + 0x24, targetPosition); const state = get(m, body + 0x188); if (!state) return;
  const mode = m[0x90a548] & 1 ? 0 : 1;
  if (state === 16) {
    if (mode) {m[body + 0x18e] = m[body + 0x18e] - 1 & 255; word(m, body + 0x18c, m.readUInt16LE(body + 0x18c) + 1);}
    if (m.readUInt16LE(body + 0x18c) === 32) word(m, body + 0x18c, 0);
    if (m.readInt8(body + 0x18e) < 2) {put(m, body + 0x188, 0); m[0x903502] = m[0x903502] - 1 & 255;} return;
  }
  if (state === 1) {
    updateProjectileTrail(body, 2, child); put(m, body + 0x180, get(m, body + 0x180) - 1); if (get(m, body + 0x180)) return;
    put(m, body + 0x5c0, startProjectileLoopSound(60, -1, 18000, body + 0x34, body + 0x68, runtime));
    let owner = ptr(m, body + 0x194); startVehicleSound((owner & 0xffffff00) | 29, 6, 1024, 15000, owner + 0x34, m[owner + 0x6b4], runtime.soundRuntime ?? runtime); owner = ptr(m, body + 0x194);
    if (m[owner + 0x70b] && m[owner + 0x71e] <= 10) {word(m, owner + 0x71e, 0x10a); word(m, owner + 0x71a, 220); m[owner + 0x71d] = 60;}
    put(m, body + 0x188, 2); emitProjectileLaunchRing(body + 0x34, runtime); return;
  }
  if (state === 2 || state === 128 || state === 256) {
    updateProjectileTrail(body, mode, child); const point = ptr(m, ptr(m, body + 0x6d4) + 8) + (m.readInt16LE(body + 0x6d8) << 4);
    computeProjectileRouteVector(point, body + 0x34, frame + 0x28, state === 256 ? 0 : 1, runtime);
    updateProjectileRouteMotion(body, frame + 0x28, point, 0, {...runtime, scratchBase: frame - 20});
    const near = updateProjectileRoute(body, state === 128 ? 0 : 1, child);
    if (state !== 128) {if (near) {put(m, body + 0x180, 0); put(m, body + 0x188, state === 2 ? 128 : 64);} return;}
    put(m, body + 0x180, get(m, body + 0x180) + 1); if (get(m, body + 0x180) !== 45) return;
    const target = ptr(m, frame + 0x24), dx = (get(m, body + 0x34) - get(m, target) | 0) >> 16, dy = (get(m, body + 0x38) - get(m, target + 4) | 0) >> 16, dz = (get(m, body + 0x3c) - get(m, target + 8) | 0) >> 16;
    put(m, frame + 0x24, Math.imul(dx, dx) + Math.imul(dy, dy));
    const projection = Math.imul(m.readInt16LE(body + 0x6e), dy) + Math.imul(m.readInt16LE(body + 0x72), dz) + Math.imul(m.readInt16LE(body + 0x6a), dx) | 0;
    if (projection > 0 && ((Math.imul(dz, dz) + get(m, frame + 0x24)) | 0) > 0x100000) {word(m, body + 0x6d2, -m.readInt16LE(body + 0x6d2)); put(m, body + 0x180, 0); put(m, body + 0x188, 256);}
    else put(m, body + 0x180, 35); return;
  }
  if (state !== 64) return;
  updateProjectileTrail(body, mode, child); if (get(m, body + 0x198) === get(m, body + 0x194)) put(m, body + 0x194, 0);
  const dz = (get(m, targetPosition + 8) - get(m, body + 0x3c) | 0) >> 16, dy = (get(m, targetPosition + 4) - get(m, body + 0x38) | 0) >> 16, dx = (get(m, targetPosition) - get(m, body + 0x34) | 0) >> 16;
  for (const [offset, value] of [[0x24, dz], [0x30, dz], [0x18, dx], [0x28, dx], [0x20, dy], [0x2c, dy]]) put(m, frame + offset, value);
  let distance = lookupRawIntegerRoot(Math.imul(dz, dz) + Math.imul(dy, dy) + Math.imul(dx, dx) | 0, runtime);
  const vx = get(m, targetPosition + 0x34), vz = get(m, targetPosition + 0x3c), vy = get(m, targetPosition + 0x38);
  put(m, frame + 0x10, vz); put(m, frame + 0x14, vx); put(m, frame + 0x1c, vy);
  const projection = Math.max(-2048, Math.min(2048, Math.imul(m.readInt16LE(body + 0x6a), vx >> 16) + Math.imul(m.readInt16LE(body + 0x6e), vy >> 16) + Math.imul(m.readInt16LE(body + 0x72), vz >> 16) | 0));
  if (!get(m, nativeGlobalAddress(m, 0x811180))) {const lead = Math.max(0, Math.min(4, (distance - (projection >> 8) | 0) >> 7)); put(m, frame + 0x28, get(m, frame + 0x18) + (Math.imul(vx, lead) >> 16)); put(m, frame + 0x2c, get(m, frame + 0x20) + (Math.imul(vy, lead) >> 16)); put(m, frame + 0x30, get(m, frame + 0x24) + (Math.imul(vz, lead) >> 16));}
  distance = Math.max(1, distance + (projection >> 3) | 0); updateProjectileRouteMotion(body, frame + 0x28, 0, distance, {...runtime, scratchBase: frame - 12});
}
