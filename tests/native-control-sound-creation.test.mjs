import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createNativeControlSoundCreationBindings,verifyNativeControlSoundCreationEvidence} from '../tools/lib/native-control-sound-creation.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {replayNativeControlPrefix} from '../tools/lib/native-frame-control-continuation.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
const numericalContext=decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x1f80});

function setup(base,alignment=0,collision=48,clock=288,previous=278){
  const actual=p=>base+p-0x400000,body=0x1100000,bank=0x1108000,S=0x1110000+alignment,E=S-116,known=[[0x6f2414,12],[0x90a548,4]];
  const memoryRows=[...known.map(([address,length])=>({address:actual(address),bytes:Buffer.alloc(length)})),{address:body,bytes:Buffer.alloc(0x3e78)},{address:bank,bytes:Buffer.alloc(256)},{address:S-512,bytes:Buffer.alloc(640,0x35)}];
  const captured=createCapturedMemory(memoryRows,{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))}),m=captured.memory;
  m.writeUInt32LE(bank,0x6f2414);m.writeUInt32LE(bank+256,0x6f2418);m.writeUInt32LE(bank+256,0x6f241c);m.writeUInt32LE(clock,0x90a548);m[body+0x66f]=collision;m.writeInt32LE(previous|0,body+0x3e74);
  const args=[0,collision+256,collision*48,7,previous,0,0],entryRegisters={EBX:body,EBP:15,ECX:19,EDX:body+0x34};
  const nativeCaller={callerAddress:actual(0x485300),callerEntryEsp:S,callAddress:actual(0x48627c),returnAddress:actual(0x486281),entryEsp:E,entryRegisters};
  const request={memory:m,ecx:19,edx:body+0x34,args,scratchBase:E,nativeCaller,runtime:{memory:m,nativeAudioCalls:true,scratchBase:E,nativeCaller}};
  const stage=()=>{m.writeUInt32LE(clock,body+0x3e74);m.writeUInt32LE(actual(0x486281),E);args.forEach((value,i)=>m.writeInt32LE(value|0,E+4+i*4));};
  return{...captured,actual,body,bank,S,E,request,stage,spans:[...known.map(([p,n])=>[actual(p),n]),[body,0x3e78],[bank,256],[S-512,640]]};
}

test('collision sound19 caller registers and all shared emitter bytes match real relocated caller/emitter/dispatcher instructions',async()=>{
  assert.equal((await verifyNativeControlSoundCreationEvidence()).evidenceIds.length,3);
  let cases=0;
  for(const base of[0x400000,0x6e0000]){
    const fixture=await loadRelocatedAudioFixture(base),machine=new BoundedX86(fixture.instructions);
    for(const alignment of[0,4,8,12])for(const[collision,clock,previous]of[[32,0,-1],[48,288,278],[255,0xffffffff,0xfffffff0]]){
      const f=setup(base,alignment,collision,clock,previous);machine.reset();machine.bytes=Buffer.from(fixture.memory);
      for(const[p,n]of f.spans)f.span(p,n).copy(machine.bytes,p);
      machine.entry=f.actual(0x486219);Object.assign(machine.r,{ESP:f.S-84,EBX:f.body,EBP:15,ESI:0x12345678,EDI:0x76543210});let incoming;
      machine.onInstruction=(address,state)=>{if(address===f.actual(0x484bb0))incoming=Object.fromEntries(['EAX','EBX','ECX','EDX','EBP','ESI','EDI','ESP'].map(name=>[name,state.r[name]>>>0]));if(address===f.actual(0x486281))throw Error('observed-after-emitter');};
      assert.throws(()=>machine.run(),/observed-after-emitter/);assert.ok(incoming);
      f.stage();const binding=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:base,numericalContext});assert.equal(binding.handlers.call484bb0(f.request),127);
      const event=binding.creationEvents[0];for(const[name,value]of Object.entries(event.entryRegisters))assert.equal(value>>>0,incoming[name.toUpperCase()],`${name}/alignment${alignment}`);assert.equal(event.entryEsp,incoming.ESP);
      assert.deepEqual(f.span(f.S-512,640),machine.bytes.subarray(f.S-512,f.S+128));assert.deepEqual(f.span(f.body,0x3e78),machine.bytes.subarray(f.body,f.body+0x3e78));assert.deepEqual(f.span(f.bank,256),Buffer.alloc(256),'Constructed absent slot is retained, never forced over a populated input.');cases++;
    }
  }
  assert.equal(cases,24);
});

test('collision sound rejects contradictory registers and caller words; other creation sites retain their explicit boundary',()=>{
  const f=setup(0x6e0000);f.stage();const binding=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:0x6e0000,numericalContext});
  f.request.nativeCaller.entryRegisters.ESI=289;assert.throws(()=>binding.handlers.call484bb0(f.request),/contradicts/);delete f.request.nativeCaller.entryRegisters.ESI;
  f.memory.writeUInt32LE(0,f.E+16);assert.throws(()=>binding.handlers.call484bb0(f.request),/argument producer/);f.memory.writeUInt32LE(7,f.E+16);
  f.request.nativeCaller.callAddress=f.actual(0x48608f);assert.throws(()=>binding.handlers.call484bb0(f.request),/unbound/);assert.equal(binding.creationEvents.length,0);
});

const raw='analysis/native-physics-local/startup-20261022/parent-late-v3-20261023';
test('actualV3 parent-entry continuation derives collision registers and stops at the genuinely uncaptured sound19 bank slot',{skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(raw),pair=pairNativeControlSnapshots(capture,JSON.parse(await readFile(`${raw}/configuration.json`))).pairs[0],options={...pair.options,moduleBaseAddress:pair.moduleBaseAddress};
  assert.throws(()=>replayNativeControlPrefix(pair.before,{...options,additionalRegions:nativeParentTailAdditionalRegions(pair.before,options),createControlAudioBindings:createNativeControlSoundCreationBindings}),error=>{
    assert.match(error.message,/Uncaptured native memory at 0x10939bec \(4 bytes\)/);const row=error.nativeControlSoundCreation;assert.ok(row);assert.equal(row.completed,false);assert.deepEqual(row.args,[0,304,2304,7,278,0,0]);assert.equal(row.entryRegisters.esi,288);assert.equal(row.entryRegisters.edi,48);assert.equal(row.entryEsp,row.callerEntryEsp-116);assert.equal(row.callAddress,pair.moduleBaseAddress+0x8627c);return true;
  });
});
