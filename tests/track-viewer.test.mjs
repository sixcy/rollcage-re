import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { ByteBuffer } from '../tools/track-viewer/byte-buffer.mjs';
import { Navigation } from '../tools/track-viewer/navigation.mjs';
import { buildViewerBundle } from '../tools/lib/track-viewer-bundle.mjs';
import {buildTrackViewerPage,buildChangelog} from '../tools/lib/viewer-page.mjs';
import { createZIP } from '../tools/track-viewer/zip.mjs';
import { readTrackZIP } from '../tools/lib/check-track-download.mjs';

const modules = runInNewContext(await buildViewerBundle(['tools/track-viewer/file-archive.mjs', 'tools/track-viewer/track-data.mjs']), { btoa, atob });
const { FileArchive } = modules['tools/track-viewer/file-archive.mjs'];
const plain = value => JSON.parse(JSON.stringify(value));

function indexBlob(entries) {
  const bytes = Buffer.alloc(entries.length * 16);
  for (const [i, entry] of entries.entries()) {
    for (const [field, offset] of [['offset', 0], ['storedBytes', 4], ['decodedBytes', 8]]) bytes.writeUInt32LE(entry[field] ?? 1, i * 16 + offset);
    bytes.writeInt16LE(entry.nextIndex ?? 0, i * 16 + 14);
  }
  return new Blob([bytes]);
}

test('browser bytes preserve unsigned/signed reads, offsets, copies and renderer base64', () => {
  const native = Buffer.from([0xff, 0x80, 0xff, 0x7f, 0xfe, 0xff, 0xff, 0xff]);
  const bytes = ByteBuffer.from(native);
  for (let offset = 0; offset <= 4; offset++) assert.equal(bytes.readUInt32LE(offset), native.readUInt32LE(offset));
  for (let offset = 0; offset <= 6; offset++) assert.equal(bytes.readInt16LE(offset), native.readInt16LE(offset));
  assert.equal(bytes.subarray(2).readUInt16LE(2), native.readUInt16LE(4));
  assert.equal(bytes.toString('base64'), native.toString('base64'));
  assert.equal(bytes.toString('ascii', 1, 4), native.toString('ascii', 1, 4));
  const copy = ByteBuffer.from(bytes); copy[0] = 0; assert.equal(bytes[0], 255);
  assert.equal(ByteBuffer.from(new Float32Array([1, 2]).buffer).length, 8);
  assert.throws(() => bytes.readUInt32LE(5), /bounds/);
  assert.throws(() => bytes.readUInt16LE(-1), /bounds/);
});

test('browser archive slices only the requested resource and follows nearest linked copies', async () => {
  const image = new Blob([Buffer.from('ABCDEF')]), ranges = [];
  const sliced = { size: image.size, slice: (start, end) => { ranges.push([start, end]); return image.slice(start, end); } };
  const archive = await FileArchive.open(sliced, indexBlob([{ offset: 5 }, { offset: 4, nextIndex: 2 }, { offset: 0 }]));
  assert.equal((await archive.readResource(1)).data.toString('ascii'), 'A');
  assert.deepEqual(ranges, [[0, 1]]);
  archive.position = 6;
  assert.equal((await archive.readResource(1)).data.toString('ascii'), 'E');
  assert.equal(archive.position, 5);
});

test('browser archive validates bounds, links, truncation, allocation and decoded lengths', async () => {
  const image = new Blob([Buffer.alloc(4)]);
  await assert.rejects(FileArchive.open(image, new Blob([Buffer.alloc(15)])), /index size/);
  await assert.rejects(FileArchive.open(image, indexBlob([{ offset: 4 }])), /bounds/);
  await assert.rejects(FileArchive.open(image, indexBlob([{ nextIndex: 1 }])), /metadata/);
  const cycle = await FileArchive.open(image, indexBlob([{ offset: 0 }, { offset: 0, nextIndex: 1 }]));
  await assert.rejects(cycle.readResource(1), /Cycle/);
  const short = await FileArchive.open({ size: 4, slice: () => new Blob() }, indexBlob([{ offset: 0 }]));
  await assert.rejects(short.readResource(0), /Short/);
  const big = await FileArchive.open({ size: 2 ** 30 }, indexBlob([{ offset: 0, storedBytes: 129 * 1024 * 1024 }]));
  await assert.rejects(big.readResource(0), /size limit/);
});

