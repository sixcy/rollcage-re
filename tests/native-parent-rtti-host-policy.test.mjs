import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiEvidence} from '../tools/lib/native-parent-rtti.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

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
function Frame {$f=New-Object byte[] 52;Store $f 0 $APP;Store $f 8 7217468;Store $f 12 7217316;Store $f 40 4301000;Store $f 44 ($U-60);Store $f 48 1;return ,$f}
function Camera {$c=New-Object byte[] 4;Store $c 0 4526343;return ,$c}
function Pair($s,$ordinal){$f=Frame;$c=Camera;$s.ValidateEndpoint($true,$B,7,$Q,348,$APP,$f,$c,$ordinal);$s.CommitEndpoint($true);$f[28]=123;$s.ValidateEndpoint($false,$B,7,$Q,348,$APP,$f,$c,($ordinal+1));$s.CommitEndpoint($false)}
function Close($s,$ordinal){$st=Stack $false;$s.ObserveStage('native-control-after-cameras',$B,7,7,($U-16),348,17,$st,$saved,$ordinal);$s.ObserveMap('native-control-after-cameras',$APP,$HEAD);$s.ObserveStage('native-control-after-world-effects',$B,7,7,($U-16),348,17,$st,$saved,($ordinal+1));$s.ObserveMap('native-control-after-world-effects',$APP,$HEAD)}
`;
const graphHelpers=`
$APP=[uint32]536870912;$HEAD=[uint32]805306368;$ROOT=[uint32]822083584;$LEFT=[uint32]838860800;$RIGHT=[uint32]855638016;$KEY=[uint32]872415232
function GraphPolicy {$p=New-Object RollcageCapture.ParentRttiViewportMapGraph;$p.maxNodes=8;$p.maxKeyBytes=256;$p.breakpointIds=@('native-control-before','native-control-after-cameras','native-control-after-world-effects');return $p}
function Node($left,$parent,$right,$text,$heap){$b=New-Object byte[] 100;Store $b 0 $left;Store $b 4 $parent;Store $b 8 $right;$b[12]=1;$t=[Text.Encoding]::ASCII.GetBytes($text);Store $b 32 $t.Length;Store $b 36 $(if($heap){31}else{15});if($heap){Store $b 16 $KEY}else{$t.CopyTo($b,16)};return ,$b}
function NewTree {
 $global:graphMemory=@{};$global:graphReads=New-Object 'Collections.Generic.List[string]'
 $h=New-Object byte[] 8;Store $h 0 $HEAD;Store $h 4 3;$global:graphMemory[($APP+124).ToString()]=$h
 $headBytes=New-Object byte[] 16;Store $headBytes 0 $LEFT;Store $headBytes 4 $ROOT;Store $headBytes 8 $RIGHT;$headBytes[12]=1;$headBytes[13]=1;$global:graphMemory[$HEAD.ToString()]=$headBytes
 $global:graphMemory[$ROOT.ToString()]=(Node $LEFT $HEAD $RIGHT 'Beta' $false);$global:graphMemory[$LEFT.ToString()]=(Node $HEAD $ROOT $HEAD 'Alpha' $false);$global:graphMemory[$RIGHT.ToString()]=(Node $HEAD $ROOT $HEAD 'Very-long-viewport-key' $true)
 $global:graphMemory[$KEY.ToString()]=[Text.Encoding]::ASCII.GetBytes("Very-long-viewport-key"+[char]0)
}
$reader=[Func[uint32,int,byte[]]]{param($a,$n)$global:graphReads.Add($a.ToString()+':'+$n);$b=$global:graphMemory[$a.ToString()];if($null -eq $b -or $b.Length -ne $n){throw 'Genuine missing/incorrect extent'};return ,([byte[]]$b.Clone())}
function ReadGraph {return [RollcageCapture.NativeDebugger]::ReadParentRttiViewportMapGraph((GraphPolicy),$APP,$HEAD,$reader)}
`;
const weatherHelpers=`${stateHelpers}
$W=$U-460
function ReadyMixed {$s=NewAux;$s.weatherScreenQueries=$true;$s.MarkAuxiliaryCaptured(11);$s.Activate(107,7);$s.MarkAuxiliaryPublished();return $s}
function AfterCameras {$s=ReadyMixed;Pair $s 108;$st=Stack $false;$s.ObserveStage('native-control-after-cameras',$B,7,7,($U-16),348,17,$st,$saved,110);$s.ObserveMap('native-control-after-cameras',$APP,$HEAD);if(!$s.windowOpen -or $s.closed){throw 'Mixed window closed at cameras'};return $s}
function Word($value){$b=New-Object byte[] 4;Store $b 0 $value;return ,$b}
function Weather($index){
 $p=New-Object RollcageCapture.ParentRttiEndpointRead;$p.weather=$true;$p.weatherQueryIndex=$index;$p.commonCaller=$true;$p.clockBytes=Word 348;$p.singletonBytes=Word $APP
 $f=New-Object byte[] 68;Store $f 0 $APP;Store $f 8 ($B+0x2e213c);Store $f 12 ($B+0x2e20a4);Store $f 40 ($B+0xabf3);Store $f 44 ($U-319);Store $f 48 ($U-320);Store $f 52 ($U-$(if($index -eq 2){344}else{336}));Store $f 56 ($U-$(if($index -eq 2){336}else{332}));Store $f 60 ($U-$(if($index -eq 2){332}else{340}));Store $f 64 ($U-328);$p.context=$f
 $p.queryReturn=Word ($B+$(if($index -eq 2){0x980f5}else{0x98092}));$p.screenReturn=Word ($B+0x96822);$p.parentReturn=Word ($B+0x51116);$p.name=[Text.Encoding]::ASCII.GetBytes('0 Player'+[char]0);return $p
}
function WeatherPair($s,$index,$ordinal){$p=Weather $index;$s.ValidateWeatherEndpoint($true,$B,7,$W,$p,$ordinal);$s.CommitEndpoint($true);$p.context[28]=123;$s.ValidateWeatherEndpoint($false,$B,7,$W,$p,($ordinal+1));$s.CommitEndpoint($false)}
function World($s,$ordinal){$st=Stack $false;$s.ObserveStage('native-control-after-world-effects',$B,7,7,($U-16),348,17,$st,$saved,$ordinal);$s.ObserveMap('native-control-after-world-effects',$APP,$HEAD)}
`;

test('retained weather callers support two distinct native query chains; pure mixed lifecycle preserves cameras and requires both ordered actual pairs', {skip:process.platform!=='win32'},async()=>{
  const evidence=await readInstructionEvidence(['310-race-step-parent-assembly.json','3601-object-effect-496700-procedure_assembly.json','3611-object-effect-498030-procedure_assembly.json','3626-weather-40ab70-procedure_assembly.json'],{directory:'analysis/native-simulation/results'}),rows=new Map(evidence.instructions.map(row=>[row.address,row]));
  for(const [address,target]of [[0x451111,0x496700],[0x49681d,0x498030],[0x49808d,0x40ab70],[0x4980f0,0x40ab70],[0x40abee,0x402d10]])assert.deepEqual(rows.get(address),{address,op:'CALL',args:[`0x${target.toString(16).padStart(8,'0')}`]});
  assert.ok(evidence.evidence.every(row=>row.subject.digest.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
  await pure(`${weatherHelpers}
