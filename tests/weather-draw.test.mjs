import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {prepareWeatherDrawFixture} from '../tools/verify-weather-draw-instructions.mjs';
import {drawWeatherRain, drawWeatherSnow} from '../src/weather-draw.mjs';
const program = await loadRetainedNativeProgram();
function fixture() {
  const memory = Buffer.alloc(0xa00000); program.initializeMemory(memory);
  const addresses = prepareWeatherDrawFixture(memory), runtime = {memory, scratchBase: 0x9000};
  return {memory, runtime, ...addresses};
}
test('a full accepted rain buffer retains the native expanded clipping boundaries', () => {
  const {memory, runtime, primitives, buckets} = fixture(); drawWeatherRain(0, runtime);
  assert.equal(memory.readFloatLE(0x91ce00), 3.125); assert.equal(memory.readFloatLE(0x91ce04), 636.875);
  assert.equal(memory.readUInt32LE(buckets + 0x74), primitives + 2047 * 60);
  assert.equal(memory.readUInt32LE(primitives + 2047 * 60), primitives + 2046 * 60);
});
test('a partly accepted rain buffer restores clipping bounds after the whole input traversal', () => {
  const {memory, runtime, row, primitives, buckets} = fixture(); memory.writeInt16LE(0, row + 20 + 2047 * 8 + 6); drawWeatherRain(0, runtime);
  assert.equal(memory.readFloatLE(0x91ce00), 0); assert.equal(memory.readFloatLE(0x91ce04), 640);
  assert.equal(memory.readUInt32LE(buckets + 0x74), primitives + 2046 * 60);
});
test('snow quads use the real projected center, shared depth buckets and capped radius', () => {
  const {memory, runtime, row, primitives, buckets} = fixture();
  for (let i = 1; i < 2048; i++) memory.writeInt16LE(0, row + 20 + i * 8 + 6);
  memory.writeInt32LE(256, 0x91ce94); memory.writeInt16LE(32, row + 24);
  drawWeatherSnow(0, runtime);
  assert.equal(memory.readUInt32LE(buckets + 0x74), primitives);
  assert.deepEqual([16, 44, 20, 76].map(o => memory.readFloatLE(primitives + o)), [304, 336, 224, 256]);
  assert.deepEqual([8, 36, 64, 92].map(o => memory.readInt32LE(primitives + o)), [64, 64, 64, 64]);
  assert.deepEqual([12, 40, 68, 96].map(o => memory.readFloatLE(primitives + o)), [32, 32, 32, 32]);
});
test('negative snow depth skips projection completion and leaves the renderer queue untouched', () => {
  const {memory, runtime, row, primitives, buckets} = fixture();
  for (let i = 1; i < 2048; i++) memory.writeInt16LE(0, row + 20 + i * 8 + 6);
  memory.writeInt16LE(-1, row + 24); memory.writeFloatLE(123, 0x6fb5dc);
  const before = Buffer.from(memory.subarray(primitives, primitives + 120)); drawWeatherSnow(0, runtime);
  assert.equal(memory.readFloatLE(0x6fb5dc), 123); assert.equal(memory.readUInt32LE(buckets + 0x74), 0);
  assert.deepEqual(memory.subarray(primitives, primitives + 120), before);
});
