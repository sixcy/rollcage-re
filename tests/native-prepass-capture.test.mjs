import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePrepassCaptureConfig, nativePrepassBoundaries} from '../tools/prepare-native-prepass-capture.mjs';
import {nativePostFrameBoundaries} from '../tools/lib/native-post-frame-replay.mjs';

test('recovery prepass capture observes the retained real caller and balanced entry/return without gameplay writes', async () => {
  assert.deepEqual(nativePrepassBoundaries, nativePostFrameBoundaries.prepass);
  const {configuration: config} = await createNativePrepassCaptureConfig('synthetic', 'never-launched');
  const before = config.breakpoints.find(row => row.id === 'native-prepass-before'), after = config.breakpoints.find(row => row.id === 'native-prepass-after');
  assert.equal(before.rva, '0x7e180'); assert.equal(after.rva, '0x7e234'); assert.equal(after.stopAfterHits, 3);
  assert.deepEqual(before.ranges, after.ranges); assert.deepEqual(before.captureWhen, after.captureWhen);
  assert.equal(before.captureWhen.equalsBytesHex, '04000000');
  assert.ok(config.phaseActions.every(row => !row.breakpointId.startsWith('native-prepass-')));
  assert.equal(config.pendingFrameObserver, undefined);
  await assert.rejects(createNativePrepassCaptureConfig('unused', 'unused', {stackBytesBefore: 4}), /saved-register/);
  await assert.rejects(createNativePrepassCaptureConfig('unused', 'unused', {frames: 4}), /bounded frames/);
});

test('optional physics breadcrumb distinguishes missing stage observations without replacing recovery evidence', async () => {
  const {configuration: config} = await createNativePrepassCaptureConfig('synthetic', 'never-launched', {includePhysicsBreadcrumb: true});
  const breadcrumb = config.breakpoints.find(row => row.id === 'physics-entry-breadcrumb');
  assert.equal(breadcrumb.rva, '0x749e0'); assert.equal(breadcrumb.ranges.length, 3);
  assert.equal(breadcrumb.captureWhen.equalsBytesHex, '04000000');
  assert.equal(config.maxSnapshots, 12); assert.equal(config.stopThreadStackBytes, 512);
  assert.equal(config.breakpoints.find(row => row.id === 'native-prepass-after').stopAfterHits, 3);
});
