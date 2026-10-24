import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {replaceNativeSoundSampleCallbackOnStack,copyNativeSoundPositionCallbackOnStack} from '../src/native-sound-callback.mjs';

const SAMPLE=0x1100000,STACK=0x1141000,OLD=0x1160000,INCOMING=0x1170000,ALLOCATED=0x1180000;
const NEW=0x1200000,DELETE=0x1200010,FAIL=0x1200020,SEH=0x12345678,ESI=0x23456789;
function fixture(image,alignment,options={}){
  //Constructed caller memory and explicit CRT outcomes; original PE HIGHLOW
  //relocations/instructions. This never runs the game or a native fixture.
  const actual=image.actual,m=Buffer.from(image.memory),S=STACK+alignment,sample=options.self?S+4-0x930:SAMPLE,storage=sample+0x930;
  const put=(p,v)=>m.writeUInt32LE(v>>>0,p),callback=(p,capture)=>{put(p,actual(0x5d0294));put(p+4,capture);put(p+8,0xfeed1256);};
  m.fill(0x69,sample,sample+0x9a8);m.fill(0x35,S-256,S+128);
  callback(OLD,0x99887766);callback(INCOMING,0x11223344);m.fill(0xad,ALLOCATED,ALLOCATED+12);
  callback(storage,0x55667788);put(storage+16,options.old==='inline'?storage:options.old==='heap'?OLD:0);
  put(S,actual(0x40dbc8));callback(S+4,0xaabbccdd);
  put(S+20,options.incoming==='null'?0:options.incoming==='heap'?INCOMING:S+4);
  if(options.self)put(storage+16,storage);
  if(options.unknownOld){put(OLD,actual(0x5d0294));put(actual(0x5d0294)+16,actual(0x40f270));put(storage+16,OLD);}
  if(options.unknownBase)put(actual(0x5d0294)+20,actual(0x40eea0));
  if(options.savedSehAlias){put(S+20,S-16);callback(S-16,0xfedcba98);}
  put(actual(0x56e220),NEW);put(actual(0x56e210),DELETE);put(actual(0x56e200),FAIL);
  const spans=[[sample,0x9a8],[S-256,384],[OLD,12],[INCOMING-16,64],[ALLOCATED,12],[actual(0x5d0294),44],...[0x56e220,0x56e210,0x56e200].map(p=>[actual(p),4])];
  const source=createCapturedMemory(spans.map(([address,n])=>({address,bytes:Buffer.from(m.subarray(address,address+n))}))),nativeTls={sehWord:SEH},admissions=[];
  const runtime={memory:source.memory,moduleBaseAddress:actual(0x400000),scratchBase:S,entryRegisters:{ESI},nativeTls,onSoundSourceRead:r=>admissions.push(r)};
  //Tiny explicit CRT return stubs ensure the interpreter executes a real CALL
  //push and RET. No game algorithm is replaced by a stub or expected output.
  const instructions=[...image.instructions,...[NEW,DELETE,FAIL].map(address=>({address,op:'RET',args:[]}))].sort((a,b)=>a.address-b.address);
  const machine=new BoundedX86(instructions);machine.bytes=m;machine.entry=actual(0x4ad420);machine.fs0=SEH;Object.assign(machine.r,{ESP:S,ECX:sample,ESI,EBX:0x3456789a,EBP:0x456789ab,EDI:0x56789abc});
  const calls=[],sourceCalls=[];
  machine.onInstruction=(p,x)=>{
    assert(!image.unresolvedRelocations.has(p),`Unresolved PE operand0x${p.toString(16)}`);
    if(p===actual(0x40dbc8))throw Error('Constructed callback caller observation.');
    if(p===actual(options.unknownOld?0x40f270:options.unknownBase?0x40eea0:0x0))throw Error('Constructed unknown callback boundary.');
    if([NEW,DELETE,FAIL].includes(p)){
      const top=x.r.ESP>>>0,args=p===FAIL?[]:[x.bytes.readUInt32LE(top+4)];
      calls.push({name:p===NEW?'operatorNew':p===DELETE?'operatorDelete':'allocationFailure',args,entryEsp:top,returned:x.bytes.readUInt32LE(top)});
      if(options.unboundLibrary||p===FAIL)throw Error('Constructed external callback boundary.');
      if(p===NEW){assert.equal(args[0],12);x.r.EAX=options.allocationFails?0:options.allocationAddress??ALLOCATED;}
    }
  };
  if(!options.unboundLibrary)runtime.services={libraryCall:(name,args,r)=>{
    const row={name,args,entryEsp:r.scratchBase,returned:source.memory.readUInt32LE(r.scratchBase)};sourceCalls.push(row);
    assert.equal(r.nativeSoundCallbackCall.target,name==='operatorNew'?NEW:name==='operatorDelete'?DELETE:FAIL);
    if(name==='allocationFailure')throw Error('Constructed source allocation failure.');
    return name==='operatorNew'?(options.allocationFails?0:options.allocationAddress??ALLOCATED):undefined;
  }};
  return{...source,image,actual,machine,runtime,nativeTls,S,sample,storage,spans,calls,sourceCalls,admissions};
}
function compare(f){
  for(const[p,n]of f.spans)assert.deepEqual(f.span(p,n),f.machine.bytes.subarray(p,p+n),`all declared bytes0x${p.toString(16)}`);
  assert.equal(f.nativeTls.sehWord,f.machine.fs0>>>0);
}

