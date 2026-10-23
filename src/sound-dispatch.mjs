import {nativeCodeAddress} from './native-memory-spans.mjs';

const read = (memory, address) => memory.readUInt32LE(address >>> 0);
const signed = (memory, address) => memory.readInt32LE(address >>> 0);
const write = (memory, address, value) => memory.writeInt32LE(value | 0, address >>> 0);
const requireHandler = (runtime, name) => {
  const handler = runtime.handlers?.[name];
  if (typeof handler !== 'function') throw Error(`Sound dispatch requires service ${name}.`);
  return handler;
};
const sourceCall = (runtime, channel, method, args = []) => requireHandler(runtime, 'sourceCall')(
  read(runtime.memory, channel), method, args, runtime,
);
const fmul = (a, b) => Math.fround(Math.fround(a) * Math.fround(b));
const fadd = (a, b) => Math.fround(Math.fround(a) + Math.fround(b));

// 40d6d0: pointers+4/+8 supply signed32 coordinates. Source callbacks can
// change those pointers; the second pointer and source are read again live.
export function updateSoundChannelPosition(channel, runtime) {
  const memory = runtime.memory;
  let pointer = read(memory, channel + 4);
  if (pointer) {
    const vector = Buffer.alloc(16);
    for (let axis = 0; axis < 3; axis++) {
      const scale = memory.readFloatLE(axis ? 0x5dc5b8 : 0x5ecdb4);
      vector.writeFloatLE(fmul(signed(memory, pointer + axis * 4), scale), axis * 4);
    }
    sourceCall(runtime, channel, 8, [vector]);
  }
  pointer = read(memory, channel + 8);
  if (pointer) {
    let values = [0, 1, 2].map(axis => fmul(signed(memory, pointer + axis * 4), memory.readFloatLE(axis ? 0x5dc5d0 : 0x5ecdb0)));
    const squared = fadd(fadd(fmul(values[1], values[1]), fmul(values[0], values[0])), fmul(values[2], values[2]));
    if (memory.readFloatLE(0x5dc5e8) > squared) values = [0, 0, 0];
    const vector = Buffer.alloc(16);
    values.forEach((value, axis) => vector.writeFloatLE(value, axis * 4));
    sourceCall(runtime, channel, 12, [vector]);
  }
}

// 40eb10's std::function copy adapter. Only its live callable-pointer field
// is read/written; cloneCallable implements the library's virtual copy method.
export function copySoundCallable(sourceAddress, runtime) {
  const memory = runtime.memory, callable = read(memory, sourceAddress + 16);
  if (!callable) return 0;
  return requireHandler(runtime, 'cloneCallable')(callable, callable === sourceAddress, runtime) >>> 0;
}

// 40db20. C++ allocation/vector growth and libaudio virtual methods remain
// declared services, while selection, reuse, limits and positional state are
// recovered here. Addresses refer to the caller-owned runtime memory buffer.
export function selectSoundChannel(sound, positionPointer, velocityPointer, runtime) {
  const memory = runtime.memory;
  let channel = 0;
  if (signed(memory, sound + 0x488) > 0) {
    const index = signed(memory, sound + 0x48c);
    channel = read(memory, read(memory, sound + 4) + Math.imul(index, 4));
    const next = (index + 1) | 0;
    write(memory, sound + 0x48c, next);
    if (next >= signed(memory, sound + 0x488)) write(memory, sound + 0x48c, 0);
  } else {
    let cursor = read(memory, sound + 4);
    for (; cursor !== read(memory, sound + 8); cursor = (cursor + 4) >>> 0) {
      channel = read(memory, cursor);
      let reusable = ((sourceCall(runtime, channel, 0x38, [1]) | 0) & 255) === 0;
      if (!reusable && (((sourceCall(runtime, channel, 0x38, [0]) | 0) & 255) === 1)) {
        if ((((sourceCall(runtime, channel, 0x3c) | 0) & 255) === 0) && (((sourceCall(runtime, channel, 0x48) | 0) & 255) === 0)) reusable = true;
      }
      if (reusable) {sourceCall(runtime, channel, 4, [sound + 0x10]); break;}
    }
    if (cursor === read(memory, sound + 8)) {
      const count = ((read(memory, sound + 8) - read(memory, sound + 4)) | 0) >> 2;
      if ((count >>> 0) >= 16) return 0;
      channel = requireHandler(runtime, 'allocate')(12, runtime) >>> 0;
      if (channel) {
        // The device pointer is captured before the callable-copy service.
        const device = read(memory, 0x714b08), callable = copySoundCallable(sound + 0x470, runtime);
        const source = requireHandler(runtime, 'createSource')(device, sound + 0x10, callable, runtime) >>> 0;
        write(memory, channel, source); write(memory, channel + 4, 0); write(memory, channel + 8, 0);
      }
      requireHandler(runtime, 'appendChannel')(sound + 4, channel, runtime);
    }
  }
  if (channel) {
    sourceCall(runtime, channel, 4, [sound + 0x10]);
    if ((positionPointer | 0) !== 0 || (velocityPointer | 0) !== 0) {
      write(memory, channel + 4, positionPointer); write(memory, channel + 8, velocityPointer);
      updateSoundChannelPosition(channel, runtime);
      sourceCall(runtime, channel, 0x5c, [{vtable: 0x5d0294, channelAddress: channel}]);
    }
  }
  return channel;
}

