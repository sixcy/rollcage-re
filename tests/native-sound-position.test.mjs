import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {updateNativeSoundChannelPositionOnStack} from '../src/native-sound-position.mjs';

const CHANNEL=0x1100000,SOURCE=0x1110000,POSITION=0x1120000,VELOCITY=0x1130000,SECOND_SOURCE=0x1181000,SECOND_VELOCITY=0x1180000;
const literalAddresses=[0x5ecdb4,0x5dc5b8,0x5ecdb0,0x5dc5d0,0x5dc5e8];
const context=decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x1fa5});
function fixture(image,alignment,options={}){
  //Synthetic game inputs; retained original instructions and real PE HIGHLOW
  //relocations. No native game, OS or substitute game-method service runs.
  const actual=image.actual,m=Buffer.from(image.memory),put=(p,v)=>m.writeUInt32LE(v>>>0,p),S=options.entryEsp??0x1141000+alignment,G=Math.floor((S-4)/8)*8-24;
  const source=options.sourceOverlapsWrapper?CHANNEL-0x8f8:options.outputOverlapsStack?G+12-0x8f8:SOURCE;
  const position=options.nullPosition?0:options.inputOverlapsStack?G+12:POSITION,velocity=options.nullVelocity?0:VELOCITY;
  m.fill(0x35,S-512,S+128);m.fill(0x69,source,source+0x9a8);m.fill(0x69,SECOND_SOURCE,SECOND_SOURCE+0x9a8);
  put(source,actual(0x5d3f60));put(SECOND_SOURCE,actual(0x5d3f60));put(CHANNEL,source);put(CHANNEL+4,position);put(CHANNEL+8,velocity);
  const coordinates=options.position??[16777217,-16777217,2147483647],speeds=options.velocity??[3,4,0];
  coordinates.forEach((v,i)=>m.writeInt32LE(v,position?position+i*4:POSITION+i*4));
  speeds.forEach((v,i)=>m.writeInt32LE(v,VELOCITY+i*4));[2,3,4].forEach((v,i)=>m.writeInt32LE(v,SECOND_VELOCITY+i*4));
  if(options.constants)options.constants.forEach((value,i)=>put(actual(literalAddresses[i]),value));
  if(options.sourceOverlapsWrapper){
    [1,0,1].forEach((v,i)=>m.writeInt32LE(v,POSITION+i*4));
    put(actual(0x5ecdb4),SECOND_SOURCE);put(actual(0x5dc5b8),SECOND_VELOCITY);
  }
  if(options.unknownTarget)put(actual(0x5d3f60)+8,actual(0x4ad6a0));
  put(S,actual(0x40dba8));
  const incoming={EBP:0x12345678,ESI:0x23456789};
  const spans=[[CHANNEL,12],[source,0x9a8],[SECOND_SOURCE,0x9a8],[POSITION,12],[VELOCITY,12],[SECOND_VELOCITY,12],[S-512,640],[actual(0x5d3f60),0x88],...literalAddresses.map(p=>[actual(p),4])];
  const rows=spans.map(([address,length])=>({address,bytes:Buffer.from(m.subarray(address,address+length))}));
  const sourceMemory=createCapturedMemory(rows),admissions=[];
  const runtime={memory:sourceMemory.memory,moduleBaseAddress:image.actual(0x400000),scratchBase:S,entryRegisters:incoming,numericalContext:context,onSoundSourceRead:r=>admissions.push({...r})};
  const machine=new BoundedX86(image.instructions);machine.bytes=m;machine.entry=actual(0x40d6d0);Object.assign(machine.r,{ESP:S,ECX:CHANNEL,...incoming});
  const calls=[];machine.onInstruction=(p,x)=>{
    assert(!image.unresolvedRelocations.has(p));
    if([0x4ad730,0x4ad700].some(a=>p===actual(a)))calls.push({target:p,source:x.r.ECX>>>0,entryEsp:x.r.ESP>>>0,argument:x.bytes.readUInt32LE(x.r.ESP+4),returned:x.bytes.readUInt32LE(x.r.ESP)});
    if(p===actual(options.unknownTarget?0x4ad6a0:0x40d7cf))throw Error('Constructed sound-position observation.');
  };
  return{...sourceMemory,actual,runtime,machine,S,G,source,spans,calls,admissions};
}
function compare(f){for(const[p,n]of f.spans)assert.deepEqual(f.span(p,n),f.machine.bytes.subarray(p,p+n),`span0x${p.toString(16)}`);}

