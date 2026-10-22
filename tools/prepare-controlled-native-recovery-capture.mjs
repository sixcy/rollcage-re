// Declared state32 input at the actual native parent caller. This is an
// intervention experiment, not a claim that native physics produced rejection.
import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeRecoveryCaptureConfig} from './prepare-native-recovery-capture.mjs';

export const controlledNativeRecoveryInput=Object.freeze({authority:'controlled-native-recovery-input',callerId:'controlled-recovery-caller',callerRva:0x5101c,rawHit:229,clock:228});
export function controlledNativeRecoveryCallerRanges(){return [
  {id:'controlled-recovery-clock',rva:'0x50a548',length:4},
  {id:'controlled-recovery-session-root',rva:'0x1ecb1c',length:4},
  {id:'controlled-recovery-first-body-root',rva:'0x509300',length:4},
];}
export function controlledNativeRecoveryAction(){return {breakpointId:controlledNativeRecoveryInput.callerId,hit:229,writes:[
  {rva:'0x50a548',expectedBytesHex:'e4000000',bytesHex:'e4000000'},
  {rva:'0x1ecb1c',dereferenceOffsets:['0'],offset:'0x57c',expectedBytesHex:'04000000',bytesHex:'04000000'},
  {rva:'0x509300',dereferenceOffsets:['0'],expectedBytesHex:'031c0000',bytesHex:'031c0000'},
  {rva:'0x509300',dereferenceOffsets:['0'],offset:'0x128',expectedBytesHex:'00000000',bytesHex:'20000000'},
]};}
export async function createControlledNativeRecoveryCaptureConfig(directory,output,{stackBytesBefore=4096,maxCandidateFrames=1200,maxApplicationSnapshots=64,maxRegionBytes=64*1024*1024}={}){
  const result=await createNativeRecoveryCaptureConfig(directory,output,{selection:'first-respawn-application',frames:1,skipFrames:0,stackBytesBefore,maxCandidateFrames,maxApplicationSnapshots,maxRegionBytes});
  const config=result.configuration;config.captureThreadEnvironment=true;config.maxSnapshots=350;
  config.breakpoints.push({id:controlledNativeRecoveryInput.callerId,rva:'0x5101c',ranges:controlledNativeRecoveryCallerRanges()});
  config.phaseActions.push(controlledNativeRecoveryAction());
  return {...result,authority:controlledNativeRecoveryInput.authority,input:controlledNativeRecoveryInput,limitations:[
    'Declared input: firstbody state128 is changed0→32 at caller45101c rawhit229 after exact clock228/phase4/flags1c03 guards.',
    'Clock, phase and flags writes are guarded no-ops, not missing evidence: each actual write record must show identical original/replacement bytes.',
    'A failed guard aborts capture; prior guard writes are no-ops. No pose, route, query result or application answer is injected.',
    'This demonstrates native handling of supplied rejected state, not a naturally produced recovery trigger.',
    'Six native participants are preserved; the sole gameplay input write is the explicitly declared firstbody state32 intervention.',
    ...result.limitations.filter(row=>!row.includes('no physics/AI/input writes')),
  ]};
}
async function requireNew(filename){try{await lstat(filename);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error(`Refusing existing controlled recovery output: ${filename}`);}
export async function prepareControlledNativeRecoveryCapture(directory,output,filename,options={}){
  const result=await createControlledNativeRecoveryCaptureConfig(directory,output,options);await requireNew(result.configuration.outputDirectory);await requireNew(filename);
  await writeFile(filename,`${JSON.stringify(result.configuration,null,2)}\n`,{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,authority:result.authority,input:result.input,evidence:result.evidenceIds,method:'Prepared only: controlled native recovery input at45101c, firstbody state0→32 with exact229/228/phase4/flags guards. No process launched.',limits:result.limitations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[directory,output,filename]=process.argv.slice(2);if(!directory||!output||!filename||process.argv.length!==5)throw Error('Usage: node tools/prepare-controlled-native-recovery-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE');
  console.log(JSON.stringify(await prepareControlledNativeRecoveryCapture(directory,output,filename)));
}
