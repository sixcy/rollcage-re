import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseBodyAttachments} from '../src/body-attachment-release.mjs';

function fixture(handles) {
  const memory = Buffer.alloc(0xa00000), body = 0x60000;
  handles.forEach((handle, index) => memory.writeUInt16LE(handle, body + 0x16a + index * 2));
  return {memory, body};
}

test('attachment release stops at a type-zero handle even when its ID is nonzero', () => {
  const runtime = fixture([0x3001, 0x000f, 0x5000]);
  releaseBodyAttachments(runtime.body, runtime);
  assert.deepEqual([0, 2, 4].map(offset => runtime.memory.readUInt16LE(runtime.body + 0x16a + offset)), [0, 15, 0x5000]);
});

test('attachment release clears unknown types and visits at most five handles', () => {
  const runtime = fixture([0x3001, 0x4001, 0x6001, 0x7001, 0xf001, 0x3002]);
  releaseBodyAttachments(runtime.body, runtime);
  assert.deepEqual(Array.from({length: 6}, (_, index) => runtime.memory.readUInt16LE(runtime.body + 0x16a + index * 2)), [0, 0, 0, 0, 0, 0x3002]);
});

test('light high-water count is captured before a script aliases the global', () => {
  const runtime = fixture([0x5000, 0x1001]);
  runtime.memory.writeInt32LE(3, 0x80f20c);
  runtime.memory.writeUInt32LE(0x80f20c, 0x9092b4);
  runtime.memory.writeUInt16LE(7, 0x80f544 + 128);
  releaseBodyAttachments(runtime.body, runtime);
  assert.equal(runtime.memory.readInt32LE(0x80f20c), 2);
  assert.equal(runtime.memory.readUInt16LE(0x80f544 + 128), 0);
});

test('particle attachments unlink spatial membership without freeing active pool storage', () => {
  const runtime = fixture([0x2000]), particle = 0x70000, bucket = 0x50000;
  runtime.memory.writeUInt32LE(particle, 0x80e660);
  runtime.memory.writeUInt32LE(particle, 0x902eec);
  runtime.memory.writeUInt32LE(bucket | 1, particle + 12);
  runtime.memory.writeUInt16LE(1, bucket + 10);
  runtime.memory[particle + 0x94] = 1;
  runtime.memory.writeInt32LE(12345, particle + 0xb0);
  releaseBodyAttachments(runtime.body, runtime);
  assert.equal(runtime.memory.readUInt16LE(bucket + 10), 0);
  assert.equal(runtime.memory.readUInt32LE(particle + 4), 0);
  assert.equal(runtime.memory[particle + 0x94], 1);
  assert.equal(runtime.memory.readInt32LE(particle + 0xb0), 12345);
});

test('script writes can change the ID of the next attachment before it is read', () => {
  const runtime = fixture([0x5000, 0x1000]);
  runtime.memory.writeUInt32LE(runtime.body + 0x16c, 0x9092b4);
  runtime.memory.writeUInt16LE(9, 0x80f544 + 64);
  runtime.memory.writeUInt16LE(9, 0x80f544 + 192);
  releaseBodyAttachments(runtime.body, runtime);
  assert.equal(runtime.memory.readUInt16LE(0x80f544 + 64), 9);
  assert.equal(runtime.memory.readUInt16LE(0x80f544 + 192), 0);
});
