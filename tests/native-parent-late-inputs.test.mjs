import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nativeParentLateModuleRegions,nativeParentLateObservedInputRegions} from '../tools/lib/native-parent-late-inputs.mjs';

const expected=[
  ['late-debris-blend-source',0x5ec9b0,4],
  ['late-camera-motion-flags',0x6f9730,16],
  ['late-camera-motion-vectors',0x6f9740,48],
  ['late-camera-default-up-vector',0x5ea4f4,12],
  ['late-camera-viewport-smoothing-5dc664',0x5dc664,4],
  ['late-camera-viewport-smoothing-5dc75c',0x5dc75c,4],
  ['late-camera-clip-flags',0x6e6560,4],
  ['late-weather-extra-participant-pose',0x80de00,216],
  ['late-retirement-position',0x6fb954,6],
];

test('late batch admits only fully captured actual spans and never supplies immutable bytes',()=>{
  for(const base of [0x400000,0x6e0000])for(const[id,preferredAddress,length]of expected){
    const descriptor=nativeParentLateModuleRegions.find(row=>row.id===id);
    assert.equal(descriptor.preferredAddress,preferredAddress);assert.equal(descriptor.length,length);
    const address=base+preferredAddress-0x400000,bytes=Buffer.alloc(length,0x5a);
    const admitted=nativeParentLateObservedInputRegions({ranges:[{address,bytes}]},base).find(row=>row.id===id);
    assert.equal(admitted.address,address);assert.equal(admitted.bytes,undefined);
    assert.equal(nativeParentLateObservedInputRegions({ranges:[{address,bytes:bytes.subarray(0,-1)}]},base).some(row=>row.id===id),false);
    assert.deepEqual(bytes,Buffer.alloc(length,0x5a));
  }
});

test('batch metadata follows independent retained original instruction and data evidence',async()=>{
  const cases=[
    ['291-vehicle-state-475e50-assembly.json',/0x475e67: MOV EAX, \[0x005ec9b0\]/],
    ['3515-view-stage-406c70-assembly.json',/MULSS XMM1, dword ptr \[0x005dc664\][\s\S]*MULSS XMM0, dword ptr \[0x005dc75c\]/],
    ['3587-camera-projection-426e20-assembly.json',/MOV dword ptr \[0x006e6560\], 0x0[\s\S]*MOV dword ptr \[0x006e6560\], 0x40/],
    ['653-retirement-435ba0-assembly.json',/MOV \[0x006fb954\], AX[\s\S]*MOV \[0x006fb956\], AX[\s\S]*MOV \[0x006fb958\], AX/],
  ];
  for(const[file,pattern]of cases){
    const outer=JSON.parse(await readFile(`analysis/native-simulation/results/${file}`)),evidence=outer.structuredContent??JSON.parse(outer.content[0].text);
    assert.equal(evidence.subject.digest.sha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
    assert.match(evidence.raw_result.value,pattern);
  }
  const outer=JSON.parse(await readFile('analysis/native-simulation/results/9001-camera-default-up-vector.json')),evidence=outer.structuredContent??JSON.parse(outer.content[0].text);
  assert.equal(evidence.subject.digest.sha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  assert.equal(evidence.raw_result.returned_bytes,12);assert.equal(evidence.raw_result.complete,true);
});
