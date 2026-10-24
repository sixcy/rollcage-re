import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createNativeControlledRaceHeldCaptureConfig} from '../tools/prepare-native-controlled-race-held-capture.mjs';
import {createNativeHeldChassisForceCaptureConfig} from '../tools/prepare-native-held-chassis-force-capture.mjs';
import {validateHeldForceConfiguration} from '../tools/lib/native-held-force.mjs';
import {controlledRaceSettingsRanges,controlledRaceSettingsReplacement,verifyControlledRaceSettingsSnapshot,verifyControlledRaceSettingsRecords,verifyControlledRaceSettingsOutputs} from '../tools/lib/native-controlled-race-settings.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

const root='analysis/native-physics-local/startup-20261022',sha=b=>createHash('sha256').update(b).digest('hex');
const policy={breakpointId:'controlled-race-settings',level:7,quality:0,expectedTrackByte:0,expectedQualityByte:1};
function input() {
  //Synthetic guarded transport/ABI fixture, not an original process observation.
  const context=Buffer.alloc(716,0x55),config=Buffer.alloc(128,0xa6),stack=Buffer.alloc(28,0x77),frontend=Buffer.alloc(20);
  for(const[o,v]of [[164,0],[172,11],[176,11],[184,0x43e0c5],[196,0x13000000],[144,0x53]])context.writeUInt32LE(v,o);
  config[0xb]=0;config[0x31]=1;config[0x14]=0;config[0x15]=10;
  for(const[o,v]of [[16,10],[20,0x43dae8],[24,3]])stack.writeUInt32LE(v,o);
  for(const[o,v]of [[0,4],[4,0],[8,1],[12,918],[16,12345]])frontend.writeUInt32LE(v,o);
  return {mainBase:0x400000,ownerTid:7,tid:7,configAddress:0x11000000,sessionAddress:0x12000000,config,stack,context,frontend};
}
function copy(x){return {...x,config:Buffer.from(x.config),stack:Buffer.from(x.stack),context:Buffer.from(x.context),frontend:Buffer.from(x.frontend)};}
function fixture() {
  const x=input(),{mainBase:base}=x,rows=new Map(),head=Buffer.alloc(48,0x33),runtime=Buffer.alloc(0xd3,0x44),family=Buffer.from(Array.from({length:20},(_,i)=>i%4)),local=Buffer.from(Array.from({length:20},(_,i)=>i%5)),stem=Buffer.alloc(260);
  stem.write('high\\lev3');x.frontend.subarray(8,16).copy(stem,0x68); //The260B image transport also covers the real main-state globals.
  const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
  const data=[u32(x.configAddress),u32(x.sessionAddress),x.config,head,runtime,x.stack,family,local,stem,x.frontend.subarray(0,4),x.frontend.subarray(4,8),x.frontend.subarray(8,16),x.frontend.subarray(16,20)];
  controlledRaceSettingsRanges().forEach((d,i)=>{
    const address=d.baseRegister?x.context.readUInt32LE(196):d.dereferenceOffsets?(d.rva==='0x1ecefc'?x.configAddress:x.sessionAddress)+Number(d.offset??0):base+Number(d.rva),bytes=Buffer.from(data[i]);
    rows.set(d.id,{...d,address,length:bytes.length,bytes,sha256:sha(bytes),moduleBaseAddress:base});
  });
  const fsBase=0x14000000,seh=u32(0x1300ff00),descriptor=Buffer.alloc(8);descriptor.writeUInt16LE(fsBase&65535,2);descriptor[4]=fsBase>>>16&255;descriptor[7]=fsBase>>>24;
  rows.set('thread-seh-head',{id:'thread-seh-head',address:fsBase,length:4,bytes:seh,sha256:sha(seh),source:'stopped-owned-thread-fs-zero'});
  const snapshot={breakpointId:policy.breakpointId,hit:1,tid:7,ordinal:4,observedDebugEventOrdinal:900,capturePhase:'before-declared-writes-before-original-instruction',context:x.context,contextSha256:sha(x.context),ranges:rows,moduleBaseAddress:base,
    registers:Object.fromEntries([['eip',184],['eax',176],['ecx',172],['ebx',164],['esp',196]].map(([k,o])=>[k,x.context.readUInt32LE(o)])),
    threadEnvironment:{fsSelector:0x53,fsBase,sehWord:seh.readUInt32LE(),descriptorHex:descriptor.toString('hex'),tid:7,contextSelectorOffset:144,source:'stopped-owned-thread-selector-query',selectorApi:'Wow64GetThreadSelectorEntry'}};
  const replacement=controlledRaceSettingsReplacement(policy,x),common={pid:42,tid:7,snapshotOrdinal:4,observedDebugEventOrdinal:900},guard={...common,type:'controlled-race-settings-guarded',ownerMainTid:7,breakpointId:policy.breakpointId,rawHit:1,configurationAddress:x.configAddress,sessionAddress:x.sessionAddress,stackAddress:x.context.readUInt32LE(196),stackBytesHex:x.stack.toString('hex'),configurationBeforeHex:x.config.toString('hex'),contextSha256:snapshot.contextSha256,allGuardsBeforeWrites:true,beforeOriginalInstruction:true};
  guard.instructionAddress=base+0x3e0c5;guard.breakpointInstructionHex='ccfcce5e00';guard.restoredInstructionHex='a1fcce5e00';
  const done={...guard,type:'controlled-race-settings-intervention',level:policy.level,quality:policy.quality,configurationAfterHex:replacement.toString('hex'),contextUnchanged:true,allOtherCapturedBytesUnchanged:true,rootsUnchanged:true,nativeOutputsWritten:false};
  const writes=[0xb,0x31].map((o,i)=>({...common,type:'controlled-race-settings-input-write',index:i+1,address:x.configAddress+o,length:1,originalBytesHex:x.config.subarray(o,o+1).toString('hex'),replacementBytesHex:replacement.subarray(o,o+1).toString('hex')}));
  const held={...snapshot,breakpointId:'held-force-pre-input',ordinal:5,observedDebugEventOrdinal:1000,ranges:new Map([...rows].map(([id,r])=>[id,{...r,bytes:Buffer.from(r.bytes)}]))};
  const h=held.ranges.get('settings-session-header').bytes,t=held.ranges.get('settings-session-runtime').bytes,s=held.ranges.get('settings-level-stem').bytes;
  h[0xe]=family[policy.level-1];h[0xf]=local[policy.level-1];t[0x579-0x54d]=policy.level-1;s.fill(0);s.write('low\\lev7');x.frontend.subarray(8,16).copy(s,0x68);
  //Native may consume/clear the override before this later observation.
  for(const r of held.ranges.values())r.sha256=sha(r.bytes);
  const output={type:'controlled-race-settings-native-outputs',pid:42,tid:7,observedDebugEventOrdinal:1000,sessionAddress:x.sessionAddress,level:policy.level,quality:policy.quality,sessionHeaderHex:h.toString('hex'),sessionRuntimeHex:t.toString('hex'),familyTableHex:family.toString('hex'),localTableHex:local.toString('hex'),nativeStemHex:s.toString('hex'),nativeOutputsWritten:false,configurationPersistenceAssumed:false,beforeHeldRequest:true};
  return {x,snapshot,held,records:[{type:'debug-event',ordinal:900,event:1,pid:42,tid:7},{type:'snapshot',ordinal:4},guard,...writes,done,output,{type:'snapshot',ordinal:5}],owner:{type:'owned-process',pid:42,tid:7}};
}

