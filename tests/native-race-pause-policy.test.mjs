import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {runNativeRacePausePolicy,runNativeRaceMusicState,announceNativeReadyPeers,updateNativeNetworkCountdown} from '../src/native-race-pause-policy.mjs';
import {loadNativeRacePauseProgram,createNativeRacePauseFixture,compareNativeRacePauseFixture,compareNativeRacePauseBoundary,verifyNativeRacePauseInstructions} from '../tools/verify-native-race-pause-instructions.mjs';
const images=new Map(),image=base=>{if(!images.has(base))images.set(base,loadNativeRacePauseProgram(base));return images.get(base);};

test('genuine pause/music/manager and small network children match full original instructions and whole constructed memory under three PE bases',async()=>{
  const r=await verifyNativeRacePauseInstructions();assert.equal(r.matched,true);assert.equal(r.fixtures,387);assert.equal(r.syntheticWriteFileCalls,39);assert.ok(r.instructionSteps>7000);
  assert.equal(r.authority,'constructed-inputs-with-retained-original-instructions');assert.ok(r.evidence.every(e=>e.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
});

test('real missing UI/render/network/timer branches stop at exact source-produced original CALL entry with whole memory preserved',async()=>{
  const p=await image(0x730000);
  for(const[options,target]of[
    [{ecx:1,ui:1},0x477b00],
    [{ecx:0,ui:1},0x484b20],
    [{network:1,index:6},0x4723f0],
    [{network:0x481},0x489cd0],
    [{entry:0x473060,network:0xc1},0x4a0420],
    [{network:0x401,sample:100},0x49f4f0]
  ])assert.equal(compareNativeRacePauseBoundary(createNativeRacePauseFixture(p,options),target).targetAddress,p.actual(target));
});

test('ready-peer scan respects every live active/state pair and does not initialize unused packet padding',async()=>{
  for(const base of[0x400000,0x730000])for(const slot of[0,2,5]){
    const p=await image(base),f=createNativeRacePauseFixture(p,{entry:0x473060,network:0xc1});f.memory.writeUInt32LE(0,p.actual(0x6e7ef8)+slot*0x67c);
    const before=Buffer.from(f.memory.subarray(f.scratchBase-8,f.scratchBase));const result=compareNativeRacePauseFixture(f);assert.equal(result.output.eax,p.actual(0x6e7ef8)+slot*0x67c);
    assert.deepEqual(f.memory.subarray(f.scratchBase-8,f.scratchBase),before);
  }
  const p=await image(0x730000),f=createNativeRacePauseFixture(p,{entry:0x473060,network:0xc1});
  let observed;
  f.calls={call4a0420(request){observed=request;return {eax:1};}};
  const before=Buffer.from(f.memory.subarray(f.scratchBase-8,f.scratchBase));announceNativeReadyPeers(f);
  assert.equal(observed.runtime.scratchBase,f.scratchBase-20);assert.deepEqual(observed.args,[8,17]);assert.equal(observed.edx,f.scratchBase-8);
  assert.equal(f.memory[f.scratchBase-8],0xab);assert.deepEqual(f.memory.subarray(f.scratchBase-7,f.scratchBase),before.subarray(1),'Seven packet padding bytes remain carried input.');
});

test('countdown uses unsigned deadline, preserves ESI, and host path never receives a fabricated timer',async()=>{
  const p=await image(0x730000);
  for(const[sample,expected,cleared]of[[99,1,false],[100,3,true],[0xffffffff,3,true]]){
    const f=createNativeRacePauseFixture(p,{entry:0x4725b0,network:0x1400,sample}),r=updateNativeNetworkCountdown(f);
    assert.equal(r.eax,expected);assert.equal(r.registers.esi,f.entryRegisters.ESI);assert.equal(f.memory.readUInt32LE(p.actual(0x6eafe0)),cleared?0:0x1400);
  }
  const f=createNativeRacePauseFixture(p,{entry:0x4725b0,network:0x1481,sample:101});
  assert.throws(()=>updateNativeNetworkCountdown(f),e=>e.nativeRacePauseBoundary?.preferredTarget===0x489cd0&&f.memory.readUInt32LE(f.scratchBase-16)===p.actual(0x472615));
  assert.equal(f.memory.readUInt32LE(p.actual(0x6eafe0)),0x81,'Real game flag writes precede the next missing dependency.');
});

test('XOR CL preserves source-derived upper ECX and a default offline call uses no game-answer callbacks',async()=>{
  const p=await image(0x730000),f=createNativeRacePauseFixture(p,{network:0x12340001}),events=[];f.observeNativePause=e=>{events.push(e);return 0xdeadbeef;};
  const r=runNativeRacePausePolicy(f),music=events.find(e=>e.targetAddress===p.actual(0x4843a0));assert.equal(music.entryRegisters.ECX,0x12340000);assert.equal(r.eax,0);
  assert.equal(f.memory.readUInt32LE(p.actual(0x6e6b4c)),0);assert.equal(f.memory[f.manager+0x821],0);assert.equal(r.registers.esi,f.entryRegisters.ESI);
  assert.equal(f.memory[f.manager+0x820],0);assert.equal(f.memory[f.manager+0x822],0);
});

test('raw high-bit ECX survives music command publication and WriteFile is the only explicit external outcome',async()=>{
  const p=await image(0x320000);
  for(const[ecx,music,command]of[[0x80000000,2,0x80000003],[0xffffff01,1,0xffffff09]]){
    const f=createNativeRacePauseFixture(p,{entry:0x4843a0,ecx,music,muted:0});let seen;
    f.services={platformCall(name,args,r){seen={name,args,r};f.memory.writeUInt32LE(1,args[3]);return 0;}};
    const r=runNativeRaceMusicState(f);assert.equal(seen.name,'WriteFile');assert.equal(seen.r.entryRegisters.ECX,command);assert.equal(seen.r.entryRegisters.EAX,seen.args[1]);assert.equal(seen.r.scratchBase,f.scratchBase-36);
    assert.equal(r.eax,music===2?1:2);assert.equal(r.registers.ecx,undefined,'External volatile ECX is not guessed.');
  }
});

test('missing original manager/vtable/source bytes and wrong virtual target fail; saved pointer-shaped values stay actual',async()=>{
  const p=await image(0x730000),f=createNativeRacePauseFixture(p),bad=createNativeRacePauseFixture(p);bad.memory.writeUInt32LE(p.actual(0x4a60d1),p.actual(0x5d4190)+12);
  assert.throws(()=>runNativeRacePausePolicy(bad),e=>e.nativeRacePauseBoundary?.preferredTarget===0x4a60d0);
  const spans=[[f.scratchBase-512,544],[p.actual(0x6eafe0),4],[p.actual(0x9020a0),4],[p.actual(0x5ecb1c),4],[f.session+0x57c,4],[p.actual(0x6e6bd8),2],[p.actual(0x714b08),4]];
  const {memory}=createCapturedMemory(spans.map(([address,length])=>({address,bytes:Buffer.from(f.memory.subarray(address,address+length))})));
  assert.throws(()=>runNativeRacePausePolicy({...f,memory}),/Uncaptured/);
  for(const name of['ECX','EBX','EBP','ESI','EDI']){const entryRegisters={...f.entryRegisters};delete entryRegisters[name];assert.throws(()=>runNativeRacePausePolicy({...f,entryRegisters}),/incoming|live/);}
  const q=createNativeRacePauseFixture(p);q.entryRegisters.ESI=0x9020a0;const r=runNativeRacePausePolicy(q);assert.equal(r.registers.esi,0x9020a0,'A saved actual pointer is not rebased as a fixed operand.');
});
