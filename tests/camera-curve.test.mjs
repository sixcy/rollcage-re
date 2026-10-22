import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeCameraCurveConstants, initializeCameraCurveFactorials, evaluateCameraCurvePower, evaluateCameraCurve, scaleCameraCurveTemplate} from '../src/camera-curve.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), runtime = {memory, scratchBase: 0x9000};
  initializeCameraCurveConstants(memory); initializeCameraCurveFactorials(runtime);
  const put = (p, v) => memory.writeInt32LE(v | 0, p);
  put(0x5ecb1c, 0x50000); return {memory, runtime, put};
}

test('camera factorial producer writes0!..12! and retains the next word', () => {
  const f = fixture(); f.put(0x6f9bf4, 123); initializeCameraCurveFactorials(f.runtime);
  assert.equal(f.memory.readInt32LE(0x6f9bc0), 1); assert.equal(f.memory.readInt32LE(0x6f9bd0), 24);
  assert.equal(f.memory.readInt32LE(0x6f9bf0), 479001600); assert.equal(f.memory.readInt32LE(0x6f9bf4), 123);
});

test('camera binary power retains Q16 multiplication rounding and its five-bit computation limit', () => {
  const f = fixture(); assert.equal(evaluateCameraCurvePower(32768, 2, f.runtime), 16384);
  assert.equal(evaluateCameraCurvePower(65536, 31, f.runtime), 65536);
  assert.equal(evaluateCameraCurvePower(32768, 32, f.runtime), 65536);
});

test('camera curve evaluates endpoints and linear control points with Q16 output', () => {
  const f = fixture(); for (let point = 0; point < 5; point++) for (let axis = 0; axis < 3; axis++) f.put(0x58000 + point * 12 + axis * 4, point + axis);
  for (const [t, point] of [[0, 0], [32768, 2], [65536, 4]]) {
    evaluateCameraCurve(0x58000, 0x59000, t, f.runtime);
    assert.deepEqual([0, 4, 8].map(offset => f.memory.readInt32LE(0x59000 + offset)), [point, point + 1, point + 2].map(v => v * 65536));
  }
});

test('camera curve denominator failure preserves the earlier zero-output writes', () => {
  const f = fixture(); f.put(0x6f9bc0, 0); for (const offset of [0, 4, 8]) f.put(0x59000 + offset, 123);
  assert.throws(() => evaluateCameraCurve(0x58000, 0x59000, 32768, f.runtime), /signed division by zero/);
  assert.deepEqual([0, 4, 8].map(offset => f.memory.readInt32LE(0x59000 + offset)), [0, 0, 0]);
});

test('camera template clamps environment mode at16 and preserves each row padding word', () => {
  const first = fixture(), last = fixture(); first.memory[0x50579] = 16; last.memory[0x50579] = 255;
  for (let row = 0; row < 5; row++) for (const f of [first, last]) f.memory.writeUInt16LE(0x7654, 0x5eabf6 + row * 8);
  scaleCameraCurveTemplate(first.runtime); scaleCameraCurveTemplate(last.runtime);
  assert.deepEqual(first.memory.subarray(0x5eabf0, 0x5eac18), last.memory.subarray(0x5eabf0, 0x5eac18));
  for (let row = 0; row < 5; row++) assert.equal(first.memory.readUInt16LE(0x5eabf6 + row * 8), 0x7654);
});
