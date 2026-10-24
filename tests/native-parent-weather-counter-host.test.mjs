import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url));
const root='analysis/native-physics-local/startup-20261022',quote=s=>s.replaceAll("'","''");
function pure(code){
  const script=`$ErrorActionPreference='Stop'\nAdd-Type -Path '${quote(source)}'\nfunction Reject($block){$bad=$false;try{&$block|Out-Null}catch{$bad=$true};if(!$bad){throw 'Expected strict rejection'}}\nfunction Store($b,$offset,$value){[BitConverter]::GetBytes([uint32]$value).CopyTo($b,$offset)}\n${code}\n'Pure counter host PASS; no game or native fixture launched.'`;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);
}
const helpers=`
$BASE=[uint32]6225920;$TARGET=[uint32]1990852672;$APP=[uint32]536870912;$HEAD=[uint32]805306368;$saved=[uint32[]]@(4112,8224,12336,16448)
function Word($value){$b=New-Object byte[] 4;Store $b 0 $value;return ,$b}
function Stack($physical){$b=New-Object byte[] $(if($physical){28}else{24});$shift=0;if($physical){Store $b 0 ($BASE+0x51017);$shift=4};for($j=0;$j -lt 4;$j++){Store $b ($shift+$j*4) $saved[$j]};Store $b ($shift+16) ($BASE+0x100010);Store $b ($shift+20) 21;return ,$b}
function Memory {
 $global:reads=New-Object 'Collections.Generic.List[string]';$global:cells=@{};$global:stack=New-Object byte[] 1024;for($i=0;$i -lt $global:stack.Length;$i++){$global:stack[$i]=105};$global:stackBase=$U-512
 $global:cells[($BASE+0x2e6c8c).ToString()]=Word 1;$origin=New-Object byte[] 16;[BitConverter]::GetBytes([int64]10000000).CopyTo($origin,0);[BitConverter]::GetBytes([int64]17829773361440).CopyTo($origin,8);$global:cells[($BASE+0x3135a4).ToString()]=$origin;$global:cells[($BASE+0x16e0fc).ToString()]=Word $TARGET;$global:cells[($BASE+0x50a548).ToString()]=Word 288
 $global:A=[uint32]([math]::Floor(($U-368)/8)*8);$global:B=$A-32;$global:K=$B-4;$global:P=$B+24;$global:C=$U-364
 Store $global:stack ($K-$global:stackBase) $P;Store $global:stack ($B+8-$global:stackBase) ($U-368);Store $global:stack ($C-$global:stackBase) ($BASE+0x98458);Store $global:stack ($U-44-$global:stackBase) ($BASE+0x96822);Store $global:stack ($U-20-$global:stackBase) ($BASE+0x51116)
}
$read=[Func[uint32,int,byte[]]]{param($address,$length)$global:reads.Add($address.ToString()+':'+$length);if($address -ge $global:stackBase -and $address+$length -le $global:stackBase+$global:stack.Length){$b=New-Object byte[] $length;[Array]::Copy($global:stack,($address-$global:stackBase),$b,0,$length);return ,$b};$b=$global:cells[$address.ToString()];if($null -eq $b -or $b.Length -ne $length){throw 'Actual counter span unavailable'};return ,([byte[]]$b.Clone())}
function Parent($entry,$initial=1,$frequency=10000000){
 $global:U=[uint32]$entry;Memory;$global:cells[($BASE+0x2e6c8c).ToString()]=Word $initial;[BitConverter]::GetBytes([int64]$frequency).CopyTo($global:cells[($BASE+0x3135a4).ToString()],0);$s=New-Object RollcageCapture.ParentRttiProgress;$s.weatherScreenQueries=$true;$s.counter=New-Object RollcageCapture.ParentWeatherCounterProgress
 for($i=0;$i -lt 8;$i++){$id=[RollcageCapture.ParentRttiProgress]::Stages[$i];if($i -eq 0){$st=New-Object byte[] 8;Store $st 0 ($BASE+0x100010);Store $st 4 21;$esp=$U}else{$physical=$i -eq 2 -or $i -eq 3;$st=Stack $physical;$esp=$U-$(if($physical){20}else{16})};$s.ObserveStage($id,$BASE,7,7,$esp,288,17,$st,$saved,(100+$i));if($i -eq 0){$s.counter.LatchOriginal($s,$BASE,7,$read);$s.ObserveMap($id,$APP,$HEAD)}}
 $s.MarkAuxiliaryCaptured(11);$s.Activate(107,7);$s.MarkAuxiliaryPublished()
 $f=New-Object byte[] 52;Store $f 0 $APP;Store $f 8 ($BASE+0x2e213c);Store $f 12 ($BASE+0x2e20a4);Store $f 40 ($BASE+0x1a0c8);Store $f 44 ($U-60);Store $f 48 1;$camera=Word ($BASE+0x51107)
 $s.ValidateEndpoint($true,$BASE,7,($U-276),288,$APP,$f,$camera,108);$s.CommitEndpoint($true);$s.ValidateEndpoint($false,$BASE,7,($U-276),288,$APP,$f,$camera,109);$s.CommitEndpoint($false)
 $st=Stack $false;$s.ObserveStage('native-control-after-cameras',$BASE,7,7,($U-16),288,17,$st,$saved,110);$s.ObserveMap('native-control-after-cameras',$APP,$HEAD)
 for($q=1;$q -le 2;$q++){$p=New-Object RollcageCapture.ParentRttiEndpointRead;$p.weather=$true;$p.commonCaller=$true;$p.weatherQueryIndex=$q;$p.clockBytes=Word 288;$p.singletonBytes=Word $APP;$p.context=New-Object byte[] 68;Store $p.context 0 $APP;Store $p.context 8 ($BASE+0x2e213c);Store $p.context 12 ($BASE+0x2e20a4);Store $p.context 40 ($BASE+0xabf3);Store $p.context 44 ($U-319);Store $p.context 48 ($U-320);Store $p.context 52 ($U-$(if($q -eq 1){336}else{344}));Store $p.context 56 ($U-$(if($q -eq 1){332}else{336}));Store $p.context 60 ($U-$(if($q -eq 1){340}else{332}));Store $p.context 64 ($U-328);$p.queryReturn=Word ($BASE+$(if($q -eq 1){0x98092}else{0x980f5}));$p.screenReturn=Word ($BASE+0x96822);$p.parentReturn=Word ($BASE+0x51116);$p.name=[Text.Encoding]::ASCII.GetBytes('0 Player'+[char]0);$s.ValidateWeatherEndpoint($true,$BASE,7,($U-460),$p,(110+$q*2));$s.CommitEndpoint($true);$s.ValidateWeatherEndpoint($false,$BASE,7,($U-460),$p,(111+$q*2));$s.CommitEndpoint($false)}
 return $s
}
function Observe($s,$entry){$esp=$(if($entry){$K}else{$B});$eip=$BASE+$(if($entry){0x89d11}else{0x89d13});return [RollcageCapture.NativeDebugger]::ReadParentWeatherCounter($s,$s.counter,$BASE,7,$entry,$esp,$eip,($U-368),$TARGET,$read)}
function Admit($s,$entry,$observed){$s.counter.Validate($s,$entry,$BASE,7,($BASE+$(if($entry){0x89d11}else{0x89d13})),($U-368),$TARGET,$(if($entry){$K}else{$B}),$observed,$(if($entry){118}else{119}),$(if($entry){19}else{20}),21)}
function CounterPair($s){$before=Observe $s $true;Admit $s $true $before;$s.counter.Commit($true);[BitConverter]::GetBytes([int64]17829899999999).CopyTo($global:stack,($P-$global:stackBase));$after=Observe $s $false;Admit $s $false $after;$s.counter.Commit($false)}
function World($s){$st=Stack $false;$s.ObserveStage('native-control-after-world-effects',$BASE,7,7,($U-16),288,17,$st,$saved,120);$s.ObserveMap('native-control-after-world-effects',$APP,$HEAD)}
`;

