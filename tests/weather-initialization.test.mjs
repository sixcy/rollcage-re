import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRainRenderBuffer, initializeWeatherEnvironment} from '../src/weather-initialization.mjs';
test('rain render storage contains2048 initialized60-byte primitives and a native end pointer', () => {
  const memory = Buffer.alloc(0xa00000); initializeRainRenderBuffer({memory, services: {libraryCall(name, args) {assert.equal(name, 'allocate'); assert.equal(args[0], 0x1e000); return 0x100000;}}});
  assert.equal(memory.readUInt32LE(0x80ddfc), 0x11e000); for (const p of [0x100000, 0x10003c, 0x11dfc4]) {assert.equal(memory.readUInt32LE(p + 4), 0xae2f0000); assert.equal(memory[p + 3], 12); assert.equal(memory.readUInt32LE(p + 32), 0x181818);}
});
test('environment initialization derives a native millisecond seed and brightness from live settings', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeUInt32LE(1, 0x6e6c8c); memory.writeUInt32LE(0x10000, 0x5ecefc); memory[0x10026] = 1; memory.writeUInt32LE(0x20000, 0x5ecb1c); memory[0x20553] = 2; memory[0x20555] = 1; memory.writeBigInt64LE(10000000n, 0x7135a4); memory.writeBigInt64LE(100n, 0x7135ac);
  initializeWeatherEnvironment({memory, scratchBase: 0x9000, services: {libraryCall: () => 0x30000, platformCall(name, args) {assert.equal(name, 'QueryPerformanceCounter'); memory.writeBigInt64LE(12340100n, args[0]); return 1;}}});
  assert.equal(memory.readUInt32LE(0x5ed2bc), 1234); assert.equal(memory.readInt32LE(0x5ed2b8), 128); assert.equal(memory.readInt32LE(0x6e6ce8), 30); assert.equal(memory.readInt32LE(0x5ed2c0), 192);
});
