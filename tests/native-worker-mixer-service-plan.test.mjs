import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {workerMixerLookupServiceLayout,verifyWorkerMixerServicePlanEvidence} from '../tools/lib/native-worker-mixer-service-plan.mjs';

test('retained worker and lookup prologues prove both stack layouts and three exact Win32 CALL/RET sites',async()=>{
  const proof=await verifyWorkerMixerServicePlanEvidence();assert.equal(proof.verified,true);assert.equal(proof.checkedInstructions,33);
  for(const base of [0x400000,0x6e0000])for(const lookup of [1,2]){
    const G=0x500000,manager=0x1600000,p=workerMixerLookupServiceLayout({gainEntryEsp:G,manager,moduleBaseAddress:base,lookup});
    assert.equal(p.lookupEntryEsp,G-(lookup===1?0x17c:0x198));assert.equal(p.frameEsp,p.lookupEntryEsp-16);
    assert.deepEqual(p.services.map(s=>[s.api,s.preCallEsp,s.serviceEntryEsp,s.postCallEsp]),[
      ['EnterCriticalSection',p.frameEsp-4,p.frameEsp-8,p.frameEsp],['GetCurrentThreadId',p.frameEsp,p.frameEsp-4,p.frameEsp],['LeaveCriticalSection',p.frameEsp-4,p.frameEsp-8,p.frameEsp]]);
    assert.equal(p.sites[0].stackBytesThroughMixerId,28);assert.equal(p.sites[1].stackBytesThroughMixerId,24);
    assert.equal(p.sites[1].address,base+0xa7a05);assert.equal(p.services[0].returnAddress,p.sites[1].address);
    assert.equal(p.win32Span.length,24);assert.equal(p.gameWrapperSpan.address,p.win32Span.address+24);assert.equal(p.gameWrapperSpan.length,8);
    assert.equal(p.services[0].returnValueDefined,false);assert.equal(p.services[2].returnValueDefined,false);assert.equal(p.capturePolicyImplemented,false);
  }
});

test('layout rejects guessed extra lookups and pointer underflow/overflow',()=>{
  const input={gainEntryEsp:0x500000,manager:0x1600000};
  for(const change of [v=>v.lookup=0,v=>v.lookup=3,v=>v.gainEntryEsp=0x100,v=>v.manager=0xffffffff,v=>v.manager=0xfffff7a0,v=>v.moduleBaseAddress=NaN,v=>v.gainEntryEsp=1.5]){
    const copy={...input};change(copy);assert.throws(()=>workerMixerLookupServiceLayout(copy));
  }
});

const retained='analysis/physics-native-worker-gain-window-v18-20261023.json';
test('first derived external stack/argument exactly matches actual V18 entry-only source boundary, without admitting its native exit', {skip:!existsSync(retained)},async()=>{
  const r=JSON.parse(await readFile(retained)), input=r.replay.input, boundary=r.replay.boundary;
  const plan=workerMixerLookupServiceLayout({gainEntryEsp:input.entryEsp,manager:input.manager,moduleBaseAddress:r.replay.moduleBaseAddress});
  assert.equal(plan.services[0].serviceEntryEsp,boundary.entryEsp);assert.equal(plan.services[0].returnAddress,boundary.returnAddress);
  assert.deepEqual(plan.services[0].args,boundary.args);assert.equal(plan.sites[0].esp,boundary.entryEsp+4);
  assert.equal(plan.sites[1].esp,boundary.entryEsp+8);assert.equal(plan.gameWrapperSpan.address,boundary.criticalSectionAddress+24);
  assert.equal(r.replay.externalOutcomesApplied,0);assert.equal(r.replay.sourceReplayComplete,false);
});
