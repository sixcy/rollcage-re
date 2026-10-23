import {findGameAudioMixer} from './game-audio-sample-factory.mjs';
import {nativeCodeAddress} from './native-memory-spans.mjs';

const f32 = Math.fround;
const ptr = (m, p) => m.readUInt32LE(p);
const put = (m, p, value) => m.writeUInt32LE(value >>> 0, p);
const image = (runtime, value) => nativeCodeAddress(value, runtime);
const returnWord = (runtime, address, value) => put(runtime.memory, address, image(runtime, value));
function save(runtime, rows) {
  for (const [name, offset] of rows) if (Number.isInteger(runtime.entryRegisters?.[name])) put(runtime.memory, runtime.scratchBase + offset, runtime.entryRegisters[name]);
}
function storeFloat(m, address, value) {
  if (value && typeof value === 'object' && Number.isInteger(value.bits)) put(m, address, value.bits);
  else if (typeof value === 'number') m.writeFloatLE(value, address);
  else throw Error('Audio frequency requires explicit incoming XMM2 (number or {bits}).');
}
function voiceCall(voice, slot, args, top, returned, runtime) {
  const m = runtime.memory;
  // Read the actual interface and method even though the implementation is an
  // external COM service. Arguments include this, exactly as in native code.
  const target = ptr(m, ptr(m, voice) + slot);
  args.forEach((value, index) => put(m, top - args.length * 4 + index * 4, value));
  const S = top - args.length * 4 - 4;
  returnWord(runtime, S, returned);
  if (typeof runtime.services?.xAudio2Call !== 'function') throw Error('Audio source parameters require the actual XAudio2 interface service.');
  const result = runtime.services.xAudio2Call(voice, slot, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...runtime, scratchBase: S, interfaceTarget: target});
  const eax = typeof result === 'number' ? result : result?.eax;
  if (!Number.isInteger(eax)) throw Error('XAudio2 service must supply its actual EAX result.');
  return eax >>> 0;
}

// The comparison's LAHF overwrites AH, including when cache equality skips
// all voice calls. The public result preserves native EAX, with AL set to1.
function comparisonEax(eax, left, right) {
  const flags = Number.isNaN(left) || Number.isNaN(right) ? 0x47 : left === right ? 0x42 : left < right ? 3 : 2;
  return ((eax & 0xffff00ff) | flags << 8) >>> 0;
}