$s=AfterCameras;if(!$s.CanRead(7,$W) -or $s.CanRead(7,$Q)){throw 'Wrong mixed family checkpoint scope'}
WeatherPair $s 1 112;WeatherPair $s 2 114;World $s 116;$s.RequireComplete(19)
if($s.weatherPairs -ne 2 -or $s.pairs -ne 3 -or $s.captured -ne 6 -or !$s.closed -or $s.windowOpen){throw 'Actual mixed pair/checkpoint totals differ'}
$s=AfterCameras;Reject {World $s 116};if($s.closed){throw 'Missing both weather calls falsely closed'}
$s=AfterCameras;WeatherPair $s 1 112;Reject {World $s 116};if($s.closed -or $s.weatherPairs -ne 1){throw 'Missing second weather call falsely closed'}
$s=AfterCameras;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,(Weather 2),112)};if($s.callOpen -or $s.captured -ne 2){throw 'Reversed weather order consumed a snapshot'}
$s=AfterCameras;WeatherPair $s 1 112;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,(Weather 1),114)}
$s=AfterCameras;$s.ValidateWeatherEndpoint($true,$B,7,$W,(Weather 1),112);$s.CommitEndpoint($true);Reject {$s.ValidateWeatherEndpoint($false,$B,7,$W,(Weather 2),113)};if(!$s.callOpen -or $s.weatherPairs -ne 0 -or $s.captured -ne 3){throw 'Other query return consumed open first query'}
$s=ReadyMixed;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,(Weather 1),108)}
$s=AfterCameras;WeatherPair $s 1 112;WeatherPair $s 2 114;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,(Weather 2),116)}
`);
});

test('pure weather reader preserves exact context/name/return spans and rejects changed callers, output pointers, name, scope and fabricated MODE', {skip:process.platform!=='win32'},async()=>{
  await pure(`${weatherHelpers}
