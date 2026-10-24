import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeParentRttiBindings,verifyNativeParentRttiEvidence,nativeParentRttiObservationRanges,assertNativeParentRttiService} from '../tools/lib/native-parent-rtti.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {replayNativeControlThroughPhysics} from '../tools/lib/native-control-physics.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {nativeParentLateReplayRegions} from '../tools/check-native-parent-tail.mjs';
import {nativeControlSound19ObservedRegions} from '../tools/lib/native-control-sound-inputs.mjs';
import {createNativeControlSoundCreationBindings} from '../tools/lib/native-control-sound-creation.mjs';
import {bindNativeParentTail,executeNativeParentTail} from '../tools/lib/native-parent-tail.mjs';

function fixture(base=0x400000){
  const U=0x1000000,S=U-20,R=S-216,Q=R-40,application=0x1100000,actual=p=>base+p-0x400000;
  const initialRows=[{address:Q-64,bytes:Buffer.alloc(512,0x79)},{address:application,bytes:Buffer.alloc(0x84,0x53)},{address:actual(0x6efb38),bytes:Buffer.alloc(4)}];
  initialRows[2].bytes.writeUInt32LE(application);
  const owned=createCapturedMemory(initialRows,{aliases:base===0x400000?[]:[{address:0x6efb38,targetAddress:actual(0x6efb38),length:4}]});
  const m=owned.memory;
  //Construct the caller words in original instruction order, independently
  //of the adapter's offsets: PUSHmode, PUSHname, CALLreturn.
  let callerEsp=S-204;
  for(const value of [1,S-40,actual(0x41a0c8)]){callerEsp-=4;m.writeUInt32LE(value,callerEsp);}
  assert.equal(callerEsp,R);m.writeUInt32LE(actual(0x451107),S);
  for(const [i,byte]of Buffer.from('1 Player\0').entries())m[S-40+i]=byte;
  const initial=createCapturedMemory(initialRows);
  const pair={moduleBaseAddress:base,logicalClock:288,before:{tid:7,ordinal:1,observedDebugEventOrdinal:10,registers:{esp:U}},postphysics:{auxiliary:{tid:7,observedDebugEventOrdinal:20},cameras:{tid:7,observedDebugEventOrdinal:40}}};
  const args=[application,0,actual(0x6e213c),actual(0x6e20a4),0],context=Buffer.alloc(52,0xa5);args.forEach((v,i)=>context.writeUInt32LE(v,i*4));context.set(m.subarray(R,R+12),40);
  const snapshot=(id,address,ordinal)=>({breakpointId:id,tid:7,ordinal,observedDebugEventOrdinal:ordinal,registers:{esp:Q,eip:actual(address),eax:application},ranges:new Map([
    ['native-parent-rtti-context',{address:Q,bytes:Buffer.from(context)}],
    ['native-parent-rtti-camera-return',{address:S,bytes:Buffer.from(Uint32Array.of(actual(0x451107)).buffer)}],
    ['native-parent-rtti-clock',{address:actual(0x90a548),bytes:Buffer.from(Uint32Array.of(288).buffer)}],
  ])});
  const capture={snapshots:[snapshot('native-parent-rtti-call',0x402d86,25),snapshot('native-parent-rtti-return',0x402d8b,26)]};
  const options={capture,pair,memory:m,initialSpan:initial.span,moduleBaseAddress:base};
  const call=b=>b.crtDynamicCast(application,0,0x6e213c,0x6e20a4,0,{memory:m,scratchBase:R});
  return {...options,options,U,S,R,Q,m,actual,application,args,call};
}

test('RTTI boundary/camera stack derivation follows target-checked retained instructions',async()=>{
  const proof=await verifyNativeParentRttiEvidence();assert.equal(proof.evidenceIds.length,7);
  assert.equal(proof.staticImportIdentity.dll,'MSVCR120.dll');assert.equal(proof.staticImportIdentity.name,'__RTDynamicCast');
  assert.equal(proof.staticImportIdentity.iatPreferredAddress,0x56e4c4);assert.equal(proof.staticImportIdentity.runtimeResolvedIdentityProved,false);
  assert.deepEqual(nativeParentRttiObservationRanges().map(x=>[x.id,x.offset??0,x.length]),[['native-parent-rtti-context',0,52],['native-parent-rtti-camera-return',256,4],['native-parent-rtti-clock',0,4]]);
});

