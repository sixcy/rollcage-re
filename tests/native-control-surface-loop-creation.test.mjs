import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeControlSoundCreationBindings,verifyNativeControlSoundCreationEvidence} from '../tools/lib/native-control-sound-creation.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {updateVehicleAudio,initializeVehicleAudioTables} from '../src/vehicle-audio.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {nativeParentLateReplayRegions} from '../tools/check-native-parent-tail.mjs';
import {nativeControlSound19ObservedRegions} from '../tools/lib/native-control-sound-inputs.mjs';
import {nativeControlTyreSound2ObservedRegions} from '../tools/lib/native-control-tyre-sound-inputs.mjs';
import {nativeParentWeatherCounterInputRegions} from '../tools/lib/native-parent-weather-counter.mjs';
import {replayNativeControlPrefix} from '../tools/lib/native-frame-control-continuation.mjs';

const numericalContext=decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x1f80});
function fixture(image,alignment,{rpm=8551,repeat=0,oldHandle=0x1130000,index=1}={}){
  const actual=image.actual,body=0x1100000,bank=0x1108000,S=0x1110000+alignment,F=S-84,E=S-116,object=0x1120000,vtable=0x1140000,ebp=index*5,audio=0x713190+index*40;
  const known=[[0x6f2414,12],[audio,40],[0x5750d0,20]];
  const rows=known.map(([p,n])=>({address:actual(p),bytes:Buffer.from(image.memory.subarray(actual(p),actual(p)+n))}));
  rows.push({address:body,bytes:Buffer.alloc(0x3e78)},{address:bank,bytes:Buffer.alloc(256)},{address:S-512,bytes:Buffer.alloc(640,0x35)},
    {address:object,bytes:Buffer.alloc(0x9a8)},{address:0x1130000,bytes:Buffer.alloc(4)},{address:vtable,bytes:Buffer.alloc(0x60)});
  const captured=createCapturedMemory(rows,{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))}),m=captured.memory,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  put(0x6f2414,bank);put(0x6f2418,bank+256);put(0x6f241c,bank+256);
  put(audio+4,oldHandle);m.writeUInt16LE(rpm&65535,audio+24);m.writeUInt16LE(1,audio+38);m[audio+34]=0xff;
  put(0x1130000,object);put(object,vtable);put(vtable+0x34,actual(0x4ad5b0));put(object+0x94c,3);
  put(body+0x5f8,0xa0000);m[body+0x6b4]=repeat;
  put(F+0x18,0);put(F+0x24,10);
  for(const[offset,p]of[[0x3c,0x5750d0],[0x28,0x5750d4],[0x2c,0x5750d8],[0x14,0x5750dc],[0x20,0x5750e0]])put(F+offset,m.readUInt32LE(p));
  const loop=m.readInt32LE(F+0x28),flag=repeat===1?1:0,args=[0,-1,0,9,flag,0,flag];
  const entryRegisters={EBX:body,EBP:ebp,ESI:oldHandle,EDI:rpm,ECX:loop&255,EDX:body+0x34,EAX:loop};
  const meta={callerAddress:actual(0x485300),callerEntryEsp:S,callAddress:actual(0x486146),returnAddress:actual(0x48614b),entryEsp:E,entryRegisters};
  const request={memory:m,ecx:loop&255,edx:body+0x34,args,scratchBase:E,nativeCaller:meta,runtime:{memory:m,nativeAudioCalls:true,scratchBase:E,nativeCaller:meta}};
  const stopSource=b=>{
    if(oldHandle<=256)return;
    const registers={EBX:body,EBP:ebp,ESI:oldHandle,EDI:rpm,ECX:object};
    const nativeSourceCall={callerAddress:actual(0x485300),callerEntryEsp:S,callAddress:actual(0x486121),returnAddress:actual(0x486124),entryEsp:F-4,entryRegisters:registers};
    put(F-4,actual(0x486124));b.handlers.sourceCall(object,0x34,[],{memory:m,nativeAudioCalls:true,scratchBase:F-4,entryRegisters:registers,nativeSourceCall});
  };
  const stage=()=>{put(E,actual(0x48614b));args.forEach((v,i)=>put(E+4+i*4,v));};
  return{...captured,actual,body,bank,S,F,E,audio,object,vtable,loop,oldHandle,rpm,request,put,stopSource,stage,spans:rows.map(r=>[r.address,r.bytes.length])};
}

test('surface replacement authentic caller/stop/emitter/dispatcher bytes match retained code under PE ASLR',async()=>{
  await verifyNativeControlSoundCreationEvidence();let cases=0;
  for(const base of[0x400000,0x940000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const alignment of[0,4,8,12])for(const values of[{},{rpm:70000,repeat:1},{rpm:-40000,repeat:2},{rpm:-1,oldHandle:0}]){
      const f=fixture(image,alignment,values),machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(image.memory);
      for(const[p,n]of f.spans)f.span(p,n).copy(machine.bytes,p);
      machine.entry=f.actual(0x4860f2);Object.assign(machine.r,{ESP:f.F,EBX:f.body,EBP:5,ESI:f.oldHandle,EDI:f.rpm});let incoming;
      machine.onInstruction=(p,x)=>{assert(!image.unresolvedRelocations.has(p));if(p===f.actual(0x484bb0))incoming=Object.fromEntries(['EAX','EBX','ECX','EDX','EBP','ESI','EDI','ESP'].map(k=>[k,x.r[k]>>>0]));if(p===f.actual(0x48614b))throw Error('Constructed surface return.');};
      assert.throws(()=>machine.run(),/Constructed surface return/);assert(incoming);
      const b=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:base,numericalContext});f.stopSource(b);f.stage();
      assert.equal(b.handlers.call484bb0(f.request),127);const event=b.creationEvents[0];assert(event.completed);assert.equal(event.kind,'surface-loop-replacement');
      for(const[k,v]of Object.entries(event.entryRegisters))assert.equal(v>>>0,incoming[k.toUpperCase()],`${k}/${base.toString(16)}/${alignment}`);
      assert.equal(event.entryEsp,incoming.ESP);for(const[p,n]of f.spans)assert.deepEqual(f.span(p,n),machine.bytes.subarray(p,p+n));cases++;
    }
  }
  assert.equal(cases,32);
});