$s=AfterCameras;$p=Weather 1
foreach($offset in @(0,4,8,12,16,40,44,48,52,56,60,64)){$bad=Weather 1;$bad.context[$offset]=$bad.context[$offset] -bxor 1;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,$bad,112)}}
foreach($field in @('queryReturn','screenReturn','parentReturn','name','clockBytes','singletonBytes')){$bad=Weather 1;$bad.$field[0]=$bad.$field[0] -bxor 1;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,$bad,112)}}
$bad=Weather 1;Store $bad.context 44 1;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,$bad,112)}
$bad=Weather 1;$bad.name[2]=112;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,$bad,112)};$bad=Weather 1;$bad.name[8]=1;Reject {$s.ValidateWeatherEndpoint($true,$B,7,$W,$bad,112)}
Reject {$s.ValidateWeatherEndpoint($true,$B,8,$W,(Weather 1),112)};Reject {$s.ValidateWeatherEndpoint($true,$B,7,($W-4),(Weather 1),112)}
if($s.callOpen -or $s.captured -ne 2 -or $s.weatherPairs -ne 0){throw 'Malformed weather admission changed counters'}
$global:weatherReadCount=0;$global:weatherMemory=@{};$global:weatherMemory[$W.ToString()]=$p.context;$global:weatherMemory[($W+84).ToString()]=$p.queryReturn;$global:weatherMemory[($W+416).ToString()]=$p.screenReturn;$global:weatherMemory[($W+440).ToString()]=$p.parentReturn;$global:weatherMemory[($W+140).ToString()]=$p.name;$global:weatherMemory[($B+0x50a548).ToString()]=$p.clockBytes;$global:weatherMemory[($B+0x2efb38).ToString()]=$p.singletonBytes
$read=[Func[uint32,int,byte[]]]{param($a,$n)$global:weatherReadCount++;$b=$global:weatherMemory[$a.ToString()];if($null -eq $b -or $b.Length -ne $n){throw 'Unobserved weather extent'};return ,([byte[]]$b.Clone())}
$actual=[RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,7,$W,$read)
if(!$actual.commonCaller -or !$actual.weather -or $actual.weatherQueryIndex -ne 1 -or $actual.context.Length -ne 68 -or $actual.ranges.Count -ne 6 -or $global:weatherReadCount -ne 7){throw 'Wrong actual weather extents'}
if(($actual.ranges | ForEach-Object {$_.id}) -join ',' -ne 'native-parent-rtti-context,native-parent-rtti-clock,native-parent-rtti-weather-query-return,native-parent-rtti-weather-screen-return,native-parent-rtti-weather-parent-return,native-parent-rtti-weather-name'){throw 'Wrong weather range identities'}
$s.ValidateWeatherEndpoint($true,$B,7,$W,$actual,112)
$global:weatherReadCount=0;if($null -ne [RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,8,$W,$read) -or $global:weatherReadCount -ne 0){throw 'Foreign weather range chase'}
$global:weatherMemory[$W.ToString()]=New-Object byte[] 52;Reject {[RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,7,$W,$read)}
`);
});

test('full typed mixed profile admits only dynamic family rows and exact world closure while V1/V2 defaults and startup limits stay unchanged', {skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-parent-rtti-weather-policy-'));
  try {
    const original=(await createNativeParentRttiCaptureConfig(root,path.join(dir,'camera-only'))).configuration;
    const mixed=(await createNativeParentRttiCaptureConfig(root,path.join(dir,'mixed'),{weatherScreenQueries:true,viewportMapGraph:true})).configuration;
    const noGraph=(await createNativeParentRttiCaptureConfig(root,path.join(dir,'mixed-no-graph'),{weatherScreenQueries:true})).configuration;
    assert.deepEqual(mixed.breakpoints.slice(0,13),original.breakpoints.slice(0,13));assert.deepEqual(mixed.phaseActions,original.phaseActions);
    assert.deepEqual(mixed.breakpoints.slice(13).map(row=>row.ranges),[[],[]]);assert.equal(mixed.parentRttiObservation.endBreakpointId,'native-control-after-world-effects');
    const configs=[original,mixed,noGraph];for(const mutate of [x=>x.parentRttiObservation.weatherScreenQueries=false,x=>x.parentRttiObservation.endBreakpointId='native-control-after-cameras',x=>x.breakpoints[13].ranges=structuredClone(original.breakpoints[13].ranges),x=>x.breakpoints[14].ranges=[{id:'fake-mode',baseRegister:'esp',length:68}],x=>x.maxSnapshots=22,x=>x.parentRttiObservation.maxPairs=5,x=>x.breakpoints[12].stopAfterHits=0,x=>x.phaseActions[0].writes[0].bytesHex='00000000']){const bad=structuredClone(mixed);mutate(bad);configs.push(bad);}
    const files=[];for(let i=0;i<configs.length;i++){const file=path.join(dir,`config-${i}.json`);await writeFile(file,JSON.stringify(configs[i]));files.push(file);}
    await pure(`Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$files=@(${files.map(f=>`'${quote(f)}'`).join(',')})
