import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameCaptureConfig} from '../tools/prepare-native-frame-capture.mjs';
import {createNativeFeedbackCaptureConfig} from '../tools/prepare-native-feedback-capture.mjs';
import {nativeFrameDriveInputRegions} from '../tools/lib/native-frame-drive-continuation.mjs';

test('drive feedback observer preserves frame policies and adds only bounded module reads', async () => {
  const args = ['analysis/native-physics-local/startup-20261022', 'analysis/unused-feedback-test',
    {frames: 3, skipFrames: 60, stackBytesBefore: 4096}];
  const original = await createNativeFrameCaptureConfig(...args);
  const extended = await createNativeFeedbackCaptureConfig(...args);
  const stripped = structuredClone(extended.configuration);
  const expected = nativeFrameDriveInputRegions.map(({id, preferredAddress, length}) => ({
    id, rva: `0x${(preferredAddress - 0x400000).toString(16)}`, length,
  }));
  for (const breakpoint of stripped.breakpoints) {
    if (!['native-frame-before', 'native-frame-after'].includes(breakpoint.id)) continue;
    assert.deepEqual(breakpoint.ranges.splice(-expected.length), expected);
  }
  assert.deepEqual(stripped, original.configuration);
  assert.equal(extended.configuration.maxDurationMs, 90000);
  assert.equal(extended.configuration.maxSnapshots, 9);
  assert.ok(expected.every(row => Number.isInteger(row.length) && row.length > 0 && row.length <= 0x4000));
});
