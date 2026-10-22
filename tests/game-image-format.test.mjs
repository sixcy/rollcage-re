import test from 'node:test';
import assert from 'node:assert/strict';
import {gameImageHalfBits, setGameImageMasks, writeGameImageRgba, readGameImageRgba, findGameImagePaletteIndex} from '../src/game-image-format.mjs';
test('half conversion preserves signed zero, subnormal rounding and NaN payloads', () => {
  assert.equal(gameImageHalfBits(0), 0); assert.equal(gameImageHalfBits(0x80000000), 0x8000); assert.equal(gameImageHalfBits(0x3f800000), 0x3c00); assert.equal(gameImageHalfBits(0x33800000), 1); assert.equal(gameImageHalfBits(0x7f800000), 0x7c00); assert.equal(gameImageHalfBits(0x7f800001), 0x7c01); assert.equal(gameImageHalfBits(0xffc00000), 0xfe00);
});
test('RGB565 writes quantize and reads shift missing bits without replicating them', () => {
  const memory = Buffer.alloc(0xa00000), image = 0x10000, pixel = 0x20000, output = 0x30000, runtime = {memory, scratchBase: 0x9000}; memory.writeInt32LE(16, image + 0x44); setGameImageMasks(image, 0xf800, 0x7e0, 31, 0, runtime);
  writeGameImageRgba(image, pixel, 0xffabcdef, runtime); assert.equal(memory.readUInt16LE(pixel), 0xae7d); readGameImageRgba(image, output, pixel, runtime); assert.equal(memory.readUInt32LE(output), 0xffa8cce8);
});
test('native palette metric returns its first dominating entry rather than Euclidean nearest color', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeUInt32LE(0x20000, 0x10000); memory.writeUInt32LE(0xffffffff, 0x20000); memory.writeUInt32LE(0x10203040, 0x20004); assert.equal(findGameImagePaletteIndex(0x10000, 0x10203040, {memory, scratchBase: 0x9000}), 0);
});
