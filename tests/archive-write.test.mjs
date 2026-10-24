import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEditedArchive} from '../src/archive-write.mjs';
import {parseIndex} from '../src/archive-index.mjs';
import {ByteBuffer} from '../tools/track-viewer/byte-buffer.mjs';

function fixture() {
  const index = Buffer.alloc(48), image = Buffer.from(Array.from({length: 53}, (_, i) => i));
  [[0, 10, 10, 7], [10, 20, 40, 2], [30, 23, 23, 0]].forEach((row, i) => {
    row.slice(0, 3).forEach((n, j) => index.writeUInt32LE(n, i * 16 + j * 4)); index.writeInt16LE(row[3], i * 16 + 12);
  });
  return {index, image};
}
function assemble(plan, image) { return Buffer.concat(plan.parts.map(part => part instanceof Uint8Array ? Buffer.from(part) : image.subarray(part.offset, part.offset + part.length))); }

test('no replacements preserves index and entire original IMG byte for byte', () => {
  const {index, image} = fixture(), plan = buildEditedArchive(index, image.length, new Map());
  assert.deepEqual(plan.index, index); assert.deepEqual(assemble(plan, image), image); assert.equal(plan.imageBytes, 53); assert.deepEqual(plan.changes, []);
});

test('replacement preserves prefix/unrelated IDX metadata and emits aligned uncompressed payloads', () => {
  const {index, image} = fixture(), replacement = Buffer.from([9, 8, 7]), plan = buildEditedArchive(index, image.length, new Map([[2, Buffer.from([6])], [1, replacement]]));
  replacement[0] = 0;
  const output = assemble(plan, image), entries = parseIndex(plan.index, output.length);
  assert.deepEqual(output.subarray(0, image.length), image); assert.deepEqual(plan.index.subarray(0, 16), index.subarray(0, 16));
  assert.equal(entries[1].offset, 56); assert.equal(entries[1].storedBytes, 3); assert.equal(entries[1].decodedBytes, 3); assert.equal(entries[1].allocationExtra, 2);
  assert.equal(entries[2].offset, 60); assert.equal(output.length, 61); assert.deepEqual(output.subarray(56, 59), Buffer.from([9, 8, 7]));
  assert.deepEqual(index, fixture().index); assert.deepEqual(plan.changes.map(row => row.resourceIndex), [1, 2]);
});

test('rejects linked replacements, invalid resources, malformed IDX and signed-offset overflow', () => {
  const {index, image} = fixture();
  for (const key of [-1, 3, 1.5]) assert.throws(() => buildEditedArchive(index, image.length, new Map([[key, Buffer.from([1])]])), /index/);
  assert.throws(() => buildEditedArchive(index, image.length, new Map([[0, Buffer.alloc(0)]])), /bytes/);
  const linked = Buffer.from(index); linked.writeInt16LE(2, 30);
  assert.throws(() => buildEditedArchive(linked, image.length, new Map([[1, Buffer.from([1])]])), /linked/);
  assert.throws(() => buildEditedArchive(linked, image.length, new Map([[2, Buffer.from([1])]])), /linked/);
  assert.throws(() => buildEditedArchive(index, 0x7fffffff, new Map([[0, Buffer.from([1])]])), /signed/);
  assert.throws(() => buildEditedArchive(index.subarray(1), image.length, new Map()), /index/);
});

test('archive writer supports viewer ByteBuffer and chunked original-image part', () => {
  const {index, image} = fixture(), hostBuffer = globalThis.Buffer;
  try {
    globalThis.Buffer = ByteBuffer;
    const plan = buildEditedArchive(ByteBuffer.from(index), image.length, new Map([[1, ByteBuffer.from([1, 2, 3])]]));
    assert(plan.index instanceof ByteBuffer); assert.deepEqual(plan.parts[0], {offset: 0, length: 53}); assert.equal(plan.index.readUInt32LE(20), 3);
  } finally {globalThis.Buffer = hostBuffer;}
});