test('full485300 source publishes genuine old surface/full RPM/loop EAX at486146',async()=>{
  const image=await loadRelocatedAudioFixture(0x400000),BODY=0x10000,SESSION=0x20000,S=0x9000,index=1,audio=0x713190+index*40;
  for(const rpm of[70000,-40000]){
    const memory=Buffer.from(image.memory);initializeVehicleAudioTables(memory);const put=(p,v)=>memory.writeInt32LE(v|0,p);
    memory.fill(0,BODY,BODY+0x4000);memory.fill(0,SESSION,SESSION+0x800);memory.fill(0,0x713190,0x7132e0);memory.fill(0,0x909300,0x90a548);memory.fill(0x35,S-512,S+128);
    put(0x5ecb1c,SESSION);put(0x909300+index*0x30c,BODY);put(BODY+0x11c,-1);put(SESSION+0x57c,4);memory[BODY+0x4b4]=1;
    put(BODY+0x5d4,rpm*256);put(BODY+0x50c,rpm*256);put(BODY+0x5f8,0xa0000);memory.writeUInt16LE(1,audio+38);memory[audio+34]=0xff;memory[BODY+0x6b4]=1;
    let native,source;const machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(memory);machine.fs0=0;
    machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));
    machine.onInstruction=(p,x)=>{if(p===0x484bb0){native={site:x.bytes.readUInt32LE(x.r.ESP),args:Array.from({length:7},(_,i)=>x.bytes.readInt32LE(x.r.ESP+4+i*4)),registers:Object.fromEntries(['EAX','ECX','EDX','ESI','EDI'].map(k=>[k,x.r[k]>>>0]))};throw Error('Observed surface creation.');}};
    machine.entry=0x485300;Object.assign(machine.r,{ECX:BODY,EDX:index,ESP:S,EBX:11,EBP:22,ESI:33,EDI:44});machine.bytes.writeInt32LE(-1,S);
    assert.throws(()=>machine.run(),/Observed surface creation/);
    assert.throws(()=>updateVehicleAudio(BODY,index,{memory,scratchBase:S,nativeAudioCalls:true,entryRegisters:{EBX:11,EBP:22,ESI:33,EDI:44},handlers:{call484bb0(r){source=r;throw Error('Observed surface creation.');}}}),/Observed surface creation/);
    assert.equal(native.site,0x48614b);assert.equal(source.nativeCaller.callAddress,0x486146);assert.deepEqual(source.args,native.args);
    for(const[k,v]of Object.entries(native.registers))assert.equal(source.nativeCaller.entryRegisters[k]>>>0,v,k);
    assert.equal(source.nativeCaller.entryRegisters.EDI,rpm);
  }
});

test('surface binding refuses wrong branch, registers, missing genuine stop and altered caller words',async()=>{
  const image=await loadRelocatedAudioFixture(0x940000);
  for(const mutate of[
    f=>f.put(f.F+0x28,0),f=>{f.memory[f.audio+34]=0;},f=>f.memory.writeUInt16LE(2,f.audio+38),
    f=>{f.request.nativeCaller.entryRegisters.EDI=0;},f=>{f.request.nativeCaller.entryRegisters.ESI=0;},
    f=>{f.request.nativeCaller.entryRegisters.EAX=0;},f=>f.put(f.E+16,7),f=>f.put(f.object+0x94c,3),
    f=>f.put(f.E,0)
  ]){const f=fixture(image,0),b=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:0x940000,numericalContext});f.stopSource(b);f.stage();mutate(f);assert.throws(()=>b.handlers.call484bb0(f.request));assert.equal(b.creationEvents.length,0);}
  const f=fixture(image,0),b=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:0x940000,numericalContext});f.stage();assert.throws(()=>b.handlers.call484bb0(f.request),/genuine preceding source stop/);
});

const raw='analysis/native-parent-rtti-stock-capture-v5-20261024';
test('actualV5 source reaches populated code7 owner and retains its genuine missing input',{skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(raw),configuration=JSON.parse(await readFile(`${raw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  assert.throws(()=>replayNativeControlPrefix(pair.before,{...options,additionalRegions:[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress),...nativeControlTyreSound2ObservedRegions(pair.before,pair.moduleBaseAddress),...nativeParentWeatherCounterInputRegions(pair.before,pair.moduleBaseAddress)],createControlAudioBindings:createNativeControlSoundCreationBindings}),error=>{
    assert.match(error.message,/Uncaptured native memory at 0x8c76148 \(1168 bytes\)/);
    const event=error.nativeControlSoundCreation;assert.equal(event.kind,'surface-loop-replacement');assert.equal(event.completed,false);assert.equal(event.entryRegisters.ecx,7);assert.equal(event.entryRegisters.ebp,5);assert.deepEqual(event.args,[0,-1,0,9,0,0,0]);return true;
  });
});
