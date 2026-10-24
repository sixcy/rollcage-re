import fs from 'node:fs';
import {spawn} from 'node:child_process';

const capture='analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev1-v3-20261023';
const configuration='analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev1-config-v3-20261023.json';
const helper='analysis/native-physics-local/startup-20261022/bounded-controlled-race-settings-runner-v3-20261023/native-physics-debugger.cs';
const nativeLog='analysis/native-physics-local/startup-20261022/held-chassis-border-console-high-lev1-v3-20261023.log';
const plannerLog='analysis/native-physics-local/startup-20261022/held-chassis-border-planner-console-high-lev1-v3-20261023.log';
if(fs.existsSync(capture))throw Error('Refusing existing held capture.');
const nativeFd=fs.openSync(nativeLog,'wx'),plannerFd=fs.openSync(plannerLog,'wx');
const script=`$ErrorActionPreference='Stop'
Add-Type -Path '${helper}'
Add-Type -AssemblyName System.Web.Extensions
$heldCaptureBytes=[IO.File]::ReadAllBytes('${configuration}')
$heldCaptureReader=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$heldCaptureOptions=$heldCaptureReader.Deserialize([Text.Encoding]::UTF8.GetString($heldCaptureBytes),[RollcageCapture.Options])
[RollcageCapture.NativeDebugger]::Validate($heldCaptureOptions)
$heldCaptureResult=[RollcageCapture.NativeDebugger]::Run($heldCaptureOptions,$heldCaptureBytes,$true)
if($heldCaptureResult -ne 0){throw "Held capture failed with code $heldCaptureResult; preserve raw evidence."}
`;
const started=Date.now(),planner=spawn(process.execPath,['tools/plan-native-held-chassis-force.mjs',capture,'--wait'],{windowsHide:true,stdio:['ignore',plannerFd,plannerFd]});
const native=spawn('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true,stdio:['ignore',nativeFd,nativeFd]});
const result={configuration,helper,capture,nativeLog,plannerLog,plannerPid:planner.pid,nativeHelperPid:native.pid};
const wait=(child,name)=>new Promise(resolve=>{
  child.once('error',error=>{result[`${name}Error`]=error.message;});
  child.once('close',(code,signal)=>{
    result[`${name}ExitCode`]=code;result[`${name}Signal`]=signal;result[`${name}ElapsedMs`]=Date.now()-started;
    console.log(JSON.stringify({process:name,exitCode:code,signal,elapsedMs:Date.now()-started}));
    if(name==='native'&&planner.exitCode===null&&planner.signalCode===null)planner.kill();
    resolve();
  });
});
await Promise.all([wait(native,'native'),wait(planner,'planner')]);
fs.closeSync(nativeFd);fs.closeSync(plannerFd);
fs.writeFileSync('analysis/native-held-chassis-force-launch-status-high-lev1-v3-20261023.json',JSON.stringify(result,null,2),{flag:'wx'});
process.exitCode=result.nativeExitCode===0&&result.plannerExitCode===0?0:1;
