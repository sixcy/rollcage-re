import {activateGroundProjectile, activateHomingProjectile, activateSatelliteProjectiles} from './projectile-launch.mjs';
import {activateTerrainWave} from './terrain-wave.mjs';
import {activateWormhole} from './wormhole-construction.mjs';
import {activateVehicleContactColors} from './vehicle-contact-colors.mjs';
import {activateRaceTimeEffect} from './race-time-effect.mjs';
import {startRaceLaunch} from './race-launch-state.mjs';
import {clearVehicleLaunchEvents} from './projectile-trails.mjs';
import {sendWormholeLaunchPacket} from './game-network-protocol.mjs';
import {publishWeaponLaunchFeedback, publishWormholeWeaponFeedback} from './weapon-launch-feedback.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//41e4a0. The wheel contact test is ANY of four contacts, and speed is signed.
export function requestHeldVehicleRecovery(body, {memory: m}) {
  const session = ptr(m, 0x5ecb1c), mode = m[session + 0x551];
  if (m[session + 0x585] || mode === 3 || mode === 8 || get(m, body + 0x3d04) || get(m, body + 0x664) > 0x200000) return;
  for (let i = 0; i < 4; i++) if (m[body + 0x324 + i * 200] & 1) {put(m, body + 0x3d04, 1); put(m, body + 0x3d08, 0); return;}
}

//47be20: ECX record, EDX slot index, stack[localMode,unusedContext,packet].
//Child launch transport context is the slot index itself. Final native ECX
//is the security-cookie global; the parent's second stack argument is unread.
export function launchVehicleWeapon(record, slotIndex, localMode, unusedContext, packet, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 224, body = ptr(m, record), slot = body + 0x68c + slotIndex;
  put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - 212)); put(m, frame + 12, 0); put(m, frame + 0x10, body); put(m, frame + 0x14, slot);
  const kind = m.readInt8(slot); if (kind < 0 || kind > 7) return 0;
  let accepted = 0;
  const nested = offset => ({...runtime, scratchBase: frame - offset, entryRegisters: {...runtime.entryRegisters, EDI: slotIndex, ESI: record, EBX: 0}}), liveBody = () => ptr(m, record), markedSlot = () => ptr(m, frame + 0x14);
  const feedback = code => publishWeaponLaunchFeedback(m.readUInt16LE(liveBody() + 0x65e), 0, code, nested(8));
  const send = code => sendWormholeLaunchPacket(m.readUInt16LE(liveBody() + 0x65e), slotIndex, code, 0, 0, nested(16));
  if (kind <= 3 || kind === 7) {
    accepted = [activateGroundProjectile, activateHomingProjectile, activateSatelliteProjectiles, activateTerrainWave, null, null, null, activateWormhole][kind](record, localMode, kind, packet, slotIndex, nested(16));
    if (!accepted) return accepted;
    if (kind === 7) {if (m[liveBody() + 0x718] !== 8) publishWormholeWeaponFeedback(m.readUInt16LE(liveBody() + 0x65e), frame, runtime); m[markedSlot()] |= 64;}
    else if (kind === 3) {if (m[liveBody() + 0x718] !== 8) feedback(3); m[markedSlot()] |= 64;}
    else {if (m[liveBody() + 0x718] !== 8) feedback([2, 0, 1][kind]); m[markedSlot()] = 255;}
    return accepted;
  }
  if (kind === 4) {
    accepted = startRaceLaunch(record, 0, 0, nested(8));
    if (accepted) {clearVehicleLaunchEvents(record, nested(4)); m.writeUInt16LE(slotIndex ? 8 : 4, ptr(m, frame + 0x10) + 0x6a4);}
    if (localMode) {if (!accepted) return accepted; send(4);}
    if (accepted) {if (m[liveBody() + 0x718] !== 8) feedback(5); m[markedSlot()] = 255;} return accepted;
  }
  if (kind === 6) {
    accepted = activateVehicleContactColors(record, nested(4));
    if (localMode) {if (!accepted) return accepted; send(6);}
    if (accepted) {if (m[liveBody() + 0x718] !== 8) feedback(4); m[markedSlot()] = 255;} return accepted;
  }
  const result = activateRaceTimeEffect(record, 0, nested(4));
  if (result.eax) {accepted = 1; put(m, frame + 12, 1); if (result.eax !== 1) put(m, frame + 12, result.edx);}
  if (localMode !== result.edx) {if (!accepted) return accepted; send(5);}
  if (accepted) {if (m[liveBody() + 0x718] !== 8) feedback(6); if (get(m, frame + 12)) m[markedSlot()] |= 64; else m[markedSlot()] = 255;}
  return accepted;
}