test('native4ad420 clones/clears/destroys the real inline callback with exact shared stack, SEH and relocated PE words',async()=>{
  let cases=0;
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base);
    for(const alignment of[0,4,8,12])for(const options of[{}, {old:'inline'}, {old:'heap'}, {incoming:'null'}, {old:'inline',incoming:'null'}, {incoming:'heap'}, {old:'heap',incoming:'heap'}, {self:true}]){
      const f=fixture(image,alignment,options),unused=f.memory.readUInt32LE(f.storage+8);
      assert.throws(()=>f.machine.run(),/Constructed callback caller observation/);
      assert.equal(replaceNativeSoundSampleCallbackOnStack(f.sample,f.runtime),undefined);compare(f);
      assert.equal(f.machine.r.ESP,f.S+28);assert.equal(f.machine.r.ESI>>>0,ESI);assert.equal(f.nativeTls.sehWord,SEH);
      assert.equal(f.memory.readUInt32LE(f.storage+8),unused);assert.deepEqual(f.sourceCalls,f.calls);
      if(!options.self&&options.incoming!=='null')assert.equal(f.memory.readUInt32LE(f.storage+16),options.incoming==='heap'?ALLOCATED:f.storage);
      cases++;
    }
  }
  assert.equal(cases,64);
});

test('inline cloning preserves ordered overlapping capture reads and the unused third DWORD',async()=>{
  for(const base of[0x400000,0x320000]){
    const image=await loadRelocatedAudioFixture(base),actual=image.actual;
    for(const offset of[0,4,8,-4]){
      const f=fixture(image,0),C=f.S-64,callback=INCOMING,destination=callback+offset;
      f.machine.entry=actual(0x40f240);f.machine.r.ESP=C;f.machine.r.ECX=callback;f.machine.r.ESI=ESI;
      f.machine.bytes.writeUInt32LE(destination,C+4);f.machine.bytes.writeUInt32LE(actual(0x40dbc8),C);
      f.memory.writeUInt32LE(destination,C+4);f.memory.writeUInt32LE(actual(0x40dbc8),C);
      assert.throws(()=>f.machine.run(),/Constructed callback caller observation/);
      assert.equal(copyNativeSoundPositionCallbackOnStack(callback,{...f.runtime,scratchBase:C}),destination);compare(f);
      assert.equal(f.machine.r.ESP,C+8);assert.equal(f.machine.r.EAX>>>0,destination);
      if(offset===4)assert.equal(f.memory.readUInt32LE(destination+4),actual(0x5d0294));
    }
  }
});

test('unknown old/base virtual methods fail after their genuine CALL stack and SEH writes',async()=>{
  for(const base of[0x400000,0x320000])for(const options of[{unknownOld:true},{old:'inline',unknownBase:true}]){
    const f=fixture(await loadRelocatedAudioFixture(base),4,options);
    assert.throws(()=>f.machine.run(),/Constructed unknown callback boundary/);
    assert.throws(()=>replaceNativeSoundSampleCallbackOnStack(f.sample,f.runtime),/target.*not reconstructed/);compare(f);
    assert.equal(f.nativeTls.sehWord,f.S-12);
  }
});

test('uncaptured allocator/deleting services stay strict at exact genuine ABI boundaries',async()=>{
  for(const base of[0x400000,0x320000])for(const options of[{incoming:'heap',unboundLibrary:true},{old:'heap',unboundLibrary:true}]){
    const f=fixture(await loadRelocatedAudioFixture(base),0,options);
    assert.throws(()=>f.machine.run(),/Constructed external callback boundary/);
    assert.throws(()=>replaceNativeSoundSampleCallbackOnStack(f.sample,f.runtime),/requires library service/);compare(f);
    assert.equal(f.nativeTls.sehWord,f.S-12);assert.equal(f.calls.length,1);
    const call=f.calls[0];assert.equal(call.entryEsp,f.machine.r.ESP>>>0);assert.equal(f.memory.readUInt32LE(call.entryEsp),call.returned);
    assert.deepEqual(f.span(ALLOCATED,12),Buffer.alloc(12,0xad));
  }
});

test('a failed real allocation reaches the genuine failfast import without storing at NULL',async()=>{
  const f=fixture(await loadRelocatedAudioFixture(0x320000),0,{incoming:'heap',allocationFails:true});
  assert.throws(()=>f.machine.run(),/Constructed external callback boundary/);
  assert.throws(()=>replaceNativeSoundSampleCallbackOnStack(f.sample,f.runtime),/Constructed source allocation failure/);compare(f);
  assert.deepEqual(f.sourceCalls,f.calls);assert.equal(f.calls.at(-1).name,'allocationFailure');
});

test('SEH restoration reads the carried saved word after an explicit constructed allocation alias',async()=>{
  //A synthetic alias stress test, not a claim that the CRT allocates on stack.
  //It distinguishes the native live restore from caching the original FS word.
  for(const base of[0x400000,0x320000]){
    const f=fixture(await loadRelocatedAudioFixture(base),0,{incoming:'heap',allocationAddress:STACK-12});
    assert.throws(()=>f.machine.run(),/Constructed callback caller observation/);
    replaceNativeSoundSampleCallbackOnStack(f.sample,f.runtime);compare(f);
    assert.equal(f.nativeTls.sehWord,f.actual(0x5d0294));
    assert.equal(f.memory.readUInt32LE(f.storage+16),f.S-12);
  }
});

test('missing saved ESI or native TLS is rejected before any callback/stack stores',()=>{
  const m=Buffer.alloc(0x10000,0x69),before=Buffer.from(m);
  for(const runtime of[{memory:m,scratchBase:0x9000,nativeTls:{sehWord:SEH}},{memory:m,scratchBase:0x9000,entryRegisters:{ESI}}]){
    assert.throws(()=>replaceNativeSoundSampleCallbackOnStack(0x1000,runtime),/requires explicit x86/);assert.deepEqual(m,before);
  }
});
