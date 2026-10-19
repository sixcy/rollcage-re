// Reconstructed archive semantics from Redux FUN_00401000, FUN_00401140 and
// FUN_00401160. Host I/O and bounds checks are new implementation code.
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeGT20 } from './gt20.mjs';

export function parseIndex(buffer, imageBytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length % 16 !== 0) throw new Error('Invalid index size.');
  const entries = [];
  for (let p = 0; p < buffer.length; p += 16) {
    const entry = { index: p / 16, offset: buffer.readUInt32LE(p), storedBytes: buffer.readUInt32LE(p + 4),
      decodedBytes: buffer.readUInt32LE(p + 8), allocationExtra: buffer.readInt16LE(p + 12), nextIndex: buffer.readInt16LE(p + 14) };
    if (entry.offset + entry.storedBytes > imageBytes) throw new Error(`Entry ${entry.index} exceeds image bounds.`);
    if (entry.allocationExtra < 0 || entry.nextIndex < 0 || entry.nextIndex >= buffer.length / 16) throw new Error(`Invalid entry metadata at ${entry.index}.`);
    entries.push(entry);
  }
  return entries;
}

export class RollcageArchive {
  static async open(gameDirectory) {
    const index = await readFile(path.join(gameDirectory, 'IDXData', 'Rollcage.idx'));
    const file = await open(path.join(gameDirectory, 'IDXData', 'Rollcage.img'));
    try { return new RollcageArchive(file, parseIndex(index, (await file.stat()).size)); }
    catch (error) { await file.close(); throw error; }
  }
  constructor(file, entries) {
    this.file = file;
    this.entries = entries;
    this.position = 0;
  }
  async readResource(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.entries.length) throw new RangeError('Invalid resource index.');
    // The original follows duplicate-entry links and selects the entry nearest
    // the previous read position. All links in this installed build are zero.
    const visited = new Set();
    let selected = this.entries[index];
    for (let current = index;;) {
      if (visited.has(current)) throw new Error('Cycle in archive entry links.');
      visited.add(current);
      const candidate = this.entries[current];
      if (Math.abs(candidate.offset - this.position) < Math.abs(selected.offset - this.position)) selected = candidate;
      current = candidate.nextIndex;
      if (current === 0) break;
    }
    if (selected.storedBytes > 128 * 1024 * 1024 || selected.decodedBytes > 128 * 1024 * 1024) throw new Error('Resource exceeds the configured size limit.');
    const stored = Buffer.alloc(selected.storedBytes);
    let read = 0;
    while (read < stored.length) {
      const { bytesRead } = await this.file.read(stored, read, stored.length - read, selected.offset + read);
      if (bytesRead === 0) throw new Error('Short resource read.');
      read += bytesRead;
    }
    this.position = selected.offset + selected.storedBytes;
    const decoded = selected.storedBytes === selected.decodedBytes
      ? { data: stored, consumedBytes: stored.length, trailingBytes: 0 }
      : decodeGT20(stored);
    if (decoded.data.length !== selected.decodedBytes) throw new Error('Decoded length differs from index.');
    return { ...decoded, entry: selected };
  }
  async close() { await this.file.close(); }
}
