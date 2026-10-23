import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {validateCapturedGuardedPointerRanges} from '../tools/lib/captured-guarded-pointer-ranges.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {stopVehicleSound,setVehicleSoundVolume,setVehicleSoundFrequency} from '../src/vehicle-sound-controls.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const part=(id,address,bytes)=>({id,address,length:bytes.length,bytes});
const word=value=>{const b=Buffer.alloc(4);b.writeUInt32LE(value);return b;};
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture({channel=0x1200000,source=0x1300000,waveform=0x1400000}={}){
  const moduleBaseAddress=0x720000,root=moduleBaseAddress+0x1000,vtable=0x5d3f60;
  const wrapperBytes=Buffer.alloc(12),sourceBytes=Buffer.alloc(0x9a8),waveformBytes=Buffer.alloc(0x440,0x55),tableBytes=Buffer.alloc(0x88,0x66);
  wrapperBytes.writeUInt32LE(source);sourceBytes.writeUInt32LE(vtable);sourceBytes.writeUInt32LE(waveform,0x964);
  const original=[part('global-channel',root,word(channel)),part('gain-constant',0x5dc5dc,word(0x3f800000))];
  if(channel>256)original.push(part('original-wrapper',channel,wrapperBytes));
  if(channel>256&&source>256)original.push(part('original-source',source,sourceBytes),part('original-vtable',vtable,tableBytes));
  if(channel>256&&source>256&&waveform>256)original.push(part('original-waveform',waveform,waveformBytes));
  function guarded(id,offsets,length){
    let current=root,stop=null;const steps=[];
    for(const [index,offset]of offsets.entries()){
      const address=current+Number(offset),p=original.find(p=>address>=p.address&&address+4<=p.address+p.bytes.length);
      if(!p)throw Error('Synthetic unresolved nonnull pointer read');
      const value=p.bytes.readUInt32LE(address-p.address),minimumValue=index===0?257:1;
      steps.push({index,readAddress:address,value,bytesHex:word(value).toString('hex'),minimumValue});
      if(value<minimumValue){stop=index;current=0;break;}current=value;
    }
    const actual=stop===null?original.find(p=>current>=p.address&&current+length<=p.address+p.bytes.length):null;
    if(stop===null&&!actual)throw Error('Synthetic unresolved nonnull pointee extent');
    return {id,address:current,length:stop===null?length:0,bytes:stop===null?Buffer.from(actual.bytes.subarray(current-actual.address,current-actual.address+length)):Buffer.alloc(0),
      rootRva:'0x1000',rootAddress:null,moduleBaseAddress,baseRegister:null,offset:'0',dereferenceOffsets:offsets,dereferenceMinimumValues:offsets.map((_,i)=>i===0?257:1),
      rangeMode:'guarded-pointer',guardedRootAddress:root,guardedDeclaredLength:length,guardedStopIndex:stop,guardedPointerSteps:steps,guardedPointerReadBytes:steps.length*4};
  }
  const rows=[...original.slice(0,2),guarded('channel-wrapper',['0'],12),guarded('channel-source',['0','0'],0x9a8),guarded('source-vtable',['0','0','0'],0x88),guarded('source-waveform',['0','0','0x964'],0x440)];
  return {rows,channel,source,waveform,root,vtable};
}

test('synthetic guarded audio graph admits exact typed spans only after independent pointer proof, regardless of row order',()=>{
  const f=fixture(),input=[...f.rows].reverse(),{memory,mappedBytes}=createCapturedMemory(input);
  assert.equal(validateCapturedGuardedPointerRanges(input).size,0);assert.equal(mappedBytes,8+12+0x9a8+0x440+0x88);
  assert.equal(memory.readUInt32LE(f.root),f.channel);assert.equal(memory.readUInt32LE(f.channel),f.source);assert.equal(memory.readUInt32LE(f.source),f.vtable);
  assert.equal(memory.readUInt32LE(f.source+0x964),f.waveform);assert.equal(memory[f.waveform+0x43f],0x55);
  const calls=[],runtime={memory,handlers:{sourceCall:(pointer,method,args)=>{assert.equal(memory.readUInt32LE(pointer),f.vtable);calls.push([pointer,method,args]);}}};
  stopVehicleSound(f.channel,runtime);setVehicleSoundVolume(f.channel,0,1024,runtime);setVehicleSoundFrequency(f.channel,1024,runtime);
  assert.deepEqual(calls.map(c=>[c[0],c[1]]),[[f.source,0x34],[f.source,0x14],[f.source,0x20]]);
});

