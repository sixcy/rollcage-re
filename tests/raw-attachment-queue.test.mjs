import test from 'node:test';
import assert from 'node:assert/strict';
import {createRawAttachmentQueue} from '../src/raw-attachment-queue.mjs';
import {advanceKinematicBody} from '../src/body-advancement.mjs';

test('attachment producer appends shared body identity at the live native count and preserves retained slots', () => {
  const memory = Buffer.alloc(0xa00000), body = {address: 0x100000, bytes: memory.subarray(0x100000, 0x100180), position: [0, 0, 0], linearVelocity: [1, 2, 3], frameTimeQ16: 0, attachmentHandles: [0x2000]};
  const queue = createRawAttachmentQueue({memory, bodyAt: pointer => pointer === body.address ? body : null});
  memory.writeUInt32LE(body.address, 0x902040); queue.count = 1;
  advanceKinematicBody(body, 65536, {attachmentQueue: queue});
  assert.equal(queue.count, 2); assert.equal(memory.readUInt32LE(0x902044), body.address); assert.equal(queue.entries[1], body);
  memory.writeUInt32LE(0, 0x6e6ba0); assert.equal(queue.count, 0); assert.equal(queue.entries[1], body);
});

test('native queue rejects detached pointers and non-integer counts without allocating copied state', () => {
  const memory = Buffer.alloc(0xa00000), queue = createRawAttachmentQueue({memory, bodyAt: () => null});
  assert.ok(Array.isArray(queue.entries));
  assert.throws(() => {queue.entries[0] = {address: 0x100000, bytes: Buffer.alloc(0x180)};}, /coherent/);
  assert.throws(() => {queue.count = -1;}, /uint32/);
});
