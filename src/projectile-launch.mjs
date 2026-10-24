import {nativeGlobalAddress} from './native-global-address.mjs';
import {abs32, multiplyQ16} from './fixed-integer.mjs';
import {orientWormholeBody} from './wormhole-visuals.mjs';
import {updateRawLinearVelocity} from './raw-linear-velocity.mjs';
import {registerRawBodyShapes, registerRawBodySpatial} from './raw-body-construction.mjs';
import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {updateProjectileTrail} from './projectile-trails.mjs';
import {appendVehicleAnimationLight} from './vehicle-animation-lights.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {sendWormholeLaunchPacket} from './game-network-protocol.mjs';
import {reportGameDiagnostic} from './game-diagnostics.mjs';
import {findProjectileParticipantRoute, updateProjectileRoute} from './projectile-routes.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const copyDword = (m, source, target) => put(m, target, get(m, source));
const copyBlock = (m, source, target, length) => Buffer.from(m.subarray(source, source + length)).copy(m, target);
const rng = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;
const sendLaunchPacket = (participant, context, tag, packet, frame, runtime) => {
  //Native caller PUSHes remain observable when subsequent launch-light
  //payloads overlap this reused stack. Publish in original right-to-left order.
  put(runtime.memory, frame - 4, 96); put(runtime.memory, frame - 8, packet); put(runtime.memory, frame - 12, tag);
  const entryRegisters = {...runtime.entryRegisters};
  if (tag === 0) entryRegisters.EBP = -1; //44b17a OR EBP,-1 precedes the route calls.
  if (tag === 2) entryRegisters.EBP = packet; //42fec6/42fedf retain the packet in EBP.
  return sendWormholeLaunchPacket(participant, context, tag, packet, 96, {...runtime, scratchBase: frame - 16, entryRegisters});
};
const queueLaunchLight = (body, frame, retainedShapeArguments, runtime) => {
  const m = runtime.memory, top = frame - retainedShapeArguments * 4;
  put(m, frame + 0x24, body); put(m, top - 4, frame + 0x24); put(m, top - 8, 1);
  put(m, body + 0x1b4, 0); put(m, top - 12, 5); put(m, top - 16, 8);
  appendVehicleAnimationLight(body + 0x34, body + 0x1b4, 8, 5, 1, frame + 0x24, runtime);
};

export function initializeProjectileLaunchTables(memory) {
  Buffer.from('0000000000000000000000000023000001000000', 'hex').copy(memory, 0x5ec940);
  Buffer.from('0000000000000000000000000005000001000000', 'hex').copy(memory, 0x5ec0f0);
  Buffer.from('0000000000000000000000000020000001000000', 'hex').copy(memory, 0x5eaf20);
  Buffer.from('Bad network homer data.\0', 'latin1').copy(memory, 0x5d2f58);
  Buffer.from('Bad network leader data.\0', 'latin1').copy(memory, 0x5d22c4);
  Buffer.from('Bad network driller data.\0', 'latin1').copy(memory, 0x5d0538);
  return memory;
}

