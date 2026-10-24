import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeParentFinalCaptureConfig} from '../tools/prepare-native-parent-final-capture.mjs';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration} from '../tools/lib/native-parent-rtti-capture.mjs';

test('separate final-return purpose reserves one extra snapshot and preserves the complete original startup',async()=>{
  const options={viewportMapGraph:true,weatherScreenQueries:true,weatherCounterObservation:true,soundBankOwners:true,soundBankChannels:true,tyreSound2:true,surfaceSound7:true,collisionSound19:true};
  const legacy=(await createNativeParentRttiCaptureConfig('synthetic','never-launched-final',options)).configuration;
  const prepared=await createNativeParentFinalCaptureConfig('synthetic','never-launched-final'),c=prepared.configuration,restored=structuredClone(c);
  assert.equal(c.maxSnapshots,22);assert.equal(c.breakpoints.length,18);assert.equal(c.maxDurationMs,90000);assert.equal(c.maxEvents,1000000);
  assert.equal(prepared.preparedOnly,true);assert.equal(prepared.requiredHelperCapability,'scoped-parent-final-tick-v1');
  assert.deepEqual(c.phaseActions,legacy.phaseActions);assert.deepEqual(c.breakpoints.slice(0,3),legacy.breakpoints.slice(0,3));
  assert.deepEqual(c.breakpoints.at(-1),{id:'native-parent-return',rva:'0x50e38',stopAfterHits:1,ranges:c.breakpoints.find(p=>p.id==='native-control-after-world-effects').ranges});
  assert.equal(c.parentRttiObservation.soundBankOwnerGraph.breakpointIds.length,11);assert.equal(c.parentRttiObservation.viewportMapGraph.breakpointIds.length,4);
  assert.equal(verifyNativeParentRttiCaptureConfiguration(c).frames,1);
  restored.maxSnapshots=21;restored.breakpoints.pop();restored.breakpoints.find(p=>p.id==='native-control-after-world-effects').stopAfterHits=1;
  delete restored.parentRttiObservation.finalTick;
  restored.parentRttiObservation.soundBankOwnerGraph.breakpointIds.pop();restored.parentRttiObservation.viewportMapGraph.breakpointIds.pop();restored.parentRttiObservation.singletonMapPreflight.breakpointIds.pop();
  assert.deepEqual(restored,legacy,'No unrelated configuration, range, startup or intervention change');
});

test('final purpose rejects moved/filtered return sites, missing scope, excessive budgets and forged graph ranges',async()=>{
  const {configuration}=await createNativeParentFinalCaptureConfig('synthetic','never-launched-final');
  for(const mutate of[
    c=>{c.maxSnapshots=23;},c=>{c.maxDurationMs++;},c=>{c.breakpoints.at(-1).rva='0x511208';},
    c=>{c.breakpoints.at(-1).stopAfterHits=0;},c=>{c.breakpoints.at(-1).skipMatchingHits=0;},
    c=>{c.breakpoints.at(-1).captureWhen=structuredClone(c.breakpoints[3].captureWhen);},
    c=>{c.breakpoints.find(p=>p.id==='native-control-after-world-effects').stopAfterHits=1;},
    c=>{c.parentRttiObservation.finalTick.lightBands.maxBandBytes++;},
    c=>{c.parentRttiObservation.finalTick.listenerWrappers.wrapperBytes=88;},
    c=>{c.parentRttiObservation.finalTick.masterLevel.methodRva='0xa90e4';},
    c=>{delete c.parentRttiObservation.weatherCounterObservation;},c=>{delete c.parentRttiObservation.viewportMapGraph;},
    c=>{c.parentRttiObservation.soundBankOwnerGraph.breakpointIds.pop();},
    c=>{c.breakpoints.at(-1).ranges.push({id:'parent-final-light-bands',rva:'0x40f208',length:2400});},
  ]){const c=structuredClone(configuration);mutate(c);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(c));}
  for(const option of['weatherScreenQueries','viewportMapGraph','soundBankChannels','finalTick'])assert.throws(()=>createNativeParentFinalCaptureConfig('synthetic','never-launched-final',{[option]:false}));
});
