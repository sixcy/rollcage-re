// PS1 raw-sector and ISO9660 transport; independent of game asset formats.
import { openDiscZip, normalizeDiscPath, crc32 } from './disc-zip.mjs';

const textDecoder = new TextDecoder('ascii');
const text = bytes => textDecoder.decode(bytes);
const MAX_ISO_FILE_BYTES = 128 * 1024 * 1024;

export function parseDiscCue(cueText) {
  const files = [];
  const tracks = [];
  let currentFile, currentTrack;
  for (const raw of cueText.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    const file = /^FILE\s+(?:"([^"]+)"|(\S+))\s+(\S+)$/i.exec(line);
    if (file) {
      currentFile = { name: normalizeDiscPath(file[1] ?? file[2]), type: file[3].toUpperCase(), tracks: [] };
      files.push(currentFile); currentTrack = null; continue;
    }
    const track = /^TRACK\s+(\d+)\s+(\S+)$/i.exec(line);
    if (track) {
      if (!currentFile) throw new Error('CUE TRACK has no FILE.');
      currentTrack = { number: Number(track[1]), mode: track[2].toUpperCase(), file: currentFile, startSector: null };
      currentFile.tracks.push(currentTrack); tracks.push(currentTrack); continue;
    }
    const index = /^INDEX\s+01\s+(\d+):(\d+):(\d+)$/i.exec(line);
    if (index) {
      if (!currentTrack || currentTrack.startSector !== null || Number(index[2]) >= 60 || Number(index[3]) >= 75) throw new Error('Invalid CUE INDEX 01.');
      currentTrack.startSector = Number(index[1]) * 60 * 75 + Number(index[2]) * 75 + Number(index[3]);
    }
  }
  const data = tracks.filter(track => track.mode !== 'AUDIO');
  if (data.length !== 1) throw new Error('CUE must identify exactly one data track.');
  const selected = data[0];
  if (selected.mode !== 'MODE2/2352' || selected.file.type !== 'BINARY') throw new Error('Only a BINARY MODE2/2352 PS1 data track is supported.');
  if (selected.file.tracks.length !== 1) throw new Error('Merged data/audio BIN layouts are unsupported.');
  if (selected.startSector === null) throw new Error('Data track is missing CUE INDEX 01.');
  return selected;
}