test('typed CRT observation returns only authenticated EAX and publishes genuine ASLR argument words',()=>{
  for(const base of [0x400000,0x6e0000]){
    const f=fixture(base),before=Buffer.from(f.m.subarray(f.application,f.application+0x84)),binding=createNativeParentRttiBindings(f.options);
    assertNativeParentRttiService(binding.crtDynamicCast);assert.equal(f.call(binding),f.application);binding.assertComplete();
    assert.deepEqual(Array.from({length:5},(_,i)=>f.m.readUInt32LE(f.Q+i*4)),f.args);
    assert.equal(f.m.readUInt32LE(f.Q-4),f.actual(0x402d8b));assert.deepEqual(f.m.subarray(f.application,f.application+0x84),before);
    assert.equal(f.m.readUInt32LE(f.R+4),f.S-40);assert.equal(f.m.readUInt32LE(f.R+8),1);
    assert.equal(binding.events.length,1);assert.equal(binding.events[0].sourceNameAddress,f.S-40);assert.equal(binding.events[0].sourceNameHex,Buffer.from('1 Player').toString('hex'));assert.throws(()=>f.call(binding),/authenticated CRT/);
  }
});

test('swapped NAME/MODE is rejected in both observed context and carried source, including without CRT evidence',()=>{
  for(const base of [0x400000,0x6e0000]){
    const observed=fixture(base);
    for(const row of observed.capture.snapshots){const context=row.ranges.get('native-parent-rtti-context').bytes;context.writeUInt32LE(1,44);context.writeUInt32LE(observed.S-40,48);}
    assert.throws(()=>createNativeParentRttiBindings(observed.options),/enclosing camera return\/arguments/);
    for(const hasEvidence of [true,false]){
      const f=fixture(base);if(!hasEvidence)f.capture.snapshots=[];
      const b=createNativeParentRttiBindings(f.options);
      f.m.writeUInt32LE(1,f.R+4);f.m.writeUInt32LE(f.S-40,f.R+8);
      assert.throws(()=>f.call(b),/source arguments or parent lineage/);assert.equal(b.events.length,0);
    }
  }
});

test('wrong thread, nested caller, stack, ASLR types, ordering and unobserved output cannot supply a cast',()=>{
  const mutations=[
    f=>{f.capture.snapshots[0].tid=8;},
    f=>{f.capture.snapshots[0].registers.esp-=4;},
    f=>{f.capture.snapshots[0].ranges.get('native-parent-rtti-context').bytes.writeUInt32LE(f.actual(0x41a0c9),40);},
    f=>{f.capture.snapshots[0].ranges.get('native-parent-rtti-context').bytes.writeUInt32LE(0x6e213c,8);},
    f=>{f.capture.snapshots[1].observedDebugEventOrdinal=24;},
    f=>{f.capture.snapshots[1].registers.eax=0x1200000;},
  ];
  for(const change of mutations){const f=fixture(0x6e0000);change(f);assert.throws(()=>createNativeParentRttiBindings(f.options));}
  const f=fixture(),b=createNativeParentRttiBindings(f.options);f.m.writeUInt32LE(2,f.R+4);assert.throws(()=>f.call(b),/source arguments/);assert.equal(b.events.length,0);
  assert.throws(()=>assertNativeParentRttiService(()=>123),/authenticated typed CRT/);
});

test('no captured pair remains a strict reached failure and never invokes a game fallback',()=>{
  const f=fixture();f.capture.snapshots=[];const b=createNativeParentRttiBindings(f.options);
  assert.throws(()=>f.call(b),/authenticated CRT dynamicCast call\/return evidence/);assert.equal(b.events.length,0);
});

const v6='analysis/native-physics-local/startup-20261022/parent-late-v6-batched-inputs-20261023';
test('original V6 reaches the proven common camera depth and retains its missing external cast outcome',{skip:!existsSync(`${v6}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(v6),configuration=JSON.parse(await readFile(`${v6}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0];
  const options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress},input=createCapturedMemory([...pair.before.ranges.values()]);
  const initial=replayNativeControlThroughPhysics(pair.before,{...options,createControlAudioBindings:createNativeControlSoundCreationBindings,additionalRegions:[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress)]});
  const source=bindNativeParentTail(initial,{snapshot:pair.before,includeLateInputs:true}),binding=createNativeParentRttiBindings({capture,pair,memory:source.memory,initialSpan:input.span});
  const seen=[];assert.throws(()=>executeNativeParentTail(source,{through:'cameras',crtDynamicCast:binding.crtDynamicCast,onStage:event=>seen.push(event.stage)}),/authenticated CRT dynamicCast call\/return evidence/);
  assert.deepEqual(seen,['attachments','recovery','drive','auxiliary']);assert.equal(binding.events.length,0);
  const S=Number(pair.before.registers.esp)-20,R=S-216;
  assert.equal(source.memory.readUInt32LE(R+4),S-40,'Actual reached source PUSHname is first argument.');
  assert.equal(source.memory.readUInt32LE(R+8),1,'Actual reached source PUSHmode is second argument.');
});
