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
import {replayNativeControlPrefix} from '../tools/lib/native-frame-control-continuation.mjs';

const numericalContext=decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x1f80});
function callerFixture(image,alignment,{slip=493160,rpm=8551,mode=8,oldSmoke=0,index=2}={}){
  const actual=image.actual,body=0x1100000,bank=0x1108000,S=0x1110000+alignment,F=S-84,E=S-116,ebp=index*5,audio=0x713190+index*40;
  const known=[[0x6f2414,12],[audio,40],[0x5750d0,20]],rows=known.map(([p,length])=>({address:actual(p),bytes:Buffer.from(image.memory.subarray(actual(p),actual(p)+length))}));
  rows.push({address:body,bytes:Buffer.alloc(0x3e78)},{address:bank,bytes:Buffer.alloc(256)},{address:S-512,bytes:Buffer.alloc(640,0x35)});
  const captured=createCapturedMemory(rows,{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))}),m=captured.memory,put=(p,value)=>m.writeUInt32LE(value>>>0,p);
  put(0x6f2414,bank);put(0x6f2418,bank+256);put(0x6f241c,bank+256);put(audio+4,127);m.writeUInt16LE(5,audio+38);m.writeUInt16LE(rpm&65535,audio+24);m.writeUInt16LE(0,audio+28);
  m.writeInt32LE(slip,body+0x5f8);m.writeInt32LE(0,body+0x530);m[body+0x718]=mode;m[body+0x71e]=oldSmoke;
  put(F+0x3c,slip);put(F+0x18,0);put(F+0x28,0);
  const first=m.readInt32LE(0x5750d0),pitch=m.readInt32LE(0x5750dc),allow=m.readInt32LE(0x5750e0);
  const clipped=Math.min(slip,0x1e0000),smoke=(clipped>>16)>6&&mode===10&&oldSmoke<=8,amount=((((clipped>>18)&2)|1)+4),unused=smoke?amount<<2:clipped;
  const args=[0,pitch<<16>>16,0,7,unused,0,0],entryRegisters={EBX:body,EBP:ebp,ESI:127,EDI:rpm,ECX:first&255,EDX:body+0x34};
  const nativeCaller={callerAddress:actual(0x485300),callerEntryEsp:S,callAddress:actual(0x48608f),returnAddress:actual(0x486094),entryEsp:E,entryRegisters};
  const request={memory:m,ecx:first&255,edx:body+0x34,args,scratchBase:E,nativeCaller,runtime:{memory:m,nativeAudioCalls:true,scratchBase:E,nativeCaller}};
  const stage=()=>{
    put(F+0x3c,first);put(F+0x28,m.readUInt32LE(0x5750d4));put(F+0x2c,m.readUInt32LE(0x5750d8));put(F+0x14,pitch);put(F+0x20,allow);put(F+0x24,clipped>>16);
    if(smoke){m.writeUInt16LE(0x108,body+0x71e);m[body+0x71d]=40;m.writeUInt16LE(amount*10,body+0x71a);}
    put(E,actual(0x486094));args.forEach((value,i)=>put(E+4+i*4,value));
  };
  return{...captured,actual,body,bank,S,F,E,audio,request,stage,slip,unused,smoke,spans:[...known.map(([p,n])=>[actual(p),n]),[body,0x3e78],[bank,256],[S-512,640]]};
}

test('tyre onset caller/emitter/dispatcher shared state matches retained code with real PE relocation',async()=>{
  assert.equal((await verifyNativeControlSoundCreationEvidence()).evidenceIds.length,3);let cases=0;
  for(const base of [0x400000,0x6e0000]){
    const image=await loadRelocatedAudioFixture(base),machine=new BoundedX86(image.instructions);
    for(const alignment of [0,4,8,12])for(const values of [{},{slip:0xa0000,rpm:70000,mode:10,oldSmoke:4},{slip:0x1c0000,rpm:-40000,mode:10,oldSmoke:0},{slip:0xa0000,rpm:-1000,mode:10,oldSmoke:9}]){
      const f=callerFixture(image,alignment,values);machine.reset();machine.bytes=Buffer.from(image.memory);for(const[p,n]of f.spans)f.span(p,n).copy(machine.bytes,p);
      machine.entry=f.actual(0x485f3e);Object.assign(machine.r,{ESP:f.F,EBX:f.body,EBP:10,EDI:(values.rpm??8551),ESI:0x12345678});let incoming;
      machine.onInstruction=(p,x)=>{assert(!image.unresolvedRelocations.has(p));if(p===f.actual(0x484bb0))incoming=Object.fromEntries(['EAX','EBX','ECX','EDX','EBP','ESI','EDI','ESP'].map(key=>[key,x.r[key]>>>0]));if(p===f.actual(0x486094))throw Error('Constructed tyre return observation.');};
      assert.throws(()=>machine.run(),/Constructed tyre return observation/);assert(incoming);
      f.stage();const bindings=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:base,numericalContext});
      assert.equal(bindings.handlers.call484bb0(f.request),127);const event=bindings.creationEvents[0];assert(event.completed);
      for(const[key,value]of Object.entries(event.entryRegisters))assert.equal(value>>>0,incoming[key.toUpperCase()],`${key}/${base.toString(16)}/${alignment}`);
      assert.equal(event.entryEsp,incoming.ESP);
      for(const[p,n]of f.spans)assert.deepEqual(f.span(p,n),machine.bytes.subarray(p,p+n));
      cases++;
    }
  }
  assert.equal(cases,32);
});

