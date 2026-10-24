import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeParentRttiCaptureConfig} from './prepare-native-parent-rtti-capture.mjs';

//A separate fixed final-return purpose; the older RTTI profiles stay unchanged.
export function createNativeParentFinalCaptureConfig(directory,output,options={}){
  const fixed={viewportMapGraph:true,weatherScreenQueries:true,weatherCounterObservation:true,soundBankOwners:true,soundBankChannels:true,tyreSound2:true,surfaceSound7:true,collisionSound19:true,finalTick:true};
  for(const [key,value]of Object.entries(fixed))if(options[key]!==undefined&&options[key]!==value)throw Error(`Final capture requires ${key}.`);
  return createNativeParentRttiCaptureConfig(directory,output,{...options,...fixed});
}
export async function prepareNativeParentFinalCapture(directory,output,filename,options={}){
  const result=await createNativeParentFinalCaptureConfig(directory,output,options);
  for(const target of[result.configuration.outputDirectory,path.resolve(filename)]){
    try{await lstat(target);throw Error(`Refusing existing final-parent output: ${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await writeFile(filename,JSON.stringify(result.configuration,null,2)+'\n',{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,requiredHelperCapability:result.requiredHelperCapability,preparedOnly:true,launchBlockedUntilHelperCapability:true,maxSnapshots:22,sites:18,maxDurationMs:90000};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,output,filename,depth='24576',skip='60',...extra]=process.argv.slice(2);
  if(!directory||!output||!filename||extra.length)throw Error('Usage: node tools/prepare-native-parent-final-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [DEPTH SKIP]');
  console.log(JSON.stringify(await prepareNativeParentFinalCapture(directory,output,filename,{stackBytesBefore:Number(depth),skipFrames:Number(skip)})));
}
