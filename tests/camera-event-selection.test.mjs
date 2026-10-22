import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCameraEvent} from '../src/camera-event-selection.mjs';

function fixture(index = 0) {
  const memory = Buffer.alloc(0xa00000), camera = 0x91ff80 + index * 0x184;
  const put = (p, value) => memory.writeInt32LE(value | 0, p);
  put(0x5ecb1c, 0x50000); put(0x90a548, 600); memory.writeInt16LE(60, camera + 0x32); put(camera + 0x20, 123);
  for (const [table, count, first] of [[0x9034a0, 24, 0], [0x903480, 6, 24], [0x80b5e0, 1, 30]]) for (let i = 0; i < count; i++) put(table + i * 4, 0x60000 + (first + i) * 0x200);
  return {memory, camera, put, object: (table, index = 0) => memory.readUInt32LE(table + index * 4), run: () => selectCameraEvent(index, {memory})};
}

test('camera event selection takes first eligible primary object and clears its transition timer', () => {
  const f = fixture();
  f.put(f.object(0x9034a0, 2) + 0x188, 1); f.put(f.object(0x9034a0, 2) + 0x184, 2);
  f.put(f.object(0x9034a0, 23) + 0x188, 1); f.put(f.object(0x903480, 0) + 0x194, 1); f.run();
  assert.equal(f.memory.readInt32LE(f.camera), 11); assert.equal(f.memory.readInt32LE(f.camera + 0x3c), 3);
  assert.equal(f.memory.readInt16LE(f.camera + 0x38), 23); assert.equal(f.memory.readInt32LE(f.camera + 0x20), 0);
});

test('secondary and singleton events retain the primary-only transition timer', () => {
  for (const kind of [2, 4]) {
    const f = fixture(); f.put(f.object(kind === 2 ? 0x903480 : 0x80b5e0, kind === 2 ? 5 : 0) + (kind === 2 ? 0x194 : 0x188), 1); f.run();
    assert.equal(f.memory.readInt32LE(f.camera), kind === 2 ? 12 : 13); assert.equal(f.memory.readInt32LE(f.camera + 0x3c), kind);
    assert.equal(f.memory.readInt32LE(f.camera + 0x20), 123);
  }
});

test('expired live event is cleared before a replacement is selected', () => {
  const f = fixture(); f.put(f.camera + 0x3c, 1); f.put(f.object(0x80b5e0) + 0x188, 1); f.run();
  assert.equal(f.memory.readInt32LE(f.camera + 0x3c), 4);
});

test('split views use a minimum timestamp initially capped at3000 and suppress concurrent events', () => {
  const f = fixture(1); f.memory[0x50552] = 4;
  for (let i = 0; i < 4; i++) f.put(0x920098 + i * 0x184, 10000);
  f.put(0x90a548, 3600); f.put(f.object(0x80b5e0) + 0x188, 1); f.run();
  assert.equal(f.memory.readInt32LE(f.camera + 0x3c), 4);
  f.put(f.camera + 0x3c, 0); f.put(f.camera, 0); f.put(0x91ffbc, 1); f.run();
  assert.equal(f.memory.readInt32LE(f.camera), 0);
});

test('clock threshold wraps unsigned and view15/16 and positive signed cooldown suppress switching', () => {
  const f = fixture(); f.put(f.object(0x80b5e0) + 0x188, 1); f.put(f.camera + 0x118, -600); f.put(0x90a548, 0); f.run();
  assert.equal(f.memory.readInt32LE(f.camera), 13);
  for (const view of [15, 16]) {f.put(f.camera, view); f.put(f.camera + 0x3c, 0); f.run(); assert.equal(f.memory.readInt32LE(f.camera), view);}
  f.put(f.camera, 0); f.memory.writeInt16LE(1, f.camera + 0x3a); f.run(); assert.equal(f.memory.readInt32LE(f.camera), 0);
});
