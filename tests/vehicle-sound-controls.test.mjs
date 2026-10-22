import test from 'node:test';
import assert from 'node:assert/strict';
import {startVehicleSound, stopVehicleSound, setVehicleSoundVolume, setVehicleSoundFrequency} from '../src/vehicle-sound-controls.mjs';
import {initializeVehicleHapticsConstants} from '../src/vehicle-haptics.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), log = [], runtime = {memory, handlers: {sourceCall: (pointer, method, args) => {log.push([pointer, method, args]); return 0;}}};
  initializeVehicleHapticsConstants(memory); memory.writeUInt32LE(0x5000, 0x4000);
  return {memory, runtime, log};
}
test('sound start truncates register bytes and sign-extends pitch/volume words through actual emitter', () => {
  const {runtime} = fixture(); let request;
  runtime.handlers.dispatch40ea40 = value => {request = value; return 0x4000;};
  assert.equal(startVehicleSound(0x1234002b, 0x107, 0xffff, 0x8000, 0x6000, 257, runtime), 0x4000);
  assert.equal(request.code, 43); assert.equal(request.registerEdx, 0x6000); assert.equal(request.first, 0); assert.equal(request.sixth, 0); assert.equal(request.parameters.readInt32LE(4), -1); assert.equal(request.parameters.readInt32LE(8), 7); assert.equal(request.parameters.readInt32LE(12), 1);
  assert(request.parameters.readInt32LE(0) < -32768);
});
test('default start reaches actual sound bank/channel/position services and reloads a replaced source', () => {
  const {memory, runtime, log} = fixture(); memory.writeUInt32LE(0x1000, 0x6f2414); memory.writeUInt32LE(0x1100, 0x6f2418); memory.writeUInt32LE(0x2000, 0x1000 + 43 * 4); memory.writeUInt32LE(0x3000, 0x2004); memory.writeUInt32LE(0x3004, 0x2008); memory.writeUInt32LE(0x4000, 0x3000); memory.writeInt32LE(1, 0x2488);
  runtime.handlers.sourceCall = (source, method, args) => {log.push([source, method, args]); if (method === 4) memory.writeUInt32LE(0x5100, 0x4000); return 0;};
  assert.equal(startVehicleSound(43, 7, 1000, 1000, 0x6000, 0, runtime), 0x4000);
  assert.equal(log[0][0], 0x5000); assert(log.slice(1).every(call => call[0] === 0x5100)); assert(log.some(call => call[1] === 8)); assert(log.some(call => call[1] === 0x2c));
});
test('unsigned handle sentinels and null source guard all three source controls', () => {
  const {memory, runtime, log} = fixture(); memory.writeUInt32LE(0, 0x4000);
  for (const channel of [0, 127, 256, 0x4000]) {stopVehicleSound(channel, runtime); setVehicleSoundVolume(channel, 0, 1000, runtime); setVehicleSoundFrequency(channel, 1000, runtime);}
  assert.deepEqual(log, []);
});
test('volume clamps signed low words and keeps native integer then float32 rounding', () => {
  const {memory, runtime, log} = fixture();
  setVehicleSoundVolume(0x4000, 0x10003, -1, runtime); setVehicleSoundVolume(0x4000, -100, 0xffff, runtime);
  assert.equal(log[0][1], 0x14); assert.equal(log[0][2][0], Math.fround(6 * memory.readFloatLE(0x5dc5dc))); assert.equal(log[1][2][0], Math.fround(-2 * memory.readFloatLE(0x5dc5dc)));
});
test('frequency-1 sentinel differs from ordinary negative truncation and stop uses method34', () => {
  const {runtime, log} = fixture(); for (const value of [-1, 65535, -2, 1, 1024]) setVehicleSoundFrequency(0x4000, value, runtime); stopVehicleSound(0x4000, runtime);
  assert.deepEqual(log.map(call => [call[1], call[2]]), [[0x20, [-1]], [0x20, [-1]], [0x20, [-21]], [0x20, [10]], [0x20, [11025]], [0x34, []]]);
});
