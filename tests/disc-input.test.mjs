import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { openDiscZip, crc32, readSource } from '../src/disc-zip.mjs';
import { openFirebugsDisc, openMode2Iso, parseDiscCue } from '../src/ps1-disc.mjs';

function zipFixture(members) {
  const locals = [], directories = [];
  let offset = 0;
  for (const { name, data, method = 0, flags = 0 } of members) {
    const nameData = Buffer.from(name), bytes = Buffer.from(data);
    const stored = method === 8 ? deflateRawSync(bytes) : bytes;
    const header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6); header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(bytes), 14); header.writeUInt32LE(stored.length, 18); header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(nameData.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(flags, 8); directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc32(bytes), 16); directory.writeUInt32LE(stored.length, 20); directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(nameData.length, 28); directory.writeUInt32LE(offset, 42);
    locals.push(header, nameData, stored); directories.push(directory, nameData);
    offset += header.length + nameData.length + stored.length;
  }
  const central = Buffer.concat(directories), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(members.length, 8); end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

function source(bytes) {
  return { size: bytes.length, async read(offset, length) { return bytes.subarray(offset, offset + length); } };
}

function writeBoth(bytes, offset, value) {
  bytes.writeUInt32LE(value, offset); bytes.writeUInt32BE(value, offset + 4);
}

function isoRecord(name, extent, size, directory = false) {
  const nameData = typeof name === 'number' ? Buffer.from([name]) : Buffer.from(name);
  const record = Buffer.alloc(33 + nameData.length + ((nameData.length + 1) % 2));
  record[0] = record.length; writeBoth(record, 2, extent); writeBoth(record, 10, size);
  record[25] = directory ? 2 : 0; record.writeUInt16LE(1, 28); record.writeUInt16BE(1, 30);
  record[32] = nameData.length; record.set(nameData, 33);
  return record;
}

function rawDiscFixture({ prefixSectors = 0, volumeSectors = 30 } = {}) {
  const logical = Buffer.alloc(30 * 2048);
  const primary = logical.subarray(16 * 2048, 17 * 2048);
  primary[0] = 1; primary.write('CD001', 1); primary[6] = 1;
  primary.fill(32, 40, 72); primary.write('FIREBUGS', 40); writeBoth(primary, 80, volumeSectors);
  primary.writeUInt16LE(2048, 128); primary.writeUInt16BE(2048, 130);
  primary.set(isoRecord(0, 20, 2048, true), 156);
  const rootRecords = Buffer.concat([
    isoRecord(0, 20, 2048, true), isoRecord(1, 20, 2048, true),
    isoRecord('IDX', 21, 2048, true), isoRecord('SYSTEM.CNF;1', 23, 33),
  ]);
  logical.set(rootRecords, 20 * 2048);
  logical.set(Buffer.concat([
    isoRecord(0, 21, 2048, true), isoRecord(1, 20, 2048, true),
    isoRecord('IDXFILES.IDX;1', 22, 16), isoRecord('IDXFILES.IMG;1', 24, 4097),
  ]), 21 * 2048);
  logical.fill(17, 22 * 2048, 22 * 2048 + 16);
  logical.write('BOOT = cdrom:\\SCES_038.84;1\r\n', 23 * 2048);
  for (let p = 0; p < 4097; p++) logical[24 * 2048 + p] = p % 251;
  const raw = Buffer.alloc((30 + prefixSectors) * 2352);
  for (let p = 0; p < 30; p++) {
    const offset = (p + prefixSectors) * 2352;
    raw[offset + 15] = 2; raw.set(logical.subarray(p * 2048, (p + 1) * 2048), offset + 24);
  }
  return raw;
}

const inflateRaw = (bytes, size) => inflateRawSync(bytes, { maxOutputLength: Math.max(1, size) });

