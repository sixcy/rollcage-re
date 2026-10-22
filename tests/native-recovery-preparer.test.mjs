import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeRecoveryCaptureConfig,nativeRecoveryBoundaries,nativeRecoveryDependencyRanges,nativeRecoveryApplicationRanges,verifyNativeRecoveryDependencyProducers} from '../tools/prepare-native-recovery-capture.mjs';
import {createNativeFrameCaptureConfig} from '../tools/prepare-native-frame-capture.mjs';
import {nativePostFrameBoundaries} from '../tools/lib/native-post-frame-replay.mjs';
import {nativeRecoveryGlobalRegions} from '../tools/lib/native-recovery-context.mjs';

test('recovery preparer retains full bootstrap and observes genuine parent entry/preRET without gameplay actions',async()=>{
  const options={frames:3,skipFrames:120,stackBytesBefore:4096,attachmentWindowBytes:1024};
  const [result,original]=await Promise.all([createNativeRecoveryCaptureConfig('synthetic','never-launched-recovery',options),createNativeFrameCaptureConfig('synthetic','never-launched-recovery',options)]);
  assert.deepEqual(nativeRecoveryBoundaries,nativePostFrameBoundaries.parent);
  const config=result.configuration,before=config.breakpoints.find(row=>row.id==='native-recovery-before'),after=config.breakpoints.find(row=>row.id==='native-recovery-after');
  assert.equal(before.rva,'0x7ccc0');assert.equal(after.rva,'0x7d02d');assert.equal(after.stopAfterHits,3);
  assert.equal(before.skipMatchingHits,120);assert.equal(after.skipMatchingHits,120);
  assert.deepEqual(before.ranges,after.ranges);assert.notEqual(before.ranges,after.ranges);
  assert.deepEqual(before.captureWhen,original.configuration.breakpoints.find(row=>row.id==='native-frame-before').captureWhen);
  assert.deepEqual(config.phaseActions,original.configuration.phaseActions);assert.equal(config.pendingFrameObserver,undefined);
  assert.deepEqual(config.breakpoints.filter(row=>!row.id.startsWith('native-recovery-')),original.configuration.breakpoints.filter(row=>!row.id.startsWith('native-frame-')));
  assert.equal(config.maxSnapshots,9);assert.equal(config.maxDurationMs,90000);
  const inherited=original.configuration.breakpoints.find(row=>row.id==='native-frame-before').ranges;
  assert.deepEqual(before.ranges.slice(0,inherited.length),inherited);
  assert.equal(new Set(before.ranges.map(row=>row.id)).size,before.ranges.length);
  for(const row of nativeRecoveryGlobalRegions)assert.deepEqual(before.ranges.find(value=>value.id===row.id),{id:row.id,rva:`0x${(row.preferredAddress-0x400000).toString(16)}`,length:row.length});
  assert.ok(result.evidenceIds.length>=8);assert.ok(result.limitations.some(row=>row.includes('no rejection/respawn')));
});

test('recovery descendants follow actual loader roots and keep empty/sentinel structures opaque',()=>{
  const rows=nativeRecoveryDependencyRanges({maxRegionBytes:0x100000}),byId=new Map(rows.map(row=>[row.id,row]));
  for(const[id,preferred]of [['recovery-route-groups-region',0x9092a0],['recovery-route-points-region',0x9092a4],['recovery-checkpoint-records-region',0x9092b0],['recovery-checkpoint-ids-region',0x9092d0]]){
    const row=byId.get(id);assert.equal(Number(row.rva),preferred-0x400000);assert.deepEqual(row.dereferenceOffsets,['0']);assert.equal(row.readableRegion,true);assert.equal(row.maxRegionBytes,0x100000);assert.equal(row.length,undefined);
  }
  //Empty group0 need not have a usable point pointer in arbitrary native
  //states. Capture the independently published pointBASE, never group0+8.
  assert.deepEqual(byId.get('recovery-route-points-region').dereferenceOffsets,['0']);
  assert.deepEqual(byId.get('recovery-participant-controls'),{id:'recovery-participant-controls',rva:'0x509060',length:6*0x4c});
  assert.deepEqual(byId.get('recovery-profile-table'),{id:'recovery-profile-table',rva:'0x51f6a0',dereferenceOffsets:['0'],length:8});
  assert.ok(rows.every(row=>Number(row.rva)!==0x30eb18&&Number(row.rva)!==0x30f130));
  assert.ok(rows.every(row=>!row.dereferenceOffsets||row.dereferenceOffsets.length===1));
});

