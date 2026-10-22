import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createPlacedModelEffectFixture, placedModelEffectAddresses as a, verifyPlacedModelEffectUpdate} from '../tools/verify-placed-model-effect-update-instructions.mjs';
import {updatePlacedModelContactEffects, applyPlacedModelEffectDamage} from '../src/placed-model-effect-update.mjs';

const program = await loadRetainedNativeProgram();
const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
function fixture(index = 1) {
  const runtime = createPlacedModelEffectFixture(program, index), {memory: m} = runtime;
  put(m, 0x6f2414, 0); put(m, 0x6f2418, 0); put(m, 0x9207e4, 6); put(m, 0x810920, 0); put(m, 0x811180, 0); put(m, 0x902b88, 0); put(m, 0x902b8c, 63);
  for (let index = 0; index < 6; index++) {const row = a.rows + index * 16; m[row + 6] = 255; m[row + 7] = 0; m[row + 9] = 1;}
  for (let index = 0; index < 3; index++) put(m, a.pulse + index * 0xf14 + 12, 0);
  return runtime;
}
const ready = (m, index, scale = 1) => {const row = a.rows + index * 16; m[row + 6] = 0; m[row + 7] = 0; m[row + 8] = scale & 255; return row;};

test('empty count touches no row or effect state', () => {
  const runtime = fixture(), {memory: m} = runtime; put(m, 0x9207e4, 0);
  const before = Buffer.from(m); updatePlacedModelContactEffects(runtime); assert.deepEqual(m, before);
});

test('countdowns decrement only on inactive-status rows and readiness waits until the next call', () => {
  const runtime = fixture(), {memory: m} = runtime, row = ready(m, 0);
  m[row + 7] = 1; m[row + 16 + 7] = 255;
  updatePlacedModelContactEffects(runtime);
  assert.equal(m[row + 6], 0); assert.equal(m[row + 7], 0); assert.equal(m[row + 16 + 7], 255); assert.equal(m.readUInt32LE(0x810920), 0);
  updatePlacedModelContactEffects(runtime); assert.equal(m[row + 6], 255); assert.equal(m.readUInt32LE(0x810920), 1);
});

test('one ready activation stops the scan before later timers are aged', () => {
  const runtime = fixture(), {memory: m} = runtime;
  const first = ready(m, 0), second = ready(m, 1); m[second + 7] = 2;
  updatePlacedModelContactEffects(runtime);
  assert.equal(m[first + 6], 255); assert.equal(m[second + 6], 0); assert.equal(m[second + 7], 2);
  updatePlacedModelContactEffects(runtime); assert.equal(m[second + 7], 1);
});

test('scale one suppresses sound but still emits both particle kinds and twelve debris pieces', () => {
  const runtime = fixture(), {memory: m} = runtime; const row = ready(m, 0, 1), free = m.readUInt32LE(0x6e65b4), cursor = m.readInt32LE(0x9153dc);
  updatePlacedModelContactEffects(runtime);
  assert.equal(m.readInt32LE(0x9153dc), cursor); assert.equal(m.readUInt32LE(0x6e65b4), free + 512); assert.equal(m.readInt32LE(0x902b88), 12);
  assert.equal(m.readUInt16LE(free + 0xa2), 4); assert.equal(m.readUInt16LE(free + 256 + 0xa2), 8);
  assert.equal(m.readInt32LE(0x91cd8c), 4); assert.equal(m.readInt32LE(0x91cd90), 1); assert.equal(m.readInt32LE(0x91cd68), 0);
  assert.equal(m.readUInt32LE(0x810920), 1); assert.equal(m.readUInt16LE(0x8106e0 + 16), 5); assert.equal(m.readUInt16LE(0x8106e0 + 18), 2);
  assert.equal(m.readUInt32LE(0x8106e0 + 12), a.stack - 44 + 0x14); assert.equal(m.readInt32LE(a.pulse + 12), 24); assert.equal(m[row + 6], 255);
});

