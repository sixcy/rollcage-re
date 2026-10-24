//Dedicated entry: pass the exact local PowerShell source as -Command. No script
//execution-policy switch, security change, game input injection or retry.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const quote=value=>`'${value.replaceAll("'","''")}'`;
export async function runNativePickupEditorCapture(configuration,{validateOnly=false,compileOnly=false}={}) {
  if(process.platform!=='win32')throw Error('Original pickup validation requires Windows.');
  if(compileOnly&&configuration||!compileOnly&&!configuration)throw Error('A configuration or compile-only is required.');
  const script=await readFile(new URL('./native-pickup-editor-capture.ps1',import.meta.url),'utf8'),helper=fileURLToPath(new URL('./lib/pickup-editor-native-debugger.cs',import.meta.url));
  const command=`& {\n${script}\n} -HelperSourcePath ${quote(helper)} ${compileOnly?'-CompileOnly':`-ConfigPath ${quote(path.resolve(configuration))}${validateOnly?' -ValidateOnly':''}`}`;
  const child=spawn('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,stdio:'inherit'});
  return new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [arg,flag]=process.argv.slice(2);if(!arg||process.argv.length>4||flag!==undefined&&flag!=='--validate-only'||arg==='--compile-only'&&flag)throw Error('Usage: node tools/native-pickup-editor-capture.mjs CONFIG [--validate-only] | --compile-only');
  process.exitCode=await runNativePickupEditorCapture(arg==='--compile-only'?undefined:arg,{compileOnly:arg==='--compile-only',validateOnly:flag==='--validate-only'});
}
