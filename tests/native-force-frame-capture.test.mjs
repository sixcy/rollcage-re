import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeForceFrameCaptureConfig} from '../tools/prepare-native-force-frame-capture.mjs';

test('force selection uses the original preparation call and explicit used-byte arena without force writes', async () => {
  const {configuration: config} = await createNativeForceFrameCaptureConfig('synthetic', 'never-launched');
  const force = config.breakpoints.find(row => row.id === 'native-force-entry'), observer = config.pendingFrameObserver;
  assert.equal(force.rva, '0x7b020'); assert.equal(force.captureWhen, undefined);
  assert.deepEqual(force.ranges.slice(-3), [
    {id: 'force-body-header', baseRegister: 'ecx', length: 384},
    {id: 'force-physical-body-list', rva: '0x502bc0', dereferenceOffsets: ['0'], length: 384},
    {id: 'force-caller', baseRegister: 'esp', length: 4},
  ]);
  assert.equal(config.captureThreadEnvironment, true);
  for (const bp of config.breakpoints.filter(row => ['native-frame-before', 'native-frame-after'].includes(row.id))) {
    assert.equal(bp.ranges.find(row => row.id === 'active-sound24-owner').length, 0x490);
    assert.deepEqual(bp.ranges.find(row => row.id === 'active-effect-lookup-bytes'), {id: 'active-effect-lookup-bytes', rva: '0x313180', dereferenceOffsets: ['0'], length: 64});
  }
  assert.equal(observer.eventStackOffset, -96); assert.equal(observer.eventReturnRva, '0x7a913'); assert.equal(observer.eventRecordBytes, 1);
  assert.deepEqual(observer.eventPoolRoot, {id: 'force-body-arena-root', rva: '0x2e6b40', length: 4});
  assert.deepEqual(observer.eventPoolCapacity, {id: 'force-body-arena-used-bytes', rva: '0x30dcf4', length: 4});
  assert.ok(config.phaseActions.every(row => ![observer.beforeBreakpointId, observer.afterBreakpointId, observer.eventBreakpointId].includes(row.breakpointId)));
  await assert.rejects(createNativeForceFrameCaptureConfig('unused', 'unused', {maxCandidateFrames: 601}), /candidate bound/);
});
