import {divideQ16} from './fixed-integer.mjs';
import {packLapTime} from './lap-bookkeeping.mjs';
import {stepReplayControl} from './replay-codec.mjs';
import {sendGameNotificationPacket} from './game-network-protocol.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const child = (runtime, scratchBase) => ({...runtime, scratchBase});

//445b70. Rank-indexed pointers really occupy the native frame; retain their
//aliases and the unsigned time ordering, including one RNG addition only.
export function prepareNetworkRaceTimes(force, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 52;
  //These four ABI inputs become real snapshot padding in the subsequent
  //4702c0 call. Native callers should supply their actual preserved registers.
  for (const [name, offset] of [['edi', 0], ['esi', 4], ['ebp', 8], ['ebx', 12]]) if (Number.isInteger(runtime.nativeEntryRegisters?.[name])) put(m, frame + offset, runtime.nativeEntryRegisters[name]);
  let session = ptr(m, 0x5ecb1c);
  if (force === 1 || get(m, session + 0x57c) === 7) {
    const limit = m[session + 0x586]; put(m, frame + 16, m[session + 0x54d]);
    let earliest = 0x7fffffff;
    for (let i = 0; i < m[session + 0x54d]; i++) {const record = 0x909300 + i * 0x30c; if (m[record + 0x1c] > limit && ptr(m, record + 0x34) < (earliest >>> 0)) earliest = get(m, record + 0x34);}
    for (let i = 0; i < m[session + 0x54d]; i++) {
      const record = 0x909300 + i * 0x30c;
      if (m[record + 0x1c] <= limit) {
        const progress = ((m[record + 0x1c] - 1 << 16) + get(m, record + 0x24)) | 0;
        let estimate = 0x0fffffff;
        if (progress) {const factor = divideQ16(limit << 16, progress); put(m, frame + 16, factor); const time = get(m, record + 0x34); put(m, frame + 20, time); estimate = Number(BigInt.asIntN(32, BigInt(factor) * BigInt(time) >> 16n)); session = ptr(m, 0x5ecb1c);}
        put(m, record + 0x34, estimate);
      }
    }
    for (let i = 0; i < m[session + 0x54d]; i++) {const record = 0x909300 + i * 0x30c; put(m, frame + 20 + m[record + 0x1d] * 4, record);}
    for (let rank = 1; rank < m[session + 0x54d]; rank++) {
      const next = ptr(m, frame + 24 + rank * 4), previous = ptr(m, frame + 20 + rank * 4);
      if (ptr(m, next + 0x34) < ptr(m, previous + 0x34)) {const seed = Math.imul(get(m, 0x5ec958), 0x41a7) & 0x7fffffff; put(m, 0x5ec958, seed); put(m, next + 0x34, get(m, next + 0x34) + (seed >>> 16 & 0xfff)); session = ptr(m, 0x5ecb1c);}
    }
  }
  put(m, frame + 16, 0);
  for (let i = 0; i < m[session + 0x54d]; i++) {
    const record = 0x909300 + i * 0x30c;
    for (let field = 0; field < 3; field++) if (field !== 2 || m[session + 0x551] !== 1 && get(m, session + 0x57c) <= 7) {
      const time = get(m, record + 0x2c + field * 4);
      //445d40's actual PUSH sequence survives inside the next result packet.
      put(m, frame - 4, 0x445cf2); put(m, frame - 8, time); put(m, frame - 12, 9 + i * 55); put(m, frame - 16, field);
      if (time !== -1 && time < 0x4650000) {put(m, frame - 20, record); put(m, frame - 24, session);}
      put(m, session + 0x24 + i * 0xdc + field * 4, packLapTime(time));
    }
    m[session + 0x10 + i] = m[record + 0x1d]; put(m, frame + 16, i + 1);
  }
  put(m, frame + 12, 0x445d31); //Final compiler-cookie CALL reuses saved EBX slot.
}

