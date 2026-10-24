import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeParentRttiBindings,verifyNativeParentWeatherRttiEvidence} from '../tools/lib/native-parent-rtti.mjs';

function fixture(base=0x400000) {
  const U=0x1000000,S=U-20,Rc=U-236,Rw=U-420,Qc=Rc-40,Qw=Rw-40,app=0x1100000;
  const actual=p=>base+p-0x400000,root=Buffer.alloc(4);root.writeUInt32LE(app);
  const initial=createCapturedMemory([{address:U-1024,bytes:Buffer.alloc(2048)},{address:app,bytes:Buffer.alloc(256)},{address:actual(0x6efb38),bytes:root}]);
  const owned=createCapturedMemory([{address:U-1024,bytes:Buffer.alloc(2048)},{address:app,bytes:Buffer.alloc(256)},{address:actual(0x6efb38),bytes:root}],{aliases:base===0x400000?[]:[{address:0x6efb38,targetAddress:actual(0x6efb38),length:4}]}),m=owned.memory;
  const args=[app,0,actual(0x6e213c),actual(0x6e20a4),0],word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
  const outputs=i=>i===1?[U-336,U-332,U-340,U-328]:[U-344,U-336,U-332,U-328];
  const snapshot=(weather,index,entry,event)=>{
    const q=weather?Qw:Qc,context=Buffer.alloc(weather?68:52),ranges=new Map();args.forEach((v,i)=>context.writeUInt32LE(v,i*4));
    const caller=weather?[actual(0x40abf3),U-319,U-320,...outputs(index)]:[actual(0x41a0c8),U-60,1];caller.forEach((v,i)=>context.writeUInt32LE(v,40+i*4));
    const row=(id,address,bytes)=>ranges.set(id,{address,bytes});row('native-parent-rtti-context',q,context);row('native-parent-rtti-clock',actual(0x90a548),word(288));
    if(weather){row('native-parent-rtti-weather-query-return',U-376,word(actual(index===1?0x498092:0x4980f5)));row('native-parent-rtti-weather-screen-return',U-44,word(actual(0x496822)));row('native-parent-rtti-weather-parent-return',S,word(actual(0x451116)));row('native-parent-rtti-weather-name',U-320,Buffer.from('0 Player\0'));}
    else row('native-parent-rtti-camera-return',S,word(actual(0x451107)));
    return {breakpointId:entry?'native-parent-rtti-call':'native-parent-rtti-return',tid:7,ordinal:event,observedDebugEventOrdinal:event,registers:{eip:actual(entry?0x402d86:0x402d8b),esp:q,eax:app+(weather?index*4:0)},ranges};
  };
  const capture={snapshots:[snapshot(false,0,true,25),snapshot(false,0,false,26),snapshot(true,1,true,35),snapshot(true,1,false,36),snapshot(true,2,true,40),snapshot(true,2,false,41)]};
  const checkpoint=event=>({tid:7,observedDebugEventOrdinal:event});
  const pair={moduleBaseAddress:base,logicalClock:288,before:{tid:7,registers:{esp:U},observedDebugEventOrdinal:10},postphysics:{auxiliary:checkpoint(20),cameras:checkpoint(30),'world-effects':checkpoint(50)}};
  const options={capture,pair,memory:m,initialSpan:initial.span,weatherScreenQueries:true};
  const put=(p,v)=>m.writeUInt32LE(v,p),name=(p)=>{for(const[i,b]of Buffer.from('0 Player\0').entries())m[p+i]=b;};
  function camera(binding){[actual(0x41a0c8),U-60,1].forEach((v,i)=>put(Rc+i*4,v));put(S,actual(0x451107));name(U-60);return binding.crtDynamicCast(app,0,0x6e213c,0x6e20a4,0,{memory:m,scratchBase:Rc});}
  function prepareWeather(index){[actual(0x40abf3),U-319,U-320,...outputs(index)].forEach((v,i)=>put(Rw+i*4,v));put(U-376,actual(index===1?0x498092:0x4980f5));put(U-44,actual(0x496822));put(S,actual(0x451116));name(U-320);}
  const weather=(binding,index)=>{prepareWeather(index);return binding.crtDynamicCast(app,0,0x6e213c,0x6e20a4,0,{memory:m,scratchBase:Rw});};
  return {options,capture,m,U,S,Rw,app,camera,weather,prepareWeather};
}

test('weather caller depths and argument publications follow independent retained original instructions',async()=>{
  const proof=await verifyNativeParentWeatherRttiEvidence();assert.equal(proof.evidenceIds.length,3);assert.equal(proof.targetSha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
});

test('constructed camera and two weather calls consume distinct observed EAX values in source order, including ASLR',()=>{
  for(const base of [0x400000,0x6e0000]) {
    const f=fixture(base),binding=createNativeParentRttiBindings(f.options);
    assert.equal(f.camera(binding),f.app);binding.assertComplete({through:'cameras'});assert.throws(()=>binding.assertComplete(),/unused/);
    assert.equal(f.weather(binding,1),f.app+4);assert.equal(f.weather(binding,2),f.app+8);binding.assertComplete();
    assert.deepEqual(binding.events.map(e=>[e.family,e.weatherQueryIndex??0]),[['camera',0],['weather-screen',1],['weather-screen',2]]);
    assert.equal(binding.events[1].wrapperEntryEsp,f.U-420);assert.equal(binding.events[1].entryEsp,f.U-464);
  }
});

test('unpublished weather arguments, camera MODE words and reordered query results cannot supply a weather outcome',()=>{
  for(const offset of [0,4,8,12,16,20,24]) {
    const f=fixture(),binding=createNativeParentRttiBindings(f.options);f.camera(binding);f.prepareWeather(1);f.m.writeUInt32LE(1,f.Rw+offset);
    assert.throws(()=>binding.crtDynamicCast(f.app,0,0x6e213c,0x6e20a4,0,{memory:f.m,scratchBase:f.Rw}),/weather caller/);assert.equal(binding.events.length,1);
  }
  const f=fixture();f.capture.snapshots[2].ranges.get('native-parent-rtti-weather-query-return').bytes.writeUInt32LE(0x4980f5);assert.throws(()=>createNativeParentRttiBindings(f.options),/weather query/);
});

test('missing, crossed-stage or corrupt weather transport cannot close the joined source parent',()=>{
  const mutations=[f=>f.capture.snapshots.splice(4,2),f=>f.capture.snapshots[2].observedDebugEventOrdinal=29,f=>f.capture.snapshots[3].ranges.get('native-parent-rtti-context').bytes.writeUInt32LE(0,64),f=>f.capture.snapshots[2].ranges.get('native-parent-rtti-weather-name').bytes.fill(0)];
  for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>createNativeParentRttiBindings(f.options));}
  const f=fixture(),binding=createNativeParentRttiBindings({...f.options,weatherScreenQueries:false});f.camera(binding);assert.throws(()=>f.weather(binding,1),/frame\/type/);
});
