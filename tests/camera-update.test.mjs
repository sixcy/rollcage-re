import test from 'node:test';
import assert from 'node:assert/strict';
import {updateCamera} from '../src/camera-update.mjs';

function fixture(mode = 0) {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p), log = [];
  put(0x5ecb1c, 0x50000); put(0x909300, 0x10000); put(0x909318, 0x60000); put(0x60000, 0x20000); put(0x91ff80, mode);
  word(0x91ffb2, 12); word(0x91ffb4, 100); memory.writeFloatLE(200, 0x91ceb0);
  const runtime = {memory, scratchBase: 0x9000, handlers: {formatCameraName(output, format, index) {log.push([output, format, index]); memory.write(`${index} Player\0`, output);}}};
  return {memory, put, word, log, runtime};
}

test('direct camera modes copy the controller body pose and preserve the tracked body', () => {
  for (const mode of [0, 9]) {
    const f = fixture(mode); for (let i = 0; i < 54; i++) {f.put(0x20034 + i * 4, i * 17 - 123); f.put(0x10034 + i * 4, 999);}
    updateCamera(0, f.runtime);
    assert.deepEqual(f.memory.subarray(0x91ffc0, 0x91ffc0 + 216), f.memory.subarray(0x20034, 0x20034 + 216));
    assert.equal(f.memory.readInt32LE(0x10034), 999); assert.equal(f.memory.readUInt16LE(0x91ffb2), 13); assert.equal(f.memory.readInt32LE(0x91ffa4), 104);
    assert.deepEqual(f.log, [[0x9000 - 204 + 0xa4, 0x5d043c, 0]]);
  }
});

test('camera expiry compares the previous signed age while the stored age wraps16bits', () => {
  const f = fixture(9); f.word(0x91ffb2, 32767); f.word(0x91ffb4, 32767); updateCamera(0, f.runtime);
  assert.equal(f.memory.readInt16LE(0x91ffb2), -32768); assert.equal(f.memory.readInt32LE(0x91ff80), 9);
});

test('out-of-table camera mode still clears transient state and decrements only positive signed cooldown', () => {
  for (const cooldown of [-1, 0, 2, 32767]) {
    const f = fixture(-1); f.word(0x91ffba, cooldown); f.put(0x91ff9c, 7); f.word(0x91ffb0, 123); f.put(0x9200fc, 1);
    updateCamera(0, f.runtime);
    assert.equal(f.memory.readInt32LE(0x91ff9c), 0); assert.equal(f.memory.readUInt16LE(0x91ffb0), 0); assert.equal(f.memory.readInt32LE(0x9200fc), 0);
    assert.equal(f.memory.readInt16LE(0x91ffba), cooldown > 0 ? cooldown - 1 : cooldown);
  }
});

test('missing formatter retains initial camera frame writes and fails before transient clears', () => {
  const f = fixture(); delete f.runtime.handlers.formatCameraName; f.put(0x91ff9c, 7);
  assert.throws(() => updateCamera(0, f.runtime), /CRT player-name formatting/);
  assert.equal(f.memory.readInt32LE(0x91ff9c), 7); assert.equal(f.memory.readInt32LE(0x9000 - 204 + 0x50), 200);
});
