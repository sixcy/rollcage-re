import assert from 'node:assert/strict';
import {writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodeInstalledJpeg} from './probe-game-image-resources.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createGameImageServices} from './lib/game-image-fixtures.mjs';
import {createGameImageAsyncFixtures} from './lib/game-image-async-fixtures.mjs';
import {initializeGameImageLibrary} from '../src/game-image-startup.mjs';
import {constructGameTexture} from '../src/game-texture-construction.mjs';
import {loadGameBitmap} from '../src/game-bitmap-images.mjs';

const installation = process.argv[2] ?? 'C:/Program Files (x86)/Psygnosis/Rollcage', program = await loadRetainedNativeProgram(), textures = [];
for (const filename of ['Raindrop1.jpg', 'Snowflake2.jpg']) {
  const fullPath = path.join(installation, 'IDXData/Redux', filename), image = decodeInstalledJpeg(fullPath), pixels = Buffer.from(image.pixels, 'base64'), memory = Buffer.alloc(0xa00000), NAME = 0x100000, DESC = 0x110000; program.initializeMemory(memory); memory.write(filename + '\0', NAME);
  const put = (p, v) => memory.writeInt32LE(v | 0, p), base = createGameImageServices(memory, {openFailure: true, width: image.width, height: image.height}), async = createGameImageAsyncFixtures(memory), uploads = []; let handle = 100;
  const services = {...base, ...async, libraryCall(name, args) {if (name === 'pow') return Math.pow(...args); if (name === 'registerExit') return 0; return base.libraryCall(name, args);}, platformCall(name, args) {
    if (name === 'GdipBitmapLockBits') {put(args[4] + 8, image.stride); put(args[4] + 16, 0x300000); pixels.copy(memory, 0x300000); return 0;}
    switch (name) {case 'GdiplusStartup': memory.writeBigUInt64LE(0xabc123n, args[0]); return 0; case 'CreateMutexA': case 'CreateEventA': return handle++; case 'GetCurrentProcess': return -1; case 'GetProcessAffinityMask': put(args[1], 15); put(args[2], 15); return 1; case 'GetCurrentThreadId': return 77; case 'WaitForMultipleObjects': case 'WaitForSingleObject': return 0; case 'SetEvent': case 'ResetEvent': case 'ReleaseMutex': case 'InitializeCriticalSectionAndSpinCount': case 'EnterCriticalSection': case 'LeaveCriticalSection': return 1; default: return base.platformCall(name, args);}
  }, rendererCall(request) {
    if (request.offset === 0x78) {put(request.arguments[0], 300 + uploads.length); return request.arguments[0];}
    const list = request.arguments[1], levels = []; for (let p = memory.readUInt32LE(list); p !== memory.readUInt32LE(list + 4); p += 4) {const image = memory.readUInt32LE(p), width = memory.readInt32LE(image + 8), height = memory.readInt32LE(image + 12), bits = memory.readInt32LE(image + 0x44), data = memory.readUInt32LE(image + 4); levels.push({width, height, bits, bytes: Buffer.from(memory.subarray(data, data + width * height * (bits >> 3)))});} uploads.push(levels); memory[request.arguments[5]] = 1; return 1;
  }};
  const runtime = {memory, scratchBase: 0x9000, entryRegisters: {EBX: 0, EBP: 0, ESI: 0, EDI: 0}, services}; initializeGameImageLibrary(runtime); assert.equal(loadGameBitmap(NAME, DESC, 1, runtime), 1);
  assert.equal(memory.readInt16LE(DESC + 2), image.width); assert.equal(memory.readInt16LE(DESC + 6), image.height); const data = memory.readUInt32LE(DESC + 20), pitch = memory.readInt16LE(DESC + 4);
  for (let row = 0; row < image.height; row++) assert.deepEqual(memory.subarray(data + row * pitch, data + (row + 1) * pitch), pixels.subarray((image.stride < 0 ? image.height - 1 - row : row) * Math.abs(image.stride), (image.stride < 0 ? image.height - row : row + 1) * Math.abs(image.stride)), filename + ' decoded row');
  const descriptor = 0x2d0000; put(0x714ae8, 0x2b0000); put(0x2b0000, 0x2c0000); put(0x2c0078, 0x592000); put(0x2c0088, 0x592010); put(0x2b0444, descriptor); put(0x6e63d0, 0); put(0x6e64a4, 0); const conversions = [];
  for (const bits of [16, 32]) {
    const index = bits, masks = bits === 16 ? [0xf800, 0x7e0, 31, 0] : [0xff0000, 0xff00, 255, -16777216], shifts = bits === 16 ? [3, 11, 2, 5, 3, 0, 0, 0] : [0, 16, 0, 8, 0, 0, 0, 24]; shifts.forEach((v, i) => memory[descriptor + 4 + i] = v); masks.forEach((v, i) => put(descriptor + 12 + i * 4, v)); put(descriptor + 28, bits); put(descriptor + 32, bits >> 3); put(0x6e1620 + index * 4, -1);
    assert.equal(constructGameTexture(index, image.width, image.height, 32, data, 0, 0, runtime), 1); const levels = uploads.at(-1), basePixels = levels[0].bytes; assert.equal(levels.length, Math.log2(Math.min(image.width, image.height) / 4) + 1);
    if (bits === 32) assert.deepEqual(basePixels, memory.subarray(data, data + pitch * image.height), filename + ' RGBA32 base pixels'); else for (let i = 0; i < image.width * image.height; i++) {const p = data + i * 4, expected = (memory[p + 2] >> 3) << 11 | (memory[p + 1] >> 2) << 5 | memory[p] >> 3; assert.equal(basePixels.readUInt16LE(i * 2), expected, filename + ' RGB565 pixel' + i);}
    for (const [level, row] of levels.entries()) {assert.equal(row.width, image.width >> level); assert.equal(row.height, image.height >> level); assert.equal(row.bytes.length, row.width * row.height * (bits >> 3)); if (bits === 32) for (let i = 3; i < row.bytes.length; i += 4) assert.equal(row.bytes[i], 255);}
    conversions.push({bits, actualTextureConstruction408680: true, levels: levels.map(({width, height, bits, bytes}) => ({width, height, bits, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}))});
  }
  textures.push({filename, sha256: createHash('sha256').update(await readFile(fullPath)).digest('hex'), width: image.width, height: image.height, stride: image.stride, actualHostGdiPlusDecode: true, conversions, actualWorkerCallbacks: async.calls.filter(row => row[0] === 'construct').length});
}
const report = {textures, originalProcessExecuted: false, matched: true, limits: 'Read-only installed JPGs; host GDI+ feeds actual4895d0→414dc0→408680→conversion/copy/resampling/mipmaps. Actual startup produces worker pool/gamma. CRT handles, renderer allocation/upload and serialized STL scheduling are explicit service fixtures; no original renderer or concurrent game execution.'};
await writeFile('analysis/weather-installed-texture-construction-probe.json', JSON.stringify(report, null, 2), {flag: 'wx'}); console.log(JSON.stringify(report));
