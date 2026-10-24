import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {selectNativeSoundChannelOnStack} from '../src/native-effect-emitter.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';

const OWNER=0x1100000,VECTOR=0x1120000,WRAPPERS=0x1130000,SOURCES=0x1140000,SEH=0x12345678;
async function fixture(base,alignment,{states=[{state:0}],position=0,velocity=0,copyAliasesOwner=false,unknownTarget=false}={}){
  //All objects and TLS below are constructed inputs. The executable image and
  //HIGHLOW relocations are original read-only PE bytes, not runtime capture.
  const image=await loadRelocatedAudioFixture(base),actual=image.actual,m=image.memory,C=0x1111000+alignment,F=C-44,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  m.fill(0x35,C-512,C+128);put(C,0xffffffff);put(C+4,position);put(C+8,velocity);
  m.fill(0,OWNER,OWNER+0x490);for(let i=0;i<0x460;i++)m[OWNER+0x10+i]=(i*37+19)&255;
  put(OWNER+4,VECTOR);put(OWNER+8,VECTOR+states.length*4);put(OWNER+12,VECTOR+states.length*4);put(OWNER+0x488,0);put(OWNER+0x48c,0);
  const vtable=actual(0x5d3f60),spans=[[OWNER,0x490],[VECTOR,Math.max(4,states.length*4)],[C-512,640],[actual(0x5e8890),4],[vtable,0x88]];
  if(position||velocity){
    for(const[p,values]of[[position,[16777217,-16777217,2147483647]],[velocity,[3,4,5]]])if(p){values.forEach((v,i)=>m.writeInt32LE(v,p+i*4));spans.push([p,12]);}
    for(const p of[0x5ecdb4,0x5dc5b8,0x5ecdb0,0x5dc5d0,0x5dc5e8])spans.push([actual(p),4]);
    spans.push([actual(0x5d0294),44]);
  }
  const sources=[];
  states.forEach((row,i)=>{
    const source=copyAliasesOwner?OWNER-0x498:SOURCES+i*0x1000,wrapper=WRAPPERS+i*16;sources.push(source);
    if(!copyAliasesOwner)m.fill(0x69,source,source+0x9a8);
    put(source,vtable);put(source+0x948,row.state??0);put(source+0x94c,row.pending??0);m[source+0x45c]=row.loop??0;
    if(position||velocity)put(source+0x940,0); //Constructed genuine empty prior callback.
    m.fill(0x51,wrapper,wrapper+12);put(wrapper,source);put(VECTOR+i*4,wrapper);
    spans.push([source,0x9a8],[wrapper,12]);
  });
  if(copyAliasesOwner){
    //Actual REP MOVSD destinationowner shifts the live descriptor left16B.
    //That changes owner+4/+8 via real game stores, not a mutation callback.
    put(OWNER+0x14,VECTOR+4);put(OWNER+0x18,VECTOR);
  }
  if(unknownTarget)put(vtable+0x38,actual(0x4ad540));
  const rows=spans.map(([address,length])=>({address,bytes:Buffer.from(m.subarray(address,address+length))}));
  const source=createCapturedMemory(rows,{aliases:[{address:0x5e8890,targetAddress:actual(0x5e8890),length:4}]}),nativeTls={sehWord:SEH},admissions=[];
  const incoming={ebx:0x1234567,ebp:0x2345678,esi:0x3456789,edi:0x456789a};
  const runtime={memory:source.memory,moduleBaseAddress:base,scratchBase:C,nativeTls,numericalContext:decodePhysicsNumericalContext({x87ControlWord:0x7f,mxcsr:0x1fa5}),nativeStack:{entryRegisters:incoming},onSoundSourceRead:r=>admissions.push({...r})};
  const machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(m);machine.fs0=SEH;machine.entry=actual(0x40db20);
  Object.assign(machine.r,{ESP:C,ECX:OWNER,EDX:0x55,EBX:incoming.ebx,EBP:incoming.ebp,ESI:incoming.esi,EDI:incoming.edi});
  const calls=[];machine.onInstruction=(p,x)=>{
    assert(!image.unresolvedRelocations.has(p));
    if([0x4ad580,0x4ad570,0x4ad500,0x4ad170,0x4ad730,0x4ad700,0x4ad420].some(a=>p===actual(a)))calls.push({entry:p,source:x.r.ECX>>>0,esp:x.r.ESP>>>0,returned:x.bytes.readUInt32LE(x.r.ESP)});
  };
  return{...source,image,actual,machine,C,F,spans,nativeTls,runtime,incoming,admissions,calls,sources};
}
function observeNative(f,stop){
  const observe=f.machine.onInstruction;f.machine.onInstruction=(p,x)=>{observe(p,x);if(p===f.actual(stop))throw Error('Constructed selector observation.');};
  assert.throws(()=>f.machine.run(200000),/Constructed selector observation/);
}
function compareState(f){
  for(const[address,length]of f.spans)assert.deepEqual(f.span(address,length),f.machine.bytes.subarray(address,address+length),`span0x${address.toString(16)}`);
  assert.equal(f.nativeTls.sehWord,f.machine.fs0>>>0);
}

