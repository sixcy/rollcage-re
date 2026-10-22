import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
test('SCASB.REPNE scans forward through the first equality and publishes subtraction flags', () => {
  for (const [needle, count, expected, zero] of [[0, 4, 3, true], [255, 3, 3, false], [0, 0, 0, false]]) {
    const m = new BoundedX86([{address: 0x1000, op: 'SCASB.REPNE', args: ['ES:EDI']}, {address: 0x1001, op: 'RET', args: []}]);
    m.bytes.set([1, 128, 0, 5], 0x20000); m.r.EAX = needle; m.r.ECX = count; m.r.EDI = 0x20000; m.r.ESP = 0x9000; m.bytes.writeInt32LE(-1, 0x9000); m.run(); assert.equal(m.r.EDI, 0x20000 + expected); assert.equal(m.r.ECX, count - expected); assert.equal(m.z, zero); if (count) assert.equal(m.c, needle < m.bytes[m.r.EDI - 1]);
  }
});
test('SCASB.REPNE bounds unterminated scans and rejects unsupported forms', () => {
  const m = new BoundedX86([{address: 0x1000, op: 'SCASB.REPNE', args: ['ES:EDI']}]); m.r.ECX = -1; m.r.EAX = 1; m.r.EDI = 0x20000; assert.throws(() => m.run(), /budget/);
});
