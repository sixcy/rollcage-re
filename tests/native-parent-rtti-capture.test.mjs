import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeParentTailCaptureConfig} from '../tools/prepare-native-parent-tail-capture.mjs';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration,nativeParentRttiMapBreakpointIds,nativeParentRttiMapCaptureRanges,nativeParentRttiRequiredCapability} from '../tools/lib/native-parent-rtti-capture.mjs';

const options={frames:1,through:'world-effects',includeAfterAiCheckpoint:true,collisionSound19:true,guardedAudioChannels:false,stackBytesBefore:64,skipFrames:60};
const fixture=()=>createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',options);

test('opt-in RTTI profile preserves all thirteen baseline observations and adds at most eight scoped snapshots',async()=>{
  const baseline=await createNativeParentTailCaptureConfig('synthetic','never-launched-rtti',options),f=await fixture(),config=f.configuration;
  assert.equal(baseline.configuration.maxSnapshots,13);assert.equal(baseline.configuration.parentRttiObservation,undefined);
  assert.equal(config.maxSnapshots,21);assert.equal(config.maxDurationMs,90000);assert.equal(config.captureThreadEnvironment,true);
  assert.equal(f.preparedOnly,true);assert.equal(f.launchBlockedUntilHelperCapability,true);assert.equal(f.requiredHelperCapability,nativeParentRttiRequiredCapability);
  const restored=structuredClone(config);delete restored.parentRttiObservation;restored.maxSnapshots-=8;
  restored.breakpoints=restored.breakpoints.filter(row=>!row.id.startsWith('native-parent-rtti-'));
  for(const point of restored.breakpoints)point.ranges=point.ranges.filter(row=>!row.id.startsWith('late-singleton-candidate-viewport-map-'));
  assert.deepEqual(restored,baseline.configuration);
  assert.equal(verifyNativeParentRttiCaptureConfiguration(config).maxExternalPairs,4);
});

test('map transport belongs only to three latched preflight points and never mixes unsupported range modes',async()=>{
  const {configuration:c}=await fixture();
  assert.deepEqual(c.parentRttiObservation.singletonMapPreflight.breakpointIds,[...nativeParentRttiMapBreakpointIds]);
  for(const point of c.breakpoints){
    const rows=point.ranges.filter(row=>row.id.startsWith('late-singleton-candidate-viewport-map-'));
    assert.deepEqual(rows,nativeParentRttiMapBreakpointIds.includes(point.id)?nativeParentRttiMapCaptureRanges():[]);
    for(const row of rows){assert.equal(row.bytes,undefined);assert.equal(row.preferredBytes,undefined);}
  }
  const [head,region]=nativeParentRttiMapCaptureRanges();
  assert.deepEqual(head.dereferenceMinimumValues,[1,1]);assert.equal(head.length,100);assert.equal(head.readableRegion,undefined);
  assert.equal(region.readableRegion,true);assert.equal(region.maxRegionBytes,16*1024*1024);assert.equal(region.dereferenceMinimumValues,undefined);
});

test('RTTI policy rejects unscoped sites, altered bounds, early activation, writes and changed stack/root domains',async()=>{
  const mutations=[
    c=>{delete c.parentRttiObservation;},c=>{c.parentRttiObservation.maxPairs=5;},c=>{c.parentRttiObservation.maxSnapshots=9;},
    c=>{c.parentRttiObservation.beginBreakpointId='native-control-before';},c=>{c.parentRttiObservation.endBreakpointId='native-control-after-world-effects';},
    c=>{c.maxSnapshots=22;},c=>{c.maxDurationMs=90001;},c=>{c.captureThreadEnvironment=false;},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-call').rva='0x2d85';},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-return').ranges[0].length=53;},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-call').captureWhen={equalsBytesHex:'04000000'};},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-call').stopAfterHits=1;},
    c=>{c.phaseActions.push({breakpointId:'native-parent-rtti-return',writes:[]});},
    c=>{c.breakpoints.push({id:'unscoped-rtti-copy',rva:'0x2d86',ranges:[]});},
    c=>{c.breakpoints.push({id:'extra-pose-site',rva:'0x510ef',ranges:[{id:'pose',baseRegister:'eax',length:12}]});},
    c=>{c.phaseActions.push({breakpointId:'unknown-game-write',writes:[{rva:'0x50a548',bytesHex:'00000000'}]});},
    c=>{c.phaseActions[0].writes[0].bytesHex='00000000';},
    c=>{c.breakpoints[0].ranges[0].length=8;},
    c=>{[c.breakpoints[3],c.breakpoints[4]]=[c.breakpoints[4],c.breakpoints[3]];},
    c=>{c.heldForceInput={};},c=>{c.services={};},c=>{c.denyRegistryWrites=false;},c=>{c.hideOwnedWindows=false;},c=>{c.maxEvents++;},
    c=>{c.breakpoints.find(x=>x.id==='native-control-after').writes=[];},
    c=>{c.parentRttiObservation.singletonMapPreflight.dereferenceOffsets=['0','0x78'];},
    c=>{c.parentRttiObservation.singletonMapPreflight.maxRegionBytes++;},
    c=>{c.parentRttiObservation.singletonMapPreflight.breakpointIds.pop();},
    c=>{c.breakpoints.find(x=>x.id==='native-control-before').ranges.find(x=>x.id==='late-singleton-candidate-viewport-map-head').dereferenceMinimumValues=[0,0];},
    c=>{c.breakpoints.find(x=>x.id==='native-control-before').ranges.find(x=>x.id==='late-singleton-candidate-viewport-map-region').dereferenceMinimumValues=[1,1];},
    c=>{c.breakpoints.find(x=>x.id==='native-control-after-physics').ranges.push(...nativeParentRttiMapCaptureRanges());},
  ];
  const original=(await fixture()).configuration;
  for(const mutate of mutations){const c=structuredClone(original);mutate(c);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(c));}
});

test('new RTTI creator rejects unsupported multi-parent or shorter observation windows',async()=>{
  for(const change of [{frames:2},{through:'cameras'},{includeAfterAiCheckpoint:false}])await assert.rejects(()=>createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,...change}),/one parent through world-effects/);
});