// 40ce20 fills the fixed 76-byte descriptor, preserving unused name-tail bytes.
export function initializeSoundReverb(bytes, name) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 76 || !Buffer.isBuffer(name)) throw Error('Reverb descriptor requires76 bytes and explicit name bytes.');
  bytes[23] = 0;
  const count = Math.min(23, name.indexOf(0) < 0 ? name.length : name.indexOf(0));
  name.copy(bytes, 0, 0, count); bytes[count] = 0;
  [0x42c80000, 0xfffffc18, 0xffffff13, 0, 0x402ccccd, 0x3f4a3d71, 0xfffffb42,
    0x3c54fdf4, 0x18b, 0x3ca3d70a, 0x42c80000, 0x42c80000, 0x459c4000]
    .forEach((value, index) => bytes.writeUInt32LE(value >>> 0, 24 + index * 4));
  return bytes;
}

// 40e5e0. Reverb availability/installation and the final effect state belong to
// libaudio; the game's guards, call ordering and float field writes are here.
export function configureSoundPlayback(channel, reverbMode, firstArgument, runtime) {
  const memory = runtime.memory;
  if (runtime.nativeAudioCalls) return configureNativeSoundPlayback(channel, reverbMode, runtime);
  if ((channel >>> 0) <= 256 || !read(memory, channel) || !signed(memory, 0x6e6bd4)) return 1;
  if ((reverbMode | 0) === 0 && (((sourceCall(runtime, channel, 0x50) | 0) & 255) !== 1)) return 1;
  if ((((sourceCall(runtime, channel, 0x50) | 0) & 255) === 0)) {
    const descriptor = runtime.reverbScratch;
    if (!Buffer.isBuffer(descriptor) || descriptor.length < 76) throw Error('Sound playback requires retained reverbScratch bytes.');
    initializeSoundReverb(descriptor, Buffer.from('Rollcage reverb\0', 'ascii'));
    sourceCall(runtime, channel, 0x54, [0, descriptor]);
  }
  if ((((sourceCall(runtime, channel, 0x50) | 0) & 255) === 1)) {
    const duration = firstArgument === 0 ? memory.readFloatLE(0x5dc920) : 0;
    let amount = (reverbMode | 0) === 0 ? 0 : memory.readFloatLE(0x5dc8e0);
    const effect = sourceCall(runtime, channel, 0x58) >>> 0;
    amount = amount < 0 ? 0 : amount > memory.readFloatLE(0x5dc97c) ? memory.readFloatLE(0x5dc97c) : amount;
    memory.writeFloatLE(amount, effect + 12);
    if (duration === 0) memory.writeFloatLE(amount, effect + 8);
    memory.writeFloatLE(duration, effect + 16);
  }
  return 1;
}

