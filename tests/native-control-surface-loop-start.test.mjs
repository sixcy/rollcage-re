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
function fixture(image,alignment,{slip=493160,rpm=8551,counter=1,mode=8,oldSmoke=0,allowOverride,index=1}={}){
  const actual=image.actual,body=0x1100000,bank=0x1108000,S=0x1110000+alignment,F=S-84,E=S-116,audio=0x713190+index*40,ebp=index*5;
  const known=[[0x6f2414,12],[audio,40],[0x5750d0,20]],rows=known.map(([p,n])=>({address:actual(p),bytes:Buffer.from(image.memory.subarray(actual(p),actual(p)+n))}));
  rows.push({address:body,bytes:Buffer.alloc(0x3e78)},{address:bank,bytes:Buffer.alloc(256)},{address:S-512,bytes:Buffer.alloc(640,0x35)});
  const captured=createCapturedMemory(rows,{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))}),m=captured.memory,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  put(0x6f2414,bank);put(0x6f2418,bank+256);put(0x6f241c,bank+256);put(audio+4,127);m.writeUInt16LE(rpm&65535,audio+24);m.writeUInt16LE(counter&65535,audio+38);
  put(body+0x5f8,slip);m[body+0x718]=mode;m[body+0x71e]=oldSmoke;
  if(allowOverride!==undefined)put(0x5750e0,allowOverride); //Explicit synthetic table-input variation.
  put(F+0x3c,slip);put(F+0x18,0);put(F+0x28,0);
  const pitch=m.readInt32LE(0x5750dc),loop=m.readInt32LE(0x5750d4),clipped=Math.min(slip,0x1e0000),smoke=(clipped>>16)>6&&mode===10&&oldSmoke<=8,amount=(((clipped>>18)&2)|1)+4,unused=smoke?amount<<2:clipped;
  const args=[0,pitch<<16>>16,0,9,unused,0,0],entryRegisters={EBX:body,EBP:ebp,ESI:127,EDI:rpm,EAX:loop,ECX:loop&255,EDX:body+0x34};
  const meta={callerAddress:actual(0x485300),callerEntryEsp:S,callAddress:actual(0x4860db),returnAddress:actual(0x4860e0),entryEsp:E,entryRegisters};
  const request={memory:m,ecx:loop&255,edx:body+0x34,args,scratchBase:E,nativeCaller:meta,runtime:{memory:m,nativeAudioCalls:true,scratchBase:E,nativeCaller:meta}};
  const stage=()=>{
    for(const[offset,p]of[[0x3c,0x5750d0],[0x28,0x5750d4],[0x2c,0x5750d8],[0x14,0x5750dc],[0x20,0x5750e0]])put(F+offset,m.readUInt32LE(p));put(F+0x24,clipped>>16);
    if(smoke){m.writeUInt16LE(0x108,body+0x71e);m[body+0x71d]=40;m.writeUInt16LE(amount*10,body+0x71a);}
    put(E,actual(0x4860e0));args.forEach((v,i)=>put(E+4+i*4,v));
  };
  return{...captured,actual,body,bank,S,F,E,audio,request,stage,put,unused,spans:rows.map(r=>[r.address,r.bytes.length])};
}

test('initial surface-loop caller/emitter/dispatcher matches retained code for signed counters, smoke and ASLR',async()=>{
  await verifyNativeControlSoundCreationEvidence();let cases=0;
  for(const base of[0x400000,0x950000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const alignment of[0,4,8,12])for(const values of[{},
      {slip:0xa0000,counter:0,rpm:70000,mode:10,oldSmoke:4},
      {slip:0x1c0000,counter:-1,rpm:-40000,mode:10,oldSmoke:0},
      {slip:0x20000,counter:-32768,rpm:-1,allowOverride:1},
      {slip:0xa0000,counter:1,rpm:-1000,mode:10,oldSmoke:9}
    ]){
      const f=fixture(image,alignment,values),machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(image.memory);
      for(const[p,n]of f.spans)f.span(p,n).copy(machine.bytes,p);
      machine.entry=f.actual(0x485f3e);Object.assign(machine.r,{ESP:f.F,EBX:f.body,EBP:5,ESI:0x12345678,EDI:values.rpm??8551});let incoming;
      machine.onInstruction=(p,x)=>{assert(!image.unresolvedRelocations.has(p));if(p===f.actual(0x484bb0))incoming=Object.fromEntries(['EAX','EBX','ECX','EDX','EBP','ESI','EDI','ESP'].map(k=>[k,x.r[k]>>>0]));if(p===f.actual(0x4860e0))throw Error('Constructed initial-loop return.');};
      assert.throws(()=>machine.run(),/Constructed initial-loop return/);assert(incoming);
      f.stage();const b=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:base,numericalContext});assert.equal(b.handlers.call484bb0(f.request),127);
      const event=b.creationEvents[0];assert(event.completed);assert.equal(event.kind,'surface-loop-start');
      for(const[k,v]of Object.entries(event.entryRegisters))assert.equal(v>>>0,incoming[k.toUpperCase()],k);assert.equal(event.entryEsp,incoming.ESP);
      for(const[p,n]of f.spans)assert.deepEqual(f.span(p,n),machine.bytes.subarray(p,p+n));cases++;
    }
  }
  assert.equal(cases,40);
});