test('retained QPC opcodes and pure paired observer preserve both stack alignments, actual output preimage/postimage and all original checkpoints', {skip:process.platform!=='win32'},async()=>{
  const evidence=await readInstructionEvidence(['3630-weather-489cd0-procedure_assembly.json','3611-object-effect-498030-procedure_assembly.json'],{directory:'analysis/native-simulation/results'}),rows=new Map(evidence.instructions.map(row=>[row.address,row]));
  assert.deepEqual(rows.get(0x489d11),{address:0x489d11,op:'CALL',args:['ESI']});assert.deepEqual(rows.get(0x489d13),{address:0x489d13,op:'MOV',args:['EAX','dword ptr [ESP + 0x18]']});assert.deepEqual(rows.get(0x498453),{address:0x498453,op:'CALL',args:['0x00489cd0']});
  pure(`${helpers}
foreach($entry in @(1048576,1048580)){$s=Parent $entry;$before=Observe $s $true;if($before.ranges.Count -ne 10 -or $before.output -ne $K+28 -or $before.frame -ne $B -or $before.argument.Length -ne 4 -or $before.outputBytes.Length -ne 8){throw 'Wrong original aligned frame/rows'};$total=0;foreach($r in $before.ranges){$total+=$r.data.Length};if($total -ne 84){throw 'Wrong exact observation extent'}
if(($before.ranges|ForEach-Object {$_.id}) -join ',' -ne 'native-parent-counter-argument,native-parent-counter-output,native-parent-counter-frame,native-parent-counter-timer-return,native-parent-counter-screen-return,native-parent-counter-parent-return,native-parent-counter-iat,native-parent-counter-initialized,native-parent-counter-origin-frequency,native-parent-counter-clock'){throw 'Wrong row identities'}
$pre=[BitConverter]::ToString($before.outputBytes);CounterPair $s;if(!$s.counter.complete -or $s.counter.open -or $s.counter.pairs -ne 1 -or $s.counter.captured -ne 2){throw 'Counter pair did not close'};World $s;$s.RequireComplete(21);if($s.pairs -ne 3 -or $s.captured -ne 6 -or $s.stage -ne 10 -or !$s.closed){throw 'Original parent/CRT checkpoints lost'};if($pre -ne '69-69-69-69-69-69-69-69'){throw 'Preimage was seeded from post output'}}
`);
});

