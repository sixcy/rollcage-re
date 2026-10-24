import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {queryWeatherViewport} from '../src/weather-viewport.mjs';
import {updateWeatherScreenParticles} from '../src/weather-screen.mjs';
import {updateWeather} from '../src/weather-update.mjs';

const STACK=0x9000,APP=0x100000,HEAD=0x110000,NODE=0x140000,NAME=0x120000,OUT=0x120400,SESSION=0x60000;
async function fixture(base) {
  //Read-only PE image/HIGHLOW relocation and retained instruction fixture.
  //All application/tree/session/CRT outcomes below are explicitly synthetic.
  const image=await loadRelocatedAudioFixture(base),actual=image.actual,m=image.memory,put=(p,v)=>m.writeUInt32LE(v>>>0,p);
  m.fill(0x36,STACK-0x1000,STACK+128);put(actual(0x6efb38),APP);put(actual(0x5ecb1c),SESSION);put(actual(0x5e8890),0x12345678);
  m.write('0 Player\0',actual(0x5d0254));m.writeFloatLE(0.5,actual(0x5dc6ec));m.fill(0,SESSION,SESSION+0x590);m[SESSION+0x552]=1;
  m.fill(0,APP,APP+0x84);put(APP+0x7c,HEAD);put(APP+0x80,1);
  for(const offset of [0,4,8])put(HEAD+offset,NODE);m.writeUInt16LE(0x101,HEAD+12);
  m.fill(0,NODE,NODE+100);for(const offset of [0,4,8])put(NODE+offset,HEAD);m[NODE+12]=1;m.write('0 Player\0',NODE+16);put(NODE+32,8);put(NODE+36,15);
  [19,23,640,480].forEach((v,i)=>put(NODE+52+i*4,v));m.write('0 Player\0',NAME);m.fill(0x69,OUT,OUT+16);
  put(actual(0x80dde0),0);put(actual(0x5ed2b8),256);put(actual(0x80dedc),0);put(actual(0x6e6ce8),0);
  const globals=[[0x6efb38,4],[0x5ecb1c,4],[0x5e8890,4],[0x5d0254,9],[0x5dc6ec,4],
    ...[0x80dde0,0x5ed2b8,0x80dedc,0x6e6ce8,0x6e6cd0,0x5ed2b4].map(p=>[p,4])];
  const spans=[[STACK-0x1000,0x1080],[APP,0x84],[HEAD,16],[NODE,100],[NAME,32],[OUT,16],[SESSION,0x590],...globals.map(([p,n])=>[actual(p),n])];
  const rows=spans.map(([address,length])=>({address,bytes:Buffer.from(m.subarray(address,address+length))}));
  const source=createCapturedMemory(rows,{aliases:globals.map(([p,length])=>({address:p,targetAddress:actual(p),length}))});
  const sourceCalls=[],nativeCalls=[];
  const handlers={dynamicCast(application,delta,from,to,isReference,runtime){
    assert.deepEqual([application,delta,from,to,isReference],[APP,0,0x6e213c,0x6e20a4,0]);
    const R=runtime.scratchBase,T=R+44;
    sourceCalls.push({R,T,wrapper:Buffer.from(source.span(R,28)),caller:Buffer.from(source.span(T,16))});
    return APP; //Explicit synthetic external CRT interface outcome only.
  }};
  const machine=new BoundedX86(image.instructions);machine.bytes=Buffer.from(m);machine.fs0=0;
  machine.externalCalls.set(actual(0x56932a),x=>{x.r.EAX=APP;});
  machine.externalCalls.set(actual(0x568162),x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(actual(0x5e8890))));
  machine.externalCalls.set(actual(0x568a48),x=>{
    const dest=x.bytes.readUInt32LE(x.r.ESP),from=x.bytes.readUInt32LE(x.r.ESP+4),length=x.bytes.readUInt32LE(x.r.ESP+8);
    Buffer.from(x.bytes.subarray(from,from+length)).copy(x.bytes,dest);x.r.EAX=dest;
  });
  machine.externalCalls.set(actual(0x568a50),x=>{
    const dest=x.bytes.readUInt32LE(x.r.ESP),value=x.bytes.readUInt32LE(x.r.ESP+4)&255,length=x.bytes.readUInt32LE(x.r.ESP+8);
    x.bytes.fill(value,dest,dest+length);x.r.EAX=dest;
  });
  machine.onInstruction=p=>{
    assert(!image.unresolvedRelocations.has(p),`Unresolved actual PE relocation at${p.toString(16)}`);
    if(p===actual(0x402d86)){
      const Q=machine.r.ESP>>>0,R=Q+40,T=R+44;
      assert.deepEqual(Array.from({length:5},(_,i)=>machine.bytes.readUInt32LE(Q+i*4)),[APP,0,actual(0x6e213c),actual(0x6e20a4),0]);
      nativeCalls.push({R,T,wrapper:Buffer.from(machine.bytes.subarray(R,R+28)),caller:Buffer.from(machine.bytes.subarray(T,T+16))});
    }
  };
  return {image,actual,...source,rows,sourceCalls,nativeCalls,machine,runtime:{memory:source.memory,moduleBaseAddress:base,scratchBase:STACK,handlers}};
}

