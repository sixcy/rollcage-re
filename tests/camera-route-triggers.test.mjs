import test from 'node:test';
import assert from 'node:assert/strict';
import {measureCameraLineDistance, selectCameraTrigger} from '../src/camera-route-triggers.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), runtime = {memory, scratchBase: 0x9000};
  const put = (p, v) => memory.writeInt32LE(v | 0, p);
  put(0x5ecb1c, 0x50000); memory[0x5054d] = 1; memory.writeInt16LE(60, 0x91ffb2); put(0x90a548, 540); put(0x91ff80 + 0x178, -1);
  put(0x909300, 0x60000); put(0x60034, 100 * 65536); put(0x60068, 8 * 65536); memory[0x60718] = 10;
  put(0x6e6550, 1); put(0x91f6c0, 1); put(0x91f6d0, 1024 * 65536);
  return {memory, runtime, put, trigger: () => selectCameraTrigger(0, 0x59000, 0x59004, runtime)};
}

test('camera line projection returns perpendicular distance and publishes its Q16 fraction', () => {
  const f = fixture(); f.put(0x58000, 128 * 65536); f.put(0x58004, 10 * 65536); f.put(0x58200, 1024 * 65536);
  assert.equal(measureCameraLineDistance(0x58000, 0x58100, 0x58200, 0x59000, f.runtime), 10 * 65536);
  assert.equal(f.memory.readInt32LE(0x59000), 0x2000);
});

test('short directions and fractions at0 or2 reject without publishing a fraction', () => {
  for (const [point, direction] of [[100, 511], [0, 1024], [2048, 1024]]) {
    const f = fixture(); f.put(0x58000, point * 65536); f.put(0x58200, direction * 65536); f.put(0x59000, 123);
    assert.equal(measureCameraLineDistance(0x58000, 0x58100, 0x58200, 0x59000, f.runtime), -1); assert.equal(f.memory.readInt32LE(0x59000), 123);
  }
});

test('camera trigger commits participant and row at inclusive age/time/velocity boundaries', () => {
  const f = fixture(); assert.equal(f.trigger(), 1); assert.equal(f.memory.readUInt16LE(0x59000), 0); assert.equal(f.memory.readUInt32LE(0x59004), 0x91f6c0);
  f.put(0x90a548, 539); assert.equal(f.trigger(), 0); f.put(0x90a548, 540); f.put(0x60068, 7 * 65536); assert.equal(f.trigger(), 0);
});

test('camera trigger accepts quarter-line fraction and rejects the next position', () => {
  const f = fixture(); f.put(0x60034, 256 * 65536); assert.equal(f.trigger(), 1);
  f.put(0x60034, 257 * 65536); assert.equal(f.trigger(), 0);
});

test('camera triggers honor other split-view mode16 and preserve ordered output aliasing', () => {
  const f = fixture(); f.memory[0x50552] = 1; f.put(0x91ff80 + 0x184, 16); assert.equal(f.trigger(), 0);
  f.put(0x91ff80 + 0x184, 0); assert.equal(selectCameraTrigger(0, 0x59000, 0x59000, f.runtime), 1);
  assert.equal(f.memory.readUInt32LE(0x59000), 0x91f6c0);
});
