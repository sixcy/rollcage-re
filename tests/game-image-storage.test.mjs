import test from 'node:test';
import assert from 'node:assert/strict';
import {constructGamePixelImage, allocateGamePixelImage, releaseGameImageList, appendGameImagePointer} from '../src/game-image-storage.mjs';
import {writeGameImageRgba, readGameImageRgba} from '../src/game-image-format.mjs';
import {createGameImageServices} from '../tools/lib/game-image-fixtures.mjs';
test('pixel image construction, allocation, access and release share native storage ownership', () => {
  const memory = Buffer.alloc(0xa00000), services = createGameImageServices(memory), runtime = {memory, scratchBase: 0x9000, services, entryRegisters: {ESI: 0, EDI: 0, EBX: 0}}, list = 0x10000;
  const image = constructGamePixelImage(list, runtime), entries = memory.readUInt32LE(list); assert.equal(memory.readUInt32LE(entries), image); assert.equal(memory.readUInt32LE(list + 4), entries + 4); assert.equal(services.calls.filter(([name]) => name === 'MultiByteToWideChar').length, 3);
  assert.equal(allocateGamePixelImage(image, 0, 32, 8, 4, -1, -1, -1, -1, 1, runtime), 1); const pixels = memory.readUInt32LE(image + 4); assert.deepEqual(memory.subarray(pixels, pixels + 128), Buffer.alloc(128)); writeGameImageRgba(image, pixels + 4, 0xff123456, runtime); readGameImageRgba(image, 0x20000, pixels + 4, runtime); assert.equal(memory.readUInt32LE(0x20000), 0xff123456);
  releaseGameImageList(list, runtime); assert.equal(memory.readUInt32LE(list), entries); assert.equal(memory.readUInt32LE(list + 4), entries); assert.ok(services.calls.some(([name, pointer]) => name === 'free' && pointer === pixels)); assert.ok(services.calls.some(([name, pointer]) => name === 'operatorDelete' && pointer === image));
});
test('image vector append rebases its aliased input after allocation growth', () => {
  const memory = Buffer.alloc(0xa00000), services = createGameImageServices(memory), list = 0x10000, old = 0x20000; memory.writeUInt32LE(old, list); memory.writeUInt32LE(old + 8, list + 4); memory.writeUInt32LE(old + 8, list + 8); memory.writeUInt32LE(123, old); memory.writeUInt32LE(456, old + 4);
  appendGameImagePointer(list, old + 4, {memory, services}); const next = memory.readUInt32LE(list); assert.notEqual(next, old); assert.deepEqual([0, 4, 8].map(offset => memory.readUInt32LE(next + offset)), [123, 456, 456]);
});
