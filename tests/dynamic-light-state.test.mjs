import test from 'node:test';
import assert from 'node:assert/strict';
import {updateDynamicLights, allocateDynamicLight, insertDynamicLightRanges, removeDynamicLightRanges, updateDynamicLightPosition, updateVehicleDynamicLight} from '../src/dynamic-light-state.mjs';
import {createDynamicLightFixture, lightAddresses, verifyDynamicLightState} from '../tools/verify-dynamic-light-state-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const LIGHT = 0x80f560;
function fixture() {const context = createDynamicLightFixture(1); put(context.memory, 0x80f210, 0); put(context.memory, 0x810920, 0); return context;}

test('light registration uses first empty of eight band cells and preserves a full band', () => {
  const context = fixture(), {memory} = context, a = lightAddresses;
  const band = a.bands + 0x1000 + 32; memory.fill(0, a.bands, a.bands + 0x3000);
  for (let slot = 0; slot < 8; slot++) put(memory, band + slot * 4, slot + 1);
  const before = Buffer.from(memory.subarray(band, band + 32));
  insertDynamicLightRanges(3, a.authored, context);
  assert.deepEqual(memory.subarray(band, band + 32), before);
  assert.equal(memory.readUInt32LE(0x80f520 + 3 * 64 + 0x14), memory.readUInt32LE(a.authored));
  assert.equal(memory.readUInt32LE(band + 32) >>> 22, 3);
});

test('removal clears only the first matching entry per band and suppresses repeated last dirty ranges', () => {
  const context = fixture(), {memory} = context, a = lightAddresses, band = a.bands + 0x1000 + 32;
  memory.fill(0, a.bands, a.bands + 0x3000); const value = (1 << 22) | (33 << 11) | 16;
  for (const offset of [0, 4, 32, 36]) put(memory, band + offset, value);
  removeDynamicLightRanges(1, context);
  assert.equal(memory.readInt32LE(band), 0); assert.equal(memory.readInt32LE(band + 32), 0);
  assert.equal(memory.readUInt32LE(band + 4), value); assert.equal(memory.readUInt32LE(band + 36), value);
  assert.equal(memory.readInt32LE(0x80f210), 1);
});

test('allocation scans from the search index and preserves the native one-step high-water increment', () => {
  const context = fixture(), {memory} = context, a = lightAddresses;
  put(memory, 0x80f20c, 2); put(memory, 0x80f214, 1);
  for (let index = 1; index < 5; index++) word(memory, 0x80f520 + index * 64 + 0x24, 4);
  assert.equal(allocateDynamicLight(a.position, a.color, 10, context), 5);
  assert.equal(memory.readUInt32LE(0x80f20c), 3);
  assert.equal(memory.readUInt16LE(0x80f520 + 5 * 64 + 0x24), 1);
});

test('intermediate substeps retain queued allocation and dirty age until the final substep', () => {
  const context = fixture(), {memory} = context; word(memory, LIGHT + 0x24, 4); word(memory, LIGHT + 18, 5);
  put(memory, 0x80f210, 1); put(memory, 0x80f420, (2 << 29) | 37);
  updateDynamicLights(1, context); assert.equal(memory.readUInt16LE(LIGHT + 18), 5); assert.equal(memory.readUInt32LE(0x80f420) >>> 29, 2);
  updateDynamicLights(0, context); assert.equal(memory.readUInt16LE(LIGHT + 18), 4); assert.equal(memory.readUInt32LE(0x80f420) >>> 29, 1);
});

test('same-bin movement refreshes position and age without producing dirty bands', () => {
  const context = fixture(), {memory} = context, a = lightAddresses;
  for (let lane = 0; lane < 3; lane++) put(memory, a.position + lane * 4, memory.readInt32LE(LIGHT + lane * 4) + 123);
  updateDynamicLightPosition(1, a.position, context);
  assert.equal(memory.readInt32LE(0x80f210), 0); assert.equal(memory.readUInt16LE(LIGHT + 18), 2);
  assert.deepEqual(memory.subarray(LIGHT, LIGHT + 12), memory.subarray(a.position, a.position + 12));
});

test('expired last light removes its ranges and contracts the high-water count once', () => {
  const context = fixture(), {memory} = context; word(memory, LIGHT + 0x24, 2); word(memory, LIGHT + 0x26, 1);
  updateDynamicLights(1, context);
  assert.equal(memory.readUInt16LE(LIGHT + 0x24), 0); assert.equal(memory.readUInt32LE(0x80f20c), 1); assert.ok(memory.readUInt32LE(0x80f210) > 0);
});

