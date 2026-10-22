import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
test('single MOVSW snapshots a word before overlapping store, advances pointers and preserves count/flags', () => {
  const m = new BoundedX86([{address: 0x10000, op: 'MOVSW', args: ['ES:EDI', 'ESI']}, {address: 0x10001, op: 'RET', args: []}]);
  m.r.ESP = 0x9000; m.bytes.writeUInt32LE(0xffffffff, 0x9000); m.r.ESI = 0x20000; m.r.EDI = 0x20001; m.r.ECX = 123;
  Buffer.from([1, 2, 3, 4]).copy(m.bytes, 0x20000); for (const flag of ['c', 'o', 'a', 'z', 's', 'p']) m[flag] = true;
  m.run(); assert.deepEqual([...m.bytes.subarray(0x20000, 0x20004)], [1, 1, 2, 4]); assert.equal(m.r.ESI, 0x20002); assert.equal(m.r.EDI, 0x20003); assert.equal(m.r.ECX, 123); for (const flag of ['c', 'o', 'a', 'z', 's', 'p']) assert.equal(m[flag], true);
});