test('genuine adaptive source queries and duplicate descriptor copies match full retained selector state',async()=>{
  let cases=0;
  for(const base of[0x400000,0x320000])for(const alignment of[0,4,8,12])for(const states of[
    [{state:0}],
    [{state:1,loop:0}],
    [{state:0x100,pending:0}],
    [{state:0x101,pending:3},{state:0x1000003}],
    [{state:3},{state:1,loop:255},{state:0}]
  ]){
    const f=await fixture(base,alignment,{states});observeNative(f,0x40dbdd);
    const result=selectNativeSoundChannelOnStack(OWNER,0,0,f.runtime);
    assert.equal(result>>>0,f.machine.r.EAX>>>0);assert.equal(f.machine.r.ESP,f.C);
    for(const key of['EBX','EBP','ESI','EDI'])assert.equal(f.machine.r[key]>>>0,f.incoming[key.toLowerCase()]);
    assert.equal(f.nativeTls.sehWord,SEH);compareState(f);
    const copies=f.calls.filter(row=>row.entry===f.actual(0x4ad170));assert.equal(copies.length,2);assert.equal(copies[0].source,copies[1].source);
    assert.deepEqual(copies.map(c=>c.returned),[f.actual(0x40dc37),f.actual(0x40db8b)]);
    assert.equal(f.admissions.filter(r=>r.label==='sample-descriptor').length,2);cases++;
  }
  assert.equal(cases,40);
});

test('all16 active or pending/loop channels are genuinely scanned before the count limit restores TLS',async()=>{
  for(const base of[0x400000,0x320000]){
    const states=Array.from({length:16},(_,i)=>[{state:3},{state:0,pending:3},{state:1,loop:1}][i%3]),f=await fixture(base,4,{states});
    observeNative(f,0x40dbdd);assert.equal(selectNativeSoundChannelOnStack(OWNER,0,0,f.runtime),0);compareState(f);
    assert.equal(f.machine.r.EAX,0);assert.equal(f.nativeTls.sehWord,SEH);assert.equal(f.calls.filter(c=>c.entry===f.actual(0x4ad170)).length,0);
    assert.equal(f.admissions.filter(r=>r.label==='adaptive-slot').length,16);
    assert.equal(f.calls.filter(c=>c.entry===f.actual(0x4ad580)).length,32);
    assert.equal(f.calls.filter(c=>c.entry===f.actual(0x4ad500)).length,5);
  }
});

test('real descriptor overlap changes the live end and makes the signed negative count fail unsigned admission',async()=>{
  for(const base of[0x400000,0x320000]){
    const f=await fixture(base,0,{copyAliasesOwner:true});observeNative(f,0x40dbdd);
    assert.equal(selectNativeSoundChannelOnStack(OWNER,0,0,f.runtime),0);compareState(f);
    assert.equal(f.memory.readUInt32LE(OWNER+4),VECTOR+4);assert.equal(f.memory.readUInt32LE(OWNER+8),VECTOR);
    assert.equal(f.calls.filter(c=>c.entry===f.actual(0x4ad170)).length,1);
    assert.equal(f.machine.r.EAX,0);assert.equal(f.nativeTls.sehWord,SEH);
  }
});