test('negative signed scale takes the small plan, preserves large-effect globals and wraps the sound-position ring', () => {
  const runtime = fixture(), {memory: m} = runtime, row = ready(m, 0, -1);
  [-32768, 32767, -1].forEach((value, lane) => word(m, row + lane * 2, value)); put(m, 0x9153dc, 23);
  const large = Buffer.from(m.subarray(0x91cd60, 0x91cd94));
  updatePlacedModelContactEffects(runtime);
  assert.equal(m.readInt32LE(0x9153dc), 0); assert.deepEqual([0, 4, 8].map(offset => m.readInt32LE(0x919020 + 23 * 12 + offset)), [-2147483648, 2147418112, -65536]);
  assert.deepEqual(m.subarray(0x91cd60, 0x91cd94), large); assert.equal(m.readUInt32LE(0x810920), 0); assert.equal(m.readInt32LE(0x902b88), 21);
});

test('large effects publish damage state while an occupied global effect preserves the separate request block', () => {
  const runtime = fixture(), {memory: m} = runtime; ready(m, 0, 5); put(m, 0x811180, 1);
  const request = Buffer.from(m.subarray(0x91cd60, 0x91cd78)); updatePlacedModelContactEffects(runtime);
  assert.deepEqual(m.subarray(0x91cd60, 0x91cd78), request); assert.equal(m.readInt32LE(0x91cd8c), 20); assert.equal(m.readInt32LE(0x91cd90), 1);
  assert.equal(m.readUInt32LE(0x810920), 1); assert.equal(m.readUInt16LE(0x8106e0 + 16), 7);
});

test('actual class-two break publishes configuration flags and suppresses repeat removal through row+9', () => {
  const runtime = fixture(), {memory: m} = runtime, row = ready(m, 0, 1), object = m.readUInt32LE(row + 12), model = m.readUInt32LE(object + 0x10), configurations = m.readUInt32LE(object + 0x194);
  m[row + 9] = 0; const count = m[model + 0x27], before = Array.from({length: count}, (_, index) => m.readUInt32LE(configurations + index * 4));
  updatePlacedModelContactEffects(runtime);
  assert.equal(m[object + 0x19a], 5); assert.equal(m[row + 9], 1); assert.equal(m.readUInt32LE(object + 4), 0);
  for (let index = 0; index < count; index++) assert.equal(m.readUInt32LE(configurations + index * 4), (before[index] & 0xf5ffffff | 0x05000000) >>> 0);
});

test('raw damage falloff activates the same rows that the next pending-effect stage consumes', () => {
  const runtime = fixture(), {memory: m} = runtime, row = a.rows;
  put(m, 0x9207e4, 1); m[row + 6] = 4; m[row + 8] = 1;
  for (const offset of [0, 2, 4]) word(m, row + offset, 0);
  put(m, 0x91cd80, 0); put(m, 0x91cd84, 0); put(m, 0x91cd88, 0); put(m, 0x91cd8c, 4); put(m, 0x91cd90, 0);
  applyPlacedModelEffectDamage(runtime); assert.equal(m[row + 6], 4);
  put(m, 0x91cd90, 1); applyPlacedModelEffectDamage(runtime); assert.equal(m[row + 6], 0);
  updatePlacedModelContactEffects(runtime); assert.equal(m[row + 6], 255); assert.equal(m.readUInt32LE(0x810920), 1);
});

test('full pending-effect graph, populated sound services and persistent damage chains match retained instructions', async () => {
  const report = await verifyPlacedModelEffectUpdate({fixtures: 120, ticks: 4, damageScenarios: 8, output: null});
  assert.equal(report.matched, true); assert.equal(report.ownInstructions, 158); assert.equal(report.damageInstructions, 57); assert.ok(report.damageActivations > 0); assert.ok(report.sourceCalls > 0); assert.ok(report.reverbInstalls > 0);
  for (const address of ['413fc0', '414060', '4142a0', '44ef90', '435f20', '475a10', '436410', '437aa0', '437670', '484bb0', '40ea40']) assert.ok(report.actualGameCalls[address] > 0, address);
});
