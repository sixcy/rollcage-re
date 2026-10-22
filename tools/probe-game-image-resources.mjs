import assert from 'node:assert/strict';
import {readFile, open, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseIndex} from '../src/archive-index.mjs';
import {decodeGT20} from '../src/gt20.mjs';
import {decodeRawGameResource} from '../src/game-resource-files.mjs';
import {loadGameBitmap} from '../src/game-bitmap-images.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createGameImageServices} from './lib/game-image-fixtures.mjs';

// Windows GDI+ is the original platform decoder boundary, not game execution.
export function decodeInstalledJpeg(filename) {
  const literal = filename.replaceAll("'", "''"), script = `Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap('${literal}')
try {
  $rectangle = New-Object System.Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)
  $locked = $bitmap.LockBits($rectangle,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try { $bytes = New-Object byte[] ([Math]::Abs($locked.Stride)*$bitmap.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0,$bytes,0,$bytes.Length)
    @{width=$bitmap.Width;height=$bitmap.Height;stride=$locked.Stride;pixels=[Convert]::ToBase64String($bytes)} | ConvertTo-Json -Compress
  } finally { $bitmap.UnlockBits($locked) }
} finally { $bitmap.Dispose() }`;
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}));
}

export async function probeGameImageResources({installation = 'C:/Program Files (x86)/Psygnosis/Rollcage', output = 'analysis/game-image-installed-resource-probe.json'} = {}) {
  const index = await readFile(path.join(installation, 'IDXData/Rollcage.idx')), archive = await open(path.join(installation, 'IDXData/Rollcage.img'), 'r'), entries = parseIndex(index, (await archive.stat()).size); let compressed = 0, decodedBytes = 0;
  try {for (const entry of entries) {
    const stored = Buffer.alloc(entry.storedBytes); assert.equal((await archive.read(stored, 0, stored.length, entry.offset)).bytesRead, stored.length); if (entry.storedBytes === entry.decodedBytes) continue;
    const expected = decodeGT20(stored).data, input = 0x10000, outputAddress = input + stored.length + 0x100, memory = Buffer.alloc(outputAddress + entry.decodedBytes + 64); stored.copy(memory, input);
    assert.equal(decodeRawGameResource(input, outputAddress, {memory}), outputAddress + entry.decodedBytes, `resource${entry.index} length`); assert.deepEqual(memory.subarray(outputAddress, outputAddress + entry.decodedBytes), expected, `resource${entry.index}`); compressed++; decodedBytes += expected.length;
  }} finally {await archive.close();}
  const program = await loadRetainedNativeProgram(), textures = [];
  for (const filename of ['Raindrop1.jpg', 'Snowflake2.jpg']) {
    const fullPath = path.join(installation, 'IDXData/Redux', filename), image = decodeInstalledJpeg(fullPath), pixels = Buffer.from(image.pixels, 'base64'), memory = Buffer.alloc(0xa00000), NAME = 0x100000, DESC = 0x110000; program.initializeMemory(memory); memory.write(filename + '\0', NAME);
    const base = createGameImageServices(memory, {openFailure: true, width: image.width, height: image.height}), calls = [], services = {...base, platformCall(name, args) {calls.push(name); if (name === 'GdipBitmapLockBits') {memory.writeInt32LE(image.stride, args[4] + 8); memory.writeUInt32LE(0x300000, args[4] + 16); pixels.copy(memory, 0x300000); return 0;} return base.platformCall(name, args);}};
    assert.equal(loadGameBitmap(NAME, DESC, 1, {memory, scratchBase: 0x9000, services}), 1); assert.equal(memory.readInt16LE(DESC + 2), image.width); assert.equal(memory.readInt16LE(DESC + 6), image.height); const data = memory.readUInt32LE(DESC + 20), pitch = memory.readInt16LE(DESC + 4);
    for (let row = 0; row < image.height; row++) assert.deepEqual(memory.subarray(data + row * pitch, data + (row + 1) * pitch), pixels.subarray((image.stride < 0 ? image.height - 1 - row : row) * Math.abs(image.stride), (image.stride < 0 ? image.height - row : row + 1) * Math.abs(image.stride)), filename + ' decoded row');
    textures.push({filename, sha256: createHash('sha256').update(await readFile(fullPath)).digest('hex'), width: image.width, height: image.height, stride: image.stride, actualGameBitmapFallback: true, actualHostGdiPlusDecode: true, platformCalls: calls});
  }
  const report = {entries: entries.length, rawCompressedResourcesMatched: compressed, decodedBytes, textures, originalProcessExecuted: false, limits: 'Installed archives read-only; rawdecoder compares independent convenience decoder. WeatherJPGs decoded through hostGDI+, then actual4895d0→414dc0;408680 conversion/upload remains open.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await probeGameImageResources({installation: process.argv[2]})));