test('full485300 source carries its initial127 surface, full RPM and loop EAX at4860db',async()=>{
  const image=await loadRelocatedAudioFixture(0x400000),BODY=0x10000,SESSION=0x20000,S=0x9000,index=1,audio=0x713190+index*40;
  for(const smoke of[false,true]){
    const memory=Buffer.from(image.memory);initializeVehicleAudioTables(memory);const put=(p,v)=>memory.writeInt32LE(v|0,p);
    memory.fill(0,BODY,BODY+0x4000);memory.fill(0,SESSION,SESSION+0x800);memory.fill(0,0x713190,0x7132e0);memory.fill(0,0x909300,0x90a548);memory.fill(0x35,S-512,S+128);
    put(0x5ecb1c,SESSION);put(0x909300+index*0x30c,BODY);put(BODY+0x11c,-1);put(SESSION+0x57c,4);memory[BODY+0x4b4]=1;
    put(BODY+0x5d4,70000*256);put(BODY+0x50c,70000*256);put(BODY+0x5f8,0xa0000);put(audio+4,127);memory.writeUInt16LE(1,audio+38);memory[BODY+0x718]=smoke?10:8;memory[BODY+0x71e]=4;
    let native,source;const machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(memory);machine.fs0=0;
    machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));
    machine.onInstruction=(p,x)=>{if(p===0x484bb0){native={site:x.bytes.readUInt32LE(x.r.ESP),args:Array.from({length:7},(_,i)=>x.bytes.readInt32LE(x.r.ESP+4+i*4)),registers:Object.fromEntries(['EAX','ECX','EDX','ESI','EDI'].map(k=>[k,x.r[k]>>>0]))};throw Error('Observed initial-loop creation.');}};
    machine.entry=0x485300;Object.assign(machine.r,{ECX:BODY,EDX:index,ESP:S,EBX:11,EBP:22,ESI:33,EDI:44});machine.bytes.writeInt32LE(-1,S);
    assert.throws(()=>machine.run(),/Observed initial-loop creation/);
    assert.throws(()=>updateVehicleAudio(BODY,index,{memory,scratchBase:S,nativeAudioCalls:true,entryRegisters:{EBX:11,EBP:22,ESI:33,EDI:44},handlers:{call484bb0(r){source=r;throw Error('Observed initial-loop creation.');}}}),/Observed initial-loop creation/);
    assert.equal(native.site,0x4860e0);assert.equal(source.nativeCaller.callAddress,0x4860db);assert.deepEqual(source.args,native.args);
    for(const[k,v]of Object.entries(native.registers))assert.equal(source.nativeCaller.entryRegisters[k]>>>0,v,k);
    assert.equal(source.nativeCaller.entryRegisters.EDI,70000);assert.equal(source.args[4],smoke?28:0xa0000);
  }
});

test('initial-loop binding rejects unsupported branch/register/counter and caller-word changes',async()=>{
  const image=await loadRelocatedAudioFixture(0x950000);
  for(const mutate of[
    f=>f.put(f.audio+4,0),f=>f.memory.writeUInt16LE(2,f.audio+38),f=>f.put(f.F+0x24,0),f=>f.put(f.F+0x28,0),
    f=>{f.request.nativeCaller.entryRegisters.ESI=0;},f=>{f.request.nativeCaller.entryRegisters.EDI=0;},f=>{f.request.nativeCaller.entryRegisters.EAX=0;},
    f=>f.put(f.E+16,7),f=>f.put(f.E,0),f=>{f.request.args[4]=0xa001c;f.put(f.E+20,0xa001c);}
  ]){const f=fixture(image,0),b=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:0x950000,numericalContext});f.stage();mutate(f);assert.throws(()=>b.handlers.call484bb0(f.request));assert.equal(b.creationEvents.length,0);}
});

const raw='analysis/native-parent-rtti-stock-capture-v6-20261024';
test('actualV6 initial-loop source reaches its populated code3 owner and stops at missing original input',{skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(raw),configuration=JSON.parse(await readFile(`${raw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  assert.throws(()=>replayNativeControlPrefix(pair.before,{...options,additionalRegions:[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress),...nativeControlTyreSound2ObservedRegions(pair.before,pair.moduleBaseAddress),...nativeParentWeatherCounterInputRegions(pair.before,pair.moduleBaseAddress)],createControlAudioBindings:createNativeControlSoundCreationBindings}),error=>{
    assert.match(error.message,/Uncaptured native memory at 0x10d71930 \(1168 bytes\)/);
    const event=error.nativeControlSoundCreation;assert.equal(event.kind,'surface-loop-start');assert.equal(event.completed,false);assert.equal(event.entryRegisters.ecx,3);assert.equal(event.entryRegisters.ebp,5);assert.equal(event.entryRegisters.esi,127);assert.equal(event.entryEsp,event.callerEntryEsp-116);return true;
  });
});
