//484bb0/40ea40 shared-stack binding. Retained149/151, Evidence
//ev_55774611163ec94ae80a1e26fed4474bf04f8c077f1fa53df8691843b5c8e3f8 /
//ev_276e723742684068016129e93a54f6b66c48ae2564c6cbdd1d58fc0dd8998ee6.
//The emitter is integer/SSE-zeroing only; it does not change x87/MXCSR controls.
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {selectAdaptiveNativeSoundChannelOnStack} from './native-sound-selection.mjs';
import {assertNativeMemorySpan, nativeMemorySpan, nativeCodeAddress, sharesNativeMemorySpan} from './native-memory-spans.mjs';

const uint = (value, label) => {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) throw Error(`Native effect stack requires explicit32-bit ${label}.`);
  return value >>> 0;
};
const put = (memory, address, value) => memory.writeUInt32LE(uint(value, 'stored value'), address);
const registers = runtime => {
  const result = runtime.nativeStack?.entryRegisters;
  for (const name of ['ebx', 'ebp', 'esi', 'edi']) uint(result?.[name], `incoming ${name}`);
  return result;
};

export function nativeEffectStackLayout(entryEsp) {
  if (!Number.isInteger(entryEsp) || entryEsp < 100 || entryEsp > 0xffffffe3) throw Error('Native emitter requires a bounded x86 entry ESP.');
  const aligned = Math.floor((entryEsp - 4) / 16) * 16, frame = aligned - 32;
  return {entryEsp, savedEbp: entryEsp - 4, aligned, frame, parameters: frame + 16, dispatchEntry: frame - 20};
}

// Caller publishes its real CALL return and seven argument words first. This
// verifies them, writes native saves/locals/arguments in the SAME memory, then
// passes a live parameter span to40ea40. No private stack copy is substituted.
export function emitNativeEffectOnStack(code, registerEdx, args, runtime) {
  const {memory, scratchBase} = runtime, incoming = registers(runtime), layout = nativeEffectStackLayout(scratchBase);
  if (!Array.isArray(args) || args.length !== 7) throw Error('Native effect stack requires seven explicit argument words.');
  code = uint(code, 'code') | 0; registerEdx = uint(registerEdx, 'EDX');
  assertNativeMemorySpan(memory, layout.frame - 32, scratchBase + 32 - (layout.frame - 32));
  if (!memory.readUInt32LE(scratchBase)) throw Error('Native emitter caller return must already be published.');
  for (let index = 0; index < 7; index++) if (memory.readUInt32LE(scratchBase + 4 + index * 4) !== uint(args[index], `argument${index + 1}`)) throw Error('Native emitter arguments differ from actual caller stack words.');
  put(memory, layout.savedEbp, incoming.ebp);
  put(memory, layout.frame + 4, incoming.esi);
  put(memory, layout.frame + 12, registerEdx);
  put(memory, layout.frame, incoming.edi);
  nativeMemorySpan(memory, layout.parameters, 16).fill(0); //XORPS/MOVDQA484bcb..ce
  const words = args.map((_, index) => memory.readInt32LE(scratchBase + 4 + index * 4));
  return emitNativeEffect(code, registerEdx | 0, words, {dispatch40ea40(request) {
    request.parameters.copy(nativeMemorySpan(memory, layout.parameters, 16));
    const parameters = nativeMemorySpan(memory, layout.parameters, 16);
    put(memory, layout.frame - 4, layout.parameters);
    put(memory, layout.frame - 8, words[5]);
    put(memory, layout.frame - 12, request.modeIs9);
    put(memory, layout.frame - 16, words[0]);
    put(memory, layout.dispatchEntry, nativeCodeAddress(0x484c5d, runtime));
    const nativeStack = {entryRegisters: {ebx: incoming.ebx, ebp: layout.savedEbp, esi: code, edi: Math.min(words[1], 0x3fff)}};
    const call = {...request, memory, parameters, parameterAddress: layout.parameters, scratchBase: layout.dispatchEntry, nativeStack};
    if (typeof runtime.dispatch40ea40 === 'function') return runtime.dispatch40ea40(call);
    const soundRuntime = runtime.soundRuntime ?? runtime;
    if (soundRuntime.memory !== memory) throw Error('Native emitter sound runtime must share its actual memory.');
    return dispatchNativeSoundOnStack(call, {...soundRuntime, moduleBaseAddress: runtime.moduleBaseAddress, scratchBase: layout.dispatchEntry, nativeStack});
  }});
}

