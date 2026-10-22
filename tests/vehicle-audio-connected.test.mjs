import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVehicleAudio} from '../src/vehicle-audio.mjs';
import {createVehicleFeedbackFixture, createVehicleFeedbackServices, feedbackAddresses, verifyVehicleAudioConnected} from '../tools/verify-vehicle-audio-connected-instructions.mjs';

test('complete vehicle audio chain agrees with retained instructions across persistent populated fixtures', async () => {
  const result = await verifyVehicleAudioConnected({fixtures: 28, ticks: 3, output: null});
  assert.equal(result.matched, true);
  assert.equal(result.instructions, 1965);
  assert.equal(result.parentCalls, 84);
  for (const entry of ['0x485300', '0x484cb0', '0x484d10', '0x484d30', '0x484d90', '0x407380', '0x4074e0', '0x407570', '0x407670']) assert.ok(result.actualGameCalls[entry] > 0, entry);
  assert.ok(result.reverbInstalls > 0);
  assert.ok(result.hapticCreates > 0);
  assert.ok(result.hapticUpdates > 0);
  assert.ok(result.hapticStops > 0);
});

test('actual populated horn start and release use the cached sound channel', () => {
  const context = createVehicleFeedbackFixture(13), log = [];
  const runtime = {...context, handlers: createVehicleFeedbackServices(context, log)};
  updateVehicleAudio(context.body, context.index, runtime);
  const channel = context.memory.readUInt32LE(context.horn + 8);
  assert.ok(channel > 256);
  context.memory[context.body + 0x710] &= ~0x20;
  updateVehicleAudio(context.body, context.index, runtime);
  assert.equal(context.memory.readUInt32LE(context.horn + 8), 127);
  assert.ok(log.some(call => call[0] === 'source' && call[2] === 0x34));
});

test('actual haptic cache creates, updates and removes its type-one effect across updates', () => {
  const context = createVehicleFeedbackFixture(7), log = [];
  const runtime = {...context, handlers: createVehicleFeedbackServices(context, log)};
  updateVehicleAudio(context.body, context.index, runtime);
  assert.ok(log.some(call => call[0] === 'device' && call[2] === 0x40));
  log.length = 0;
  updateVehicleAudio(context.body, context.index, runtime);
  assert.ok(log.some(call => call[0] === 'device' && call[2] === 0x44));
  log.length = 0;
  for (const offset of [0x3e8, 0x4b0, 0x578, 0x640]) context.memory.writeInt32LE(1000, feedbackAddresses.body + offset);
  updateVehicleAudio(context.body, context.index, runtime);
  const stop = log.findIndex(call => call[0] === 'device' && call[2] === 0x3c);
  assert.ok(stop >= 0);
  assert.equal(log[stop + 1][2], 0x38);
  assert.equal(log[stop + 1][3][0], log[stop][3][0] + 1);
  assert.ok(log.some(call => call[0] === 'container' && call[1] === 0x40b370));
});