for($i=0;$i -lt 3;$i++){$o=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);[RollcageCapture.NativeDebugger]::Validate($o);$caps=[RollcageCapture.NativeDebugger]::GetCaptureCapabilities($o);if($i -eq 0 -and $caps -contains 'scoped-parent-camera-weather-rtti-v3'){throw 'Default profile declares weather'};if($i -gt 0 -and $caps -notcontains 'scoped-parent-camera-weather-rtti-v3'){throw 'Missing explicit mixed capability'}}
for($i=3;$i -lt $files.Count;$i++){$bad=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);Reject {[RollcageCapture.NativeDebugger]::Validate($bad)}}
`);
  } finally {await rm(dir,{recursive:true,force:true});}
  const cs=await readFile(source,'utf8');
  assert.ok(cs.includes('state.weatherScreenQueries&&state.windowOpen&&tid==state.tid&&(observed==null||!observed.commonCaller)'));
  assert.ok(cs.includes('new ParentRttiProgress {weatherScreenQueries=o.parentRttiObservation!=null&&o.parentRttiObservation.weatherScreenQueries}'));
  assert.ok(cs.includes('foreach(ParentRttiObservedRange part in parentRttiEndpoint.ranges)'));
});

test('pure opt-in viewport graph observes full BFS nodes and exact heap key; empty graph has no node or zero-byte reads', {skip:process.platform!=='win32'},async()=>{
  await pure(`${graphHelpers}
NewTree;$graph=ReadGraph
if($graph.count -ne 3 -or $graph.rootAddress -ne $ROOT -or $graph.nodes.Count -ne 3 -or $graph.ranges.Count -ne 6){throw 'Incomplete graph'}
if(($graph.nodes | ForEach-Object {$_['path']}) -join ',' -ne 'root,root.left,root.right'){throw 'Not deterministic BFS'}
if($graph.nodes[0]['keyRangeId'] -ne $null -or $graph.nodes[1]['heapKey'] -ne $false -or $graph.nodes[2]['keyRangeId'] -ne 'parent-rtti-map-key-2'){throw 'Inline/heap identity guessed'}
if(($graph.ranges | ForEach-Object {$_.id}) -join ',' -ne 'parent-rtti-map-graph-header,parent-rtti-map-graph-head,parent-rtti-map-node-0,parent-rtti-map-node-1,parent-rtti-map-node-2,parent-rtti-map-key-2'){throw 'Range identity/order differs'}
if($global:graphReads.Count -ne 6 -or $graph.ranges[5].data.Length -ne 23 -or $graph.ranges[5].address -ne $KEY){throw 'Heap key extent is not actual length+1'}
NewTree;Store $global:graphMemory[($APP+124).ToString()] 4 0;foreach($off in @(0,4,8)){Store $global:graphMemory[$HEAD.ToString()] $off $HEAD};$graph=ReadGraph
if($graph.count -ne 0 -or $graph.nodes.Count -ne 0 -or $graph.ranges.Count -ne 2 -or $global:graphReads.Count -ne 2){throw 'Empty graph dereferenced/invented nodes'}
NewTree;$b=$global:graphMemory[$RIGHT.ToString()];Store $b 32 255;Store $b 36 255;$global:graphMemory[$KEY.ToString()]=New-Object byte[] 256;$graph=ReadGraph;if($graph.ranges[5].data.Length -ne 256){throw 'Valid exact maximum key extent rejected'}
`);
});

test('pure viewport graph rejects missing, cyclic, mismatched, malformed and overflowing actual storage without invented bytes', {skip:process.platform!=='win32'},async()=>{
  await pure(`${graphHelpers}