//Optional shared-stack40e5e0 execution. Installation is deliberately a reached
//dependency: the semantic descriptor helper above does not reproduce its ABI.
function configureNativeSoundPlayback(channel, reverbMode, runtime) {
  const memory = runtime.memory, entry = runtime.scratchBase, frame = entry - 0x80;
  const actual = value => nativeCodeAddress(value, runtime), incoming = runtime.entryRegisters;
  for (const name of ['EBX', 'EBP', 'ESI', 'EDI']) if (!Number.isInteger(incoming?.[name])) throw Error(`Native40e5e0 requires incoming ${name}.`);
  const cookie = read(memory, actual(0x5e8890));
  write(memory, entry - 4, cookie ^ (entry - 0x78));
  write(memory, entry - 0x7c, incoming.ESI); write(memory, frame, incoming.EDI);
  const call = (method, site) => {
    const object = read(memory, channel), sourceEntry = entry - 0x84;
    const returned = actual(site + (method === 0x58 ? 3 : 2));
    write(memory, sourceEntry, returned);
    const entryRegisters = {...incoming, ESI: channel, EDI: reverbMode, ECX: object};
    return requireHandler(runtime, 'sourceCall')(object, method, [], {...runtime, scratchBase: sourceEntry, entryRegisters,
      nativeSourceCall: {callerAddress: actual(0x40e5e0), callerEntryEsp: entry, callAddress: actual(site),
        returnAddress: returned, entryEsp: sourceEntry, entryRegisters}});
  };
  const finish = () => {
    if ((read(memory, entry - 4) ^ (entry - 0x78)) >>> 0 !== cookie) throw Error('Native40e5e0 security cookie mismatch.');
    //POP EDI/ESI precede the compiler cookie call, whose return overwrites S-7c.
    write(memory, entry - 0x7c, actual(0x40e711));
    return 1;
  };
  if ((channel >>> 0) <= 256 || !read(memory, channel) || !signed(memory, 0x6e6bd4)) return finish();
  if ((reverbMode | 0) === 0 && ((call(0x50, 0x40e628) | 0) & 255) !== 1) return finish();
  if (((call(0x50, 0x40e639) | 0) & 255) === 0) throw Error('Native40e5e0 reached unbound original reverb installation40e63f; no descriptor or null result is substituted.');
  if (((call(0x50, 0x40e673) | 0) & 255) === 1) {
    const duration = signed(memory, entry + 4) === 0 ? memory.readFloatLE(actual(0x5dc920)) : 0;
    let amount = (reverbMode | 0) === 0 ? 0 : memory.readFloatLE(actual(0x5dc8e0));
    memory.writeFloatLE(duration, frame + 8); memory.writeFloatLE(amount, frame + 12);
    const effect = call(0x58, 0x40e6b9) >>> 0, maximum = memory.readFloatLE(actual(0x5dc97c));
    amount = amount < 0 ? 0 : amount > maximum ? maximum : amount;
    memory.writeFloatLE(amount, effect + 12);
    if (duration === 0) memory.writeFloatLE(amount, effect + 8);
    memory.writeFloatLE(duration, effect + 16);
  }
  return finish();
}

// 40ea40 indexes the sound bank, configures its flags and dispatches through
// game-owned channel/position/reverb helpers and explicit libaudio services.
export function dispatchNativeSound({code, registerEdx, first, modeIs9, sixth, parameters}, runtime) {
  const memory = runtime.memory, begin = read(memory, 0x6f2414);
  const count = ((read(memory, 0x6f2418) - begin) | 0) >> 2;
  if ((code | 0) < 0 || (code | 0) >= count) return -1;
  const sound = read(memory, begin + Math.imul(code | 0, 4));
  if (!sound) return -1;
  memory[sound + 0x46c] = first ? 1 : 0; memory[sound + 0x46a] = registerEdx ? 1 : 0;
  memory[sound + 0x468] = modeIs9 ? 1 : 0; memory[sound + 0x46f] = sixth === 0 ? 1 : 0;
  write(memory, sound + 0x464, parameters.readInt32LE(8));
  const channel = selectSoundChannel(sound, registerEdx, first, runtime);
  if (!channel) return -1;
  sourceCall(runtime, channel, 0x14, [fmul(parameters.readInt32LE(0), memory.readFloatLE(0x5dc5dc))]);
  if (parameters.readInt32LE(4) >= 0) sourceCall(runtime, channel, 0x20, [parameters.readInt32LE(4)]);
  configureSoundPlayback(channel, parameters.readInt32LE(12), 1, runtime);
  sourceCall(runtime, channel, 0x2c, [0]);
  return channel | 0;
}
