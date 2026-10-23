import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {nativeFrameControlInputRegions,nativeControlAdditionalRegions,verifyNativeControlPrefixEvidence,executeNativeControlPrefix,nativeControlOwnedRegions,probeNativeControlDependencies} from '../tools/lib/native-frame-control-continuation.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots} from '../tools/check-native-frame-replay.mjs';
import {replayNativeDriveFrame} from '../tools/lib/native-frame-drive-continuation.mjs';

test('control prefix verifies original target and complete prephysics call order',async()=>{
  const proof=await verifyNativeControlPrefixEvidence();assert.equal(proof.targetSha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');assert.equal(proof.evidenceIds.length,7);
  for(const [preferredAddress,length]of [[0x5705b0,32],[0x6e650e,22],[0x91f1e0,1040],[0x91f600,160],[0x5706d0,33]])assert.ok(nativeFrameControlInputRegions.some(row=>row.preferredAddress===preferredAddress&&row.length===length));
});

test('control aliases admit only observed bytes and subtract compatible core overlaps',()=>{
  const moduleBaseAddress=0x6e0000,snapshot={ranges:[{moduleBaseAddress,address:0x8505b0,bytes:Buffer.alloc(32)},{moduleBaseAddress,address:0x850580,bytes:Buffer.alloc(16)}]};
  const rows=nativeControlAdditionalRegions(snapshot);assert.deepEqual(rows.map(row=>[row.preferredAddress,row.address,row.length]),[[0x5705b0,0x8505b0,32]]);
  assert.deepEqual(nativeControlAdditionalRegions(snapshot,{additionalRegions:[{address:0x8505b0,length:32}]}),[]);
});

function emptyParent(){
  //Constructed zero-participant instruction fixture, never a native race claim.
  const memory=Buffer.alloc(0xa00000),session=0x10000,pack=0x20000,gfxm=0x30000,entryEsp=0x50000;
  memory.writeUInt32LE(session,0x5ecb1c);memory.writeUInt32LE(pack,0x90b98c);memory.writeUInt32LE(gfxm,0x90b990);memory.writeUInt32LE(4,session+0x57c);memory.writeUInt32LE(3,entryEsp+4);
  const snapshot={registers:{eip:0x450e50,esp:entryEsp,edx:2,ebx:11,ebp:22,esi:33,edi:44}};
  const source={memory,span:(address,length)=>memory.subarray(address,address+length),manifest:{moduleBaseAddress:0x400000,requiredRegions:[]},geometry:{grid:{},modelContext:{}},sound:{soundRuntime:{}},views:{},numericalContext:{}};
  return {memory,snapshot,source,entryEsp};
}
test('genuine zero-participant parent reaches physics sentinel after linked, objects, progress and handling',()=>{
  const f=emptyParent(),result=executeNativeControlPrefix(f.source,{snapshot:f.snapshot});
  assert.deepEqual(result.calls.map(row=>row.entry),['0x49bbc0','0x494f60','0x429f30','0x449640','0x420500']);assert.equal(result.childEsp,f.entryEsp-20);assert.equal(result.iteration,2);assert.equal(result.totalIterations,3);
  assert.equal(f.memory.readUInt32LE(f.entryEsp-20),0x451017);assert.deepEqual([4,8,12,16].map(o=>f.memory.readUInt32LE(f.entryEsp-o)),[11,22,33,44]);
  assert.deepEqual(nativeControlOwnedRegions(f.source),[]);
});
test('physics-exit state cannot masquerade as correctly scheduled AI input',()=>{
  const f=emptyParent();f.snapshot.registers.eip=0x4749e0;assert.throws(()=>executeNativeControlPrefix(f.source,{snapshot:f.snapshot}),/actual450e50/);assert.equal(f.memory.readUInt32LE(f.entryEsp-4),0);
});
test('pre-audio observer is read-only by contract and cannot replace the genuine reached audio call',()=>{
  const f=emptyParent(),body=0x40000,channel=0x60000,source=0x61000;f.memory[0x10000+0x54d]=1;f.memory.writeUInt32LE(body,0x909300);f.memory.writeUInt32LE(channel,0x713190+12);f.memory.writeUInt32LE(source,channel);let observations=0;
  assert.throws(()=>executeNativeControlPrefix(f.source,{snapshot:f.snapshot,onBeforeStage:row=>{observations++;assert.equal(row.stage,'0x485300');assert.deepEqual(row.calls,[]);assert.equal(row.source,f.source);return {eax:0,skip:true};}}),error=>{assert.match(error.message,/sourceCall|unbound actual call site/);assert.equal(error.nativeControlProgress.stage,'0x485300');return true;});assert.equal(observations,1);
});
const retained='analysis/native-physics-local/startup-20261022/drive-feedback-v1-20261023';
test('original drive frame dependency probe reaches actual missing profile7 shift without constructing tables',{skip:!existsSync(`${retained}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(retained),configuration=JSON.parse(await readFile(`${retained}/configuration.json`)),pairing=pairNativeFrameSnapshots(capture,configuration),pair=pairing.pairs[0],source=await replayNativeDriveFrame(pair.before,pairing.options);
  const result=probeNativeControlDependencies(source,{entryEsp:Number(pair.after.registers.esp)});assert.equal(result.clock,288);assert.equal(result.matched,false);assert.deepEqual(result.completedCalls,[]);assert.deepEqual(result.modes,[8,8,8,8,8,8]);assert.deepEqual(result.phases,[1,2,3,4,5,0]);assert.deepEqual(result.missingInput,{sourceAddress:0x5705cc,length:4,actualModuleAddress:0x8505cc});assert.match(result.failure,/prepareAutonomousPickupUse/);assert.match(result.authority,/mis-scheduled/);
});
