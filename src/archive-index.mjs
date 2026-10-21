// Archive index layout recovered from FUN_00401000. Shared by host readers.
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
