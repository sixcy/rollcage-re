import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeEventFrameCaptureConfig} from '../tools/prepare-native-event-frame-capture.mjs';
import {nativeFrameGlobalRegions} from '../tools/lib/native-frame-manifest.mjs';

test('event-frame observer preserves full before/after and bounds direct native dispatch observations without writes', async () => {
  const result = await createNativeEventFrameCaptureConfig('analysis/native-physics-local/startup-20261022', 'analysis/never-launched-event-fixture');
  const config = result.configuration, dispatch = config.breakpoints.find(row => row.id === 'native-dispatch-entry');
  assert.equal(config.maxSnapshots, 69);
  assert.equal(dispatch.rva, '0x74bb0');
  assert.deepEqual(dispatch.captureWhen, {range: {id: 'dispatch-clock', rva: '0x50a548', length: 4}, equalsBytesHex: '5c010000'});
  assert.deepEqual(dispatch.ranges.slice(-2), [{id: 'dispatch-event', baseRegister: 'ecx', length: 104}, {id: 'dispatch-return', baseRegister: 'esp', length: 4}]);
  assert.equal(dispatch.ranges.length, nativeFrameGlobalRegions.length + 2);
  assert.equal(dispatch.stopAfterHits, undefined);
  assert.equal(config.breakpoints.find(row => row.id === 'native-frame-before').skipMatchingHits, 120);
  assert.equal(config.breakpoints.find(row => row.id === 'native-frame-after').stopAfterHits, 1);
  assert.ok(!config.phaseActions.some(row => row.breakpointId === dispatch.id));
  for (const options of [{logicalClock: -1}, {logicalClock: 0x100000000}, {logicalClock: 1.5}, {maxDispatchSnapshots: 0}, {maxDispatchSnapshots: 257}]) {
    await assert.rejects(createNativeEventFrameCaptureConfig('unused', 'unused', options));
  }
});

test('body-pair selection declares an exact native kind predicate and keeps complete parent observations', async () => {
  const result = await createNativeEventFrameCaptureConfig('synthetic', 'new-output', {selection: 'first-body-pair'});
  const config = result.configuration;
  assert.equal(result.logicalClock, null);
  assert.deepEqual(config.breakpoints.find(row => row.id === 'native-dispatch-entry').captureWhen, {
    range: {id: 'dispatch-kind', baseRegister: 'ecx', length: 4}, equalsBytesHex: '00000000',
  });
  assert.equal(config.pendingFrameObserver.eventRecordBytes, 104);
  assert.equal(config.breakpoints.find(row => row.id === 'native-frame-before').skipMatchingHits, 120);
  assert.equal(config.breakpoints.find(row => row.id === 'native-frame-after').stopAfterHits, 1);
});

test('first-collision preparation declares a bounded host observer and preserves every dispatcher call', async () => {
  const result = await createNativeEventFrameCaptureConfig('analysis/native-physics-local/startup-20261022', 'analysis/never-launched-collision-fixture', {selection: 'first-collision'});
  const config = result.configuration, event = config.breakpoints.find(row => row.id === 'native-dispatch-entry');
  assert.equal(result.logicalClock, null);
  assert.equal(event.captureWhen, undefined);
  assert.equal(event.skipMatchingHits, undefined);
  assert.deepEqual(config.pendingFrameObserver, {
    beforeBreakpointId: 'native-frame-before', afterBreakpointId: 'native-frame-after', eventBreakpointId: 'native-dispatch-entry',
    maxPendingBytes: 134217728, maxCandidateFrames: 600, maxEventSnapshots: 64,
    eventStackOffset: -28, eventReturnRva: '0x74ada', eventPointerRegister: 'ecx', eventRecordBytes: 104,
    eventPoolRoot: {id: 'dispatch-pool-root', rva: '0x502ba8', length: 4},
    eventPoolCapacity: {id: 'dispatch-pool-capacity', rva: '0x502ba4', length: 4},
  });
  assert.ok(config.phaseActions.every(row => !['native-frame-before', 'native-frame-after', event.id].includes(row.breakpointId)));
  await assert.rejects(createNativeEventFrameCaptureConfig('unused', 'unused', {selection: 'guess'}), /selection/);
  await assert.rejects(createNativeEventFrameCaptureConfig('unused', 'unused', {selection: 'first-collision', maxDispatchSnapshots: 65}), /at most64/);
});
