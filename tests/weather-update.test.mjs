import test from 'node:test';
import assert from 'node:assert/strict';
import {updateWeatherBrightness, updateWeatherLightning} from '../src/weather-update.mjs';
import {advanceWeatherRandom, seedWeatherVolumeParticles} from '../src/weather-volumes.mjs';
test('brightness transitions retain old brightness and honor the native31-frame darkening delay', () => {
  const memory = Buffer.alloc(0xa00000), runtime = {memory}; memory.writeInt32LE(256, 0x5ed2b8); for (let i = 0; i < 30; i++) updateWeatherBrightness(runtime); assert.equal(memory.readInt32LE(0x5ed2b8), 256); updateWeatherBrightness(runtime); assert.equal(memory.readInt32LE(0x5ed2b8), 255); assert.equal(memory.readInt32LE(0x6e6cd0), 256); assert.equal(memory.readInt32LE(0x5ed2b4), 1);
});
test('disabled lightning still advances its existing alternating duration', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeInt32LE(3, 0x6e6cec); memory.writeInt32LE(99, 0x5ed2bc); updateWeatherLightning(0, {memory}); assert.equal(memory.readInt32LE(0x6e6cec), 2); assert.equal(memory.readInt32LE(0x6e6cc8), 2); assert.equal(memory.readInt32LE(0x5ed2bc), 99);
});
test('invalid volume extents return before consuming the shared weather random sequence', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeInt32LE(12345678, 0x5ed2bc); memory.writeInt16LE(4096, 0x20000); seedWeatherVolumeParticles(0x30000, 0x10000, 0x20000, {memory}); assert.equal(memory.readInt32LE(0x5ed2bc), 12345678); assert.equal(advanceWeatherRandom(memory), Math.imul(12345678, 16807) & 0x7fffffff);
});
