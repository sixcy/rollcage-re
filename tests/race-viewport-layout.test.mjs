import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRaceViewportParticipants, layoutRaceViewports, initializeRaceViewportLayoutConstants} from '../src/race-viewport-layout.mjs';
function fixture(mode = 0, width = 640, height = 480) {
  const memory = initializeRaceViewportLayoutConstants(Buffer.alloc(0xa00000)), session = 0x120000, config = 0x122000, auxiliary = 0x124000;
  memory.writeUInt32LE(session, 0x5ecb1c); memory.writeUInt32LE(config, 0x5ecefc); memory.writeUInt32LE(auxiliary, 0x90b990); memory[session + 0x552] = mode;
  memory.writeUInt16LE(width, config + 0x42c); memory.writeUInt16LE(height, config + 0x42e);
  return {memory, session, auxiliary, scratchBase: 0x9000};
}
const selected = m => Array.from({length: 4}, (_, i) => m.readInt32LE(0x5ec120 + i * 4));
const rectangle = (m, index) => Array.from({length: 4}, (_, i) => m.readInt32LE(0x909308 + index * 0x30c + i * 4));
test('offline selection uses the original SIMD table addition', () => {
  const f = fixture(); selectRaceViewportParticipants(f); assert.deepEqual(selected(f.memory), [0, 1, 2, 3]);
  f.memory.writeInt32LE(2147483647, 0x5dcc60); f.memory.writeInt32LE(1, 0x5dcb80); selectRaceViewportParticipants(f); assert.equal(selected(f.memory)[0], -2147483648);
});
test('network views retain local ID then first three exact-active peers in ascending order', () => {
  const f = fixture(), m = f.memory; m[0x6eafe0] = 16; m.writeInt32LE(3, 0x6e9f70);
  [1, 2, 1, 1, 1, 1].forEach((v, i) => m.writeInt32LE(v, 0x6e7884 + i * 0x67c)); selectRaceViewportParticipants(f); assert.deepEqual(selected(m), [3, 0, 2, 4]);
});
test('negative local ID is retained and missing peer slots are zeroed', () => {
  const f = fixture(), m = f.memory; m[0x6eafe0] = 16; m.writeInt32LE(-1, 0x6e9f70); m.writeInt32LE(1, 0x6e7884 + 5 * 0x67c); selectRaceViewportParticipants(f); assert.deepEqual(selected(m), [-1, 5, 0, 0]);
});
test('four-player layout publishes ordered rectangles and signed-short session extents', () => {
  const f = fixture(4), m = f.memory; layoutRaceViewports(2, 0, 5, 1, f);
  assert.deepEqual(rectangle(m, 2), [2, 2, 316, 236]); assert.deepEqual(rectangle(m, 0), [322, 2, 316, 236]); assert.deepEqual(rectangle(m, 5), [2, 242, 316, 236]); assert.deepEqual(rectangle(m, 1), [322, 242, 316, 236]);
  assert.equal(m.readInt16LE(f.session + 0xa80), 236); assert.equal(m.readInt16LE(f.session + 0xa82), 316);
});
test('three-player top view is centered while repeated IDs keep later native writes', () => {
  const f = fixture(3); layoutRaceViewports(0, 1, 2, 3, f); assert.deepEqual(rectangle(f.memory, 0), [162, 2, 316, 236]);
  layoutRaceViewports(0, 0, 0, 0, f); assert.deepEqual(rectangle(f.memory, 0), [322, 242, 316, 236]);
});
test('unsupported mode retains negative extents and clears only the low WORD', () => {
  const f = fixture(255, 0, 0), m = f.memory; m.writeUInt32LE(0x12345678, 0x6f9bfc); layoutRaceViewports(0, 1, 2, 3, f);
  assert.deepEqual(rectangle(m, 0), [2, 2, -4, -4]); assert.equal(m.readUInt32LE(0x6f9bfc), 0x12340000);
});
test('auxiliary view colors double modulo256 independently in both rows', () => {
  const f = fixture(), m = f.memory; [128, 255, 63].forEach((v, i) => {m[f.auxiliary + 0x30 + i] = v;}); layoutRaceViewports(0, 1, 2, 3, f);
  assert.deepEqual([...m.subarray(0x91d5b9, 0x91d5bc)], [0, 254, 126]); assert.deepEqual(m.subarray(0x91d5b9, 0x91d5bc), m.subarray(0x91de29, 0x91de2c));
});
