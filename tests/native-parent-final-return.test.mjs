import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {completeNativeParentReturn,setNativeParentMasterLevelOnStack,verifyNativeParentReturnEvidence} from '../tools/lib/native-parent-tail.mjs';
import {updateRacePhaseState} from '../src/race-phase-state.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {replayNativeControlThroughPhysics} from '../tools/lib/native-control-physics.mjs';
import {bindNativeParentTail} from '../tools/lib/native-parent-tail.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';

const callerEvidence=await readInstructionEvidence(['001-frame-parent.json'],{directory:'analysis/physics-clock-elevated-20261022/results'});

const U0=0x1141000,SESSION=0x1160000,MANAGER=0x1170000,VTABLE=0x1190000;
const saved={ebx:0x12345678,ebp:0x23456789,esi:0x3456789a,edi:0x456789ab};
const globals=[0x90a548,0x6e675c,0x6e6ba4,0x5ecb1c,0x6eafe0,0x91e744,0x91e740,0x714b08,0x5ecdb8];
function fixture(image,alignment,{clock=17,sample=31,phase=4,counter=60,masterAlias=false,bits=0x7fc12345,unknownMaster=false}={}){
  //Constructed original inputs, original PE HIGHLOW relocations and genuine
  //retained game instructions. No original-process return/output is supplied.
  const actual=image.actual,m=Buffer.from(image.memory),U=U0+alignment,S=U-20,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  m.fill(0x35,U-256,U+128);m.fill(0,SESSION,SESSION+0xb00);m.fill(0x69,MANAGER,MANAGER+0x900);
  put(U,actual(0x450e38));put(U+4,1);for(const[name,offset]of[['ebx',4],['ebp',8],['esi',12],['edi',16]])put(U-offset,saved[name]);
  put(actual(0x90a548),clock);put(actual(0x6e675c),sample);put(actual(0x6e6ba4),phase);put(actual(0x5ecb1c),SESSION);put(actual(0x6eafe0),0);put(actual(0x91e744),0);
  put(SESSION+0x57c,phase);put(SESSION+0x580,counter);m[SESSION+0x58c]=1;m.writeUInt16LE(20,SESSION+0x58e);
  const manager=masterAlias?S:MANAGER;put(actual(0x714b08),manager);put(manager,masterAlias?VTABLE+0x100:VTABLE);
  put(VTABLE+0x5c,actual(unknownMaster?0x4ad580:0x4a90e0));put(VTABLE+0x15c,actual(0x4ad580));put(actual(0x5ecdb8),masterAlias?VTABLE:bits);
  const spans=[[U-256,512],[SESSION,0xb00],[manager,0x854],[VTABLE,0x200],...globals.map(p=>[actual(p),4])];
  const rows=spans.map(([address,length])=>({address,bytes:Buffer.from(m.subarray(address,address+length))}));
  const memory=createCapturedMemory(rows,{aliases:globals.filter(p=>actual(p)!==p).map(p=>({address:p,targetAddress:actual(p),length:4}))});
  const source={...memory,manifest:{moduleBaseAddress:actual(0x400000)},prefixReport:{entryEsp:U,childEsp:S,iteration:0,totalIterations:1},report:{childEsp:S},derivedPhysicsRegisters:{registers:{esp:S,ebx:0,ebp:0}},
    parentEntryAbi:Object.freeze({entryEsp:U,returnAddress:actual(0x450e38),totalIterations:1,registers:Object.freeze({...saved})})};
  //These two retained caller instructions have register/immediate operands,
  //no HIGHLOW fields. Their addresses move with the actual image.
  const instructions=new Map(image.instructions.map(row=>[row.address,row]));
  for(const row of callerEvidence.instructions.filter(row=>[0x450e38,0x450e3a].includes(row.address)))instructions.set(actual(row.address),{...row,address:actual(row.address)});
  const machine=new BoundedX86([...instructions.values()].sort((a,b)=>a.address-b.address));machine.bytes=m;machine.entry=actual(0x4511e8);Object.assign(machine.r,{ESP:U-16,EAX:0,EBX:0x12121212,EBP:0x34343434,ESI:0x56565656,EDI:0x78787878});
  return{...memory,source,machine,actual,U,S,spans,manager,actualUnresolved:image.unresolvedRelocations};
}
function stop(f,address){const observer=f.machine.onInstruction;f.machine.onInstruction=(p,x)=>{assert(!f.actualUnresolved?.has(p));observer?.(p,x);if(p===f.actual(address))throw Error('Constructed final caller observation.');};assert.throws(()=>f.machine.run(),/Constructed final caller observation/);}
function compare(f,spans=f.spans){for(const[address,length]of spans)assert.deepEqual(f.span(address,length),f.machine.bytes.subarray(address,address+length),`span0x${address.toString(16)}`);}