//4a7c10. ECX=manager, [entryESP+4]=source, [entryESP+8]=force,
//incoming XMM2=frequency scale. Caller-owned stack and all image identities
//remain explicit; arbitrary heap/scalar bits are never relocated.
export function updateAudioSourceFrequency(manager, source, force, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 16;
  if (!Number.isInteger(S)) throw Error('Audio source frequency requires native entry ESP.');
  put(m, S + 4, source); put(m, S + 8, force);
  save(runtime, [['ESI', -12], ['EDI', -16]]);
  source = ptr(m, S + 4);
  storeFloat(m, F + 8, runtime.xmm2);
  let frequency = m.readFloatLE(source + 0x440);
  put(m, F + 12, ptr(m, source + 0x440));
  const decoder = ptr(m, source + 0x968);
  let rate;
  if (decoder) throw Error('Unported reached audio source decoder-rate child 4ad760.');
  const waveform = ptr(m, source + 0x964);
  if (waveform) rate = f32(ptr(m, waveform + 12)); //CVTDQ2PD + unsigned correction, CVTPD2PS.
  else rate = m.readFloatLE(image(runtime, 0x5dcaac));
  frequency = f32(frequency * m.readFloatLE(F + 8));
  const lookupTarget = ptr(m, ptr(m, manager) + 0x48);
  if (lookupTarget !== image(runtime, 0x4a79f0)) throw Error('Unported audio source mixer lookup target.');
  put(m, F - 4, ptr(m, source + 0x438));
  m.writeFloatLE(rate, F + 20); m.writeFloatLE(frequency, F + 12); m.writeFloatLE(frequency, F + 8);
  returnWord(runtime, F - 8, 0x4a7ca1);
  let eax = findGameAudioMixer(manager, ptr(m, F - 4), {...runtime, scratchBase: F - 8,
    entryRegisters: {...runtime.entryRegisters, ESI: source, EDI: manager}});
  if (eax) {
    const target = ptr(m, ptr(m, eax) + 0x24);
    if (target !== image(runtime, 0x4a9370)) throw Error('Unported audio source effective-rate getter.');
    returnWord(runtime, F - 4, 0x4a7cae);
    //4a9370 FLD mixer+3c; FMUL/FSTP writes the caller's float slot.
    m.writeFloatLE(m.readFloatLE(eax + 0x3c) * m.readFloatLE(F + 8), F + 8);
    frequency = m.readFloatLE(F + 8); eax = target;
  } else frequency = m.readFloatLE(F + 12);
  rate = m.readFloatLE(F + 20);
  const previous = m.readFloatLE(source + 0x988), next = f32(rate * frequency);
  eax = comparisonEax(eax, previous, next);
  if (previous !== next) m.writeFloatLE(next, source + 0x988);
  else if (m[F + 24] !== 1) return ((eax & 0xffffff00) | 1) >>> 0;
  let bound = m.readFloatLE(image(runtime, 0x5dc5fc));
  if (bound > frequency) frequency = bound;
  else {
    bound = m.readFloatLE(image(runtime, 0x5dca78));
    if (frequency > bound) frequency = bound;
  }
  bound = m.readFloatLE(image(runtime, 0x5dca70));
  if (bound > rate) m.writeFloatLE(bound, F + 20);
  else {
    bound = m.readFloatLE(image(runtime, 0x5dcab8));
    if (rate > bound) m.writeFloatLE(bound, F + 20);
  }
  let voice = ptr(m, source + 0x97c);
  const frequencyBits = Buffer.alloc(4); frequencyBits.writeFloatLE(frequency);
  voiceCall(voice, 0x68, [voice, frequencyBits.readUInt32LE(), 0], F, 0x4a7d44,
    {...runtime, entryRegisters: {...runtime.entryRegisters, ESI: source, EDI: manager}});
  voice = ptr(m, source + 0x97c);
  const voiceTable = ptr(m, voice), convertedRate = m.readFloatLE(F + 20);
  returnWord(runtime, F - 4, 0x4a7d57);
  if (typeof runtime.services?.convertFloatToInt64 !== 'function') throw Error('Audio source frequency requires the actual CRT 568a60 conversion service.');
  const converted = runtime.services.convertFloatToInt64(convertedRate, {...runtime, scratchBase: F - 4,
    entryRegisters: {...runtime.entryRegisters, ESI: voice, EDI: voiceTable}});
  if (typeof converted !== 'bigint' || BigInt.asIntN(64, converted) !== converted) throw Error('Audio CRT conversion must return signed64 BigInt.');
  eax = voiceCall(voice, 0x70, [voice, Number(BigInt.asUintN(32, converted))], F, 0x4a7d5c,
    {...runtime, entryRegisters: {...runtime.entryRegisters, ESI: voice, EDI: voiceTable}});
  return ((eax & 0xffffff00) | 1) >>> 0;
}

//4ae4a0, sample virtual+50. This is the actual effect-object test, not an
//assumption that all sources have no effect. Nonzero reaches unported reverb.
export function hasAudioSourceEffect(source, {memory: m}) {
  return Number(ptr(m, source + 0x9a0) !== 0);
}
function effectQuery(source, top, returned, runtime) {
  const target = ptr(runtime.memory, ptr(runtime.memory, source) + 0x50);
  if (target !== image(runtime, 0x4ae4a0)) throw Error('Unported audio source effect-query target.');
  returnWord(runtime, top - 4, returned);
  return hasAudioSourceEffect(source, runtime);
}

