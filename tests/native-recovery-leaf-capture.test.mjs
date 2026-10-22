import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,access,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createNativeRecoveryLeafCaptureConfig,prepareNativeRecoveryLeafCapture,nativeRecoveryLeafArgumentRanges,verifyNativeRecoveryLeafCaptureInputs} from '../tools/prepare-native-recovery-leaf-capture.mjs';
import {createNativeRecoveryCaptureConfig,nativeRecoveryDependencyRanges} from '../tools/prepare-native-recovery-capture.mjs';
import {nativeRecoveryGlobalRegions} from '../tools/lib/native-recovery-context.mjs';
import {nativeRecoveryLeafIds} from '../tools/check-native-recovery-leaf-replay.mjs';
import {recoveryLeafPolicy} from '../tools/lib/native-recovery-leaf-replay.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {configurePostFrameFixture} from '../tools/lib/post-frame-runtime-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
test('leaf preparer preserves complete bootstrap/policies and observes one entry plus both RETs without writes',async()=>{
 const parent=await createNativeRecoveryCaptureConfig('synthetic','never-launched',{frames:1,skipFrames:0}),parentRanges=parent.configuration.breakpoints.find(row=>row.id==='native-recovery-before').ranges;
 for(const stage of['query','apply']){
  const result=await createNativeRecoveryLeafCaptureConfig('synthetic','never-launched',{stage}),config=result.configuration,ids=nativeRecoveryLeafIds(stage),leaf=recoveryLeafPolicy(stage),before=config.breakpoints.find(row=>row.id===ids.before),after=ids.after.map(id=>config.breakpoints.find(row=>row.id===id));
  assert.equal(before.rva,`0x${(leaf.entry-0x400000).toString(16)}`);assert.equal(before.stopAfterHits,0);assert.equal(result.stackBytesAfter,leaf.stackBytesAfter);assert.equal(result.skipFrames,0);assert.equal(config.pendingFrameObserver,undefined);
  assert.deepEqual(after.map(bp=>bp.rva),leaf.exits.map(value=>`0x${(value-0x400000).toString(16)}`));
  for(const bp of[before,...after]){assert.equal(bp.skipMatchingHits,0);assert.deepEqual(bp.captureWhen,before.captureWhen);assert.equal(bp.ranges.find(row=>row.id==='frame-stack').length,4096+leaf.stackBytesAfter);assert.equal(new Set(bp.ranges.map(row=>row.id)).size,bp.ranges.length);for(const row of parentRanges.filter(row=>row.id!=='frame-stack'))assert.deepEqual(bp.ranges.find(other=>other.id===row.id),row);}
  assert.ok(after.every(bp=>bp.stopAfterHits===1));assert.deepEqual(after[0].ranges,after[1].ranges);assert.notEqual(after[0].ranges,after[1].ranges);
  for(const key of['phaseActions','showWindow','hideOwnedWindows','foregroundWindowSource','denyRegistryWrites','denyChildProcesses','denyPlayerMailslot','executablePath','workingDirectory','redirectedDocumentsPath','redirectedShellFolderPath'])assert.deepEqual(config[key],parent.configuration[key]);
  assert.ok(config.phaseActions.every(row=>![ids.before,...ids.after].includes(row.breakpointId)));assert.equal(config.maxSnapshots,parent.configuration.maxSnapshots);
  for(const region of nativeRecoveryGlobalRegions)assert.equal(before.ranges.find(row=>row.id===region.id).length,region.length);for(const row of nativeRecoveryDependencyRanges())assert.deepEqual(before.ranges.find(other=>other.id===row.id),row);
 }
});
test('leaf input evidence and policies reject ambiguous calls, incomplete stack and invented stages',async()=>{
 const proof=await verifyNativeRecoveryLeafCaptureInputs();assert.equal(proof.evidenceIds.length,3);
 for(const options of[{frames:2},{skipFrames:1},{stage:'other'},{stackBytesBefore:32},{maxRegionBytes:64*1024*1024+1}])await assert.rejects(createNativeRecoveryLeafCaptureConfig('synthetic','never-launched',options),/one first|query or apply|parent local|region bound|maxRegionBytes/);
 assert.throws(()=>nativeRecoveryLeafArgumentRanges('query',{atExit:1}),/must be boolean/);
 assert.deepEqual(nativeRecoveryLeafArgumentRanges('query').find(row=>row.id==='leaf-query-output'),{id:'leaf-query-output',baseRegister:'esp',dereferenceOffsets:['16'],length:4});
 assert.deepEqual(nativeRecoveryLeafArgumentRanges('apply',{atExit:true}).find(row=>row.id==='leaf-quaternion'),{id:'leaf-quaternion',baseRegister:'esp',offset:'100',length:16});
});
test('pointed exit descriptors resolve the original parent inputs after native argument slots are overwritten',async()=>{
 const program=await loadRetainedNativeProgram(),reached={query:new Set(),apply:new Set()};
 const resolve=(descriptor,m,registers)=>{let address=descriptor.rva!==undefined?0x400000+Number(descriptor.rva):registers[descriptor.baseRegister.toUpperCase()]>>>0;for(const offset of descriptor.dereferenceOffsets??[])address=m.readUInt32LE(address+Number(offset));return address+Number(descriptor.offset??0);};
 for(const[vehicles,negative]of[[1,false],[2,false],[1,true]]){
  const f=createSimulationVehicleFixture(program,1,{vehicleCount:vehicles,effects:false,vehicleFilters:false,extraBodyStorage:[{address:0x70f130,length:0x3e78}]}),m=f.memory;configurePostFrameFixture(f,1,0x9000);for(const body of f.bodies)m.writeInt32LE(32,body.address+0x128);if(negative)m[f.bodies[0].address+0x10c]=255;
  const machine=new BoundedX86(program.instructions,{entry:0x47ccc0,fpuPrecisionBits:24});m.copy(machine.bytes);machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));const pending=new Map();
  machine.onInstruction=address=>{for(const stage of['query','apply']){const leaf=recoveryLeafPolicy(stage);if(address===leaf.entry)pending.set(stage,new Map(nativeRecoveryLeafArgumentRanges(stage).map(row=>[row.id,resolve(row,machine.bytes,machine.r)])));if(leaf.exits.includes(address)){const expected=pending.get(stage);assert.ok(expected);for(const row of nativeRecoveryLeafArgumentRanges(stage,{atExit:true})){assert.equal(resolve(row,machine.bytes,machine.r),expected.get(row.id),`${stage}/RET${address.toString(16)}/${row.id}: actual parent pointer identity`);assert.ok(resolve(row,machine.bytes,machine.r)+row.length<=machine.bytes.length);}assert.notEqual(machine.bytes.readUInt32LE(machine.r.ESP+4),expected.get('leaf-quaternion'),'The overwritten argument must not be followed at exit.');reached[stage].add(address);pending.delete(stage);}}};machine.run(4000000);assert.equal(pending.size,0);
 }
 assert.deepEqual([...reached.query].sort(),[0x47d42a,0x47d434]);assert.deepEqual([...reached.apply].sort(),[0x47d6ed,0x47d703]);
});
test('leaf preparation writes a new reviewable configuration and refuses all existing targets',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rollcage-recovery-leaf-'));
 try{
  const output=path.join(directory,'capture'),filename=path.join(directory,'config.json'),result=await prepareNativeRecoveryLeafCapture(directory,output,filename,{stage:'apply'}),saved=await readFile(filename);assert.equal(result.stage,'apply');assert.match(result.method,/No game launched/);await assert.rejects(access(output));assert.equal(JSON.parse(saved).pendingFrameObserver,undefined);
  await assert.rejects(prepareNativeRecoveryLeafCapture(directory,output,filename,{stage:'apply'}),/existing recovery leaf output/);assert.deepEqual(await readFile(filename),saved);await mkdir(output);await assert.rejects(prepareNativeRecoveryLeafCapture(directory,output,path.join(directory,'other.json'),{stage:'query'}),/existing recovery leaf output/);await assert.rejects(access(path.join(directory,'other.json')));
 }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('rollcage-recovery-leaf-'));await rm(directory,{recursive:true,force:true});}
});