test('actual synthetic127/null guards grant no pointee memory and preserve source facade sentinel/null behavior',()=>{
  for(const options of [{channel:127},{channel:0},{source:0},{waveform:0}]){
    const f=fixture(options),skips=validateCapturedGuardedPointerRanges(f.rows),{memory}=createCapturedMemory(f.rows);
    assert.ok(skips.size>0);for(const row of skips){assert.equal(row.address,0);assert.equal(row.bytes.length,0);assert.equal(row.length,0);}
    assert.throws(()=>memory.readUInt32LE(0),/Uncaptured/);
    const calls=[],runtime={memory,handlers:{sourceCall:(...args)=>calls.push(args)}};
    stopVehicleSound(f.channel,runtime);setVehicleSoundVolume(f.channel,0,1,runtime);setVehicleSoundFrequency(f.channel,1,runtime);
    assert.equal(calls.length,options.waveform===0?3:0);
    if(options.channel===127){assert.equal(memory.readUInt32LE(f.root),127);assert.throws(()=>memory.readUInt32LE(127),/Uncaptured/);assert.ok([...skips].every(r=>r.guardedStopIndex===0&&r.guardedPointerSteps[0].value===127));}
    if(options.source===0)assert.ok([...skips].every(r=>r.guardedStopIndex===1));
    if(options.waveform===0)assert.equal([...skips][0].guardedStopIndex,2);
  }
});

test('nonnull16 is never a nullable source: forged skip fails and uncaptured source facade reads fail explicitly',()=>{
  const f=fixture(),wrapper=f.rows.find(r=>r.id==='channel-wrapper');wrapper.bytes.writeUInt32LE(16);
  const {memory}=createCapturedMemory([f.rows[0],f.rows[1],wrapper]);
  assert.equal(memory.readUInt32LE(f.channel),16);
  assert.throws(()=>setVehicleSoundFrequency(f.channel,1,{memory,handlers:{sourceCall:p=>memory.readUInt32LE(p)}}),/Uncaptured native memory at 0x10/);
  const source=f.rows.find(r=>r.id==='channel-source');source.address=0;source.length=0;source.bytes=Buffer.alloc(0);source.guardedStopIndex=1;
  Object.assign(source.guardedPointerSteps[1],{value:16,bytesHex:'10000000'});
  assert.throws(()=>createCapturedMemory([f.rows[0],wrapper,source]),/first false native guard/);
});

test('guarded proof rejects missing, self/cyclic, forged, ambiguous, overflowing and mismatched positive or empty evidence',()=>{
  for(const mutate of [
    r=>r[2].guardedRootAddress++,r=>r[2].rootRva='0x1004',r=>r[2].rootAddress='0x1000',r=>r[2].baseRegister='esi',r=>r[2].offset='4',
    r=>r[2].dereferenceMinimumValues=[256],r=>r[3].dereferenceMinimumValues=[257,257],r=>r[2].guardedPointerSteps[0].bytesHex='00000000',
    r=>r[2].guardedPointerSteps[0].value++,r=>r[2].guardedPointerSteps[0].readAddress++,r=>r[2].guardedPointerSteps[0].minimumValue=1,
    r=>r[2].guardedPointerReadBytes=0,r=>r[2].guardedDeclaredLength++,r=>r[2].address++,r=>r[2].rangeMode='fixed-length',
    r=>r[2].guardedStopIndex=0,r=>r[2].dereferenceOffsets=['0xffffffff'],r=>r[2].moduleBaseAddress=0xffffffff,
    r=>r[0].bytes.writeUInt32LE(127),r=>r.splice(2,1),
  ]){const {rows}=fixture();mutate(rows);assert.throws(()=>createCapturedMemory(rows));}
  const f=fixture();assert.throws(()=>createCapturedMemory(f.rows.slice(2)),/unobserved\/self\/cyclic/);
  // Its second pointer word exists only in the row attempting to certify it.
  const self={...f.rows[3],address:f.channel,length:12,bytes:Buffer.from(f.rows[2].bytes),guardedDeclaredLength:12,guardedPointerSteps:f.rows[3].guardedPointerSteps.map(p=>({...p}))};
  self.bytes.writeUInt32LE(f.channel);Object.assign(self.guardedPointerSteps[1],{value:f.channel,bytesHex:word(f.channel).toString('hex')});
  assert.throws(()=>createCapturedMemory([f.rows[0],self]),/unobserved\/self\/cyclic/);
  const empty=fixture({channel:127});for(const mutate of [r=>r.guardedStopIndex=null,r=>r.address=127,r=>r.address=null,r=>r.guardedPointerSteps=[],r=>r.dereferenceMinimumValues=[1],r=>r.bytes=Buffer.alloc(1)]){
    const rows=empty.rows.map(r=>({...r,bytes:Buffer.from(r.bytes),guardedPointerSteps:r.guardedPointerSteps?.map(p=>({...p}))}));mutate(rows[2]);assert.throws(()=>createCapturedMemory(rows));
  }
  const nullWave=fixture({waveform:0});nullWave.rows.at(-1).guardedPointerSteps[2].value=null;assert.throws(()=>createCapturedMemory(nullWave.rows),/pointer step/);
});