//40ea40's entry saves execute even on a naturally absent bank entry. Populated
//banks descend into40db20's SEH/cookie/library-service stack; an explicit complete
//native child implementation is required there, rather than silently calling a
//numeric-only service graph and losing its writes to the shared stack.
export function dispatchNativeSoundOnStack(request, runtime) {
  const {memory, scratchBase} = runtime, incoming = registers(runtime);
  assertNativeMemorySpan(memory, scratchBase - 12, 32);
  if (memory.readUInt32LE(scratchBase) !== nativeCodeAddress(0x484c5d, runtime)) throw Error('Native sound dispatcher caller differs from484bb0.');
  if (memory.readUInt32LE(scratchBase + 16) !== request.parameterAddress) throw Error('Native sound dispatcher parameter pointer differs from its real stack.');
  if (!sharesNativeMemorySpan(memory, request.parameters, request.parameterAddress, 16) || request.parameters.length !== 16) throw Error('Native sound parameters must share their actual stack bytes.');
  for (const [offset, value] of [[4, request.first], [8, request.modeIs9], [12, request.sixth]]) if (memory.readUInt32LE(scratchBase + offset) !== uint(value, 'dispatcher argument')) throw Error('Native sound arguments differ from actual dispatcher stack.');
  put(memory, scratchBase - 4, incoming.ebx); put(memory, scratchBase - 8, incoming.esi); put(memory, scratchBase - 12, incoming.edi);
  // Match the native negative-code guard: it does not read either bank root.
  if ((request.code | 0) < 0) return -1;
  const begin = memory.readUInt32LE(0x6f2414), end = memory.readUInt32LE(0x6f2418), count = ((end - begin) | 0) >> 2;
  let sound = 0;
  if ((request.code | 0) < count) {
    const address = (begin + Math.imul(request.code | 0, 4)) >>> 0;
    assertNativeMemorySpan(memory, address, 4);
    sound = memory.readUInt32LE(address);
    runtime.onSoundBankRead?.({address, length: 4, soundAddress: sound, code: request.code | 0});
  }
  if (sound) {
    if (typeof runtime.dispatchPopulated40ea40 !== 'function') throw Error(`Native populated sound0x${sound.toString(16)} requires complete40db20/library-service shared-stack binding.`);
    return runtime.dispatchPopulated40ea40(request, {...runtime, soundAddress: sound});
  }
  return dispatchNativeSound(request, runtime);
}

