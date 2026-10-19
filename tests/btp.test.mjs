import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { parseBTP, decodeBTPTexture } from '../src/btp.mjs';
import { encodePNG } from '../src/png.mjs';

function fixture() {
  const data = Buffer.alloc(0x70 + 24 + 1024 + 3);
  data.write('BTP '); data.writeUInt32LE(data.length - 3, 0x24);
  data.writeUInt16LE(2, 0x34); data.writeUInt16LE(1, 0x36);
  data.writeUInt32LE(0x70, 0x38); data.writeUInt32LE(0x88, 0x3c);
  data[0x32] = 1; data[0x33] = 1;
  for (const p of [0x70, 0x7c]) { data.writeUInt16LE(3, p); data.writeUInt16LE(1, p + 2); }
  data[0x88 + 4] = 255; data[0x88 + 7] = 123;
  data.set([0, 1, 2], data.length - 3);
  return data;
}
test('BTP palette order and black transparency follow native upload flags', () => {
  const btp = parseBTP(fixture());
  assert.deepEqual([...decodeBTPTexture(btp, 0).rgba], [0,0,0,0, 255,0,0,255, 0,0,0,255]);
  assert.deepEqual([...decodeBTPTexture(btp, 1).rgba], [0,0,0,0, 255,0,0,255, 0,0,0,0]);
});
test('zero-dimension slots are skipped before unused palette or pixel references', () => {
  const data = fixture(); data.writeUInt16LE(0, 0x70); data.writeUInt16LE(65535, 0x74);
  const btp = parseBTP(data);
  assert.equal(btp.textures[0].empty, true);
  assert.throws(() => decodeBTPTexture(btp, 0), /empty/);
});
test('invalid palette and pixel ranges fail', () => {
  const data = fixture(); data.writeUInt16LE(1, 0x74);
  assert.throws(() => parseBTP(data), /palette index/);
  data.writeUInt16LE(0, 0x74); data.writeUInt32LE(data.length, 0x78);
  assert.throws(() => parseBTP(data), /pixels/);
});
test('PNG retains decoded RGBA bytes with valid image framing', () => {
  const image = decodeBTPTexture(parseBTP(fixture()), 0), png = encodePNG(image);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 3); assert.equal(png.readUInt32BE(20), 1);
  const payloads = [];
  for (let p = 8; p < png.length;) {
    const bytes = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') payloads.push(png.subarray(p + 8, p + 8 + bytes));
    p += bytes + 12;
  }
  assert.deepEqual(inflateSync(Buffer.concat(payloads)), Buffer.concat([Buffer.from([0]), image.rgba]));
  assert.equal(png.subarray(-4).toString('hex'), 'ae426082');
});
