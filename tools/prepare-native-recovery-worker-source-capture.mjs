import {lstat, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeRecoveryWorkerCaptureConfig} from './prepare-native-recovery-worker-capture.mjs';
import {nativeOwnedWorkerObservationPolicy, nativeWorkerLookupRanges, nativeWorkerLookupSite, workerSourceVtableWords} from './lib/native-recovery-worker-observation.mjs';
import {verifyNativeRecoverySoundCaptureConfiguration} from './lib/native-recovery-sound-selection.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function verifyNativeRecoveryWorkerSourceEvidence() {
  const {evidence,instructions}=await readInstructionEvidence(['12339-audio-selection-4b12d0-assembly.json','12361-audio-spatial-4a7c10-assembly.json',
    '11601-audio-sample-factory-4a7460.json','11619-audio-sample-graph-4ad7e0.json','15015-audio-source-parameters-audio-0x4ae4a0-assembly.json'],{directory:'analysis/native-simulation/results'});
  const raw=JSON.parse(await readFile('analysis/native-simulation/results/11714-audio-factory-constants.json','utf8'));
  const table=raw.structuredContent??JSON.parse(raw.content.find(row=>row.type==='text').text),n=table.normalized_result;
  if([...evidence,table].some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Worker source evidence target SHA differs.');
  const listing=new Map(instructions.map(row=>[row.address,row]));
  for(const [address,op,args] of [[0x4b12f2,'MOV',['ESI','dword ptr [EBP + 0x78]']], [0x4b12fb,'PUSH',['dword ptr [ESI + 0x438]']],
    [0x4a7c14,'MOV',['ESI','dword ptr [ESP + 0x10]']], [0x4a7483,'PUSH',['0x9a8']], [0x4ad84a,'MOV',['dword ptr [ESI]','0x5d3f60']],
    [0x4ae4a2,'CMP',['dword ptr [ECX + 0x9a0]','EAX']]]){
    const row=listing.get(address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Worker source boundary differs at0x${address.toString(16)}.`);
  }
  const bytes=Buffer.from(n?.bytes_hex??'','hex');
  if(table.operation!=='read_bytes'||n?.complete!==true||Number(n.address)!==0x5d3f60||n.returned_bytes!==0x88||bytes.length!==0x88||workerSourceVtableWords.some((word,i)=>bytes.readUInt32LE(i*4)!==word))throw Error('Worker source shipped vtable evidence differs.');
  return {evidenceIds:[...evidence,table].map(row=>row.evidence_id)};
}
export async function createNativeRecoveryWorkerSourceCaptureConfig(directory,output) {
  const result=await createNativeRecoveryWorkerCaptureConfig(directory,output),configuration=result.configuration;
  const point=configuration.breakpoints.find(row=>row.id===nativeWorkerLookupSite[0]);
  point.ranges.push(...nativeWorkerLookupRanges(point.id,{includeWorkerSourceEvidence:true}).slice(-2));
  configuration.ownedWorkerObservation=nativeOwnedWorkerObservationPolicy({entryReturnRva:'0xb1304'});
  const soundSelection=verifyNativeRecoverySoundCaptureConfiguration(configuration),evidence=await verifyNativeRecoveryWorkerSourceEvidence();
  return {...result,configuration,soundSelection,evidenceIds:[...new Set([...result.evidenceIds,...evidence.evidenceIds])],limitations:[...result.limitations.filter(text=>!text.includes('ESI is never chased')),
    'One manager-gain return-gated lookup observes the original ESI source9a8 and its source-vtable88 before use. Other callers never resolve ESI ranges. No nullable waveform/decoder pointee is chased.',
    'Raw spatial/effect fields are preserved to identify reached branches; no flag is cleared and no whole-function output or complete interleaving is claimed.']};
}
async function requireNew(filename){try{await lstat(filename);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error(`Refusing existing worker source capture output: ${filename}`);}
export async function prepareNativeRecoveryWorkerSourceCapture(directory,output,filename){
  const result=await createNativeRecoveryWorkerSourceCaptureConfig(directory,output);
  await requireNew(result.configuration.outputDirectory);await requireNew(filename);await writeFile(filename,`${JSON.stringify(result.configuration,null,2)}\n`,{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,profile:'services-worker-source-gain',soundSelection:result.soundSelection,evidence:result.evidenceIds,method:'Prepared only; no process launched.',limits:result.limitations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,output,filename]=process.argv.slice(2);if(!directory||!output||!filename||process.argv.length!==5)throw Error('Usage: node tools/prepare-native-recovery-worker-source-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE');
  console.log(JSON.stringify(await prepareNativeRecoveryWorkerSourceCapture(directory,output,filename)));
}