//4702c0. Only authored lap rows are copied; all remaining packet padding is
//the caller's actual native stack input, never a fabricated zero buffer.
export function sendNetworkRaceSnapshot(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 0x56c, flags = get(m, 0x6eafe0);
  if (!(flags & 1) || !(flags & 6) || !(flags & 64)) return 1;
  const session = ptr(m, 0x5ecb1c), packet = frame + 32;
  m[packet] = 0x8b; put(m, frame + 28, frame + 36 - session); put(m, frame + 40, m[session + 0x586]); put(m, frame + 24, frame + 42 - session); put(m, frame + 20, 6); put(m, frame + 16, session + 36);
  for (let i = 0; i < 6; i++) {
    m[packet + 12 + i] = m[session + 16 + i]; m[packet + 18 + i] = m[session + 8 + i];
    const source = ptr(m, frame + 16), output = frame + 56 + i * 0xdc;
    for (let index = 0; index < ((ptr(m, frame + 40) + 3) >>> 0); index++) put(m, output + index * 4, get(m, source + index * 4));
    put(m, frame + 16, source + 0xdc); put(m, frame + 20, 5 - i);
  }
  return sendGameNotificationPacket(2, packet, 0x540, 2, child(runtime, frame - 12));
}

//472560 sets ECX=1 itself before445b70; no guessed incoming-register mode.
export function publishNetworkRaceResults(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 4; let flags = get(m, 0x6eafe0);
  if (!(flags & 1) || !(flags & 6)) return 0;
  if ((flags & 64) && !(flags & 0x20000) && ['edi', 'esi', 'ebp', 'ebx'].some(name => !Number.isInteger(runtime.nativeEntryRegisters?.[name]))) throw Error('Network result snapshot requires actual caller nativeEntryRegisters (edi, esi, ebp, ebx) for retained frame padding.');
  if (!(flags & 0x20000)) {prepareNetworkRaceTimes(1, child(runtime, frame - 4)); flags = get(m, 0x6eafe0);}
  if (!(flags & 64)) return 1;
  put(m, 0x6eafe0, flags | 0x20000); return sendNetworkRaceSnapshot(child(runtime, frame - 4));
}

function finishDisconnectedSession(runtime) {
  const m = runtime.memory, session = ptr(m, 0x5ecb1c), count = m[session + 0x54d]; let unfinished = false;
  for (let i = 0; i < count; i++) if (i < 6 && get(m, 0x6e7884 + i * 0x67c) && !(m[0x909549 + i * 0x30c] & 1)) {unfinished = true; break;}
  const phase = get(m, session + 0x57c);
  if (phase === 6) {put(m, session + 0x57c, unfinished ? 8 : 7); put(m, session + 0x580, 0);}
  else if (phase < 7) {put(m, session + 0x57c, 8); put(m, session + 0x580, 0);}
  put(m, 0x9020a0, 0);
}

//46fef0 guard is installed before the recursive disconnect/peer-removal.
export function endDisconnectedNetworkSession(runtime) {
  const m = runtime.memory; if (get(m, 0x6e6b34)) return;
  put(m, 0x6e6b34, 1); disconnectNetworkSession(child(runtime, runtime.scratchBase - 16)); finishDisconnectedSession(runtime);
}

