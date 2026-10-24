import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';

const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url)),root='analysis/native-physics-local/startup-20261022',quote=s=>s.replaceAll("'","''");
async function pure(text) {
  const script=`$ErrorActionPreference='Stop'\nAdd-Type -Path '${quote(source)}'\nfunction Reject($block){$bad=$false;try{&$block|Out-Null}catch{$bad=$true};if(!$bad){throw 'Expected strict rejection'}}\nfunction Store($b,$off,$value){[BitConverter]::GetBytes([uint32]$value).CopyTo($b,$off)}\n${text}\n'Pure parent RTTI checks PASS; no game or native fixture launched.'`;
  const r=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);
}
const stateHelpers=`
$B=[uint32]4194304;$U=[uint32]1048576;$Q=$U-276;$APP=[uint32]536870912;$HEAD=[uint32]805306368;$saved=[uint32[]]@(4112,8224,12336,16448)
function Stack($physical){$b=New-Object byte[] $(if($physical){28}else{24});$shift=0;if($physical){Store $b 0 4526103;$shift=4};for($j=0;$j -lt 4;$j++){Store $b ($shift+$j*4) $saved[$j]};Store $b ($shift+16) 5242896;Store $b ($shift+20) 21;return ,$b}
function NewAux {
 $s=New-Object RollcageCapture.ParentRttiProgress
 for($i=0;$i -lt 8;$i++){$id=[RollcageCapture.ParentRttiProgress]::Stages[$i];if($i -eq 0){$st=New-Object byte[] 8;Store $st 0 5242896;Store $st 4 21;$esp=$U}else{$physical=$i -eq 2 -or $i -eq 3;$st=Stack $physical;$esp=$U-$(if($physical){20}else{16})};$s.ObserveStage($id,$B,7,7,$esp,348,17,$st,$saved,(100+$i));if($i -eq 0){$s.ObserveMap($id,$APP,$HEAD)}}
 return $s
}
function Ready {$s=NewAux;$s.MarkAuxiliaryCaptured(11);$s.Activate(107,7);$s.MarkAuxiliaryPublished();return $s}
function Frame {$f=New-Object byte[] 52;Store $f 0 $APP;Store $f 8 7217468;Store $f 12 7217316;Store $f 40 4301000;Store $f 44 1;Store $f 48 ($U-60);return ,$f}
function Camera {$c=New-Object byte[] 4;Store $c 0 4526343;return ,$c}
function Pair($s,$ordinal){$f=Frame;$c=Camera;$s.ValidateEndpoint($true,$B,7,$Q,348,$APP,$f,$c,$ordinal);$s.CommitEndpoint($true);$f[28]=123;$s.ValidateEndpoint($false,$B,7,$Q,348,$APP,$f,$c,($ordinal+1));$s.CommitEndpoint($false)}
function Close($s,$ordinal){$st=Stack $false;$s.ObserveStage('native-control-after-cameras',$B,7,7,($U-16),348,17,$st,$saved,$ordinal);$s.ObserveMap('native-control-after-cameras',$APP,$HEAD);$s.ObserveStage('native-control-after-world-effects',$B,7,7,($U-16),348,17,$st,$saved,($ordinal+1));$s.ObserveMap('native-control-after-world-effects',$APP,$HEAD)}
`;

