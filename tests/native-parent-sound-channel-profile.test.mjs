import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {nativeParentRttiPolicy, verifyNativeParentRttiCaptureConfiguration} from '../tools/lib/native-parent-rtti-capture.mjs';
import {nativeParentSoundChannelGraphPolicy, nativeParentSoundChannelGraphCapability} from '../tools/lib/native-parent-sound-channel-graph.mjs';

test('channel input transport is optional and changes only the nested owner policy', async () => {
  const options = {viewportMapGraph:true,weatherScreenQueries:true,weatherCounterObservation:true,tyreSound2:true,surfaceSound7:true,soundBankOwners:true};
  const legacy = await createNativeParentRttiCaptureConfig('synthetic','never-launched-channel-profile',options);
  const enabled = await createNativeParentRttiCaptureConfig('synthetic','never-launched-channel-profile',{...options,soundBankChannels:true});
  const restored = structuredClone(enabled.configuration);
  assert.deepEqual(restored.parentRttiObservation.soundBankOwnerGraph.channelGraph,nativeParentSoundChannelGraphPolicy());
  delete restored.parentRttiObservation.soundBankOwnerGraph.channelGraph;
  assert.deepEqual(restored,legacy.configuration);
  assert.equal(enabled.requiredHelperCapability,nativeParentSoundChannelGraphCapability);
  assert.equal(enabled.configuration.maxDurationMs,90000);
  assert.equal(enabled.configuration.maxSnapshots,21);
  assert.equal(enabled.configuration.breakpoints.length,17);
  assert.equal(verifyNativeParentRttiCaptureConfiguration(enabled.configuration).soundBankChannels,true);
  assert.throws(()=>nativeParentRttiPolicy({soundBankChannels:true}),/requires owner/);
  await assert.rejects(()=>createNativeParentRttiCaptureConfig('synthetic','never-launched-channel-profile',{...options,soundBankChannels:1}),/boolean/);
});

test('channel policy cannot broaden pointer types, extents, observation bounds or configured ranges', async () => {
  const {configuration} = await createNativeParentRttiCaptureConfig('synthetic','never-launched-channel-policy',{soundBankOwners:true,soundBankChannels:true});
  for (const change of [
    p=>{p.maxUsedChannelSlots=257;},p=>{p.wrapperBytes=16;},p=>{p.sourceBytes=0x1000;},
    p=>{p.sourceVtableRva='0x1d3f64';},p=>{p.vtableBytes=0x100;},p=>{p.readableRegion=true;},
  ]) {
    const changed=structuredClone(configuration);change(changed.parentRttiObservation.soundBankOwnerGraph.channelGraph);
    assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(changed),/purpose policy/);
  }
  for (const point of configuration.breakpoints) {
    const changed=structuredClone(configuration), target=changed.breakpoints.find(p=>p.id===point.id);
    target.ranges.push({id:'parent-sound-channel-wrapper-0',rva:'0x2f2414',length:12});
    assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(changed));
  }
});
