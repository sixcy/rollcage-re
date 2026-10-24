import {writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeHeldChassisForceCaptureConfig} from './prepare-native-held-chassis-force-capture.mjs';
import {controlledRaceSettingsBreakpoint,controlledRaceSettingsOutputRanges} from './lib/native-controlled-race-settings.mjs';
import {validateHeldForceConfiguration} from './lib/native-held-force.mjs';

export async function createNativeControlledRaceHeldCaptureConfig(directory,output,{level=1,quality=1,skipFrames=120,shareContainedRanges=false}={}) {
  if(typeof shareContainedRanges!=='boolean')throw Error('Contained sharing option must be explicit boolean.');
  const result=await createNativeHeldChassisForceCaptureConfig(directory,output,{skipFrames}),o=result.configuration;
  o.controlledRaceSettings={breakpointId:'controlled-race-settings',level,quality,expectedTrackByte:0,expectedQualityByte:1};
  o.maxSnapshots=71;o.breakpoints.push(controlledRaceSettingsBreakpoint());
  if(shareContainedRanges)o.heldForceInput.shareContainedRanges=true;
  for(const b of o.breakpoints.filter(b=>['native-frame-before','native-frame-after'].includes(b.id)))b.ranges.push(...controlledRaceSettingsOutputRanges());
  validateHeldForceConfiguration(o);
  return {...result,method:'Prepared only: guarded43e0c5 config track/quality inputs; original frontend/session/filename/load/roster; one bounded held force experiment with64 complete dispatcher observations. No deterministic roster/RNG or collision result claimed.'};
}
export async function prepareNativeControlledRaceHeldCapture(directory,output,filename,options) {
  const result=await createNativeControlledRaceHeldCaptureConfig(directory,output,options);
  for(const file of [result.configuration.outputDirectory,filename]){try{await lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}throw Error('Refusing existing controlled-race held output.');}
  await writeFile(filename,JSON.stringify(result.configuration,null,2)+'\n',{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,method:result.method};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [dir,output,file,level='1',quality='1',skipFrames='120',sharing]=process.argv.slice(2);
  if(!dir||!output||!file||process.argv.length>9||sharing!==undefined&&sharing!=='--share-contained-ranges')throw Error('Usage: node tools/prepare-native-controlled-race-held-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [LEVEL1..20] [QUALITY0|1] [SKIP_FRAMES] [--share-contained-ranges]');
  console.log(JSON.stringify(await prepareNativeControlledRaceHeldCapture(dir,output,file,{level:Number(level),quality:Number(quality),skipFrames:Number(skipFrames),shareContainedRanges:sharing!==undefined})));
}
