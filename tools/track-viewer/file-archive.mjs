import { ByteBuffer } from './byte-buffer.mjs';
import { parseIndex } from '../../src/archive-index.mjs';
import { decodeGT20 } from '../../src/gt20.mjs';

export class FileArchive {
  static async open(image, index) {
    if (!image || !index) throw new Error('Select both Rollcage.img and Rollcage.idx.');
    if (!image.size) throw new Error('The selected image is empty.');
    if (!index.size || index.size > 1024 * 1024) throw new Error('Invalid archive index size.');
    return new FileArchive(image, parseIndex(ByteBuffer.from(await index.arrayBuffer()), image.size));
  }
  constructor(image, entries) { this.image = image; this.entries = entries; this.position = 0; }
  async readResource(index) {
    if (!Number.isInteger(index) || !this.entries[index]) throw new RangeError('Invalid resource index.');
    let selected = this.entries[index];
    const visited = new Set();
    for (let current = index;;) {
      if (visited.has(current)) throw new Error('Cycle in archive entry links.');
      visited.add(current);
      const candidate = this.entries[current];
      if (Math.abs(candidate.offset - this.position) < Math.abs(selected.offset - this.position)) selected = candidate;
      current = candidate.nextIndex;
      if (current === 0) break;
    }
    if (selected.storedBytes > 128 * 1024 * 1024 || selected.decodedBytes > 128 * 1024 * 1024) throw new Error('Resource exceeds the configured size limit.');
    const stored = ByteBuffer.from(await this.image.slice(selected.offset, selected.offset + selected.storedBytes).arrayBuffer());
    if (stored.length !== selected.storedBytes) throw new Error('Short resource read.');
    this.position = selected.offset + selected.storedBytes;
    const decoded = selected.storedBytes === selected.decodedBytes
      ? { data: stored, consumedBytes: stored.length, trailingBytes: 0 } : decodeGT20(stored);
    if (decoded.data.length !== selected.decodedBytes) throw new Error('Decoded length differs from index.');
    return { ...decoded, entry: selected };
  }
}