test('pure counter scope and original inputs reject wrong threads, stages, initialized state, IAT, frequency/origin, caller, ESP/EIP/EBP and budget before admission', {skip:process.platform!=='win32'},()=>{
  pure(`${helpers}
$s=Parent 1048576;$reads.Clear();if($null -ne [RollcageCapture.NativeDebugger]::ReadParentWeatherCounter($s,$s.counter,$BASE,8,$true,$K,($BASE+0x89d11),($U-368),$TARGET,$read) -or $reads.Count -ne 0){throw 'Foreign-thread read'}
$s=Parent 1048576;$s.weatherPairs=1;$reads.Clear();if($null -ne (Observe $s $true) -or $reads.Count -ne 0){throw 'Before-weather2 read'}
$s=Parent 1048576;$s.stage=8;$reads.Clear();if($null -ne (Observe $s $true) -or $reads.Count -ne 0){throw 'Before-cameras read'}
$s=Parent 1048576;$s.callOpen=$true;$reads.Clear();if($null -ne (Observe $s $true) -or $reads.Count -ne 0){throw 'Counter interleaved open CRT call'}
$s=Parent 1048576;$s.captured=8;$reads.Clear();Reject {Observe $s $true};if($reads.Count -ne 0 -or $s.counter.open){throw 'Excess CRT pair consumed reserved world observation'}
foreach($field in @('eip','ebp','esi')){$s=Parent 1048576;$reads.Clear();$eip=$BASE+0x89d11;$ebp=$U-368;$esi=$TARGET;if($field -eq 'eip'){$eip++};if($field -eq 'ebp'){$ebp++};if($field -eq 'esi'){$esi++};Reject {[RollcageCapture.NativeDebugger]::ReadParentWeatherCounter($s,$s.counter,$BASE,7,$true,$K,$eip,$ebp,$esi,$read)};if($reads.Count -ne 0){throw 'Read after bad raw context guard'}}
$s=Parent 1048576;$reads.Clear();if($null -ne [RollcageCapture.NativeDebugger]::ReadParentWeatherCounter($s,$s.counter,$BASE,7,$true,($K+4),($BASE+0x89d11),($U-368),$TARGET,$read) -or $reads.Count -ne 0){throw 'Wrong ESP read'}
foreach($address in @(($BASE+0x2e6c8c),($BASE+0x3135a4),($BASE+0x16e0fc),($BASE+0x50a548))){$s=Parent 1048576;$cells[$address.ToString()][0]=$cells[$address.ToString()][0] -bxor 1;Reject {Observe $s $true};if($s.counter.open -or $s.counter.captured -ne 0){throw 'Changed original input consumed observation'}}
foreach($address in @($K,($B+8),$C,($U-44),($U-20))){$s=Parent 1048576;$stack[$address-$stackBase]=$stack[$address-$stackBase] -bxor 1;Reject {Observe $s $true}}
$s=Parent 1048576;$bad=Observe $s $true;$bad.outputBytes[0]=$bad.outputBytes[0] -bxor 1;Reject {Admit $s $true $bad};if($s.counter.open){throw 'Inconsistent overlapping data admitted'}
$s=Parent 1048576;Reject {$s.counter.LatchOriginal($s,$BASE,7,$read)};Reject {World $s}
Reject {Parent 1048576 0};Reject {Parent 1048576 2}
Reject {Parent 1048576 1 0};Reject {Parent 1048576 1 -1}
$s=Parent 1048576;$reads.Clear();Reject {[RollcageCapture.NativeDebugger]::ReadParentCounterBytes(0,4,$read)};Reject {[RollcageCapture.NativeDebugger]::ReadParentCounterBytes(4294967293,4,$read)};if($reads.Count -ne 0){throw 'Null/overflow read attempted'}
`);
});