test('palette animation wraps its unsigned index and expands five-bit channels without retaining alpha', () => {
  const context = fixture(), {memory} = context, a = lightAddresses;
  word(memory, LIGHT + 0x24, 1); put(memory, LIGHT + 0x28, a.palette); word(memory, LIGHT + 0x2c, 65535); word(memory, LIGHT + 0x2e, 4); word(memory, a.palette, 0x7fff); word(memory, 0x90b68e, 0);
  updateDynamicLights(1, context);
  assert.equal(memory.readUInt16LE(LIGHT + 0x2c), 0); assert.equal(memory.readUInt32LE(LIGHT + 12), 0x7c7c7c);
});

test('vehicle-follow light uses real short transform scratch and signed attached offset', () => {
  const context = fixture(), {memory} = context, a = lightAddresses, body = memory.readUInt32LE(LIGHT + 0x34);
  for (let lane = 0; lane < 10; lane++) word(memory, body + 0xc4 + lane * 2, lane % 4 === 0 ? 4096 : 0);
  updateVehicleDynamicLight(LIGHT, 1, context);
  assert.equal(memory.readUInt32LE(0x91d3e4), 0xffec0000); assert.equal(memory.readUInt32LE(0x91d3e8), 0xff6a);
  assert.deepEqual([0, 4, 8].map(offset => memory.readInt32LE(LIGHT + offset)), [memory.readInt32LE(body + 0x34), memory.readInt32LE(body + 0x38) - 20, memory.readInt32LE(body + 0x3c) - 150]);
  assert.equal(memory.readFloatLE(0x91cdc0), 1);
});

test('scripted attached body override runs before actual integration', () => {
  const context = fixture(), {memory} = context, a = lightAddresses; word(memory, LIGHT + 0x24, 1); put(memory, LIGHT + 0x28, 0); put(memory, LIGHT + 0x30, a.bodies);
  const before = memory.readInt32LE(a.bodies + 0x34); let calls = 0;
  updateDynamicLights(1, {...context, handlers: {call476550: request => {assert.equal(request.ecx, a.bodies); put(memory, a.bodies + 0x68, 0x1000000); calls++;}}});
  assert.equal(calls, 1); assert.equal(memory.readInt32LE(a.bodies + 0x34), (before + 0x1000000) | 0); assert.equal(memory.readInt32LE(LIGHT), memory.readInt32LE(a.bodies + 0x34));
});

test('scripted light default executes actual raw VM and preserves native nonunit mass', () => {
  const context = fixture(), {memory} = context, a = lightAddresses, script = 0x30000, body = a.bodies;
  word(memory, LIGHT + 0x24, 1); put(memory, LIGHT + 0x28, 0); put(memory, LIGHT + 0x30, body);
  put(memory, body + 0x134, script); put(memory, body + 0x138, 0); put(memory, body + 0xa8, -1);
  word(memory, script, 0); word(memory, script + 2, 32767); word(memory, script + 4, -32768); word(memory, script + 6, -1); word(memory, script + 8, 5);
  const before = [0x34, 0x38, 0x3c].map(offset => memory.readInt32LE(body + offset)), velocity = [32767 << 8, -32768 << 8, -256];
  updateDynamicLights(1, context);
  assert.equal(memory.readUInt16LE(body + 0x138), 8);
  assert.deepEqual([0x68, 0x6c, 0x70].map(offset => memory.readInt32LE(body + offset)), velocity);
  assert.deepEqual([0x40, 0x44, 0x48].map(offset => memory.readInt32LE(body + offset)), [-128, 128, 0]);
  for (let lane = 0; lane < 3; lane++) assert.equal(memory.readInt32LE(LIGHT + lane * 4), (before[lane] + velocity[lane]) | 0);
});

test('dynamic light registry and connected queue producers agree with retained instructions', async () => {
  const report = await verifyDynamicLightState({fixtures: 120, output: null});
  assert.equal(report.matched, true); assert.equal(report.instructions, 1521); assert.equal(report.producerChains, 10);
  for (const entry of ['0x44d960', '0x44d7a0', '0x44d6a0', '0x44d5b0', '0x44df50', '0x4286e0', '0x44d230', '0x436410', '0x436490']) assert.ok(report.actualGameCalls[entry] > 0, entry);
});