test('guard site, caller and correlated table writers match retained original instructions',async()=>{
  const e=await readInstructionEvidence(['052-menu-exit-assembly.json'],{directory:'analysis/native-race-entry-20261022/results'}),m=new Map(e.instructions.map(i=>[i.address,i]));
  for(const[a,op,args]of [[0x43e0c5,'MOV',['EAX','[0x005ecefc]']],[0x43e0b6,'MOV',['ECX','EAX']],[0x43e0a7,'MOV',['EAX','dword ptr [ESP + 0x10]']],[0x43e0de,'MOV',['byte ptr [EAX + 0x579]','CL']],[0x43e0e9,'MOVZX',['EDX','byte ptr [ECX + 0x574760]']],[0x43e0fd,'MOVZX',['ECX','byte ptr [ECX + 0x57477c]']]])assert.deepEqual(m.get(a),{address:a,op,args});
});

test('new named71-snapshot profile preserves old70 profile exactly and rejects unrelated writes/scope/bounds',async()=>{
  const oldRaw=JSON.parse(await readFile(`${root}/held-chassis-border-v2-20261023/configuration.json`,'utf8'));
  const old=(await createNativeHeldChassisForceCaptureConfig(root,oldRaw.outputDirectory)).configuration;assert.deepEqual(old,oldRaw);
  const {configuration:o}=await createNativeControlledRaceHeldCaptureConfig(root,'unused-settings-output');
  assert.equal(o.maxSnapshots,71);assert.equal(o.pendingFrameObserver.maxEventSnapshots,64);assert.equal(o.pendingFrameObserver.maxPendingBytes,134217728);assert.equal(o.heldForceInput.maxHoldMs,20000);assert.equal(o.maxDurationMs,90000);assert.equal(o.controlledRaceSettings.level,1);assert.equal(o.controlledRaceSettings.quality,1);assert.equal(validateHeldForceConfiguration(o),true);
  for(const mutate of [x=>x.maxSnapshots=70,x=>x.maxSnapshots=72,x=>x.controlledRaceSettings.level=0,x=>x.controlledRaceSettings.level=21,x=>x.controlledRaceSettings.quality=2,x=>x.controlledRaceSettings.expectedTrackByte=1,x=>x.controlledRaceSettings.expectedQualityByte=0,x=>x.controlledRaceSettings.extraWrite=true,x=>delete x.heldForceInput,x=>x.breakpoints.at(-1).rva='0x3e0ca',x=>x.breakpoints.at(-1).ranges[2].length=127,x=>x.breakpoints.at(-1).captureWhen={equalsBytesHex:'000a'},x=>x.breakpoints.at(-1).ranges.push({id:'pose',rva:'0x509300',length:4}),x=>x.breakpoints.find(b=>b.id==='native-frame-before').ranges.find(r=>r.id==='settings-track-family').rva='0x174761',x=>x.phaseActions.push({breakpointId:'controlled-race-settings',writes:[]})]){const bad=structuredClone(o);mutate(bad);assert.throws(()=>validateHeldForceConfiguration(bad),/Controlled|Held/);}
});

