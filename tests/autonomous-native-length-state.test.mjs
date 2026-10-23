import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {vectorLengthQ16,abs32} from '../src/fixed-integer.mjs';
import {measureAutonomousVelocity} from '../src/autonomous-steering.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {replayNativeControlPrefix,createNativeControlNumericalState} from '../tools/lib/native-frame-control-continuation.mjs';
import {compareNativeControlOutput} from '../tools/check-native-frame-control-prefix.mjs';

test('41c9c0 optional native state publishes exact41ca60 input and CLZ over retained instructions',async()=>{
  const vector=await readInstructionEvidence(['227-autonomous-vector-length-assembly.json'],{directory:'analysis/native-simulation/results'}),root=await readInstructionEvidence(['221-fixed-sqrt-assembly.json']);
  const machine=new BoundedX86([...vector.instructions,...root.instructions]),vectors=[[0,0,0],[1,0,0],[65536,-65536,65536],[0x7fffff,0,0],[0x800000,0x800000,0x800000],[-0x800000,0x400000,-0x100000],[8505,-160,-185131]];
  for(const values of vectors){machine.reset();values.forEach((value,i)=>machine.bytes.writeInt32LE(value,0x10000+i*4));machine.entry=0x41c9c0;machine.r.ECX=0x10000;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.run();let calls=0,input,leading;const result=vectorLengthQ16(values,{fixedSqrtQ16(value){calls++;input=abs32(value);leading=Math.clz32(input);}});assert.equal(result,machine.r.EAX|0);assert.equal(calls,1);assert.equal(input,machine.bytes.readInt32LE(0x91d45c));assert.equal(leading,machine.bytes.readInt32LE(0x91d460));assert.equal(vectorLengthQ16(values),result);}
});
test('430d90 genuine velocity helper preserves native global stores and both outputs without mocked children',async()=>{
  const own=await readInstructionEvidence(['238-steering-velocity-axis-assembly.json','232-steering-dot-assembly.json','234-steering-length-assembly.json','239-steering-triple-cross-assembly.json','243-steering-normalize-assembly.json','134-checkpoint-interpolation-assembly.json'],{directory:'analysis/native-simulation/results'}),math=await readInstructionEvidence(['152-vector-length-assembly.json','221-fixed-sqrt-assembly.json']),machine=new BoundedX86([...own.instructions,...math.instructions]);
  for(const velocity of [[0,0,0],[16,0,0],[-65536,0,65536],[136080,-2560,-2962096],[0x100000,0x200000,-0x300000]]){
    const memory=Buffer.alloc(0xa00000),body=0x10000,forward=0x20000,side=0x20004,stack=0x9000;velocity.forEach((value,index)=>memory.writeInt32LE(value,body+0x68+index*4));[4096,0,0,0,4096,0,0,0,4096].forEach((value,index)=>memory.writeInt16LE(value,body+0xc6+index*2));memory.fill(0xa5,0x91d45c,0x91d464);
    machine.reset();memory.copy(machine.bytes);machine.entry=0x430d90;Object.assign(machine.r,{ECX:body,EDX:forward,ESP:stack});machine.bytes.writeUInt32LE(0xffffffff,stack);machine.bytes.writeUInt32LE(side,stack+4);machine.run();
    const writes=[],write=memory.writeInt32LE.bind(memory);memory.writeInt32LE=(value,address)=>{if(address===0x91d45c||address===0x91d460)writes.push({address,value});return write(value,address);};const actual=measureAutonomousVelocity(body,{memory,nativeState:createNativeControlNumericalState({memory,moduleBaseAddress:0x400000})});
    assert.equal(actual.forward,machine.bytes.readInt32LE(forward));assert.equal(actual.side,machine.bytes.readInt32LE(side));assert.equal(memory[body+0x6c8],machine.bytes[body+0x6c8]);assert.deepEqual(memory.subarray(0x91d45c,0x91d464),machine.bytes.subarray(0x91d45c,0x91d464));assert.deepEqual(writes.map(row=>row.address),[0x91d45c,0x91d460,0x91d460]);assert.equal(writes[1].value,0);assert.equal(writes[2].value,Math.clz32(writes[0].value));
  }
});
test('explicit native publisher preserves41ca60 zero, signed absolute and minimum-int states',async()=>{
  const proof=await readInstructionEvidence(['221-fixed-sqrt-assembly.json']),machine=new BoundedX86(proof.instructions),memory=Buffer.alloc(0xa00000),nativeState=createNativeControlNumericalState({memory,moduleBaseAddress:0x400000});
  for(const value of [0,1,-1,0x7fffffff,-0x80000000]){machine.reset();machine.entry=0x41ca60;machine.r.ECX=value;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.run();nativeState.fixedSqrtQ16(value);assert.deepEqual(memory.subarray(0x91d45c,0x91d464),machine.bytes.subarray(0x91d45c,0x91d464));}
  assert.throws(()=>createNativeControlNumericalState({memory,moduleBaseAddress:0x6e0000}),/actual aliased image/);
});
const retained='analysis/native-physics-local/startup-20261022/control-prefix-v1-20261023';
test('original six-car AI checkpoint matches allsemantic bytes after genuine native root publication',{skip:!existsSync(`${retained}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(retained),configuration=JSON.parse(await readFile(`${retained}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0];let comparison,completed;
  let laterFailure;try{replayNativeControlPrefix(pair.before,{...pairing.options,moduleBaseAddress:pair.moduleBaseAddress,onBeforeStage:({source,calls})=>{completed=calls;comparison=compareNativeControlOutput(source,pair.checkpoints.afterAi);}});}catch(error){laterFailure=error;}
  assert.equal(completed.length,12);assert.deepEqual(completed.map(row=>row.entry),[...Array(6).fill('0x410220'),...Array(6).fill('0x431750')]);assert.equal(comparison.matched,true);assert.equal(comparison.differingBytes,0);assert.equal(comparison.protectedControlBytes,720);assert.ok(comparison.bytesCompared>4_900_000);
  if(laterFailure)assert.ok(laterFailure.nativeControlProgress.calls.length>12,'A later prefix dependency cannot erase the independently observed AI comparison.');
});
