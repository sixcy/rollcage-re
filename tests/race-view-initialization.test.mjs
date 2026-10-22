import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRaceViewTransform, buildRaceViewMatrix, publishRaceViewMatrix} from '../src/race-view-initialization.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';

test('race view construction applies doubled axes and optional reflection to captured translation', () => {
  for (const mirror of [0, 1]) {
    const memory = Buffer.alloc(0xa00000); initializeWheelRenderTables(memory); memory.writeInt32LE(mirror, 0x91ceb4);
    const runtime = {memory, scratchBase: 0x9000}; initializeRaceViewTransform(runtime);
    for (const offset of [0, 8, 16]) memory.writeInt16LE(4096, 0x20000 + offset);
    for (const [i, value] of [7, -11, 23].entries()) memory.writeInt32LE(value, 0x21000 + i * 4);
    buildRaceViewMatrix(0x22000, 0x20000, 0x21000, runtime); publishRaceViewMatrix(0x22000, runtime);
    assert.deepEqual([0, 4, 8].map(o => memory.readInt32LE(0x91d374 + o)), [mirror ? -14 : 14, -22, 46]);
    assert.deepEqual([0, 4, 8].map(o => memory.readFloatLE(0x91cdb0 + o)), [mirror ? -14 : 14, -22, 46]);
    assert.equal(memory.readFloatLE(0x91cdc0), mirror ? -2 : 2); assert.equal(memory.readFloatLE(0x91cdd4), 2); assert.equal(memory.readFloatLE(0x91cde8), 2);
  }
});

test('race transform resets only the native six angle bytes and preserves the following WORD', () => {
  const memory = Buffer.alloc(0xa00000); initializeWheelRenderTables(memory); memory.fill(0x55, 0x6fb528, 0x6fb530);
  initializeRaceViewTransform({memory, scratchBase: 0x9000}); assert(memory.subarray(0x6fb528, 0x6fb52e).every(v => !v)); assert.equal(memory.readUInt16LE(0x6fb52e), 0x5555);
});
