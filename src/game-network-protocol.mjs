import {checksumNotificationPacket, constructNotificationAddress, isNotificationTransportReady} from './vehicle-auxiliary-input.mjs';
import {reportGameDiagnostic} from './game-diagnostics.mjs';
import {retireNetworkParticipant} from './network-session-retirement.mjs';
import {launchVehicleWeapon} from './vehicle-weapon-launch.mjs';
import tables from './game-network-protocol-tables.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const required = (runtime, name, request) => {if (typeof runtime.handlers?.[name] !== 'function') throw Error(`Game network requires reached game handler ${name}.`); return runtime.handlers[name](request);};
const platform = (runtime, name, args) => {if (typeof runtime.services?.platformCall !== 'function') throw Error(`Game network requires platform service ${name}.`); return runtime.services.platformCall(name, args, runtime);};
const network = (runtime, object, method, args) => {if (typeof runtime.services?.networkCall !== 'function') throw Error(`Game network requires network interface service0x${method.toString(16)}.`); return runtime.services.networkCall(object, method, args, runtime);};
const i64 = value => BigInt.asIntN(64, value), u64 = value => BigInt.asUintN(64, value);
export function initializeGameNetworkProtocolTables(memory) {for (const table of tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}
//Native MOVSB, MOVSW then REP MOVSD order, including forward overlap.
export function copyProtocolBytes(source, output, length, {memory: m}) {
  length >>>= 0; let done = 0;
  if (length & 1) {m[output++] = m[source++]; done++;}
  if (length & 2) {const value = m.readUInt16LE(source); m.writeUInt16LE(value, output); source += 2; output += 2; done += 2;}
  for (; done < length; done += 4, source += 4, output += 4) put(m, output, get(m, source));
}
//489cd0: actual lazy performance-counter origin and signed64 scaling. CRT
//64-bit arithmetic is implemented with BigInt and native wrap/truncation.
export function readGameMicroseconds(runtime) {
  const {memory: m, scratchBase} = runtime, frame = ((scratchBase - 4) & ~7) - 32;
  if (!get(m, 0x6e6c8c)) {put(m, 0x6e6c8c, 1); if (platform(runtime, 'QueryPerformanceFrequency', [0x7135a4])) platform(runtime, 'QueryPerformanceCounter', [0x7135ac]);}
  platform(runtime, 'QueryPerformanceCounter', [frame + 24]);
  const delta = i64(m.readBigInt64LE(frame + 24) - m.readBigInt64LE(0x7135ac)), frequency = m.readBigInt64LE(0x7135a4), quotient = delta / frequency;
  const remainder = i64(delta - i64(frequency * quotient)), fraction = i64(remainder * 1000000000n) / frequency, whole = i64(quotient * 1000000000n);
  return i64(fraction + whole) / 1000n;
}

//46ffd0/49f4b0/46fff0: live peer availability/address/relay selection.
export function isProtocolPeerActive(index, {memory: m}) {return (index >>> 0) < 6 && get(m, 0x6e7880 + index * 0x67c) ? 1 : 0;}
export function findProtocolPeer(low, high, {memory: m}) {for (let i = 0; i < 6; i++) {const p = 0x6e7880 + i * 0x67c; if (get(m, p) && ptr(m, p + 12) === (low >>> 0) && ptr(m, p + 16) === (high >>> 0)) return i;} return -1;}
export function hasProtocolRelay(excluded, {memory: m}) {for (let i = 0; i < 6; i++) if (i !== (excluded >>> 0) && i !== ptr(m, 0x6e9f6c) && get(m, 0x6e7880 + i * 0x67c)) return 1; return 0;}

//4a00c0:32-row pending ring and caller-owned payload arena, no allocator.
export function retainProtocolPacket(routing, packet, senderLow, senderHigh, targetLow, targetHigh, length, runtime) {
  const {memory: m} = runtime, row = 0x6eaacc + m[0x6eaecc] * 32; let data = ptr(m, 0x6eaed8);
  const ebp = runtime.scratchBase - 4; put(m, ebp - 8, packet);
  if (((data + length) >>> 0) > ptr(m, 0x6eaed4)) data = ptr(m, 0x6eaed0);
  const end = data + length >>> 0; put(m, ebp - 12, data); put(m, ebp - 16, end); if (end > ptr(m, 0x6eaed4)) return 0;
  for (const [offset, value] of [[8, senderLow], [12, senderHigh], [16, targetLow], [20, targetHigh], [24, routing], [0, data], [4, length], [28, 0]]) put(m, row + offset, value);
  copyProtocolBytes(packet, data, length, runtime); put(m, 0x6eaed8, end); const next = m[0x6eaecc] + 1 & 255; m[0x6eaecc] = next < 32 ? next : 0; return 1;
}
//49fa20:100 outstanding send records; sequence is lowCX, no guessed IDs.
export function accountProtocolSend(sequence, transportValue, low, high, unused, flags, runtime) {
  const {memory: m} = runtime;
  for (let p = 0x6e9f7c; p < 0x6ea67c; p += 28) if (!get(m, p)) {
    const clock = u64(readGameMicroseconds({...runtime, scratchBase: runtime.scratchBase - 16})), frame = runtime.scratchBase - 12;
    //The caller's actual __aulldiv arguments survive below ESP and become
    //the next broadcast peer's imported-address padding.
    [Number(clock & 0xffffffffn), Number(clock >> 32n), 1000, 0].forEach((value, i) => put(m, frame - 16 + i * 4, value));
    const milliseconds = clock / 1000n;
    put(m, p + 12, Number(milliseconds & 0xffffffffn)); put(m, p + 4, low); put(m, p + 8, high); put(m, p + 16, transportValue); word(m, p + 20, sequence); word(m, p + 22, flags); put(m, p + 24, 0); put(m, p, 1); return 1;
  }
  return 0;
}

//4a01d0 computes the real full-word checksum, then the receiver reduces it
//to its saved low byte. The generic receiver's other tags are NOT implicit.
export function dispatchLocalProtocolPacket(packet, length, runtime) {
  const {memory: m, scratchBase} = runtime; put(m, packet + 4, 0); put(m, packet + 4, checksumNotificationPacket(packet, length, runtime));
  const frame = ((scratchBase - 4) & ~7) - 8;
  return receiveWormholeProtocolPacket(packet, length, ptr(m, 0x6e9f74), ptr(m, 0x6e9f78), {...runtime, scratchBase: frame - 20});
}

//49fcd0: imported status and real participant/session/replay retirement.
export function handleFailedProtocolPeer(low, high, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20;
  if (ptr(m, 0x6e6d10)) {
    const address = frame - 40;
    put(m, address, get(m, 0x5e8280)); put(m, address + 4, get(m, 0x5e8284)); word(m, address + 8, m.readUInt16LE(0x5e8288)); m.fill(0, address + 16, address + 32); word(m, address + 16, 2); put(m, address + 32, 0xffff0000);
    put(m, address, low); put(m, address + 4, high); word(m, address + 8, 65535); Buffer.from(m.subarray(0x6f2424, 0x6f2434)).copy(m, address + 16); word(m, address + 34, m.readUInt16LE(0x6f2436)); word(m, address + 32, m.readUInt16LE(0x6f2434));
    if ((network(runtime, ptr(m, 0x6e6d10), 0x6c, Array.from({length: 10}, (_, i) => ptr(m, address + i * 4))) | 0) >= 3) {
      for (let i = 0; i < 6; i++) {const p = 0x6e788c + i * 0x67c; if (ptr(m, p) === (low >>> 0) && ptr(m, p + 4) === (high >>> 0)) {put(m, p - 12, 0); put(m, frame - 4, 0x49fd6b); /*Actual CALL return slot becomes the next peer's imported address padding.*/ if (runtime.handlers?.retireProtocolPeer) runtime.handlers.retireProtocolPeer({memory: m, index: i, scratchBase: frame - 4}); else retireNetworkParticipant(i, {...runtime, scratchBase: frame - 4}); break;}}
      return 1;
    }
  }
  return findProtocolPeer(low, high, runtime) < 0 ? 1 : 0;
}

//4a0210. sendInterface50 is the genuine imported network object service;
//all header/checksum/pending/accounting/failed-peer policies execute here.
export function sendProtocolPeer(packet, length, low, high, flags, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 40, tracked = flags & 3 ? 1 : 0; length >>>= 0;
  if (length < 8) return 0;
  if (!ptr(m, 0x6e6d10) || !isNotificationTransportReady(runtime)) return 1;
  if ((low >>> 0) === ptr(m, 0x6e9f74) && (high >>> 0) === ptr(m, 0x6e9f78)) {if (flags & 16) dispatchLocalProtocolPacket(packet, length, {...runtime, scratchBase: frame - 4}); return 1;}
  const routing = ((~flags) & 8 | (tracked ? 0x30 : 0)) >>> 3;
  let sequence = 65535; if (tracked) {sequence = m.readUInt16LE(0x6e6d14) + 1 & 65535; word(m, 0x6e6d14, sequence);} word(m, packet + 2, sequence); m[packet + 1] = m[0x6e65db]++; put(m, packet + 4, checksumNotificationPacket(packet, length, runtime));
  //Pending-call arguments remain below ESP after ADD ESP18h. The imported
  //40-byte address leaves its last DWORD uninitialized and observes this
  //actual target-high argument at frame-12; do not invent padding zeroes.
  [ptr(m, 0x6e9f74), ptr(m, 0x6e9f78), low, high, length].forEach((value, i) => put(m, frame - 24 + i * 4, value));
  retainProtocolPacket(routing, packet, ptr(m, 0x6e9f74), ptr(m, 0x6e9f78), low, high, length, {...runtime, scratchBase: frame - 28});
  put(m, frame + 24, low); put(m, frame + 28, high); word(m, frame + 32, 65535);
  const address = frame - 48; constructNotificationAddress(address, frame + 24, runtime);
  const args = [packet, length, ~(flags >>> 5) & 1, routing, 0, ...Array.from({length: 10}, (_, i) => ptr(m, address + i * 4)), 0, 0];
  args.forEach((value, i) => put(m, frame - 68 + i * 4, value));
  const sent = network(runtime, ptr(m, 0x6e6d10), 0x50, args) | 0;
  if (!sent) {if (!handleFailedProtocolPeer(low, high, {...runtime, scratchBase: frame - 12})) {put(m, 0x6eafe0, get(m, 0x6eafe0) | 32); return 0;}}
  else {
    if (tracked) accountProtocolSend(m.readUInt16LE(packet + 2), sent, low, high, 0, flags & 4, {...runtime, scratchBase: frame - 20});
    if (flags & 1) required(runtime, 'waitReliableProtocolSend', {memory: m, sequence: m.readUInt16LE(packet + 2), scratchBase: frame - 4});
  }
  return 1;
}

//4a0420 exact entryESP adapter, including mode2 broadcast and live globals.
//Generic receive/retirement/reliable-wait remain explicit reached game gaps.
export function sendGameNotificationPacket(mode, packet, length, flags, runtime) {
  const {memory: m, scratchBase} = runtime, frame = ((scratchBase - 4) & ~7) - 32, local = get(m, 0x6e9f70), participant = local === -1 ? 0 : local;
  if (participant < 0 || participant >= 6 || !get(m, 0x6e7880 + participant * 0x67c)) return 1;
  if (mode === 1) {
    if (m[0x6eafe0] & 64) {if (flags & 16) dispatchLocalProtocolPacket(packet, length, {...runtime, scratchBase: frame - 4}); return 1;}
    const peer = get(m, 0x6e9f6c); if (!isProtocolPeerActive(peer, runtime)) {put(m, 0x6e1e78, 0); return 0;}
    put(m, 0x6e1e78, 1); const address = 0x6e788c + Math.imul(peer, 0x67c); return sendProtocolPeer(packet, length, ptr(m, address), ptr(m, address + 4), flags, {...runtime, scratchBase: frame - 16});
  }
  if (mode !== 2) return 0;
  if (flags & 3) {for (let i = 0; i < 6; i++) if (isProtocolPeerActive(i, runtime)) {const p = 0x6e788c + i * 0x67c; if (!sendProtocolPeer(packet, length, ptr(m, p), ptr(m, p + 4), flags, {...runtime, scratchBase: frame - 16})) return 0;} return 1;}
  if ((length >>> 0) < 8) return 0; if (!ptr(m, 0x6e6d10) || !isNotificationTransportReady(runtime)) return 1;
  if (flags & 16) dispatchLocalProtocolPacket(packet, length, {...runtime, scratchBase: frame - 4});
  //Checksum4a0180 saves this caller's EBP at frame-12. That DWORD later
  //becomes the imported address's otherwise-uninitialized last DWORD.
  put(m, frame - 12, scratchBase - 4);
  word(m, packet + 2, 65535); m[packet + 1] = m[0x6e65db]++; put(m, packet + 4, checksumNotificationPacket(packet, length, runtime));
  const values = frame + 16, address = frame - 48; put(m, values, get(m, 0x6e9f74)); put(m, values + 4, get(m, 0x6e9f78)); word(m, values + 8, 65535); constructNotificationAddress(address, values, runtime);
  const args = [packet, length, ~(flags >>> 5) & 1, (~flags & 8) >>> 3, 0, ...Array.from({length: 10}, (_, i) => ptr(m, address + i * 4)), 1, 0]; args.forEach((value, i) => put(m, frame - 68 + i * 4, value));
  const sent = network(runtime, ptr(m, 0x6e6d10), 0x50, args); return sent ? 1 : 0;
}

//4710f0. Tag91 payload wrapper; unspecified header bytes remain raw stack
//inputs. Length cap/participant/context gates are the actual native order.
export function sendWormholeLaunchPacket(participant, transportContext, tag, payload, length, runtime) {
  const {memory: m, scratchBase} = runtime, ebp = scratchBase - 4;
  //4710f0 PUSH EBP and471100 MOV [EBP-4],cookie execute before every
  //network guard. These words can be consumed by a later caller's payload.
  if (Number.isInteger(scratchBase)) {
    if (Number.isInteger(runtime.entryRegisters?.EBP)) put(m, ebp, runtime.entryRegisters.EBP);
    put(m, ebp - 4, ptr(m, 0x5e8890) ^ ebp);
  }
  const flags = get(m, 0x6eafe0);
  if (!(flags & 1) || !(flags & 6) || !(flags & 128)) return 1;
  const total = length + 12 >>> 0; if (total > 256) {reportGameDiagnostic(0x5d308c, [], {...runtime, scratchBase: ebp - 0x120}); return 0;}
  if ((participant >>> 0) > 5 || (transportContext >>> 0) > 1) return 1;
  const packet = ebp - 0x104; m[packet] = 0x91;
  let packed = get(m, packet + 8); packed ^= (packed ^ participant) & 31; packed ^= (packed ^ transportContext << 5) & 0x3e0; packed ^= (packed ^ tag << 10) & 0x7c00; packed = (packed & 0x7fff) | length << 15; put(m, packet + 8, packed);
  copyProtocolBytes(payload, packet + 12, length, runtime);
  return sendGameNotificationPacket(1, packet, total, 0x12, {...runtime, scratchBase: ebp - 0x124});
}

//4a03d0: reply wrapper checks local membership before the actual peer sender.
export function replyProtocolPacket(packet, length, low, high, flags, runtime) {
  const {memory: m, scratchBase} = runtime, local = get(m, 0x6e9f70), index = local === -1 ? 0 : local;
  if (index < 0 || index >= 6 || !get(m, 0x6e7880 + index * 0x67c)) return 1;
  return sendProtocolPeer(packet, length, low, high, flags, {...runtime, scratchBase: ((scratchBase - 4) & ~7) - 16});
}
//49df90: remote transport completion advances the matching active wormhole.
export function finishRemoteWormholeTransport(participant, {memory: m}) {
  const body = ptr(m, 0x80b5e0);
  if (body && ptr(m, body + 0x198) && m.readUInt16LE(ptr(m, body + 0x198) + 0x65e) === (participant >>> 0) && get(m, body + 0x188) !== 16 && get(m, body + 0x188) !== 0) {put(m, body + 0x188, 16); put(m, body + 0x180, 0);}
}
//470030: actual corrupt-packet response producer, with explicit imported I/O.
export function reportCorruptProtocolPacket(sequence, low, high, runtime) {
  const {memory: m, scratchBase} = runtime, frame = ((scratchBase - 4) & ~7) - 16;
  if (!isNotificationTransportReady(runtime)) return;
  m[frame] = 0xaf; put(m, frame + 8, sequence); const local = get(m, 0x6e9f70), index = local === -1 ? 0 : local;
  if (index >= 0 && index < 6 && get(m, 0x6e7880 + index * 0x67c)) sendProtocolPeer(frame, 12, low, high, 0, {...runtime, scratchBase: frame - 16});
}
//46f6d0. Incoming game item IDs remain numeric. The selected slot is the
//actual context propagated by47be20 into its item-specific feedback helper.
export function activateProtocolItem(participant, code, slot, length, payload, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 8;
  if ((participant >>> 0) > 5 || (slot >>> 0) > 1) return;
  const record = 0x909300 + Math.imul(participant, 0x30c); m[ptr(m, record) + 0x68c + slot] = code & 255;
  if ((code >>> 0) > 7) return;
  let liveEcx = participant;
  if ([0, 1, 2, 7].includes(code) && length !== 96) {reportGameDiagnostic([0x5d2ff0, 0x5d3014, 0x5d3034, 0x5d3058][code === 7 ? 3 : code], [], {...runtime, scratchBase: frame - 8}); liveEcx = get(m, 0x5e8890);}
  if (runtime.handlers?.call47be20) required(runtime, 'call47be20', {memory: m, ecx: record, edx: slot, args: [0, liveEcx, payload], scratchBase: frame - 16});
  else launchVehicleWeapon(record, slot, 0, liveEcx, payload, {...runtime, scratchBase: frame - 16});
}
//4730d0 wormhole-domain receiver: original checksum front,91 activation,
//ac/99 retirement+snapshot reply,9a snapshot accept andae history. Other
//in-range protocol tags fail explicitly: the general receiver is unfinished.
export function receiveWormholeProtocolPacket(packet, length, low, high, runtime) {
  const {memory: m, scratchBase} = runtime, frame = ((scratchBase - 4) & ~7) - 0x7c8, saved = m[packet + 4];
  put(m, packet + 4, 0); let sum = 0; for (let i = 0; i < (length | 0); i++) sum = sum + m[packet + i] | 0; put(m, packet + 4, saved);
  if ((sum & 255) !== saved) {reportCorruptProtocolPacket(m.readUInt16LE(packet + 2), low, high, {...runtime, scratchBase: frame - 12}); return;}
  const tag = m[packet];
  if (tag === 0xae) {
    for (const source of [0x6eaf5e, 0x6eaf1d, 0x6eaedc]) {let from = source, to = source + 65, value; do {value = m[from++]; m[to++] = value;} while (value);}
    let from = packet + 8, to = 0x6eaedc, value; do {value = m[from++]; m[to++] = value;} while (value); put(m, 0x6e6764, 1); return;
  }
  if (tag === 0x9a) {for (let i = 0; i < 66; i++) put(m, 0x6e6d20 + i * 4, get(m, packet + 8 + i * 4)); put(m, 0x6eafe0, get(m, 0x6eafe0) & ~0x8000 | 0x10000); return;}
  if (tag === 0x91) {
    const packed = ptr(m, packet + 8), local = get(m, 0x6e9f70), participant = packed & 31;
    if ((local === -1 ? 0 : local) !== participant) activateProtocolItem(participant, packed >>> 10 & 31, packed >>> 5 & 31, packed >>> 15, packet + 12, {...runtime, scratchBase: frame - 16});
    if ((m[0x6eafe0] & 64) && hasProtocolRelay(findProtocolPeer(low, high, runtime), runtime)) sendGameNotificationPacket(2, packet, length, 0, {...runtime, scratchBase: frame - 12}); return;
  }
  if (tag === 0xac || tag === 0x99) {
    if (tag === 0xac) {const local = get(m, 0x6e9f70); if ((local === -1 ? 0 : local) !== get(m, packet + 8)) finishRemoteWormholeTransport(ptr(m, packet + 8), runtime); if ((m[0x6eafe0] & 64) && hasProtocolRelay(findProtocolPeer(low, high, runtime), runtime)) sendGameNotificationPacket(2, packet, length, 0, {...runtime, scratchBase: frame - 12});}
    const response = frame + 0x30; m[response] = 0x9a; const selected = get(m, 0x6e787c), row = 0x6e6e28 + Math.imul(selected, 264);
    if (selected >= 0 && get(m, row) === 1) {const flags = get(m, 0x6eafe0); for (let i = 0; i < 66; i++) put(m, response + 8 + i * 4, get(m, row + i * 4)); put(m, response + 12, flags >>> 14 & 1);}
    else m.fill(0, response + 8, response + 8 + 264);
    replyProtocolPacket(response, 272, low, high, 2, {...runtime, scratchBase: frame - 16}); return;
  }
  if (tag >= 0x87 && tag <= 0xae) throw Error(`General network receiver tag0x${tag.toString(16)} is outside the recovered wormhole protocol domain.`);
}
