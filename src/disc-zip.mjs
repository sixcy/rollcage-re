// Host-independent, bounded ZIP reader. Audio members stay compressed.
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_DIRECTORY_BYTES = 32 * 1024 * 1024;
const MAX_MEMBER_BYTES = 1024 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

export async function readSource(source, offset, length) {
  if (!Number.isSafeInteger(source.size) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
    || offset < 0 || length < 0 || offset + length > source.size) throw new Error('Disc input read exceeds source bounds.');
  const bytes = await source.read(offset, length);
  if (!(bytes instanceof Uint8Array) || bytes.length !== length) throw new Error('Truncated disc input read.');
  return bytes;
}

export function normalizeDiscPath(name) {
  const parts = name.replace(/\\/g, '/').split('/');
  if (parts.some(part => part === '..') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error('Unsafe disc member path.');
  return parts.filter(part => part && part !== '.').join('/');
}

async function inflateInBrowser(bytes, expectedBytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser does not support ZIP deflate decompression.');
  let stream;
  try { stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
  catch { throw new Error('This browser does not support ZIP deflate-raw decompression.'); }
  const reader = stream.getReader();
  const output = new Uint8Array(expectedBytes);
  let position = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (position + value.length > expectedBytes) throw new Error('ZIP inflated size exceeds member size.');
      output.set(value, position); position += value.length;
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (position !== expectedBytes) throw new Error('ZIP inflated size differs from member size.');
  return output;
}

export async function openDiscZip(source, { inflateRaw = inflateInBrowser } = {}) {
  if (source.size < 22) throw new Error('Truncated ZIP end record.');
  const tailOffset = Math.max(0, source.size - 65557);
  const tail = await readSource(source, tailOffset, source.size - tailOffset);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.length);
  let end = -1;
  for (let p = tail.length - 22; p >= 0; p--) {
    if (tailView.getUint32(p, true) === 0x06054b50 && p + 22 + tailView.getUint16(p + 20, true) === tail.length) { end = p; break; }
  }
  if (end < 0) throw new Error('ZIP end record not found.');
  const count = tailView.getUint16(end + 10, true);
  const directoryBytes = tailView.getUint32(end + 12, true);
  const directoryOffset = tailView.getUint32(end + 16, true);
  if (tailView.getUint16(end + 4, true) || tailView.getUint16(end + 6, true)
    || tailView.getUint16(end + 8, true) !== count) throw new Error('Multipart ZIP archives are unsupported.');
  if (count === 0xffff || directoryOffset === 0xffffffff || directoryBytes === 0xffffffff) throw new Error('ZIP64 archives are unsupported.');
  if (!count || directoryBytes > MAX_DIRECTORY_BYTES || directoryOffset + directoryBytes !== tailOffset + end) throw new Error('Invalid ZIP central directory bounds.');
  const directory = await readSource(source, directoryOffset, directoryBytes);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.length);
  const entries = [];
  const names = new Set();
  let p = 0;
  for (let index = 0; index < count; index++) {
    if (p + 46 > directory.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('Invalid ZIP central directory entry.');
    const flags = view.getUint16(p + 8, true), method = view.getUint16(p + 10, true);
    const nameBytes = view.getUint16(p + 28, true), extraBytes = view.getUint16(p + 30, true), commentBytes = view.getUint16(p + 32, true);
    const next = p + 46 + nameBytes + extraBytes + commentBytes;
    if (next > directory.length || view.getUint16(p + 34, true)) throw new Error('Invalid ZIP member bounds.');
    const encodedName = directory.subarray(p + 46, p + 46 + nameBytes);
    // ASCII names are portable. Non-UTF8 legacy encodings cannot be resolved reliably.
    if (!(flags & 0x800) && encodedName.some(byte => byte > 127)) throw new Error('ZIP member names must use ASCII or UTF-8.');
    const name = normalizeDiscPath(decoder.decode(encodedName));
    if (!name || names.has(name.toLowerCase())) throw new Error('Duplicate or empty ZIP member name.');
    names.add(name.toLowerCase());
    const entry = { name, flags, method, crc32: view.getUint32(p + 16, true), compressedBytes: view.getUint32(p + 20, true), size: view.getUint32(p + 24, true), offset: view.getUint32(p + 42, true) };
    if (entry.offset === 0xffffffff || entry.compressedBytes === 0xffffffff || entry.size === 0xffffffff) throw new Error('ZIP64 members are unsupported.');
    if (entry.offset + 30 > directoryOffset || entry.compressedBytes > MAX_MEMBER_BYTES || entry.size > MAX_MEMBER_BYTES) throw new Error('ZIP member exceeds size or offset bounds.');
    if (flags & 0x41) throw new Error('Encrypted ZIP members are unsupported.');
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method ${method}.`);
    entries.push(entry); p = next;
  }
  if (p !== directory.length) throw new Error('ZIP central directory length mismatch.');
  return {
    entries,
    async readEntry(entry) {
      if (!entries.includes(entry)) throw new Error('Unknown ZIP member.');
      const header = await readSource(source, entry.offset, 30);
      const local = new DataView(header.buffer, header.byteOffset, header.length);
      if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(6, true) !== entry.flags || local.getUint16(8, true) !== entry.method) throw new Error('ZIP local header disagrees with central directory.');
      const nameBytes = local.getUint16(26, true), extraBytes = local.getUint16(28, true);
      const dataOffset = entry.offset + 30 + nameBytes + extraBytes;
      if (dataOffset + entry.compressedBytes > directoryOffset) throw new Error('ZIP member data exceeds archive bounds.');
      const localName = await readSource(source, entry.offset + 30, nameBytes);
      if (normalizeDiscPath(decoder.decode(localName)) !== entry.name) throw new Error('ZIP local member name mismatch.');
      if (!(entry.flags & 8) && (local.getUint32(14, true) !== entry.crc32 || local.getUint32(18, true) !== entry.compressedBytes || local.getUint32(22, true) !== entry.size)) throw new Error('ZIP local member sizes or CRC disagree.');
      const stored = await readSource(source, dataOffset, entry.compressedBytes);
      const output = entry.method === 0 ? stored : await inflateRaw(stored, entry.size);
      if (!(output instanceof Uint8Array) || output.length !== entry.size) throw new Error('ZIP decoded member length mismatch.');
      if (crc32(output) !== entry.crc32) throw new Error(`ZIP CRC mismatch for ${entry.name}.`);
      return output;
    },
  };
}
