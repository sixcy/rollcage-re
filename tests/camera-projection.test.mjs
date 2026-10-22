import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeCameraProjectionConstants, updateCameraProjectionRatios, updateCameraClipPlanes, updateCameraProjection, updateCameraAspectProjection} from '../src/camera-projection.mjs';

function fixture(width = 640, height = 480) {
  const memory = Buffer.alloc(0xa00000); initializeCameraProjectionConstants(memory);
  memory.writeUInt32LE(0x30000, 0x6e6388); memory.writeUInt32LE(0x31000, 0x5ecefc);
  memory.writeUInt16LE(width, 0x3142c); memory.writeUInt16LE(height, 0x3142e);
  const log = [], runtime = {memory, scratchBase: 0x9000, handlers: {
    projectionMath(operation, value) {log.push(operation); return Math.fround(Math[operation](value));},
    projectionInteger(value) {log.push('integer'); return !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value));}
  }};
  return {memory, runtime, log};
}

test('camera ratios use signed low16 and clamp integer ratios after the unclamped scale', () => {
  const f = fixture(); assert.equal(updateCameraProjectionRatios(104, f.runtime), 256);
  assert.equal(f.memory.readInt32LE(0x91ce94), 512); assert.equal(f.memory.readInt32LE(0x91d324), 256);
  updateCameraProjectionRatios(0xffff, f.runtime);
  assert.equal(f.memory.readInt32LE(0x91ce94), -4); assert.equal(f.memory.readInt32LE(0x91d324), 256); assert.equal(f.memory.readInt32LE(0x91d328), 256);
});

test('camera clipping publishes mirrored planes and the native width return separately from packed dimensions', () => {
  const f = fixture(), result = updateCameraClipPlanes(0, 0, 640, 480, 208, f.runtime);
  assert.equal(result, 640); assert.equal(f.memory.readInt32LE(0x91d594), (480 << 16) + 640); assert.equal(f.memory.readInt32LE(0x6e6560), 0);
  assert.equal(f.memory.readUInt32LE(0x6fb444) ^ f.memory.readUInt32LE(0x6fb454), -2147483648);
  assert.equal(f.memory.readUInt32LE(0x6fb468) ^ f.memory.readUInt32LE(0x6fb478), -2147483648);
  assert.equal(f.memory.readUInt32LE(0x6fb44c), f.memory.readUInt32LE(0x6fb45c)); assert.equal(f.memory.readUInt32LE(0x6fb46c), f.memory.readUInt32LE(0x6fb47c));
  assert.deepEqual(f.log, ['atan', 'sin', 'cos', 'atan', 'sin', 'cos', 'integer', 'integer']);
});

test('camera clip bounds use the live current viewport and preserve unordered comparison behavior', () => {
  const f = fixture(); f.memory.writeUInt32LE(0x32000, 0x6efb3c); f.memory.writeInt32LE(100, 0x3208c); f.memory.writeInt32LE(100, 0x32090);
  updateCameraClipPlanes(0, 0, 101, 100, 104, f.runtime); assert.equal(f.memory.readInt32LE(0x6e6560), 64);
  updateCameraClipPlanes(NaN, NaN, 100, 100, 104, f.runtime); assert.equal(f.memory.readInt32LE(0x6e6560), 0);
  updateCameraClipPlanes(-1, 0, 100, 100, 104, f.runtime); assert.equal(f.memory.readInt32LE(0x6e6560), 64);
});

test('camera projection keeps the original aspect input while publishing the corrected distance', () => {
  const f = fixture(1920, 1080); updateCameraAspectProjection(1000, f.runtime);
  assert.equal(f.memory.readFloatLE(0x91ceb0), 1000); assert.equal(f.memory.readUInt16LE(0x91d50a), 750); assert.equal(f.memory.readFloatLE(0x91ceac), 750);
  assert.equal(f.memory.readFloatLE(0x91cda0), 4500); assert.equal(f.memory.readInt32LE(0x91d594), (1080 << 16) + 1920);
});

test('projection exposes a missing CRT service after preceding native writes', () => {
  const f = fixture(); delete f.runtime.handlers.projectionMath;
  assert.throws(() => updateCameraProjection(104, f.runtime), /CRT atan\/sin\/cos/);
  assert.equal(f.memory.readFloatLE(0x91ceac), 104); assert.equal(f.memory.readFloatLE(0x91cda0), 208); assert.equal(f.memory.readInt32LE(0x91d324), 256);
});
