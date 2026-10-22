import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRawLinearVelocity} from '../src/raw-linear-velocity.mjs';

function fixture(momentum, inverseMass = 65536) {
  const memory = Buffer.alloc(0xa00000), body = 0x10000;
  momentum.forEach((value, i) => memory.writeInt32LE(value, body + 0x40 + i * 4));
  memory.writeInt32LE(65536, body + 0xa8); memory.writeInt32LE(inverseMass, body + 0xac);
  return {memory, body, run: () => updateRawLinearVelocity(body, {memory, scratchBase: 0x9000}), velocity: () => [0, 4, 8].map(o => memory.readInt32LE(body + 0x68 + o))};
}

test('non-unit inverse mass retains signed product truncation and numeric locals', () => {
  const f = fixture([-1, 3, -3], 32768); f.run();
  assert.deepEqual(f.velocity(), [-1, 1, -2]); assert.equal(f.memory.readInt32LE(0x8ff8), 32768); assert.equal(f.memory.readInt32LE(0x8ffc), -3);
});

test('native abs(INT_MIN) does not enter the positive signed speed threshold', () => {
  const f = fixture([-2147483648, 0, 0]); f.memory.writeInt32LE(123, 0x91d45c); f.run();
  assert.deepEqual(f.velocity(), [-2147483648, 0, 0]); assert.equal(f.memory.readInt32LE(0x91d45c), 123);
});

test('overflowed squared speed faults after publishing velocity and root globals', () => {
  const f = fixture([2147483647, 0, 0]); assert.throws(f.run, /division by zero/);
  assert.deepEqual(f.velocity(), [2147483647, 0, 0]); assert.equal(f.memory.readInt32LE(f.body + 0x40), 2147483647);
  assert.equal(f.memory.readInt32LE(0x91d45c), 65536); assert.equal(f.memory.readInt32LE(0x91d460), 15);
});