test('parent return and master-call ABI sites match original450e50 and450d60 evidence',async()=>{
  const proof=await verifyNativeParentReturnEvidence();assert.equal(proof.evidenceIds.length,2);assert.equal(proof.targetSha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
});

test('final-input stage admission cannot be enabled by a truthy nonboolean option',()=>{
  for(const value of[1,'true',{},null])assert.throws(()=>bindNativeParentTail({}, {finalTickInput:value}),/explicitly boolean/);
});

test('both native epilogues and wrapping clocks match all declared bytes and restored registers through actual RET',async()=>{
  let cases=0;
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const alignment of[0,4,8,12])for(const[phaseEax,clock,sample]of[[0,17,31],[1,17,31],[0,0x7fffffff,0xffffffff],[0x80000000,0xffffffff,0x7fffffff],[0xffffffff,0,0]]){
      const f=fixture(image,alignment,{clock,sample});f.machine.r.EAX=phaseEax|0;stop(f,0x450e38);
      const report=completeNativeParentReturn(f.source,phaseEax);compare(f);
      for(const name of['eax','ebx','ebp','esi','edi','esp'])assert.equal(report.parentReturn.registers[name],f.machine.r[name.toUpperCase()]>>>0);
      assert.equal(report.parentReturn.registers.eip,f.actual(0x450e38));assert.equal(report.parentReturn.registers.esp,f.U+4);
      assert.equal(report.parentReturn.totalIterations,1);assert.equal(report.parentReturn.callerCleanupPending,true);
      assert.equal(report.parentReturned,true);assert.equal(report.parentPreRetEsp,f.U);assert.equal(report.parentPreRet,phaseEax?0x4511f2:0x451208);
      assert.equal(Object.hasOwn(report.parentReturn.registers,'ecx'),false);assert.equal(Object.hasOwn(report.parentReturn.registers,'edx'),false);assert.equal(Object.hasOwn(report.parentReturn.registers,'eflags'),false);cases++;
    }
  }
  assert.equal(cases,40);
});

test('epilogue consumes live saves and argument without restoring the original input metadata over source writes',async()=>{
  const f=fixture(await loadRelocatedAudioFixture(0x320000),4);
  f.memory.writeUInt32LE(0x87654321,f.U-12);f.machine.bytes.writeUInt32LE(0x87654321,f.U-12);
  f.memory.writeUInt32LE(3,f.U+4);f.machine.bytes.writeUInt32LE(3,f.U+4);
  stop(f,0x450e38);const r=completeNativeParentReturn(f.source,0);compare(f);
  assert.equal(r.parentReturn.registers.esi,0x87654321);assert.equal(f.source.parentEntryAbi.registers.esi,saved.esi);
  assert.equal(r.parentReturn.totalIterations,3);assert.equal(f.source.parentEntryAbi.totalIterations,1);
});

test('changed live RET target is refused after the genuine clock/pops path, without claiming450e38',async()=>{
  const f=fixture(await loadRelocatedAudioFixture(0x320000),0),changed=f.actual(0x450e3a);
  f.memory.writeUInt32LE(changed,f.U);f.machine.bytes.writeUInt32LE(changed,f.U);stop(f,0x450e3a);
  assert.throws(()=>completeNativeParentReturn(f.source,0),error=>{assert.match(error.message,/changed live caller/);assert.equal(error.nativeParentReturn.parentReturned,false);assert.equal(error.nativeParentReturn.parentReturn.registers.eip,changed);return true;});compare(f);
});

test('original caller provenance and x86 phase result are required before epilogue writes',async()=>{
  const image=await loadRelocatedAudioFixture(0x400000);
  for(const bad of['missing','mutable','caller','argument','register','phase']){
    const f=fixture(image,0),before=f.spans.map(([p,n])=>Buffer.from(f.span(p,n)));
    if(bad==='missing')delete f.source.parentEntryAbi;
    if(bad==='mutable')f.source.parentEntryAbi={...f.source.parentEntryAbi};
    if(bad==='caller')f.source.parentEntryAbi=Object.freeze({...f.source.parentEntryAbi,returnAddress:f.actual(0x450e3a)});
    if(bad==='argument')f.source.parentEntryAbi=Object.freeze({...f.source.parentEntryAbi,totalIterations:2});
    if(bad==='register')f.source.parentEntryAbi=Object.freeze({...f.source.parentEntryAbi,registers:Object.freeze({...saved,esi:undefined})});
    assert.throws(()=>completeNativeParentReturn(f.source,bad==='phase'?2**32:0),/provenance|genuine x86/);
    f.spans.forEach(([p,n],i)=>assert.deepEqual(f.span(p,n),before[i]));
  }
});

