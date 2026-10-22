import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

function fixture(destination = 'dword ptr [0x20000]', source = 'EDX') {
  const m = new BoundedX86([{address: 0x10000, op: 'XADD.LOCK', args: [destination, source]}, {address: 0x10004, op: 'RET', args: []}]);
  m.r.ESP = 0x9000; m.bytes.writeInt32LE(-1, 0x9000); return m;
}

test('locked exchange-add returns the old reference count and flags the decremented result', () => {
  for (const old of [0, 1, 2, -2147483648]) {
    const m = fixture(); m.bytes.writeInt32LE(old, 0x20000); m.r.EDX = -1; m.run();
    assert.equal(m.r.EDX, old); assert.equal(m.bytes.readInt32LE(0x20000), (old - 1) | 0);
    assert.equal(m.z, old === 1); assert.equal(m.c, old !== 0); assert.equal(m.o, old === -2147483648);
  }
});

test('locked exchange-add captures the effective address before exchanging its source register', () => {
  const m = fixture('dword ptr [EDX]'); m.r.EDX = 0x20000; m.bytes.writeInt32LE(0x7fffffff, 0x20000); m.run();
  assert.equal(m.r.EDX, 0x7fffffff); assert.equal(m.bytes.readInt32LE(0x20000), (0x7fffffff + 0x20000) | 0); assert.equal(m.o, true);
});

test('locked exchange-add retains bounded rejection of register and narrow-memory destinations', () => {
  for (const destination of ['ECX', 'word ptr [0x20000]']) assert.throws(() => fixture(destination).run(), /Unadmitted locked exchange-add/);
});