//46f860. Captured settings/session pointers survive the participant scan;
//the session pointer is explicitly reloaded after the actual child calls.
export function retireNetworkParticipant(index, runtime) {
  const {memory: m, scratchBase} = runtime, frame = ((scratchBase - 4) & ~7) - 16; index >>>= 0;
  if (get(m, 0x5eb518)) return;
  const settings = ptr(m, 0x5ecefc); let session = ptr(m, 0x5ecb1c), active = 0, finished = 0;
  if (index <= 5) {m[session + index] = 8; const body = ptr(m, 0x909300 + index * 0x30c); if (body) m[body + 0x718] = 8; if (get(m, session + 0x57c) < 6) m[settings + 0x8c + index] = 0;}
  const count = m[session + 0x54d]; put(m, frame + 12, count);
  for (let i = 0; i < count; i++) {if (m[0x909549 + i * 0x30c] & 1) finished++; if (m[session + i] !== 8 && m[settings + 0x8c + i]) active++;}
  if (active < 2) {endDisconnectedNetworkSession(child(runtime, frame - 4)); session = ptr(m, 0x5ecb1c);}
  if (finished < active || get(m, session + 0x57c) !== 5) return;
  put(m, session + 0x57c, 6); put(m, session + 0x580, 0);
  if ((get(m, 0x6eafe0) & 0x81) === 0x81) {publishNetworkRaceResults({...child(runtime, frame - 4), nativeEntryRegisters: {edi: session, esi: active, ebx: finished, ebp: scratchBase - 4}}); session = ptr(m, 0x5ecb1c);}
  for (let i = 0; i < m[session + 0x54d]; i++) {
    const record = 0x909300 + i * 0x30c, controller = ptr(m, ptr(m, record) + 0x660);
    if (controller) {const state = get(m, controller + 0x1e880); if (state === 2) put(m, controller + 0x1e880, 3); else if (state === 5) put(m, controller + 0x1e880, 6);}
    stepReplayControl(ptr(m, record), runtime); stepReplayControl(ptr(m, record), runtime);
  }
  put(m, 0x91ce90, get(m, 0x91ce90) | 2); m.writeUInt16LE((get(m, 0x91ffb4) + 1) & 65535, 0x91ffb2);
}

//470ea0 has an eight-byte packet whose unused bytes remain live stack input.
export function disconnectNetworkSession(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 8, flags = get(m, 0x6eafe0);
  if (!(flags & 1) || !(flags & 6)) return 1;
  if (flags & 64) removeNetworkPeer(ptr(m, 0x6e9f70), child(runtime, frame - 4));
  else {m[frame] = 0x8a; if (!sendGameNotificationPacket(1, frame, 8, 0, child(runtime, frame - 12))) return 0;}
  put(m, 0x6eafe0, get(m, 0x6eafe0) & ~4); return 1;
}

//4723f0: game-owned countdown announcement and throttle. Its reliable send
//and tagA3 local-receiver branches keep the protocol module's explicit gaps.
export function announceNetworkCountdown(value, forced, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36, flags = get(m, 0x6eafe0), clock = ptr(m, 0x6e675c);
  if (!(flags & 1) || !(flags & 6)) return 0;
  if (!forced) {if ((flags & 128) && !(flags & 0x2000)) return 0; if (clock < ((ptr(m, 0x6eaab0) + 30) >>> 0)) return 1;}
  const packet = frame + 12;
  if (flags & 64) {m[packet] = 0xa3; put(m, packet + 8, clock + 5); put(m, packet + 12, value); return sendGameNotificationPacket(2, packet, 16, 17, child(runtime, frame - 12));}
  m[packet] = 0xa2; put(m, packet + 8, value); return sendGameNotificationPacket(1, packet, 12, 1, child(runtime, frame - 12));
}

//49f4f0. Removing the selected host participant emits actual4723f0.
export function removeNetworkPeer(index, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 12; index >>>= 0;
  if (index > 5) return 0;
  const peer = 0x6e7880 + index * 0x67c;
  if (get(m, peer)) {put(m, peer, 0); put(m, peer + 12, 0); put(m, peer + 16, 0); const count = get(m, 0x6e9f68) - 1 | 0; put(m, 0x6e9f68, count < 0 ? 0 : count);}
  if (get(m, 0x5eb518)) return 1;
  retireNetworkParticipant(index, child(runtime, frame - 4));
  if (!index) {if (!get(m, 0x5eb518) && !get(m, 0x6e6b34)) {put(m, 0x6e6b34, 1); disconnectNetworkSession(child(runtime, frame - 4)); finishDisconnectedSession(runtime);}}
  else if (index === ptr(m, 0x6eaab8) && get(m, 0x6e6b4c) === 1 && (m[0x6eafe0] & 64)) {
    announceNetworkCountdown(0, 1, child(runtime, frame - 4));
  }
  return 1;
}
