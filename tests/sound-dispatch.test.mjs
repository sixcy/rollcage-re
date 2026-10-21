import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSoundChannel, updateSoundChannelPosition, initializeSoundReverb,
  configureSoundPlayback, dispatchNativeSound, copySoundCallable} from '../src/sound-dispatch.mjs';

function fixture() {
  const memory = Buffer.alloc(0x800000), log = [], sound = 0x3000, channel = 0x4000, source = 0x5000, effect = 0x6000;
  memory.writeUInt32LE(0x1000, 0x6f2414); memory.writeUInt32LE(0x1004, 0x6f2418); memory.writeUInt32LE(sound, 0x1000);
  memory.writeUInt32LE(0x2000, sound + 4); memory.writeUInt32LE(0x2004, sound + 8); memory.writeUInt32LE(channel, 0x2000);
  memory.writeUInt32LE(source, channel); memory.writeInt32LE(1, 0x6e6bd4);
  memory.writeFloatLE(2 ** -20, 0x5dc5b8); memory.writeFloatLE(30 * 2 ** -20, 0x5dc5d0); memory.writeFloatLE(1 / 32767, 0x5dc5dc); memory.writeFloatLE(0.0001, 0x5dc5e8);
  memory.writeFloatLE(2 ** -20, 0x5ecdb4); memory.writeFloatLE(30 * 2 ** -20, 0x5ecdb0);
  memory.writeFloatLE(2.5, 0x5dc8e0); memory.writeFloatLE(3, 0x5dc920); memory.writeFloatLE(4, 0x5dc97c);
  const handlers = {sourceCall(pointer, method, args) {log.push([pointer, method, args]); if (method === 0x50) return 1; if (method === 0x58) return effect; return 0;}};
  return {memory, sound, channel, source, effect, log, runtime: {memory, handlers, reverbScratch: Buffer.alloc(76, 0xa5)}};
}
test('invalid sound indices and null bank entries return -1 without reaching services', () => {
  const {memory, runtime} = fixture(); runtime.handlers = {};
  const request = {code: -1}; assert.equal(dispatchNativeSound(request, runtime), -1);
  request.code = 1; assert.equal(dispatchNativeSound(request, runtime), -1);
  memory.writeUInt32LE(0, 0x1000); request.code = 0;
  assert.equal(dispatchNativeSound(request, runtime), -1);
});

test('round-robin selection wraps the signed index and calls the common source binding once', () => {
  const {memory, sound, channel, log, runtime} = fixture();
  memory.writeUInt32LE(channel + 16, 0x2004); memory.writeUInt32LE(0x5100, channel + 16);
  memory.writeInt32LE(2, sound + 0x488); memory.writeInt32LE(1, sound + 0x48c);
  assert.equal(selectSoundChannel(sound, 0, 0, runtime), channel + 16);
  assert.equal(memory.readInt32LE(sound + 0x48c), 0);
  assert.deepEqual(log, [[0x5100, 4, [sound + 0x10]]]);
});

test('adaptive reuse checks the source twice and binds both before and after selection', () => {
  const {sound, channel, log, runtime} = fixture();
  runtime.handlers.sourceCall = (source, method, args) => {log.push([source, method, args]); return method === 0x38 ? 1 : 0;};
  assert.equal(selectSoundChannel(sound, 0, 0, runtime), channel);
  assert.deepEqual(log.map(item => [item[1], item[2]]), [[0x38, [1]], [0x38, [0]], [0x3c, []], [0x48, []], [4, [sound + 0x10]], [4, [sound + 0x10]]]);
});

test('a busy sixteen-channel vector returns null without allocation', () => {
  const {memory, sound, channel, runtime} = fixture();
  memory.writeUInt32LE(0x2040, sound + 8);
  for (let i = 0; i < 16; i++) memory.writeUInt32LE(channel, 0x2000 + i * 4);
  runtime.handlers.sourceCall = () => 2;
  assert.equal(selectSoundChannel(sound, 0, 0, runtime), 0);
});

test('allocation failure still appends a null pointer', () => {
  const {memory, sound, runtime} = fixture(), calls = [];
  memory.writeUInt32LE(0x2000, sound + 8);
  runtime.handlers.allocate = size => {calls.push(['allocate', size]); return 0;};
  runtime.handlers.appendChannel = (vector, pointer) => calls.push(['append', vector, pointer]);
  assert.equal(selectSoundChannel(sound, 0, 0, runtime), 0);
  assert.deepEqual(calls, [['allocate', 12], ['append', sound + 4, 0]]);
});