test('synthetic input closure guards raw register/caller, native idle state and exact original bytes before changing only two fields',()=>{
  const x=input(),next=controlledRaceSettingsReplacement(policy,x);assert.equal(next[0xb],7);assert.equal(next[0x31],0);assert.deepEqual([...next].flatMap((v,i)=>v!==x.config[i]?[i]:[]),[0xb,0x31]);
  for(const mutate of [v=>v.tid=8,v=>v.configAddress=0,v=>v.configAddress=v.sessionAddress,v=>v.configAddress=0xffffffc0,v=>v.sessionAddress=0xffffff00,v=>v.context.writeUInt32LE(0x43e0ca,184),v=>v.context.writeUInt32LE(1,164),v=>v.context.writeUInt32LE(20,172),v=>v.context.writeUInt32LE(12,176),v=>v.context.writeUInt32LE(0xfffffff0,196),v=>v.stack.writeUInt32LE(9,16),v=>v.stack.writeUInt32LE(0x43daed,20),v=>v.stack.writeUInt32LE(4,24),v=>v.config[0x14]=1,v=>v.config[0x15]=9,v=>v.config[0xb]=1,v=>v.config[0x31]=0,v=>v.frontend.writeUInt32LE(5,0),v=>v.frontend.writeUInt32LE(1,4),v=>v.frontend.writeUInt32LE(2,8),v=>v.frontend.writeUInt32LE(0,16)]){const bad=copy(x);mutate(bad);assert.throws(()=>controlledRaceSettingsReplacement(policy,bad),/Controlled/);}
  const varying=copy(x);varying.frontend.writeUInt32LE(0xffffffff,12);assert.deepEqual(controlledRaceSettingsReplacement(policy,varying),next);assert.equal(x.config[0xb],0);assert.equal(x.config[0x31],1);
});

