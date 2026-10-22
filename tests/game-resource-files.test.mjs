import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeRawGameResource, initializeGameResourceCache, readGameResource, openGameDiskResource} from '../src/game-resource-files.mjs';

test('rawGT20 reproduces forward short matches and its control-refill boundary', () => {
  const m = Buffer.alloc(0xa00000), input = 0x10000, output = 0x20000; m.writeUInt32LE(0x40000000, input + 16); m.fill(65, input + 20, input + 50); m[input + 50] = 255; m.writeUInt32LE(13, input + 51); m.set([0, 0, 1], input + 55);
  assert.equal(decodeRawGameResource(input, output, {memory: m}), output + 34); assert.deepEqual(m.subarray(output, output + 34), Buffer.alloc(34, 65));
});
test('cache initialization preserves cursor bytes and cached reads can advance without a destination', () => {
  const m = Buffer.alloc(0xa00000); m.writeInt32LE(71, 0x90c0a4); initializeGameResourceCache({memory: m}); assert.equal(m.readInt32LE(0x90c0a4), 71); m.writeInt32LE(0x10000, 0x90c0a0);
  assert.equal(readGameResource(0x10000, 0, 17, {memory: m}), 1); assert.equal(m.readInt32LE(0x90c0a4), 88); assert.equal(readGameResource(0x10000, 0, -1, {memory: m}), 1); assert.equal(m.readInt32LE(0x90c0a4), 88);
});
test('disk resource open retries sharing violations then tries the basename', () => {
  const m = Buffer.alloc(0xa00000); m.write('Some\\Path\\image.bmp\0', 0x10000); const calls = []; let opens = 0, errors = 0;
  const result = openGameDiskResource(0x10000, {memory: m, services: {platformCall(name, args) {calls.push([name, ...args]); if (name === 'CreateFileA') return ++opens < 3 ? -1 : 0x1234; if (name === 'GetLastError') return errors++ ? 2 : 33; return 0;}}});
  assert.equal(result, 0x1234); assert.equal(calls.filter(([n]) => n === 'Sleep').length, 1); assert.equal(calls.filter(([n]) => n === 'CreateFileA').at(-1)[1], 0x1000a);
});