test('source creation captures the device before a callable clone mutates globals', () => {
  const {memory, sound, runtime, log} = fixture(), calls = [];
  memory.writeUInt32LE(0x2000, sound + 8); memory.writeUInt32LE(0x8000, 0x714b08);
  memory.writeUInt32LE(sound + 0x470, sound + 0x480);
  memory.fill(0xa5, 0x4200, 0x4210);
  runtime.handlers.allocate = () => 0x4200;
  runtime.handlers.cloneCallable = (pointer, inPlace) => {calls.push(['clone', pointer, inPlace]); memory.writeUInt32LE(0x8100, 0x714b08); return 0x9000;};
  runtime.handlers.createSource = (device, name, callable) => {calls.push(['create', device, name, callable]); return 0x5200;};
  runtime.handlers.appendChannel = (vector, pointer) => calls.push(['append', vector, pointer]);
  assert.equal(selectSoundChannel(sound, 0, 0, runtime), 0x4200);
  assert.deepEqual(calls, [['clone', sound + 0x470, true], ['create', 0x8000, sound + 0x10, 0x9000], ['append', sound + 4, 0x4200]]);
  assert.equal(memory.readUInt32LE(0x4200), 0x5200); assert.equal(memory.readUInt32LE(0x4204), 0); assert.equal(memory.readUInt32LE(0x4208), 0);
  assert.deepEqual(memory.subarray(0x420c, 0x4210), Buffer.alloc(4, 0xa5));
  assert.deepEqual(log, [[0x5200, 4, [sound + 0x10]]]);
});

test('position service mutations affect the subsequent velocity pointer and source lookup', () => {
  const {memory, channel, runtime, log} = fixture();
  memory.writeUInt32LE(0x7000, channel + 4); memory.writeUInt32LE(0x7010, channel + 8);
  memory.writeInt32LE(1048576, 0x7000); memory.writeInt32LE(1048576, 0x7020);
  runtime.handlers.sourceCall = (source, method, args) => {
    log.push([source, method, args[0]]);
    if (method === 8) {memory.writeUInt32LE(0x7020, channel + 8); memory.writeUInt32LE(0x5200, channel);}
  };
  updateSoundChannelPosition(channel, runtime);
  assert.equal(log[0][0], 0x5000); assert.equal(log[1][0], 0x5200);
  assert.deepEqual([0, 4, 8, 12].map(offset => log[0][2].readFloatLE(offset)), [1, 0, 0, 0]);
  assert.deepEqual([0, 4, 8, 12].map(offset => log[1][2].readFloatLE(offset)), [30, 0, 0, 0]);
});

test('tiny converted velocity vectors are cleared before the source call', () => {
  const {memory, channel, log, runtime} = fixture();
  memory.writeUInt32LE(0, channel + 4); memory.writeUInt32LE(0x7000, channel + 8);
  memory.writeInt32LE(1, 0x7000); memory.writeInt32LE(-1, 0x7004);
  updateSoundChannelPosition(channel, runtime);
  assert.equal(log.length, 1); assert.equal(log[0][1], 12);
  assert.deepEqual(log[0][2][0], Buffer.alloc(16));
});

test('reverb installation preserves opaque name tail and writes the complete fixed descriptor', () => {
  const bytes = Buffer.alloc(76, 0xa5); initializeSoundReverb(bytes, Buffer.from('x\0'));
  assert.deepEqual([...bytes.subarray(0, 4)], [120, 0, 0xa5, 0xa5]); assert.equal(bytes[23], 0);
  assert.equal(bytes.readUInt32LE(24), 0x42c80000); assert.equal(bytes.readInt32LE(28), -1000);
  assert.equal(bytes.readUInt32LE(72), 0x459c4000);
});

test('reverb zero mode requires existing support, while installation and effect writes preserve call order', () => {
  const {memory, channel, effect, log, runtime} = fixture(); let status = 0;
  runtime.handlers.sourceCall = (source, method, args) => {log.push([source, method, args]); if (method === 0x50) return status++; if (method === 0x58) return effect; return 0;};
  assert.equal(configureSoundPlayback(channel, 0, 1, runtime), 1);
  assert.deepEqual(log.map(item => item[1]), [0x50]);
  log.length = 0; status = 0;
  configureSoundPlayback(channel, 1, 1, runtime);
  assert.deepEqual(log.map(item => item[1]), [0x50, 0x54, 0x50, 0x58]);
  assert.equal(memory.readFloatLE(effect + 8), 2.5); assert.equal(memory.readFloatLE(effect + 12), 2.5); assert.equal(memory.readFloatLE(effect + 16), 0);
});

test('dispatcher records sound flags, honors a mutated parameter block and starts the selected source', () => {
  const {memory, sound, channel, log, runtime} = fixture(), parameters = Buffer.alloc(16);
  parameters.writeInt32LE(32767, 0); parameters.writeInt32LE(1000, 4); parameters.writeInt32LE(10, 8);
  memory.writeUInt32LE(0, channel + 4); memory.writeUInt32LE(0, channel + 8);
  const original = runtime.handlers.sourceCall;
  runtime.handlers.sourceCall = (source, method, args) => {if (method === 0x14) parameters.writeInt32LE(-1, 4); return original(source, method, args);};
  assert.equal(dispatchNativeSound({code: 0, registerEdx: 0, first: 0, modeIs9: 1, sixth: 0, parameters}, runtime), channel);
  assert.equal(memory[sound + 0x468], 1); assert.equal(memory[sound + 0x46a], 0); assert.equal(memory[sound + 0x46c], 0); assert.equal(memory[sound + 0x46f], 1);
  assert.equal(memory.readInt32LE(sound + 0x464), 10);
  assert.equal(log.some(item => item[1] === 0x20), false); assert.equal(log.at(-1)[1], 0x2c);
});

test('empty callable copies do not require a clone service', () => {
  const {memory} = fixture(); assert.equal(copySoundCallable(0x7000, {memory}), 0);
});
