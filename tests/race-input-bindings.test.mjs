import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRaceInputCalibration, readRaceInputButtonMask} from '../src/race-input-bindings.mjs';

test('button masks combine original binding slots independently for each participant bank', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeUInt32LE(0x10000, 0x5ecefc);
  for (const [index, base] of [0x908ea0, 0x908b20, 0x908ce0, 0x908960].entries()) {
    memory[0x10000 + index * 0x90 + 0x1a3] = 1;
    for (let bits = 0; bits < 16; bits++) {
      for (const [j, offset] of [4, 20, 68, 36].entries()) memory.writeInt32LE((bits >> j) & 1, base + offset);
      assert.equal(readRaceInputButtonMask(index, {memory}), ((bits & 3) ? 0x84 : 0) | ((bits & 4) ? 0x82 : 0) | ((bits & 8) ? 0x81 : 0));
    }
    memory[0x10000 + index * 0x90 + 0x1a3] = 0; assert.equal(readRaceInputButtonMask(index, {memory}), 0);
  }
  assert.equal(readRaceInputButtonMask(4, {memory: Buffer.alloc(0)}), 0);
});

test('calibration follows pointer counts and rereads the device binding between separate lookups', () => {
  const memory = Buffer.alloc(0xa00000), log = []; memory.writeUInt32LE(0x10000, 0x57070c); memory.writeInt32LE(1, 0x10000); memory.writeUInt32LE(0x11000, 0x574734);
  memory.writeInt32LE(1, 0x11004); memory.writeInt32LE(7, 0x11008); memory.writeUInt32LE(0x12000, 0x714b54);
  let lookups = 0;
  const result = selectRaceInputCalibration(0, 7, {memory, scratchBase: 0x9000, handlers: {inputManagerCall(owner, method, args, context) {
    log.push([owner, method, args, context.scratchBase]);
    if (method === 0x14) {lookups++; memory.writeInt32LE(17, 0x11008); return 0x13000;}
    return lookups === 1 ? 1 : 0;
  }}});
  assert.equal(result, 0); assert.deepEqual(log, [[0x12000, 0x14, [7, 3], 0x9000 - 20], [0x13000, 0x30, [], 0x9000 - 12], [0x12000, 0x14, [17, 3], 0x9000 - 20], [0x13000, 0x30, [], 0x9000 - 12]]);
});

test('a nonstandard device kind returns calibration2 after the first lookup', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeUInt32LE(0x10000, 0x57070c); memory.writeInt32LE(1, 0x10000); memory.writeUInt32LE(0x11000, 0x574734); memory.writeInt32LE(1, 0x11004); memory.writeInt32LE(7, 0x11008);
  let calls = 0; const result = selectRaceInputCalibration(0, 7, {memory, scratchBase: 0x9000, handlers: {inputManagerCall(owner, method) {calls++; return method === 0x14 ? 0x13000 : -1;}}});
  assert.equal(result, 2); assert.equal(calls, 2);
});