test('pure paired counter rejects orphan/nested/repeated returns, post-call corruption and forged completion without changing native output', {skip:process.platform!=='win32'},()=>{
  pure(`${helpers}
$s=Parent 1048576;$reads.Clear();Reject {Observe $s $false};if($reads.Count -ne 0){throw 'Read orphan return'}
$s=Parent 1048576;$before=Observe $s $true;Admit $s $true $before;Reject {Observe $s $true};Reject {$s.counter.Commit($false)};$s.counter.Commit($true);Reject {World $s}
$stack[$B-$stackBase]=$stack[$B-$stackBase] -bxor 1;$after=Observe $s $false;Reject {Admit $s $false $after};if(!$s.counter.open -or $s.counter.complete -or $s.counter.captured -ne 1){throw 'Corrupt postframe closed call'}
$s=Parent 1048576;CounterPair $s;Reject {Observe $s $true};Reject {Observe $s $false};Reject {$s.counter.Commit($false)};Reject {$s.counter.RequireComplete(119)}
$s=Parent 1048576;$before=Observe $s $true;Reject {$s.counter.Validate($s,$true,$BASE,7,($BASE+0x89d11),($U-368),$TARGET,$K,$before,118,18,21)};if($s.counter.open){throw 'Wrong global snapshot ordinal admitted'}
[RollcageCapture.NativeDebugger]::ValidateParentCounterDeferredCode($true,255,$false,0,0,0,([byte[]]@(255,214)));[RollcageCapture.NativeDebugger]::ValidateParentCounterDeferredCode($false,139,$false,0,0,0,([byte[]]@(139,68,36,24)))
Reject {[RollcageCapture.NativeDebugger]::ValidateParentCounterDeferredCode($true,255,$true,0,0,0,([byte[]]@(255,214)))};Reject {[RollcageCapture.NativeDebugger]::ValidateParentCounterDeferredCode($true,255,$false,1,0,0,([byte[]]@(255,214)))};Reject {[RollcageCapture.NativeDebugger]::ValidateParentCounterDeferredCode($false,139,$false,0,0,0,([byte[]]@(139,68,36,20)))}
`);
});

