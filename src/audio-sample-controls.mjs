export {getGameAudioLoopFlag} from './game-audio-wave-decoder.mjs';

const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function floatArgument(m, address, value) {
  if (value && typeof value === 'object' && Number.isInteger(value.bits)) put(m, address, value.bits);
  else m.writeFloatLE(value, address);
}

//4ad170, virtual+4. REP MOVSD copies0x118 (280) DWORDs forward into the
//secondary descriptor. Overlap is sequential, not snapshot/memmove behavior.
export function copyGameAudioSampleState(object, input, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  put(m, S + 4, input);
  for (const [name, offset] of [['ESI', -4], ['EDI', -8]]) if (Number.isInteger(runtime.entryRegisters?.[name])) put(m, S + offset, runtime.entryRegisters[name]);
  input = ptr(m, S + 4);
  for (let i = 0; i < 0x118; i++) put(m, object + 0x498 + i * 4, ptr(m, input + i * 4));
}

//4ad580, virtual+38. The returned AL is Boolean but the other EAX bytes
//remain from state+948. Only the low argument byte, exactly1, tests pending3.
export function queryGameAudioSampleActivity(object, includePending, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  put(m, S + 4, includePending);
  const state = ptr(m, object + 0x948);
  const active = state === 3 || state === 1 || m[S + 4] === 1 && ptr(m, object + 0x94c) === 3;
  return (state & 0xffffff00) | Number(active);
}

//4ad570, virtual+3c. Unlike4ad580 this clears all of EAX first.
export function isGameAudioSamplePending(object, {memory: m}) {
  return Number(ptr(m, object + 0x948) === 3);
}

//4ad5b0, virtual+34. Only the deferred state word is reset.
export function clearGameAudioSamplePending(object, {memory: m}) {
  put(m, object + 0x94c, 0);
}

//4ad5c0. Exactly1 requests state2; all other low-byte values request3.
export function requestGameAudioSampleStop(object, flag, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  put(m, S + 4, flag); const state = m[S + 4] === 1 ? 2 : 3;
  put(m, object + 0x94c, state); return state;
}

//4ad6a0. COMISS/JBE sends zero, negatives and unordered NaNs to positive0.
export function setGameAudioSampleGain(object, value, runtime) {
  const {memory: m, scratchBase: S} = runtime; floatArgument(m, S + 4, value);
  put(m, object + 0x8d0, m.readFloatLE(S + 4) > 0 ? ptr(m, S + 4) : 0);
}

//4ad650. Its reversed COMISS operands preserve unordered NaNs and negative
//zero. Both float setters admit {bits} to preserve original stack bit patterns.
export function setGameAudioSampleOffset(object, value, runtime) {
  const {memory: m, scratchBase: S} = runtime; floatArgument(m, S + 4, value);
  put(m, object + 0x8d4, m.readFloatLE(S + 4) < 0 ? 0 : ptr(m, S + 4));
}

//4ad5f0. Unsigned input/rate conversions round tofloat BEFORE division.
export function setGameAudioSampleFrameOffset(object, frames, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, frames);
  if (Number.isInteger(runtime.entryRegisters?.ESI)) put(m, S - 4, runtime.entryRegisters.ESI);
  const waveform = ptr(m, object + 0x964);
  if (waveform) {
    const target = ptr(m, ptr(m, object) + 0x1c);
    const ratio = Math.fround(Math.fround(ptr(m, S + 4)) / Math.fround(ptr(m, waveform + 12)));
    m.writeFloatLE(ratio, S - 8); put(m, S - 12, 0x4ad641);
    if (target !== 0x4ad650) throw Error(`Unported sample offset target0x${target.toString(16)}.`);
    setGameAudioSampleOffset(object, {bits: ptr(m, S - 8)}, {...runtime, scratchBase: S - 12});
  }
}

//4ad730 and4ad700. Four live DWORD reads, including the fourth component;
//an overlapping input can observe the preceding destination stores.
function setVector(object, input, offset, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, input);
  input = ptr(m, S + 4);
  for (let i = 0; i < 4; i++) put(m, object + offset + i * 4, ptr(m, input + i * 4));
}
export function setGameAudioSamplePosition(object, input, runtime) {setVector(object, input, 0x8f8, runtime);}
export function setGameAudioSampleVelocity(object, input, runtime) {setVector(object, input, 0x908, runtime);}

//4ad540/4ad510 return only AL. Full state equality, exact low-byte argument1.
function queryState(object, includePending, expected, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, includePending);
  return Number(ptr(m, object + 0x948) === expected || m[S + 4] === 1 && ptr(m, object + 0x94c) === expected);
}
export function isGameAudioSamplePaused(object, includePending, runtime) {return queryState(object, includePending, 2, runtime);}
export function isGameAudioSampleStopped(object, includePending, runtime) {return queryState(object, includePending, 0, runtime);}

//4ad5e0 and4ad410. Preserve raw flag bytes and the original reference-vector
//address, distinct from the current vector at+8f8. Flag meaning remains scoped.
export function getGameAudioSamplePolicyFlag(object, {memory: m}) {return m[object + 0x463];}
export function getGameAudioSamplePositionAddress(object) {return (object + 0x464) >>> 0;}

//4ad4c0. JA is false for unordered comparisons; use an explicit float32
//multiply before the threshold comparison, without interpreting NaNs as far.
export function isGameAudioSampleEligible(object, {memory: m}) {
  if (!m[object + 0x45e] || !ptr(m, object + 0x96c)) return 1;
  return Number(Math.fround(m.readFloatLE(object + 0x95c) * m.readFloatLE(0x5dc790)) > m.readFloatLE(object + 0x970));
}
