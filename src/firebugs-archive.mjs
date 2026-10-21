import { parseIndex } from './archive-index.mjs';
import { decodeGT20 } from './gt20.mjs';

// Disc transport supplies logical ISO file bytes, not raw CD sectors.
export class FirebugsArchive {
  static async open(disc) {
    const indexData = Buffer.from(disc.indexData), imageData = Buffer.from(disc.imageData);
    return new FirebugsArchive(indexData, imageData, disc.identity);
  }
  constructor(indexData, imageData, identity) {
    this.game = 'firebugs';
    this.indexData = indexData;
    this.imageData = imageData;
    this.identity = identity;
    this.entries = parseIndex(indexData, imageData.length);
  }
  async readResource(index) {
    const entry = this.entries[index];
    if (!Number.isInteger(index) || !entry) throw new RangeError('Invalid Firebugs resource index.');
    if (entry.storedBytes > 128 * 1024 * 1024 || entry.decodedBytes > 128 * 1024 * 1024) throw new Error('Firebugs resource exceeds the size limit.');
    const raw = this.imageData.subarray(entry.offset, entry.offset + entry.storedBytes);
    const result = entry.storedBytes === entry.decodedBytes
      ? { data: raw, consumedBytes: raw.length, trailingBytes: 0 } : decodeGT20(raw);
    if (result.data.length !== entry.decodedBytes) throw new Error('Firebugs decoded length differs from index.');
    return { ...result, entry };
  }
  async close() { this.imageData = null; }
}