test('recovery preparation rejects invalid observer/storage bounds before writing or executing anything',async()=>{
  for(const options of [{frames:0},{frames:4},{skipFrames:-1},{skipFrames:0x80000000},{stackBytesBefore:100},{stackBytesBefore:65537},{maxRegionBytes:0},{attachmentWindowBytes:3}])await assert.rejects(createNativeRecoveryCaptureConfig('unused','unused',options));
  for(const maxRegionBytes of [0,-1,0x4000001,1.5])assert.throws(()=>nativeRecoveryDependencyRanges({maxRegionBytes}),/Invalid recovery/);
});

test('route, checkpoint, profile and controller roots retain target-bound producer evidence',async()=>{
  const result=await verifyNativeRecoveryDependencyProducers();assert.equal(result.evidenceIds.length,3);assert.equal(new Set(result.evidenceIds).size,3);
});

test('opt-in application selection buffers complete parents using exact used-byte domain and full unfiltered ABI inputs',async()=>{
  const {configuration:config,selection}=await createNativeRecoveryCaptureConfig('synthetic','never-launched',{selection:'first-respawn-application'}),pending=config.pendingFrameObserver,event=config.breakpoints.find(row=>row.id==='native-recovery-apply-entry');
  assert.equal(selection,'first-respawn-application');assert.equal(config.breakpoints.find(row=>row.id==='native-recovery-after').stopAfterHits,1);assert.equal(config.maxSnapshots,69);
  assert.equal(event.rva,'0x7d440');assert.equal(event.captureWhen,undefined);assert.deepEqual(event.ranges,nativeRecoveryApplicationRanges());
  assert.deepEqual(event.ranges.find(row=>row.id==='recovery-apply-arguments'),{id:'recovery-apply-arguments',baseRegister:'esp',length:24});
  assert.deepEqual(event.ranges.find(row=>row.id==='recovery-apply-route'),{id:'recovery-apply-route',baseRegister:'esp',dereferenceOffsets:['12'],length:12});
  assert.deepEqual(event.ranges.find(row=>row.id==='recovery-apply-pack-header'),{id:'recovery-apply-pack-header',rva:'0x50b98c',dereferenceOffsets:['0'],length:0xa0});
  assert.equal(pending.eventStackOffset,-124);assert.equal(pending.eventReturnRva,'0x7cf3c');assert.equal(pending.eventRecordBytes,1);assert.equal(pending.maxCandidateFrames,1200);
  assert.deepEqual(pending.eventPoolRoot,{id:'recovery-body-arena-root',rva:'0x2e6b40',length:4});assert.deepEqual(pending.eventPoolCapacity,{id:'recovery-body-arena-used-bytes',rva:'0x30dcf4',length:4});
  for(const bp of config.breakpoints.filter(row=>['native-recovery-before','native-recovery-after'].includes(row.id))){assert.equal(bp.ranges.find(row=>row.id==='recovery-sound43-owner').length,0x490);assert.ok(bp.ranges.some(row=>row.id==='recovery-sound-bank-region'));assert.ok(!bp.ranges.some(row=>row.id==='recovery-sound43-channel-vector-region'));}
  for(const options of [{selection:'guessed'},{selection:'first-respawn-application',frames:3},{selection:'first-respawn-application',maxCandidateFrames:10001},{selection:'first-respawn-application',maxApplicationSnapshots:65}])await assert.rejects(createNativeRecoveryCaptureConfig('unused','unused',options));
});