export function openMode2Iso(bin, startSector = 0) {
  if (bin.length % 2352 || startSector < 0 || !Number.isInteger(startSector) || startSector * 2352 >= bin.length) throw new Error('Invalid MODE2/2352 BIN size or track start.');
  const sectorCount = bin.length / 2352 - startSector;
  function read(offset, length) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > sectorCount * 2048) throw new Error('ISO read exceeds data track bounds.');
    const output = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      const logical = offset + written, sector = Math.floor(logical / 2048), within = logical % 2048;
      const raw = (sector + startSector) * 2352;
      if (bin[raw + 15] !== 2 || (bin[raw + 18] & 0x20)) throw new Error('ISO file uses an unsupported MODE2 sector.');
      // Mode 2 Form 1 duplicates its four-byte subheader.
      for (let i = 0; i < 4; i++) if (bin[raw + 16 + i] !== bin[raw + 20 + i]) throw new Error('Corrupt MODE2 subheader.');
      const count = Math.min(length - written, 2048 - within);
      output.set(bin.subarray(raw + 24 + within, raw + 24 + within + count), written);
      written += count;
    }
    return output;
  }
  function bothEndian(bytes, p) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const little = view.getUint32(p, true);
    if (little !== view.getUint32(p + 4, false)) throw new Error('ISO endian fields disagree.');
    return little;
  }
  function record(bytes, p) {
    const length = bytes[p];
    if (length < 34 || p + length > bytes.length || bytes[p + 32] + 33 > length) throw new Error('Invalid ISO directory record.');
    if (bytes[p + 1] || bytes[p + 26] || bytes[p + 27] || (bytes[p + 25] & 0x80)) throw new Error('Extended, interleaved, or multi-extent ISO files are unsupported.');
    const extent = bothEndian(bytes, p + 2), size = bothEndian(bytes, p + 10);
    if (extent * 2048 + size > sectorCount * 2048 || size > MAX_ISO_FILE_BYTES) throw new Error('ISO file exceeds data track bounds or size limit.');
    return { extent, size, directory: Boolean(bytes[p + 25] & 2), name: text(bytes.subarray(p + 33, p + 33 + bytes[p + 32])).replace(/;\d+$/, ''), length };
  }
  let primary;
  for (let sector = 16; sector < Math.min(48, sectorCount); sector++) {
    const bytes = read(sector * 2048, 2048);
    if (text(bytes.subarray(1, 6)) !== 'CD001' || bytes[6] !== 1) throw new Error('Invalid ISO9660 volume descriptor.');
    if (bytes[0] === 1) { primary = bytes; break; }
    if (bytes[0] === 255) break;
  }
  if (!primary) throw new Error('ISO9660 primary volume descriptor not found.');
  const volumeSectors = bothEndian(primary, 80);
  // Mixed-mode PS1 discs can declare the whole disc, including CD audio,
  // as their volume size. File extents are bounded against the data BIN above.
  if (!volumeSectors) throw new Error('ISO volume size is empty.');
  const primaryView = new DataView(primary.buffer, primary.byteOffset, primary.length);
  if (primaryView.getUint16(128, true) !== 2048 || primaryView.getUint16(130, false) !== 2048) throw new Error('Unsupported ISO logical block size.');
  const root = record(primary, 156);
  if (!root.directory) throw new Error('Invalid ISO root directory.');
  function list(directory) {
    if (!directory.directory || directory.size > 8 * 1024 * 1024) throw new Error('Invalid ISO directory size.');
    const bytes = read(directory.extent * 2048, directory.size), output = [];
    for (let p = 0; p < bytes.length;) {
      if (!bytes[p]) { p = (Math.floor(p / 2048) + 1) * 2048; continue; }
      const child = record(bytes, p);
      if (p % 2048 + child.length > 2048) throw new Error('ISO directory record crosses a sector boundary.');
      if (child.name !== '\0' && child.name !== '\x01') output.push(child);
      p += child.length;
    }
    return output;
  }
  function find(path) {
    let entry = root;
    for (const part of normalizeDiscPath(path).split('/')) {
      const matches = list(entry).filter(candidate => candidate.name.toUpperCase() === part.toUpperCase());
      if (matches.length !== 1) throw new Error(`ISO file missing or ambiguous: ${path}.`);
      entry = matches[0];
    }
    return entry;
  }
  return {
    volumeId: text(primary.subarray(40, 72)).trim(),
    readFile(path) {
      const entry = find(path);
      if (entry.directory) throw new Error(`ISO path is a directory: ${path}.`);
      return read(entry.extent * 2048, entry.size);
    },
    listDirectory(path = '') { return list(path ? find(path) : root); },
  };
}

export async function openFirebugsDisc(source, options = {}) {
  const zip = await openDiscZip(source, options);
  const cues = zip.entries.filter(entry => /\.cue$/i.test(entry.name));
  if (cues.length !== 1) throw new Error('Disc ZIP must contain exactly one CUE sheet.');
  if (cues[0].size > 1024 * 1024) throw new Error('CUE sheet exceeds size limit.');
  options.onProgress?.('Reading CUE sheet');
  const cue = parseDiscCue(new TextDecoder().decode(await zip.readEntry(cues[0])));
  const parent = cues[0].name.includes('/') ? cues[0].name.slice(0, cues[0].name.lastIndexOf('/') + 1) : '';
  const target = normalizeDiscPath(parent + cue.file.name);
  const bins = zip.entries.filter(entry => entry.name.toLowerCase() === target.toLowerCase());
  if (bins.length !== 1) throw new Error(`CUE data BIN is missing or ambiguous: ${target}.`);
  options.onProgress?.('Decompressing data track');
  const bin = await zip.readEntry(bins[0]);
  const iso = openMode2Iso(bin, cue.startSector);
  options.onProgress?.('Reading Firebugs archive');
  const indexData = Buffer.from(iso.readFile('IDX/IDXFILES.IDX'));
  const imageData = Buffer.from(iso.readFile('IDX/IDXFILES.IMG'));
  const systemConfig = text(iso.readFile('SYSTEM.CNF'));
  const bootExecutable = /BOOT\s*=\s*cdrom:\\?([^;\s]+)/i.exec(systemConfig)?.[1] ?? null;
  return {
    indexData, imageData,
    identity: { volumeId: iso.volumeId, bootExecutable, systemConfig, cueMember: cues[0].name, dataMember: bins[0].name,
      dataTrackStartSector: cue.startSector, discBytes: bin.length, indexCrc32: crc32(indexData), imageCrc32: crc32(imageData) },
  };
}
