import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';

// Independent reader for the stored ZIP downloads, using Node's CRC routine.
export function readTrackZIP(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16);
  assert.equal(start + bytes.readUInt32LE(end + 12), end);
  const files = new Map();
  let position = start;
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(position), 0x02014b50);
    assert.equal(bytes.readUInt16LE(position + 10), 0);
    const size = bytes.readUInt32LE(position + 24), nameBytes = bytes.readUInt16LE(position + 28);
    const name = bytes.toString('utf8', position + 46, position + 46 + nameBytes);
    const local = bytes.readUInt32LE(position + 42);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 8), 0);
    assert.equal(bytes.readUInt32LE(local + 22), size);
    const localNameBytes = bytes.readUInt16LE(local + 26);
    assert.equal(bytes.toString('utf8', local + 30, local + 30 + localNameBytes), name);
    const dataStart = local + 30 + localNameBytes + bytes.readUInt16LE(local + 28);
    assert.ok(dataStart + size <= start);
    const data = bytes.subarray(dataStart, dataStart + size);
    assert.equal(crc32(data), bytes.readUInt32LE(position + 16), name);
    assert.equal(crc32(data), bytes.readUInt32LE(local + 14), name);
    assert.equal(files.has(name), false);
    files.set(name, data);
    position += 46 + nameBytes + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
  }
  assert.equal(position, end);
  return files;
}
