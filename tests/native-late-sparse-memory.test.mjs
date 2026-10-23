import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {restoreWeatherBodyPose} from '../src/weather-volumes.mjs';
import {updateRaceAudioListeners} from '../src/race-phase-audio.mjs';

function fixture(moduleBaseAddress,known,heap){
  const actual=p=>moduleBaseAddress+p-0x400000;
  const captured=createCapturedMemory([...known.map(([p,length])=>({address:actual(p),bytes:Buffer.alloc(length)})),...heap.map(([address,length])=>({address,bytes:Buffer.alloc(length)}))],{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))});
  const reference=Buffer.alloc(0x1200000);
  const put=(address,value)=>{captured.memory.writeInt32LE(value|0,address);reference.writeInt32LE(value|0,address);};
  const bytes=(address,data)=>{data.copy(captured.memory.subarray(address,address+data.length));data.copy(reference,address);};
  return {...captured,actual,reference,put,bytes};
}

test('weather pose restoration preserves actual heap identity and copied field order on preferred and relocated sparse memory',()=>{
  for(const base of[0x400000,0x6e0000]){
    const body=0x1000000,f=fixture(base,[[0x7135b8,4],[0x7136c4,12],[0x713750,44]],[[body,384]]);
    f.put(0x7135b8,7);f.bytes(0x7136c4,Buffer.from('78563412efcdab9021436587','hex'));f.bytes(0x713750,Buffer.from(Array.from({length:44},(_,i)=>(i*37+11)&255)));
    f.bytes(body,Buffer.alloc(384,0xa7));
    restoreWeatherBodyPose(body,{memory:f.reference});restoreWeatherBodyPose(body,{memory:f.memory});
    assert.deepEqual(f.span(body,384),f.reference.subarray(body,body+384));
    assert.equal(f.memory.readUInt32LE(body+0x11c),7);
    assert.equal(f.memory.readUInt32LE(body),0xa7a7a7a7,'Body header outside the actual pose stores is retained.');
  }
});

test('native listener descriptor memset and ordered SIMD block copies operate on owned sparse spans',()=>{
  for(const base of[0x400000,0x6e0000]){
    const position=0x1000000,velocity=position+16,rotation=position+32,destination=0x1001000,vector=0x1002000,stack=0x1003000;
    const f=fixture(base,[[0x849480,4*0x54],[0x6f2408,12],[0x5dc5b8,4],[0x5dc5d0,4],[0x5dc5f4,4],[0x5ecdb0,8]],[[position,64],[destination,80],[vector,4],[stack-256,512]]);
    f.put(0x849480,1);f.put(0x849484,position);f.put(0x849488,velocity);f.put(0x84948c,rotation);
    f.put(0x6f2408,vector);f.put(0x6f240c,vector+4);f.put(0x6f2410,vector+4);f.put(vector,destination);
    for(const p of[0x5dc5b8,0x5dc5d0,0x5dc5f4,0x5ecdb0,0x5ecdb4]){f.memory.writeFloatLE(1/4096,p);f.reference.writeFloatLE(1/4096,p);}
    [123,-456,789].forEach((value,i)=>f.put(position+i*4,value));[17,-19,23].forEach((value,i)=>f.put(velocity+i*4,value));
    const matrix=Buffer.alloc(18);[4096,0,0,0,4096,0,0,0,4096].forEach((value,i)=>matrix.writeInt16LE(value,i*2));f.bytes(rotation,matrix);
    f.bytes(destination,Buffer.alloc(80,0x6b));f.bytes(stack-256,Buffer.alloc(512,0x35));
    updateRaceAudioListeners({memory:f.reference,scratchBase:stack});updateRaceAudioListeners({memory:f.memory,scratchBase:stack});
    assert.deepEqual(f.span(destination,80),f.reference.subarray(destination,destination+80));
    assert.deepEqual(f.span(stack-256,512),f.reference.subarray(stack-256,stack+256));
    assert.equal(f.memory.readUInt32LE(destination),0x6b6b6b6b,'The native descriptor begins at destination+4.');
    assert.equal(f.memory.readUInt32LE(0x6f2408),vector,'Opaque listener vector identity is never rebased.');
  }
});