NewTree;Store $global:graphMemory[($APP+124).ToString()] 4 9;Reject {ReadGraph};if($global:graphReads.Count -ne 1){throw 'Chased over-bound count'}
NewTree;Store $global:graphMemory[($APP+124).ToString()] 0 ($HEAD+4);Reject {ReadGraph};if($global:graphReads.Count -ne 1){throw 'Chased changed preflight head'}
NewTree;$global:graphMemory[$HEAD.ToString()][13]=0;Reject {ReadGraph}
NewTree;$global:graphMemory[$ROOT.ToString()][13]=1;Reject {ReadGraph}
NewTree;$global:graphMemory[$ROOT.ToString()][12]=2;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$LEFT.ToString()] 4 $HEAD;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$ROOT.ToString()] 0 $ROOT;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$ROOT.ToString()] 8 $LEFT;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$ROOT.ToString()] 0 0;Reject {ReadGraph}
NewTree;$global:graphMemory.Remove($LEFT.ToString());Reject {ReadGraph}
NewTree;Store $global:graphMemory[($APP+124).ToString()] 4 4;Reject {ReadGraph}
NewTree;Store $global:graphMemory[($APP+124).ToString()] 4 2;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$HEAD.ToString()] 0 $RIGHT;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$HEAD.ToString()] 8 $LEFT;Reject {ReadGraph}
NewTree;$global:graphMemory[$LEFT.ToString()][21]=1;Reject {ReadGraph}
NewTree;$global:graphMemory[$KEY.ToString()][22]=1;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$RIGHT.ToString()] 32 256;Store $global:graphMemory[$RIGHT.ToString()] 36 256;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$LEFT.ToString()] 32 16;Store $global:graphMemory[$LEFT.ToString()] 36 15;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$RIGHT.ToString()] 32 32;Reject {ReadGraph}
NewTree;Store $global:graphMemory[$RIGHT.ToString()] 16 0;Reject {ReadGraph};if($global:graphReads -contains '0:23'){throw 'Dereferenced null heap key'}
NewTree;Store $global:graphMemory[$RIGHT.ToString()] 16 16;Reject {ReadGraph};if($global:graphReads -notcontains '16:23'){throw 'Misclassified unreadable nonnull16 as null'}
NewTree;Store $global:graphMemory[$RIGHT.ToString()] 16 4294967280;Reject {ReadGraph};if($global:graphReads -contains '4294967280:23'){throw 'Read overflowing heap key'}
NewTree;Store $global:graphMemory[$ROOT.ToString()] 0 4294967240;Reject {ReadGraph};if($global:graphReads -contains '4294967240:100'){throw 'Read overflowing node'}
NewTree;Reject {[RollcageCapture.NativeDebugger]::ReadParentRttiViewportMapGraph((GraphPolicy),4294967200,$HEAD,$reader)};if($global:graphReads.Count -ne 0){throw 'Read overflowing APP header'}
NewTree;$global:graphMemory[$LEFT.ToString()]=New-Object byte[] 99;Reject {ReadGraph}
`);
});

test('full typed graph policy is opt-in, exactly bounded, and preserves the V1 capture capability and all original snapshot/site/startup limits', {skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-parent-rtti-graph-policy-'));
  try {
    const old=(await createNativeParentRttiCaptureConfig(root,path.join(dir,'v1-never-launched'))).configuration;
    const graph=(await createNativeParentRttiCaptureConfig(root,path.join(dir,'v2-never-launched'),{viewportMapGraph:true})).configuration;
    assert.deepEqual(graph.breakpoints,old.breakpoints);assert.deepEqual(graph.phaseActions,old.phaseActions);
    assert.equal(graph.maxSnapshots,21);assert.equal(graph.maxDurationMs,90000);assert.equal(graph.maxEvents,1000000);
    const configs=[old,graph];for(const mutate of [x=>x.maxNodes=9,x=>x.maxNodes=7,x=>x.maxKeyBytes=257,x=>x.maxKeyBytes=255,x=>x.breakpointIds.reverse(),x=>x.breakpointIds.pop(),x=>x.breakpointIds.push('native-control-after-ai'),x=>x.breakpointIds[1]=x.breakpointIds[0]]){const bad=structuredClone(graph);mutate(bad.parentRttiObservation.viewportMapGraph);configs.push(bad);}
    const files=[];for(let i=0;i<configs.length;i++){const file=path.join(dir,`config-${i}.json`);await writeFile(file,JSON.stringify(configs[i]));files.push(file);}
    await pure(`Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$files=@(${files.map(f=>`'${quote(f)}'`).join(',')})