//40db20, retained153 ev_e7b66afda8bc1259f35bae13abb5f5ad007af72d368288d98dca50fc8ee1e855.
//The explicitly supplied TLS word models FS:[0]; the captured stack cannot
//supply that word merely from its FS selector. The default adaptive source uses
//this same published frame; missing descendants remain reached dependencies.
export function selectNativeSoundChannelOnStack(sound, position, velocity, runtime) {
  const {memory, scratchBase: entry, nativeTls} = runtime, incoming = registers(runtime), frame = entry - 44;
  if (!nativeTls || !Number.isInteger(nativeTls.sehWord) || nativeTls.sehWord < 0 || nativeTls.sehWord > 0xffffffff) throw Error('Native channel selection requires an explicit captured FS:[0] SEH word.');
  assertNativeMemorySpan(memory, frame - 8, 64);
  if (memory.readUInt32LE(entry + 4) !== uint(position, 'position') || memory.readUInt32LE(entry + 8) !== uint(velocity, 'velocity')) throw Error('Native channel selection differs from its caller argument slots.');
  put(memory, entry - 4, -1); put(memory, entry - 8, nativeCodeAddress(0x569f54, runtime)); put(memory, entry - 12, nativeTls.sehWord);
  for (const [name, offset] of [['ebx', 16], ['ebp', 12], ['esi', 8], ['edi', 4]]) put(memory, frame + offset, incoming[name]);
  put(memory, frame, memory.readUInt32LE(0x5e8890) ^ (entry - 40));
  nativeTls.sehWord = frame + 32;
  const maximum = memory.readInt32LE(sound + 0x488);
  if (maximum <= 0) {
    const savedSeh = memory.readUInt32LE(frame + 32);
    const adaptive = runtime.selectAdaptiveSoundChannelOnStack ?? selectAdaptiveNativeSoundChannelOnStack;
    const channel = uint(adaptive({sound, position, velocity, entryEsp: entry, frame, incoming, maximum}, runtime), 'adaptive channel result');
    if (nativeTls.sehWord !== savedSeh) throw Error('Native adaptive sound continuation did not restore its original FS:[0].');
    if (channel) assertNativeMemorySpan(memory, channel, 12);
    return channel;
  }
  const index = memory.readInt32LE(sound + 0x48c), vector = memory.readUInt32LE(sound + 4);
  const slot = (vector + Math.imul(index, 4)) >>> 0, channel = memory.readUInt32LE(slot);
  runtime.onSoundChannelRead?.({address: slot, length: 4, channelAddress: channel});
  const next = (index + 1) | 0;
  memory.writeInt32LE(next, sound + 0x48c);
  if (next >= maximum) memory.writeInt32LE(0, sound + 0x48c);
  if (channel) {
    //Publish the real argument/return before the unresolved virtual+04 call.
    put(memory, frame - 4, sound + 0x10); put(memory, frame - 8, nativeCodeAddress(0x40db8b, runtime));
    throw Error('Native selected sound channel requires complete source virtual04/position/callable shared-stack services.');
  }
  nativeTls.sehWord = memory.readUInt32LE(frame + 32);
  return 0;
}

//The sound record and selector share the actual dispatcher stack. A nonnull
//result requires the rest of40ea40, not a numeric-only playback service.
export function dispatchPopulatedNativeSoundOnStack(request, runtime) {
  const {memory, scratchBase: entry} = runtime, sound = runtime.soundAddress;
  if (!Number.isInteger(sound) || sound <= 0) throw Error('Populated native sound requires its selected original owner.');
  assertNativeMemorySpan(memory, sound, 0x490);
  memory[sound + 0x46c] = request.first ? 1 : 0; memory[sound + 0x46a] = request.registerEdx ? 1 : 0;
  memory[sound + 0x468] = request.modeIs9 ? 1 : 0; memory[sound + 0x46f] = request.sixth === 0 ? 1 : 0;
  memory.writeInt32LE(request.parameters.readInt32LE(8), sound + 0x464);
  const top = entry - 12, child = top - 12;
  put(memory, top - 4, request.first); put(memory, top - 8, request.registerEdx); put(memory, child, nativeCodeAddress(0x40eaba, runtime));
  const channel = selectNativeSoundChannelOnStack(sound, request.registerEdx, request.first, {...runtime, scratchBase: child,
    nativeStack: {entryRegisters: {ebx: request.registerEdx, ebp: runtime.nativeStack.entryRegisters.ebp, esi: memory.readUInt32LE(0x6f2414), edi: request.parameterAddress}}});
  if (!channel) return -1;
  if (typeof runtime.playSelectedNativeSoundOnStack === 'function') return runtime.playSelectedNativeSoundOnStack({request, channel, sound, entryEsp: entry}, runtime);
  throw Error('Native nonnull sound playback requires complete40ea40 source/reverb stack services.');
}
