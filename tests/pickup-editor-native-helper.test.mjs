import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

const root='analysis/pickup-editor-native-cases-20261024',source=fileURLToPath(new URL('../tools/lib/pickup-editor-native-debugger.cs',import.meta.url)),quote=s=>s.replaceAll("'","''");
const ancestor='analysis/native-physics-local/startup-20261022/bounded-contained-held-runner-v4-20261023/native-physics-debugger.cs';

test('dedicated source pins immutable ancestor and exact original pickup boundaries',async()=>{
  assert.equal(createHash('sha256').update(await readFile(ancestor)).digest('hex'),'a77e6894a235316f0f65274b5b262370e921ea0211196bdf4804c1c98b0773e9');
  const e=await readInstructionEvidence(['2457-autonomous-initializer-dispatch-assembly.json','3209-stage-child-47b680-assembly.json','3225-pickup-active-rebuild-assembly.json','3247-pickup-finalize-assembly.json','3287-pickup-controller-construction-assembly.json'],{directory:'analysis/native-simulation/results'}),rows=new Map(e.instructions.map(r=>[r.address,r]));
  for(const[a,op,args]of [[0x47ecea,'CALL',['0x0047b580']],[0x4319e6,'RET',[]],[0x47b8d0,'MOV',['dword ptr [EBP + 0x180]','0x820064']],[0x47b8da,'CALL',['0x0047b920']],[0x431c91,'CALL',['0x0047caf0']],[0x47cc17,'RET',[]]])assert.deepEqual(rows.get(a),{address:a,op,args});
  assert.ok(e.evidence.every(r=>r.subject.digest.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
});

test('all six actual staged configurations fully typed-validate; pure registry/collection/placement/index15 lifecycle negatives reject without launch', {skip:process.platform!=='win32'},async()=>{
  const files=['baseline-low','baseline-high','edited16-low','edited16-high','zero-low','zero-high'].map(s=>fileURLToPath(new URL(`../${root}/${s}/capture-config.json`,import.meta.url)));
  const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${quote(source)}';Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
function Reject($block){$bad=$false;try{&$block|Out-Null}catch{$bad=$true};if(!$bad){throw 'Expected strict rejection'}}
function Store($b,$o,$v){[BitConverter]::GetBytes([uint32]$v).CopyTo($b,$o)}
$files=@(${files.map(f=>`'${quote(f)}'`).join(',')})
foreach($f in $files){$o=$reader.Deserialize([IO.File]::ReadAllText($f),[RollcagePickupEditor.Options]);$o.outputDirectory=[IO.Path]::Combine([IO.Path]::GetTempPath(),'pickup-validate-only-'+[guid]::NewGuid().ToString('N'));[RollcagePickupEditor.NativeDebugger]::Validate($o)}
$o=$reader.Deserialize([IO.File]::ReadAllText($files[2]),[RollcagePickupEditor.Options]);$o.heldForceInput=New-Object RollcagePickupEditor.HeldForceInput;Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupEditorPolicy($o)};$o.heldForceInput=$null
$o.pickupEditorObservation.expectedCount=17;Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupEditorPolicy($o)};$o.pickupEditorObservation.expectedCount=16
$o.breakpoints[8].rva='0x7b8d1';Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupEditorPolicy($o)}
[RollcagePickupEditor.NativeDebugger]::ValidatePickupRegistryBudget(493,16,3);Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupRegistryBudget(494,16,3)};Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupRegistryBudget(0,16,7)}
[RollcagePickupEditor.NativeDebugger]::ValidatePickupCollection(8585228,8519780);Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupCollection(8519681,8519780)};Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupCollection(8585228,8519779)}
$body=New-Object byte[] 400;$auth=New-Object byte[] 12;Store $body 0 10;Store $body 12 4096;Store $body 384 8585228;[BitConverter]::GetBytes([int16]-32768).CopyTo($auth,0);[BitConverter]::GetBytes([int16]32767).CopyTo($auth,2);[BitConverter]::GetBytes([int16]-123).CopyTo($auth,4)
[BitConverter]::GetBytes([int32]-2147483648).CopyTo($body,52);[BitConverter]::GetBytes([int32]2147418112).CopyTo($body,56);[BitConverter]::GetBytes([int32]-8060928).CopyTo($body,60)
[RollcagePickupEditor.NativeDebugger]::ValidatePickupPlacement($body,$auth);$body[52]=$body[52] -bxor 1;Reject {[RollcagePickupEditor.NativeDebugger]::ValidatePickupPlacement($body,$auth)}
$p=New-Object RollcagePickupEditor.PickupEditorObservation;$p.scenario='cycle';$p.expectedCount=16;$p.targetIndex=15;$s=New-Object RollcagePickupEditor.PickupEditorProgress;Reject {$s.CompletePlacement($p,15)};$s.initialized=$true;$s.firstTickSeen=$true
for($i=0;$i -lt 16;$i++){$s.CompletePlacement($p,$i)};if($s.goalReached){throw 'Initial placement falsely claimed collection/respawn'};$s.collections[15]=1;$s.respawnCollectionGeneration=1;$s.CompletePlacement($p,15);if(!$s.goalReached -or $s.completedTargetGeneration -ne 1){throw 'Actual later target generation was not required'}
$p.scenario='load';$p.expectedCount=13;$p.targetIndex=0;$s=New-Object RollcagePickupEditor.PickupEditorProgress;$s.initialized=$true;$s.firstTickSeen=$true
for($i=4;$i -lt 13;$i++){$s.CompletePlacement($p,$i)};if($s.goalReached){throw 'Missing countdown placements falsely completed load validation'}
for($i=0;$i -lt 4;$i++){$s.CompletePlacement($p,$i)};if(!$s.goalReached -or $s.completedFinalizers -ne 13){throw 'All actual initial placements did not complete load validation'}
'Six typed configurations and pure native boundary guards PASS; no process launched.'`;
  const r=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);
});

test('pickup lifecycle admission retains countdown ticks and placements after actual initialization',async()=>{
  const cs=await readFile(source,'utf8'),observer=cs.slice(cs.indexOf('static void ObservePickupEditor('),cs.indexOf('sealed class ThreadEnvironmentCapture'));
  assert.ok(observer.includes('if(tid!=child.tid||!progress.settingsApplied)return;'));
  assert.ok(observer.includes('if(!progress.initialized)return;'));
  assert.ok(observer.includes('if(!progress.firstTickSeen)return;'));
  assert.doesNotMatch(observer,/0x57c|sessionRoot|phase\s*!=\s*4/);
});

test('dedicated runner uses fresh source identity, mandatory policy and Command/Add-Type without security overrides',async()=>{
  const cs=await readFile(source,'utf8'),ps=await readFile(new URL('../tools/native-pickup-editor-capture.ps1',import.meta.url),'utf8'),node=await readFile(new URL('../tools/native-pickup-editor-capture.mjs',import.meta.url),'utf8');
  assert.ok(cs.indexOf('ValidatePickupEditorPolicy(o);')>0);assert.ok(cs.includes('if(!pickupEditor.goalReached||pickupEditor.collectOpen||pickupEditor.respawnOpen'));
  assert.ok(ps.includes('Loaded pickup helper differs from the current source'));assert.ok(node.includes("['-NoProfile','-Command',command]"));assert.doesNotMatch(node+ps,/ExecutionPolicy\s+Bypass|distinct\.exe/);
});
