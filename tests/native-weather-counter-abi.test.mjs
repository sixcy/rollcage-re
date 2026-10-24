import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {updateWeatherScreenParticles} from '../src/weather-screen.mjs';
import {readGameMicroseconds} from '../src/game-network-protocol.mjs';

const APP=0x100000,HEAD=0x110000,NODE=0x140000,SESSION=0x60000,IAT=0x160000;
const stop=()=>{throw Error('Synthetic unbound QPC boundary.');};
async function fixture(base,U){
  //Constructed state, original read-only PE HIGHLOW relocation, retained game
  //instructions, and an explicitly synthetic CRT cast outcome. No process run.
  const image=await loadRelocatedAudioFixture(base),actual=image.actual,m=image.memory,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  const screenEntry=U-44,F=screenEntry-0x13c,C=F-4,B=((C-4)&~7)-32,P=B+24;
  for(let p=U-1024;p<U+64;p++)m[p]=(p*37+19)&255;
  put(actual(0x6efb38),APP);put(actual(0x5ecb1c),SESSION);m.fill(0,SESSION,SESSION+0x590);
  put(actual(0x5e8890),0x12345678);m.write('0 Player\0',actual(0x5d0254));m.writeFloatLE(.5,actual(0x5dc6ec));m.writeFloatLE(1,actual(0x5dc5d4));m[actual(0x91ce90)]=2;
  put(APP+0x7c,HEAD);put(APP+0x80,1);for(const o of[0,4,8])put(HEAD+o,NODE);m.writeUInt16LE(0x101,HEAD+12);
  m.fill(0,NODE,NODE+100);for(const o of[0,4,8])put(NODE+o,HEAD);m[NODE+12]=1;m.write('0 Player\0',NODE+16);put(NODE+32,8);put(NODE+36,15);
  [19,23,640,480].forEach((v,i)=>put(NODE+52+i*4,v));
  put(actual(0x6e6c8c),1);put(actual(0x56e0fc),IAT);m.writeBigInt64LE(10000000n,actual(0x7135a4));m.writeBigInt64LE(1000n,actual(0x7135ac));
  put(screenEntry,actual(0x496822));
  const globals=[[0x6efb38,4],[0x5ecb1c,4],[0x5e8890,4],[0x5d0254,9],[0x5dc6ec,4],[0x5dc5d4,4],[0x91ce90,1],[0x6e6c8c,4],[0x56e0fc,4],[0x7135a4,16]];
  const spans=[[U-1024,1088],[APP,0x84],[HEAD,16],[NODE,100],[SESSION,0x590],...globals.map(([p,n])=>[actual(p),n])];
  const rows=spans.map(([address,length])=>({address,bytes:Buffer.from(m.subarray(address,address+length))}));
  const source=createCapturedMemory(rows,{aliases:globals.map(([p,length])=>({address:p,targetAddress:actual(p),length}))});
  let observed;
  const runtime={memory:source.memory,moduleBaseAddress:base,scratchBase:screenEntry,nativeWeatherCounterCalls:true,handlers:{dynamicCast:()=>APP},services:{platformCall(name,args,r){
    observed={name,args,runtime:r,preimage:Buffer.from(source.span(P,8))};stop();
  }}};
  const machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(m);machine.fs0=0;
  machine.externalCalls.set(actual(0x56932a),x=>{x.r.EAX=APP;});
  machine.externalCalls.set(actual(0x568162),x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(actual(0x5e8890))));
  machine.externalCalls.set(actual(0x568a48),x=>{const dest=x.bytes.readUInt32LE(x.r.ESP),from=x.bytes.readUInt32LE(x.r.ESP+4),n=x.bytes.readUInt32LE(x.r.ESP+8);Buffer.from(x.bytes.subarray(from,from+n)).copy(x.bytes,dest);x.r.EAX=dest;});
  machine.externalCalls.set(actual(0x568a50),x=>{const dest=x.bytes.readUInt32LE(x.r.ESP),v=x.bytes.readUInt32LE(x.r.ESP+4)&255,n=x.bytes.readUInt32LE(x.r.ESP+8);x.bytes.fill(v,dest,dest+n);x.r.EAX=dest;});
  machine.onInstruction=p=>{assert(!image.unresolvedRelocations.has(p));if(p===actual(0x489d11))stop();};
  machine.entry=actual(0x498030);machine.r.ESP=screenEntry;machine.r.ECX=1;
  machine.r.EBP=0x88776655|0;machine.r.ESI=0x12345678;machine.r.EDI=0x87654321|0;
  return{...source,image,actual,runtime,machine,U,F,C,B,P,screenEntry,observed:()=>observed};
}

