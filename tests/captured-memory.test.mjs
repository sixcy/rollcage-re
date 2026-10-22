import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';

test('preferred-base identity aliases preserve contiguous real spans and still require target coverage', () => {
  const {memory} = createCapturedMemory([{address: 100, bytes: Buffer.alloc(32, 7)}], {aliases: [{address: 108, targetAddress: 108, length: 8}]});
  assert.equal(memory.subarray(100, 132).length, 32);
  assert.equal(memory.readUInt32LE(106), 0x07070707);
  assert.throws(() => createCapturedMemory([{address: 100, bytes: Buffer.alloc(4)}], {aliases: [{address: 108, targetAddress: 108, length: 8}]}), /not completely captured/);
});

test('captured native regions keep high pointers and explicit module aliases coherent', () => {
  const source = Buffer.from([1,2,3,4,5,6,7,8]);
  const {memory, span, mappedBytes} = createCapturedMemory([{address: 0x135b1700, bytes: source}], {aliases: [{address: 0x91d448, targetAddress: 0x135b1700, length: 8}]});
  assert.ok(Buffer.isBuffer(memory)); assert.equal(mappedBytes, 8);
  assert.equal(memory.readUInt32LE(0x91d448), 0x04030201);
  memory.writeInt32LE(-2147483648, 0x91d448);
  assert.equal(memory.readUInt32LE(0x135b1700), 0x80000000);
  memory[0x135b1704] = 255;
  assert.equal(memory[0x91d44c], 255);
  const live = memory.subarray(0x91d448, 0x91d450); live.writeUInt16LE(0xbeef, 6);
  assert.equal(memory.readUInt16LE(0x135b1706), 0xbeef);
  assert.deepEqual(span(0x135b1700, 8), live);
  assert.deepEqual(source, Buffer.from([1,2,3,4,5,6,7,8]), 'Captured evidence remains immutable.');
  assert.throws(() => memory.readUInt32LE(0x135b16ff), /Uncaptured/);
  assert.throws(() => memory.readUInt32LE(0x91d44e), /alias boundary/);
  assert.throws(() => memory.buffer, /Unsupported/);
});

test('only equal overlapping snapshots merge; gaps, ambiguous aliases and byte overruns fail', () => {
  const {memory, mappedBytes} = createCapturedMemory([{address: 100, bytes: Buffer.from([1,2,3])}, {address: 102, bytes: Buffer.from([3,4])}, {address: 104, bytes: Buffer.from([5])}]);
  assert.equal(mappedBytes, 5); assert.equal(memory.readUIntLE(100, 5), 0x0504030201);
  assert.throws(() => createCapturedMemory([{address: 100, bytes: Buffer.from([1,2])}, {address: 101, bytes: Buffer.from([3])}]), /disagree/);
  assert.throws(() => createCapturedMemory([{address: 100, bytes: Buffer.alloc(8)}], {maxMappedBytes: 7}), /byte bound/);
  assert.throws(() => createCapturedMemory([{address: 100, bytes: Buffer.alloc(8)}], {aliases: [{address: 104, targetAddress: 100, length: 4}]}), /shadows/);
  assert.throws(() => createCapturedMemory([{address: 100, bytes: Buffer.alloc(8)}], {aliases: [{address: 200, targetAddress: 104, length: 8}]}), /not completely/);
  assert.throws(() => createCapturedMemory([{address: 0xffffffff, bytes: Buffer.alloc(2)}]), /Invalid/);
  assert.throws(() => memory.readUIntLE(100, 7), /width/);
});