$v1=$reader.Deserialize([IO.File]::ReadAllText($files[0]),[RollcageCapture.Options]);[RollcageCapture.NativeDebugger]::Validate($v1)
$v2=$reader.Deserialize([IO.File]::ReadAllText($files[1]),[RollcageCapture.Options]);[RollcageCapture.NativeDebugger]::Validate($v2)
if(([RollcageCapture.NativeDebugger]::GetCaptureCapabilities($v1) -join ',') -ne 'scoped-parent-rtti-and-singleton-map-preflight-v1'){throw 'Opt-out V1 header changed'}
if(([RollcageCapture.NativeDebugger]::GetCaptureCapabilities($v2) -join ',') -ne 'scoped-parent-rtti-and-singleton-map-preflight-v1,scoped-parent-rtti-viewport-map-graph-v2'){throw 'Opt-in V2 header capability absent'}
if([RollcageCapture.NativeDebugger]::GetCapabilities() -notcontains 'scoped-parent-rtti-viewport-map-graph-v2'){throw 'Implemented graph capability undeclared'}
for($i=2;$i -lt $files.Count;$i++){$bad=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);Reject {[RollcageCapture.NativeDebugger]::Validate($bad)}}
`);
  } finally {await rm(dir,{recursive:true,force:true});}
  const cs=await readFile(source,'utf8'),start=cs.indexOf('if(capture&&o.parentRttiObservation!=null&&hit.id.StartsWith("native-control-",StringComparison.Ordinal))parentRttiMap='),main=cs.slice(start,cs.indexOf('ObservationActivation activation =',start));
  assert.ok(main.indexOf('PrepareParentRttiCheckpoint(')<main.indexOf('PrepareParentRttiMapGraph('));
  assert.ok(main.indexOf('PrepareParentRttiMapGraph(')<main.indexOf('foreach (MemoryRange range in selected)'));
  assert.ok(main.indexOf('blob.Write(part.data,0,part.data.Length)')<main.indexOf('emit(snapshot)'));
  assert.ok(main.includes('snapshot["parentRttiViewportMapGraph"]=parentRttiGraphProof'));
});

test('retained PUSH mode then name admits actual NAME/MODE ABI and rejects swapped call, return and reader guards', {skip:process.platform!=='win32'},async()=>{
  const evidence=await verifyNativeParentRttiEvidence();assert.equal(evidence.targetSha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  await pure(`${stateHelpers}
function Swapped {$f=Frame;Store $f 44 1;Store $f 48 ($U-60);return ,$f}
$s=Ready;Reject {$s.ValidateEndpoint($true,$B,7,$Q,348,$APP,(Swapped),(Camera),108)}
if($s.callOpen -or $s.captured -ne 0 -or $s.pairs -ne 0){throw 'Swapped caller consumed pair admission'}
$s.ValidateEndpoint($true,$B,7,$Q,348,$APP,(Frame),(Camera),108);$s.CommitEndpoint($true)
Reject {$s.ValidateEndpoint($false,$B,7,$Q,348,$APP,(Swapped),(Camera),109)}
if(!$s.callOpen -or $s.captured -ne 1 -or $s.pairs -ne 0){throw 'Swapped return closed or consumed actual call'}
$s.ValidateEndpoint($false,$B,7,$Q,348,$APP,(Frame),(Camera),109);$s.CommitEndpoint($false);Close $s 110;$s.RequireComplete(15)
$s=Ready;$global:swap=$true
$reader=[Func[uint32,int,byte[]]]{param($a,$n)if($a -eq $Q){if($global:swap){return ,(Swapped)};return ,(Frame)};if($a -eq ($Q+256)){return ,(Camera)};$b=New-Object byte[] 4;Store $b 0 $(if($a -eq 9479496){348}else{$APP});return ,$b}
$bad=[RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,7,$Q,$reader);if($bad.commonCaller -or $s.captured -ne 0 -or $s.callOpen){throw 'Reader admitted swapped NAME/MODE'}
$global:swap=$false;$actual=[RollcageCapture.NativeDebugger]::ReadParentRttiEndpoint($s,$B,7,$Q,$reader);if(!$actual.commonCaller -or [BitConverter]::ToUInt32($actual.context,44) -ne ($U-60) -or [BitConverter]::ToUInt32($actual.context,48) -ne 1){throw 'Reader rejected actual NAME/MODE'}
`);
});

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
