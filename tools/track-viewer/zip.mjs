// ZIP's stored method keeps the standalone viewer dependency-free. PNG files
// are already compressed; all sizes/offsets below use the classic ZIP layout.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZIP(files) {
  if (files.length > 65535) throw new Error('Too many files for a ZIP download.');
  const encoder = new TextEncoder(), local = [], directory = [], names = new Set();
  let offset = 0, directoryBytes = 0;
  for (const file of files) {
    if (!file.name || /[/\\\0]/.test(file.name) || file.name === '.' || file.name === '..' || names.has(file.name)) throw new Error('Invalid or duplicate ZIP filename.');
    names.add(file.name);
    const name = encoder.encode(file.name), bytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    if (!(bytes instanceof Uint8Array)) throw new Error('ZIP file data must be text or bytes.');
    if (name.length > 65535 || bytes.length >= 0xffffffff || offset + 30 + name.length + bytes.length >= 0xffffffff) throw new Error('Track exceeds the ZIP size limit.');
    const crc = crc32(bytes), header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 0x21, true); // January 1, 1980; deterministic DOS date.
    view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true); header.set(name, 30);
    const central = new Uint8Array(46 + name.length), entry = new DataView(central.buffer);
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x800, true);
    entry.setUint16(14, 0x21, true); entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true); entry.setUint32(24, bytes.length, true); entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true); central.set(name, 46);
    local.push(header, bytes); directory.push(central);
    offset += header.length + bytes.length; directoryBytes += central.length;
  }
  if (offset + directoryBytes + 22 >= 0xffffffff) throw new Error('Track exceeds the ZIP size limit.');
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
  view.setUint32(12, directoryBytes, true); view.setUint32(16, offset, true);
  return new Blob([...local, ...directory, end], { type: 'application/zip' });
}

//Large archive downloads retain Blob slices; only one checksum chunk is read
//at a time. The existing small-file export API remains synchronous.
export async function createBlobZIP(files, {signal, onProgress} = {}) {
  if (files.length > 65535) throw Error('Too many ZIP entries.');
  const encoder = new TextEncoder(), local = [], directory = [], names = new Set();
  let offset = 0, directoryBytes = 0, completed = 0;
  const blobs = files.map(file => {
    if (!(file.data instanceof Blob) && !(file.data instanceof Uint8Array) && typeof file.data !== 'string') throw Error('ZIP file data must be a Blob, text or bytes.');
    return {name: file.name, blob: file.data instanceof Blob ? file.data : new Blob([file.data])};
  });
  const total = blobs.reduce((sum, file) => sum + file.blob.size, 0);
  for (const {name: filename, blob} of blobs) {
    signal?.throwIfAborted();
    if (!filename || /[/\\\0]/.test(filename) || filename === '.' || filename === '..' || names.has(filename)) throw Error('Invalid or duplicate ZIP filename.');
    names.add(filename);
    const name = encoder.encode(filename), size = blob.size;
    if (name.length > 65535 || size >= 0xffffffff || offset + 30 + name.length + size >= 0xffffffff) throw Error('Archive exceeds the ZIP size limit.');
    let crc = 0xffffffff;
    for (let start = 0; start < size; start += 1048576) {
      signal?.throwIfAborted();
      const chunk = new Uint8Array(await blob.slice(start, start + 1048576).arrayBuffer());
      for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      completed += chunk.length; onProgress?.({completed, total, filename});
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 0x21, true); view.setUint32(14, crc, true); view.setUint32(18, size, true); view.setUint32(22, size, true);
    view.setUint16(26, name.length, true); header.set(name, 30);
    const central = new Uint8Array(46 + name.length), entry = new DataView(central.buffer);
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x800, true);
    entry.setUint16(14, 0x21, true); entry.setUint32(16, crc, true); entry.setUint32(20, size, true); entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true); central.set(name, 46);
    local.push(header, blob); directory.push(central); offset += header.length + size; directoryBytes += central.length;
  }
  signal?.throwIfAborted();
  if (offset + directoryBytes + 22 >= 0xffffffff) throw Error('Archive exceeds the ZIP size limit.');
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
  view.setUint32(12, directoryBytes, true); view.setUint32(16, offset, true);
  return new Blob([...local, ...directory, end], {type: 'application/zip'});
}
