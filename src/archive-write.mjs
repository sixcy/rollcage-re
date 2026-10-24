import {parseIndex} from './archive-index.mjs';

// Parts retain the original IMG verbatim and append uncompressed resources.
// No host I/O: consumers assemble source ranges and byte chunks as files/Blobs.
export function buildEditedArchive(indexBytes, imageSize, replacements) {
  if (!Number.isSafeInteger(imageSize) || imageSize < 0 || imageSize >= 0x80000000) throw new RangeError('Invalid native archive image size.');
  const entries = parseIndex(indexBytes, imageSize);
  if (!(replacements instanceof Map)) throw new TypeError('Archive replacements must be a Map.');
  const index = Buffer.from(indexBytes), parts = [{offset: 0, length: imageSize}], changes = [];
  let imageBytes = imageSize;
  for (const [resourceIndex, data] of [...replacements].sort((a, b) => a[0] - b[0])) {
    if (!Number.isInteger(resourceIndex) || resourceIndex < 0 || resourceIndex >= entries.length) throw new RangeError('Invalid replacement resource index.');
    if (!(data instanceof Uint8Array) || !data.length) throw new Error('Replacement resource must contain bytes.');
    const old = entries[resourceIndex];
    if (old.nextIndex || entries.some(row => row.nextIndex === resourceIndex && row.nextIndex !== 0)) throw new Error('Cannot replace a linked archive entry.');
    const offset = Math.ceil(imageBytes / 4) * 4;
    if (offset + data.length >= 0x80000000) throw new RangeError('Edited archive exceeds native signed offset range.');
    if (offset > imageBytes) parts.push(new Uint8Array(offset - imageBytes));
    parts.push(Buffer.from(data));
    index.writeUInt32LE(offset, resourceIndex * 16);
    index.writeUInt32LE(data.length, resourceIndex * 16 + 4);
    index.writeUInt32LE(data.length, resourceIndex * 16 + 8);
    imageBytes = offset + data.length;
    changes.push({resourceIndex, oldOffset: old.offset, oldStoredBytes: old.storedBytes, oldDecodedBytes: old.decodedBytes, offset, storedBytes: data.length, decodedBytes: data.length});
  }
  return {index, parts, imageBytes, changes};
}