//44af00. The route-directed two-slot launch uses a shorter initial position
//offset than46b160, then the actual participant graph and endpoint update.
export function activateGroundProjectile(record, localMode, unused, receivedPacket, transportContext, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 152, owner = ptr(m, record), packet = localMode ? frame + 0x30 : receivedPacket;
  put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - 136)); put(m, frame + 0x1c, localMode); put(m, frame + 0x20, record);
  if (Number.isInteger(runtime.entryRegisters?.EDI)) put(m, frame, runtime.entryRegisters.EDI); //Saved EDI survives failed-packet diagnostics into later light payloads.
  if (localMode) m[packet + 0x57] = 0;
  if (!packet || m[packet + 0x57] !== 0) {put(m, frame - 4, 0x5d22c4); reportGameDiagnostic(0x5d22c4, [], {...runtime, scratchBase: frame - 8}); return 0;}
  let body = 0, remaining = 2;
  for (; remaining > 0; remaining--) {const p = ptr(m, 0x9034f8 + (2 - remaining) * 4); if (!get(m, p + 0x188)) {body = p; break;}}
  if (!body) return 0;
  put(m, body + 0x194, owner); put(m, body + 0x188, 1);
  emitNativeEffect(59, owner + 0x34, [0, 1024, 15000, 6, remaining, 0, m[owner + 0x6b4] === 1 ? 1 : 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)}); put(m, body + 0x180, 10);
  if (get(m, frame + 0x1c)) writeProjectileLaunchPacket(owner, packet, runtime);
  for (const offset of [0, 4, 8]) copyDword(m, packet + offset, body + 0x34 + offset);
  for (let j = 0; j < 3; j++) put(m, body + 0x1a8 + j * 4, m.readInt16LE(packet + 0x10 + j * 6) << 4);
  orientWormholeBody(body + 0x1a8, body + 0xc4, {...runtime, scratchBase: frame - 4});
  put(m, frame + 0x14, get(m, packet + 0x2c)); put(m, frame + 0x18, get(m, body + 0xa8)); put(m, frame + 0x18, multiplyQ16(get(m, frame + 0x18), get(m, frame + 0x14)));
  for (let j = 0; j < 3; j++) {put(m, frame + 0x14, get(m, packet + 0x30 + j * 4)); put(m, body + 0x40 + j * 4, multiplyQ16(get(m, frame + 0x14), get(m, frame + 0x18)));}
  let x = m.readInt16LE(packet + 0x0e) << 4, y = m.readInt16LE(packet + 0x14) << 4, z = m.readInt16LE(packet + 0x1a) << 4;
  if (!m[packet + 0x44]) {x = -x | 0; y = -y | 0; z = -z | 0;}
  put(m, body + 0x40, get(m, body + 0x40) + x); put(m, body + 0x44, get(m, body + 0x44) + y); put(m, body + 0x48, get(m, body + 0x48) + z);
  put(m, body + 0x34, get(m, body + 0x34) + (x << 1)); put(m, body + 0x38, get(m, body + 0x38) + (y << 1)); put(m, body + 0x3c, get(m, body + 0x3c) + (z << 1)); put(m, body, get(m, body) & 0xffffefff);
  updateRawLinearVelocity(body, {...runtime, scratchBase: frame - 4}); registerRawBodySpatial(body, runtime); put(m, frame - 8, get(m, body + 12) & 1); //474600's outside output overwrites its first PUSH ECX slot.
  word(m, body + 0x18c, 0); m[body + 0x18e] = 0; updateProjectileTrail(body, 2, {...runtime, scratchBase: frame - 4}); registerRawBodyShapes(body, 1, 0x5ec0f0, runtime);
  queueLaunchLight(body, frame, 2, runtime);
  const liveRecord = ptr(m, frame + 0x20); copyDword(m, liveRecord + 0x54, body + 0x6cc); word(m, body + 0x6d0, m.readUInt16LE(liveRecord + 0x58)); put(m, body + 0x198, get(m, 0x90960c)); word(m, body + 0x6da, -1);
  findProjectileParticipantRoute(body, {...runtime, scratchBase: frame - 4}); const group = ptr(m, body + 0x6cc); word(m, body + 0x6d8, m.readUInt16LE(body + 0x6d0)); put(m, body + 0x6d4, group); word(m, body + 0x6d2, m[group + 2] ? -1 : 1); put(m, frame - 4, 0x44b1e0); put(m, frame - 20, liveRecord); put(m, frame - 24, -1); updateProjectileRoute(body, 0, {...runtime, scratchBase: frame - 4}); m[0x903502] = m[0x903502] + 1 & 255;
  if (get(m, frame + 0x1c)) sendLaunchPacket(m.readUInt16LE(ptr(m, liveRecord) + 0x65e), transportContext, 0, packet, frame, runtime);
  return 1;
}