test('two direct screen callers publish exact retained game words under preferred and actual PE relocation',async()=>{
  for(const base of [0x400000,0x6e0000]){
    const f=await fixture(base),F=STACK-0x13c,T=F-16,R=T-44;
    updateWeatherScreenParticles(1,f.runtime);
    f.machine.entry=f.actual(0x498030);f.machine.r.ECX=1;f.machine.r.ESP=STACK;f.machine.bytes.writeInt32LE(-1,STACK);f.machine.run(100000);
    assert.equal(f.sourceCalls.length,2);assert.deepEqual(f.sourceCalls,f.nativeCalls);
    assert.deepEqual(f.sourceCalls.map(row=>row.caller.readUInt32LE()),[f.actual(0x498092),f.actual(0x4980f5)]);
    for(const row of f.sourceCalls){
      assert.equal(row.R,R);assert.equal(row.wrapper.readUInt32LE(),f.actual(0x40abf3));
      assert.equal(row.wrapper.readUInt32LE(4),F+0x29);assert.equal(row.wrapper.readUInt32LE(8),F+0x28);
    }
    //Only source-owned caller arguments and407050's CALL word are included;
    //unknown register saves/SEH/CRT private locals remain outside this proof.
    for(const[address,length]of [[T,16],[T-40,24],[F+0x10,0x18],[NODE,100],[HEAD,16],[APP,0x84]])assert.deepEqual(f.span(address,length),f.machine.bytes.subarray(address,address+length));
  }
});

test('496700 publishes the original screen CALL return before both direct viewport queries',async()=>{
  for(const base of [0x400000,0x6e0000]){
    const f=await fixture(base),originalCast=f.runtime.handlers.dynamicCast;
    f.memory.writeUInt32LE(f.actual(0x451116),STACK);
    f.runtime.handlers.dynamicCast=(...args)=>{
      assert.equal(f.memory.readUInt32LE(STACK-24),f.actual(0x496822));
      assert.equal(f.memory.readUInt32LE(STACK),f.actual(0x451116));
      return originalCast(...args);
    };
    updateWeather(f.runtime);
    const observe=f.machine.onInstruction;
    f.machine.onInstruction=p=>{observe(p);if(p===f.actual(0x496827))throw Error('Constructed weather pre-RET boundary.');};
    f.machine.entry=f.actual(0x496700);f.machine.r.ESP=STACK;f.machine.bytes.writeUInt32LE(f.actual(0x451116),STACK);
    assert.throws(()=>f.machine.run(100000),{message:`At 0x${f.actual(0x496827).toString(16)}: Constructed weather pre-RET boundary.`});
    assert.deepEqual(f.sourceCalls,f.nativeCalls);assert.equal(f.sourceCalls.length,2);
    assert.equal(f.sourceCalls[0].R,STACK-400);assert.equal(f.sourceCalls[0].T,STACK-356);
    assert.deepEqual(f.span(STACK-24,4),f.machine.bytes.subarray(STACK-24,STACK-20));
    for(const p of [0x5ed2b8,0x80dedc,0x6e6ce8,0x6e6cd0,0x5ed2b4])assert.deepEqual(f.span(f.actual(p),4),f.machine.bytes.subarray(f.actual(p),f.actual(p)+4));
  }
});