test('explicit configuration cross-check rejects allowed guard swaps, wrong roots/extents, missing ranges and downgraded metadata',()=>{
  const f=fixture(),expectedDescriptors=f.rows.filter(r=>r.rangeMode==='guarded-pointer').map(r=>({id:r.id,rva:r.rootRva,length:r.guardedDeclaredLength,dereferenceOffsets:[...r.dereferenceOffsets],dereferenceMinimumValues:[...r.dereferenceMinimumValues]}));
  assert.equal(validateCapturedGuardedPointerRanges(f.rows,{expectedDescriptors}).size,0);
  for(const mutate of [d=>d[0].dereferenceMinimumValues[0]=1,d=>d[0].rva='0x1004',d=>d[0].length++,d=>d[0].dereferenceOffsets=['4'],d=>d[0].address='0x721000',d=>d.pop()]){
    const declared=structuredClone(expectedDescriptors);mutate(declared);assert.throws(()=>validateCapturedGuardedPointerRanges(f.rows,{expectedDescriptors:declared}),/configured guarded descriptor/);
  }
  assert.throws(()=>validateCapturedGuardedPointerRanges(f.rows.slice(0,2),{expectedDescriptors}),/missing or downgraded/);
  const downgraded=f.rows.map(r=>r.id==='channel-wrapper'?part(r.id,r.address,r.bytes):r);
  assert.throws(()=>validateCapturedGuardedPointerRanges(downgraded,{expectedDescriptors}),/missing or downgraded/);
  const absolute=f.rows.map(r=>r.rangeMode==='guarded-pointer'?{...r,rootAddress:r.guardedRootAddress,rootRva:null,moduleBaseAddress:null}:r);
  assert.equal(validateCapturedGuardedPointerRanges(absolute).size,0);
  const zeroRva=f.rows.map(r=>r.rangeMode==='guarded-pointer'?{...r,rootRva:'0',moduleBaseAddress:r.guardedRootAddress}:r);
  const zeroDescriptors=expectedDescriptors.map(d=>({...d,rva:'0'}));assert.equal(validateCapturedGuardedPointerRanges(zeroRva,{expectedDescriptors:zeroDescriptors}).size,0);
  delete zeroDescriptors[0].rva;assert.throws(()=>validateCapturedGuardedPointerRanges(zeroRva,{expectedDescriptors:zeroDescriptors}),/configured guarded descriptor/);
});