test('allocator dependencies preserve exact native partial stack and active exception chain',async()=>{
  for(const base of[0x400000,0x320000])for(const alignment of[0,4]){
    for(const scenario of['empty','exhausted']){
      const states=scenario==='empty'?[]:[{state:3}];
      const f=await fixture(base,alignment,{states});observeNative(f,0x40dc50);
      assert.throws(()=>selectNativeSoundChannelOnStack(OWNER,0,0,f.runtime),/operatorNew12/);
      compareState(f);assert.equal(f.nativeTls.sehWord,f.F+32);
      assert.equal(f.memory.readUInt32LE(f.F-4),12);
    }
  }
});

test('positional reuse executes real vector setters and inline callback replacement through full selector preRET',async()=>{
  let cases=0;
  for(const base of[0x400000,0x320000])for(const alignment of[0,4,8,12])for(const[position,velocity]of[[0x100000,0],[0,0x100100],[0x100000,0x100100]]){
    const f=await fixture(base,alignment,{position,velocity}),source=f.sources[0],tlsWrites=[];
    let tls=SEH;Object.defineProperty(f.nativeTls,'sehWord',{get:()=>tls,set:value=>{tls=value;tlsWrites.push(value);}});
    const observer=f.machine.onInstruction;let setterReturned=false;
    f.machine.onInstruction=(p,x)=>{observer(p,x);if(p===f.actual(0x40dbc8)){setterReturned=true;assert.equal(x.fs0>>>0,f.F+32);}};
    observeNative(f,0x40dbdd);
    assert.equal(selectNativeSoundChannelOnStack(OWNER,position,velocity,f.runtime),WRAPPERS);compareState(f);
    assert.equal(f.machine.r.EAX>>>0,WRAPPERS);assert.equal(f.machine.r.ESP,f.C);
    for(const key of['EBX','EBP','ESI','EDI'])assert.equal(f.machine.r[key]>>>0,f.incoming[key.toLowerCase()]);
    assert.equal(setterReturned,true);assert.deepEqual(tlsWrites,[f.F+32,f.F-40,f.F+32,SEH]);
    assert.equal(f.memory.readUInt32LE(WRAPPERS+4),position);assert.equal(f.memory.readUInt32LE(WRAPPERS+8),velocity);
    assert.equal(f.memory.readUInt32LE(source+0x940),source+0x930);assert.equal(f.memory.readUInt32LE(source+0x930),f.actual(0x5d0294));
    assert.equal(f.memory.readUInt32LE(source+0x934),WRAPPERS);assert.equal(f.memory.readUInt32LE(source+0x938),0x69696969);
    assert.equal(f.memory.readUInt32LE(f.F-24),f.actual(0x5d02b4));assert.equal(f.memory.readUInt32LE(f.F-20),WRAPPERS);
    assert.equal(f.memory.readUInt32LE(f.F-28),f.actual(0x40dbc8));assert.equal(f.memory.readUInt32LE(f.F-8),f.F-24);
    assert.equal(f.calls.filter(c=>c.entry===f.actual(0x4ad730)).length,Number(position!==0));
    assert.equal(f.calls.filter(c=>c.entry===f.actual(0x4ad700)).length,Number(velocity!==0));
    assert.equal(f.calls.at(-1).entry,f.actual(0x4ad420));assert.equal(f.calls.at(-1).esp,f.F-28);cases++;
  }
  assert.equal(cases,24);
});

test('unknown actual source vtables remain a dependency after the real indirect CALL word is published',async()=>{
  for(const base of[0x400000,0x320000]){
    const f=await fixture(base,0,{unknownTarget:true});observeNative(f,0x4ad540);
    assert.throws(()=>selectNativeSoundChannelOnStack(OWNER,0,0,f.runtime),/virtual38 target.*not reconstructed/);compareState(f);
    assert.equal(f.memory.readUInt32LE(f.F-8),f.actual(0x40dbf5));assert.equal(f.nativeTls.sehWord,f.F+32);
  }
});

test('a genuinely missing first wrapper cannot be skipped for a later captured source',async()=>{
  const f=await fixture(0x320000,0,{states:[{state:3},{state:0}]}),bad=0x10e37e48;
  f.memory.writeUInt32LE(bad,VECTOR);
  assert.throws(()=>selectNativeSoundChannelOnStack(OWNER,0,0,f.runtime),/Uncaptured native memory at 0x10e37e48 \(4 bytes\)/);
  assert.equal(f.admissions.some(r=>r.address===VECTOR+4),false);assert.equal(f.nativeTls.sehWord,f.F+32);
});
