import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadNativeRaceDispatchInstructionProgram,nativeRaceDispatchScenarios,verifyNativeRaceDispatchInstructions} from '../tools/verify-native-race-dispatch-instructions.mjs';

test('retained450d60 parentcontrol matches allpublished bytes/8return fields/childABIs acrossthree actual image bases',async()=>{
  const report=await verifyNativeRaceDispatchInstructions();
  assert.equal(report.matched,true);assert.equal(report.scenarios,150);assert.equal(report.fixtures,450);
  assert.equal(report.parentInstructionsReached,report.parentInstructions);
  assert.equal(report.authority,'constructed-parent-control-fixtures-with-synthetic-in-image-child-outcomes');
  assert.ok(report.limits.some(l=>l.includes('No full-child')));
  const example=label=>report.examples.find(r=>r.label===label);
  assert.deepEqual(example('reread-view-flags').calls.filter(c=>c.name==='call402d10').map(c=>c.args[1]),[1,0]);
  assert.deepEqual(example('reread-view-session-config-roots').calls.filter(c=>c.name==='call402d10').map(c=>c.args[1]),[0,1]);
  for(const label of ['background-read-after-clock','background-latched-across-attachments']){
    const r=example(label);assert.equal(r.iterations,0);assert.equal(r.sample,19);assert.ok(r.calls.some(c=>c.name==='call477730'));
  }
  const foreground=example('foreground-latched-across-attachments');assert.equal(foreground.iterations,0);assert.equal(foreground.calls.some(c=>c.name==='call477730'),false);
  assert.equal(example('live-parent-saved-word').returned.edi,0xcafebabe);
  for(const at of ['0x450d8d','0x450d92','0x450dd0','0x450dd7','0x450e01','0x450e21','0x450e30','0x450e41','0x450e46'])assert.ok(report.branchCounts[at]>0,at);
});

test('actualPE HIGHLOW operands and child plainRET/RET8 remain distinct underASLR',async()=>{
  for(const base of [0x320000,0x730000]){
    const p=await loadNativeRaceDispatchInstructionProgram(base),r=p.instructions.find(i=>i.address===p.actual(0x450df0));
    assert.equal(r.op,'MOV');assert.equal(r.args[0],'ESI');assert.equal(Number(/0x[0-9a-f]+/.exec(r.args[1])[0]),p.actual(0x6e6b4c));
    assert.equal(p.instructions.find(i=>i.address===p.actual(0x450d9a)).args[0],'0x'+p.actual(0x402d10).toString(16));
    assert.equal(p.instructions.find(i=>i.address===p.actual(0x450d95)).args[0],'0x'+p.actual(0x570258).toString(16));
  }
});

test('syntheticchild demands are explicit: an unavailable tick result never becomes a successful parent iteration',async()=>{
  const scenario={...nativeRaceDispatchScenarios()[0],label:'missing-synthetic-tick',scheduled:1,ticks:[]};
  await assert.rejects(()=>verifyNativeRaceDispatchInstructions({bases:[0x400000],scenarios:[scenario]}),/Unexpected extra synthetic tick demand/);
});

test('fixtureloading rejects unpinnedtarget and impossible actualimagebase without launching anything',async()=>{
  await assert.rejects(()=>verifyNativeRaceDispatchInstructions({bases:[]}),/Nonempty bounded/);
  await assert.rejects(()=>verifyNativeRaceDispatchInstructions({bases:[0x400000,0x400000]}),/Nonempty bounded/);
  await assert.rejects(()=>loadNativeRaceDispatchInstructionProgram(0x100000000),/assert|false|integer/i);
  const directory=await mkdtemp(path.join(tmpdir(),'rollcage-dispatch-target-'));try{const target=path.join(directory,'not-a-game.bin');await writeFile(target,'Untrusted synthetic input');await assert.rejects(()=>loadNativeRaceDispatchInstructionProgram(0x400000,{target}),/Expected values/);}finally{await rm(directory,{recursive:true,force:true});}
});
