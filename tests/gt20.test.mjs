import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeGT20 } from '../src/gt20.mjs';
import { parseIndex } from '../src/archive.mjs';

function control(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value); return buffer; }
function stream(length, ...parts) {
  const header = Buffer.alloc(16);
  header.write('GT20'); header.writeUInt32LE(length, 4);
  return Buffer.concat([header, ...parts.map(part => Buffer.isBuffer(part) ? part : Buffer.from(part))]);
}
const end = [0, 0, 1];

test('overlapping short back-reference reproduces bytes as they are written', () => {
  const decoded = decodeGT20(stream(6, control(0x7a), [65, 255], end));
  assert.equal(decoded.data.toString(), 'AAAAAA');
  assert.equal(decoded.trailingBytes, 0);
});
test('long reference and explicit 16-bit length', () => {
  assert.equal(decodeGT20(stream(4, control(0x1e), [65, 0xf9, 0xff], end)).data.toString(), 'AAAA');
  assert.equal(decodeGT20(stream(10, control(0x1e), [65, 0xf8, 0xff, 0, 9, 0], end)).data.toString(), 'AAAAAAAAAA');
});
test('control word refill occurs after 32 literal bytes', () => {
  const literals = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 32));
  assert.deepEqual(decodeGT20(stream(32, control(0), literals, control(3), end)).data, literals);
});
test('short-match offset precedes refill when its second bit ends a control word', () => {
  const input = stream(34, control(0x40000000), Buffer.alloc(30, 65), [255], control(13), end);
  assert.deepEqual(decodeGT20(input).data, Buffer.alloc(34, 65));
});
test('truncated, invalid reference, wrong output size and allocation-limit inputs fail', () => {
  assert.throws(() => decodeGT20(stream(1, control(0))), /Truncated/);
  assert.throws(() => decodeGT20(stream(3, control(3), [0xf9, 0xff])), /back-reference/);
  assert.throws(() => decodeGT20(stream(1, control(3), end)), /ended at/);
  assert.throws(() => decodeGT20(stream(1024), { maxDecodedBytes: 100 }), /limit/);
});
test('index decodes signed 16-bit metadata and rejects invalid file ranges', () => {
  const index = Buffer.alloc(16);
  index.writeUInt32LE(10, 0); index.writeUInt32LE(20, 4); index.writeUInt32LE(100, 8); index.writeInt16LE(3, 12);
  assert.deepEqual(parseIndex(index, 30), [{ index: 0, offset: 10, storedBytes: 20, decodedBytes: 100, allocationExtra: 3, nextIndex: 0 }]);
  assert.throws(() => parseIndex(index, 29), /bounds/);
  assert.throws(() => parseIndex(index.subarray(0, 15), 30), /size/);
});
