import test from 'node:test';
import assert from 'node:assert/strict';
import {constructGameTexture} from '../src/game-texture-construction.mjs';
import {createGameImageServices} from '../tools/lib/game-image-fixtures.mjs';
import {constructGameImageWorkerPool} from '../src/game-image-startup.mjs';
function fixture(uploadResult = 1) {
  const memory = Buffer.alloc(0xa00000), imageServices = createGameImageServices(memory), requests = [], put = (p, v) => memory.writeInt32LE(v | 0, p), descriptor = 0x130000;
  put(0x714ae8, 0x100000); put(0x100000, 0x110000); put(0x110078, 0x590800); put(0x110088, 0x590810); put(0x100444, descriptor); [0xff0000, 0xff00, 255, -16777216, 32, 4].forEach((v, i) => put(descriptor + 12 + i * 4, v)); put(0x6e1620 + 9 * 4, -1); put(0x91ce98, 2);
  const runtime = {memory, scratchBase: 0x9000, services: {...imageServices, libraryCall(name, args) {return name === 'registerExit' ? 0 : imageServices.libraryCall(name, args);}, platformCall(name, args) {if (name === 'GetProcessAffinityMask') {put(args[1], 1); put(args[2], 1);} return name === 'GetCurrentThreadId' ? 77 : 1;}, rendererCall(request) {requests.push(request); if (request.offset === 0x78) {put(request.arguments[0], 77); return request.arguments[0];} const list = request.arguments[1], image = memory.readUInt32LE(memory.readUInt32LE(list)), pixels = memory.readUInt32LE(image + 4); requests.push({width: memory.readInt32LE(image + 8), height: memory.readInt32LE(image + 12), rows: Array.from({length: 8}, (_, i) => memory.readUInt32LE(pixels + i * 4))}); memory[request.arguments[5]] = 1; return uploadResult;}}};
  constructGameImageWorkerPool(0x140000, runtime); put(0x6eb038, 0x140000);
  const words = [0xffff0000, 0xff00ff00, 0xff0000ff, 0xffffffff, 0xff000000, 0xffffff00]; words.forEach((v, i) => put(0x200000 + i * 4, v)); return {memory, runtime, requests, words, imageServices};
}
test('texture construction pads each row with its last pixel before the renderer upload', () => {
  const {memory, runtime, requests, words} = fixture(); assert.equal(constructGameTexture(9, 3, 2, 32, 0x200000, 0, 8, runtime), 1);
  assert.deepEqual(requests[2], {width: 4, height: 2, rows: [words[0], words[1], words[2], words[2], words[3], words[4], words[5], words[5]]}); assert.equal(requests[1].arguments[4], 1); assert.equal(memory.readInt32LE(0x6e1620 + 36), 77); assert.equal(memory.readInt32LE(0x91ce98), 9); assert.equal(memory[0x6e63d8 + 0x62], 1);
});
test('upload rejection retains native ID publication and still releases image storage', () => {
  const {memory, runtime, requests, imageServices} = fixture(0); assert.equal(constructGameTexture(9, 3, 2, 32, 0x200000, 0, 0, runtime), 0); assert.equal(requests.length, 3); assert.equal(memory.readInt32LE(0x91ce98), 9); assert.ok(imageServices.calls.some(([name]) => name === 'free')); assert.ok(imageServices.calls.some(([name]) => name === 'operatorDelete'));
});
test('native zero-size texture exit succeeds before touching renderer state', () => {
  const memory = Buffer.alloc(0xa00000); assert.equal(constructGameTexture(9, 0, 8, 32, 0, 0, 0, {memory, scratchBase: 0x9000}), 1); assert.equal(memory.readInt32LE(0x91ce98), 0);
});