test('browser GT20 path preserves overlapping copies and validates index decoded size', async () => {
  const compressed = Buffer.alloc(25); compressed.write('GT20'); compressed.writeUInt32LE(6, 4); compressed.writeUInt32LE(0x7a, 16); compressed.set([65, 255, 0, 0, 1], 20);
  const image = new Blob([compressed]);
  const archive = await FileArchive.open(image, indexBlob([{ offset: 0, storedBytes: 25, decodedBytes: 6 }]));
  assert.equal((await archive.readResource(0)).data.toString('ascii'), 'AAAAAA');
  const wrong = await FileArchive.open(image, indexBlob([{ offset: 0, storedBytes: 25, decodedBytes: 7 }]));
  await assert.rejects(wrong.readResource(0), /Decoded length/);
});

test('track catalog includes only the forty PC BLP track pairs', () => {
  const tracks = plain(modules['tools/track-viewer/track-data.mjs'].tracks);
  assert.equal(tracks.length, 40);
  assert.equal(tracks[0].name, 'LOW/LEV1.BLP');
  assert.equal(tracks.at(-1).name, 'HIGH/LEV20.BLP');
});

const close = (a, b) => a.forEach((n, i) => assert.ok(Math.abs(n - b[i]) < 1e-8, `${a} != ${b}`));
test('switching navigation modes preserves eye and direction after panning and flight', () => {
  const camera = new Navigation(); camera.reset([[-100, 200], [-20, 50], [-90, 250]]);
  camera.pan(150, -30, 900); camera.look(80, -50); camera.wheel(-100);
  const eye = camera.position(), direction = camera.forward(); camera.setMode('fly');
  close(camera.position(), eye); close(camera.forward(), direction);
  camera.step(new Set(['KeyW', 'KeyE']), 0.03); const moved = camera.position();
  camera.setMode('orbit'); close(camera.position(), moved); close(camera.forward(), direction);
});

test('navigation is frame-time based, normalizes diagonals and clamps pitch/zoom/speed', () => {
  const a = new Navigation(), b = new Navigation(); a.setMode('fly'); b.setMode('fly');
  a.step(new Set(['KeyW']), 0.04); b.step(new Set(['KeyW']), 0.02); b.step(new Set(['KeyW']), 0.02);
  close(a.position(), b.position());
  const c = new Navigation(); c.setMode('fly'); const start = c.position();
  c.step(new Set(['KeyW', 'KeyD']), 0.04);
  assert.ok(Math.abs(Math.hypot(...c.position().map((n, i) => n - start[i])) - c.speed * 0.04) < 1e-8);
  c.look(1e5, 1e5); c.wheel(-1e6); assert.ok(c.pitch < Math.PI/2); assert.ok(c.speed <= c.radius * 10);
  c.setMode('orbit'); c.wheel(1e6); assert.equal(c.distance, c.radius * 10);
  assert.ok([...c.matrix(1.5)].every(Number.isFinite));
});

test('generated standalone page matches current sources and embeds no scene payload', async () => {
  assert.equal(await readFile(new URL('../docs/track-viewer.html', import.meta.url), 'utf8'), await buildTrackViewerPage());
  assert.equal(await readFile(new URL('../docs/changelog/index.html', import.meta.url),'utf8'),(await buildChangelog()).history);
});

test('track ZIP round-trips text, binary PNG bytes and Unicode names with standard CRCs', async () => {
  const entries = [
    { name: 'scene.obj', data: 'mtllib scene.mtl\nv 0 1 2\n' },
    { name: 'texture-1.png', data: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]) },
    { name: 'café.txt', data: '123456789' }, { name: 'empty.txt', data: '' }
  ];
  const blob = createZIP(entries); assert.equal(blob.type, 'application/zip');
  const bytes = Buffer.from(await blob.arrayBuffer()), files = readTrackZIP(bytes);
  for (const entry of entries) assert.deepEqual(files.get(entry.name), Buffer.from(entry.data));
  assert.equal(files.size, 4);
  const broken = Buffer.from(bytes); broken[30 + Buffer.byteLength('scene.obj')] ^= 1;
  assert.throws(() => readTrackZIP(broken));
});

test('track ZIP refuses unsafe or duplicate paths', () => {
  for (const name of ['../scene.obj', 'C:\\scene.obj', '.', '..']) assert.throws(() => createZIP([{ name, data: '' }]), /filename/);
  assert.throws(() => createZIP([{ name: 'scene.obj', data: '' }, { name: 'scene.obj', data: '' }]), /duplicate/);
});
