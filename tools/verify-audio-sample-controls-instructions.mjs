import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {copyGameAudioSampleState, queryGameAudioSampleActivity, isGameAudioSamplePending, clearGameAudioSamplePending, getGameAudioLoopFlag, requestGameAudioSampleStop, setGameAudioSampleGain, setGameAudioSamplePosition, setGameAudioSampleVelocity, setGameAudioSampleOffset, setGameAudioSampleFrameOffset, isGameAudioSamplePaused, isGameAudioSampleStopped, getGameAudioSamplePolicyFlag, getGameAudioSamplePositionAddress, isGameAudioSampleEligible} from '../src/audio-sample-controls.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const S = 0x1f000, OBJECT = 0x100000, INPUT = 0x110000, entries = [0x4ad170, 0x4ad580, 0x4ad570, 0x4ad5b0, 0x4ad500, 0x4ad5c0, 0x4ad6a0, 0x4ad730, 0x4ad700, 0x4ad650, 0x4ad5f0, 0x4ad540, 0x4ad510, 0x4ad5e0, 0x4ad410, 0x4ad4c0];
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), fixtures = Number(process.argv[2] ?? 6400), reached = new Set(), visits = {};
machine.onInstruction = p => {reached.add(p); if (entries.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
let steps = 0, overlapCopies = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 2048, S + 128); put(memory, S, -1);
  const selector = fixture % entries.length, variant = Math.floor(fixture / entries.length);
  for (let i = 0; i < 0x1000; i++) memory[OBJECT + i] = (i * 37 + variant * 19) & 255;
  for (let i = 0; i < 0x500; i++) memory[INPUT + i] = (i * 23 + variant * 7) & 255;
  const states = [0, 1, 2, 3, 4, 0x100, 0x103, 0x80000003, 0xffffffff, 0x12345678];
  put(memory, OBJECT + 0x948, states[variant % states.length]); put(memory, OBJECT + 0x94c, states[Math.floor(variant / states.length) % states.length]); memory[OBJECT + 0x45c] = variant & 255;
  put(memory, OBJECT, 0x5d3f60); put(memory, OBJECT + 0x964, variant % 5 ? INPUT : 0); put(memory, INPUT + 12, [0, 1, 44100, 48000, 0xffffffff, 0x80000001][variant % 6]);
  const floatBits = [0, 0x80000000, 0x3f800000, 0xbf800000, 0x7f800000, 0xff800000, 0x7fc12345, 0x7f812345, 1, 0x80000001, 0x7f7fffff];
  const bits = floatBits[variant % floatBits.length], frames = [0, 1, 0x7fffffff, 0x80000000, 0xffffffff, 0x1000001][Math.floor(variant / 6) % 6];
  memory[OBJECT + 0x463] = variant * 7 & 255; memory[OBJECT + 0x45e] = variant % 3; put(memory, OBJECT + 0x96c, variant % 4); put(memory, OBJECT + 0x95c, bits); put(memory, OBJECT + 0x970, floatBits[Math.floor(variant / 3) % floatBits.length]);
  const input = [INPUT, OBJECT + 0x494, OBJECT + 0x498, OBJECT + 0x49c, S - 12][variant % 5], includePending = [0, 1, 2, 0x101, -255, 0x100, 0xff, -1][Math.floor(variant / 7) % 8];
  const vectorInput = selector === 7 || selector === 8 ? [INPUT, OBJECT + (selector === 7 ? 0x8f8 : 0x908) - 4, OBJECT + (selector === 7 ? 0x8f8 : 0x908) + 4, S + 4][variant % 4] : input;
  const args = selector === 0 ? [input] : [1, 5, 11, 12].includes(selector) ? [includePending] : [6, 9].includes(selector) ? [bits] : [7, 8].includes(selector) ? [vectorInput] : selector === 10 ? [frames] : [];
  args.forEach((v, i) => put(memory, S + 4 + i * 4, v));
  const registers = {ESI: 0x121212 + fixture, EDI: 0x232323 + fixture};
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes); machine.entry = entries[selector]; machine.r.ESP = S; machine.r.ECX = OBJECT; machine.r.EAX = 0x65432100; Object.assign(machine.r, registers);
  const runtime = {memory, scratchBase: S, entryRegisters: registers}; let result;
  if (selector === 0) copyGameAudioSampleState(OBJECT, input, runtime);
  else if (selector === 1) result = queryGameAudioSampleActivity(OBJECT, includePending, runtime);
  else if (selector === 2) result = isGameAudioSamplePending(OBJECT, runtime);
  else if (selector === 3) clearGameAudioSamplePending(OBJECT, runtime);
  else if (selector === 4) result = getGameAudioLoopFlag(OBJECT, runtime);
  else if (selector === 5) result = requestGameAudioSampleStop(OBJECT, includePending, runtime);
  else if (selector === 6) setGameAudioSampleGain(OBJECT, {bits}, runtime);
  else if (selector === 7) setGameAudioSamplePosition(OBJECT, vectorInput, runtime);
  else if (selector === 8) setGameAudioSampleVelocity(OBJECT, vectorInput, runtime);
  else if (selector === 9) setGameAudioSampleOffset(OBJECT, {bits}, runtime);
  else if (selector === 10) setGameAudioSampleFrameOffset(OBJECT, frames, runtime);
  else if (selector === 11) result = isGameAudioSamplePaused(OBJECT, includePending, runtime);
  else if (selector === 12) result = isGameAudioSampleStopped(OBJECT, includePending, runtime);
  else if (selector === 13) result = getGameAudioSamplePolicyFlag(OBJECT, runtime);
  else if (selector === 14) result = getGameAudioSamplePositionAddress(OBJECT, runtime);
  else result = isGameAudioSampleEligible(OBJECT, runtime);
  steps += machine.run(10000);
  if ([1, 2, 5, 14].includes(selector)) assert.equal(machine.r.EAX | 0, result | 0, `fixture${fixture} complete EAX`);
  if ([4, 11, 12, 13, 15].includes(selector)) {assert.equal(machine.r.EAX & 255, result); assert.equal(machine.r.EAX >>> 8, 0x654321);}
  assert.equal(machine.fs0, 0x12345678);
  if (!memory.equals(machine.bytes)) {const p = memory.findIndex((v, i) => v !== machine.bytes[i]); assert.fail(`fixture${fixture} byte0x${p.toString(16)} source${memory.subarray(p, p + 16).toString('hex')} native${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
  overlapCopies += Number(selector === 0 && input >= OBJECT + 0x494 && input <= OBJECT + 0x49c);
}
const path = 'src/audio-sample-controls.mjs', report = {matched: true, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, overlapCopies, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256,
  method: 'Actual4ad170 forward REP MOVSD0x118 DWORD secondary-descriptor copy,4ad580 activity query preserving upperEAX/low-byte-only argument,4ad570 exact-state3 query,4ad5b0 deferred-state clear,4ad500/4ad5e0 raw bytes,4ad5c0 stop request,4ad6a0/4ad650 distinct float clamps,4ad730/4ad700 live four-DWORD vectors,4ad5f0 unsigned-frame/rate conversion through actual virtual1c setter,4ad540/4ad510 state queries,4ad410 reference-position pointer and4ad4c0 float32 eligibility. Entire10MiB including all native stack bytes and TLS compare; full defined EAX for both state queries, AL plus untouched highEAX for loop getter. Fixtures cover exact in-place/forward/backward overlaps, source aliasing saved-register/argument stack, unsigned/high-byte state and argument values, null waveform, unsigned rates/frames, infinities/NaNs/subnormals/signed zero and vector overlaps. Float {bits} inputs retain original payloads. MXCSR trap/flush modes and complete playback transitions remain outside this proof. No game/CRT/OS callbacks or original process execution. Higher-level names do not establish the complete playback state machine.'};
const output = process.argv[3] ?? 'analysis/audio-sample-controls-expanded-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
