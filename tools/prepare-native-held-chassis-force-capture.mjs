import {writeFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeEventFrameCaptureConfig} from './prepare-native-event-frame-capture.mjs';
import {nativeFrameActiveSoundCaptureRanges} from './lib/native-frame-sound.mjs';
import {validateHeldForceConfiguration} from './lib/native-held-force.mjs';

export async function createNativeHeldChassisForceCaptureConfig(directory, output, {skipFrames = 120} = {}) {
  const result = await createNativeEventFrameCaptureConfig(directory, output, {skipFrames, selection:'first-collision', maxDispatchSnapshots:64, stackBytesBefore:4096});
  const o = result.configuration;
  o.captureThreadEnvironment = true; o.maxSnapshots = 70;
  o.pendingFrameObserver.maxCandidateFrames = 1;
  o.heldForceInput = {breakpointId:'native-frame-before', maxHoldMs:20000};
  for (const b of o.breakpoints.filter(b => ['native-frame-before','native-frame-after'].includes(b.id))) b.ranges.push(
    ...nativeFrameActiveSoundCaptureRanges().map(r=>r.id==='active-sound-bank-region'
      ? {id:'active-sound-bank-storage',rva:'0x2f2414',vectorStorage:true,maxVectorBytes:65536} : r),
    {id:'active-effect-lookup-bytes',rva:'0x313180',dereferenceOffsets:['0'],length:64});
  o.breakpoints.find(b => b.id === 'native-dispatch-entry').ranges.push(
    {id:'dispatch-candidate-arena',rva:'0x51e788',dereferenceOffsets:['0'],length:0x8000},
    {id:'dispatch-body-header',baseRegister:'ecx',dereferenceOffsets:['4'],length:0x180});
  validateHeldForceConfiguration(o);
  return {...result,method:'One held actual4749e0 entry; source-only bounded preflight; guarded force+74 input; actual dispatcher/candidate and complete native frame observations. Prepared only.'};
}
export async function prepareNativeHeldChassisForceCapture(directory, output, filename, options) {
  const result = await createNativeHeldChassisForceCaptureConfig(directory, output, options);
  for (const name of [result.configuration.outputDirectory, filename]) {try {await lstat(name);} catch(e) {if(e.code==='ENOENT')continue;throw e;} throw Error('Refusing existing held-force output.');}
  await writeFile(filename,`${JSON.stringify(result.configuration,null,2)}\n`,{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,method:result.method};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [directory,output,file,skip='120']=process.argv.slice(2);
  if(!directory||!output||!file||process.argv.length>6)throw Error('Usage: node tools/prepare-native-held-chassis-force-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG [SKIP_FRAMES]');
  console.log(JSON.stringify(await prepareNativeHeldChassisForceCapture(directory,output,file,{skipFrames:Number(skip)})));
}
