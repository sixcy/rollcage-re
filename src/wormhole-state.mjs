import {nativeGlobalAddress} from './native-global-address.mjs';
import {dotQ16} from './fixed-integer.mjs';
import {removeBodySpatial, unregisterPhysicalBody, emitBodyEffectBurst} from './body-retirement.mjs';
import {removeWormholeEffects, updateWormholeEffects, orientWormholeBody} from './wormhole-visuals.mjs';
import {updateWormholeEmergence, updateWormholeChase, updateWormholeCapture, measureWormholeVector} from './wormhole-targeting.mjs';
import {stopVehicleSound} from './vehicle-sound-controls.mjs';
import {queryRawRespawnPlacement} from './raw-respawn-query.mjs';
import {emitRawVehicleRespawnRing, applyRawRespawn} from './raw-respawn-state.mjs';
import {applyRaceLaunchImpulse} from './race-launch-state.mjs';
import {addVehicleContactScore, subtractVehicleContactScore} from './vehicle-contact-state.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {generateRacerName, lookupLocalizedRow, formatFinishPhrase, enqueueFinishNotification} from './finish-messages.mjs';
import {sendGameNotificationPacket} from './game-network-protocol.mjs';
import tables from './wormhole-state-tables.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const vector = (m, p) => [0, 4, 8].map(o => get(m, p + o)), length = (m, p) => {let end = p; while (m[end]) end++; return end - p;}, copy = (m, from, to) => {let value; do {value = m[from++]; m[to++] = value;} while (value);};
export function initializeWormholeStateTables(memory) {for (const table of tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

function cleanup(body, burst, frame, positionOffset, velocityOffset, runtime) {
  const {memory: m} = runtime;
  if (burst) {
    [get(m, body + 0x34), get(m, body + 0x38) + 0x280000, get(m, body + 0x3c)].forEach((v, i) => put(m, frame + positionOffset + i * 4, v)); [0, -0x400000, 0].forEach((v, i) => put(m, frame + velocityOffset + i * 4, v));
    emitBodyEffectBurst(frame + positionOffset, frame + velocityOffset, 3, 0x50a28, 11, {...runtime, scratchBase: frame - 16});
  }
  removeBodySpatial(body, runtime); unregisterPhysicalBody(body, runtime); m[0x903503]--; put(m, body + 0x180, 0); m[body + 0x2a3c] = 0; put(m, body + 0x188, 0); removeWormholeEffects(body, runtime);
  if (get(m, body + 0x2a38) !== 127) {stopVehicleSound(ptr(m, body + 0x2a38), runtime.soundRuntime ?? runtime); put(m, body + 0x2a38, 127);}
  const owner = ptr(m, body + 0x194); m[owner + ((m.readInt8(owner + 0x68c) & ~32) === 71 ? 0x68c : 0x68d)] = 255;
}
//49ae80 retires directly; only EDX==1 produces the burst.49ab40's contact
//filter always bursts and returns0. Their different stack vector slots matter.
export function retireWormhole(body, mode, runtime) {cleanup(body, mode === 1, runtime.scratchBase - 28, 16, 4, runtime);}
export function filterWormholeContact(body, runtime) {cleanup(body, true, runtime.scratchBase - 32, 20, 8, runtime); return 0;}

//49ba20: global destination behind the captured owner forward column.
export function writeWormholeTransportDestination(body, {memory: m}) {
  const owner = ptr(m, body + 0x194), position = vector(m, owner + 0x34);
  position.forEach((value, lane) => put(m, 0x714a70 + lane * 4, value));
  const forward = [0xc8, 0xce, 0xd4].map(o => m.readInt16LE(owner + o) << 4);
  position.forEach((value, lane) => put(m, 0x714a70 + lane * 4, value - Math.imul(forward[lane], 140)));
}
//49baa0 preserves native per-vector snapshots and then forward field copies.
export function copyWormholeOwnerDynamics(body, {memory: m}) {
  const owner = ptr(m, body + 0x194), target = ptr(m, body + 0x198);
  for (const base of [0x4c, 0xb8, 0x40, 0x68, 0x90]) {const values = vector(m, owner + base); values.forEach((v, i) => put(m, target + base + i * 4, v));}
  for (const offset of [0x8c, 0x644]) put(m, target + offset, get(m, owner + offset));
  for (const offset of [0x64c, 0x64d, 0x64e, 0x64f]) m[target + offset] = m[owner + offset];
  for (const offset of [0x650, 0x37c, 0x444, 0x50c, 0x5d4]) put(m, target + offset, get(m, owner + offset));
}

//49b690. All game movement/query/respawn/effect/score/message adapters are
//actual defaults; their declared runtime scene/localization/CRT/network
//inputs and remaining network-domain gaps are preserved rather than hidden.
export function transportWormholeTarget(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 236, quaternion = ptr(m, body + 0x194) + 0x58;
  writeWormholeTransportDestination(body, runtime);
  if (!queryRawRespawnPlacement(ptr(m, body + 0x198), 0x714a70, quaternion, 0x714a7c, 0, frame + 16, {...runtime, scratchBase: frame - 20})) {put(m, body + 0x188, 4); put(m, body + 0x180, 0); return;}
  const record = 0x909300 + m.readUInt16LE(ptr(m, body + 0x194) + 0x65e) * 0x30c;
  emitRawVehicleRespawnRing(ptr(m, body + 0x198), 1, {...runtime, scratchBase: frame - 4});
  applyRawRespawn(ptr(m, body + 0x198), 0x714a70, quaternion, 0x714a7c, ptr(m, record + 0x54), get(m, record + 0x58), get(m, frame + 16), {...runtime, scratchBase: frame - 24});
  let target = ptr(m, body + 0x198);
  emitNativeEffect(35, body + 0x34, [0, 0x400, 16000, 6, 0, 0, m[target + 0x6b4] === 1 ? 1 : 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
  copyWormholeOwnerDynamics(body, runtime); target = ptr(m, body + 0x198); let owner = ptr(m, body + 0x194); const savedTarget = target;
  put(m, target + 0x690, owner); m[target + 0x698] = 90; put(m, target + 0x694, get(m, target + 0x70c)); applyRaceLaunchImpulse(owner, 2, runtime); m[savedTarget + 0x699] = 31;
  owner = ptr(m, body + 0x194); target = ptr(m, body + 0x198); put(m, body + 0x188, 16); put(m, body + 0x180, 0);
  if (m[owner + 0x718] === 8) {if (m[target + 0x718] !== 8) subtractVehicleContactScore(owner, target, 50, {...runtime, scratchBase: frame - 8});}
  else if (m[target + 0x718] === 8) addVehicleContactScore(target, owner, 50, runtime);
  let flags = get(m, 0x6eafe0); target = ptr(m, body + 0x198); owner = ptr(m, body + 0x194);
  if ((flags & 1) && (flags & 128)) {const local = get(m, 0x6e9f70), index = local === -1 ? 0 : local; if (m.readUInt16LE(target + 0x65e) === index) {m[frame + 20] = 0xac; put(m, frame + 28, index); sendGameNotificationPacket(1, frame + 20, 12, 16, {...runtime, scratchBase: frame - 12}); flags = get(m, 0x6eafe0);}}
  if (!target || !owner || m[target + 0x718] === 8 || !(flags & 1) || !(flags & 6) || !(flags & 64)) return;
  const ownerId = m.readUInt16LE(owner + 0x65e), targetId = m.readUInt16LE(target + 0x65e), seed = Math.imul(get(m, 0x5ec958), 0x41a7) & 0x7fffffff; put(m, 0x5ec958, seed); const variant = seed >>> 16 & 1;
  const resolveName = (id, output) => {
    const session = ptr(m, 0x5ecb1c); if (id >= m[session + 0x54d]) return 0x5d30d4; const name = 0x6e7894 + id * 0x67c; if (m[name]) return name;
    //4579e0 child entry=frame-4; its temporary name starts at entry-204h.
    //Its actual439850 child entry=frame-536, line buffer=entry-1010h.
    //This exact bridge avoids using arbitrary helper workspace above the
    //caller where it would overwrite later message/header stack producers.
    const handlers = {...runtime.messageHandlers, call439850: request => runtime.messageHandlers?.call439850 ? runtime.messageHandlers.call439850(request) : lookupLocalizedRow(request.ecx, request.edx, ...request.args, {memory: m, scratchBase: frame - 4648, handlers: runtime.messageHandlers ?? {}})};
    generateRacerName(output, m[session + id + 0x1c], {...runtime, scratchBase: frame - 520, handlers}); return output;
  };
  const targetName = resolveName(targetId, frame + 32), ownerName = resolveName(ownerId, frame + 64), message = frame + 96; copy(m, targetName, message);
  const session = ptr(m, 0x5ecb1c);
  if (m[session + 0x721] & 128) {const start = variant ? 0x5d33a4 : 0x5d33c4, bytes = variant ? 32 : 26, output = message + length(m, message); for (let i = 0; i < (bytes & ~3); i += 4) put(m, output + i, get(m, start + i)); if (bytes & 2) m.writeUInt16LE(m.readUInt16LE(start + (bytes & ~3)), output + (bytes & ~3));}
  else {m[message] = 0; const handlers = {...runtime.messageHandlers, sprintf: request => {if (runtime.messageHandlers?.sprintf) return runtime.messageHandlers.sprintf(request); if (typeof runtime.services?.crtCall !== 'function') throw Error('Wormhole localized phrase requires CRT sprintf service.'); return runtime.services.crtCall('sprintf', [request.destination, request.format, ...request.args], runtime);}}; formatFinishPhrase(variant + 26, ownerName, targetName, message, {...runtime, scratchBase: frame - 560, handlers});}
  if (!m[message]) return;
  const packet = (frame - 24 - Math.min(64, length(m, message)) - 9) & ~15;
  enqueueFinishNotification(message, {memory: m, scratchBase: packet, handlers: {call4a0420: request => sendGameNotificationPacket(request.ecx, request.edx, ...request.args, {...runtime, scratchBase: packet - 12})}});
}

//49b5b0. Timeout returns before zeroing; normal crossing checks always zero
//momentum after the actual transport call, including its failure path.
export function updateWormholeWait(body, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20; put(m, body + 0x180, get(m, body + 0x180) + 1);
  if (get(m, body + 0x180) >= 90) {put(m, body + 0x188, 4); put(m, body + 0x180, 0); return;}
  const target = ptr(m, body + 0x198); vector(m, target + 0x34).forEach((v, i) => put(m, frame + 8 + i * 4, v - get(m, body + 0x34 + i * 4)));
  const previous = get(m, body + 0x1dc), current = dotQ16(vector(m, frame + 8), vector(m, body + 0x1d0)); put(m, body + 0x1dc, current);
  if ((previous ^ current) < 0) {for (const offset of [0, 4, 8]) put(m, frame + 8 + offset, get(m, frame + 8 + offset) >> 12); if (measureWormholeVector(vector(m, frame + 8), runtime) < 0x700) transportWormholeTarget(body, {...runtime, scratchBase: frame - 4});}
  for (const offset of [0x40, 0x44, 0x48]) put(m, body + offset, 0);
}
//49ac30 outer stage. Unknown nonzero modes still orient and draw; mode0
//returns without either. This is not yet an integration-completeness claim.
export function updateWormholeState(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28, body = ptr(m, nativeGlobalAddress(m,0x80b5e0)), mode = get(m, body + 0x188); if (!mode) return;
  const child = {...runtime, scratchBase: frame - 4};
  if (mode === 1) updateWormholeEmergence(body, child);
  else if (mode === 2) {if (updateWormholeChase(body, child) && get(m, body + 0x2a38) !== 127) {stopVehicleSound(ptr(m, body + 0x2a38), runtime.soundRuntime ?? runtime); put(m, body + 0x2a38, 127);}}
  else if (mode === 64) {updateWormholeCapture(body, child); if (m[body + 0x2a3c] !== 255) m[body + 0x2a3c]++;}
  else if (mode === 128) updateWormholeWait(body, child);
  else if (mode === 16) retireWormhole(body, 0, child);
  else if (mode === 4) cleanup(body, true, frame, 16, 4, runtime);
  orientWormholeBody(body + 0x1ac, body + 0xc4, child); if (get(m, body + 0x188)) updateWormholeEffects(body, runtime);
}