test('typed counter policy validates exact optional 17-site profile and rejects policy, startup, dynamic-range and initial import corruption; defaults remain unchanged', {skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-parent-counter-policy-'));
  try {
    const configurations=[];
    for(const options of [{},{viewportMapGraph:true,weatherScreenQueries:true},{viewportMapGraph:true,weatherScreenQueries:true,weatherCounterObservation:true},{weatherScreenQueries:true,weatherCounterObservation:true}])configurations.push((await createNativeParentRttiCaptureConfig(root,path.join(dir,`not-launched-${configurations.length}`),options)).configuration);
    for(const mutate of [x=>x.parentRttiObservation.weatherScreenQueries=false,x=>x.parentRttiObservation.weatherCounterObservation.maxPairs=2,x=>x.parentRttiObservation.weatherCounterObservation.maxSnapshots=3,x=>x.parentRttiObservation.weatherCounterObservation.callBreakpointId='other',x=>x.breakpoints.pop(),x=>x.breakpoints[15].rva='0x89d10',x=>x.breakpoints[16].rva='0x89d14',x=>x.breakpoints[15].ranges=[{id:'invented',baseRegister:'esp',length:4}],x=>x.breakpoints[16].skipMatchingHits=0,x=>x.breakpoints[15].captureWhen={range:{id:'filter',baseRegister:'esp',length:4},equalsBytesHex:'00000000'},x=>x.maxSnapshots=23,x=>x.maxDurationMs=90001,x=>x.maxEvents++,x=>x.phaseActions.push({breakpointId:'native-parent-weather-counter-call',hit:1,writes:[]}),x=>x.breakpoints[3].ranges.find(r=>r.id==='parent-weather-counter-import').rva='0x16e114',x=>x.breakpoints[12].ranges=x.breakpoints[12].ranges.filter(r=>r.id!=='parent-weather-counter-import')]){const bad=structuredClone(configurations[2]);mutate(bad);configurations.push(bad);}
    const files=[];for(let i=0;i<configurations.length;i++){const f=path.join(dir,`config-${i}.json`);await writeFile(f,JSON.stringify(configurations[i]));files.push(f);}
    pure(`Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$files=@(${files.map(f=>`'${quote(f)}'`).join(',')})
for($i=0;$i -lt 4;$i++){$o=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);[RollcageCapture.NativeDebugger]::Validate($o);$caps=[RollcageCapture.NativeDebugger]::GetCaptureCapabilities($o);if($i -lt 2 -and $caps -contains 'scoped-parent-weather-counter-v4'){throw 'Counter capability leaked into default'};if($i -ge 2 -and $caps -notcontains 'scoped-parent-weather-counter-v4'){throw 'Missing counter capability'}}
for($i=4;$i -lt $files.Count;$i++){$o=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);try{Reject {[RollcageCapture.NativeDebugger]::Validate($o)}}catch{throw ('Counter policy mutation '+$i+': '+$_.Exception.Message)}}
$o=$reader.Deserialize([IO.File]::ReadAllText($files[2]),[RollcageCapture.Options]);$service=[RollcageCapture.Breakpoint].GetField('service',([Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::NonPublic));$service.SetValue($o.breakpoints[15],'QueryPerformanceCounter');Reject {[RollcageCapture.NativeDebugger]::Validate($o)}
`);
  } finally {await rm(dir,{recursive:true,force:true});}
  const cs=await readFile(source,'utf8');
  assert.ok(cs.indexOf('if(parentCounterAdmission!=null)snapshot["parentWeatherCounterObservation"]')<cs.indexOf('if(parentCounterAdmission!=null)parentRtti.counter.Commit('));
  const activate=cs.slice(cs.indexOf('static Dictionary<string,object> ActivateParentRtti('),cs.indexOf('static Dictionary<string,object> PrepareParentRttiMapGraph('));
  assert.ok(activate.includes('ids.Add(counter.callBreakpointId);ids.Add(counter.returnBreakpointId)'));
  assert.ok(activate.includes('ValidateParentCounterDeferredCode('));
  const counter=cs.slice(cs.indexOf('static Dictionary<string,object> AdmitParentWeatherCounter('),cs.indexOf('static void CaptureThreadDiagnostics('));
  assert.doesNotMatch(counter,/SetContext|Marshal\.Write|\bWrite\(child\.process|emulated\s*=/);
  assert.ok(counter.includes('parent.selected&&parent.windowOpen&&!parent.closed&&tid==parent.tid&&parent.stage==9&&parent.weatherPairs==2&&!parent.callOpen'));
});
