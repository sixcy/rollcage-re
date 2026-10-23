import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const actualConfig = 'analysis/native-physics-local/startup-20261022/controlled-recovery-worker-gain-window-config-v17-20261023.json';

test('actual V17 Options defaults, shared snapshot envelope and post-guard activation are pure and null-safe', {skip:process.platform !== 'win32' || !existsSync(actualConfig)}, () => {
  const cs=path.resolve('tools/lib/native-physics-debugger.cs').replaceAll("'","''"), config=path.resolve(actualConfig).replaceAll("'","''");
  const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${cs}'
Add-Type -AssemblyName System.Web.Extensions
$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
function Load {return $reader.Deserialize([IO.File]::ReadAllText('${config}'),[RollcageCapture.Options])}
function Check([bool]$ok){if(!$ok){throw 'Worker envelope assertion failed'}}
function MustReject([scriptblock]$action){$failed=$false;try{&$action}catch{$cause=$_.Exception;while($cause.InnerException){$cause=$cause.InnerException};if($cause -is [NullReferenceException]){throw 'Unexpected null dereference'};$failed=$cause -is [IO.InvalidDataException] -or $cause -is [ArgumentNullException]};Check $failed}
$o=Load
[RollcageCapture.NativeDebugger]::ValidateOwnedWorkerGainWindowPolicy($o)
$fresh=Load;$fresh.outputDirectory=[IO.Path]::Combine([IO.Path]::GetTempPath(),'worker-envelope-unlaunched-'+[Guid]::NewGuid().ToString('N'))
[RollcageCapture.NativeDebugger]::Validate($fresh)
Check ($null -eq $o.ownedWorkerGainPair);Check ($null -eq $o.ownedWorkerObservation);Check ($null -eq $o.heldForceInput)
Check ($null -eq $o.pendingFrameObserver.nestedCaptureScope);Check ($null -ne $o.pendingFrameObserver.nestedBreakpointIds);Check ($o.pendingFrameObserver.nestedBreakpointIds.Length -eq 0)
Check ($o.pendingFrameObserver.maxNestedSnapshots -eq 0);Check ($o.ranges.Length -eq 0)
$entry=$null;$exit=$null;foreach($point in $o.breakpoints){if($point.id -eq 'worker-gain-entry'){$entry=$point};if($point.id -eq 'worker-gain-exit'){$exit=$point}}
$method=[RollcageCapture.NativeDebugger].GetMethod('CreateBufferedSnapshotEnvelope',[Reflection.BindingFlags]'NonPublic,Static')
Check ($null -ne $method)
$reserve=[Action[long]]{param([long]$bytes)throw 'Envelope must not reserve or read memory'}
$envelope=$method.Invoke($null,[object[]]@($o,$null,$entry,'worker-leaf-entry',$reserve))
Check ($envelope.eventIndex -eq 0);Check ($envelope.role -eq 'worker-leaf-entry');Check ([object]::ReferenceEquals($envelope.breakpoint,$entry))
$returned=$method.Invoke($null,[object[]]@($o,$null,$exit,'worker-leaf-exit',$reserve))
Check ($returned.eventIndex -eq 0);Check ($returned.role -eq 'worker-leaf-exit')
$parent=New-Object RollcageCapture.PendingFrameProgress;$parent.qualifyingEventSnapshots=7
$event=$method.Invoke($null,[object[]]@($o,$parent.PSObject.BaseObject,$entry,'event',$null));Check ($event.eventIndex -eq 7)
MustReject {$method.Invoke($null,[object[]]@($o,$null,$entry,'event',$reserve))}
MustReject {$method.Invoke($null,[object[]]@($o,$null,$entry,'worker-leaf-entry',$null))}
MustReject {$method.Invoke($null,[object[]]@($o,$parent.PSObject.BaseObject,$entry,'event',$reserve))}
MustReject {$method.Invoke($null,[object[]]@($null,$null,$entry,'worker-leaf-entry',$reserve))}
MustReject {$method.Invoke($null,[object[]]@($o,$null,$null,'worker-leaf-entry',$reserve))}
$default=New-Object RollcageCapture.Options
MustReject {$method.Invoke($null,[object[]]@($default.PSObject.BaseObject,$null,$entry,'worker-leaf-entry',$reserve))}
[RollcageCapture.NativeDebugger]::ActivateOwnedWorkerGainWindow($default,$null,0,0,0)
$w=New-Object RollcageCapture.OwnedWorkerGainWindowProgress
MustReject {[RollcageCapture.NativeDebugger]::ActivateOwnedWorkerGainWindow($o,$w,2390,23068,42396)}
Check ($w.activationDebugOrdinal -eq 0)
[RollcageCapture.NativeDebugger]::ActivateOwnedWorkerGainWindow($o,$w,2390,42396,42396)
Check ($w.activationDebugOrdinal -eq 2390);Check ($w.ownerTid -eq 42396);Check (!$w.parentComplete);Check (!$w.call.open);Check ($w.call.captured -eq 0)
MustReject {[RollcageCapture.NativeDebugger]::ActivateOwnedWorkerGainWindow($o,$w,2391,42396,42396)}
MustReject {[RollcageCapture.NativeDebugger]::ActivateOwnedWorkerGainWindow($o,$null,2390,42396,42396)}
foreach($change in @({param($v)$v.pendingFrameObserver.nestedBreakpointIds=$null},{param($v)$v.observationActivation.observationBreakpointIds=$null},
 {param($v)$v.breakpoints=$null},{param($v)$v.phaseActions=$null},{param($v)$v.ranges=$null},
 {param($v)$v.ownedWorkerGainWindow.threadIdSource.dereferenceOffsets=$null},{param($v)$v.ownedWorkerGainWindow.managerSource.dereferenceOffsets=$null},
 {param($v)($v.breakpoints|Where-Object id -eq 'worker-gain-entry').ranges=$null})){
 $bad=Load;&$change $bad;MustReject {[RollcageCapture.NativeDebugger]::ValidateOwnedWorkerGainWindowPolicy($bad)}
}
Write-Output 'Actual V17 default/null/envelope/activation contracts PASS; no memory read, process, native fixture or game launched.'`;
  const run=spawnSync('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true,encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/Actual V17 default\/null\/envelope\/activation contracts PASS/);
});

test('runtime uses tested envelope before ranges and tested post-guard activation; null parent is never a fake parent', async () => {
  const cs=await readFile('tools/lib/native-physics-debugger.cs','utf8');
  const start=cs.indexOf('static BufferedSnapshot ReadBufferedSnapshot('), end=cs.indexOf('static void CommitBufferedGroup(',start), body=cs.slice(start,end);
  assert.ok(body.indexOf('CreateBufferedSnapshotEnvelope(')<body.indexOf('ResolveCaptureRange('));
  assert.equal([...body.matchAll(/\bprogress\./g)].length,1);
  assert.match(body,/if\(separateReserve==null\)progress\.Reserve\(options.pendingFrameObserver, bytes\);else separateReserve\(bytes\)/);
  assert.match(cs,/ReadBufferedSnapshot\(options,null,process,thread,mainBase,hit,tid,regs,context,null,role/);
  const activation=cs.indexOf('ActivateOwnedWorkerGainWindow(o,workerGainWindow,events,tid,child.tid)');
  assert.ok(activation>cs.indexOf('observationsActivated = true;',cs.indexOf('ObservationActivation activation = o.observationActivation;',cs.indexOf('public static int Run('))));
});