test('master raw-bit virtual call uses actual S-4 ABI, PUSH-before-vtable order and genuine4a90e0',async()=>{
  let cases=0;
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const alignment of[0,4])for(const options of[{bits:0},{bits:0x80000000},{bits:0x7fc12345},{bits:0xffffffff},{masterAlias:true}]){
      const f=fixture(image,alignment,options);f.machine.entry=f.actual(0x4511d2);f.machine.r.ESP=f.U-16;
      let entry;f.machine.onInstruction=(p,x)=>{if(p===f.actual(0x4a90e0))entry={esp:x.r.ESP,argument:x.bytes.readUInt32LE(x.r.ESP+4),returnAddress:x.bytes.readUInt32LE(x.r.ESP)};};
      stop(f,0x4511e3);const r=setNativeParentMasterLevelOnStack(f.source);compare(f);
      assert.deepEqual(entry,{esp:f.S-4,argument:r.bits,returnAddress:r.returnAddress});assert.equal(r.bits,f.memory.readUInt32LE(f.manager+0x850));cases++;
    }
  }
  assert.equal(cases,20);
});

test('unknown master method is a real indirect-CALL boundary with argument and return already published',async()=>{
  const f=fixture(await loadRelocatedAudioFixture(0x320000),0,{unknownMaster:true});f.machine.entry=f.actual(0x4511d2);f.machine.r.ESP=f.U-16;stop(f,0x4ad580);
  assert.throws(()=>setNativeParentMasterLevelOnStack(f.source),/Unclassified actual SoundManager/);compare(f);
  assert.equal(f.memory.readUInt32LE(f.S-4),f.actual(0x4511e3));
});

test('genuine phase/playback and transition children feed the successful parent return; private callee ABI stays outside comparison',async()=>{
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const[phase,counter]of[[4,60],[1,14]]){
      const f=fixture(image,0,{phase,counter});f.machine.entry=f.actual(0x47f370);f.machine.r.ESP=f.S;f.machine.bytes.writeUInt32LE(f.actual(0x4511e8),f.S);f.memory.writeUInt32LE(f.actual(0x4511e8),f.S);
      stop(f,0x450e38);
      const phaseEax=updateRacePhaseState({memory:f.memory,moduleBaseAddress:base,scratchBase:f.S}),r=completeNativeParentReturn(f.source,phaseEax);
      //47f370's private saves and descendant CALL words are a separate scope.
      compare(f,[[f.U-16,24],[SESSION,0xb00],...globals.map(p=>[f.actual(p),4])]);
      for(const name of['eax','ebx','ebp','esi','edi','esp'])assert.equal(r.parentReturn.registers[name],f.machine.r[name.toUpperCase()]>>>0);
      assert.equal(r.sourceEax,1);
    }
  }
});

test('completion phase remains a genuine missing game child before any parent epilogue can be claimed',async()=>{
  const f=fixture(await loadRelocatedAudioFixture(0x320000),0,{phase:7,counter:61}),clock=f.memory.readUInt32LE(0x90a548);
  assert.throws(()=>updateRacePhaseState({memory:f.memory,moduleBaseAddress:0x320000,scratchBase:f.S}),/reached game handler call478fa0/);
  assert.equal(f.memory.readUInt32LE(0x90a548),clock);assert.equal(f.source.report.parentReturned,undefined);
});

const original='analysis/native-physics-local/startup-20261022/parent-tail-v1-20261023';
test('binder records immutable original caller inputs while preserving a changed carried saved word',{skip:!existsSync(`${original}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(original),configuration=JSON.parse(await readFile(`${original}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  const source=replayNativeControlThroughPhysics(pair.before,{...options,additionalRegions:nativeParentTailAdditionalRegions(pair.before,options)}),U=source.prefixReport.entryEsp;
  const initial=createCapturedMemory([...pair.before.ranges.values()]),caller=initial.memory.readUInt32LE(U),argument=initial.memory.readInt32LE(U+4),changed=(Number(pair.before.registers.ebx)^0x12345678)>>>0;
  source.memory.writeUInt32LE(changed,U-4);
  const bound=bindNativeParentTail(source,{snapshot:pair.before});
  assert.equal(bound.parentFinalInput,null,'Legacy/default paths do not enable final graph admission.');
  assert.equal(bound.parentEntryAbi.entryEsp,U);assert.equal(bound.parentEntryAbi.returnAddress,caller);assert.equal(bound.parentEntryAbi.totalIterations,argument);
  for(const name of['ebx','ebp','esi','edi'])assert.equal(bound.parentEntryAbi.registers[name],Number(pair.before.registers[name]));
  assert.equal(Object.isFrozen(bound.parentEntryAbi),true);assert.equal(Object.isFrozen(bound.parentEntryAbi.registers),true);
  assert.equal(bound.memory.readUInt32LE(U-4),changed,'Binder must not replay original PUSH values over carried writes.');
  assert.equal(initial.memory.readUInt32LE(U),caller);assert.equal(initial.memory.readInt32LE(U+4),argument);
});