test('direct query forwarding preserves aliased outputs and reloads live source records in native order',async()=>{
  for(const base of [0x400000,0x6e0000])for(const outputs of [[OUT,OUT,OUT+4,OUT+4],[NAME,NAME+4,OUT,OUT+4],[NODE+56,OUT,OUT+4,OUT+8]]){
    const f=await fixture(base),T=STACK,m=f.memory;
    m.writeUInt32LE(outputs[3],T+12);m.writeUInt32LE(outputs[2],T+8);m.writeUInt32LE(outputs[1],T+4);m.writeUInt32LE(f.actual(0x498092),T);
    queryWeatherViewport(NAME,...outputs,{...f.runtime,nativeViewportQueryCall:{returnAddress:0x498092}});
    f.machine.entry=f.actual(0x40ab70);f.machine.r.ECX=NAME;f.machine.r.EDX=outputs[0];f.machine.r.ESP=T;f.machine.bytes.writeInt32LE(-1,T);
    outputs.slice(1).forEach((p,i)=>f.machine.bytes.writeUInt32LE(p,T+4+i*4));f.machine.run(100000);
    assert.equal(f.sourceCalls.length,1);assert.deepEqual(f.sourceCalls[0].wrapper,f.nativeCalls[0].wrapper);
    for(const[address,length]of [[OUT,16],[NAME,32],[NODE,100]])assert.deepEqual(f.span(address,length),f.machine.bytes.subarray(address,address+length));
    if(outputs[0]===OUT){assert.equal(m.readInt32LE(OUT),23);assert.equal(m.readInt32LE(OUT+4),480);}
    assert.equal(m.readUInt32LE(T-40),f.actual(0x40abfd));
  }
});

test('direct weather publication rejects missing or swapped source caller words and unsupported callers',async()=>{
  const f=await fixture(0x6e0000),T=STACK;
  const options={...f.runtime,nativeViewportQueryCall:{returnAddress:0x498092}};
  assert.throws(()=>queryWeatherViewport(NAME,OUT,OUT+4,OUT+8,OUT+12,options),/source-published/);
  f.memory.writeUInt32LE(f.actual(0x498092),T);f.memory.writeUInt32LE(OUT+8,T+4);f.memory.writeUInt32LE(OUT+4,T+8);f.memory.writeUInt32LE(OUT+12,T+12);
  assert.throws(()=>queryWeatherViewport(NAME,OUT,OUT+4,OUT+8,OUT+12,options),/source-published/);
  assert.throws(()=>queryWeatherViewport(NAME,OUT,OUT+4,OUT+8,OUT+12,{...options,nativeViewportQueryCall:{returnAddress:0x40ac9b}}),/source-published/);
  assert.equal(f.sourceCalls.length,0);
});

test('a source CRT boundary failure retains the genuine caller words without supplying an outcome',async()=>{
  const f=await fixture(0x400000);f.runtime.handlers.dynamicCast=()=>{throw Error('No authenticated weather CRT outcome.');};
  assert.throws(()=>updateWeatherScreenParticles(1,f.runtime),/No authenticated weather CRT/);
  const F=STACK-0x13c,T=F-16,R=T-44;
  assert.equal(f.memory.readUInt32LE(T),0x498092);assert.equal(f.memory.readUInt32LE(R),0x40abf3);
  assert.equal(f.memory.readUInt32LE(R+4),F+0x29);assert.equal(f.memory.readUInt32LE(R+8),F+0x28);
});
