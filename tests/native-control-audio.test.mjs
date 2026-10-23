import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeControlAudioBindings, NativeControlAudioBoundary} from '../tools/lib/native-control-audio.mjs';
import {verifyNativeControlAudio} from '../tools/verify-native-control-audio-instructions.mjs';
import {configureSoundPlayback} from '../src/sound-dispatch.mjs';
import {setVehicleSoundFrequency, setVehicleSoundVolume, stopVehicleSound} from '../src/vehicle-sound-controls.mjs';

test('actual populated485300 controls match real game children, source state and shared-stack ABI preferred and relocated', async () => {
  const report = await verifyNativeControlAudio();
  assert.equal(report.matched, true); assert.equal(report.constructedCases, 24);
  assert.equal(report.sourceCalls, 392); assert.ok(report.instructionSteps > 20000);
  for (const method of [0x14, 0x20, 0x34, 0x38, 0x50, 0x58]) assert.ok(report.methods.includes(method));
  for (const site of ['0x484dc5', '0x484d86', '0x40e6b9', '0x485fdc']) assert.ok(report.callSites.includes(site));
});

function fixture() {
  const memory = Buffer.alloc(0xa00000, 0x61), object = 0x10000, channel = 0x20000, vtable = 0x30000, S = 0x9000;
  memory.writeUInt32LE(object, channel); memory.writeUInt32LE(vtable, object);
  for (const [method, target] of [[0x14, 0x4ad6a0], [0x20, 0x4ad5f0], [0x34, 0x4ad5b0], [0x50, 0x4ae4a0], [0x58, 0x4ae350]]) memory.writeUInt32LE(target, vtable + method);
  memory.writeUInt32LE(0, object + 0x964); memory.writeUInt32LE(0, object + 0x9a0);
  memory.writeFloatLE(1 / 32767, 0x5dc5dc); memory.writeUInt32LE(0x17b842a0, 0x5e8890); memory.writeInt32LE(1, 0x6e6bd4);
  const runtime = {memory, scratchBase: S, nativeAudioCalls: true, entryRegisters: {EBX: 0x101, EBP: 0x202, ESI: 0x303, EDI: 0x404}};
  const binding = createNativeControlAudioBindings(runtime); runtime.handlers = binding.handlers;
  return {memory, object, channel, vtable, S, runtime, binding};
}

test('bridge rejects outer or corrupt virtual caller metadata before executing source writes', () => {
  const {memory, object, runtime, binding, S} = fixture(), before = Buffer.from(memory);
  assert.throws(() => binding.handlers.sourceCall(object, 0x14, [1], runtime), NativeControlAudioBoundary);
  assert.deepEqual(memory, before);
  const entryEsp = S - 92, meta = {callerAddress: 0x485300, callerEntryEsp: S, callAddress: 0x485cc1,
    returnAddress: 0x485cc4, entryEsp, entryRegisters: runtime.entryRegisters};
  memory.writeUInt32LE(0x485cc5, entryEsp); memory.writeFloatLE(1, entryEsp + 4);
  const wrong = Buffer.from(memory);
  assert.throws(() => binding.handlers.sourceCall(object, 0x14, [1], {...runtime, scratchBase: entryEsp, nativeSourceCall: meta}), /ESP\/return word/);
  assert.deepEqual(memory, wrong);
});

test('native wrapper frequency, volume and stop use real nested frames without overwriting parent argument words', () => {
  const {memory, object, channel, runtime, binding, S} = fixture();
  memory.writeUInt32LE(0x485429, S); memory.writeInt32LE(1234, S + 4);
  const protectedWords = Buffer.from(memory.subarray(S + 4, S + 20));
  setVehicleSoundFrequency(channel, 1024, runtime);
  assert.equal(binding.events.at(-1).entryEsp, S - 8);
  assert.equal(binding.events.at(-1).returnAddress, 0x484dc8);
  setVehicleSoundVolume(channel, 0, 1234, runtime);
  assert.equal(binding.events.at(-1).entryEsp, S - 16);
  assert.equal(binding.events.at(-1).entryRegisters.EDI, object);
  stopVehicleSound(channel, runtime);
  assert.equal(binding.events.at(-1).entryEsp, S);
  assert.equal(binding.events.at(-1).returnAddress, 0x485429);
  assert.equal(memory.readUInt32LE(object + 0x94c), 0);
  assert.deepEqual(memory.subarray(S + 4, S + 20), protectedWords);
});

test('reached native installation remains an explicit dependency and preserves source/effect state', () => {
  const {memory, object, channel, runtime, binding, S} = fixture(), before = Buffer.from(memory.subarray(object, object + 0x9a8));
  memory.writeInt32LE(0, S + 4);
  assert.throws(() => configureSoundPlayback(channel, 1, 0, runtime), /unbound original reverb installation/);
  assert.equal(binding.events.length, 1); assert.equal(binding.events[0].method, 0x50);
  assert.deepEqual(memory.subarray(object, object + 0x9a8), before);
  assert.equal(memory.readInt32LE(S + 4), 0);
  assert.throws(() => binding.handlers.call484bb0({}), /unbound484bb0|unbound 484bb0/);
});