test('synthetic actual-record schema proves full preimage/two-write order/context and native outputs without assuming override persistence',async()=>{
  const o=(await createNativeControlledRaceHeldCaptureConfig(root,'unused-proof',{level:7,quality:0})).configuration,f=fixture();
  assert.equal(verifyControlledRaceSettingsSnapshot(f.snapshot,policy,{mainBase:0x400000,ownerTid:7}).replacement[0xb],7);
  const verify=v=>verifyControlledRaceSettingsRecords(o,v.records,v.snapshot,v.owner,v.held);
  assert.equal(verify(f).verified,true);assert.equal(verify(f).configurationPersistenceAssumed,false);assert.equal(f.held.ranges.get('settings-config').bytes[0xb],0);
  const record=(v,type)=>v.records.find(r=>r.type===type),mutateHeld=(v,id,mutate)=>{const r=v.held.ranges.get(id);mutate(r.bytes);r.sha256=sha(r.bytes);};
  for(const mutate of [v=>record(v,'controlled-race-settings-guarded').allGuardsBeforeWrites=false,v=>record(v,'controlled-race-settings-guarded').restoredInstructionHex='a100000000',v=>record(v,'controlled-race-settings-input-write').address++,v=>v.records.filter(r=>r.type==='controlled-race-settings-input-write')[1].length=2,v=>record(v,'controlled-race-settings-intervention').configurationAfterHex='00'.repeat(128),v=>record(v,'controlled-race-settings-intervention').contextSha256='00'.repeat(32),v=>record(v,'controlled-race-settings-intervention').nativeOutputsWritten=true,v=>v.records.splice(3,0,{type:'debug-event'}),v=>v.records.push({...record(v,'controlled-race-settings-guarded')}),v=>v.owner.tid=8,v=>record(v,'debug-event').pid++,v=>v.snapshot.registers.eax++,v=>v.snapshot.threadEnvironment.fsBase++,v=>v.snapshot.ranges.get('settings-config').address++,v=>mutateHeld(v,'settings-session-header',b=>b[0xe]^=1),v=>mutateHeld(v,'settings-session-runtime',b=>b[0x2c]++),v=>mutateHeld(v,'settings-level-stem',b=>b.write('high')),v=>record(v,'controlled-race-settings-native-outputs').sessionAddress++,v=>record(v,'controlled-race-settings-native-outputs').beforeHeldRequest=false]){const bad=fixture();mutate(bad);assert.throws(()=>verify(bad),/Controlled|Captured|Unmapped|overlap/i);}
  for(const [id,mutate]of [['settings-session-header',b=>b[0xe]^=1],['settings-session-runtime',b=>b[0x2c]++],['settings-level-stem',b=>b.write('high')]]){const bad=fixture();mutateHeld(bad,id,mutate);assert.throws(()=>verifyControlledRaceSettingsOutputs(bad.held,policy,0x400000),/Controlled/);}
});

