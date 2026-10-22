import test from 'node:test';
import assert from 'node:assert/strict';
import {constructAudioListener} from '../src/audio-listener-construction.mjs';
import {initializeAudioListenerConstants, setAudioListenerVector, buildAudioListenerBasis, audioListenerMatrixToQuaternion, invokeAudioListenerFunction} from '../src/audio-listener-update.mjs';

function fixture() {
  const memory = initializeAudioListenerConstants(Buffer.alloc(0xa00000)), put = (p, v) => memory.writeInt32LE(v | 0, p);
  const runtime = {memory, scratchBase: 0x1f000, services: {rendererMath: (name, value) => Math[name](value)}};
  return {memory, put, runtime};
}

test('listener position forwards overlapping DWORDs while quaternion setter snapshots a full vector', () => {
  const {memory: m, put, runtime} = fixture(), listener = 0x100000;
  for (const offset of [0x20, 0x40]) {
    for (let i = 0; i < 5; i++) put(listener + offset - 4 + i * 4, i + 1);
    setAudioListenerVector(listener, listener + offset - 4, offset, runtime);
    assert.deepEqual([0, 4, 8, 12].map(i => m.readInt32LE(listener + offset + i)), offset === 0x20 ? [1, 1, 1, 1] : [1, 2, 3, 4]);
  }
});

test('parallel listener axes take the native component-rotation fallback and yield an orthonormal basis', () => {
  const {memory: m, runtime} = fixture(), output = 0x100000, axis = [0, 0x3f800000, 0, 0];
  buildAudioListenerBasis(output, axis, axis, runtime);
  const rows = [0, 16, 32].map(row => [0, 4, 8].map(i => m.readFloatLE(output + row + i)));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.equal(rows[i].reduce((sum, value, k) => sum + value * rows[j][k], 0), i === j ? 1 : 0);
  assert.equal(m.readFloatLE(output + 60), 1);
});

test('negative-trace matrix uses the largest diagonal to recover a half-turn quaternion', () => {
  const {memory: m, runtime} = fixture(), matrix = 0x110000, output = 0x100000;
  [-1, 1, -1, 1].forEach((value, i) => m.writeFloatLE(value, matrix + i * 20));
  audioListenerMatrixToQuaternion(output, matrix, runtime);
  assert.deepEqual([0, 4, 8, 12].map(i => m.readFloatLE(output + i)), [0, 1, 0, 0]);
});

test('listener-owned index callback updates its selected wrapper and preserves disabled orientation', () => {
  const {memory: m, put, runtime} = fixture(), listener = 0x100000, wrapper = 0x110000, array = 0x120000;
  for (const [address, value] of [[0x5d0304, 0x40f2c0], [0x5d0314, 0x40f2a0], [0x5d0318, 0x40eea0], [0x5d3cc8, 0x4aa070], [0x5d3cd0, 0x4aa0a0]]) put(address, value);
  constructAudioListener(listener, 1, [0x5d0304, 2, 0, 0, runtime.scratchBase + 8, 0], runtime);
  put(0x6f2408, array); put(0x6f240c, array + 12); put(array + 8, wrapper); put(wrapper, listener);
  put(wrapper + 4, 0); put(wrapper + 20, 1); put(wrapper + 36, 0);
  [4, -2, 7].forEach((value, i) => m.writeFloatLE(value, wrapper + 24 + i * 4));
  const quaternion = Buffer.from(m.subarray(listener + 0x40, listener + 0x50));
  invokeAudioListenerFunction(m.readUInt32LE(listener + 24), runtime);
  assert.deepEqual([0, 4, 8, 12].map(i => m.readFloatLE(listener + 0x20 + i)), [0, 0, 0, 0]);
  assert.deepEqual([0, 4, 8, 12].map(i => m.readFloatLE(listener + 0x30 + i)), [4, -2, 7, 0]);
  assert.deepEqual(m.subarray(listener + 0x40, listener + 0x50), quaternion);
});
