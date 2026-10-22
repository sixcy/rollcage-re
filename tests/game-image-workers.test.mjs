import test from 'node:test';
import assert from 'node:assert/strict';
import {countGameImageAffinityCpus, readGameImageThreadQuota} from '../src/game-image-workers.mjs';
test('zero affinity still allows one image worker and high mask bits are counted', () => {
  for (const [mask, expected] of [[0, 1], [0x80000001, 2], [0xffffffff, 32]]) {const memory = Buffer.alloc(0xa00000); assert.equal(countGameImageAffinityCpus({memory, scratchBase: 0x9000, services: {platformCall(name, args) {if (name === 'GetCurrentProcess') return -1; memory.writeUInt32LE(mask, args[1]); memory.writeUInt32LE(mask, args[2]); return 1;}}}), expected);}
});
test('missing thread quota returns16 while lock accounting resets the event at the last release', () => {
  const memory = Buffer.alloc(0xa00000), pool = 0x10000, head = 0x20000, calls = []; memory.writeUInt32LE(pool, 0x6eb038); memory.writeUInt32LE(7, pool + 8); memory.writeUInt32LE(8, pool + 16); memory.writeUInt32LE(9, pool + 20); memory.writeUInt32LE(head, pool + 24); memory.writeUInt32LE(head, head + 4); memory[head + 13] = 1;
  const result = readGameImageThreadQuota({memory, scratchBase: 0x9000, services: {platformCall(name) {calls.push(name); return name === 'GetCurrentThreadId' ? 123 : name.startsWith('Wait') ? 0 : 1;}}}); assert.equal(result, 16); assert.equal(memory.readInt32LE(pool + 4), 0); assert.deepEqual(calls, ['GetCurrentThreadId', 'WaitForMultipleObjects', 'SetEvent', 'ReleaseMutex', 'WaitForSingleObject', 'ResetEvent', 'ReleaseMutex']);
});
