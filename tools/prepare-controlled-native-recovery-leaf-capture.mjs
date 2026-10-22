//Controlled input experiment, separate from the unchanged observer-only leaf
//preparer. The actual native leaf supplies every placement/application result.
import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeRecoveryLeafCaptureConfig} from './prepare-native-recovery-leaf-capture.mjs';
import {controlledNativeRecoveryInput,controlledNativeRecoveryCallerRanges,controlledNativeRecoveryAction} from './prepare-controlled-native-recovery-capture.mjs';

export async function createControlledNativeRecoveryLeafCaptureConfig(directory,output,{stage='query',stackBytesBefore=4096,maxRegionBytes=64*1024*1024,attachmentWindowBytes=1024}={}){
  const result=await createNativeRecoveryLeafCaptureConfig(directory,output,{stage,frames:1,skipFrames:0,stackBytesBefore,maxRegionBytes,attachmentWindowBytes}),config=result.configuration;
  config.captureThreadEnvironment=true;config.maxSnapshots=350;
  config.breakpoints.push({id:controlledNativeRecoveryInput.callerId,rva:'0x5101c',ranges:controlledNativeRecoveryCallerRanges()});config.phaseActions.push(controlledNativeRecoveryAction());
  return {...result,authority:controlledNativeRecoveryInput.authority,input:controlledNativeRecoveryInput,limitations:[
    'Controlled input: at actual45101c rawhit229, guarded clock228/phase4/flags1c03 no-op assertions precede firstbody state1280→32.',
    'The native query/apply entry is captured after this declared input. No pose, route, quaternion, query result or application answer is supplied.',
    'This experiment isolates native handling of supplied state32; it does not prove a natural rejection trigger or complete recovery parent/audio execution.',
    ...result.limitations.filter(row=>!row.includes('no rejected-body state')&&!row.includes('no physics/AI/input writes')),
  ]};
}
async function requireNew(filename){try{await lstat(filename);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error(`Refusing existing controlled recovery leaf output: ${filename}`);}
export async function prepareControlledNativeRecoveryLeafCapture(directory,output,filename,options={}){
  const result=await createControlledNativeRecoveryLeafCaptureConfig(directory,output,options);await requireNew(result.configuration.outputDirectory);await requireNew(filename);await writeFile(filename,`${JSON.stringify(result.configuration,null,2)}\n`,{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,stage:result.stage,authority:result.authority,input:result.input,evidence:result.evidenceIds,method:'Prepared only: controlled state32 input at exact229/228/phase4/flags guards, then independent native recovery leaf entry and both possible preRETs. No process launched.',limits:result.limitations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[directory,output,filename,stage='query']=process.argv.slice(2);if(!directory||!output||!filename||process.argv.length>6)throw Error('Usage: node tools/prepare-controlled-native-recovery-leaf-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE query|apply');
  console.log(JSON.stringify(await prepareControlledNativeRecoveryLeafCapture(directory,output,filename,{stage})));
}
