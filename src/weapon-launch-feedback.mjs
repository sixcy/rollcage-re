import {generateRacerName, lookupLocalizedRow, formatFinishPhrase, enqueueFinishNotification} from './finish-messages.mjs';
import {sendGameNotificationPacket} from './game-network-protocol.mjs';
export {initializeProjectileNotificationTables as initializeWeaponLaunchFeedbackTables} from './projectile-notifications.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const length = (m, p) => {let n = 0; while (m[p + n]) n++; return n;};
const copyString = (m, from, to) => {let value; do {value = m[from++]; m[to++] = value;} while (value);};
const appendBytes = (m, message, from, count) => {const out = message + length(m, message); let i = 0; for (; i + 4 <= count; i += 4) put(m, out + i, get(m, from + i)); if (count - i >= 2) {m.writeUInt16LE(m.readUInt16LE(from + i), out + i); i += 2;} if (i < count) m[out + i] = m[from + i];};

//46ffa0. First local participant or zero, including an empty participant list.
export function findLocalWeaponParticipant({memory: m}) {
  const count = m[ptr(m, 0x5ecb1c) + 0x54d]; for (let i = 0; i < count; i++) if (m[0x90931d + i * 0x30c] === 1) return i; return 0;
}
function name(id, output, frame, runtime) {
  const {memory: m} = runtime, session = ptr(m, 0x5ecb1c); if ((id >>> 0) >= m[session + 0x54d]) return 0x5d30d4;
  const peer = 0x6e7894 + Math.imul(id, 0x67c); if (m[peer]) return peer;
  generateRacerName(output, m[session + id + 0x1c], {...runtime, scratchBase: frame - 520, handlers: {call439850: request => lookupLocalizedRow(request.ecx, request.edx, ...request.args, {memory: m, scratchBase: frame - 4648})}}); return output;
}
function format(index, first, second, output, frame, runtime) {
  formatFinishPhrase(index, first, second, output, {...runtime, scratchBase: frame - 560, handlers: {sprintf: request => {
    if (typeof runtime.services?.crtCall !== 'function') throw Error('Weapon feedback requires CRT sprintf service.');
    return runtime.services.crtCall('sprintf', [request.destination, request.format, ...request.args], runtime);
  }}});
}
function enqueue(message, frame, runtime) {
  const {memory: m} = runtime; if (!m[message]) return;
  const packet = (frame - 24 - Math.min(64, length(m, message)) - 9) & ~15;
  enqueueFinishNotification(message, {memory: m, scratchBase: packet, handlers: {call4a0420: request => sendGameNotificationPacket(request.ecx, request.edx, ...request.args, {...runtime, scratchBase: packet - 12})}});
}
const literals = [
  [[0x5d30fc, 40], [0x5d30d8, 35]], [[0x5d313c, 22], [0x5d3124, 23]], [[0x5d3174, 10], [0x5d3154, 31]],
  [[0x5d31ac, 32], [0x5d3190, 27]], [[0x5d31e4, 25], [0x5d31cc, 21]], [[0x5d3220, 36], [0x5d3200, 30]],
  [[0x5d326c, 38], [0x5d3244, 40]], [[0x5d32b0, 22], [0x5d3294, 26]], [[0x5d32c8, 25], [0x5d32c8, 25]],
  [[0x5d3300, 40], [0x5d32e4, 27]], [[0x5d3344, 35], [0x5d3328, 25]], [[0x5d3380, 33], [0x5d3368, 23]],
  [[0x5d33c4, 26], [0x5d33a4, 32]],
];
const phraseOffsets = [6, 4, 8, 12, 14, 16, 18, 10, 0, 20, 22, 24, 26, 2];

//4728a0. IDs are full unsigned DWORDs; the stack kind is masked to7 bits only
//after the network/forced-message guards. All strings remain mutable raw bytes.
export function publishWeaponLaunchFeedback(firstId, secondId, kind, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 212;
  put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - 200)); put(m, frame + 12, secondId);
  const flags = get(m, 0x6eafe0); if (!(flags & 1) || !(flags & 6) || (!(flags & 64) && ((kind << 24 >> 24) >= 0))) return;
  kind &= 127; put(m, scratchBase + 4, kind);
  const seed = Math.imul(get(m, 0x5ec958), 0x41a7) & 0x7fffffff; put(m, 0x5ec958, seed); const variant = seed >>> 16 & 1;
  const first = name(firstId, frame + 0x90, frame, runtime), second = name(get(m, frame + 12), frame + 0xb0, frame, runtime), message = frame + 0x10;
  put(m, frame + 12, message - first); copyString(m, first, message);
  if (m[ptr(m, 0x5ecb1c) + 0x721] & 128) {
    if (kind > 12) return; const [from, count] = literals[kind][variant]; appendBytes(m, message, from, count);
    if (kind === 2 && !variant) {const local = 0x6e7894 + findLocalWeaponParticipant(runtime) * 0x67c; copyString(m, local, message + length(m, message)); appendBytes(m, message, 0x5d3180, 15);}
  } else {
    if (kind > 15) return; m[message] = 0; const index = kind >= 14 ? kind + 14 : variant + phraseOffsets[kind];
    format(index, kind >= 9 && kind <= 12 ? second : first, kind >= 9 && kind <= 12 ? first : second, message, frame, runtime);
  }
  enqueue(message, frame, runtime);
}

//The inline47be20 wormhole feedback shares the kind7 text policies, but has
//different native output buffers and stores its second name in frame+c.
export function publishWormholeWeaponFeedback(ownerId, frame, runtime) {
  const {memory: m} = runtime, flags = get(m, 0x6eafe0); if (!(flags & 1) || !(flags & 6) || !(flags & 64)) return;
  const seed = Math.imul(get(m, 0x5ec958), 0x41a7) & 0x7fffffff; put(m, 0x5ec958, seed); const variant = seed >>> 16 & 1;
  const first = name(ownerId, frame + 0x38, frame, runtime), second = name(0, frame + 0x18, frame, runtime), message = frame + 0x58; put(m, frame + 12, second); copyString(m, first, message);
  if (m[ptr(m, 0x5ecb1c) + 0x721] & 128) {const [from, count] = literals[7][variant]; appendBytes(m, message, from, count);}
  else {m[message] = 0; format(variant + 10, first, get(m, frame + 12), message, frame, runtime);}
  enqueue(message, frame, runtime);
}
