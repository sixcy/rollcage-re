import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRaceHudFonts} from '../tools/verify-race-hud-fonts-instructions.mjs';

test('installed font bitmap produces actual glyph bounds, atlas positions and native image bytes', async () => {
  const report = await verifyRaceHudFonts({fixtures: 1, output: null, afterFixture({memory: m}) {
    assert.equal(m.readInt32LE(0x913ea8), 17);
    assert.equal(m.readInt32LE(0x913eac), 112);
    const glyph = index => Array.from({length: 7}, (_, i) => m.readInt16LE(0x913ea0 + 28 + index * 16 + i * 2));
    assert.deepEqual(glyph(0), [2, 2, 11, 12, 62, 1, 1]);
    assert.deepEqual(glyph(26), [2, 5, 8, 10, 62, 57, 17]);
    assert.deepEqual(glyph(111), [0, 0, 9, 2, 62, 103, 70]);
  }});
  assert.equal(report.matched, true); assert.equal(report.uploads, 1);
});
