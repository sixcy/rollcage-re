import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRacePhaseState, aggregateRaceInput, spawnRaceModeFourIndicators} from '../src/race-phase-state.mjs';
import {initializeRacePhaseAudioConstants, updateRaceAudioListeners, updateRaceMusicState, setRaceSerialVolume} from '../src/race-phase-audio.mjs';
import {startRaceLaunch, applyRaceLaunchImpulse} from '../src/race-launch-state.mjs';
import {createRacePhaseFixture, phaseAddresses, verifyRacePhaseState} from '../tools/verify-race-phase-state-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
function fixture() {
  const context = createRacePhaseFixture(1), {memory} = context, a = phaseAddresses;
  initializeRacePhaseAudioConstants(memory); memory[a.session + 0x58c] = 1; word(memory, a.session + 0x58e, 0); memory[a.session + 0x551] = 0;
  return context;
}

test('phase1 and phase2 thresholds lead into the exact63-tick start countdown', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses;
  put(memory, a.session + 0x57c, 1); put(memory, a.session + 0x580, 14); put(memory, 0x91e744, 1);
  assert.equal(updateRacePhaseState(context), 0); assert.equal(memory.readInt32LE(a.session + 0x57c), 2); assert.equal(memory.readInt32LE(a.session + 0x580), 0); assert.equal(memory.readInt32LE(0x91e744), 2);
  put(memory, a.session + 0x580, 149); updateRacePhaseState(context);
  assert.equal(memory.readInt32LE(a.session + 0x57c), 3); assert.equal(memory.readInt32LE(a.session + 0x580), 63); assert.equal(memory.readInt32LE(0x91e744), 4);
  for (let tick = 0; tick < 62; tick++) updateRacePhaseState(context);
  assert.equal(memory.readInt32LE(a.session + 0x57c), 3); assert.equal(memory.readInt32LE(a.session + 0x580), 1);
  updateRacePhaseState(context); assert.equal(memory.readInt32LE(a.session + 0x57c), 4); assert.equal(memory.readInt32LE(a.session + 0x580), 0); assert.equal(memory.readInt32LE(0x91e744), 5);
});

test('race start captures each registered boost and unsigned wrapped clock timestamp', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses;
  put(memory, a.session + 0x57c, 3); put(memory, a.session + 0x580, 1); memory[a.session + 0x54d] = 2; put(memory, 0x90a548, -1);
  put(memory, a.body + 0x6b0, 1234); put(memory, a.body + 0x1000 + 0x6b0, -1);
  updateRacePhaseState(context);
  assert.equal(memory.readInt32LE(a.body + 0x650), 1234); assert.equal(memory.readInt32LE(a.body + 0x1000 + 0x650), -1);
  assert.equal(memory.readUInt32LE(0x909350), Math.floor(0xfffff800 / 3)); assert.equal(memory.readUInt32LE(0x90965c), Math.floor(0xfffff800 / 3));
});

test('countdown only decrements its UI count at original30,20,10', () => {
  for (const [counter, expected] of [[31, 3], [30, 2], [20, 2], [10, 2], [0, 3], [-1, 3]]) {
    const context = fixture(), {memory} = context, a = phaseAddresses; put(memory, a.session + 0x57c, 3); put(memory, a.session + 0x580, counter); put(memory, 0x7130b0, 3);
    updateRacePhaseState(context); assert.equal(memory.readInt32LE(0x7130b0), expected);
  }
});

test('phase4 boost decay uses512 or1500 and only negative results become-1', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses; put(memory, a.session + 0x57c, 4); put(memory, a.session + 0x580, 7); memory[a.session + 0x54d] = 4;
  for (const [index, value] of [511, 512, 1500, 2000].entries()) {put(memory, a.body + index * 0x1000 + 0x6b0, value); memory[a.body + index * 0x1000 + 0x64d] = 2;}
  updateRacePhaseState(context);
  assert.deepEqual([0, 1, 2, 3].map(index => memory.readInt32LE(a.body + index * 0x1000 + 0x6b0)), [-1, -1, 0, 500]);
});

test('terminal completion returns1 without storing an incremented phase counter', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses; put(memory, a.session + 0x57c, 9); put(memory, a.session + 0x580, 60); memory[a.session + 0x54f] = 2;
  assert.equal(updateRacePhaseState({...context, handlers: {call478fa0: () => 0}}), 1);
  assert.equal(memory.readInt32LE(a.session + 0x580), 60); assert.equal(memory[a.session + 0x54f], 1);
});

