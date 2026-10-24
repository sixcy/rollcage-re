import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {planContainedRangeStorage,createContainedRangeViews,loadContainedRangeBlobs,verifyContainedRangeStorage,verifyHeldRangeStorageDiagnostic} from '../tools/lib/native-held-range-storage.mjs';
import {loadHeldForceRequest,validateHeldForceConfiguration} from '../tools/lib/native-held-force.mjs';
import {createNativeControlledRaceHeldCaptureConfig} from '../tools/prepare-native-controlled-race-held-capture.mjs';
import {controlledRaceSettingsOutputRanges} from '../tools/lib/native-controlled-race-settings.mjs';

const root='analysis/native-physics-local/startup-20261022',sha=b=>createHash('sha256').update(b).digest('hex');
const spans=()=>[{id:'owner',address:0x1000,length:16},{id:'child',address:0x1004,length:4},{id:'duplicate',address:0x1000,length:16},{id:'partial',address:0x1008,length:16},{id:'empty',address:0,length:0}];
const read=r=>Buffer.from(Array.from({length:r.length},(_,i)=>(Number(r.address)+i)&255));
const seh={id:'thread-seh-head',address:0x2000,length:4};

test('contained planning is deterministic, keeps partial overlaps independently charged, handles empty and rejects overflow',()=>{
  const plan=planContainedRangeStorage(spans(),9);assert.equal(plan.logicalRangeBytes,52);assert.equal(plan.backingBytes,32);assert.deepEqual(plan.backings.map(r=>r.id),['owner','partial']);
  assert.deepEqual(plan.views.map(r=>[r.id,r.ownerId,r.dataOffset,r.length]),[['owner','owner',0,16],['child','owner',4,4],['duplicate','owner',0,16],['partial','partial',0,16],['empty',null,0,0]]);
  assert.deepEqual(planContainedRangeStorage(spans(),9),plan);
  assert.equal(planContainedRangeStorage([{id:'declared-first-child',address:0x1004,length:4},{id:'later-owner',address:0x1000,length:16}],9).views[0].ownerId,'later-owner');
  for(const rows of [[{id:'empty-overflow',address:0x100000000,length:0}],[{id:'overflow',address:0xfffffffe,length:4}],[{id:'null',address:0,length:1}],[{id:'negative',address:1,length:-1}],[{id:'big',address:1,length:0x4000001}],[{id:'a',address:1,length:1},{id:'a',address:2,length:1}]])assert.throws(()=>planContainedRangeStorage(rows,9),/Held range storage/);
  assert.equal(planContainedRangeStorage([{id:'last-empty',address:0xffffffff,length:0}],9).backingBytes,0);
});

test('physical views read each owner once, preserve segment hashes and allocate fresh snapshots',()=>{
  let reads=0;const a=createContainedRangeViews(spans(),r=>{reads++;return read(r);}),b=createContainedRangeViews(spans(),read);
  assert.equal(reads,2);assert.equal(a.buffers.size,2);assert.equal(a.views.get('child').buffer,a.views.get('owner').buffer);assert.equal(a.views.get('child').byteOffset-a.views.get('owner').byteOffset,4);assert.equal(a.views.get('child').length,4);
  for(const row of spans())assert.equal(sha(a.views.get(row.id)),sha(read(row)));
  assert.notEqual(a.buffers.get('owner'),b.buffers.get('owner'));b.views.get('owner')[0]^=255;assert.equal(a.views.get('owner')[0],0);
  const shared=Buffer.alloc(16);assert.throws(()=>createContainedRangeViews(spans(),()=>shared),/distinct/);
  assert.throws(()=>createContainedRangeViews(spans(),()=>shared.subarray(0,16)),/distinct/);
  const disjoint=Buffer.alloc(32);let offset=0;assert.equal(createContainedRangeViews(spans(),()=>{const bytes=disjoint.subarray(offset,offset+16);offset+=16;return bytes;}).buffers.size,2);
  assert.throws(()=>createContainedRangeViews(spans(),()=>Buffer.alloc(17)),/distinct/);
});

