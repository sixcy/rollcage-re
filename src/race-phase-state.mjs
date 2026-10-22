import {finishLapBookkeeping} from './lap-bookkeeping.mjs';
import {pollInputPacket} from './vehicle-input-packets.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {startRaceLaunch} from './race-launch-state.mjs';
import {updateRaceMusicState, setRaceAudioVolume, setRaceSerialVolume} from './race-phase-audio.mjs';

const get = (memory, address) => memory.readInt32LE(address);
const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const eax = result => {
  const value = typeof result === 'number' ? result : result?.eax;
  if (!Number.isInteger(value)) throw Error('Race phase requires an explicit reached callee EAX.');
  return value | 0;
};

//42a4e0 changes only an already-active transition controller.
export function setRaceTransitionInputState(value, {memory}) {
  if (get(memory, 0x91e744)) {put(memory, 0x91e744, value); put(memory, 0x91e740, 0);}
}

//471800 preserves ECX; only EAX communicates the network-client condition.
export function isRaceNetworkClient({memory}) {
  const flags = pointer(memory, 0x6eafe0);
  return flags & 1 ? (flags >>> 7) & 1 : 0;
}

//479360 positions two mode-four text indicators. Authored UI strings and the
//separate48b7d0 text/animation allocator remain explicit caller-owned inputs.
export function spawnRaceModeFourIndicators(runtime) {
  const {memory, scratchBase, handlers = {}} = runtime, settings = pointer(memory, 0x5ecefc);
  const factor = memory[settings + 0x41a] && get(memory, 0x6e6c04) ? 2 : 1;
  const width = (Math.imul(memory.readUInt16LE(settings + 0x42c), factor) - 20) | 0;
  const y = ((Math.imul(memory.readUInt16LE(settings + 0x42e), factor) >>> 1) - 60) | 0;
  if (typeof handlers.call48b7d0 !== 'function') throw Error('Race phase requires reached game handler call48b7d0.');
  for (const [slot, offset] of [[0x70ea94, 0], [0x70ea98, 22]]) {
    const scale = get(memory, 0x91d338);
    handlers.call48b7d0({memory, ecx: pointer(memory, slot), edx: 0, args: [Math.imul(scale, width) >>> 8, Math.imul(scale, (y + offset) | 0) >>> 8, 49, 0, 0], scratchBase: scratchBase - 36});
  }
}

//42b330: retrieve/convert every current input packet, attach it to the captured
//body and OR the native decoded digital masks. Producers are already sampled.
export function aggregateRaceInput(runtime) {
  const {memory, scratchBase} = runtime, status = scratchBase - 12;
  let result = 0, index = 0;
  while (index < memory[pointer(memory, 0x5ecb1c) + 0x54d]) {
    const body = pointer(memory, 0x909300 + index * 0x30c), packet = 0x6e7edc + index * 0x67c;
    pollInputPacket(index, body + 0x724, status, {memory});
    result |= ((~memory.readUInt16BE(packet + 2)) & 65535) | (memory.readUInt16LE(packet + 4) << 16);
    index++;
  }
  return result | 0;
}

