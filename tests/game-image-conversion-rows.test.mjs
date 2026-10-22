import test from 'node:test';
import assert from 'node:assert/strict';
import {setGameImageMasks} from '../src/game-image-format.mjs';
import {convertGameImageRows} from '../src/game-image-conversion-rows.mjs';
test('conversion rows honor the selected row range and quantize into RGB565', () => {
  const memory = Buffer.alloc(0xa00000), source = 0x10000, target = 0x20000, input = 0x30000, output = 0x40000, runtime = {memory, scratchBase: 0x9000};
  for (const [image, data, bits] of [[source, input, 32], [target, output, 16]]) {memory.writeUInt32LE(data, image + 4); memory.writeUInt32LE(2, image + 8); memory.writeUInt32LE(bits, image + 0x44); setGameImageMasks(image, ...(bits === 32 ? [-1, -1, -1, -1] : [0xf800, 0x7e0, 31, 0]), runtime);}
  memory.fill(0xa5, output, output + 12); [0xffffffff, 0xffffffff, 0xffff0000, 0xff00ff00, 0xff0000ff, 0].forEach((v, i) => memory.writeUInt32LE(v, input + i * 4)); convertGameImageRows(source, [0, 0, 2, 3, 1, 1, 0, 0, target], runtime); assert.deepEqual([...memory.subarray(output, output + 12)], [0xa5, 0xa5, 0xa5, 0xa5, 0, 0xf8, 0xe0, 7, 0xa5, 0xa5, 0xa5, 0xa5]);
});
test('float-to-byte row conversion applies the native center/range luminance policy', () => {
  const memory = Buffer.alloc(0xa00000), source = 0x10000, target = 0x20000, input = 0x30000, output = 0x40000, runtime = {memory, scratchBase: 0x9000};
  for (const [image, data, type, bits] of [[source, input, 1, 128], [target, output, 0, 32]]) {memory.writeUInt32LE(data, image + 4); memory.writeUInt32LE(1, image + 8); memory.writeUInt32LE(type, image + 16); memory.writeUInt32LE(bits, image + 0x44); setGameImageMasks(image, -1, -1, -1, -1, runtime);}
  for (const [p, value] of [[0x5dc774, 1], [0x5dc6ec, 0.5], [0x5dc700, 0.587], [0x5dc6b4, 0.299], [0x5dc690, 0.114], [0x5d00f8, 3.5762787e-7], [0x5dca48, 255.9999], [source + 0x50, 0.2], [source + 0x54, 0.7]]) memory.writeFloatLE(value, p); [0.4, 0.4, 0.4, 1].forEach((v, i) => memory.writeFloatLE(v, input + i * 4));
  convertGameImageRows(source, [0, 0, 1, 1, 0, 1, 2, 0, target], runtime); assert.equal(memory.readUInt32LE(output), 0xffc9c9c9);
});