//42feb0. The three later child records retain their own prior matrix/direction
//fields: the native non-first branch reads the current child pointer itself.
export function activateSatelliteProjectiles(record, localMode, unused, receivedPacket, transportContext, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 152, owner = ptr(m, record), packet = localMode ? frame + 0x30 : receivedPacket;
  put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - 136)); put(m, frame + 0x1c, localMode); put(m, frame + 0x20, record);
  if (Number.isInteger(runtime.entryRegisters?.EDI)) put(m, frame, runtime.entryRegisters.EDI); //Saved EDI survives failed-packet diagnostics into later light payloads.
  if (localMode) m[packet + 0x57] = 2;
  if (!packet || m[packet + 0x57] !== 2) {put(m, frame - 4, 0x5d0538); reportGameDiagnostic(0x5d0538, [], {...runtime, scratchBase: frame - 8}); return 0;}
  let body = 0, remaining = 6;
  for (; remaining > 0; remaining--) {const p = ptr(m, 0x903480 + (6 - remaining) * 4); if (!get(m, p + 0x194)) {body = p; break;}}
  if (!body) return 0;
  put(m, body + 0x180, owner); put(m, body + 0x194, 1);
  emitNativeEffect(26, owner + 0x34, [0, 3000, 15000, 6, remaining, 0, m[owner + 0x6b4] === 1 ? 1 : 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
  put(m, body + 0x198, 10); put(m, body + 0x1a8, 0); if (get(m, frame + 0x1c)) writeProjectileLaunchPacket(owner, packet, runtime);
  const position = body + 0x34, xyz = [get(m, packet), get(m, packet + 4), get(m, packet + 8)]; xyz.forEach((v, j) => put(m, position + j * 4, v));
  put(m, frame + 0x14, get(m, packet + 0x2c)); put(m, frame + 0x18, get(m, body + 0xa8)); put(m, frame + 0x18, multiplyQ16(get(m, frame + 0x18), get(m, frame + 0x14)));
  for (let j = 0; j < 3; j++) {put(m, frame + 0x14, get(m, packet + 0x30 + j * 4)); put(m, body + 0x40 + j * 4, multiplyQ16(get(m, frame + 0x14), get(m, frame + 0x18)));}
  let x = m.readInt16LE(packet + 0x0e) << 4, y = m.readInt16LE(packet + 0x14) << 4, z = m.readInt16LE(packet + 0x1a) << 4;
  if (!m[packet + 0x44]) {x = -x | 0; y = -y | 0; z = -z | 0;}
  put(m, position + 4, get(m, position + 4) + (y << 6)); put(m, position + 8, get(m, position + 8) + (z << 6)); put(m, position, get(m, position) + (x << 6));
  put(m, position + 4, get(m, position + 4) + (m.readInt16LE(packet + 0x16) << 10)); put(m, position, get(m, position) + (m.readInt16LE(packet + 0x10) << 10)); put(m, position + 8, get(m, position + 8) + (m.readInt16LE(packet + 0x1c) << 10));
  updateRawLinearVelocity(body, {...runtime, scratchBase: frame - 4}); //Adapter takes the enclosing body; native ECX is position=body+34h.
  registerRawBodySpatial(body, runtime); registerRawBodyShapes(body, 1, 0x5eaf20, runtime); put(m, frame + 0x18, 0);
  for (let i = 0; i < 3; i++) {
    const slot = body + 0x184 + i * 4, satellite = ptr(m, slot); put(m, frame + 0x14, slot); word(m, satellite + 0x18c, 0); m[satellite + 0x18e] = 0; put(m, satellite + 0x188, 1); put(m, satellite + 0x180, 10);
    if (!i) {for (let j = 0; j < 3; j++) put(m, satellite + 0x1a8 + j * 4, m.readInt16LE(packet + 0x10 + j * 6) << 4); orientWormholeBody(satellite + 0x1a8, satellite + 0xc4, {...runtime, scratchBase: frame - 4});}
    else {const selected = ptr(m, ptr(m, frame + 0x14)); for (const offset of [0xc4, 0xc8, 0xcc, 0xd0, 0xd4, 0x1a8, 0x1ac, 0x1b0]) copyDword(m, selected + offset, satellite + offset);}
    put(m, satellite + 0x1b8, 0); word(m, satellite + 0x1bc, 0); const sy = get(m, position + 4), sz = get(m, position + 8), sx = get(m, position); put(m, satellite + 0x38, sy); put(m, satellite + 0x34, sx); put(m, satellite + 0x3c, sz);
    registerRawBodySpatial(satellite, runtime); queueLaunchLight(satellite, frame, 0, runtime);
    put(m, frame - 8, 1); updateProjectileTrail(satellite, 2, {...runtime, scratchBase: frame - 4}); put(m, frame + 0x18, i + 1);
  }
  const first = ptr(m, body + 0x184); m[0x903501] = m[0x903501] + 1 & 255;
  for (const offset of [0xc4, 0xc8, 0xcc, 0xd0, 0xd4]) copyDword(m, first + offset, body + offset);
  for (let j = 0; j < 3; j++) copyDword(m, first + 0x1a8 + j * 4, body + 0x19c + j * 4);
  put(m, body + 0x1b0, 0); put(m, body + 0x1b4, 0);
  if (get(m, frame + 0x1c)) sendLaunchPacket(m.readUInt16LE(ptr(m, ptr(m, frame + 0x20)) + 0x65e), transportContext, 2, packet, frame, runtime);
  return 1;
}

//Shared local96-byte packet prefix: native MOVQ/MOVDQU captures each block
//separately, so an overlapping packet observes prior block stores.
export function writeProjectileLaunchPacket(owner, packet, {memory: m}) {
  copyBlock(m, owner + 0x34, packet, 8); copyDword(m, owner + 0x3c, packet + 8);
  copyBlock(m, owner + 0xc4, packet + 12, 16); copyBlock(m, owner + 0xd4, packet + 28, 16);
  copyDword(m, owner + 0xac, packet + 0x2c); copyBlock(m, owner + 0x40, packet + 0x30, 8); copyDword(m, owner + 0x48, packet + 0x38); m[packet + 0x44] = m[owner + 0x64f];
}

//46b160. Local/network activation of the four-slot homing pool, with actual
//orientation/velocity/spatial/shapes/light/network producers and target IDs.
export function activateHomingProjectile(record, localMode, unused, receivedPacket, transportContext, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 152, owner = ptr(m, record), packet = localMode ? frame + 0x30 : receivedPacket;
  put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - 136)); put(m, frame + 0x20, record); put(m, frame + 0x14, owner); put(m, frame + 0x1c, localMode);
  if (Number.isInteger(runtime.entryRegisters?.EDI)) put(m, frame, runtime.entryRegisters.EDI); //Saved EDI survives failed-packet diagnostics into later light payloads.
  if (localMode) m[packet + 0x57] = 1;
  if (!packet || m[packet + 0x57] !== 1) {put(m, frame - 4, 0x5d2f58); reportGameDiagnostic(0x5d2f58, [], {...runtime, scratchBase: frame - 8}); return 0;}
  let body = 0;
  for (let i = 0; i < 4; i++) {const p = ptr(m, 0x9034a0 + i * 4); if (!get(m, p + 0x188)) {body = p; break;}}
  if (!body) return 0;
  put(m, body + 0x194, owner); put(m, body + 0x188, 1); put(m, body + 0x198, 0); put(m, body + 0x6b4, 0); put(m, body + 0x6b8, 0);
  emitNativeEffect(26, owner + 0x34, [0, 3000, 15000, 6, 0, 0, m[owner + 0x6b4] === 1 ? 1 : 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)}); put(m, body + 0x180, 10);
  if (get(m, frame + 0x1c)) {
    writeProjectileLaunchPacket(ptr(m, frame + 0x14), packet, runtime); copyBlock(m, record + 0x5c, packet + 0x48, 8); copyDword(m, record + 0x64, packet + 0x50); word(m, packet + 0x54, m.readUInt16LE(record + 0x7c)); m[packet + 0x56] = m[record + 0x6a];
    if (m[packet + 0x56] === 2) word(m, packet + 0x5e, m.readUInt16LE(ptr(m, record + 0x70) + 0x10e));
    else if (m[packet + 0x56] === 1) {word(m, packet + 0x5e, m.readUInt16LE(ptr(m, record + 0x74) + 0x10e)); word(m, packet + 0x5c, m.readUInt16LE(ptr(m, record + 0x70) + 12) & 15);}
    else put(m, packet + 0x5c, -1);
  }
  for (const offset of [0, 4, 8]) copyDword(m, packet + offset, body + 0x34 + offset);
  for (let j = 0; j < 3; j++) put(m, body + 0x1a8 + j * 4, m.readInt16LE(packet + 0x10 + j * 6) << 4);
  orientWormholeBody(body + 0x1a8, body + 0xc4, {...runtime, scratchBase: frame - 4});
  put(m, frame + 0x18, get(m, packet + 0x2c)); put(m, frame + 0x14, get(m, body + 0xa8)); put(m, frame + 0x14, multiplyQ16(get(m, frame + 0x14), get(m, frame + 0x18)));
  for (let j = 0; j < 3; j++) {put(m, frame + 0x18, get(m, packet + 0x30 + j * 4)); put(m, body + 0x40 + j * 4, multiplyQ16(get(m, frame + 0x18), get(m, frame + 0x14)));}
  let x = m.readInt16LE(packet + 0x0e) << 4, y = m.readInt16LE(packet + 0x14) << 4, z = m.readInt16LE(packet + 0x1a) << 4; put(m, frame + 0x18, get(m, body + 0x48)); put(m, frame + 0x14, z);
  if (!m[packet + 0x44]) {x = -x | 0; y = -y | 0; z = -z | 0; put(m, frame + 0x14, z);}
  put(m, body + 0x40, get(m, body + 0x40) + ((x >> 1) + x)); put(m, body + 0x44, get(m, body + 0x44) + ((y >> 1) + y)); put(m, body + 0x48, (get(m, frame + 0x14) >> 1) + get(m, frame + 0x18) + get(m, frame + 0x14));
  put(m, body, get(m, body) | 0x1000); put(m, body + 0x34, get(m, body + 0x34) + (x << 4)); put(m, body + 0x38, get(m, body + 0x38) + (y << 4)); put(m, body + 0x3c, get(m, body + 0x3c) + (get(m, frame + 0x14) << 4));
  const lock = m.readUInt16LE(packet + 0x54);
  if (lock !== 2 && lock !== 4) {for (const offset of [0, 4, 8]) put(m, body + 0x19c + offset, (get(m, body + 0x1a8 + offset) << 12) + get(m, body + 0x34 + offset));}
  else {
    for (const offset of [0, 4, 8]) copyDword(m, packet + 0x48 + offset, body + 0x19c + offset);
    const id = m.readUInt16LE(packet + 0x5e); let target = id < get(m, 0x6e6b44) ? ptr(m, 0x70e200 + id * 4) : 0; if (target && m.readUInt16LE(target + 0x10e) !== id) target = 0;
    if (m[packet + 0x56] === 2) put(m, body + 0x198, target || get(m, record + 0x70));
    else if (m[packet + 0x56] === 1) {
      if (target) {put(m, body + 0x6b8, target); const model = ptr(m, target + 0x10), shapes = model + m.readUInt16LE(model + 0x34); put(m, body + 0x6b4, shapes); put(m, body + 0x6b4, shapes + m.readUInt16LE(packet + 0x5c) * 20);}
      else {copyDword(m, record + 0x70, body + 0x6b4); copyDword(m, record + 0x74, body + 0x6b8);}
    }
  }
  let span = abs32(get(m, body + 0x1a4) - get(m, packet + 8) | 0) + abs32(get(m, body + 0x19c) - get(m, packet) | 0) | 0; span = span + abs32(get(m, body + 0x1a0) - get(m, packet + 4) | 0) | 0; span = abs32(span >> 16); put(m, 0x91d45c, span); put(m, 0x91d460, Math.clz32(span)); const extent = 2 << Math.max(0, Math.min(11, 30 - Math.clz32(span))); put(m, frame + 0x14, extent);
  if (get(m, frame + 0x1c)) {
    let seed = rng(get(m, 0x5ec954)), mask = extent * 2 - 1; word(m, packet + 0x3c, ((Math.imul(seed >>> 15, 32767) >>> 16) & mask) - extent); seed = rng(seed); word(m, packet + 0x3e, -((Math.imul(seed >>> 15, 32767) >>> 16) & extent - 1)); seed = rng(seed); put(m, 0x5ec954, seed); word(m, packet + 0x40, ((Math.imul(seed >>> 15, 32767) >>> 16) & mask) - extent);
  }
  copyDword(m, packet + 0x3c, body + 0x1b8); copyDword(m, packet + 0x40, body + 0x1bc); updateRawLinearVelocity(body, {...runtime, scratchBase: frame - 4});
  //46b633/634's pushed outside pointer/Z survive into46aba0's partially
  //initialized third transform DWORD. These are real caller producers.
  put(m, frame - 4, frame + 0x18); put(m, frame - 8, get(m, body + 0x3c));
  const row = ptr(m, 0x909254) + ((((get(m, body + 0x3c) >> 24) + 128) & 65535) << 4), map = get(m, row + 12);
  const found = lookupRawSpatialBucket(get(m, body + 0x34), get(m, body + 0x38), get(m, body + 0x3c), runtime); put(m, frame - 8, map); //42871f numeric local, consumed by later trail scratch.
  put(m, frame + 0x18, found.outside); const tagged = found.bucket + (found.outside ? 1 : 0), bucket = tagged & 0xfffffffe; put(m, body + 12, tagged);
  const id = ((body - ptr(m, nativeGlobalAddress(m, 0x902eec)) + 128) >>> 7) & 65535, head = m.readUInt16LE(bucket + 8); put(m, body + 4, head); if (head) word(m, ptr(m, nativeGlobalAddress(m, 0x902eec)) + (head << 7) - 122, id); word(m, bucket + 8, id);
  word(m, body + 0x18c, 0); m[body + 0x18e] = 0; updateProjectileTrail(body, 2, {...runtime, scratchBase: frame - 4});
  //The just-reset mode2 trail leaves ECX=0 after its zero-count tail loop;
  //46b6a4 PUSH ECX reserves the shape call's otherwise unused argument slot.
  put(m, frame - 4, 0);
  registerRawBodyShapes(body, 1, 0x5ec940, runtime); queueLaunchLight(body, frame, 2, runtime); m[0x903500] = m[0x903500] + 1 & 255;
  if (get(m, frame + 0x1c)) sendLaunchPacket(m.readUInt16LE(ptr(m, record) + 0x65e), transportContext, 1, packet, frame, runtime);
  return 1;
}
