import test from 'node:test';
import assert from 'node:assert/strict';
import {REDUX_INITIAL_GRAVITY_Q16, REDUX_LOGICAL_TICKS_PER_SECOND, REDUX_CLOCK_STEPS_PER_MICROSECOND,
  initializeRaceGravity, advanceRaceStepCount, raceClockToNativeTime, decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {formatLapTimeDigits} from '../src/lap-timing.mjs';

test('native race time retains sub-tenth fractions and shift-before-divide wrap', () => {
  assert.deepEqual([0, 1, 2, 3, 30, 300].map(raceClockToNativeTime), [0, 682, 1365, 2048, 20480, 204800]);
  assert.equal(raceClockToNativeTime(0x1fffff), 1431655082);
  assert.equal(raceClockToNativeTime(0x200000), 0);
  assert.equal(raceClockToNativeTime(-1), 1431655082);
  assert.equal(REDUX_INITIAL_GRAVITY_Q16, 65536);
});

test('native HUD formatting confirms 30 logical clocks produce one displayed second', () => {
  assert.equal(REDUX_LOGICAL_TICKS_PER_SECOND, 30);
  const originalScale = Buffer.from('681d554d1075ff3e', 'hex').readDoubleLE();
  assert.equal(REDUX_CLOCK_STEPS_PER_MICROSECOND, originalScale);
  const record = Buffer.alloc(0x50);
  for (const [clock, expected] of [[0, 0x00a00a00], [30, 0x00a10a00], [300, 0x00a01a00], [1800, 0x00a00a10]]) {
    record.writeInt32LE(raceClockToNativeTime(clock), 0x2c);
    formatLapTimeDigits(record);
    assert.equal(record.readUInt32LE(0x3c), expected);
  }
});

test('normal race gravity honors exact configuration bytes and the separate startup mode', () => {
  const memory = Buffer.alloc(0xa00000), config = 0x50000;
  memory.writeUInt32LE(config, 0x5ecefc);
  for (const [option, expected] of [[0, 65536], [1, 45000], [2, 20000], [255, 65536]]) {
    memory[config + 0x97] = option;
    assert.equal(initializeRaceGravity({memory}), expected);
  }
  memory[config + 0x82] = 1; memory[config + 0x97] = 2;
  assert.equal(initializeRaceGravity({memory}), 65536);
  memory.writeInt32LE(1, 0x5eb518); memory.writeInt32LE(123, 0x5eb5e0);
  assert.equal(initializeRaceGravity({memory}), 123);
});

test('native client catch-up waits ten small backlogs, caps large ones, and resets offline', () => {
  const memory = Buffer.alloc(0xa00000);
  memory.writeUInt32LE(0x83, 0x6eafe0); memory.writeUInt32LE(1, 0x6e66f8);
  for (let index = 0; index < 9; index++) assert.equal(advanceRaceStepCount(memory.readUInt32LE(0x6e66f8) + 2, {memory}), 1);
  assert.equal(advanceRaceStepCount(memory.readUInt32LE(0x6e66f8) + 2, {memory}), 2);
  assert.equal(advanceRaceStepCount(memory.readUInt32LE(0x6e66f8) + 100, {memory}), 3);
  memory.writeUInt32LE(0, 0x6eafe0);
  assert.equal(advanceRaceStepCount(0xffffffff, {memory}), 1);
  assert.equal(memory.readUInt32LE(0x6e66e4), 0);
  memory.writeUInt32LE(0xffffffff, 0x6e66f8);
  assert.equal(advanceRaceStepCount(0xffffffff, {memory}), 1);
  assert.equal(memory.readUInt32LE(0x6e66f8), 0);
});

test('captured x87 and SSE contexts preserve independently selected rounding and precision', () => {
  const nearest = decodePhysicsNumericalContext({x87ControlWord: 0x27f, mxcsr: 0x1f80});
  assert.equal(nearest.x87.precisionBits, 53);
  assert.equal(nearest.x87.roundingMode, 'nearest-even');
  assert.equal(nearest.sse.roundingMode, 'nearest-even');
  for (let x87 = 0; x87 < 4; x87++) for (let sse = 0; sse < 4; sse++) {
    const result = decodePhysicsNumericalContext({x87ControlWord: 0x37f | (x87 << 10), mxcsr: 0x9fc0 | (sse << 13)});
    assert.equal(result.x87.roundingMode, ['nearest-even', 'down', 'up', 'toward-zero'][x87]);
    assert.equal(result.sse.roundingMode, ['nearest-even', 'down', 'up', 'toward-zero'][sse]);
    assert.equal(result.x87.precisionBits, 64);
    assert.equal(result.sse.flushToZero, true);
    assert.equal(result.sse.denormalsAreZero, true);
  }
  assert.equal(decodePhysicsNumericalContext({x87ControlWord: 0x17f, mxcsr: 0}).x87.precisionBits, null);
  assert.throws(() => decodePhysicsNumericalContext({mxcsr: 0x1f80}), /captured x87/);
  assert.throws(() => decodePhysicsNumericalContext({x87ControlWord: 0x27f, mxcsr: 0x10000}), /captured MXCSR/);
});
