import test from 'node:test';
import assert from 'node:assert/strict';
import {setGameImageMasks} from '../src/game-image-format.mjs';
import {constructGameImageTask, appendGameImageJob, waitGameImageJobs, releaseGameImageJobs} from '../src/game-image-jobs.mjs';
import {createGameImageAsyncFixtures} from '../tools/lib/game-image-async-fixtures.mjs';
import {createGameImageServices} from '../tools/lib/game-image-fixtures.mjs';

test('image futures preserve captures and execute the real selected conversion rows at await', () => {
  const memory = Buffer.alloc(0xa00000), source = 0x100000, target = 0x110000, args = 0x120000, future = 0x130000, vector = 0x140000, fn = 0x141000, self = 0x142000, async = createGameImageAsyncFixtures(memory), runtime = {memory, scratchBase: 0x9000, services: {...createGameImageServices(memory), ...async}}, put = (p, v) => memory.writeInt32LE(v | 0, p);
  for (const [image, pixels, bits] of [[source, 0x200000, 32], [target, 0x210000, 16]]) {put(image + 4, pixels); put(image + 8, 2); put(image + 12, 2); put(image + 16, 0); put(image + 0x44, bits); setGameImageMasks(image, ...(bits === 32 ? [-1, -1, -1, -1] : [0xf800, 0x7e0, 31, 0]), runtime);}
  [0xffff0000, 0xff00ff00, 0xff0000ff, 0xffffffff].forEach((v, i) => put(0x200000 + i * 4, v)); memory.fill(0xc9, 0x210000, 0x210008);
  put(fn, 0x4bd770); put(self, source); [0, 0, 2, 2, 1, 1, 0, 0, target].forEach((v, i) => put(args + i * 4, v)); constructGameImageTask(future, fn, self, args, runtime); const state = memory.readUInt32LE(future);
  appendGameImageJob(vector, future, runtime); assert.equal(memory.readUInt32LE(future), 0); put(fn, 0); put(self, 0); put(args + 16, 0); put(args + 20, 0);
  assert.deepEqual([...memory.subarray(0x210000, 0x210008)], Array(8).fill(0xc9)); waitGameImageJobs(vector, runtime);
  assert.deepEqual([...memory.subarray(0x210000, 0x210008)], [0xc9, 0xc9, 0xc9, 0xc9, 31, 0, 255, 255]); releaseGameImageJobs(vector, runtime);
  assert.equal(memory.readInt32LE(state + 4), 0); assert.equal(memory.readInt32LE(state + 36), -1); assert.deepEqual(async.calls.map(row => row[0]), ['construct', 'wait', 'destroy']); assert.equal(memory.readUInt32LE(vector), 0);
});

test('invalid future rejection occurs before invoking the STL await service', () => {
  const memory = Buffer.alloc(0xa00000), async = createGameImageAsyncFixtures(memory), vector = 0x100000; memory.writeUInt32LE(0x110000, vector); memory.writeUInt32LE(0x110008, vector + 4);
  assert.throws(() => waitGameImageJobs(vector, {memory, scratchBase: 0x9000, services: async}), /future error4/); assert.deepEqual(async.calls, [['error', 4]]);
});
