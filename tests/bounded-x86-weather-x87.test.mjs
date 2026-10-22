import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
function machine(operations) {
  const m = new BoundedX86([...operations, ['RET']].map(([op, ...args], i) => ({address: 0x10000 + i, op, args})));
  m.r.ESP = 0x9000; m.bytes.writeInt32LE(-1, 0x9000); return m;
}
test('weather x87 stores preserve or pop the top while retaining deeper values', () => {
  const m = machine([['FST', 'float ptr [0x20000]'], ['FSTP', 'float ptr [0x20004]']]);
  m.x87 = [77, 1 + 2 ** -25]; m.run();
  assert.equal(m.bytes.readFloatLE(0x20000), 1); assert.equal(m.bytes.readFloatLE(0x20004), 1); assert.deepEqual(m.x87, [77]);
});
test('weather x87 reverse divide consumes float memory without rounding the pending register', () => {
  const m = machine([['FADD', 'float ptr [0x20000]'], ['FDIVR', 'float ptr [0x20004]']]);
  m.x87 = [1, 3]; m.bytes.writeFloatLE(2, 0x20000); m.bytes.writeFloatLE(7, 0x20004); m.run(); assert.deepEqual(m.x87, [1, 7 / 5]);
  const full = machine([['FSTP', 'float ptr [0x20000]']]); full.x87 = Array.from({length: 8}, (_, i) => i); full.run(); assert.equal(full.x87.length, 7);
});
test('weather x87 additions reject unsupported formats and invalid stack depths', () => {
  for (const op of ['FST', 'FSTP', 'FADD', 'FDIVR']) for (const values of [[], Array(9).fill(1)]) {
    const m = machine([[op, 'float ptr [0x20000]']]); m.x87 = values; assert.throws(() => m.run(), /Unadmitted x87/);
  }
  for (const op of ['FST', 'FADD', 'FDIVR']) for (const operand of ['ST1', 'dword ptr [0x20000]', 'double ptr [0x20000]']) {
    const m = machine([[op, operand]]); m.x87 = [1]; assert.throws(() => m.run(), /Unadmitted x87/);
  }
  const oldDouble = machine([['FSTP', 'double ptr [0x20000]']]); oldDouble.x87 = [7 / 3]; oldDouble.run(); assert.equal(oldDouble.bytes.readDoubleLE(0x20000), 7 / 3);
});
