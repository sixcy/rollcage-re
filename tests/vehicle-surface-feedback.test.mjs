import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVehicleSurfaceFeedback} from '../src/vehicle-surface-feedback.mjs';
import {createSurfaceFeedbackFixture, verifyVehicleSurfaceFeedback} from '../tools/verify-vehicle-surface-feedback-instructions.mjs';
import {feedbackAddresses} from '../tools/verify-vehicle-audio-connected-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
function fixture() {
  const context = createSurfaceFeedbackFixture(1), {memory} = context, a = feedbackAddresses;
  memory[a.session + 0x54d] = 1; memory[0x909558] = 2; put(memory, a.body + 0x11c, -1); memory.writeUInt16LE(100, a.body + 0x668);
  for (const offset of [0x198, 0x1b4, 0x1d0, 0x1ec]) put(memory, a.body + offset, 0);
  return context;
}
test('surface feedback emits actual type3/4 descriptor arithmetic from signed speed and fallback materials', () => {
  const context = fixture(), calls = [];
  updateVehicleSurfaceFeedback({...context, handlers: {call407380: request => calls.push([request.edx, request.args[0]])}});
  assert.deepEqual(calls.map(call => call[0]), [3, 4]);
  const scale = context.memory.readFloatLE(0x5dc5e8);
  assert.equal(calls[0][1].readFloatLE(12), Math.fround(250 * scale));
  assert.equal(calls[1][1].readFloatLE(12), Math.fround(439 * scale));
  for (const [, descriptor] of calls) {assert.equal(descriptor.subarray(0, 12).toString('hex'), '00'.repeat(12)); assert.equal(descriptor.readFloatLE(12), descriptor.readFloatLE(16));}
});
test('signed record eligibility excludes128..255 and includes2..127', () => {
  for (const [value, expected] of [[0, 0], [1, 0], [2, 2], [127, 2], [128, 0], [255, 0]]) {
    const context = fixture(); context.memory[0x909558] = value; let count = 0;
    updateVehicleSurfaceFeedback({...context, handlers: {call407380: () => count++}}); assert.equal(count, expected);
  }
});
test('the second descriptor reloads body speed and deviceID after the first effect callback', () => {
  const context = fixture(), {memory} = context, calls = [];
  memory.writeUInt16LE(0, feedbackAddresses.other + 0x668);
  updateVehicleSurfaceFeedback({...context, handlers: {call407380: request => {calls.push([request.ecx, request.edx, request.args[0].readFloatLE(12)]); put(memory, 0x909300, feedbackAddresses.other); memory.writeUInt16LE(0xfff9, 0x90955c);}}});
  assert.equal(calls[1][0], -7); assert.equal(calls[1][1], 4); assert.equal(calls[1][2], Math.fround(488 * memory.readFloatLE(0x5dc5e8)));
});
test('valid terrain-band references select26 while invalid references use four material codes', () => {
  const context = fixture(), {memory} = context, values = [];
  for (const offset of [0x198, 0x1b4, 0x1d0, 0x1ec]) put(memory, feedbackAddresses.body + offset, 0x69000);
  put(memory, 0x6900c, 0); put(memory, feedbackAddresses.body + 0x11c, 0); memory.writeUInt16LE(0, 0x90929c);
  for (const code of [5, 1023]) {put(memory, 0x65004, code << 22); const calls = []; updateVehicleSurfaceFeedback({...context, handlers: {call407380: request => calls.push(request.args[0].readFloatLE(12))}}); values.push(calls[0]);}
  assert.equal(values[1], Math.fround(Math.fround(4500) * memory.readFloatLE(0x5dc5e8))); assert.ok(values[0] < values[1]);
});
test('full surface-feedback cache/device closure agrees with retained instructions', async () => {
  const result = await verifyVehicleSurfaceFeedback({fixtures: 100, output: null}); assert.equal(result.matched, true); assert.equal(result.instructions, 322); assert.ok(result.creates > 0); assert.ok(result.updates > 0);
});
