import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeRaceClockCaptureConfiguration,verifyNativeRaceClockCaptureConfiguration} from './lib/native-race-clock-capture.mjs';
import {verifyNativeRaceClockEvidence} from './lib/native-race-clock-inputs.mjs';

//Separate prepared-only purpose. This tool neither copies nor launches a game.
export async function createNativeRaceClockCaptureConfig(directory,output){
  return {...createNativeRaceClockCaptureConfiguration(directory,output),preparedOnly:true,launchBlockedUntilHelperCapability:true,
    limits:['One selected warm441c70 call only; no outer cadence, next tick or cold QPF branch.',
      'Only entry is initially armed. Three cold endpoints activate after full entry publication in the same stopped event.',
      'Source inputs are the original entry15rows only. Counter/final rows remain comparisons and one typed8B QPC/BOOL outcome.',
      'No new game-memory writes, forced clock/phase/result or conversion-answer services are permitted.']};
}
export async function prepareNativeRaceClockCapture(directory,output,filename){
  const prepared=await createNativeRaceClockCaptureConfig(directory,output);await verifyNativeRaceClockEvidence();
  for(const target of[prepared.configuration.outputDirectory,path.resolve(filename)]){
    try{await lstat(target);throw Error(`Refusing existing race-clock output: ${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  verifyNativeRaceClockCaptureConfiguration(prepared.configuration);
  await writeFile(filename,JSON.stringify(prepared.configuration,null,2)+'\n',{flag:'wx'});
  return {configuration:path.resolve(filename),output:prepared.configuration.outputDirectory,requiredHelperCapability:prepared.requiredHelperCapability,
    preparedOnly:true,launchBlockedUntilHelperCapability:true,maxSnapshots:7,sites:7,maxDurationMs:90000};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,output,filename,...extra]=process.argv.slice(2);
  if(!directory||!output||!filename||extra.length)throw Error('Usage: node tools/prepare-native-race-clock-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG');
  console.log(JSON.stringify(await prepareNativeRaceClockCapture(directory,output,filename)));
}