test('pure C# guarded resolver shares original DWORD reads, bounded early stops and explicit invalid-nonnull failures', {skip:process.platform!=='win32'},async()=>{
  const source=path.resolve('tools/lib/native-physics-debugger.cs').replaceAll("'","''");
  const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${source}'
function Check([bool]$ok){if(!$ok){throw 'Guard policy assertion failed'}}
function Range {
 $r=New-Object RollcageCapture.MemoryRange;$r.id='waveform';$r.address='0x1000';$r.length=1088
 $r.dereferenceOffsets=@('0','0','0x964');$r.dereferenceMinimumValues=@(257,1,1);return $r
}
$script:map=@{'4096'=[uint32]8192;'8192'=[uint32]12288;'14692'=[uint32]16384};$script:reads=New-Object System.Collections.Generic.List[uint32]
$reader=[Func[uint32,uint32]]{param([uint32]$address)$script:reads.Add($address);if(!$script:map.ContainsKey([string]$address)){throw 'Unobserved nonnull pointer read'};return [uint32]$script:map[[string]$address]}
$r=Range;$p=[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange($r,0,$reader)
Check ($p.address -eq 16384);Check ($p.stopIndex -eq -1);Check ($p.steps.Count -eq 3);Check ($script:reads.Count -eq 3)
Check ([RollcageCapture.NativeDebugger]::GuardedPointerFootprint($p,1088) -eq 1100)
$frame=New-Object RollcageCapture.PendingFrameProgress;$frame.active=$true;$policy=New-Object RollcageCapture.PendingFrameObserver;$policy.maxPendingBytes=1815
$failed=$false;try{$frame.Reserve($policy,(716+[RollcageCapture.NativeDebugger]::GuardedPointerFootprint($p,1088)))}catch{$failed=$true};Check $failed
$policy.maxPendingBytes=1816;$frame.Reserve($policy,(716+[RollcageCapture.NativeDebugger]::GuardedPointerFootprint($p,1088)));Check ($frame.bufferedBytes -eq 1816)
foreach($value in @(0,16,127,256)){$script:map['4096']=[uint32]$value;$script:reads.Clear();$p=[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange((Range),0,$reader);Check ($p.stopIndex -eq 0);Check ($p.address -eq 0);Check ($p.steps.Count -eq 1);Check ($script:reads.Count -eq 1)}
Check ([RollcageCapture.NativeDebugger]::GuardedPointerFootprint($p,0) -eq 4)
$script:map['4096']=[uint32]8192;$script:map['8192']=[uint32]0;$p=[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange((Range),0,$reader);Check ($p.stopIndex -eq 1);Check ($p.steps.Count -eq 2)
$script:map['8192']=[uint32]12288;$script:map['14692']=[uint32]0;$p=[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange((Range),0,$reader);Check ($p.stopIndex -eq 2)
$script:map['14692']=[uint32]16;$p=[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange((Range),0,$reader);Check ($p.stopIndex -eq -1);Check ($p.address -eq 16)
$script:map['8192']=[uint32]16;$failed=$false;try{[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange((Range),0,$reader)}catch{$failed=$true};Check $failed
$script:map['8192']=[uint32]12288;$script:map['14692']=[uint32]4294967280;$failed=$false;try{[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange((Range),0,$reader)}catch{$failed=$true};Check $failed
$changes=@({param($r)$r.baseRegister='esi'},{param($r)$r.rva='0x1000'},{param($r)$r.offset='1'},{param($r)$r.length=0},{param($r)$r.readableRegion=$true},{param($r)$r.vectorStorage=$true},{param($r)$r.dereferenceMinimumValues=@(257,1)},{param($r)$r.dereferenceMinimumValues=@(257,257,1)},{param($r)$r.dereferenceMinimumValues=@(256,1,1)},{param($r)$r.dereferenceMinimumValues=@(0,1,1)},{param($r)$r.dereferenceOffsets=@()})
foreach($change in $changes){$r=Range;& $change $r;$failed=$false;try{[RollcageCapture.NativeDebugger]::ValidateGuardedPointerRange($r)}catch{$failed=$true};Check $failed}
$r=Range;$r.address=$null;$r.rva='0x1000';$failed=$false;try{[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange($r,[uint32]4294967295,$reader)}catch{$failed=$true};Check $failed
$r=Range;$r.address='0xffffffff';$failed=$false;try{[RollcageCapture.NativeDebugger]::ResolveGuardedPointerRange($r,0,$reader)}catch{$failed=$true};Check $failed
Write-Output 'Pure guarded pointer resolver PASS; no native process launched.'`;
  const run=spawnSync('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true,encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/Pure guarded pointer resolver PASS/);
  const code=await readFile('tools/lib/native-physics-debugger.cs','utf8');
  assert.equal((code.match(/guard = range\.dereferenceMinimumValues == null \? null : ReadGuardedPointerRange\(/g)??[]).length,2);
  assert.match(code,/guard\.steps\.Count \* 4/);assert.match(code,/range\.dereferenceMinimumValues != null\) && length == 0 \? new byte\[0\] : Bytes/);
});

test('loader validates both empty and nonempty guarded evidence after actual blob hashes, preserving no-byte skips',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rollcage-guarded-blobs-'));
  try{
    const f=fixture({source:0}),context=Buffer.alloc(716),raw=[];
    await writeFile(path.join(directory,'context.bin'),context);
    for(const [i,row]of f.rows.entries()){const file=`range-${i}.bin`;await writeFile(path.join(directory,file),row.bytes);raw.push({...row,bytes:undefined,file,sha256:digest(row.bytes)});}
    const records=[{type:'capture',schemaVersion:1,executableSha256:'a'.repeat(64)},{type:'snapshot',ordinal:1,hit:1,breakpointId:'synthetic-guard',contextFile:'context.bin',contextSha256:digest(context),ranges:raw},{type:'complete',snapshots:1}];
    const save=()=>writeFile(path.join(directory,'trace.jsonl'),records.map(r=>JSON.stringify(r)).join('\n'));await save();
    const loaded=await loadPhysicsCapture(directory),rows=[...loaded.snapshots[0].ranges.values()];assert.equal(rows.find(r=>r.id==='channel-source').bytes.length,0);assert.equal(createCapturedMemory(rows).memory.readUInt32LE(f.channel),0);
    const source=raw.find(r=>r.id==='channel-source');source.guardedPointerSteps[1].value=16;source.guardedPointerSteps[1].bytesHex='10000000';await save();
    await assert.rejects(loadPhysicsCapture(directory),/first false native guard/);
    source.guardedPointerSteps[1].value=0;source.guardedPointerSteps[1].bytesHex='00000000';await save();
    raw.splice(raw.findIndex(r=>r.id==='channel-wrapper'),1);await save();await assert.rejects(loadPhysicsCapture(directory),/unobserved\/self\/cyclic/);
  }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});

const retainedControlV3='analysis/native-physics-local/startup-20261022/control-prefix-v3-20261023';
const hasControlV3=existsSync(`${retainedControlV3}/configuration.json`);
test('retained original controlv3 proves36 guarded audio graphs at all three config-bound native control boundaries', {skip:!hasControlV3},async()=>{
  const capture=await loadPhysicsCapture(retainedControlV3,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(`${retainedControlV3}/configuration.json`,'utf8'));
  const pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0];
  assert.equal(pairing.pairs.length,1);assert.equal(pair.before.ordinal,4);assert.equal(pair.checkpoints.afterAi.ordinal,5);assert.equal(pair.after.ordinal,6);
  assert.equal(pair.before.tid,34624);assert.equal(pair.logicalClock,288);assert.equal(pair.moduleBaseAddress,0x6e0000);
  assert.equal(capture.complete.snapshots,6);assert.equal(capture.complete.events,2854);assert.equal(capture.complete.elapsedMs,45348);
  for(const snapshot of [pair.before,pair.checkpoints.afterAi,pair.after]){
    const point=configuration.breakpoints.find(p=>p.id===snapshot.breakpointId),rows=[...snapshot.ranges.values()],guards=rows.filter(r=>r.rangeMode==='guarded-pointer');
    const skipped=validateCapturedGuardedPointerRanges(rows,{expectedDescriptors:[...(configuration.ranges??[]),...point.ranges]});
    assert.equal(guards.length,180);assert.equal(skipped.size,128);assert.equal(guards.filter(r=>r.length).length,52);
    assert.equal(new Set(guards.map(r=>r.id.replace(/-(channel|source|waveform|vtable|effect)$/,''))).size,36);
    assert.equal(guards.filter(r=>r.guardedStopIndex===0&&Number(r.guardedPointerSteps[0].value)===127).length,115);
    const nullEffects=guards.filter(r=>r.guardedStopIndex===2);assert.equal(nullEffects.length,13);assert.ok(nullEffects.every(r=>r.id.endsWith('-effect')&&Number(r.guardedPointerSteps[2].value)===0));
    assert.deepEqual(guards.filter(r=>r.length).reduce((counts,r)=>(counts[r.length]=(counts[r.length]??0)+1,counts),{}),{12:13,136:13,1088:13,2472:13});
    assert.equal(guards.reduce((n,r)=>n+r.guardedPointerReadBytes,0),1084);assert.equal(guards.reduce((n,r)=>n+r.length,0),48204);
    const live=guards.filter(r=>r.length&&r.id.endsWith('-channel')).map(r=>r.id);
    assert.deepEqual(live,['control-car0-road-channel','control-car0-engine-channel','control-car1-road-channel','control-car1-engine-channel','control-car2-road-channel','control-car2-engine-channel','control-car3-surface-channel','control-car3-road-channel','control-car3-engine-channel','control-car4-road-channel','control-car4-engine-channel','control-car5-road-channel','control-car5-engine-channel']);
    const {memory,mappedBytes}=createCapturedMemory([snapshot.ranges.get('control-vehicle-audio-and-horn-records'),...guards]);
    assert.equal(mappedBytes,36028);assert.throws(()=>memory.readUInt32LE(0),/Uncaptured/);assert.throws(()=>memory.readUInt32LE(127),/Uncaptured/);
  }
  const raw=(await readFile(`${retainedControlV3}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(raw.find(r=>r.type==='owned-process-cleanup').terminated,true);assert.equal(raw.find(r=>r.type==='owned-process-cleanup').elapsedMs,45399);
  //Original pairing must bind guards to configuration at entry, checkpoint and
  //exit: a structurally valid1/257 swap cannot misstate the declared branch.
  for(const original of [pair.before,pair.checkpoints.afterAi,pair.after]){
    const target=original.ranges.get('control-car0-road-channel');
    const changed={...target,dereferenceMinimumValues:[1],guardedPointerSteps:target.guardedPointerSteps.map(p=>({...p,minimumValue:1}))};
    const replacement={...original,ranges:new Map(original.ranges)};replacement.ranges.set(target.id,changed);
    const corrupt={...capture,snapshots:capture.snapshots.map(r=>r===original?replacement:r)};
    assert.equal(validateCapturedGuardedPointerRanges([...replacement.ranges.values()]).size,128,'The changed threshold is structurally valid but not the actual configured policy.');
    assert.throws(()=>pairNativeControlSnapshots(corrupt,configuration),/configured guarded descriptor/);
    const downgraded={...target};for(const key of Object.keys(downgraded))if(key.startsWith('guarded')||key==='rangeMode'||key==='dereferenceMinimumValues')delete downgraded[key];
    replacement.ranges.set(target.id,downgraded);assert.throws(()=>pairNativeControlSnapshots(corrupt,configuration),/missing or downgraded/);
    const changedConfig=structuredClone(configuration);changedConfig.breakpoints.find(p=>p.id===original.breakpointId).ranges.find(r=>r.id===target.id).dereferenceMinimumValues=[1];
    assert.throws(()=>pairNativeControlSnapshots(capture,changedConfig),/configured guarded descriptor/);
  }
  const beforeRows=[...pair.before.ranges.values()].filter(r=>r.id!=='control-vehicle-audio-and-horn-records');
  assert.throws(()=>validateCapturedGuardedPointerRanges(beforeRows),/unobserved\/self\/cyclic/);
});

test('retained controlv3 guarded empty and nonempty blobs reject actual byte/length tampering', {skip:!hasControlV3},async()=>{
  const records=(await readFile(`${retainedControlV3}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse),source=records.find(r=>r.type==='snapshot'&&r.ordinal===4);
  for(const id of ['control-car0-surface-channel','control-car0-road-source','control-car3-surface-channel']){
    const directory=await mkdtemp(path.join(tmpdir(),'rollcage-controlv3-guard-tamper-'));
    try{
      const row=source.ranges.find(r=>r.id===id),original=await readFile(path.join(retainedControlV3,row.file)),bytes=original.length?Buffer.from(original):Buffer.from([1]);
      if(original.length)bytes[0]^=1;
      await writeFile(path.join(directory,row.file),bytes);await writeFile(path.join(directory,source.contextFile),await readFile(path.join(retainedControlV3,source.contextFile)));
      //Negative loader fixture uses the genuine descriptor hash; no new native
      //execution or regenerated evidence hash is represented as an observation.
      await writeFile(path.join(directory,'trace.jsonl'),[records[0],{...source,ordinal:1,hit:1,ranges:[row]},{...records.find(r=>r.type==='complete'),snapshots:1}].map(r=>JSON.stringify(r)).join('\n'));
      await assert.rejects(loadPhysicsCapture(directory,{expectedSha256:REDUX_SHA256}),/Capture blob (?:hash|length) differs/);
    }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
  }
});