//4b12d0, bounded to the genuine nonspatial, effect-free branch. Gain and
//frequency use their actual game children. Other branches fail when reached;
//the source's flags/pointers are never rewritten to manufacture this domain.
export function updateAudioSourceParameters(manager, source, force, runtime) {
  const {memory: m, scratchBase: S} = runtime, B = S - 0x74, F = S - 0x174;
  if (!Number.isInteger(S)) throw Error('Audio source parameters require native entry ESP.');
  put(m, S + 4, source); put(m, S + 8, force);
  save(runtime, [['EBP', -4], ['EBX', -0x16c], ['ESI', -0x170], ['EDI', -0x174]]);
  put(m, B + 0x6c, ptr(m, image(runtime, 0x5dc774))); put(m, B + 0x68, manager);
  source = ptr(m, B + 0x78);
  const lookupManager = ptr(m, image(runtime, 0x714b08));
  if (ptr(m, ptr(m, lookupManager) + 0x48) !== image(runtime, 0x4a79f0)) throw Error('Unported source-parameter mixer lookup target.');
  put(m, F - 4, ptr(m, source + 0x438)); returnWord(runtime, F - 8, 0x4b1304);
  const mixer = findGameAudioMixer(lookupManager, ptr(m, F - 4), {...runtime, scratchBase: F - 8,
    entryRegisters: {...runtime.entryRegisters, EBX: manager, EBP: B, ESI: source}});
  if (mixer) {
    const target = ptr(m, ptr(m, mixer) + 0x18);
    if (target !== image(runtime, 0x4a9340)) throw Error('Unported audio source effective-gain getter.');
    returnWord(runtime, F - 4, 0x4b1311);
    put(m, B + 0x78, ptr(m, mixer + 0x38)); put(m, B + 0x6c, ptr(m, B + 0x78));
  }
  let gain = f32(m.readFloatLE(source + 0x494) * m.readFloatLE(source + 0x43c));
  gain = f32(gain * m.readFloatLE(B + 0x6c));
  if (0 > gain) gain = 0; //COMISS/JBE preserves unordered NaN here.
  const cube = f32(f32(gain * gain) * gain), previous = m.readFloatLE(source + 0x984);
  if (previous !== cube) m.writeFloatLE(cube, source + 0x984);
  if (previous !== cube || m[B + 0x7c] === 1) {
    gain = m.readFloatLE(source + 0x984);
    if (!(gain > 0)) gain = 0; //The later COMISS/JA maps unordered to +0.
    const voice = ptr(m, source + 0x97c), bytes = Buffer.alloc(4); bytes.writeFloatLE(gain);
    voiceCall(voice, 0x30, [voice, bytes.readUInt32LE(), 0], F, 0x4b138e,
      {...runtime, entryRegisters: {...runtime.entryRegisters, EBX: manager, EBP: B, ESI: source}});
  }
  const voice = ptr(m, source + 0x97c);
  if (effectQuery(source, F, 0x4b139d, runtime) === 1) throw Error('Unported reached audio source reverb/effect branch 4b13a1.');
  if (m[source + 0x45e] === 1) throw Error('Unported reached audio source spatial branch 4b13e8.');
  put(m, F - 4, ptr(m, B + 0x7c)); put(m, F - 8, source); returnWord(runtime, F - 12, 0x4b1930);
  updateAudioSourceFrequency(manager, source, ptr(m, F - 4), {...runtime, scratchBase: F - 12,
    xmm2: {bits: ptr(m, image(runtime, 0x5dc774))},
    entryRegisters: {...runtime.entryRegisters, EBX: manager, EBP: B, ESI: source, EDI: voice}});
  const result = effectQuery(source, F, 0x4b1939, runtime);
  if (result === 1) throw Error('Unported reached audio source reverb/output-matrix branch 4b193d.');
  return result;
}