//47f370. All phase/counter branches are implemented; remaining large UI,
//pause, result finalization and network lifecycle parents are reached hooks.
export function updateRacePhaseState(runtime) {
  const {memory, scratchBase, handlers = {}} = runtime, frame = scratchBase - 28;
  let session = pointer(memory, 0x5ecb1c), phase = get(memory, session + 0x57c), counter = get(memory, session + 0x580);
  let committedPhase = false;
  put(memory, scratchBase - 12, phase); put(memory, 0x6e6ba4, phase);
  const invoke = (id, ecx, edx, args = []) => {
    const context = {...runtime, scratchBase: frame - args.length * 4 - 4}, request = {memory, ecx, edx, args, scratchBase: context.scratchBase};
    if (handlers[`call${id}`]) return handlers[`call${id}`](request);
    if (id === '42a4e0') return setRaceTransitionInputState(ecx, context);
    if (id === '479360') return spawnRaceModeFourIndicators(context);
    if (id === '471800') return isRaceNetworkClient(context);
    if (id === '42b330') return aggregateRaceInput(context);
    if (id === '449be0') {finishLapBookkeeping(ecx, context); return {ecx};}
    if (id === '4843a0') return updateRaceMusicState(ecx, context);
    if (id === '484dd0') return setRaceAudioVolume(ecx, context);
    if (id === '484440') return setRaceSerialVolume(ecx, context);
    if (id === '48d6e0') return startRaceLaunch(ecx, edx, args[0], context);
    if (id === '484bb0') return emitNativeEffect(ecx, edx, args, {dispatch40ea40: request => dispatchNativeSound(request, context)});
    throw Error(`Race phase requires reached game handler call${id}.`);
  };
  if (phase === 1) {
    if (!counter && memory[session + 0x551] === 4) {invoke('479360'); session = pointer(memory, 0x5ecb1c);}
    counter = (counter + 1) | 0;
    if (counter >= 15) {phase = 2; committedPhase = true; invoke('42a4e0', 2); counter = 0;}
  } else if (phase === 2) {
    counter = (counter + 1) | 0;
    if (counter >= 150) {
      phase = 3; committedPhase = true; invoke('484bb0', 41, 0, [0, 1300, 16000, 6, runtime.entryEcx ?? 0, 0, 0]); invoke('42a4e0', 4);
      session = pointer(memory, 0x5ecb1c); counter = 63;
    }
  } else if (phase === 3) {
    const previous = counter; counter = (counter - 1) | 0;
    if ((counter >>> 0) <= 30 && previous % 10 === 0 && get(memory, 0x7130b0) > 0) {put(memory, 0x7130b0, get(memory, 0x7130b0) - 1); put(memory, 0x712fbc, 0);}
    if (!counter) {
      const clock = get(memory, 0x90a548) << 11, timestamp = Math.floor((clock >>> 0) / 3);
      let index = 0, liveEcx = clock;
      while (index < memory[session + 0x54d]) {
        const record = 0x909300 + index * 0x30c, body = pointer(memory, record);
        put(memory, body + 0x650, get(memory, body + 0x6b0)); put(memory, record + 0x50, timestamp);
        invoke('449be0', record); liveEcx = record; index++;
      }
      phase = 4; committedPhase = true; put(memory, scratchBase - 16, 0);
      invoke('484bb0', 42, 0, [0, 1300, 16000, 6, liveEcx, 0, 0]); invoke('4843a0', 0);
      session = pointer(memory, 0x5ecb1c); counter = get(memory, scratchBase - 16);
      if (get(memory, 0x91e744)) {put(memory, 0x91e744, 5); put(memory, 0x91e740, 0);}
    }
  } else if (phase === 4) {
    if (counter <= 200) {
      const count = memory[session + 0x54d];
      for (let index = 0; index < count; index++) {
        const record = 0x909300 + index * 0x30c, body = pointer(memory, record), boost = get(memory, body + 0x6b0);
        if (boost > 0) {const value = (boost - ((memory[body + 0x64d] << 8) <= boost ? 1500 : 512)) | 0; put(memory, body + 0x6b0, value < 0 ? -1 : value);}
        else if (!boost && counter < 7 && memory[body + 0x64d]) invoke('48d6e0', record, 0, [(counter + 1) | 0]);
      }
      if (count) session = pointer(memory, 0x5ecb1c);
    }
    counter = (counter + 1) | 0;
  } else if (phase === 5) {
    counter = (counter + 1) | 0; invoke('478fa0'); session = pointer(memory, 0x5ecb1c);
  } else if (phase === 6) {
    put(memory, scratchBase - 16, counter + 1);
    if (eax(invoke('42b330')) & 0x800) {
      committedPhase = true;
      const network = pointer(memory, 0x6eafe0);
      let sent = false;
      if ((network & 1) && (network & 6)) {
        memory[scratchBase - 12] = 0xa0;
        sent = eax(invoke('4a0420', 1, scratchBase - 12, [8, 17])) !== 0;
      }
      if (sent) {const current = pointer(memory, 0x5ecb1c); phase = get(memory, current + 0x57c); put(memory, scratchBase - 16, get(memory, current + 0x580));}
      else {phase = 7; put(memory, scratchBase - 16, 0);}
    }
    if (!committedPhase) {phase = get(memory, scratchBase - 12); committedPhase = true;}
    invoke('478fa0'); session = pointer(memory, 0x5ecb1c); counter = get(memory, scratchBase - 16);
  } else if (phase >= 7 && phase <= 11) {
    invoke('478fa0'); session = pointer(memory, 0x5ecb1c);
    if (!counter && memory[session + 0x54f] === 1) memory[session + 0x54f] = 2;
    counter = (counter + 1) | 0; put(memory, scratchBase - 16, counter);
    if (counter > 60) {
      if (!memory[session + 0x58c] && (!(memory[0x6eafe0] & 1) || !eax(invoke('471800')))) {invoke('445b70', 0); session = pointer(memory, 0x5ecb1c);}
      if (memory[session + 0x54f] === 2) memory[session + 0x54f] = 1;
      return 1;
    }
    const factor = Math.max(0, (50 - counter) | 0), first = Math.imul(Math.trunc(memory.readInt16LE(session + 0xa7c) / 50), factor), second = Math.imul(Math.trunc(memory.readInt16LE(session + 0xa7e) / 50), factor);
    invoke('484dd0', first); invoke('484440', second);
    session = pointer(memory, 0x5ecb1c); counter = get(memory, scratchBase - 16); phase = get(memory, scratchBase - 12);
  }
  if (!committedPhase) phase = get(memory, scratchBase - 12);
  put(memory, session + 0x580, counter); const playback = memory[session + 0x58c]; put(memory, session + 0x57c, phase);
  if (!playback) {invoke('477310'); session = pointer(memory, 0x5ecb1c);}
  else if (memory.readInt16LE(session + 0x58e) > 0) {
    if (playback !== 2) memory.writeUInt16LE((memory.readUInt16LE(session + 0x58e) - 1) & 65535, session + 0x58e);
    if (eax(invoke('42b330')) & 0x800) memory.writeUInt16LE(0, session + 0x58e);
    if (!memory.readInt16LE(session + 0x58e)) {put(memory, session + 0x57c, 7); put(memory, session + 0x580, 0);}
  }
  if (memory[session + 0x551] === 3 || memory[session + 0x551] === 8) {
    let flags = get(memory, 0x6eafe0);
    for (let index = 0; index < memory[session + 0x54d]; index++) {
      if (memory[session + index + 8] < 15) continue;
      if (flags & 1) {
        const result = invoke('471800', flags), answer = eax(result);
        if (Number.isInteger(result?.ecx)) flags = result.ecx | 0;
        if (answer === 1 && (flags & 6)) {
          if (!(flags & 0x20000)) {invoke('445b70', 1); session = pointer(memory, 0x5ecb1c); flags = get(memory, 0x6eafe0);}
          if (flags & 0x40) {put(memory, 0x6eafe0, flags | 0x20000); invoke('4702c0', flags | 0x20000); session = pointer(memory, 0x5ecb1c); flags = get(memory, 0x6eafe0);}
        }
      }
      if (get(memory, session + 0x57c) !== 7) {put(memory, session + 0x57c, 7); put(memory, session + 0x580, 0); flags = get(memory, 0x6eafe0);}
    }
  }
  return 0;
}