test('separate actual allocation diagnostic is required and every owner/offset/cost/event is recomputed',()=>{
  const snapshot={ordinal:5,tid:7,observedDebugEventOrdinal:99,ranges:[...spans(),seh]};snapshot.rangeStorage=planContainedRangeStorage(spans(),99,{actual:true});
  const record={type:'held-force-range-storage',pid:42,tid:7,observedDebugEventOrdinal:99,role:'held-pre-input',rangeStorage:snapshot.rangeStorage},rows=[record,{type:'snapshot',ordinal:5}];
  assert.equal(verifyContainedRangeStorage(snapshot,snapshot.rangeStorage).retainedSnapshotBytes,752);
  assert.equal(verifyHeldRangeStorageDiagnostic(snapshot,rows,{pid:42,role:'held-pre-input'}).logicalSnapshotBytes,772);
  for(const mutate of [s=>s.backingBytes--,s=>s.logicalRangeBytes--,s=>s.views[1].dataOffset++,s=>s.views[1].ownerId='partial',s=>s.backings[0].length--,s=>s.physicalBufferIdentityVerified=false,s=>s.snapshotLocal=false,s=>s.observedDebugEventOrdinal++,s=>s.extra='forged']){const bad=structuredClone(snapshot.rangeStorage);mutate(bad);assert.throws(()=>verifyContainedRangeStorage(snapshot,bad),/proof differs/);}
  for(const records of [[],[record,record,{type:'snapshot',ordinal:5}],[{...record,pid:43},{type:'snapshot',ordinal:5}],[{type:'snapshot',ordinal:5},record]])assert.throws(()=>verifyHeldRangeStorageDiagnostic(snapshot,records,{pid:42,role:'held-pre-input'}),/Held range storage/);
});

