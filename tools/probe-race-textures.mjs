import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {decodeInstalledJpeg} from './probe-game-image-resources.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRaceTextureServices, prepareRaceTextureFixture} from './lib/race-texture-fixtures.mjs';
import {createGameImageAsyncFixtures} from './lib/game-image-async-fixtures.mjs';
import {initializeGameImageLibrary} from '../src/game-image-startup.mjs';
import {initializeRaceTextures} from '../src/race-textures.mjs';

const installation = process.argv[2] ?? 'C:/Program Files (x86)/Psygnosis/Rollcage';
const program = await loadRetainedNativeProgram(), images = [];
for (const filename of ['Timewarp.jpg', 'Icesheet.jpg']) {
  const fullPath = path.join(installation, 'IDXData/Redux', filename), image = decodeInstalledJpeg(fullPath);
  images.push({filename, ...image, pixels: Buffer.from(image.pixels, 'base64'), sha256: createHash('sha256').update(await readFile(fullPath)).digest('hex')});
}
const memory = Buffer.alloc(0x1400000); program.initializeMemory(memory);
prepareRaceTextureFixture(memory, {mipmaps: true});
const base = createRaceTextureServices(memory, {allocationBase: 0xa00000, allocationLimit: 0x1000000});
let selected;
const async = createGameImageAsyncFixtures(memory), put = (p, v) => memory.writeInt32LE(v | 0, p);
const runtime = {memory, scratchBase: 0x9000, entryRegisters: {EBX: 0, EBP: 0x173456, ESI: 0, EDI: 0}, services: {...base, ...async, platformCall(name, args) {
  if (name === 'GdipCreateBitmapFromFile') {
    let end = args[0]; while (memory.readUInt16LE(end)) end += 2;
    selected = images.find(image => memory.toString('utf16le', args[0], end).toLowerCase().endsWith(image.filename.toLowerCase()));
    assert.ok(selected, 'Only installed race texture names are requested'); put(args[1], 0x990001); return 0;
  }
  if (name === 'GdipGetImageWidth') {put(args[1], selected.width); return 0;}
  if (name === 'GdipGetImageHeight') {put(args[1], selected.height); return 0;}
  if (name === 'GdipBitmapLockBits') {put(args[4] + 8, selected.stride); put(args[4] + 16, 0x1000000); selected.pixels.copy(memory, 0x1000000); return 0;}
  return base.platformCall(name, args);
}}};
initializeGameImageLibrary(runtime);
assert.equal(initializeRaceTextures(runtime), 1);
const uploads = base.rendererCalls.filter(row => row[0] === 'upload').map(row => row[1]);
assert.equal(uploads.length, 2 + Math.ceil(images[1].width / 256) * Math.ceil(images[1].height / 256));
assert.deepEqual(uploads[0][0][3], images[0].pixels, 'Actual timewarp base pixels');
const ice = images[1]; let tile = 2;
for (let y = 0; y < ice.height; y += 256) for (let x = 0; x < ice.width; x += 256, tile++) {
  const expected = Buffer.alloc(256 * 256 * 4);
  for (let row = 0; row < Math.min(256, ice.height - y); row++) ice.pixels.copy(expected, row * 256 * 4, (y + row) * ice.stride + x * 4, (y + row) * ice.stride + Math.min(x + 256, ice.width) * 4);
  assert.deepEqual(uploads[tile][0][3], expected, 'Actual ice tile ' + tile);
}
const report = {matched: true, originalProcessExecuted: false, images: images.map(({filename, width, height, stride, sha256}) => ({filename, width, height, stride, sha256})), actualLogicalIds: [0x5ed024, 0x5ed02c, 0x5ed028].map(p => memory.readInt32LE(p)), uploads: uploads.map(levels => levels.map(([width, height, bits, bytes]) => ({width, height, bits, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}))), actualWorkerCallbacks: async.calls.filter(row => row[0] === 'construct').length, limits: 'Read-only installed JPGs decoded by host GDI+; actual library startup and4900a0/490040/409bd0/408680 game algorithms, including default mipmaps. All timewarp and twelve ice base tiles independently checked byte-for-byte. CRT/renderer and serialized STL schedule are explicit services; no original execution, GPU output or concurrency claim.'};
await writeFile('analysis/race-installed-textures-probe.json', JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify({matched: true, images: report.images, logicalIds: report.actualLogicalIds, uploads: uploads.length, levels: uploads.reduce((n, row) => n + row.length, 0), workers: report.actualWorkerCallbacks}));
