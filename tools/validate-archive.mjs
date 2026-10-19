// Validate the reconstructed decoder against every entry; no extracted payloads
// are written unless a separate extraction workflow explicitly requests them.
import { open, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGT20 } from '../src/gt20.mjs';

const game = process.argv[2] ?? 'C:\\Program Files (x86)\\Psygnosis\\Rollcage';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idx = await readFile(path.join(game, 'IDXData', 'Rollcage.idx'));
if (idx.length % 16) throw new Error('Partial index record.');
const img = await open(path.join(game, 'IDXData', 'Rollcage.img'));
const entries = [];
let decodedTotal = 0;
let expectedOffset = 0;
let verifiedBitmaps = 0;
try {
  const imageBytes = (await img.stat()).size;
  for (let p = 0; p < idx.length; p += 16) {
    const offset = idx.readUInt32LE(p);
    const storedBytes = idx.readUInt32LE(p + 4);
    const decodedBytes = idx.readUInt32LE(p + 8);
    if (offset !== expectedOffset || offset + storedBytes > imageBytes) throw new Error(`Invalid range at entry ${p / 16}.`);
    const stored = Buffer.alloc(storedBytes);
    if ((await img.read(stored, 0, stored.length, offset)).bytesRead !== stored.length) throw new Error('Short archive read.');
    let data, trailingBytes = 0;
    try {
      if (storedBytes === decodedBytes) data = stored;
      else ({ data, trailingBytes } = decodeGT20(stored));
      if (data.length !== decodedBytes) throw new Error('Decoded size differs from index.');
    } catch (error) { throw new Error(`Entry ${p / 16}: ${error.message}`, { cause: error }); }
    // BMP structural checks are independent of the GT20 control logic.
    if (data.toString('ascii', 0, 2) === 'BM') {
      if (data.length < 54 || data.readUInt32LE(2) !== data.length) throw new Error(`Entry ${p / 16}: invalid BMP file size.`);
      const pixels = data.readUInt32LE(10);
      const dibBytes = data.readUInt32LE(14);
      const width = data.readInt32LE(18), height = data.readInt32LE(22);
      const bitsPerPixel = data.readUInt16LE(28);
      const compression = data.readUInt32LE(30);
      if (dibBytes < 40 || pixels < 14 + dibBytes || pixels > data.length || width <= 0 || height === 0 || data.readUInt16LE(26) !== 1) throw new Error(`Entry ${p / 16}: invalid BMP header.`);
      if (compression !== 0 || ![1, 4, 8, 16, 24, 32].includes(bitsPerPixel)) throw new Error(`Entry ${p / 16}: BMP encoding needs separate validation.`);
      const pixelBytes = Math.ceil(width * bitsPerPixel / 32) * 4 * Math.abs(height);
      if (pixels + pixelBytes > data.length) throw new Error(`Entry ${p / 16}: truncated BMP pixels.`);
      verifiedBitmaps++;
    }
    decodedTotal += data.length;
    expectedOffset = offset + storedBytes;
    entries.push({ index: p / 16, offset, storedBytes, decodedBytes,
      compressed: storedBytes !== decodedBytes, allocationExtra: idx.readUInt16LE(p + 12),
      nextIndex: idx.readUInt16LE(p + 14), trailingBytes,
      sha256: createHash('sha256').update(data).digest('hex'),
      headerHex: data.subarray(0, 32).toString('hex'),
      headerText: data.subarray(0, 64).toString('latin1').replace(/[^\x20-\x7e]/g, '.') });
  }
  if (expectedOffset !== imageBytes) throw new Error('Archive has unindexed bytes.');
} finally { await img.close(); }
const report = { method: 'Reconstructed JavaScript decoder; static validation, not original runtime equivalence.',
  entries: entries.length, compressed: entries.filter(e => e.compressed).length,
  decodedBytes: decodedTotal, verifiedBitmaps, trailingByteCounts: [...new Set(entries.map(e => e.trailingBytes))],
  resources: entries };
await writeFile(path.join(root, 'analysis', 'decoded-archive.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ entries: report.entries, compressed: report.compressed,
  decodedBytes: report.decodedBytes, verifiedBitmaps, trailingByteCounts: report.trailingByteCounts }));
