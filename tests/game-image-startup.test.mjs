import test from 'node:test';
import assert from 'node:assert/strict';
import {constructGameImageWorkerPool, initializeGameImageGammaTables} from '../src/game-image-startup.mjs';
import {readGameImageThreadQuota} from '../src/game-image-workers.mjs';
test('real worker-pool construction supplies the nil tree and synchronization consumed by quota lookup', () => {
  const memory = Buffer.alloc(0xa00000), pool = 0x100000, head = 0x110000, calls = []; let handle = 100;
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {assert.equal(name, 'operatorNew'); assert.deepEqual(args, [24]); return head;}, platformCall(name, args) {calls.push([name, ...args]); if (name === 'CreateMutexA' || name === 'CreateEventA') return handle++; if (name === 'GetCurrentThreadId') return 77; if (name.startsWith('Wait')) return 0; return 1;}}};
  constructGameImageWorkerPool(pool, runtime); memory.writeUInt32LE(pool, 0x6eb038); assert.equal(readGameImageThreadQuota(runtime), 16); assert.equal(memory.readUInt32LE(head + 4), head); assert.equal(memory.readUInt16LE(head + 12), 0x101); assert.equal(memory.readUInt32LE(pool), 0x5d4538); assert.deepEqual(calls.slice(0, 4).map(row => row[0]), ['CreateMutexA', 'CreateMutexA', 'CreateEventA', 'CreateEventA']); assert.ok(calls.some(([name]) => name === 'ResetEvent')); assert.equal(calls.at(-1)[0], 'ReleaseMutex'); assert.equal(memory.readInt32LE(pool + 4), 0);
});
test('gamma producer creates both tables once and preserves the original f32 policies', () => {
  const memory = Buffer.alloc(0xa00000); for (const [p, v] of [[0x5dc658, 0.04045], [0x5dc67c, 0.07739938], [0x5dc668, 0.055], [0x5dc758, 0.94786733], [0x5dc610, 0.0031308], [0x5dc9c0, 12.92], [0x5dc780, 1.055]]) memory.writeFloatLE(v, p); memory.writeDoubleLE(1 / 1024, 0x5dc738); memory.writeDoubleLE(2.4000000953674316, 0x5dc8a8); memory.writeDoubleLE(0.4166666567325592, 0x5dc808); let calls = 0;
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {assert.equal(name, 'pow'); calls++; return Math.pow(...args);}}}; initializeGameImageGammaTables(runtime); assert.equal(calls, 4052); assert.ok(Math.abs(memory.readFloatLE(0x6eb040 + 512 * 4) - 0.21404114) < 1e-7); assert.ok(Math.abs(memory.readFloatLE(0x6ed050 + 512 * 4) - 0.7353569) < 1e-7); initializeGameImageGammaTables(runtime); assert.equal(calls, 4052);
});