test('playback countdown mode2 holds its timer until actual aggregated input requests skip', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses;
  put(memory, a.session + 0x57c, 4); put(memory, a.session + 0x580, 201); memory[a.session + 0x58c] = 2; word(memory, a.session + 0x58e, 5); memory[a.session + 0x54d] = 1;
  put(memory, 0x6eafe0, 0); put(memory, 0x6e675c, 1); put(memory, 0x6e7ac4, 0);
  updateRacePhaseState(context); assert.equal(memory.readUInt16LE(a.session + 0x58e), 5);
  put(memory, 0x6e7ac4, 0x800); updateRacePhaseState(context);
  assert.equal(memory.readUInt16LE(a.session + 0x58e), 0); assert.equal(memory.readInt32LE(a.session + 0x57c), 7); assert.equal(memory.readInt32LE(a.session + 0x580), 0);
});

test('actual aggregate attaches sampled packets and retains native decoded digital mask order', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses;
  memory[a.session + 0x54d] = 1; put(memory, 0x6eafe0, 0); put(memory, 0x6e675c, 1); put(memory, 0x6e7ac4, 0x12000800);
  const result = aggregateRaceInput(context);
  assert.equal(result >>> 0, 0x12000800); assert.equal(memory.readUInt32LE(a.body + 0x724), 0x6e7edc);
});

test('listener descriptor fields carry across an active null-source record', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses;
  for (let index = 0; index < 4; index++) memory[0x849480 + index * 0x54] = index < 2 ? 1 : 0;
  word(memory, 0x849482, 0); word(memory, 0x8494d6, 0); put(memory, 0x849484, a.vectors); put(memory, 0x849488, 0); put(memory, 0x84948c, 0);
  put(memory, 0x8494d8, 0); put(memory, 0x8494dc, 0); put(memory, 0x8494e0, 0); put(memory, a.listener, a.output); put(memory, a.listener + 4, a.output + 0x100);
  updateRaceAudioListeners(context);
  assert.equal(memory.readInt32LE(a.output + 4), 1); assert.deepEqual(memory.subarray(a.output + 4, a.output + 80), memory.subarray(a.output + 0x104, a.output + 0x150));
});

test('launch requires four contacts and derives impulse from the countdown stack integer', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses; word(memory, a.body + 0x6a0, 0); word(memory, a.body + 0x6aa, 0); memory[a.body + 0x709] = 73;
  for (let wheel = 0; wheel < 4; wheel++) memory[a.body + 0x324 + wheel * 200] = 1;
  for (const offset of [0x40, 0x44, 0x48]) put(memory, a.body + offset, 0);
  assert.equal(startRaceLaunch(0x909300, 0, 1, context), 1);
  assert.equal(memory.readInt32LE(a.body + 0x44), 18 << 16); assert.equal(memory[a.body + 0x670], 18); assert.equal(memory.readUInt16LE(a.body + 0x6a2), 14); assert.equal(memory[a.body + 0x6a7], 73); assert.equal(memory.readInt32LE(a.body + 0x6ac), 10 << 16);
  memory[a.body + 0x324] = 0; const before = Buffer.from(memory.subarray(a.body, a.body + 0x800)); applyRaceLaunchImpulse(a.body, 60, context); assert.deepEqual(memory.subarray(a.body, a.body + 0x800), before);
});

test('music state and serial volume issue exact byte commands through explicit WriteFile service', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses, log = [];
  const runtime = {...context, handlers: {writeFile: request => log.push(memory.subarray(request.buffer, request.buffer + request.length).toString('hex'))}};
  memory[a.settings + 0x410] = 0; word(memory, 0x6e6bd8, 2); updateRaceMusicState(0, runtime); assert.equal(memory.readUInt16LE(0x6e6bd8), 1);
  updateRaceMusicState(1, runtime); setRaceSerialVolume(-1, runtime);
  assert.deepEqual(log.slice(0, 2), ['55', '41']);
  const encoded = Math.trunc(Math.fround(Math.fround(4294967295) * memory.readFloatLE(0x5dc628))) & 255;
  assert.equal(log[2], `56${encoded.toString(16).padStart(2, '0')}`);
});

test('mode-four indicators cache dimensions but reload the scale after the first UI call', () => {
  const context = fixture(), {memory} = context, a = phaseAddresses, calls = [];
  memory[a.settings + 0x41a] = 0; put(memory, 0x91d338, 256);
  spawnRaceModeFourIndicators({...context, handlers: {call48b7d0: request => {calls.push(request.args); put(memory, 0x91d338, 512);}}});
  assert.deepEqual(calls, [[620, 180, 49, 0, 0], [1240, 404, 49, 0, 0]]);
});

test('complete phase caller and actual numeric/audio/input/launch children agree with x86', async () => {
  const report = await verifyRacePhaseState({fixtures: 1200, helpers: 100, output: null});
  assert.equal(report.matched, true); assert.equal(report.instructions, 1630);
  assert.ok(report.actualGameCalls['0x479360'] > 0); assert.ok(report.actualGameCalls['0x48d490'] > 0); assert.ok(report.actualGameCalls['0x484880'] > 0);
});