test('ZIP reads stored and deflated members with CRC verification', async () => {
  const zip = await openDiscZip(source(zipFixture([
    { name: 'folder/a.txt', data: 'stored' }, { name: 'folder/b.txt', data: 'deflated', method: 8 },
  ])), { inflateRaw });
  assert.equal(Buffer.from(await zip.readEntry(zip.entries[0])).toString(), 'stored');
  assert.equal(Buffer.from(await zip.readEntry(zip.entries[1])).toString(), 'deflated');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('ZIP checks CRC rather than trusting the directory metadata', async () => {
  const bytes = zipFixture([{ name: 'bad.txt', data: 'contents' }]);
  bytes[30 + 'bad.txt'.length] ^= 1;
  const zip = await openDiscZip(source(bytes));
  await assert.rejects(zip.readEntry(zip.entries[0]), /CRC mismatch/);
});

test('ZIP rejects truncation, encryption, duplicate names, unsafe paths and unsupported methods', async () => {
  const normal = zipFixture([{ name: 'a', data: 'a' }]);
  await assert.rejects(openDiscZip(source(normal.subarray(0, normal.length - 1))), /end record/);
  for (const members of [
    [{ name: 'a', data: 'a', flags: 1 }],
    [{ name: 'a', data: 'a', method: 99 }],
    [{ name: '../a', data: 'a' }],
    [{ name: 'A', data: 'a' }, { name: 'a', data: 'b' }],
  ]) await assert.rejects(openDiscZip(source(zipFixture(members))), /Encrypted|Unsupported|Unsafe|Duplicate/);
});

test('ZIP rejects malformed directory offsets and inconsistent local headers', async () => {
  const bytes = zipFixture([{ name: 'a', data: 'a' }]);
  const badDirectory = Buffer.from(bytes);
  badDirectory.writeUInt32LE(0xffffff00, badDirectory.length - 6);
  await assert.rejects(openDiscZip(source(badDirectory)), /directory bounds/);
  bytes.writeUInt32LE(123, 22);
  const zip = await openDiscZip(source(bytes));
  await assert.rejects(zip.readEntry(zip.entries[0]), /sizes or CRC/);
});

test('source reads enforce exact bounded responses', async () => {
  await assert.rejects(readSource(source(Buffer.alloc(3)), 2, 2), /bounds/);
  await assert.rejects(readSource({ size: 3, async read() { return new Uint8Array(1); } }, 0, 2), /Truncated/);
});

test('CUE selects the data BIN and supports an INDEX 01 offset', () => {
  const cue = parseDiscCue('FILE "data.bin" BINARY\n TRACK 01 MODE2/2352\n INDEX 01 00:02:01\nFILE "audio.bin" BINARY\n TRACK 02 AUDIO\n INDEX 01 00:02:00');
  assert.equal(cue.file.name, 'data.bin'); assert.equal(cue.startSector, 151);
});

test('CUE rejects missing, ambiguous, unsupported and merged data tracks', () => {
  for (const cue of [
    'FILE "a.bin" BINARY\nTRACK 01 AUDIO\nINDEX 01 00:00:00',
    'FILE "a.bin" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00\nTRACK 02 AUDIO',
    'FILE "a.bin" BINARY\nTRACK 01 MODE1/2352\nINDEX 01 00:00:00',
    'FILE "a.bin" BINARY\nTRACK 01 MODE2/2352',
    'FILE "a.bin" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00\nFILE "b.bin" BINARY\nTRACK 02 MODE2/2352\nINDEX 01 00:00:00',
  ]) assert.throws(() => parseDiscCue(cue), /data track|unsupported|supported|missing/);
});

test('MODE2 ISO reads files across sectors, subdirectories and version suffixes', () => {
  const iso = openMode2Iso(rawDiscFixture({ prefixSectors: 2, volumeSectors: 1000 }), 2);
  assert.equal(iso.volumeId, 'FIREBUGS');
  assert.equal(iso.readFile('idx/idxfiles.idx').length, 16);
  const image = iso.readFile('IDX/IDXFILES.IMG');
  assert.equal(image.length, 4097);
  assert.equal(image[2048], 2048 % 251); assert.equal(image[4096], 4096 % 251);
  assert.throws(() => iso.readFile('missing'), /missing/);
});

test('MODE2 ISO rejects invalid sector forms, extents and endian fields', () => {
  const badForm = rawDiscFixture(); badForm[16 * 2352 + 18] = 0x20;
  assert.throws(() => openMode2Iso(badForm), /sector/);
  const badEndian = rawDiscFixture(); badEndian[16 * 2352 + 24 + 84] ^= 1;
  assert.throws(() => openMode2Iso(badEndian), /endian/);
  const badExtent = rawDiscFixture();
  writeBoth(badExtent, 16 * 2352 + 24 + 156 + 2, 100);
  assert.throws(() => openMode2Iso(badExtent), /bounds/);
});

test('Firebugs ZIP resolves relative CUE members and never inflates audio', async () => {
  let inflations = 0;
  const cue = 'FILE "DATA.BIN" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00\nFILE "audio.bin" BINARY\nTRACK 02 AUDIO\nINDEX 01 00:00:00';
  const bytes = zipFixture([
    { name: 'renamed/disc.cue', data: cue, method: 8 },
    { name: 'renamed/data.bin', data: rawDiscFixture(), method: 8 },
    { name: 'renamed/audio.bin', data: 'audio should not inflate', method: 8 },
  ]);
  const disc = await openFirebugsDisc(source(bytes), { inflateRaw(bytes, size) { inflations++; return inflateRaw(bytes, size); } });
  assert.equal(inflations, 2); assert.equal(disc.indexData.length, 16); assert.equal(disc.imageData.length, 4097);
  assert.equal(disc.identity.bootExecutable, 'SCES_038.84');
  assert.equal(disc.identity.indexCrc32, crc32(disc.indexData));
});

test('Firebugs ZIP rejects missing or ambiguous CUE sheets and missing data members', async () => {
  await assert.rejects(openFirebugsDisc(source(zipFixture([{ name: 'data.bin', data: 'a' }]))), /exactly one CUE/);
  await assert.rejects(openFirebugsDisc(source(zipFixture([{ name: 'a.cue', data: 'a' }, { name: 'b.cue', data: 'b' }]))), /exactly one CUE/);
  const cue = 'FILE "missing.bin" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00';
  await assert.rejects(openFirebugsDisc(source(zipFixture([{ name: 'a.cue', data: cue }]))), /BIN is missing/);
});