test('source485300 carries full RPM/surface and the real SAR-before-CL smoke argument',async()=>{
  const image=await loadRelocatedAudioFixture(0x400000),BODY=0x10000,SESSION=0x20000,S=0x9000,index=2,audio=0x713190+index*40;
  for(const smoke of [false,true]){
    const memory=Buffer.from(image.memory);initializeVehicleAudioTables(memory);const put=(p,v)=>memory.writeInt32LE(v|0,p);
    memory.fill(0,BODY,BODY+0x4000);memory.fill(0,SESSION,SESSION+0x800);memory.fill(0,0x713190,0x7132e0);memory.fill(0,0x909300,0x90a548);memory.fill(0x35,S-512,S+128);
    put(0x5ecb1c,SESSION);put(0x909300+index*0x30c,BODY);put(BODY+0x11c,-1);put(SESSION+0x57c,4);memory[BODY+0x4b4]=1;put(BODY+0x5d4,70000*256);put(BODY+0x50c,70000*256);put(BODY+0x5f8,0xa0000);memory[BODY+0x718]=smoke?10:8;memory[BODY+0x71e]=4;memory.writeUInt16LE(5,audio+38);
    const machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(memory);machine.fs0=0;machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));
    let native,source;machine.onInstruction=(p,x)=>{if(p===0x484bb0){native={ecx:x.r.ECX>>>0,args:Array.from({length:7},(_,i)=>x.bytes.readInt32LE(x.r.ESP+4+i*4)),registers:{ESI:x.r.ESI>>>0,EDI:x.r.EDI>>>0}};throw Error('Observe actual tyre source call.');}};
    machine.entry=0x485300;Object.assign(machine.r,{ECX:BODY,EDX:index,ESP:S,EBX:11,EBP:22,ESI:33,EDI:44});machine.bytes.writeInt32LE(-1,S);assert.throws(()=>machine.run(),/Observe actual tyre source call/);
    assert.throws(()=>updateVehicleAudio(BODY,index,{memory,scratchBase:S,nativeAudioCalls:true,entryRegisters:{EBX:11,EBP:22,ESI:33,EDI:44},handlers:{call484bb0(request){source=request;throw Error('Observe actual tyre source call.');}}}),/Observe actual tyre source call/);
    assert.equal(source.ecx,native.ecx);assert.deepEqual(source.args,native.args);assert.equal(source.nativeCaller.entryRegisters.ESI,native.registers.ESI);assert.equal(source.nativeCaller.entryRegisters.EDI>>>0,native.registers.EDI);
    assert.equal(source.nativeCaller.entryRegisters.EDI,70000,'Full32-bit RPM is retained rather than reconstructed from truncated audio WORD.');
    assert.equal(source.args[4],smoke?28:0xa0000);assert.notEqual(smoke?source.args[4]:-1,0xa001c,'The old masked-out high-slip argument is not retained.');
  }
});

test('tyre binding rejects altered source registers, call words and old smoke argument without clearing a populated bank',async()=>{
  const image=await loadRelocatedAudioFixture(0x6e0000);
  for(const mutate of [f=>{f.request.nativeCaller.entryRegisters.EDI=1;},f=>{f.request.nativeCaller.entryRegisters.ESI=0;},f=>{f.memory.writeUInt32LE(6,f.E+16);},f=>{f.request.args[4]=0xa001c;f.memory.writeUInt32LE(0xa001c,f.E+20);}]){
    const f=callerFixture(image,0,{slip:0xa0000,mode:10,oldSmoke:4});f.stage();mutate(f);const b=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:0x6e0000,numericalContext});assert.throws(()=>b.handlers.call484bb0(f.request));assert.equal(b.creationEvents.length,0);
  }
  const f=callerFixture(image,0);f.stage();f.memory.writeUInt32LE(0x1230000,f.bank+8);
  const b=createNativeControlSoundCreationBindings({memory:f.memory,moduleBaseAddress:0x6e0000,numericalContext,nativeTls:{sehWord:0}});
  assert.throws(()=>b.handlers.call484bb0(f.request),/Uncaptured native memory at 0x1230000 \(1168 bytes\)/);
  assert.equal(f.memory.readUInt32LE(f.bank+8),0x1230000);assert.equal(b.creationEvents[0].completed,false);
});

const raw='analysis/native-parent-rtti-stock-capture-v3-20261024';
test('actual V3 tyre source call reaches its populated owner and strictly stops at missing original input',{skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(raw),configuration=JSON.parse(await readFile(`${raw}/configuration.json`,'utf8')),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  assert.throws(()=>replayNativeControlPrefix(pair.before,{...options,additionalRegions:[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress)],createControlAudioBindings:createNativeControlSoundCreationBindings}),error=>{
    assert.match(error.message,/Uncaptured native memory at 0x10d1feb8 \(1168 bytes\)/);const event=error.nativeControlSoundCreation;assert.equal(event.kind,'tyre-onset');assert.equal(event.completed,false);assert.equal(event.entryRegisters.edi,8551);assert.equal(event.entryRegisters.esi,127);assert.equal(event.entryRegisters.ecx,2);assert.deepEqual(event.args,[0,1200,0,7,493160,0,0]);return true;
  });
});
