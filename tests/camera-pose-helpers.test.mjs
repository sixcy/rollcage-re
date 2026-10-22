import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceRawCameraDirection, publishCachedCameraMatrix, buildCameraBodyPose} from '../src/camera-pose-helpers.mjs';
import {verifyCameraPoseHelpers} from '../tools/verify-camera-pose-helpers-instructions.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), make = () => ({memory: Buffer.alloc(0xa00000), scratchBase: 0x9000});
test('raw reduction reloads vectors aliased onto its shared reduction globals', () => {
  const r = make(), m = r.memory, vector = 0x91d45c; assert.equal(reduceRawCameraDirection(vector, r), 0);
  assert.deepEqual([0, 4, 8].map(o => m.readInt32LE(vector + o)), [0, 32, -131072]);
});
test('raw reduction returns native shift count and retains arithmetic right shifts', () => {
  const r = make(), m = r.memory, vector = 0x110000; put(m, vector, -2147483648); assert.equal(reduceRawCameraDirection(vector, r), 9); assert.equal(m.readInt32LE(vector), -4194304);
});
test('matrix fallback copies the complete cached32bytes including padding', () => {
  const r = make(), m = r.memory, output = 0x111040, cache = 0x9200a0;
  for (let i = 0; i < 32; i++) m[cache + i] = i * 7;
  const expected = Buffer.from(m.subarray(cache, cache + 32)); assert.equal(publishCachedCameraMatrix(0x111000, 0x111020, output, 0, r), 0); assert.deepEqual(m.subarray(output, output + 32), expected);
});
test('camera body pose uses signed authored offset and preserves the partial local high halfword', () => {
  for (const positive of [0, 1]) {
    const r = make(), m = r.memory, body = 0x110000, output = 0x111040, direction = 0x111000; m.fill(0x69, 0x6000, 0xa000); m.writeFloatLE(1 / 4096, 0x5dc5f4);
    for (let i = 0; i < 9; i++) m.writeInt16LE(i % 4 ? 0 : 4096, body + 0xc4 + i * 2);
    [10, 20, 30].forEach((value, i) => put(m, body + 0x34 + i * 4, value * 65536)); put(m, direction + 8, 65536);
    assert.equal(buildCameraBodyPose(body, output, direction, positive, r), 1); assert.deepEqual([0, 4, 8].map(o => m.readInt32LE(output + o)), [10, positive ? 30 : 10, 50].map(v => v * 65536)); assert.equal(m.readUInt32LE(0x91d3e8), 0x69690014); assert.equal(m.readFloatLE(0x9014), 4096);
  }
});
test('camera pose/query/cache/reducer descendants match actual retained instructions', async () => {const report = await verifyCameraPoseHelpers({fixtures: 160, output: null}); assert.equal(report.matched, true); assert.ok(report.matrices > 0); assert.ok(report.fallbacks > 0); assert.ok(report.actualGameCalls['47d040'] > 0);});