test('native40d6d0 and real vector setters match all declared bytes and stack for both alignments/ASLR',async()=>{
  const values=[
    {},{nullPosition:true,nullVelocity:true},
    {nullVelocity:true},
    {nullPosition:true,constants:[0x3f800000,0x3f800000,0x3f800000,0x3f800000,0x41c80000]}, //Equal threshold25 retains3/4.
    {nullPosition:true,constants:[0x3f800000,0x3f800000,0x3f800000,0x3f800000,0x41c80001]}, //Next float clears all lanes.
    {nullPosition:true,constants:[0x3f800000,0x3f800000,0x3f800000,0x3f800000,0x7fc54321]}, //Unordered threshold keeps finite3/4.
    {constants:[0x7fc23456,0x7f812345,0x7fc23456,0x7f812345,0x7fc54321]},
    {position:[0,0,0],velocity:[0,0,0],constants:[0x7f800000,0x3f800000,0x7f800000,0x3f800000,0x3f800000]},
    {position:[0,0,0],velocity:[0,0,0],constants:[0x80000000,0x80000000,0x80000000,0x80000000,0]},
    {position:[1,2,3],velocity:[1,2,3],constants:[1,2,3,4,0]},
  ];let cases=0;
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const alignment of[0,4,8,12])for(const options of values){
      const f=fixture(image,alignment,options);assert.throws(()=>f.machine.run(),/Constructed sound-position observation/);
      assert.equal(updateNativeSoundChannelPositionOnStack(CHANNEL,f.runtime),undefined);compare(f);
      assert.equal(f.machine.r.ESP,f.S);assert.equal(f.memory.readUInt32LE(f.S),f.actual(0x40dba8));
      assert.equal(f.machine.r.EBP>>>0,f.runtime.entryRegisters.EBP);assert.equal(f.machine.r.ESI>>>0,f.runtime.entryRegisters.ESI);
      for(const call of f.calls){assert.equal(call.entryEsp,f.G-8);assert.equal(call.argument,f.G+8);assert.equal(call.returned,f.actual(call.target===f.actual(0x4ad730)?0x40d738:0x40d7cb));}
      cases++;
    }
  }
  assert.equal(cases,80);
});

test('the position Z scale reload observes the earlier X local store through a real fixed-literal alias',async()=>{
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base),f=fixture(image,0,{entryEsp:image.actual(0x5dc5b8)+20,nullVelocity:true,position:[2,3,5],constants:[0x3f000000,0x3e800000,0x3f800000,0x3f800000,0]});
    assert.equal(f.G+8,f.actual(0x5dc5b8));assert.throws(()=>f.machine.run(),/Constructed sound-position observation/);
    updateNativeSoundChannelPositionOnStack(CHANNEL,f.runtime);compare(f);
    assert.deepEqual([0,4,8].map(o=>f.memory.readFloatLE(f.source+0x8f8+o)),[1,.75,5]);
  }
});

test('null position and velocity require only original wrapper and saved-stack bytes',()=>{
  const S=0x9000,G=Math.floor((S-4)/8)*8-24,source=createCapturedMemory([{address:CHANNEL,bytes:Buffer.alloc(12)},{address:S-512,bytes:Buffer.alloc(640,0x35)}]);
  const before=Buffer.from(source.span(S-512,640));before.writeUInt32LE(123,S-4-(S-512));before.writeUInt32LE(456,G-(S-512));
  updateNativeSoundChannelPositionOnStack(CHANNEL,{memory:source.memory,scratchBase:S,entryRegisters:{EBP:123,ESI:456},numericalContext:context});
  assert.deepEqual(source.span(S-512,640),before);
});

test('live input/output aliases preserve captures, forward setter overlap and wrapper/source reloads',async()=>{
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const alignment of[0,4])for(const options of[
      {inputOverlapsStack:true,nullVelocity:true,position:[1,2,3]},
      {outputOverlapsStack:true,nullVelocity:true,position:[1,2,3]},
      {sourceOverlapsWrapper:true,nullVelocity:true},
    ]){
      const f=fixture(image,alignment,options);assert.throws(()=>f.machine.run(),/Constructed sound-position observation/);
      updateNativeSoundChannelPositionOnStack(CHANNEL,f.runtime);compare(f);
      if(options.sourceOverlapsWrapper){
        assert.deepEqual(f.calls.map(c=>c.source),[f.source,SECOND_SOURCE]);
        assert.equal(f.memory.readUInt32LE(CHANNEL+8),SECOND_VELOCITY);
      }
    }
  }
});

test('unknown source method fails at its true CALL entry with already-computed stack words',async()=>{
  for(const base of[0x400000,0x320000]){
    const f=fixture(await loadRelocatedAudioFixture(base),0,{unknownTarget:true});
    assert.throws(()=>f.machine.run(),/Constructed sound-position observation/);
    assert.throws(()=>updateNativeSoundChannelPositionOnStack(CHANNEL,f.runtime),/source virtual8 target.*not reconstructed/);compare(f);
    assert.equal(f.memory.readUInt32LE(f.G-8),f.actual(0x40d738));
  }
});

test('unsupported SSE controls or unknown saved registers fail before writing shared state',async()=>{
  const image=await loadRelocatedAudioFixture(0x400000);
  for(const mxcsr of[0x3f80,0x5f80,0x7f80,0x9f80,0x1fc0,0x1f00]){
    const f=fixture(image,0),before=f.spans.map(([p,n])=>Buffer.from(f.span(p,n)));
    f.runtime.numericalContext=decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr});
    assert.throws(()=>updateNativeSoundChannelPositionOnStack(CHANNEL,f.runtime),/captured masked nearest-even SSE/);
    f.spans.forEach(([p,n],i)=>assert.deepEqual(f.span(p,n),before[i]));
  }
  const f=fixture(image,0),before=Buffer.from(f.span(f.S-512,640));delete f.runtime.entryRegisters.ESI;
  assert.throws(()=>updateNativeSoundChannelPositionOnStack(CHANNEL,f.runtime),/incoming ESI/);assert.deepEqual(f.span(f.S-512,640),before);
});