test('full typed parent RTTI policy accepts frozen JS contract and rejects moved/widened/write/security/worker/held mutations', {skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-parent-rtti-policy-'));
  try {
    const o=(await createNativeParentRttiCaptureConfig(root,path.join(dir,'never-launched'))).configuration,configs=[o];
    for(const mutate of [x=>x.maxSnapshots=22,x=>x.maxEvents++,x=>x.maxDurationMs++,x=>x.captureThreadEnvironment=false,x=>x.denyRegistryWrites=false,x=>x.showWindow=true,x=>x.arguments.push('/level'),x=>x.ranges.push({id:'unrelated',rva:'0x0',length:4}),x=>x.parentRttiObservation.maxPairs=5,x=>x.parentRttiObservation.maxSnapshots=10,x=>x.parentRttiObservation.beginBreakpointId='native-control-after-drive',x=>x.parentRttiObservation.singletonMapPreflight.rootRva='0x2efb3c',x=>x.parentRttiObservation.singletonMapPreflight.maxRegionBytes++,x=>x.parentRttiObservation.singletonMapPreflight.breakpointIds.pop(),x=>x.breakpoints[0].ranges[0].rva='0x2e66f0',x=>x.phaseActions[0].writes[0].expectedAnyBytesHex.push('02000000'),x=>x.phaseActions.push({breakpointId:'native-parent-rtti-call',hit:1,writes:[]}),x=>x.breakpoints.at(-1).rva='0x2d8c',x=>x.breakpoints.at(-1).ranges[1].offset=252,x=>x.breakpoints.at(-1).skipMatchingHits=1,x=>x.breakpoints.at(-1).stopAfterHits=1,x=>x.breakpoints[3].captureWhen.equalsBytesHex='03000000',x=>x.breakpoints[11].skipMatchingHits++,x=>x.breakpoints[12].stopAfterHits=0,x=>x.breakpoints[3].ranges.find(r=>r.id==='late-singleton-candidate-viewport-map-head').dereferenceMinimumValues=[1,257],x=>x.breakpoints[3].ranges.find(r=>r.id==='late-singleton-candidate-viewport-map-region').dereferenceMinimumValues=[1,1],x=>x.heldForceInput={breakpointId:'native-frame-before',maxHoldMs:20000},x=>x.ownedWorkerGainWindow={}]){const bad=structuredClone(o);mutate(bad);configs.push(bad);}
    const files=[];for(let i=0;i<configs.length;i++){const file=path.join(dir,`config-${i}.json`);await writeFile(file,JSON.stringify(configs[i]));files.push(file);}
    await pure(`Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$files=@(${files.map(f=>`'${quote(f)}'`).join(',')})
$o=$reader.Deserialize([IO.File]::ReadAllText($files[0]),[RollcageCapture.Options]);[RollcageCapture.NativeDebugger]::Validate($o)
for($i=1;$i -lt $files.Count;$i++){$bad=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);Reject {[RollcageCapture.NativeDebugger]::Validate($bad)}}
if([RollcageCapture.NativeDebugger]::GetCapabilities() -notcontains 'scoped-parent-rtti-and-singleton-map-preflight-v1'){throw 'Missing runtime capability'}`);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('pure lifecycle preserves all parent checkpoints, requires captured-before-activation-before-publication and closes ordered max4 pairs', {skip:process.platform!=='win32'},async()=>{
  await pure(`${stateHelpers}
$s=NewAux;Reject {$s.Activate(107,7)};$s.MarkAuxiliaryCaptured(11);Reject {$s.MarkAuxiliaryPublished()};$s.Activate(107,7)
if(!$s.windowOpen -or $s.auxiliaryPublished){throw 'Capture and publication were collapsed'}
$s.MarkAuxiliaryPublished();Reject {$s.Activate(107,7)}
Pair $s 108;Close $s 110;$s.RequireComplete(15)
if($s.CanRead(7,$Q) -or $s.pairs -ne 1 -or $s.captured -ne 2 -or $s.stage -ne 10 -or $s.mapChecks -ne 3){throw 'Wrong closed totals'}
Reject {$s.RequireComplete(14)}
$s=Ready;for($i=0;$i -lt 4;$i++){Pair $s (108+$i*2)};if($s.captured -ne 8){throw 'Did not retain8 actual endpoints'};Reject {$s.ValidateEndpoint($true,$B,7,$Q,348,$APP,(Frame),(Camera),116)};Close $s 117;$s.RequireComplete(21)
$s=Ready;$s.ValidateEndpoint($true,$B,7,$Q,348,$APP,(Frame),(Camera),108);$s.CommitEndpoint($true);Reject {Close $s 110}
$s=Ready;Reject {$s.ValidateEndpoint($false,$B,7,$Q,348,$APP,(Frame),(Camera),108)}
foreach($off in @(0,4,8,12,16,40,44,48)){$s=Ready;$bad=Frame;$bad[$off]=$bad[$off] -bxor 1;Reject {$s.ValidateEndpoint($true,$B,7,$Q,348,$APP,$bad,(Camera),108)}}
$s=Ready;Reject {$s.ValidateEndpoint($true,$B,7,($Q-4),348,$APP,(Frame),(Camera),108)};Reject {$s.ValidateEndpoint($true,$B,8,$Q,348,$APP,(Frame),(Camera),108)};Reject {$s.ValidateEndpoint($true,$B,7,$Q,349,$APP,(Frame),(Camera),108)}
$s=Ready;Pair $s 108;$st=Stack $false;Store $st 4 99;Reject {$s.ObserveStage('native-control-after-cameras',$B,7,7,($U-16),348,17,$st,$saved,110)}
$s=Ready;Pair $s 108;$st=Stack $false;$s.ObserveStage('native-control-after-cameras',$B,7,7,($U-16),348,17,$st,$saved,110);Reject {$s.ObserveMap('native-control-after-cameras',($APP+4),$HEAD)}
$s=New-Object RollcageCapture.ParentRttiProgress;$st=New-Object byte[] 8;Reject {$s.ObserveStage('native-control-before',$B,7,8,$U,348,17,$st,$saved,100)};if($s.selected){throw 'Foreign TID was latched'}
`);
});

test('pure pointer/endpoint readers do not chase null/sentinel/unowned/outside pointers and preserve actual scope before range resolution', {skip:process.platform!=='win32'},async()=>{
  await pure(`${stateHelpers}
$global:reads=0;$r=[Func[uint32,int,byte[]]]{param($a,$n)$global:reads++;$b=New-Object byte[] $n;if($a -eq 7273272){Store $b 0 $APP}else{if($a -ne ($APP+124)){throw 'Unexpected pointer chase'};Store $b 0 $HEAD};return ,$b}
$map=[RollcageCapture.NativeDebugger]::ReadParentRttiMapSource($B,7,7,$r);if($global:reads -ne 2 -or $map.appAddress -ne $APP -or $map.headAddress -ne $HEAD){throw 'Wrong actual two-step pointer read'}
$global:reads=0;Reject {[RollcageCapture.NativeDebugger]::ReadParentRttiMapSource($B,7,8,$r)};if($global:reads -ne 0){throw 'Read foreign source'}
$global:reads=0;$nullApp=[Func[uint32,int,byte[]]]{param($a,$n)$global:reads++;return ,(New-Object byte[] 4)};Reject {[RollcageCapture.NativeDebugger]::ReadParentRttiMapSource($B,7,7,$nullApp)};if($global:reads -ne 1){throw 'Chased null APP'}
$global:reads=0;$nullHead=[Func[uint32,int,byte[]]]{param($a,$n)$global:reads++;$b=New-Object byte[] 4;if($global:reads -eq 1){Store $b 0 $APP};return ,$b};Reject {[RollcageCapture.NativeDebugger]::ReadParentRttiMapSource($B,7,7,$nullHead)};if($global:reads -ne 2){throw 'Bad null-head read count'}
$global:reads=0;$nonnull=[Func[uint32,int,byte[]]]{param($a,$n)$global:reads++;if($global:reads -eq 2){throw 'Genuine unreadable nonnull16'};$b=New-Object byte[] 4;Store $b 0 16;return ,$b};Reject {[RollcageCapture.NativeDebugger]::ReadParentRttiMapSource($B,7,7,$nonnull)};if($global:reads -ne 2){throw 'Misclassified nonnull16 as null'}
$s=Ready;$global:reads=0;$forbidden=[Func[uint32,int,byte[]]]{param($a,$n)$global:reads++;throw 'Must not read outside scope'}
if($null -ne [RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,8,$Q,$forbidden) -or $null -ne [RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,7,($Q-4),$forbidden) -or $global:reads -ne 0){throw 'Out-of-scope read consumed an observation'}
$global:reads=0;$endpoint=[Func[uint32,int,byte[]]]{param($a,$n)$global:reads++;if($a -eq $Q){return ,(Frame)};if($a -eq ($Q+256)){return ,(Camera)};$b=New-Object byte[] 4;Store $b 0 $(if($a -eq 9479496){348}else{$APP});return ,$b}
$actual=[RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,7,$Q,$endpoint);if(!$actual.commonCaller -or $global:reads -ne 4 -or $s.captured -ne 0){throw 'Scoped read/counter differed'}
Close $s 108;$global:reads=0;if($null -ne [RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,7,$Q,$forbidden) -or $global:reads -ne 0){throw 'Closed window read'}
`);
});

test('pure deferred opcode/counter guards and source ordering keep new policy gated and observation publication honest', {skip:process.platform!=='win32'},async()=>{
  await pure(`
$call=[byte[]]@(232,159,101,22,0);$ret=[byte[]]@(131,196,20)
[RollcageCapture.NativeDebugger]::ValidateParentRttiDeferredCode($true,232,$false,0,0,0,$call)
[RollcageCapture.NativeDebugger]::ValidateParentRttiDeferredCode($false,131,$false,0,0,0,$ret)
Reject {[RollcageCapture.NativeDebugger]::ValidateParentRttiDeferredCode($true,232,$true,0,0,0,$call)}
Reject {[RollcageCapture.NativeDebugger]::ValidateParentRttiDeferredCode($true,232,$false,1,0,0,$call)}
Reject {[RollcageCapture.NativeDebugger]::ValidateParentRttiDeferredCode($true,232,$false,0,1,0,$call)}
Reject {[RollcageCapture.NativeDebugger]::ValidateParentRttiDeferredCode($true,232,$false,0,0,1,$call)}
$call[1]=0;Reject {[RollcageCapture.NativeDebugger]::ValidateParentRttiDeferredCode($true,232,$false,0,0,0,$call)}
`);
  const cs=await readFile(source,'utf8'),main=cs.slice(cs.indexOf('bool capture = hit.service == null;'),cs.indexOf('ObservationActivation activation = o.observationActivation;',cs.indexOf('bool capture = hit.service == null;')));
  assert.ok(main.indexOf('different-owned-thread')<main.indexOf('CapturePredicateMatches(actual'));
  assert.ok(main.indexOf('PrepareParentRttiCheckpoint(')<main.indexOf('foreach (MemoryRange range in selected)'));
  assert.ok(main.indexOf('ActivateParentRtti(')>main.indexOf('string contextFile ='));
  assert.ok(main.indexOf('ActivateParentRtti(')<main.indexOf('emit(snapshot)'));
  assert.ok(main.indexOf('parentRtti.CommitEndpoint(')>main.indexOf('emit(snapshot)'));
});
