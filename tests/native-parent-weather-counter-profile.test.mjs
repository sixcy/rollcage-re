import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration} from '../tools/lib/native-parent-rtti-capture.mjs';
import {nativeParentWeatherCounterSites,nativeParentWeatherCounterImportRange,nativeParentWeatherCounterCapability,verifyNativeParentWeatherCounterEvidence} from '../tools/lib/native-parent-weather-counter.mjs';

test('counter option preserves defaults and adds only two cold sites and original import observations within existing total bounds',async()=>{
  for(const viewportMapGraph of [false,true]){
    const options={viewportMapGraph,weatherScreenQueries:true,tyreSound2:true};
    const old=await createNativeParentRttiCaptureConfig('synthetic','never-launch',options),off=await createNativeParentRttiCaptureConfig('synthetic','never-launch',{...options,weatherCounterObservation:false});
    assert.deepEqual(off.configuration,old.configuration);
    const on=await createNativeParentRttiCaptureConfig('synthetic','never-launch',{...options,weatherCounterObservation:true}),c=on.configuration;
    assert.equal(c.maxSnapshots,21);assert.equal(c.maxDurationMs,90000);assert.equal(c.maxEvents,1000000);assert.equal(c.breakpoints.length,17);assert.equal(c.phaseActions.length,old.configuration.phaseActions.length);assert.equal(on.requiredHelperCapability,nativeParentWeatherCounterCapability);
    const restored=structuredClone(c);delete restored.parentRttiObservation.weatherCounterObservation;
    restored.breakpoints=restored.breakpoints.filter(row=>!nativeParentWeatherCounterSites.some(site=>site.id===row.id));
    let count=0;for(const point of restored.breakpoints){count+=point.ranges.filter(row=>row.id===nativeParentWeatherCounterImportRange().id).length;point.ranges=point.ranges.filter(row=>row.id!==nativeParentWeatherCounterImportRange().id);}
    assert.equal(count,10);assert.deepEqual(restored,old.configuration);
    assert.equal(verifyNativeParentRttiCaptureConfiguration(c).weatherCounterObservation,true);
    for(const change of [
      x=>delete x.parentRttiObservation.weatherScreenQueries,
      x=>x.parentRttiObservation.weatherCounterObservation.maxSnapshots++,
      x=>x.parentRttiObservation.weatherCounterObservation.extra=true,
      x=>x.breakpoints.at(-1).rva='0x89d14',
      x=>x.breakpoints.at(-1).ranges.push({id:'arbitrary',baseRegister:'esp',length:8}),
      x=>x.breakpoints[3].ranges=x.breakpoints[3].ranges.filter(row=>row.id!==nativeParentWeatherCounterImportRange().id),
      x=>x.breakpoints[0].ranges.push(nativeParentWeatherCounterImportRange()),
      x=>x.maxSnapshots=23,
    ]){const bad=structuredClone(c);change(bad);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(bad));}
  }
  await assert.rejects(createNativeParentRttiCaptureConfig('synthetic','never-launch',{weatherCounterObservation:true}));
  await assert.rejects(createNativeParentRttiCaptureConfig('synthetic','never-launch',{weatherScreenQueries:true,weatherCounterObservation:1}));
});

test('counter CALL/stack producers are checked against exact-target retained instructions',async()=>{
  const proof=await verifyNativeParentWeatherCounterEvidence();assert.equal(proof.evidenceIds.length,2);
});