test('all original per-row files remain independently authenticated while loaded child bytes are contained views',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-held-storage-files-'));
  try {
    const rows=spans().map((r,i)=>({...r,file:`range-${i}.bin`,sha256:sha(read(r))}));for(const r of rows)await writeFile(path.join(dir,r.file),read(r));
    const loaded=await loadContainedRangeBlobs(rows,dir);assert.equal(loaded.get('child').bytes.length,4);assert.equal(loaded.get('child').bytes.buffer,loaded.get('owner').bytes.buffer);assert.equal(loaded.get('child').bytes.byteOffset-loaded.get('owner').bytes.byteOffset,4);
    for(const r of rows)assert.equal(sha(loaded.get(r.id).bytes),r.sha256);
    await writeFile(path.join(dir,rows[1].file),Buffer.alloc(4));await assert.rejects(loadContainedRangeBlobs(rows,dir),/child blob/);
    const escaped=structuredClone(rows);escaped[0].file='../elsewhere.bin';await assert.rejects(loadContainedRangeBlobs(escaped,dir),/unsafe/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('actual retained V2 byte/hash projection preserves every logical input span; this is no shared native capture',async()=>{
  const held=await loadHeldForceRequest(`${root}/held-chassis-border-v2-20261023`),rows=[...held.snapshot.ranges.values()].filter(r=>r.id!=='thread-seh-head'),original=rows.map(r=>r.sha256),storage=createContainedRangeViews(rows,r=>Buffer.from(r.bytes));
  for(const [index,r]of rows.entries()){assert.equal(sha(storage.views.get(r.id)),r.sha256,r.id);assert.equal(r.bytes.length,storage.views.get(r.id).length);assert.equal(sha(r.bytes),original[index]);}
  assert.ok(storage.plan.backingBytes<storage.plan.logicalRangeBytes);assert.ok(storage.plan.views.some(r=>r.dataOffset>0));
});

test('shared strict partial-loader protocol authenticates each blob and actual allocation ledger; constructed transport only',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-shared-held-protocol-'));
  try {
    const original=await loadHeldForceRequest(`${root}/held-chassis-border-v2-20261023`),request=JSON.parse(await readFile(`${root}/held-chassis-border-v2-20261023/held-force-request.json`,'utf8')),row=request.snapshot;
    //Protocol fixture ONLY: unchanged real V2 input spans/context plus explicit
    //synthetic image-output rows required by the new profile. Never execute
    //source/native physics with these added bytes or claim a settings result.
    row.ordinal=5;
    for(const r of original.snapshot.ranges.values())await writeFile(path.join(dir,r.file),r.bytes);
    await writeFile(path.join(dir,row.contextFile),original.snapshot.context);
    const base=Number(request.moduleBaseAddress);
    for(const [index,d]of controlledRaceSettingsOutputRanges().entries()) {
      const bytes=Buffer.alloc(d.length,0x4d),file=`synthetic-image-output-${index}.bin`;await writeFile(path.join(dir,file),bytes);
      row.ranges.push({id:d.id,address:`0x${(base+Number(d.rva)).toString(16).padStart(8,'0')}`,rootAddress:null,rootRva:d.rva,moduleBaseAddress:request.moduleBaseAddress,baseRegister:null,dereferenceOffsets:[],offset:'0',length:d.length,file,sha256:sha(bytes)});
    }
    row.rangeStorage=planContainedRangeStorage(row.ranges.filter(r=>r.id!=='thread-seh-head'),row.observedDebugEventOrdinal,{actual:true});
    const configuration=(await createNativeControlledRaceHeldCaptureConfig(root,path.join(dir,'never-launched'),{shareContainedRanges:true})).configuration;
    await writeFile(path.join(dir,'configuration.json'),JSON.stringify(configuration));await writeFile(path.join(dir,'held-force-request.json'),JSON.stringify(request));
    const diagnostic={type:'held-force-range-storage',pid:request.pid,tid:request.tid,role:'held-pre-input',observedDebugEventOrdinal:row.observedDebugEventOrdinal,rangeStorage:row.rangeStorage},records=[{type:'owned-process',pid:request.pid,tid:request.tid},diagnostic,row];
    const trace=()=>records.map(r=>JSON.stringify(r)).join('\n')+'\n';await writeFile(path.join(dir,'trace.jsonl'),trace());
    const loaded=await loadHeldForceRequest(dir),view=row.rangeStorage.views.find(r=>r.ownerId!==null&&r.ownerId!==r.id&&r.dataOffset>0),child=loaded.snapshot.ranges.get(view.id),owner=loaded.snapshot.ranges.get(view.ownerId);
    assert.equal(child.bytes.buffer,owner.bytes.buffer);assert.equal(child.bytes.byteOffset-owner.bytes.byteOffset,view.dataOffset);
    records[1]={...diagnostic,tid:request.tid+1};await writeFile(path.join(dir,'trace.jsonl'),trace());await assert.rejects(loadHeldForceRequest(dir),/actual snapshot-local allocation diagnostic/);
    records[1]=diagnostic;await writeFile(path.join(dir,'trace.jsonl'),trace());const changed=Buffer.from(child.bytes);changed[0]^=1;await writeFile(path.join(dir,child.file),changed);await assert.rejects(loadHeldForceRequest(dir),/child blob/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLOSED V3 metadata projects true contained storage, not an executed native success or arbitrary union',async()=>{
  const raw=await readFile(`${root}/held-chassis-border-high-lev1-v3-20261023/trace.jsonl`,'utf8'),budget=raw.trim().split('\n').map(JSON.parse).find(r=>r.type==='held-force-budget'),plan=planContainedRangeStorage(budget.rangeFootprints,budget.observedDebugEventOrdinal);
  assert.equal(budget.preSnapshotBytes,50129730);assert.equal(budget.requiredPendingBytes,153628742);assert.equal(plan.logicalRangeBytes,50128998);assert.equal(plan.backingBytes,18142338);assert.equal(plan.backings.length,58);assert.equal(plan.views.length,97);assert.equal((plan.backingBytes+732)*3+budget.eventReserveBytes,57668762);
});

test('sharing is explicitly opt-in to the controlled profile; old V3/default configurations remain byte-identical',async()=>{
  const old=JSON.parse(await readFile(`${root}/held-chassis-border-high-lev1-v3-20261023/configuration.json`,'utf8'));
  assert.deepEqual((await createNativeControlledRaceHeldCaptureConfig(root,old.outputDirectory)).configuration,old);
  const {configuration:o}=await createNativeControlledRaceHeldCaptureConfig(root,'unused-shared-held',{shareContainedRanges:true});assert.equal(o.heldForceInput.shareContainedRanges,true);assert.equal(o.maxSnapshots,71);assert.equal(validateHeldForceConfiguration(o),true);
  const onlyFlag=structuredClone(old);onlyFlag.heldForceInput.shareContainedRanges=true;onlyFlag.outputDirectory=o.outputDirectory;assert.deepEqual(o,onlyFlag);
  for(const mutate of [v=>v.heldForceInput.shareContainedRanges='true',v=>delete v.controlledRaceSettings,v=>v.maxSnapshots=72,v=>v.pendingFrameObserver.maxPendingBytes++,v=>v.pendingFrameObserver.maxEventSnapshots=63]){const bad=structuredClone(o);mutate(bad);assert.throws(()=>validateHeldForceConfiguration(bad),/Held|Controlled/);}
});

test('pure C# same runtime storage functions prove backing identity, SHA/file slices, partial force alias, header slice and real V3 planning', {skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-held-storage-csharp-'));
  try {
    const raw=await readFile(`${root}/held-chassis-border-high-lev1-v3-20261023/trace.jsonl`,'utf8'),budget=raw.trim().split('\n').map(JSON.parse).find(r=>r.type==='held-force-budget'),meta=path.join(dir,'actual-closed-v3-metadata.json');await writeFile(meta,JSON.stringify({addresses:budget.rangeFootprints.map(r=>Number(r.address)),lengths:budget.rangeFootprints.map(r=>r.length)}));
    const o=(await createNativeControlledRaceHeldCaptureConfig(root,path.join(dir,'capture'),{shareContainedRanges:true})).configuration,cfg=path.join(dir,'configuration.json');await writeFile(cfg,JSON.stringify(o));
    const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url)),q=s=>s.replaceAll("'","''");
    const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${q(source)}';Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$o=$reader.Deserialize([IO.File]::ReadAllText('${q(cfg)}'),[RollcageCapture.Options]);[RollcageCapture.NativeDebugger]::Validate($o)
function Reject($block){$bad=$false;try{&$block|Out-Null}catch{$bad=$true};if(!$bad){throw 'Expected rejection'}}
$o.controlledRaceSettings=$null;Reject {[RollcageCapture.NativeDebugger]::Validate($o)}
$addr=[uint32[]]@(4096,4100,4096,4104,0);$lengths=[int[]]@(16,4,16,16,0)
$read=[Func[uint32,int,byte[]]]{param($a,$n)$b=New-Object byte[] $n;for($i=0;$i -lt $n;$i++){$b[$i]=($a+$i) -band 255};return ,$b}
$s=[RollcageCapture.NativeDebugger]::ReadContainedRangeStorage($addr,$lengths,$read)
if($s.logicalBytes -ne 52 -or $s.backingBytes -ne 32 -or $s.owners.Length -ne 2 -or ![Object]::ReferenceEquals($s.views[0].data,$s.views[1].data) -or ![Object]::ReferenceEquals($s.views[0].data,$s.views[2].data) -or [Object]::ReferenceEquals($s.views[0].data,$s.views[3].data) -or $s.views[1].dataOffset -ne 4){throw 'Not real contained storage'}
$again=[RollcageCapture.NativeDebugger]::ReadContainedRangeStorage($addr,$lengths,$read);if([Object]::ReferenceEquals($s.views[0].data,$again.views[0].data)){throw 'Cross snapshot cache'}
$v=$s.views[1];$copy=[RollcageCapture.NativeDebugger]::CopyRangeSegment($v.data,$v.dataOffset,$v.length);if($copy.Length -ne 4 -or [BitConverter]::ToString($copy) -ne '04-05-06-07'){throw 'Wrong child slice'}
$h=[RollcageCapture.NativeDebugger]::DigestRangeSegment($v.data,$v.dataOffset,$v.length);if($h -ne '${sha(Buffer.from([4,5,6,7]))}'){throw 'Wrong child SHA'}
$stream=New-Object IO.MemoryStream;[RollcageCapture.NativeDebugger]::WriteRangeSegment($stream,$v.data,$v.dataOffset,$v.length);if([BitConverter]::ToString($stream.ToArray()) -ne '04-05-06-07'){throw 'Wrong file slice'};$stream.Dispose()
$patch=[byte[]]@(100,101,102,103,104,105,106,107,108,109,110,111);$patched=[RollcageCapture.NativeDebugger]::CopyPatchedRangeSegment($v.data,$v.dataOffset,$v.length,4100,4098,$patch);if($patched.Length -ne 4 -or [BitConverter]::ToString($patched) -ne '66-67-68-69' -or $v.data[4] -ne 4){throw 'Partial force alias changed backing or wrong offset'}
$backing=New-Object byte[] 64;[BitConverter]::GetBytes([uint32]8192).CopyTo($backing,7);[BitConverter]::GetBytes([uint32]8196).CopyTo($backing,11);[BitConverter]::GetBytes([uint32]8200).CopyTo($backing,15)
$header=[RollcageCapture.NativeDebugger]::CopyRangeSegment($backing,7,12);$vector=[RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($header,$header,100,100);if($vector.length -ne 8){throw 'Wrong header segment'}
Reject {[RollcageCapture.NativeDebugger]::ValidateHeldBankHeader($backing,$header,100,100)}
Reject {[RollcageCapture.NativeDebugger]::ValidateRangeSegment($v.data,16,1)}
Reject {[RollcageCapture.NativeDebugger]::PlanContainedRangeStorage([uint32[]]@(4294967294),[int[]]@(4))}
Reject {[RollcageCapture.NativeDebugger]::PlanContainedRangeStorage([uint32[]]@(0),[int[]]@(1))}
$m=$reader.DeserializeObject([IO.File]::ReadAllText('${q(meta)}'));$p=[RollcageCapture.NativeDebugger]::PlanContainedRangeStorage([uint32[]]$m.addresses,[int[]]$m.lengths)
if($p.backingBytes -ne 18142338 -or $p.logicalBytes -ne 50128998 -or $p.owners.Length -ne 58 -or [RollcageCapture.NativeDebugger]::HeldForceRequiredBytes(($p.backingBytes+732),50618) -ne 57668762){throw 'Actual V3 metadata projection differs'}
'Pure shared storage PASS; original V3 refused before allocations, no native fixture/game launched.'`;
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);
  } finally {await rm(dir,{recursive:true,force:true});}
});