test('pure typed C# full config and atomic guard/transition/output contracts pass with independent corruption negatives; no native fixture/game', {skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-settings-pure-'));
  try {
    const o=(await createNativeControlledRaceHeldCaptureConfig(root,path.join(dir,'capture'))).configuration,configs=[o];
    for(const mutate of [v=>v.maxSnapshots=70,v=>v.controlledRaceSettings.level=21,v=>v.controlledRaceSettings.expectedTrackByte=1,v=>v.controlledRaceSettings.expectedQualityByte=0,v=>v.breakpoints.at(-1).rva='0x3e0ca',v=>v.breakpoints.at(-1).ranges[2].length=127,v=>v.breakpoints.at(-1).ranges[9].rva='0x1ec13c',v=>v.breakpoints.push({id:'pose-write',rva:'0x4749e0',ranges:[]}),v=>v.heldForceInput=null]){const bad=structuredClone(o);mutate(bad);configs.push(bad);}
    const files=[];for(let i=0;i<configs.length;i++){const f=path.join(dir,`config-${i}.json`);await writeFile(f,JSON.stringify(configs[i]));files.push(f);}
    const quote=s=>s.replaceAll("'","''"),source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url));
    const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${quote(source)}'
Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$files=@(${files.map(f=>`'${quote(f)}'`).join(',')})
function Reject($block){$bad=$false;try{&$block|Out-Null}catch{$bad=$true};if(!$bad){throw 'Expected strict rejection'}}
$o=$reader.Deserialize([IO.File]::ReadAllText($files[0]),[RollcageCapture.Options]);[RollcageCapture.NativeDebugger]::Validate($o)
for($i=1;$i -lt $files.Count;$i++){$bad=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);Reject {[RollcageCapture.NativeDebugger]::Validate($bad)}}
$p=$o.controlledRaceSettings;$p.level=7;$p.quality=0
$cfg=New-Object byte[] 128;for($i=0;$i -lt 128;$i++){$cfg[$i]=166};$cfg[11]=0;$cfg[49]=1;$cfg[20]=0;$cfg[21]=10
$stk=New-Object byte[] 28;$ctx=New-Object byte[] 716;$front=New-Object byte[] 20
function Store($b,$off,$value){[BitConverter]::GetBytes([uint32]$value).CopyTo($b,$off)}
Store $ctx 172 11;Store $ctx 176 11;Store $ctx 184 4448453;Store $ctx 196 318767104
Store $stk 16 10;Store $stk 20 4446952;Store $stk 24 3
Store $front 0 4;Store $front 8 1;Store $front 12 918;Store $front 16 12345
function Replace($c,$s,$x,$f){[RollcageCapture.NativeDebugger]::ControlledRaceSettingsReplacement($p,4194304,7,7,285212672,301989888,$c,$s,$x,$f)}
[byte[]]$next=Replace $cfg $stk $ctx $front
if($next[11] -ne 7 -or $next[49] -ne 0){throw 'Wrong replacement'}
[RollcageCapture.NativeDebugger]::ValidateControlledRaceSettingsTransition($cfg,$next,$next,$ctx,$ctx)
Reject {[RollcageCapture.NativeDebugger]::ControlledRaceSettingsReplacement($p,4194304,7,8,285212672,301989888,$cfg,$stk,$ctx,$front)}
Reject {[RollcageCapture.NativeDebugger]::ControlledRaceSettingsReplacement($p,4194304,7,7,0,301989888,$cfg,$stk,$ctx,$front)}
Reject {[RollcageCapture.NativeDebugger]::ControlledRaceSettingsReplacement($p,4194304,7,7,301989888,301989888,$cfg,$stk,$ctx,$front)}
Reject {[RollcageCapture.NativeDebugger]::ControlledRaceSettingsReplacement($p,4194304,7,7,285212672,4294967290,$cfg,$stk,$ctx,$front)}
$p.expectedQualityByte=0;Reject {Replace $cfg $stk $ctx $front};$p.expectedQualityByte=1
Store $front 12 4294967295;[byte[]]$varying=Replace $cfg $stk $ctx $front;if([BitConverter]::ToString($varying) -ne [BitConverter]::ToString($next)){throw 'Counter was treated as zero-only'}
foreach($off in @(11,20,21,49)){$bad=[byte[]]$cfg.Clone();$bad[$off]=$bad[$off] -bxor 1;Reject {Replace $bad $stk $ctx $front}}
foreach($off in @(16,20,24)){$bad=[byte[]]$stk.Clone();Store $bad $off 99;Reject {Replace $cfg $bad $ctx $front}}
foreach($off in @(164,172,176,184,196)){$bad=[byte[]]$ctx.Clone();Store $bad $off 99;Reject {Replace $cfg $stk $bad $front}}
foreach($off in @(0,4,8,16)){$bad=[byte[]]$front.Clone();Store $bad $off 0; if($off -eq 4){Store $bad $off 1};Reject {Replace $cfg $stk $ctx $bad}}
$bad=[byte[]]$next.Clone();$bad[33]=$bad[33] -bxor 1;Reject {[RollcageCapture.NativeDebugger]::ValidateControlledRaceSettingsTransition($cfg,$bad,$next,$ctx,$ctx)}
$bad=[byte[]]$ctx.Clone();$bad[300]=1;Reject {[RollcageCapture.NativeDebugger]::ValidateControlledRaceSettingsTransition($cfg,$next,$next,$ctx,$bad)}
$head=New-Object byte[] 48;$run=New-Object byte[] 211;$family=New-Object byte[] 20;$local=New-Object byte[] 20;$stem=New-Object byte[] 260;$head[14]=3;$head[15]=2;$family[6]=3;$local[6]=2;$run[44]=6;[Text.Encoding]::ASCII.GetBytes('low\\lev7').CopyTo($stem,0)
[RollcageCapture.NativeDebugger]::ValidateControlledRaceSettingsOutputs($p,$head,$run,$family,$local,$stem)
$head[14]=4;Reject {[RollcageCapture.NativeDebugger]::ValidateControlledRaceSettingsOutputs($p,$head,$run,$family,$local,$stem)}
'Pure settings config/ABI/transition/output checks PASS; no native process launched.'`;
    const r=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(existsSync(o.outputDirectory),false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