test('weather carries both aligned QPC preimages from genuine earlier source viewport calls',async()=>{
  for(const base of[0x400000,0x5f0000])for(const U of[0x9000,0x9004]){
    const f=await fixture(base,U);
    assert.throws(()=>updateWeatherScreenParticles(1,f.runtime),/Synthetic unbound QPC/);
    assert.throws(()=>f.machine.run(100000),/Synthetic unbound QPC/);
    const o=f.observed(),meta=o.runtime.nativeWeatherCounterCall;
    assert.equal(o.name,'QueryPerformanceCounter');assert.deepEqual(o.args,[f.P]);assert.equal(o.runtime.scratchBase,f.C);
    assert.deepEqual(meta,{returnAddress:0x498458,screenEntryEsp:f.screenEntry,entryEsp:f.C,frame:f.B,outputAddress:f.P,ebx:1,iatTarget:IAT,preCallEsp:f.B-4,serviceReturnAddress:f.actual(0x489d13)});
    assert(Object.isFrozen(meta));assert.equal(f.machine.r.ESP,f.B-4);assert.equal(f.machine.r.EBP>>>0,f.C-4);assert.equal(f.machine.r.ESI,IAT);
    //Independent native execution derives all eight preimage bytes; neither
    //fixture nor source timer installs an expected private stack answer.
    assert.deepEqual(o.preimage,f.machine.bytes.subarray(f.P,f.P+8));
    const expected=U%8===0?[f.actual(0x4980f5),f.F+0x18]:[f.F+0x28,f.actual(0x4980f5)];
    assert.deepEqual([o.preimage.readUInt32LE(),o.preimage.readUInt32LE(4)],expected);
    for(const[p,n]of[[f.C,4],[f.B+8,8],[f.B-4,4]])assert.deepEqual(f.span(p,n),f.machine.bytes.subarray(p,p+n));
    assert.equal(f.memory.readUInt32LE(f.B-8),f.actual(0x489d13));
    const call=f.image.instructions.find(i=>i.address===f.actual(0x489d11));assert.equal(call.op,'CALL');assert.deepEqual(call.args,['ESI']);
  }
});

function timerFixture(){
  const memory=Buffer.alloc(0xa00000,0x69),C=0x9004,B=((C-4)&~7)-32,P=B+24;
  memory.writeUInt32LE(0x498458,C);memory.writeUInt32LE(1,0x6e6c8c);memory.writeUInt32LE(IAT,0x56e0fc);
  memory.writeBigInt64LE(10000000n,0x7135a4);memory.writeBigInt64LE(1000n,0x7135ac);
  const call={returnAddress:0x498458,screenEntryEsp:C+0x140,entryEsp:C,frame:B,outputAddress:P,ebx:7};
  return{memory,C,B,P,runtime:{memory,scratchBase:C,nativeWeatherCounterCall:call,services:{platformCall:stop}}};
}

test('typed timer publishes only proven game stores before the unbound external service',()=>{
  const f=timerFixture(),before=Buffer.from(f.memory);
  assert.throws(()=>readGameMicroseconds(f.runtime),/Synthetic unbound QPC/);
  const allowed=new Set([f.B-8,f.B-4,f.B+8,f.B+12].flatMap(p=>[p,p+1,p+2,p+3]));
  for(let p=0;p<f.memory.length;p++)if(!allowed.has(p))assert.equal(f.memory[p],before[p],`unchanged0x${p.toString(16)}`);
  assert.deepEqual(f.memory.subarray(f.P,f.P+8),before.subarray(f.P,f.P+8));
});

test('generic screen service path keeps the old opaque timer ABI without opting in',async()=>{
  const f=await fixture(0x5f0000,0x9004);delete f.runtime.nativeWeatherCounterCalls;
  assert.throws(()=>updateWeatherScreenParticles(1,f.runtime),/Synthetic unbound QPC/);
  assert.equal(f.observed().runtime.nativeWeatherCounterCall,undefined);
  assert.notEqual(f.memory.readUInt32LE(f.C),f.actual(0x498458));
});

test('typed timer rejects wrong source caller/frame/initialization before any platform outcome',()=>{
  for(const change of[
    f=>{f.runtime.nativeWeatherCounterCall.entryEsp+=4;},f=>{f.runtime.nativeWeatherCounterCall.frame+=4;},
    f=>{f.runtime.nativeWeatherCounterCall.outputAddress+=4;},f=>{f.runtime.nativeWeatherCounterCall.screenEntryEsp+=4;},
    f=>{f.runtime.nativeWeatherCounterCall.returnAddress=0x4980f5;},f=>{f.memory.writeUInt32LE(0x4980f5,f.C);},
    f=>{f.memory.writeUInt32LE(0,0x6e6c8c);},f=>{f.runtime.nativeWeatherCounterCall.extra=0;}
  ]){const f=timerFixture();change(f);const before=Buffer.from(f.memory);assert.throws(()=>readGameMicroseconds(f.runtime),/source-published caller\/frame/);assert.deepEqual(f.memory,before);}
});

test('typed QPC output remains an explicit service and does not replace timer arithmetic or missing frequency',()=>{
  const f=timerFixture();let calls=0;
  f.runtime.services.platformCall=(name,args,r)=>{calls++;assert.equal(name,'QueryPerformanceCounter');assert.deepEqual(args,[f.P]);assert.equal(r.nativeWeatherCounterCall.iatTarget,IAT);f.memory.writeBigInt64LE(2000n,f.P);return 1;};
  assert.equal(readGameMicroseconds(f.runtime),100n);assert.equal(calls,1);
  f.memory.writeBigInt64LE(0n,0x7135a4);assert.throws(()=>readGameMicroseconds(f.runtime),/Division by zero/);assert.equal(calls,2);
});

test('retained timer and weather evidence identify the original source target',async()=>{
  for(const file of['3630-weather-489cd0-procedure_assembly.json','3611-object-effect-498030-procedure_assembly.json']){
    const evidence=JSON.parse(await readFile('analysis/native-simulation/results/'+file,'utf8')).structuredContent;
    assert.equal(evidence.subject.digest.sha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');assert.equal(evidence.operation,'procedure_assembly');
  }
});
