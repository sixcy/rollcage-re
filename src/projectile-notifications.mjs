import tables from './projectile-notification-tables.json' with {type: 'json'};
import {generateRacerName, lookupLocalizedRow, formatFinishPhrase, enqueueFinishNotification} from './finish-messages.mjs';
import {sendGameNotificationPacket} from './game-network-protocol.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const length = (m, p) => {let n = 0; while (m[p + n]) n++; return n;};
const copyString = (m, from, to) => {let value; do {value = m[from++]; m[to++] = value;} while (value);};
export function initializeProjectileNotificationTables(memory) {for (const table of tables.constants) Buffer.from(table.bytesHex, 'hex').copy(memory, Number(table.address)); return memory;}

//4724f0. Six session bytes plus the original caller-owned padding form a
//16-byte8e notification; the frame is eight-byte aligned before publishing.
export function sendProjectileSessionScores(scores, runtime) {
  const {memory: m, scratchBase} = runtime, frame = ((scratchBase - 4) & ~7) - 24; put(m, frame + 20, get(m, 0x5e8890) ^ frame);
  const flags = get(m, 0x6eafe0); if (!(flags & 1) || !(flags & 6)) return 0;
  put(m, frame + 12, get(m, scores)); const tail = m.readUInt16LE(scores + 4); m[frame + 4] = 0x8e; m.writeUInt16LE(tail, frame + 16);
  return sendGameNotificationPacket(2, frame + 4, 16, 0, {...runtime, scratchBase: frame - 12});
}

//Common actual notification blocks in46b820/44b6c0/4302f0. frame is the
//callback's post-prolog ESP. Localization's legacy workspace is mapped to
//actual native child buffers, not arbitrary memory above its caller.
export function publishProjectileImpactNotification(kind, targetId, ownerId, frame, runtime) {
  const {memory: m} = runtime, seed = Math.imul(get(m, 0x5ec958), 0x41a7) & 0x7fffffff; put(m, 0x5ec958, seed); const variant = seed >>> 16 & 1;
  const satellite = kind === 2, targetOutput = frame + (satellite ? 0x20 : 0x30), ownerOutput = targetOutput + 32, message = ownerOutput + 32;
  const resolve = (id, output) => {
    const session = ptr(m, 0x5ecb1c); if (id >= m[session + 0x54d]) return 0x5d30d4; const name = 0x6e7894 + id * 0x67c; if (m[name]) return name;
    const handlers = {call439850: request => lookupLocalizedRow(request.ecx, request.edx, ...request.args, {memory: m, scratchBase: frame - 4648})};
    generateRacerName(output, m[session + id + 0x1c], {...runtime, scratchBase: frame - 520, handlers}); return output;
  };
  const targetName = resolve(targetId, targetOutput), ownerName = resolve(ownerId, ownerOutput);
  if (satellite) put(m, frame + 0x10, ownerName);
  copyString(m, targetName, message);
  if (m[ptr(m, 0x5ecb1c) + 0x721] & 128) {
    const choices = kind === 0 ? [[0x5d3380, 33], [0x5d3368, 23]] : kind === 1 ? [[0x5d3344, 35], [0x5d3328, 25]] : [[0x5d3300, 40], [0x5d32e4, 27]], [from, bytes] = choices[variant], output = message + length(m, message);
    let i = 0; for (; i + 4 <= bytes; i += 4) put(m, output + i, get(m, from + i)); if (bytes - i >= 2) {m.writeUInt16LE(m.readUInt16LE(from + i), output + i); i += 2;} if (i < bytes) m[output + i] = m[from + i];
  } else {
    m[message] = 0; const handlers = {sprintf: request => {if (typeof runtime.services?.crtCall !== 'function') throw Error('Projectile notification requires CRT sprintf service.'); return runtime.services.crtCall('sprintf', [request.destination, request.format, ...request.args], runtime);}};
    formatFinishPhrase(variant + (kind === 0 ? 24 : kind === 1 ? 22 : 20), ownerName, targetName, message, {...runtime, scratchBase: frame - 560, handlers});
  }
  if (!m[message]) return;
  const packet = (frame - 24 - Math.min(64, length(m, message)) - 9) & ~15;
  enqueueFinishNotification(message, {memory: m, scratchBase: packet, handlers: {call4a0420: request => sendGameNotificationPacket(request.ecx, request.edx, ...request.args, {...runtime, scratchBase: packet - 12})}});
}
